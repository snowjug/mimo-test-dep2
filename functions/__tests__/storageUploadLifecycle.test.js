// Upload / cancel / convert lifecycle: remove-file markers, cancellation before finalisation, stale-object guard,
// conversion failure and multi-file conversion failure. Converter and Storage are in-memory fakes.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createHarness, NOW, HOUR } = require("./helpers/cleanupHarness");

process.env.JWT_SECRET = "storage-upload-lifecycle-test-secret-32c";
const h = createHarness();

// stub the converter BEFORE the controller imports it
let converterImpl = async () => { throw new Error("converter not stubbed"); };
const convPath = require.resolve("../src/services/converter.service");
require.cache[convPath] = { id: convPath, filename: convPath, loaded: true, exports: { SUPPORTED_OFFICE_EXTENSIONS: new Set([".docx", ".doc"]), callOfficeConverter: (args) => converterImpl(args) } };
const { postFinalizeUpload, deleteRemoveFile } = require("../src/controllers/upload.controller");
const { runJobRetentionPass, runOrphanStoragePass } = require("../src/services/storageCleanup.service");

const response = () => ({ code: 200, body: undefined, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
const finalize = async (files) => { const res = response(); await postFinalizeUpload({ user: { id: "u1" }, body: { files } }, res); return res; };
const removeFile = async (fileUrl) => { const res = response(); await deleteRemoveFile({ user: { id: "u1" }, body: { fileUrl } }, res); return res; };
const sweep = (nowMs = NOW) => runJobRetentionPass({ db: h.db, admin: h.admin, bucket: h.bucket, nowMs, log: h.silent, config: h.config(), clock: () => nowMs });
const orphans = (nowMs) => runOrphanStoragePass({ db: h.db, admin: h.admin, bucket: h.bucket, nowMs, log: h.silent, config: h.config(), clock: () => nowMs });
const png = (name, objName) => ({ name, type: "image/png", size: 5000, url: h.url(objName), clientUploadId: name });

test("Scenario B: upload A, remove A, upload B, pay/print B - A and its conversion go, B is never touched", async () => {
  h.reset();
  h.bucket.put("uploads/u1/A.docx", h.ago(1 * HOUR)).put("converted/u1/A.pdf", h.ago(1 * HOUR)).put("uploads/u1/B.png", h.ago(0.1 * HOUR));
  await h.addJob("jobA", { status: "pending", extra: { fileUrl: h.url("converted/u1/A.pdf"), originalFileUrl: h.url("uploads/u1/A.docx"), convertedStoragePath: "converted/u1/A.pdf" } });
  await h.addJob("jobB", { status: "pending", extra: { fileUrl: h.url("uploads/u1/B.png") } });
  const res = await removeFile(h.url("converted/u1/A.pdf"));
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.cleanupPending, false);
  assert.deepStrictEqual(h.bucket.names(), ["uploads/u1/B.png"]);
  assert.strictEqual(h.job("jobA").fileDeleted, true);
  assert.strictEqual(h.job("jobA").status, "cleaned");
  assert.strictEqual(h.job("jobA").removedByUser, true);
  assert.strictEqual(h.job("jobB").status, "pending");
  assert.strictEqual(h.job("jobB").fileDeleted, undefined);
  // B is paid and printed later: its own success path cleans it
  await h.db.collection("print_jobs").doc("jobB").update({ status: "completed" });
  await sweep(NOW);
  assert.strictEqual(h.bucket.names().length, 0);
});

test("a removed file whose object is shared with another active job is NOT deleted and is not reported as deleted", async () => {
  h.reset();
  h.bucket.put("uploads/u1/shared.png", h.ago(1 * HOUR));
  await h.addJob("jobA", { status: "pending", extra: { fileUrl: h.url("uploads/u1/shared.png") } });
  await h.addJob("jobB", { status: "paid", extra: { fileUrl: h.url("uploads/u1/shared.png"), userId: "u2" } });
  const res = await removeFile(h.url("uploads/u1/shared.png"));
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.cleanupPending, true);
  assert.strictEqual(h.bucket.has("uploads/u1/shared.png"), true, "the paid job still needs it");
  assert.strictEqual(h.job("jobA").status, "cleaned");
  assert.notStrictEqual(h.job("jobA").fileDeleted, true);
  assert.strictEqual(h.job("jobA").cleanupState, "partial");
  assert.strictEqual(h.job("jobB").status, "paid");
});

