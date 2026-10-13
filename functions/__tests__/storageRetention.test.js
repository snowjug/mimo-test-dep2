// Job-linked Storage cleanup (runJobRetentionPass + classifyJob): policies A/B, the paid-job exception, resumability,
// no starvation by already-cleaned documents, and truthful deletion markers. All in memory, injected clock.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createHarness, NOW, HOUR } = require("./helpers/cleanupHarness");

process.env.JWT_SECRET = "storage-retention-test-secret-fixture-32c";
const h = createHarness();
const { runJobRetentionPass, classifyJob, JOBS_STATE_DOC } = require("../src/services/storageCleanup.service");

const pass = (over = {}, nowMs = NOW) => runJobRetentionPass({ db: h.db, admin: h.admin, bucket: h.bucket, nowMs, log: h.silent, config: h.config(over), clock: () => nowMs });

test("1. an unpaid job whose file was uploaded more than 24 h ago is cleaned, and the abandoned cart item is closed", async () => {
  h.reset();
  await h.addJob("j1", { status: "pending", objects: { "uploads/u1/a.pdf": 25 } });
  const c = await pass();
  assert.strictEqual(c.cleaned, 1);
  assert.strictEqual(h.bucket.has("uploads/u1/a.pdf"), false);
  assert.strictEqual(h.job("j1").fileDeleted, true);
  assert.strictEqual(h.job("j1").status, "abandoned");
  assert.strictEqual(h.job("j1").cleanupState, "completed");
});

test("2. a file younger than 24 h is preserved and the job is scheduled for later", async () => {
  h.reset();
  await h.addJob("j1", { status: "pending", objects: { "uploads/u1/a.pdf": 23 } });
  await pass();
  assert.strictEqual(h.bucket.has("uploads/u1/a.pdf"), true);
  const j = h.job("j1");
  assert.notStrictEqual(j.fileDeleted, true);
  assert.strictEqual(j.status, "pending");
  assert.strictEqual(j.cleanupState, "partial");
  assert.ok(new Date(j.cleanupNextAttemptAt).getTime() > NOW, "retry time is in the future (about an hour away)");
});

test("the age comes from the real upload time of the object, not from job timestamps", async () => {
  h.reset();
  // job doc claims it was created just now (e.g. re-finalised), but the object itself was uploaded 30 h ago
  await h.addJob("j1", { status: "pending", objects: { "uploads/u1/a.pdf": 30 }, extra: { uploadedAt: new Date(NOW - 60e3), retentionStartAt: new Date(NOW - 60e3), createdAt: new Date(NOW - 60e3) } });
  await pass();
  assert.strictEqual(h.bucket.has("uploads/u1/a.pdf"), false);
  // and the reverse: the job document looks ancient but the object is fresh
  await h.addJob("j2", { status: "failed", objects: { "uploads/u1/b.pdf": 2 }, extra: { uploadedAt: new Date(NOW - 99 * HOUR), createdAt: new Date(NOW - 99 * HOUR) } });
  await pass();
  assert.strictEqual(h.bucket.has("uploads/u1/b.pdf"), true);
});

test("3. a PAID job that was never printed is preserved no matter how old, and nothing on it is changed", async () => {
  h.reset();
  await h.addJob("j1", { status: "paid", objects: { "uploads/u1/a.pdf": 400 }, extra: { printCode: "1234", orderId: "order_1" } });
  const before = JSON.stringify(h.job("j1"));
  const c = await pass();
  assert.strictEqual(c.skipped.paid_unprinted, 1);
  assert.strictEqual(h.bucket.has("uploads/u1/a.pdf"), true);
  assert.strictEqual(JSON.stringify(h.job("j1")), before, "not expired, not refunded, no cleanup fields");
});

