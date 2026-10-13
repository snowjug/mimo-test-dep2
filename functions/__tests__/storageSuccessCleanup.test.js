// Policy A: the existing authoritative success event (print_jobs.status -> "completed", written by the Pi/backend after its
// own print verification) releases the job's files. Cleanup problems never undo a print or touch payment/refund state.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createHarness, NOW, HOUR } = require("./helpers/cleanupHarness");

process.env.JWT_SECRET = "storage-success-cleanup-test-secret-32c";
const h = createHarness();
const { autoCleanupStorageJob } = require("../src/triggers/printJob.triggers");
const { runJobRetentionPass } = require("../src/services/storageCleanup.service");

const event = (jobId, before, after) => ({ params: { jobId }, data: { before: { data: () => before }, after: { data: () => after } } });
const writesTo = (col) => h.fake.log.writes.filter((w) => w.path.startsWith(`${col}/`));
const sweep = (nowMs) => runJobRetentionPass({ db: h.db, admin: h.admin, bucket: h.bucket, nowMs, log: h.silent, config: h.config(), clock: () => nowMs });

async function printedJob(id = "j1", extra = {}) {
  h.bucket.put("uploads/u1/a.docx", h.ago(2 * HOUR)).put("converted/u1/a.pdf", h.ago(2 * HOUR)).put("uploads/u1/b.png", h.ago(2 * HOUR));
  const doc = await h.addJob(id, { status: "completed", extra: { fileUrl: h.url("converted/u1/a.pdf"), originalFileUrl: h.url("uploads/u1/a.docx"), convertedStoragePath: "converted/u1/a.pdf",
    files: [{ name: "a.pdf", url: h.url("converted/u1/a.pdf"), originalFileUrl: h.url("uploads/u1/a.docx") }, { name: "b.png", url: h.url("uploads/u1/b.png") }], orderId: "order_1", refundStatus: undefined, isPrinted: true, ...extra } });
  return doc;
}

test("28. a confirmed successful print deletes the original, the converted PDF and every other file of the job", async () => {
  h.reset();
  const doc = await printedJob();
  await autoCleanupStorageJob.run(event("j1", { ...doc, status: "printing" }, doc));
  assert.deepStrictEqual(h.bucket.names(), []);
  const j = h.job("j1");
  assert.strictEqual(j.fileDeleted, true);
  assert.strictEqual(j.cleanupState, "completed");
  assert.strictEqual(j.status, "completed");
});

test("29. when storage deletion fails the print stays successful, nothing is refunded, and the sweep retries", async () => {
  h.reset();
  const doc = await printedJob();
  h.bucket.failDelete("converted/u1/a.pdf", 503);
  const seeded = h.fake.log.writes.length;
  // autoCleanupStorageJob (production code) stamps its retry backoff with the real Date.now(), not an injectable
  // clock. Pin it to the harness's fixed NOW so the "7 hours later" sweep below is measured on the same clock the
  // trigger used -- otherwise this test breaks on its own once real wall-clock time runs past NOW, with nothing
  // about the cleanup/retry policy itself actually wrong (in production both run on the same real clock).
  const realDateNow = Date.now;
  Date.now = () => NOW;
  try {
    await autoCleanupStorageJob.run(event("j1", { ...doc, status: "printing" }, doc));
  } finally {
    Date.now = realDateNow;
  }
  const triggerWrites = h.fake.log.writes.slice(seeded);
  const j = h.job("j1");
  assert.strictEqual(j.status, "completed", "print result stays");
  assert.notStrictEqual(j.fileDeleted, true);
  assert.strictEqual(j.cleanupState, "failed");
  assert.strictEqual(j.refundStatus, undefined);
  assert.deepStrictEqual(triggerWrites.filter((w) => !w.path.startsWith("print_jobs/")), [], "no other collection (orders, payments, refunds) was written");
  for (const w of triggerWrites) {
    assert.deepStrictEqual(Object.keys(w.payload).filter((k) => !/^cleanup/.test(k)), [], "only cleanup* fields were written to the job");
  }
  assert.strictEqual(h.bucket.has("converted/u1/a.pdf"), true);
  h.bucket.clearFailures();
  await sweep(NOW + 7 * HOUR);
  assert.deepStrictEqual(h.bucket.names(), []);
  assert.strictEqual(h.job("j1").fileDeleted, true);
});

test("30. the same completion event delivered twice is harmless", async () => {
  h.reset();
  const doc = await printedJob();
  const ev = event("j1", { ...doc, status: "printing" }, doc);
  await autoCleanupStorageJob.run(ev);
  await autoCleanupStorageJob.run(ev); // stale payload: still lists the (now gone) objects
  assert.strictEqual(h.job("j1").fileDeleted, true);
  assert.strictEqual(h.job("j1").cleanupState, "completed");
  assert.deepStrictEqual(h.bucket.names(), []);
  // a payload that already carries fileDeleted:true does no storage work at all
  const calls = h.bucket.deleteCalls;
  await autoCleanupStorageJob.run(event("j1", { ...doc, status: "printing" }, { ...doc, fileDeleted: true }));
  assert.strictEqual(h.bucket.deleteCalls, calls);
});

test("31. payment, print-code generation or a print start alone never trigger success cleanup", async () => {
  h.reset();
  h.bucket.put("uploads/u1/a.pdf", h.ago(60 * HOUR));
  const base = { userId: "u1", fileUrl: h.url("uploads/u1/a.pdf"), printCode: "1234", orderId: "order_1" };
  await autoCleanupStorageJob.run(event("j1", { ...base, status: "pending" }, { ...base, status: "paid" }));       // payment + print code
  await autoCleanupStorageJob.run(event("j1", { ...base, status: "paid" }, { ...base, status: "printing" }));      // kiosk code entry / CUPS submit
  await autoCleanupStorageJob.run(event("j1", { ...base, status: "completed" }, { ...base, status: "completed" })); // an unrelated update after completion
  assert.strictEqual(h.bucket.has("uploads/u1/a.pdf"), true);
  assert.strictEqual(h.bucket.deleteCalls, 0);
});

test("a shared object that another active job still needs survives a successful print", async () => {
  h.reset();
  h.bucket.put("uploads/u1/shared.pdf", h.ago(2 * HOUR));
  const doc = await h.addJob("printed", { status: "completed", extra: { fileUrl: h.url("uploads/u1/shared.pdf") } });
  await h.addJob("other", { status: "paid", extra: { userId: "u2", fileUrl: h.url("uploads/u1/shared.pdf") } });
  await autoCleanupStorageJob.run(event("printed", { ...doc, status: "printing" }, doc));
  assert.strictEqual(h.bucket.has("uploads/u1/shared.pdf"), true);
  assert.notStrictEqual(h.job("printed").fileDeleted, true);
  assert.strictEqual(h.job("printed").cleanupState, "partial");
  assert.strictEqual(h.job("other").status, "paid");
});

test("templates referenced by a job are never deleted, and a template-only job is not reported as cleaned of customer files", async () => {
  h.reset();
  const doc = await h.addJob("blank", { status: "completed", extra: { fileUrl: "https://storage.googleapis.com/test-bucket/templates%2Fblank_a4.pdf", files: [{ url: h.url("templates/blank_a4.pdf") }] } });
  await autoCleanupStorageJob.run(event("blank", { ...doc, status: "printing" }, doc));
  assert.strictEqual(h.bucket.deleteCalls, 0);
  assert.strictEqual(h.job("blank").cleanupState, "no_customer_objects");
  assert.notStrictEqual(h.job("blank").fileDeleted, true);
});
