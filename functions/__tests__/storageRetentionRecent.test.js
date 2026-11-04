// The hourly job sweep used to re-read up to 1,500 print jobs every hour (about 36k Firestore reads a day), almost all
// of them already-cleaned. It now looks only at recently created jobs (fullScan: false) and the trigger runs the
// original whole-collection scan once a day as the safety net. These tests pin: the cost (documents scanned), that
// nothing that needs cleaning is lost, and that a recent-only run never disturbs the full sweep's saved progress.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createHarness, NOW, HOUR } = require("./helpers/cleanupHarness");

process.env.JWT_SECRET = "storage-retention-recent-fixture-secret-32";
const h = createHarness();
const { runJobRetentionPass, isFullScanHour, defaults, JOBS_STATE_DOC } = require("../src/services/storageCleanup.service");

const LOOKBACK = 48 * HOUR;
const pass = (over = {}, nowMs = NOW) => runJobRetentionPass({ db: h.db, admin: h.admin, bucket: h.bucket, nowMs, log: h.silent, config: h.config(over), clock: () => nowMs });
const recent = () => pass({ fullScan: false, jobLookbackMs: LOOKBACK });
const at = (hoursAgo) => new Date(NOW - hoursAgo * HOUR);

test("a recent-only run reads just the last 2 days of jobs, not the whole collection (the cost fix)", async () => {
  h.reset();
  for (let i = 0; i < 100; i++) await h.addJob(`old${i}`, { status: "completed", extra: { fileDeleted: true, createdAt: at(30 * 24) } });
  await h.addJob("new1", { status: "pending", objects: { "uploads/u1/a.pdf": 25 }, extra: { createdAt: at(26) } });
  await h.addJob("new2", { status: "pending", objects: { "uploads/u1/b.pdf": 2 }, extra: { createdAt: at(2) } });
  await h.addJob("new3", { status: "failed", objects: { "uploads/u1/c.pdf": 30 }, extra: { createdAt: at(40) } });
  const c = await recent();
  assert.strictEqual(c.scanned, 3, "only the three recent jobs are read, never the 100 finished old ones");
  assert.strictEqual(h.bucket.has("uploads/u1/a.pdf"), false, "an expired recent job is still cleaned");
  assert.strictEqual(h.bucket.has("uploads/u1/c.pdf"), false);
  assert.strictEqual(h.bucket.has("uploads/u1/b.pdf"), true, "a young file is preserved exactly as before");
});

test("the daily full scan still reaches an old job the recent-only runs never look at", async () => {
  h.reset();
  await h.addJob("ancient", { status: "pending", objects: { "uploads/u1/old.pdf": 400 }, extra: { createdAt: at(20 * 24) } });
  await h.addJob("nodate", { status: "pending", objects: { "uploads/u1/nodate.pdf": 400 } }); // legacy job without createdAt
  const r = await recent();
  assert.strictEqual(r.scanned, 0);
  assert.strictEqual(h.bucket.has("uploads/u1/old.pdf"), true, "recent-only runs deliberately skip it");
  const f = await pass(); // default config = the original full scan
  assert.strictEqual(f.scanned, 2);
  assert.strictEqual(h.bucket.has("uploads/u1/old.pdf"), false, "the full scan cleans it");
  assert.strictEqual(h.bucket.has("uploads/u1/nodate.pdf"), false);
});

test("a recent-only run neither moves the full sweep's cursor nor records a completed sweep", async () => {
  h.reset();
  await h.addJob("new1", { status: "pending", objects: { "uploads/u1/a.pdf": 25 }, extra: { createdAt: at(26) } });
  await h.db.collection("system_state").doc(JOBS_STATE_DOC).set({ jobCursor: "abc123", lastSweepCompletedMs: 111 });
  await recent();
  const st = h.state(JOBS_STATE_DOC);
  assert.strictEqual(st.jobCursor, "abc123", "full-sweep progress is preserved");
  assert.strictEqual(st.lastSweepCompletedMs, 111, "a recent-only run is not a completed full sweep");
  assert.ok(st.lastRunMs, "it still records that it ran");
});

test("a recent-only run still protects paid-unprinted jobs", async () => {
  h.reset();
  await h.addJob("p1", { status: "paid", objects: { "uploads/u1/p.pdf": 90 }, extra: { createdAt: at(30), printCode: "1234", orderId: "o1" } });
  const c = await recent();
  assert.strictEqual(c.skipped.paid_unprinted, 1);
  assert.strictEqual(h.bucket.has("uploads/u1/p.pdf"), true);
});

test("the default configuration is still the original full scan (nothing else changed)", () => {
  assert.strictEqual(defaults().fullScan, true);
  assert.strictEqual(defaults().jobLookbackMs, 48 * HOUR);
});

test("the full scan runs once a day, at 03:00 IST (21:30 UTC the day before) and never at another hour", () => {
  assert.strictEqual(isFullScanHour(new Date("2026-11-05T21:30:00Z")), true);   // 03:00 IST
  assert.strictEqual(isFullScanHour(new Date("2026-11-05T21:59:00Z")), true);   // 03:29 IST
  assert.strictEqual(isFullScanHour(new Date("2026-11-05T20:59:00Z")), false);  // 02:29 IST
  assert.strictEqual(isFullScanHour(new Date("2026-11-05T22:30:00Z")), false);  // 04:00 IST
  assert.strictEqual(isFullScanHour(new Date("2026-11-05T09:00:00Z")), false);
  let fullHours = 0;
  for (let hr = 0; hr < 24; hr++) if (isFullScanHour(new Date(Date.UTC(2026, 10, 5, hr, 30)))) fullHours += 1;
  assert.strictEqual(fullHours, 1, "exactly one full scan per day");
});
