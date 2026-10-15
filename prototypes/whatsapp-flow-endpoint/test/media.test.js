"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { decryptMedia, sniffKind, MediaError } = require("../src/flowMedia");
const { createCdnFetcher } = require("../src/cdn");
const { processDocuments } = require("../src/pipeline");
const f = require("./fixtures");

const limits = { maxPlainBytes: 1024 * 1024 };
const code = (fn) => { try { fn(); } catch (e) { return e.code; } return "NO_ERROR"; };

test("valid media decrypts to the exact plaintext", () => {
  const plain = crypto.randomBytes(5000);
  const m = f.encryptMedia(plain);
  assert.ok(decryptMedia(m.encrypted, m.encryption_metadata, limits).equals(plain));
});

test("integrity failures are each rejected with a specific code", () => {
  const plain = crypto.randomBytes(2000);
  const m = f.encryptMedia(plain);
  const meta = m.encryption_metadata;
  const flip = (buf, i) => { const b = Buffer.from(buf); b[i] ^= 1; return b; };
  const rehash = (buf) => ({ ...meta, encrypted_hash: crypto.createHash("sha256").update(buf).digest("base64") });
  assert.strictEqual(code(() => decryptMedia(flip(m.encrypted, 3), meta, limits)), "ENCRYPTED_HASH_MISMATCH");
  // hash is made to match so the HMAC layer is actually reached:
  const body = flip(m.encrypted, 3);
  assert.strictEqual(code(() => decryptMedia(body, rehash(body), limits)), "HMAC_MISMATCH");
  const macTampered = flip(m.encrypted, m.encrypted.length - 1);
  assert.strictEqual(code(() => decryptMedia(macTampered, rehash(macTampered), limits)), "HMAC_MISMATCH");
  const trunc = m.encrypted.subarray(0, m.encrypted.length - 5);
  // truncated by 5 bytes with a matching hash: ciphertext is no longer a 16-byte multiple
  assert.strictEqual(code(() => decryptMedia(trunc, rehash(trunc), limits)), "BAD_CIPHERTEXT_LENGTH");
  assert.strictEqual(code(() => decryptMedia(m.encrypted, { ...meta, plaintext_hash: crypto.randomBytes(32).toString("base64") }, limits)), "PLAINTEXT_HASH_MISMATCH");
  assert.strictEqual(code(() => decryptMedia(m.encrypted, { ...meta, hmac_key: crypto.randomBytes(32).toString("base64") }, limits)), "HMAC_MISMATCH");
  assert.strictEqual(code(() => decryptMedia(Buffer.alloc(4), meta, limits)), "TRUNCATED");
});

test("malformed or missing metadata is rejected", () => {
  const m = f.encryptMedia(Buffer.alloc(100, 1));
  assert.strictEqual(code(() => decryptMedia(m.encrypted, undefined, limits)), "BAD_METADATA");
  assert.strictEqual(code(() => decryptMedia(m.encrypted, { ...m.encryption_metadata, iv: undefined }, limits)), "BAD_METADATA");
  assert.strictEqual(code(() => decryptMedia(m.encrypted, { ...m.encryption_metadata, encryption_key: Buffer.alloc(16).toString("base64") }, limits)), "BAD_METADATA");
});

test("oversized input is rejected before expensive work", () => {
  const m = f.encryptMedia(crypto.randomBytes(3 * 1024 * 1024));
  assert.strictEqual(code(() => decryptMedia(m.encrypted, m.encryption_metadata, limits)), "TOO_LARGE");
});

test("type sniffing", async () => {
  assert.strictEqual(sniffKind(await f.makePdf(1)), "pdf");
  assert.strictEqual(sniffKind(f.makePng(8, 8)), "png");
  assert.strictEqual(sniffKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0])), "jpeg");
  assert.strictEqual(sniffKind(Buffer.from([0x50, 0x4b, 3, 4, 0])), "zip-office-needs-conversion");
  assert.strictEqual(sniffKind(Buffer.from("MZ not a document")), "unknown");
});

async function withCdn(fn) {
  const cdn = await f.startFixtureCdn();
  const fetchCdn = createCdnFetcher({ allowLoopbackHttp: true, maxBytes: 30 * 1024 * 1024 });
  try { return await fn(cdn, { fetchCdn }); } finally { await cdn.close(); }
}
// Each leak check gets a private tmp root. Scanning the shared os.tmpdir() raced with handler.test.js
// (a different test file, run in parallel), which creates "flowproto-*" dirs there via the handler.
const withTmpRoot = async (fn) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "flowtest-root-"));
  try { return await fn(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
};
const leftover = (root) => fs.readdirSync(root).filter((n) => n.startsWith("flowproto-"));

test("pipeline: happy path returns page counts and cleans up its temp dir", () => withTmpRoot((root) => withCdn(async (cdn, deps) => {
  const before = leftover(root).length;
  const docs = [f.addDocument(cdn, "a.pdf", await f.makePdf(3)), f.addDocument(cdn, "b.pdf", await f.makePdf(7)), f.addDocument(cdn, "c.png", f.makePng(32, 32))];
  const r = await processDocuments(docs, deps, { concurrency: 2, tmpRoot: root });
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.files.map((x) => x.pages), [3, 7, 1]);
  assert.strictEqual(r.totalPages, 11);
  assert.strictEqual(path.dirname(r.workDir), root, "work dir must be created under the injected tmpRoot");
  assert.strictEqual(leftover(root).length, before);
  assert.ok(!fs.existsSync(r.workDir));
})));