test("4. a successfully printed job is cleaned immediately: original AND converted file", async () => {
  h.reset();
  await h.addJob("j1", { status: "completed", objects: { "uploads/u1/a.docx": 1, "converted/u1/a.pdf": 1 }, extra: { isPrinted: true } });
  await pass();
  assert.strictEqual(h.bucket.has("uploads/u1/a.docx"), false);
  assert.strictEqual(h.bucket.has("converted/u1/a.pdf"), false);
  assert.strictEqual(h.job("j1").fileDeleted, true);
  assert.strictEqual(h.job("j1").status, "completed", "print result is untouched");
});

test("5. printing / pending_conversion / processing jobs are never touched", async () => {
  h.reset();
  for (const st of ["printing", "pending_conversion", "processing"]) await h.addJob(`j_${st}`, { status: st, objects: { [`uploads/u1/${st}.pdf`]: 99 } });
  const c = await pass();
  assert.strictEqual(c.skipped.active, 3);
  assert.strictEqual(h.bucket.names().length, 3);
});

test("a job whose print started a few minutes ago keeps its files (grace period)", async () => {
  h.reset();
  await h.addJob("j1", { status: "failed", objects: { "uploads/u1/a.pdf": 99 }, extra: { printStartedAt: new Date(NOW - 5 * 60e3) } });
  const c = await pass();
  assert.strictEqual(c.skipped.recent_print, 1);
  assert.strictEqual(h.bucket.has("uploads/u1/a.pdf"), true);
});

test("failed and refunded jobs follow the 24 h rule and keep their payment state", async () => {
  h.reset();
  await h.addJob("jf", { status: "failed", objects: { "uploads/u1/f.pdf": 30 }, extra: { refundStatus: "SUCCESS" } });
  await h.addJob("jr", { status: "refunded", objects: { "uploads/u1/r.pdf": 30 } });
  await pass();
  assert.strictEqual(h.bucket.names().length, 0);
  assert.strictEqual(h.job("jf").status, "failed");
  assert.strictEqual(h.job("jf").refundStatus, "SUCCESS");
  assert.strictEqual(h.job("jr").status, "refunded");
});

test("6. legacy documents with a missing OR false fileDeleted are still processed", async () => {
  h.reset();
  await h.addJob("legacy1", { status: "abandoned", objects: { "uploads/u1/l1.pdf": 50 } }); // field missing
  await h.addJob("legacy2", { status: "abandoned", objects: { "uploads/u1/l2.pdf": 50 }, extra: { fileDeleted: false } });
  const c = await pass();
  assert.strictEqual(c.cleaned, 2);
  assert.strictEqual(h.bucket.names().length, 0);
});

test("7. hundreds of old already-cleaned documents cannot starve an eligible job that sorts after them", async () => {
  const all = {};
  for (let i = 0; i < 700; i += 1) all[`a${String(i).padStart(4, "0")}`] = { userId: "u1", status: "completed", fileDeleted: true };
  h.reset({ print_jobs: all });
  await h.addJob("zzz_eligible", { status: "pending", objects: { "uploads/u1/late.pdf": 40 } });
  let runs = 0;
  while (h.bucket.has("uploads/u1/late.pdf") && runs < 10) {
    runs += 1;
    await pass({ jobPageSize: 100, jobMaxScanned: 250 }); // tiny per-run budget
  }
  assert.strictEqual(h.bucket.has("uploads/u1/late.pdf"), false, "eligible job was reached");
  assert.ok(runs <= 4, `reached within a few runs (took ${runs})`);
});