test("27. remove-file with a storage failure is not reported as deleted; the sweep finishes the job later", async () => {
  h.reset();
  h.bucket.put("uploads/u1/a.png", h.ago(1 * HOUR));
  await h.addJob("jobA", { status: "pending", extra: { fileUrl: h.url("uploads/u1/a.png") } });
  h.bucket.failDelete("uploads/u1/a.png", 503);
  // deleteRemoveFile (production code) also stamps its retry backoff with the real Date.now(). Pin it to NOW so the
  // "7 hours later" sweep below is measured on the same clock -- see the matching note in storageSuccessCleanup.test.js.
  const realDateNow = Date.now;
  Date.now = () => NOW;
  let res;
  try {
    res = await removeFile(h.url("uploads/u1/a.png"));
  } finally {
    Date.now = realDateNow;
  }
  assert.strictEqual(res.code, 200, "the customer flow is not broken");
  assert.strictEqual(res.body.cleanupPending, true);
  const j = h.job("jobA");
  assert.strictEqual(j.status, "cleaned");
  assert.strictEqual(j.removedByUser, true);
  assert.notStrictEqual(j.fileDeleted, true, "the old code marked this deleted even though the delete failed");
  assert.strictEqual(j.cleanupState, "failed");
  assert.strictEqual(h.bucket.has("uploads/u1/a.png"), true);
  h.bucket.clearFailures();
  await sweep(NOW + 7 * HOUR); // removed-by-user jobs are retried at once (no 24 h wait) once the backoff has passed
  assert.strictEqual(h.bucket.has("uploads/u1/a.png"), false);
  assert.strictEqual(h.job("jobA").fileDeleted, true);
});

test("remove-file for an unknown file still answers 404 exactly as before and deletes nothing", async () => {
  h.reset();
  h.bucket.put("uploads/u1/inflight.png", h.ago(0.01 * HOUR));
  const res = await removeFile(h.url("uploads/u1/inflight.png"));
  assert.strictEqual(res.code, 404);
  assert.strictEqual(res.body.error, "File not found or already processed");
  assert.strictEqual(h.bucket.has("uploads/u1/inflight.png"), true);
});

test("23./Scenario C+D: cancelled before finalisation leaves an untracked object that the orphan sweep removes after 24 h", async () => {
  h.reset();
  h.bucket.put("uploads/u1/cancelled.png", h.ago(0.5 * HOUR));
  assert.strictEqual((await removeFile(h.url("uploads/u1/cancelled.png"))).code, 404); // no Firestore record exists yet
  const early = await orphans(NOW);
  assert.strictEqual(h.bucket.has("uploads/u1/cancelled.png"), true, "too young to touch");
  assert.strictEqual(early.skipped.too_young, 1);
  await orphans(NOW + 25 * HOUR);
  assert.strictEqual(h.bucket.has("uploads/u1/cancelled.png"), false);
});

test("Scenario D: a delayed finalisation can no longer create a live reference to an object that has already been deleted", async () => {
  h.reset();
  const gone = png("late.png", "uploads/u1/late.png"); // object was removed by the orphan sweep long ago
  const res = await finalize([gone]);
  assert.strictEqual(res.code, 400);
  assert.match(res.body.error, /no longer stored/);
  assert.deepStrictEqual(h.fake.data("print_jobs"), {}, "no payable job was created");
  // while a present object finalises normally
  h.bucket.put("uploads/u1/ok.png", h.ago(1 * HOUR));
  const ok = await finalize([png("ok.png", "uploads/u1/ok.png")]);
  assert.strictEqual(ok.code, 200, JSON.stringify(ok.body));
  assert.strictEqual(Object.keys(h.fake.data("print_jobs")).length, 1);
});