test("pipeline: any bad file is reported, never silently dropped, and temp is cleaned", () => withTmpRoot((root) => withCdn(async (cdn, deps) => {
  const before = leftover(root).length;
  const good = await f.makePdf(2);
  const docs = [
    f.addDocument(cdn, "ok.pdf", good),
    f.addDocument(cdn, "corrupt.pdf", good, (e) => { const b = Buffer.from(e); b[5] ^= 1; return b; }),
    f.addDocument(cdn, "truncated.pdf", good, (e) => e.subarray(0, e.length - 20)),
    f.addDocument(cdn, "exe.pdf", Buffer.from("MZ" + "x".repeat(200))),
    f.addDocument(cdn, "broken.pdf", Buffer.from("%PDF-1.4\nthis is not a real pdf")),
    f.addDocument(cdn, "deck.pptx", Buffer.from([0x50, 0x4b, 3, 4, ...Array(60).fill(1)])),
    { cdn_url: cdn.base + "/missing", file_name: "gone.pdf", encryption_metadata: f.encryptMedia(good).encryption_metadata },
  ];
  const r = await processDocuments(docs, deps, { concurrency: 3, tmpRoot: root });
  const byIndex = Object.fromEntries(r.errors.map((e) => [e.index, e.code]));
  assert.strictEqual(r.files.length, 1);
  assert.strictEqual(byIndex[1], "ENCRYPTED_HASH_MISMATCH");
  assert.ok(byIndex[2], "truncated file must error");
  assert.strictEqual(byIndex[3], "UNSUPPORTED_TYPE");
  assert.strictEqual(byIndex[4], "PDF_UNREADABLE");
  assert.strictEqual(byIndex[5], "NEEDS_CONVERSION");
  assert.strictEqual(byIndex[6], "HTTP_404");
  assert.strictEqual(r.errors.length, 6);
  assert.strictEqual(leftover(root).length, before);
})));

test("pipeline limits: too many files, total size, oversize file, download cap, host allowlist", () => withCdn(async (cdn, deps) => {
  const doc = f.addDocument(cdn, "x.pdf", await f.makePdf(1));
  assert.strictEqual((await processDocuments(Array(31).fill(doc), deps)).errors[0].code, "TOO_MANY_FILES");
  assert.strictEqual((await processDocuments([], deps)).errors[0].code, "NO_FILES");
  const big = f.addDocument(cdn, "big.pdf", Buffer.concat([await f.makePdf(1), crypto.randomBytes(300000)]));
  const r = await processDocuments([big, big, big], deps, { limits: { maxTotalBytes: 500000 } });
  assert.ok(r.errors.some((e) => e.code === "TOTAL_TOO_LARGE"));
  const r2 = await processDocuments([big], deps, { limits: { maxFileBytes: 100000 } });
  assert.strictEqual(r2.errors[0].code, "TOO_LARGE");
  const capped = createCdnFetcher({ allowLoopbackHttp: true, maxBytes: 1000 });
  assert.strictEqual((await processDocuments([big], { fetchCdn: capped })).errors[0].code, "TOO_LARGE");
  const strict = createCdnFetcher({ maxBytes: 1e6 }); // default deny: no hosts, no loopback
  assert.strictEqual((await processDocuments([doc], { fetchCdn: strict })).errors[0].code, "BAD_SCHEME");
  const strict2 = createCdnFetcher({ maxBytes: 1e6, allowedHostSuffixes: [".example-cdn.test"] });
  const evil = { ...doc, cdn_url: "https://169.254.169.254/latest" };
  assert.strictEqual((await processDocuments([evil], { fetchCdn: strict2 })).errors[0].code, "HOST_NOT_ALLOWED");
}));

test("cleanup happens even when the downloader throws unexpectedly", () => withTmpRoot(async (root) => {
  const before = leftover(root).length;
  const r = await processDocuments([{ cdn_url: "x", encryption_metadata: {} }], { fetchCdn: async () => { throw new Error("boom"); } }, { tmpRoot: root });
  assert.strictEqual(r.errors[0].code, "INTERNAL");
  assert.strictEqual(leftover(root).length, before);
}));

test("tmp isolation: a workDir created elsewhere is invisible to a private tmpRoot", () => withTmpRoot(async (root) => {
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "flowproto-"));   // simulates another test file's work dir
  try { assert.deepStrictEqual(leftover(root), []); } finally { fs.rmSync(other, { recursive: true, force: true }); }
}));