test("8. repeated runs make forward progress: the cursor advances, wraps at the end and the next sweep starts over", async () => {
  const all = {};
  for (let i = 0; i < 40; i += 1) all[`d${String(i).padStart(3, "0")}`] = { userId: "u1", status: "completed", fileDeleted: true };
  h.reset({ print_jobs: all });
  const cursors = [];
  for (let i = 0; i < 3; i += 1) { await pass({ jobPageSize: 10, jobMaxScanned: 10 }); cursors.push(h.state(JOBS_STATE_DOC).jobCursor); }
  assert.deepStrictEqual(cursors, ["d009", "d019", "d029"]);
  const last = await pass({ jobPageSize: 10, jobMaxScanned: 10 }); // d030..d039, then the end of the collection
  assert.strictEqual(last.wrapped, true);
  assert.strictEqual(h.state(JOBS_STATE_DOC).jobCursor, null);
  assert.ok(h.state(JOBS_STATE_DOC).lastSweepCompletedMs, "a completed sweep is recorded");
  const next = await pass({ jobPageSize: 10, jobMaxScanned: 10 });
  assert.strictEqual(next.scanned, 10, "a new sweep starts from the beginning");
  assert.strictEqual(h.state(JOBS_STATE_DOC).jobCursor, "d009");
});

test("9. a run that stops early (per-run budget) resumes where it stopped and loses no eligible job", async () => {
  h.reset();
  for (let i = 0; i < 9; i += 1) await h.addJob(`j${i}`, { status: "abandoned", objects: { [`uploads/u1/f${i}.pdf`]: 50 } });
  let runs = 0;
  while (h.bucket.names().length && runs < 10) { runs += 1; await pass({ jobMaxCleaned: 2 }); }
  assert.strictEqual(h.bucket.names().length, 0);
  assert.ok(runs >= 5, "work was spread over several bounded runs");
  for (let i = 0; i < 9; i += 1) assert.strictEqual(h.job(`j${i}`).fileDeleted, true);
});

test("9b. a crashed run's lease blocks overlap until it expires, then the next run carries on", async () => {
  h.reset({ system_state: { [JOBS_STATE_DOC]: { leaseUntilMs: NOW + 5 * 60e3, leaseRunId: "dead_run" } } });
  await h.addJob("j1", { status: "abandoned", objects: { "uploads/u1/a.pdf": 50 } });
  const blocked = await pass();
  assert.strictEqual(blocked.aborted, "lease_held");
  assert.strictEqual(h.bucket.has("uploads/u1/a.pdf"), true);
  const later = await pass({}, NOW + 20 * 60e3);
  assert.strictEqual(later.cleaned, 1);
});

test("10. a job with NO timestamps is cleaned from the object's own upload time; an unreadable upload time keeps the file", async () => {
  h.reset();
  await h.addJob("noTs", { status: "abandoned", objects: { "uploads/u1/old.pdf": 50 } });
  assert.strictEqual(h.job("noTs").createdAt, undefined);
  await pass();
  assert.strictEqual(h.bucket.has("uploads/u1/old.pdf"), false);
  // an object whose upload time cannot be read is kept and retried, never guessed
  h.bucket.put("uploads/u1/odd.pdf", "2026-01-01T00:00:00Z");
  const orig = h.bucket.file;
  h.bucket.file = (n) => { const f = orig(n); if (n === "uploads/u1/odd.pdf") f.getMetadata = async () => [{ name: n }]; return f; };
  await h.addJob("odd", { status: "abandoned", extra: { fileUrl: h.url("uploads/u1/odd.pdf") } });
  await pass();
  h.bucket.file = orig;
  assert.strictEqual(h.bucket.has("uploads/u1/odd.pdf"), true);
  assert.notStrictEqual(h.job("odd").fileDeleted, true);
  assert.strictEqual(h.job("odd").cleanupState, "partial");
});

test("11. an ambiguous storage error (503) never sets fileDeleted, is recorded, and backs off", async () => {
  h.reset();
  await h.addJob("j1", { status: "abandoned", objects: { "uploads/u1/a.pdf": 50 } });
  h.bucket.failDelete("uploads/u1/a.pdf", 503);
  const c = await pass();
  assert.strictEqual(c.failed, 1);
  const j = h.job("j1");
  assert.notStrictEqual(j.fileDeleted, true);
  assert.strictEqual(j.cleanupState, "failed");
  assert.match(j.cleanupError, /503/);
  assert.ok(new Date(j.cleanupNextAttemptAt).getTime() > NOW);
  assert.strictEqual(j.cleanupAttempts, 1);
  assert.strictEqual(h.bucket.has("uploads/u1/a.pdf"), true);
  const again = await pass(); // within the backoff window the job is not hammered again
  assert.strictEqual(again.skipped.backoff, 1);
});