test("24. conversion failure of a single file keeps the same 422 response and leaves the original discoverable for cleanup", async () => {
  h.reset();
  h.bucket.put("uploads/u1/bad.docx", h.ago(1 * HOUR));
  converterImpl = async () => { throw new Error("LibreOffice crashed"); };
  const res = await finalize([{ name: "bad.docx", type: "application/vnd", size: 5000, url: h.url("uploads/u1/bad.docx") }]);
  assert.strictEqual(res.code, 422);
  assert.match(res.body.error, /Failed to process document 'bad.docx': LibreOffice crashed/);
  assert.deepStrictEqual(h.fake.data("print_jobs"), {});
  assert.strictEqual(h.bucket.has("uploads/u1/bad.docx"), true, "still there ...");
  await orphans(NOW + 30 * HOUR);
  assert.strictEqual(h.bucket.has("uploads/u1/bad.docx"), false, "... and removed by the orphan sweep after 24 h");
});

test("25. multi-file batch: when a later conversion fails, the PDFs generated for earlier files are discarded", async () => {
  h.reset();
  h.bucket.put("uploads/u1/a.docx", h.ago(1 * HOUR)).put("uploads/u1/b.docx", h.ago(1 * HOUR));
  converterImpl = async ({ fileName }) => {
    if (fileName === "b.docx") throw new Error("corrupt document");
    h.bucket.put("converted/u1/a.pdf", h.ago(0));
    return { pageCount: 2, fileUrl: h.url("converted/u1/a.pdf"), storagePath: "converted/u1/a.pdf" };
  };
  const mk = (n) => ({ name: n, type: "application/msword", size: 5000, url: h.url(`uploads/u1/${n}`) });
  const res = await finalize([mk("a.docx"), mk("b.docx")]);
  assert.strictEqual(res.code, 422);
  assert.strictEqual(h.bucket.has("converted/u1/a.pdf"), false, "the stranded conversion output was removed");
  assert.strictEqual(h.bucket.has("uploads/u1/a.docx"), true, "originals stay tracked (discoverable) for the 24 h sweep");
  assert.deepStrictEqual(h.fake.data("print_jobs"), {});
});

test("25b. ... but a converted file that an active job already uses (same deterministic path) is left alone", async () => {
  h.reset();
  h.bucket.put("uploads/u1/a.docx", h.ago(1 * HOUR)).put("uploads/u1/b.docx", h.ago(1 * HOUR)).put("converted/u1/a.pdf", h.ago(2 * HOUR));
  await h.addJob("existing", { status: "pending", extra: { fileUrl: h.url("converted/u1/a.pdf"), convertedStoragePath: "converted/u1/a.pdf" } });
  converterImpl = async ({ fileName }) => {
    if (fileName === "b.docx") throw new Error("corrupt document");
    return { pageCount: 1, fileUrl: h.url("converted/u1/a.pdf"), storagePath: "converted/u1/a.pdf" };
  };
  const mk = (n) => ({ name: n, type: "application/msword", size: 5000, url: h.url(`uploads/u1/${n}`) });
  assert.strictEqual((await finalize([mk("a.docx"), mk("b.docx")])).code, 422);
  assert.strictEqual(h.bucket.has("converted/u1/a.pdf"), true);
});

test("a successful office conversion is unchanged: job records keep fileUrl / originalFileUrl / convertedStoragePath", async () => {
  h.reset();
  h.bucket.put("uploads/u1/ok.docx", h.ago(1 * HOUR));
  converterImpl = async () => { h.bucket.put("converted/u1/ok.pdf", h.ago(0)); return { pageCount: 3, fileUrl: h.url("converted/u1/ok.pdf"), storagePath: "converted/u1/ok.pdf" }; };
  const res = await finalize([{ name: "ok.docx", type: "application/msword", size: 5000, url: h.url("uploads/u1/ok.docx") }]);
  assert.strictEqual(res.code, 200, JSON.stringify(res.body));
  const job = Object.values(h.fake.data("print_jobs"))[0];
  assert.strictEqual(job.fileUrl, h.url("converted/u1/ok.pdf"));
  assert.strictEqual(job.originalFileUrl, h.url("uploads/u1/ok.docx"));
  assert.strictEqual(job.convertedStoragePath, "converted/u1/ok.pdf");
  assert.strictEqual(job.status, "pending");
});
