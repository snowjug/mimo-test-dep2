// Phase 1 admin analytics additions (services/analytics.service.js): the `reporting` block, registry-driven
// per-machine rows, problem-machine ranking and issue counts. The existing fields (`current`, `series[].failed`,
// `byKiosk[].completed/failed`) are asserted unchanged because the finance portal reads them.
const { describe, it } = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const A = require("../src/services/analytics.service");
const { DEFAULT_MACHINES } = require("../src/services/machineRegistry.service");

const ist = (s) => new Date(`${s}+05:30`);
const Timestamp = { fromMillis: (ms) => ({ ms }) };
// Filters are ignored on purpose (as in analytics.test.js): range membership is enforced by the service itself
// for issues, and every fixture below is inside the range.
const fakeDb = (data, { failRefundRequests = false } = {}) => ({
  collection: (name) => {
    const q = {
      where: () => q,
      limit: () => q,
      count: () => ({ get: async () => ({ data: () => ({ count: 0 }) }) }),
      get: async () => {
        if (failRefundRequests && name === "refund_requests") throw new Error("boom");
        return { docs: (data[name] || []).map((d) => ({ id: d.id, data: () => d })) };
      },
    };
    return q;
  },
});
const range = A.parseRange({ from: ist("2026-10-01T00:00:00").toISOString(), to: ist("2026-10-02T00:00:00").toISOString(), tzOffset: 330 });
const at = (hhmm) => ist(`2026-10-01T${hhmm}:00`);

const jobs = [
  { id: "j1", orderId: "o1", kioskId: "CV-001", status: "completed", pageCount: 2, createdAt: at("09:00") },
  { id: "j2", orderId: "o2", kioskId: "CV-001", status: "failed", printerStatus: "Printer out of paper", failedAt: at("09:10"), createdAt: at("09:05") },
  // Admin refund of a paid job that never printed: legacy analytics calls it failed; reporting keeps it apart.
  { id: "j3", orderId: "o3", kioskId: "SV-002", status: "refunded", createdAt: at("10:00") },
  // Admin refund that overwrote a timeout failure: still a failure for reporting.
  { id: "j4", orderId: "o4", kioskId: "SV-002", status: "refunded", printerStatus: "Print timeout: Printer not responding (check power/cable)", createdAt: at("11:00") },
  { id: "j5", orderId: "o5", kioskId: "SV-002", status: "paid", createdAt: at("12:00"), customerIssue: { type: "blank", label: "Blank pages", verdict: "needs_proof", reportedAt: at("12:30") } },
];
const data = {
  payment_transactions: [
    { id: "t1", orderId: "o1", amount: 30, status: "PAID", paymentMethod: "upi", createdAt: at("08:59") },
    { id: "t3", orderId: "o3", amount: 10, status: "PAID", refundStatus: "SUCCESS", createdAt: at("09:59") },
  ],
  print_jobs: jobs,
  refund_requests: [
    { id: "r1", orderId: "o2", status: "pending", requestedAt: at("09:20") }, // attached to j2's failure
    { id: "r2", orderId: "o9", status: "pending", amount: 5, requestedAt: at("13:00") },
  ],
};