test("27. the failed deletion succeeds on a later retry, and only then is the job marked deleted", async () => {
  h.reset();
  await h.addJob("j1", { status: "abandoned", objects: { "uploads/u1/a.pdf": 50 } });
  h.bucket.failDelete("uploads/u1/a.pdf", 503);
  await pass();
  h.bucket.clearFailures();
  const c = await pass({}, NOW + 7 * HOUR); // past any backoff
  assert.strictEqual(c.cleaned, 1);
  assert.strictEqual(h.bucket.has("uploads/u1/a.pdf"), false);
  assert.strictEqual(h.job("j1").fileDeleted, true);
  assert.strictEqual(h.job("j1").cleanupError, undefined, "error cleared once it succeeded");
});

test("12. an object that is already gone (404) is treated as deleted, idempotently", async () => {
  h.reset();
  await h.addJob("j1", { status: "abandoned", extra: { fileUrl: h.url("uploads/u1/gone.pdf") } }); // never existed in the bucket
  const c = await pass();
  assert.strictEqual(c.objects.missing, 1);
  assert.strictEqual(h.job("j1").fileDeleted, true);
  const again = await pass();
  assert.strictEqual(again.skipped.already_deleted, 1);
});

test("a partly cleaned job is not marked deleted: one object failing keeps the job open", async () => {
  h.reset();
  await h.addJob("j1", { status: "abandoned", objects: { "uploads/u1/a.docx": 50, "converted/u1/a.pdf": 50 } });
  h.bucket.failDelete("converted/u1/a.pdf", 500);
  await pass();
  assert.strictEqual(h.bucket.has("uploads/u1/a.docx"), false, "the object that could be deleted was");
  assert.strictEqual(h.bucket.has("converted/u1/a.pdf"), true);
  assert.notStrictEqual(h.job("j1").fileDeleted, true);
  assert.ok(h.job("j1").cleanupRemaining.some((x) => x.includes("converted/u1/a.pdf")));
});

test("26. an object shared with a PAID job is not deleted by another job; it goes once that job has printed", async () => {
  h.reset();
  await h.addJob("old", { status: "abandoned", objects: { "uploads/u1/shared.pdf": 50 } });
  await h.addJob("live", { status: "paid", extra: { fileUrl: h.url("uploads/u1/shared.pdf") } });
  await pass();
  assert.strictEqual(h.bucket.has("uploads/u1/shared.pdf"), true, "still needed by the paid job");
  assert.notStrictEqual(h.job("old").fileDeleted, true);
  assert.strictEqual(h.job("old").cleanupState, "partial");
  await h.db.collection("print_jobs").doc("live").update({ status: "completed" }); // the paid job prints
  await pass({}, NOW + 3 * HOUR);
  assert.strictEqual(h.bucket.has("uploads/u1/shared.pdf"), false);
  await pass({}, NOW + 6 * HOUR); // the first job now finds the object gone and records it
  assert.strictEqual(h.job("old").fileDeleted, true);
});

test("classifyJob policy table", () => {
  assert.strictEqual(classifyJob({ status: "paid" }, NOW).reason, "paid_unprinted");
  assert.strictEqual(classifyJob({ status: "completed" }, NOW).mode, "immediate");
  assert.strictEqual(classifyJob({ status: "cleaned", removedByUser: true }, NOW).mode, "immediate");
  assert.strictEqual(classifyJob({ status: "failed" }, NOW).mode, "age");
  assert.strictEqual(classifyJob({ status: "pending", fileDeleted: true }, NOW).reason, "already_deleted");
});
