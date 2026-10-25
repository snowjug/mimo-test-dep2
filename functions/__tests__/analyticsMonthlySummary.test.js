// getMonthlySummary (services/analytics.service.js): the finance dashboard's month-by-month revenue/refund/
// pages/settlement-reconciliation table, computed fresh from launch (Jan 2026) to the current month every
// time -- zero hardcoded historical numbers. Previously untested (0% coverage on this whole function).
const { describe, it } = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const A = require("../src/services/analytics.service");

const ist = (s) => new Date(`${s}+05:30`);
const Timestamp = { fromMillis: (ms) => ({ ms }) };

// Matches the fake Firestore convention already used in analyticsReporting.test.js: queries ignore their
// own where() filters and return every doc in the collection -- fine here because each test below scopes
// getMonthlySummary to exactly one month (via the now/startYear/startMonth override), so there's only ever
// one query window to satisfy.
const fakeDb = (data) => ({
  collection: (name) => {
    const q = {
      where: () => q,
      limit: () => q,
      get: async () => ({ docs: (data[name] || []).map((d) => ({ id: d.id, data: () => d })), empty: !(data[name] || []).length, forEach(cb) { (data[name] || []).forEach((d) => cb({ data: () => d })); } }),
    };
    return q;
  },
});

describe("getMonthlySummary", () => {
  it("computes gross/refunded/net revenue and page counts for a single month from orders, payments and jobs", async () => {
    const data = {
      orders: [
        { id: "o1", orderId: "o1", userId: "u1", amount: 50, status: "PAID", createdAt: ist("2026-03-05T10:00:00") },
        { id: "o2", orderId: "o2", userId: "u2", amount: 20, status: "PAID", createdAt: ist("2026-03-10T10:00:00") },
      ],
      payment_transactions: [
        { id: "t1", orderId: "o1", amount: 50, status: "PAID", createdAt: ist("2026-03-05T09:59:00") },
        { id: "t2", orderId: "o2", amount: 20, status: "PAID", createdAt: ist("2026-03-10T09:59:00") },
      ],
      print_jobs: [
        { id: "j1", orderId: "o1", status: "completed", pageCount: 4, createdAt: ist("2026-03-05T10:05:00") },
        { id: "j2", orderId: "o2", status: "completed", pageCount: 2, createdAt: ist("2026-03-10T10:05:00") },
      ],
      refunds: [],
    };

    const results = await A.getMonthlySummary(fakeDb(data), Timestamp, {
      now: ist("2026-03-15T00:00:00").getTime(),
      startYear: 2026,
      startMonth: 3,
      includeAuditedIncome: false,
    });

    assert.strictEqual(results.length, 1, "only March 2026 is in range (launch month == current month)");
    const march = results[0];
    assert.strictEqual(march.month, "Mar 2026");
    assert.strictEqual(march.label, "Mar 2026 (M1 - Launch)");
    assert.strictEqual(march.gross, 70, "50 + 20");
    assert.strictEqual(march.refunds, 0);
    assert.strictEqual(march.net, 70);
    assert.strictEqual(march.orders, 2);
    assert.strictEqual(march.pages, 6, "4 + 2 completed-job pages");
    assert.strictEqual(march.settlementStatus, "UNRECONCILED", "no cashfree_settlements docs seeded");
    assert.strictEqual(march.settled, null);
    assert.strictEqual(march.isCurrent, true);
  });

  it("subtracts a refund from gross to get net, and reconciles against cashfree_settlements when present", async () => {
    const data = {
      orders: [
        { id: "o1", orderId: "o1", userId: "u1", amount: 100, status: "PAID", refundAmount: 100, createdAt: ist("2026-03-05T10:00:00") },
      ],
      payment_transactions: [
        { id: "t1", orderId: "o1", amount: 100, status: "PAID", createdAt: ist("2026-03-05T09:59:00") },
      ],
      print_jobs: [],
      refunds: [
        { id: "r1", orderId: "o1", amount: 100, initiatedAt: ist("2026-03-06T10:00:00") },
      ],
      cashfree_settlements: [
        { id: "s1", settlementTimeMs: ist("2026-03-07T10:00:00").getTime(), settlementAmount: 97 },
      ],
    };

    const [march] = await A.getMonthlySummary(fakeDb(data), Timestamp, {
      now: ist("2026-03-15T00:00:00").getTime(),
      startYear: 2026,
      startMonth: 3,
      includeAuditedIncome: false,
    });

    assert.strictEqual(march.gross, 100);
    assert.strictEqual(march.refunds, 100);
    assert.strictEqual(march.net, 0, "fully refunded order nets to zero, never negative");
    assert.strictEqual(march.settlementStatus, "RECONCILED");
    assert.strictEqual(march.settled, 97);
  });

  it("produces one row per month across a multi-month range, each with the right month label", async () => {
    const results = await A.getMonthlySummary(fakeDb({}), Timestamp, {
      now: ist("2026-03-15T00:00:00").getTime(),
      startYear: 2026,
      startMonth: 1,
    });
    assert.deepStrictEqual(results.map((r) => r.month), ["Jan 2026", "Feb 2026", "Mar 2026"]);
    assert.strictEqual(results[0].label, "Jan 2026 (M1 - Launch)");
    assert.strictEqual(results[1].label, "Feb 2026 (M2)");
    assert.strictEqual(results[2].isCurrent, true);
    assert.strictEqual(results[0].isCurrent, false);
    // Audited numbers integrated
    assert.strictEqual(results[0].gross, 152.30, "Jan 2026 audited income");
    assert.strictEqual(results[1].gross, 1472.54, "Feb 2026 audited income");
    assert.strictEqual(results[2].gross, 4070.95, "Mar 2026 audited income");
  });
});
