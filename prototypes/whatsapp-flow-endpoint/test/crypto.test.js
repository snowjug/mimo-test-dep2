"use strict";
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const { verifySignature, decryptRequest, encryptResponse, FlowDecryptionError } = require("../src/flowCrypto");
const f = require("./fixtures");

const keys = f.generateKeys();

test("request decrypts (RSA-OAEP sha256 + AES-128-GCM) and response round-trips with the flipped IV", () => {
  const payload = { action: "ping", version: "3.0" };
  const req = f.buildEncryptedRequest(payload, keys.publicKey);
  const dec = decryptRequest(req.body, keys.privateKey);
  assert.deepStrictEqual(dec.decryptedBody, payload);
  const out = encryptResponse({ data: { status: "active" } }, dec.aesKey, dec.iv);
  assert.deepStrictEqual(f.decryptResponse(out, req.aesKey, req.iv), { data: { status: "active" } });
});

test("deterministic vector: fixed key+IV give a stable, flipped-IV ciphertext", () => {
  const aesKey = Buffer.alloc(16, 0x11), iv = Buffer.alloc(16, 0x22);
  const b64 = encryptResponse({ a: 1 }, aesKey, iv);
  const expected = (() => {
    const c = crypto.createCipheriv("aes-128-gcm", aesKey, Buffer.alloc(16, 0x22 ^ 0xff));
    return Buffer.concat([c.update('{"a":1}'), c.final(), c.getAuthTag()]).toString("base64");
  })();
  assert.strictEqual(b64, expected);
  // decrypting with the UN-flipped IV must fail: proves the flip is really applied
  const raw = Buffer.from(b64, "base64");
  const d = crypto.createDecipheriv("aes-128-gcm", aesKey, iv);
  d.setAuthTag(raw.subarray(raw.length - 16));
  assert.throws(() => Buffer.concat([d.update(raw.subarray(0, raw.length - 16)), d.final()]));
});

test("a 12-byte IV also works (IV length is an assumption, not a Meta statement)", () => {
  const req = f.buildEncryptedRequest({ action: "ping" }, keys.publicKey, { iv: crypto.randomBytes(12) });
  assert.strictEqual(decryptRequest(req.body, keys.privateKey).decryptedBody.action, "ping");
});

test("decryption failures raise FlowDecryptionError (-> HTTP 421)", () => {
  const good = f.buildEncryptedRequest({ action: "ping" }, keys.publicKey).body;
  const other = f.generateKeys();
  const cases = {
    "wrong private key": () => decryptRequest(good, other.privateKey),
    "tampered ciphertext": () => { const b = Buffer.from(good.encrypted_flow_data, "base64"); b[0] ^= 1; return decryptRequest({ ...good, encrypted_flow_data: b.toString("base64") }, keys.privateKey); },
    "tampered tag": () => { const b = Buffer.from(good.encrypted_flow_data, "base64"); b[b.length - 1] ^= 1; return decryptRequest({ ...good, encrypted_flow_data: b.toString("base64") }, keys.privateKey); },
    "wrong iv": () => decryptRequest({ ...good, initial_vector: crypto.randomBytes(16).toString("base64") }, keys.privateKey),
    "missing field": () => decryptRequest({ ...good, encrypted_aes_key: undefined }, keys.privateKey),
    "short ciphertext": () => decryptRequest({ ...good, encrypted_flow_data: Buffer.alloc(10).toString("base64") }, keys.privateKey),
    "bad iv length": () => decryptRequest({ ...good, initial_vector: Buffer.alloc(5).toString("base64") }, keys.privateKey),
    "non-object": () => decryptRequest("x", keys.privateKey),
    "wrong OAEP digest (sha1)": () => {
      const k = crypto.publicEncrypt({ key: keys.publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha1" }, Buffer.alloc(16, 1)).toString("base64");
      return decryptRequest({ ...good, encrypted_aes_key: k }, keys.privateKey);
    },
    "256-bit aes key": () => {
      const k = crypto.publicEncrypt({ key: keys.publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.alloc(32, 1)).toString("base64");
      return decryptRequest({ ...good, encrypted_aes_key: k }, keys.privateKey);
    },
  };
  for (const [name, fn] of Object.entries(cases)) assert.throws(fn, FlowDecryptionError, name);
});

test("signature: valid, wrong secret, tampered body, malformed header, secret rotation", () => {
  const raw = Buffer.from('{"a":1}');
  const h = f.sign(raw);
  assert.ok(verifySignature(raw, h, f.TEST_APP_SECRET));
  assert.ok(!verifySignature(raw, h, "other"));
  assert.ok(!verifySignature(Buffer.from('{"a":2}'), h, f.TEST_APP_SECRET));
  assert.ok(!verifySignature(raw, "sha256=zz", f.TEST_APP_SECRET));
  assert.ok(!verifySignature(raw, undefined, f.TEST_APP_SECRET));
  assert.ok(!verifySignature(raw, h, []));
  assert.ok(verifySignature(raw, h, ["new-secret", f.TEST_APP_SECRET])); // [DOC] old+new accepted during rotation
});