describe("getAnalytics reporting block", () => {
  it("classifies each job once and keeps refunded-but-never-printed out of the success rate", async () => {
    const out = await A.getAnalytics(fakeDb(data), Timestamp, range, { compare: false });
    const r = out.reporting.jobs;
    assert.deepStrictEqual(
      { total: r.total, successful: r.successful, failed: r.failed, refundedUnprinted: r.refundedUnprinted, inProgress: r.inProgress, abandoned: r.abandoned, unknown: r.unknown },
      { total: 5, successful: 1, failed: 2, refundedUnprinted: 1, inProgress: 1, abandoned: 0, unknown: 0 },
    );
    assert.strictEqual(r.successRate, 33.33, "1 / (1 + 2)");
    assert.strictEqual(r.pages, 2);
    // The legacy definition is untouched (completed / (completed + failed|refunded)) for the finance portal.
    assert.strictEqual(out.current.completedJobs, 1);
    assert.strictEqual(out.current.failedJobs, 3);
    assert.strictEqual(out.current.successRate, 25);
  });

  it("uses net revenue from the trusted summary, with gross and refunds alongside", async () => {
    const out = await A.getAnalytics(fakeDb(data), Timestamp, range, { compare: false });
    assert.deepStrictEqual(out.reporting.revenue, { net: out.current.netRevenue, gross: out.current.revenue, refunded: out.current.refundedAmount, refundCount: out.current.refundCount });
    assert.strictEqual(out.reporting.revenue.net, 30);
    assert.strictEqual(out.reporting.revenue.gross, 40);
    assert.strictEqual(out.reporting.revenue.refunded, 10);
  });

  it("counts deduplicated issues by category and source", async () => {
    const out = await A.getAnalytics(fakeDb(data), Timestamp, range, { compare: false });
    const i = out.reporting.issues;
    assert.strictEqual(i.total, 4, "j2 failure (+ attached refund request r1), j4 timeout, j5 report, r2 payment");
    assert.strictEqual(i.detected, 2);
    assert.strictEqual(i.customerReported, 1);
    assert.strictEqual(i.payment, 1);
    assert.strictEqual(i.partial, false);
    const by = Object.fromEntries(i.byCategory.map((c) => [c.category, c.count]));
    assert.deepStrictEqual(by, { paper: 1, printer: 0, network: 0, payment: 1, print_failure: 1, timeout: 1, machine_pi: 0, ink_toner: 0, other: 0 });
  });

  it("buckets successful, failed and issues by IST hour without touching the legacy series fields", async () => {
    const out = await A.getAnalytics(fakeDb(data), Timestamp, range, { compare: false });
    const row = (h) => out.series.find((s) => s.key === `2026-10-01T${h}`);
    assert.strictEqual(row("09").successful, 1);
    assert.strictEqual(row("09").reportFailed, 1);
    assert.strictEqual(row("09").failed, 1, "legacy failed");
    assert.strictEqual(row("09").issues, 1);
    assert.strictEqual(row("10").failed, 1, "legacy counts the refunded job as failed");
    assert.strictEqual(row("10").reportFailed, 0, "reporting does not");
    assert.strictEqual(row("13").issues, 1, "refund request bucketed by requestedAt");
  });

  it("flags issues as partial when refund requests cannot be read, without failing the response", async () => {
    const out = await A.getAnalytics(fakeDb(data, { failRefundRequests: true }), Timestamp, range, { compare: false });
    assert.strictEqual(out.reporting.issues.partial, true);
    assert.strictEqual(out.reporting.issues.payment, 0);
    assert.strictEqual(out.current.revenue, 40);
  });
});

