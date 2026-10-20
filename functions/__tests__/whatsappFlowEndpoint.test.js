"use strict";
// Mission 16: tests for the REAL HTTP endpoint (controllers/whatsappFlow.controller.js) that wires Meta's
// Flow protocol (src/whatsapp-flow/metaFlowAdapter.js — moved inside the deployed package in Mission 23) to
// the existing Firebase Admin singleton. No real Firebase, no real Meta traffic, no real network — a fake
// Firestore + fake Storage bucket stand in for `functions/src/config/firebase`, and a real RSA keypair + real
// HMAC signing exercise the actual crypto code path end to end.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const path = require("path");

const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { createFakeBucket } = require(
  path.join(__dirname, "..", "..", "prototypes", "whatsapp-flow-endpoint", "test", "fakeBucket.js")
);
const fixtures = require(
  path.join(__dirname, "..", "..", "prototypes", "whatsapp-flow-endpoint", "test", "fixtures.js")
);
const { generateFlowToken, prepareFlowTokenBinding, markBindingSent } = require("../src/whatsapp-flow/flowTokenBinding.js");

const ENV_PATH = require.resolve("../src/config/env");
const FIREBASE_PATH = require.resolve("../src/config/firebase");
const keys = fixtures.generateKeys();

function installFakes({ configured = true } = {}) {
  const fake = createFakeFirestore();
  const fakeBucket = createFakeBucket();
  fake.admin.storage = () => ({ bucket: () => fakeBucket.bucket });
  require.cache[FIREBASE_PATH] = { id: FIREBASE_PATH, filename: FIREBASE_PATH, loaded: true, exports: { admin: fake.admin, db: fake.db } };
  require.cache[ENV_PATH] = {
    id: ENV_PATH, filename: ENV_PATH, loaded: true,
    exports: {
      FLOW_PRIVATE_KEY_PEM: configured ? keys.privateKey : "",
      FLOW_APP_SECRET: configured ? fixtures.TEST_APP_SECRET : "",
      FLOW_APP_SECRET_PREVIOUS: "",
    },
  };
  return { db: fake.db, bucket: fakeBucket.bucket };
}

function freshController() {
  delete require.cache[require.resolve("../src/controllers/whatsappFlow.controller")];
  return require("../src/controllers/whatsappFlow.controller");
}

function mockRes() {
  const res = { statusCode: null, headers: {}, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.set = (h) => { Object.assign(res.headers, h || {}); return res; };
  res.send = (b) => { res.body = b; return res; };
  return res;
}

async function callEndpoint(postFlowDataExchange, payload, { signed = true, rawBodyOverride } = {}) {
  const req0 = fixtures.buildEncryptedRequest(payload, keys.publicKey);
  const raw = rawBodyOverride || Buffer.from(JSON.stringify(req0.body));
  const headers = signed ? { "x-hub-signature-256": fixtures.sign(raw) } : {};
  const req = { rawBody: raw, headers };
  const res = mockRes();
  await postFlowDataExchange(req, res);
  const plain = res.statusCode === 200 ? fixtures.decryptResponse(res.body, req0.aesKey, req0.iv) : null;
  return { res, plain };
}

test.describe("whatsappFlow.controller — media CDN allow-list", () => {
  test("targets the documented mmg.whatsapp.net example, not the previously-guessed fbsbx.com (Mission 17 fix)", () => {
    installFakes({ configured: true });
    const { FLOW_MEDIA_CDN_HOST_SUFFIXES } = freshController();
    assert.deepStrictEqual(FLOW_MEDIA_CDN_HOST_SUFFIXES, ["whatsapp.net"]);
    assert.ok(!FLOW_MEDIA_CDN_HOST_SUFFIXES.includes("fbsbx.com"));
  });
});

test.describe("whatsappFlow.controller — fails closed when not configured", () => {
  test("missing FLOW_PRIVATE_KEY_PEM/FLOW_APP_SECRET -> 500, no crash, no secret leaked", async () => {
    installFakes({ configured: false });
    const { postFlowDataExchange } = freshController();
    const req = { rawBody: Buffer.from("{}"), headers: {} };
    const res = mockRes();
    await postFlowDataExchange(req, res);
    assert.strictEqual(res.statusCode, 500);
    assert.doesNotMatch(String(res.body), /BEGIN (RSA )?PRIVATE KEY|test-app-secret/);
  });
});

test.describe("whatsappFlow.controller — real crypto path, fake Firebase", () => {
  test("valid encrypted ping -> 200, decrypts to {status:active}", async () => {
    installFakes({ configured: true });
    const { postFlowDataExchange } = freshController();
    const { res, plain } = await callEndpoint(postFlowDataExchange, { action: "ping" });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(plain, { data: { status: "active" } });
  });

  test("invalid signature -> 432, body never reveals why", async () => {
    installFakes({ configured: true });
    const { postFlowDataExchange } = freshController();
    const { res } = await callEndpoint(postFlowDataExchange, { action: "ping" }, { signed: false });
    assert.strictEqual(res.statusCode, 432);
    assert.doesNotMatch(String(res.body), /secret|key|private/i);
  });

  test("malformed encrypted body -> 421, not a 500", async () => {
    installFakes({ configured: true });
    const { postFlowDataExchange } = freshController();
    const raw = Buffer.from(JSON.stringify({ encrypted_aes_key: "not-base64-rsa", encrypted_flow_data: "x", initial_vector: "eA==" }));
    const req = { rawBody: raw, headers: { "x-hub-signature-256": fixtures.sign(raw) } };
    const res = mockRes();
    await postFlowDataExchange(req, res);
    assert.strictEqual(res.statusCode, 421);
  });

  test("data_exchange with an unknown flow_token -> 200, UPLOAD screen with a session-expired message (never a crash, never a guess)", async () => {
    installFakes({ configured: true });
    const { postFlowDataExchange } = freshController();
    const { plain } = await callEndpoint(postFlowDataExchange, {
      action: "data_exchange", screen: "CONFIGURE", flow_token: "no-such-token", data: {},
    });
    // Mission 27: self-refreshes the screen the request came from (CONFIGURE here) instead of jumping back
    // to UPLOAD — routing_model no longer permits declaring that backward edge.
    assert.strictEqual(plain.screen, "CONFIGURE");
    assert.match(plain.data.error_message, /expired|try again/i);
  });

  test("data_exchange on CONFIGURE with a real SENT binding -> dispatches into the real orchestrator (PROCESSING screen), proving the identity-binding wiring is live end to end", async () => {
    const { db } = installFakes({ configured: true });
    const { postFlowDataExchange } = freshController();

    // Set up the SAME durable binding sendFlowMessage() would create before a real outbound send —
    // this is the actual flowTokenBinding.js, not a stand-in, writing to the SAME fake db the endpoint reads.
    const flowToken = generateFlowToken();
    await prepareFlowTokenBinding({ db, flowToken, waId: "919876543210" });
    await markBindingSent({ db, flowToken });

    const { plain } = await callEndpoint(postFlowDataExchange, {
      action: "data_exchange",
      screen: "CONFIGURE",
      flow_token: flowToken,
      data: { documents: [{ media_id: "m1", cdn_url: "http://127.0.0.1:1/x", file_name: "a.pdf" }], color: "bw", copies: 1 },
    });
    // A forged data.waId must have zero effect — not even present in this request, and never consulted.
    assert.strictEqual(plain.screen, "PROCESSING");
    assert.ok(typeof plain.data.status_text === "string" && plain.data.status_text.length > 0);
  });
});
