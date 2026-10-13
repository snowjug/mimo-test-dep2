// Bucket-linked cleanup (runOrphanStoragePass): customer objects with no Firestore job. Real upload age (timeCreated),
// reference safety, approved prefixes only, pagination/checkpoint, races and idempotence. All in memory.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createHarness, NOW, HOUR } = require("./helpers/cleanupHarness");

process.env.JWT_SECRET = "storage-orphan-test-secret-fixture-32ch";
const h = createHarness();
const { runOrphanStoragePass, ORPHAN_STATE_DOC } = require("../src/services/storageCleanup.service");

const run = (over = {}, nowMs = NOW) => runOrphanStoragePass({ db: h.db, admin: h.admin, bucket: h.bucket, nowMs, log: h.silent, config: h.config(over), clock: () => nowMs });

test("13. an orphan older than 24 h is deleted; 14. one younger than 24 h is kept", async () => {
  h.reset();
  h.bucket.put("uploads/u1/old.pdf", h.ago(25 * HOUR)).put("uploads/u1/young.pdf", h.ago(23 * HOUR)).put("converted/u1/old.pdf", h.ago(80 * HOUR)).put("files/1_custom_document.pdf", h.ago(30 * HOUR));
  const c = await run();
  assert.deepStrictEqual(h.bucket.names(), ["uploads/u1/young.pdf"]);
  assert.strictEqual(c.deleted, 3);
  assert.strictEqual(c.skipped.too_young, 1);
});

test("the age is the real Cloud Storage upload time: a re-uploaded (overwritten) object starts its 24 h again", async () => {
  h.reset();
  h.bucket.put("converted/u1/a.pdf", h.ago(60 * HOUR)); // first conversion 60 h ago ...
  h.bucket.put("converted/u1/a.pdf", h.ago(1 * HOUR));  // ... overwritten an hour ago: timeCreated is the new generation's
  await run();
  assert.strictEqual(h.bucket.has("converted/u1/a.pdf"), true);
});

test("15. an object referenced by an active job is preserved (single and multi-file jobs)", async () => {
  h.reset();
  h.bucket.put("uploads/u1/a.pdf", h.ago(90 * HOUR)).put("uploads/u1/b.pdf", h.ago(90 * HOUR)).put("uploads/u1/c.pdf", h.ago(90 * HOUR)).put("uploads/u1/free.pdf", h.ago(90 * HOUR));
  await h.db.collection("print_jobs").doc("p1").set({ status: "pending", fileUrl: h.fbUrl("uploads/u1/a.pdf") });                 // token download URL
  await h.db.collection("print_jobs").doc("p2").set({ status: "pending_conversion", files: [{ url: h.url("uploads/u1/b.pdf") }, { url: h.url("uploads/u1/c.pdf") }] });
  const c = await run();
  assert.deepStrictEqual(h.bucket.names(), ["uploads/u1/a.pdf", "uploads/u1/b.pdf", "uploads/u1/c.pdf"]);
  assert.strictEqual(c.skipped.referenced, 3);
});

test("16. objects required by a PAID, unprinted job are preserved regardless of age", async () => {
  h.reset();
  h.bucket.put("uploads/u1/paid.pdf", h.ago(500 * HOUR)).put("converted/u1/paid.pdf", h.ago(500 * HOUR));
  await h.db.collection("print_jobs").doc("paid1").set({ status: "paid", printCode: "4321", fileUrl: h.url("uploads/u1/paid.pdf"), convertedStoragePath: "converted/u1/paid.pdf" });
  await run();
  assert.strictEqual(h.bucket.names().length, 2);
  assert.strictEqual(h.job("paid1").status, "paid");
});

test("an object that only belonged to a finished job is released (the job sweep then records it as missing)", async () => {
  h.reset();
  h.bucket.put("uploads/u1/done.pdf", h.ago(60 * HOUR));
  await h.db.collection("print_jobs").doc("done").set({ status: "completed", fileUrl: h.url("uploads/u1/done.pdf") });
  await run();
  assert.strictEqual(h.bucket.has("uploads/u1/done.pdf"), false);
  assert.strictEqual(h.job("done").status, "completed", "orphan cleanup never edits job documents");
});

test("17. protected templates and 18. objects outside the approved prefixes are never deleted (even if listed)", async () => {
  h.reset();
  for (const n of ["templates/blank_a4.pdf", "templates/mimo_graph.pdf", "profiles/u1/avatar.png", "screensaver/ad.png", "scanner/s1/p1.jpg", "other/x.pdf", "uploads/../templates/blank_a4.pdf"]) h.bucket.put(n, h.ago(900 * HOUR));
  // the listing is attacker/bug-controlled in this test: it returns everything regardless of the requested prefix
  const realList = h.bucket.getFiles;
  h.bucket.getFiles = async () => [h.bucket.names().map((name) => ({ name, metadata: { timeCreated: h.ago(900 * HOUR) } })), null, {}];
  const c = await run();
  h.bucket.getFiles = realList;
  assert.strictEqual(h.bucket.names().length, 7, "nothing deleted");
  assert.strictEqual(c.deleted, 0);
  assert.ok((c.skipped.protected || 0) >= 3, "templates (including a traversal that points at one) are protected");
  assert.ok((c.skipped.outside_customer_prefix || 0) >= 4);
});

