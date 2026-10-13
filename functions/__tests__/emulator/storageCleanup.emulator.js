// Integration checks against the REAL Firestore emulator (not part of `npm test`, run with `npm run test:emulator`).
// The in-memory fake cannot prove the real query semantics the cleanup relies on: orderBy("__name__") + string cursors,
// equality + document-id ordering without a composite index, range filters on real Timestamps, and transactions (lease).
// Cloud Storage is the in-memory fake bucket; nothing leaves the machine.
const assert = require("node:assert");
const test = require("node:test");
require("../helpers/quiet");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Run through the emulator:  npm run test:emulator");
  process.exit(1);
}
process.env.GCLOUD_PROJECT = "demo-mimo-emulator";
process.env.JWT_SECRET = "emulator-test-secret-fixture-32-chars"; // must be >= 32 chars (see src/config/env.js)

const { admin, db } = require("../../src/config/firebase");
const { createFakeBucket } = require("../helpers/fakeBucket");
const { runJobRetentionPass, runOrphanStoragePass, JOBS_STATE_DOC } = require("../../src/services/storageCleanup.service");

const NOW = Date.now();
const HOUR = 3600e3;
const BUCKET = "test-bucket";
const url = (p) => `https://storage.googleapis.com/${BUCKET}/${p}`;
const silent = { log() {}, error() {}, warn() {} };
const cfg = (o = {}) => ({ retentionMs: 24 * HOUR, jobPageSize: 300, jobMaxScanned: 1500, jobMaxCleaned: 150, orphanPageSize: 250, orphanMaxScanned: 1000, deleteConcurrency: 3, timeBudgetMs: 1e9, orphanMode: "delete", ...o });
const clear = async () => { for (const c of ["print_jobs", "system_state"]) { const s = await db.collection(c).get(); await Promise.all(s.docs.map((d) => d.ref.delete())); } };
const jobsPass = (bucket, over) => runJobRetentionPass({ db, admin, bucket, nowMs: Date.now(), log: silent, config: cfg(over) });

test.beforeEach(clear);

test("real Firestore: the cursor sweep is not starved by hundreds of already-cleaned documents and survives restarts", async () => {
  const bucket = createFakeBucket({}, { name: BUCKET });
  const batch = db.batch();
  for (let i = 0; i < 450; i += 1) batch.set(db.collection("print_jobs").doc(`a${String(i).padStart(4, "0")}`), { userId: "u1", status: "completed", fileDeleted: true });
  await batch.commit();
  bucket.put("uploads/u1/late.pdf", new Date(NOW - 40 * HOUR));
  await db.collection("print_jobs").doc("zz_late").set({ userId: "u1", status: "pending", fileUrl: url("uploads/u1/late.pdf") }); // legacy: no fileDeleted field at all
  let runs = 0;
  while (bucket.has("uploads/u1/late.pdf") && runs < 8) { runs += 1; await jobsPass(bucket, { jobPageSize: 100, jobMaxScanned: 200 }); }
  assert.strictEqual(bucket.has("uploads/u1/late.pdf"), false);
  assert.ok(runs <= 4, `reached in ${runs} bounded runs`);
  const job = (await db.collection("print_jobs").doc("zz_late").get()).data();
  assert.strictEqual(job.fileDeleted, true);
  assert.strictEqual(job.status, "abandoned");
  const state = (await db.collection("system_state").doc(JOBS_STATE_DOC).get()).data();
  assert.ok("jobCursor" in state && state.leaseUntilMs === 0, "cursor persisted and lease released");
});

test("real Firestore: paid jobs and shared objects are protected through the real reference index", async () => {
  const bucket = createFakeBucket({}, { name: BUCKET });
  bucket.put("uploads/u1/paid.pdf", new Date(NOW - 300 * HOUR)).put("uploads/u1/shared.pdf", new Date(NOW - 300 * HOUR)).put("uploads/u1/free.pdf", new Date(NOW - 300 * HOUR));
  await db.collection("print_jobs").doc("paid").set({ userId: "u1", status: "paid", printCode: "1111", fileUrl: url("uploads/u1/paid.pdf"), files: [{ url: url("uploads/u1/shared.pdf") }] });
  await db.collection("print_jobs").doc("failed1").set({ userId: "u2", status: "failed", fileUrl: url("uploads/u1/shared.pdf") });
  await db.collection("print_jobs").doc("failed2").set({ userId: "u2", status: "failed", fileUrl: url("uploads/u1/free.pdf") });
  await jobsPass(bucket);
  assert.deepStrictEqual(bucket.names(), ["uploads/u1/paid.pdf", "uploads/u1/shared.pdf"]);
  assert.strictEqual((await db.collection("print_jobs").doc("paid").get()).data().status, "paid");
  assert.strictEqual((await db.collection("print_jobs").doc("failed1").get()).data().fileDeleted, undefined, "shared object kept, job not marked deleted");
  assert.strictEqual((await db.collection("print_jobs").doc("failed2").get()).data().fileDeleted, true);
});

test("real Firestore: orphan sweep keeps referenced / young objects, uses recent-job re-check with real Timestamps, and resumes", async () => {
  const bucket = createFakeBucket({}, { name: BUCKET });
  for (let i = 0; i < 6; i += 1) bucket.put(`uploads/u1/o${i}.pdf`, new Date(NOW - 48 * HOUR));
  bucket.put("uploads/u1/young.pdf", new Date(NOW - 1 * HOUR)).put("templates/blank_a4.pdf", new Date(NOW - 900 * HOUR));
  await db.collection("print_jobs").doc("p").set({ userId: "u1", status: "pending", fileUrl: url("uploads/u1/o2.pdf") });
  // a job finalised "just now" for o4 (real server timestamp), while the sweep is running
  const realList = bucket.getFiles;
  bucket.getFiles = async (q) => { await db.collection("print_jobs").doc("racy").set({ userId: "u1", status: "pending", fileUrl: url("uploads/u1/o4.pdf"), uploadedAt: admin.firestore.FieldValue.serverTimestamp() }); return realList(q); };
  let runs = 0;
  while (runs < 6) { runs += 1; const c = await runOrphanStoragePass({ db, admin, bucket, nowMs: Date.now(), log: silent, config: cfg({ orphanPageSize: 3, orphanMaxScanned: 3 }) }); if (c.sweepCompleted) break; }
  bucket.getFiles = realList;
  assert.deepStrictEqual(bucket.names(), ["templates/blank_a4.pdf", "uploads/u1/o2.pdf", "uploads/u1/o4.pdf", "uploads/u1/young.pdf"]);
});

test("real Firestore: 8 concurrent lease claims, exactly one wins (real transaction)", async () => {
  const { acquireLease } = require("../../src/services/storageCleanup.service");
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => acquireLease(db, "storage_cleanup_jobs", { nowMs: Date.now(), runId: `r${i}` })));
  assert.strictEqual(results.filter((r) => r.acquired).length, 1);
});
