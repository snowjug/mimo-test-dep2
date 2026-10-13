// Path handling in storage.service.js: URL formats, untrusted input, and what is allowed to be deleted at all.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

process.env.JWT_SECRET = "storage-paths-test-secret-fixture-32chars";
createFakeFirestore().install();
const S = require("../src/services/storage.service");
const B = "mimo-v2-11868.firebasestorage.app";

test("every URL form used by the app resolves to the same object path", () => {
  const p = "uploads/John_Doe/1700000_report v2.pdf";
  assert.strictEqual(S.extractStoragePath(`https://firebasestorage.googleapis.com/v0/b/${B}/o/${encodeURIComponent(p)}?alt=media&token=abc`, B), p);
  assert.strictEqual(S.extractStoragePath(`https://storage.googleapis.com/${B}/${encodeURIComponent(p).replace(/%2F/g, "/")}`, B), p);
  assert.strictEqual(S.extractStoragePath(`gs://${B}/${p}`, B), p);
  assert.strictEqual(S.extractStoragePath(p, B), p);
});

test("URLs that point at another bucket or another host never resolve to a path", () => {
  assert.strictEqual(S.extractStoragePath("https://firebasestorage.googleapis.com/v0/b/someone-elses-bucket/o/uploads%2Fa.pdf?alt=media", B), null);
  assert.strictEqual(S.extractStoragePath("https://storage.googleapis.com/someone-elses-bucket/uploads/a.pdf", B), null);
  assert.strictEqual(S.extractStoragePath("gs://someone-elses-bucket/uploads/a.pdf", B), null);
  assert.strictEqual(S.extractStoragePath("https://evil.example.com/uploads/a.pdf", B), null);
  assert.strictEqual(S.extractStoragePath("", B), null);
  assert.strictEqual(S.extractStoragePath(undefined, B), null);
});

test("only the approved customer prefixes are deletable", () => {
  for (const ok of ["uploads/u/a.pdf", "converted/u/a.pdf", "files/1_custom_document.pdf"]) assert.deepStrictEqual(S.validateCustomerPath(ok), { ok: true }, ok);
  const no = { "templates/blank_a4.pdf": "protected", "templates/mimo_graph.pdf": "protected", "templates/anything.pdf": "protected",
    "profiles/u/a.png": "outside_customer_prefix", "screensaver/a.png": "outside_customer_prefix", "scanner/s/p.jpg": "outside_customer_prefix",
    "uploads/../profiles/a.png": "invalid", "uploads/./a.pdf": "invalid", "/uploads/a.pdf": "invalid", "uploads\\a.pdf": "invalid", "uploads/": "invalid", "": "invalid" };
  for (const [p, reason] of Object.entries(no)) assert.deepStrictEqual(S.validateCustomerPath(p), { ok: false, reason }, p);
});

test("all file references of a job are discovered: urls, originals, converted output and files[]", () => {
  const job = { fileUrl: `gs://${B}/uploads/u/a.pdf`, originalFileUrl: `gs://${B}/uploads/u/a.docx`, convertedStoragePath: "converted/u/a.pdf",
    files: [{ url: `gs://${B}/uploads/u/b.pdf`, originalUrl: `gs://${B}/uploads/u/b.docx`, convertedStoragePath: "converted/u/b.pdf" }, null] };
  assert.deepStrictEqual(S.discoverStoragePaths(job, B).sort(), ["converted/u/a.pdf", "converted/u/b.pdf", "uploads/u/a.docx", "uploads/u/a.pdf", "uploads/u/b.docx", "uploads/u/b.pdf"]);
});

test("buildCleanupUpdate marks fileDeleted only for a complete cleanup that removed something", () => {
  const FieldValue = { delete: () => "DEL", serverTimestamp: () => "TS" };
  const done = S.buildCleanupUpdate({ complete: true, removedSomething: true, objects: [{ outcome: "deleted" }] }, { FieldValue, nowMs: 1 });
  assert.strictEqual(done.fileDeleted, true);
  const none = S.buildCleanupUpdate({ complete: true, removedSomething: false, objects: [{ outcome: "protected" }] }, { FieldValue, nowMs: 1 });
  assert.strictEqual(none.fileDeleted, undefined);
  assert.strictEqual(none.cleanupState, "no_customer_objects");
  const bad = S.buildCleanupUpdate({ complete: false, removedSomething: true, objects: [{ outcome: "deleted", path: "a" }, { outcome: "failed", path: "b", error: "boom" }] }, { FieldValue, nowMs: 1 });
  assert.strictEqual(bad.fileDeleted, undefined);
  assert.strictEqual(bad.cleanupState, "failed");
  assert.deepStrictEqual(bad.cleanupRemaining, ["failed:b"]);
});