test("19. pagination: a bucket larger than one page is covered across pages and across runs, with a persisted checkpoint", async () => {
  h.reset();
  for (let i = 0; i < 7; i += 1) h.bucket.put(`uploads/u1/f${i}.pdf`, h.ago(48 * HOUR));
  h.bucket.put("converted/u1/c.pdf", h.ago(48 * HOUR)).put("files/1_x.pdf", h.ago(48 * HOUR));
  const first = await run({ orphanPageSize: 2, orphanMaxScanned: 4 });
  assert.ok(first.scanned >= 4 && first.pagesRead >= 2);
  assert.ok(h.state(ORPHAN_STATE_DOC).lastName || h.state(ORPHAN_STATE_DOC).prefixIndex > 0, "checkpoint persisted");
  let runs = 1;
  while (h.bucket.names().length && runs < 10) { runs += 1; await run({ orphanPageSize: 2, orphanMaxScanned: 4 }); }
  assert.strictEqual(h.bucket.names().length, 0, "every object was eventually visited");
});

test("20. a failing listing page does not advance the checkpoint, so nothing is skipped; the next run retries the same page", async () => {
  h.reset();
  for (let i = 0; i < 4; i += 1) h.bucket.put(`uploads/u1/f${i}.pdf`, h.ago(48 * HOUR));
  h.bucket.failNextList(503);
  const bad = await run({ orphanPageSize: 2 });
  assert.strictEqual(bad.listErrors, 1);
  assert.strictEqual(h.bucket.names().length, 4);
  const ok = await run({ orphanPageSize: 2 });
  assert.strictEqual(ok.listErrors, 0);
  assert.strictEqual(h.bucket.names().length, 0);
});

test("a deletion that fails is counted, kept, and retried on a later sweep (not silently skipped)", async () => {
  h.reset();
  h.bucket.put("uploads/u1/a.pdf", h.ago(48 * HOUR)).put("uploads/u1/b.pdf", h.ago(48 * HOUR));
  h.bucket.failDelete("uploads/u1/a.pdf", 503);
  const c = await run();
  assert.strictEqual(c.failed, 1);
  assert.deepStrictEqual(h.bucket.names(), ["uploads/u1/a.pdf"]);
  h.bucket.clearFailures();
  await run();
  await run(); // second run starts the next sweep
  assert.strictEqual(h.bucket.names().length, 0);
});

test("21. an upload that is finalised while a batch is being deleted keeps its object (race window closed by the recent-jobs re-check)", async () => {
  h.reset();
  h.bucket.put("uploads/u1/racy.pdf", h.ago(48 * HOUR)).put("uploads/u1/plain.pdf", h.ago(48 * HOUR));
  // a customer finalises "racy.pdf" AFTER the reference index was built but BEFORE the delete batch runs
  const realList = h.bucket.getFiles;
  h.bucket.getFiles = async (q) => {
    await h.db.collection("print_jobs").doc("newjob").set({ status: "pending", fileUrl: h.url("uploads/u1/racy.pdf"), uploadedAt: new Date(NOW - 1000), createdAt: new Date(NOW - 1000) });
    return realList(q);
  };
  const c = await run();
  h.bucket.getFiles = realList;
  assert.strictEqual(h.bucket.has("uploads/u1/racy.pdf"), true);
  assert.strictEqual(h.bucket.has("uploads/u1/plain.pdf"), false);
  assert.strictEqual(c.skipped.referenced_recent, 1);
});

test("22. repeated runs are idempotent, and dry-run mode deletes nothing", async () => {
  h.reset();
  h.bucket.put("uploads/u1/a.pdf", h.ago(48 * HOUR)).put("uploads/u1/b.pdf", h.ago(2 * HOUR));
  const dry = await run({ orphanMode: "dry-run" });
  assert.strictEqual(dry.wouldDelete, 1);
  assert.strictEqual(dry.deleted, 0);
  assert.strictEqual(h.bucket.names().length, 2);
  await run();
  const calls = h.bucket.deleteCalls;
  const again = await run();
  await run();
  assert.deepStrictEqual(h.bucket.names(), ["uploads/u1/b.pdf"]);
  assert.strictEqual(h.bucket.deleteCalls, calls, "no extra delete calls once clean");
  assert.strictEqual(again.failed, 0);
});

test("ORPHAN_CLEANUP_MODE defaults to dry-run unless explicitly set to delete", () => {
  const { defaults } = require("../src/services/storageCleanup.service");
  assert.strictEqual(defaults({}).orphanMode, "dry-run");
  assert.strictEqual(defaults({ ORPHAN_CLEANUP_MODE: "delete" }).orphanMode, "delete");
  assert.strictEqual(defaults({ ORPHAN_CLEANUP_MODE: "yes" }).orphanMode, "dry-run");
});

test("overlapping runs are prevented by the lease", async () => {
  h.reset({ system_state: { [ORPHAN_STATE_DOC]: { leaseUntilMs: NOW + 60e3, leaseRunId: "other" } } });
  h.bucket.put("uploads/u1/a.pdf", h.ago(48 * HOUR));
  const c = await run();
  assert.strictEqual(c.aborted, "lease_held");
  assert.strictEqual(h.bucket.has("uploads/u1/a.pdf"), true);
});