describe("registry-driven machine rows", () => {
  it("without a registry, byKiosk is seeded from KNOWN_KIOSKS exactly as before", async () => {
    const out = await A.getAnalytics(fakeDb(data), Timestamp, range, { compare: false });
    assert.deepStrictEqual(out.byKiosk.map((k) => k.kioskId), ["CV-001", "SV-002"]);
    assert.deepStrictEqual(out.byKiosk.map((k) => [k.completed, k.failed]), [[1, 1], [0, 2]]);
  });

  it("with the defaulted registry the rows match the legacy ones apart from the added fields", async () => {
    const legacy = await A.getAnalytics(fakeDb(data), Timestamp, range, { compare: false });
    const registry = new Map(Object.entries(DEFAULT_MACHINES).map(([id, m]) => [id, { machineId: id, ...m }]));
    const out = await A.getAnalytics(fakeDb(data), Timestamp, range, { compare: false, machines: registry });
    const strip = (k) => ({ kioskId: k.kioskId, name: k.name, type: k.type, description: k.description, jobs: k.jobs, completed: k.completed, failed: k.failed, pages: k.pages, revenue: k.revenue });
    assert.deepStrictEqual(out.byKiosk.map(strip), legacy.byKiosk.map(strip));
    assert.deepStrictEqual(out.current, legacy.current);
    assert.strictEqual(out.byKiosk[0].shortLabel, "M1");
    assert.strictEqual(out.byKiosk[0].lifecycleStatus, "ACTIVE");
  });

  it("a newly registered machine appears without code changes; decommissioned ones only when they have jobs", async () => {
    const machines = new Map([
      ["CV-001", { name: "MIMO 1.0", status: "ACTIVE" }],
      ["SV-002", { name: "MIMO 2.0", type: "color", status: "DECOMMISSIONED" }],
      ["AB-003", { name: "MIMO 3.0", shortLabel: "M3", status: "PROVISIONING" }],
      ["ZZ-009", { name: "Old", status: "DECOMMISSIONED" }],
    ]);
    const out = await A.getAnalytics(fakeDb(data), Timestamp, range, { compare: false, machines });
    assert.deepStrictEqual(out.byKiosk.map((k) => k.kioskId), ["AB-003", "CV-001", "SV-002"]);
    assert.strictEqual(out.byKiosk[0].shortLabel, "M3");
    assert.strictEqual(out.byKiosk[2].lifecycleStatus, "DECOMMISSIONED");
  });

  it("per-machine reporting counts attempts, failure rate and issues", async () => {
    const out = await A.getAnalytics(fakeDb(data), Timestamp, range, { compare: false });
    const sv = out.byKiosk.find((k) => k.kioskId === "SV-002").reporting;
    assert.deepStrictEqual(sv, { successful: 0, failed: 1, attempts: 1, failureRate: 100, issues: 2, rankable: false });
  });
});

describe("problem machines", () => {
  const job = (id, kioskId, status) => ({ id, kioskId, status, pageCount: 1, createdAtMs: NaN, printOptions: {} });
  const many = (prefix, kioskId, ok, bad) => [
    ...Array.from({ length: ok }, (_, i) => job(`${prefix}ok${i}`, kioskId, "completed")),
    ...Array.from({ length: bad }, (_, i) => job(`${prefix}bad${i}`, kioskId, "failed")),
  ];

  it("ranks only machines with enough attempts, by failure rate then failures", () => {
    const jobsN = A.normalizeJobs([
      ...many("a", "CV-001", 18, 2),  // 10%  (20 attempts)
      ...many("b", "SV-002", 6, 4),   // 40%  (10 attempts)
      ...many("c", "AB-003", 0, 3),   // 100% but only 3 attempts -> not ranked
    ]);
    const b = A.breakdowns({ orders: [], jobs: jobsN }, range);
    assert.deepStrictEqual(b.problemMachines.map((m) => [m.kioskId, m.failureRate, m.attempts]), [["SV-002", 40, 10], ["CV-001", 10, 20]]);
    assert.strictEqual(b.byKiosk.find((k) => k.kioskId === "AB-003").reporting.rankable, false);
    assert.strictEqual(A.MIN_ATTEMPTS_TO_RANK, 10);
  });

  it("is empty when no machine has enough attempts", () => {
    const b = A.breakdowns({ orders: [], jobs: A.normalizeJobs(many("x", "CV-001", 2, 1)) }, range);
    assert.deepStrictEqual(b.problemMachines, []);
  });
});

describe("normalizeJobs reporting evidence", () => {
  it("adds failedAt / printedAt / printCode / verification fields without changing existing ones", () => {
    const [n] = A.normalizeJobs([{ id: "j", status: "completed", pageCount: 3, printCode: "1234", printVerified: true, sheetsVerified: 3, printedAt: new Date(5), failedAt: undefined, customerIssue: "not-an-object" }]);
    assert.strictEqual(n.pages, 3);
    assert.strictEqual(n.printedAtMs, 5);
    assert.ok(Number.isNaN(n.failedAtMs));
    assert.strictEqual(n.printCode, "1234");
    assert.strictEqual(n.printVerified, true);
    assert.strictEqual(n.sheetsVerified, 3);
    assert.strictEqual(n.customerIssue, null);
  });
});
