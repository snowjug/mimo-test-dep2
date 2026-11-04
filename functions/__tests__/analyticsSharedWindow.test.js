// One dashboard load asks for many date windows. They must share ONE read of the recent data (cost), and every
// window must still contain exactly what a direct range query would (correctness), falling back to the old
// per-window read whenever the shared one could be incomplete.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

process.env.JWT_SECRET = "shared-window-test-secret-fixture-32-chars";
const fake = createFakeFirestore();
fake.install();
const A = require("../src/services/analytics.service");
const { clearScanCache } = require("../src/utils/scanCache");

const Timestamp = fake.admin.firestore.Timestamp;
const DAY = 24 * 3600e3;
const NOW = Date.parse("2026-11-05T09:00:00Z");
const dayStart = Math.floor(NOW / DAY) * DAY;
const ago = (days) => new Date(dayStart - days * DAY + 3600e3);

// The scan cache is off under `node --test`; switch it on for these tests only (same trick as scanCache.test.js).
function withCache(fn) {
  return async () => {
    const saved = { ctx: process.env.NODE_TEST_CONTEXT, env: process.env.NODE_ENV };
    delete process.env.NODE_TEST_CONTEXT;
    process.env.NODE_ENV = "development";
    clearScanCache();
    try { await fn(); } finally {
      clearScanCache();
      if (saved.ctx === undefined) delete process.env.NODE_TEST_CONTEXT; else process.env.NODE_TEST_CONTEXT = saved.ctx;
      if (saved.env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved.env;
    }
  };
}

function seed(extra = {}) {
  const orders = {}; const txns = {}; const jobs = {}; const refunds = {};
  for (let d = 0; d < 40; d++) {
    orders[`o${d}`] = { orderId: `o${d}`, createdAt: ago(d), amount: 10 };
    txns[`t${d}`] = { orderId: `t${d}`, createdAt: ago(d), amount: 5 };
    jobs[`j${d}a`] = { createdAt: ago(d), status: "completed" };
    jobs[`j${d}b`] = { createdAt: ago(d), status: "failed" };
    if (d % 7 === 0) refunds[`r${d}`] = { orderId: `o${d}`, initiatedAt: ago(d), amount: 10 };
  }
  jobs.noDate = { status: "completed" };                              // no createdAt: a range query never returns it
  jobs.stringDate = { createdAt: "2026-11-01", status: "completed" }; // not a Timestamp: same
  fake.reset({ orders, payment_transactions: txns, print_jobs: jobs, refunds, ...extra });
}

const WINDOWS = [
  ["today", dayStart, dayStart + DAY],
  ["yesterday", dayStart - DAY, dayStart],
  ["last 7 days", dayStart - 6 * DAY, dayStart + DAY],
  ["previous 7 days", dayStart - 13 * DAY, dayStart - 6 * DAY],
  ["last 30 days", dayStart - 29 * DAY, dayStart + DAY],
  ["previous 30 days", dayStart - 44 * DAY, dayStart - 29 * DAY],
];
const ids = (w) => ({
  orders: w.orders.map((d) => d.id).sort(), txns: w.txns.map((d) => d.id).sort(),
  jobs: w.jobs.map((d) => d.id).sort(), refunds: w.refunds.map((d) => d.id).sort(),
});

test("six different windows cost ONE shared read (4 queries), not six", withCache(async () => {
  seed();
  const before = fake.log.reads;
  for (const [, from, to] of WINDOWS) await A.loadWindow(fake.db, Timestamp, from, to, NOW);
  assert.strictEqual(fake.log.reads - before, 4, "orders + transactions + jobs + refunds, read once");
}));

test("each window holds exactly what a direct range query returns", withCache(async () => {
  seed();
  for (const [name, from, to] of WINDOWS) {
    const shared = await A.loadWindow(fake.db, Timestamp, from, to, NOW);
    const direct = await A.loadWindowUncached(fake.db, Timestamp, from, to);
    assert.deepStrictEqual(ids(shared), ids(direct), `window "${name}" differs from a direct read`);
    assert.strictEqual(shared.truncated, false);
  }
}));

test("documents without a real Timestamp are left out, exactly like the range query leaves them out", withCache(async () => {
  seed();
  const w = await A.loadWindow(fake.db, Timestamp, dayStart - 29 * DAY, dayStart + DAY, NOW);
  assert.ok(!w.jobs.some((j) => j.id === "noDate" || j.id === "stringDate"));
}));

test("a window older than the shared base falls back to its own direct read", withCache(async () => {
  seed();
  const from = dayStart - (A.BASE_WINDOW_DAYS + 20) * DAY;
  const before = fake.log.reads;
  const w = await A.loadWindow(fake.db, Timestamp, from, from + 5 * DAY, NOW);
  assert.strictEqual(fake.log.reads - before, 4, "no shared read: just the 4 queries of its own window");
  const direct = await A.loadWindowUncached(fake.db, Timestamp, from, from + 5 * DAY);
  assert.deepStrictEqual(ids(w), ids(direct));
}));

test("a base read that hit the per-collection cap is never sliced (it could be missing newer documents)", withCache(async () => {
  const jobs = {};
  for (let i = 0; i < A.MAX_DOCS_PER_COLLECTION + 5; i++) jobs[`big${i}`] = { createdAt: ago(1), status: "completed" };
  seed({ print_jobs: jobs });
  const before = fake.log.reads;
  const w = await A.loadWindow(fake.db, Timestamp, dayStart - DAY, dayStart + DAY, NOW);
  assert.strictEqual(w.truncated, true, "the truncation flag must still reach the dashboard");
  assert.strictEqual(fake.log.reads - before, 8, "shared read (4) + exact per-window fallback (4)");
}));
