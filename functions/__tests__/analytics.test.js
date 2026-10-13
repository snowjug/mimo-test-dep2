/**
 * Admin analytics maths (services/analytics.service.js). Pure functions + a fake Firestore for the loader.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const A = require("../src/services/analytics.service");

const IST = 330;
const ist = (s) => new Date(`${s}+05:30`).getTime(); // "2026-09-26T10:00:00" in IST -> epoch ms

describe("parseRange", () => {
  it("defaults to today in the viewer's timezone (IST midnight, not UTC midnight)", () => {
    const now = ist("2026-09-26T01:30:00"); // 20:00 UTC on the 25th, already the 26th in India
    const r = A.parseRange({}, now);
    assert.strictEqual(new Date(r.from).toISOString(), "2026-09-25T18:30:00.000Z");
    assert.strictEqual(r.to - r.from, 24 * 3600 * 1000);
    assert.strictEqual(r.granularity, "hour");
  });
  it("uses day buckets above 2 days and rejects bad input", () => {
    assert.strictEqual(A.parseRange({ from: "2026-09-01T00:00:00Z", to: "2026-09-08T00:00:00Z" }).granularity, "day");
    assert.throws(() => A.parseRange({ from: "nope" }), /Invalid/);
    assert.throws(() => A.parseRange({ from: "2026-09-02T00:00:00Z", to: "2026-09-01T00:00:00Z" }), /after/);
    assert.throws(() => A.parseRange({ from: "2024-01-01T00:00:00Z", to: "2026-01-01T00:00:00Z" }), /exceed/);
    assert.throws(() => A.parseRange({ tzOffset: "9999" }), /tzOffset/);
  });
});

describe("normalizeOrders", () => {
  it("merges orders + payment_transactions by orderId, keeping the strongest status and the payment method", () => {
    const rows = A.normalizeOrders(
      [{ orderId: "o1", userId: "u1", amount: 40, status: "INITIATED", createdAt: new Date("2026-09-26T05:00:00Z") }],
      [{ orderId: "o1", userId: "u1", amount: 40, status: "PAID", paymentMethod: "upi", cashfreePaymentId: 99, createdAt: new Date("2026-09-26T05:00:00Z") }]
    );
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].status, "PAID");
    assert.strictEqual(rows[0].method, "UPI");
    assert.strictEqual(rows[0].gatewayRef, 99);
  });
  it("treats refundStatus SUCCESS as REFUNDED and free orders as Free / Coupon", () => {
    const rows = A.normalizeOrders([
      { orderId: "a", amount: 30, status: "PAID", refundStatus: "SUCCESS" },
      { orderId: "b", amount: 0, status: "PAID" },
    ]);
    assert.strictEqual(rows.find((r) => r.orderId === "a").status, "REFUNDED");
    assert.strictEqual(rows.find((r) => r.orderId === "b").method, "Free / Coupon");
  });
});

describe("summarize / series / breakdowns", () => {
  const day = ist("2026-09-26T00:00:00");
  const orders = A.normalizeOrders([
    { orderId: "o1", userId: "u1", amount: 50, status: "PAID", createdAt: new Date(ist("2026-09-26T10:15:00")) },
    { orderId: "o2", userId: "u2", amount: 20, status: "PAID", refundStatus: "SUCCESS", createdAt: new Date(ist("2026-09-26T10:45:00")) },
    { orderId: "o3", userId: "u3", amount: 15, status: "INITIATED", createdAt: new Date(ist("2026-09-26T11:00:00")) },
    { orderId: "o4", userId: "u4", amount: 0, status: "PAID", createdAt: new Date(ist("2026-09-26T23:30:00")) },
  ]);
  const jobs = A.normalizeJobs([
    { id: "j1", orderId: "o1", kioskId: "CV-001", status: "completed", pageCount: 5, printOptions: { copies: 2, colorMode: "bw" }, createdAt: new Date(ist("2026-09-26T10:16:00")) },
    { id: "j2", orderId: "o2", kioskId: "SV-002", status: "failed", pageCount: 3, printOptions: { colorMode: "color" }, createdAt: new Date(ist("2026-09-26T10:46:00")) },
    { id: "j3", orderId: "o4", kioskId: "SV-002", status: "completed", pageCount: 4, printOptions: { colorMode: "color", doubleSided: "double" }, createdAt: new Date(ist("2026-09-26T23:31:00")) },
  ]);
  const range = { from: day, to: day + 24 * 3600 * 1000, offsetMs: IST * 60000, granularity: "hour" };

  it("computes revenue, refunds, net, success rate and pages", () => {
    const s = A.summarize({ orders, jobs, newUsers: 3 });
    assert.strictEqual(s.revenue, 70);           // o1 + o2 (refunded orders were collected first)
    assert.strictEqual(s.refundedAmount, 20);
    assert.strictEqual(s.netRevenue, 50);
    assert.strictEqual(s.orders, 3);             // o1, o2, o4
    assert.strictEqual(s.freeOrders, 1);
    assert.strictEqual(s.pendingPayments, 1);
    assert.strictEqual(s.pages, 14);             // 5*2 + 4 (failed job not counted)
    assert.strictEqual(s.colorPages, 4);
    assert.strictEqual(s.successRate, 66.67);    // 2 done / (2 done + 1 failed)
    assert.strictEqual(s.newUsers, 3);
  });

  it("buckets by the viewer's local hour and pre-fills empty hours", () => {
    const series = A.buildSeries({ orders, jobs }, range);
    assert.strictEqual(series.length, 24);
    assert.strictEqual(series[10].key, "2026-09-26T10");
    assert.strictEqual(series[10].revenue, 70);
    assert.strictEqual(series[10].refunds, 20);
    assert.strictEqual(series[23].jobs, 1, "23:31 IST lands in hour 23, not the next UTC day");
    assert.strictEqual(series[5].revenue, 0);
  });

  it("always lists both real machines, with revenue attributed through the order's job", () => {
    const b = A.breakdowns({ orders, jobs }, range);
    assert.deepStrictEqual(b.byKiosk.map((k) => k.kioskId), ["CV-001", "SV-002"]);
    assert.strictEqual(b.byKiosk[0].revenue, 50);
    assert.strictEqual(b.byKiosk[1].revenue, 20);
    assert.strictEqual(b.byKiosk[1].failed, 1);
    assert.strictEqual(b.byHour[10].jobs, 2);
    assert.strictEqual(b.modes.color.pages, 4);
    assert.strictEqual(b.modes.duplex.jobs, 1);
  });

  it("shows zero rows (not fake data) for an empty window", () => {
    const b = A.breakdowns({ orders: [], jobs: [] }, range);
    assert.strictEqual(b.byKiosk.length, 2);
    assert.ok(b.byKiosk.every((k) => k.revenue === 0 && k.jobs === 0));
    const s = A.summarize({ orders: [], jobs: [] });
    assert.strictEqual(s.successRate, null, "no finished jobs -> no success rate (not an invented 99.4%)");
  });
});

describe("getAnalytics (fake Firestore)", () => {
  const fakeDb = (data) => ({
    collection: (name) => {
      const q = { where: () => q, limit: () => q, count: () => ({ get: async () => ({ data: () => ({ count: 2 }) }) }), get: async () => ({ docs: (data[name] || []).map((d) => ({ id: d.id, data: () => d })) }) };
      return q;
    },
  });
  const Timestamp = { fromMillis: (ms) => ({ ms }) };

  it("returns current + previous period, series and breakdowns", async () => {
    const range = A.parseRange({ from: "2026-09-26T00:00:00Z", to: "2026-09-27T00:00:00Z", tzOffset: 0 });
    const db = fakeDb({ payment_transactions: [{ id: "t1", orderId: "o1", amount: 25, status: "PAID", paymentMethod: "upi", createdAt: new Date("2026-09-26T03:00:00Z") }], print_jobs: [{ id: "j1", orderId: "o1", kioskId: "CV-001", status: "completed", pageCount: 2, createdAt: new Date("2026-09-26T03:01:00Z") }] });
    const out = await A.getAnalytics(db, Timestamp, range);
    assert.strictEqual(out.current.revenue, 25);
    assert.ok(out.previous && out.previous.summary);
    assert.strictEqual(out.series.length, 24);
    assert.strictEqual(out.byPaymentMethod[0].method, "UPI");
    assert.strictEqual(out.current.newUsers, 2);
    assert.strictEqual(out.metadata.currency, "INR");
    assert.strictEqual(out.metadata.timezone, "Asia/Kolkata");
    assert.strictEqual(out.metadata.settlementDataAvailable, false);
  });
});

describe("Remediated Revenue & Refund Math", () => {
  it("partial refund: only the actual refundAmount is deducted from net collections", () => {
    const orders = A.normalizeOrders([
      { orderId: "p1", amount: 100, status: "PAID", refundAmount: 25, refundStatus: "SUCCESS" },
      { orderId: "p2", amount: 60, status: "PAID" },
    ]);
    assert.strictEqual(orders[0].refundAmount, 25);
    const s = A.summarize({ orders, jobs: [] });
    assert.strictEqual(s.revenue, 160, "Gross collections is full collected amounts");
    assert.strictEqual(s.refundedAmount, 25, "Only the ₹25 partial refund is deducted");
    assert.strictEqual(s.netRevenue, 135, "Net collections is 160 - 25 = 135");
    assert.strictEqual(s.grossCollections, 160);
    assert.strictEqual(s.netCollections, 135);
  });

  it("prior-period refunds do not phantom-inflate current-period gross collections", () => {
    // Order was paid in prior month; in current month, only the refund document is present
    const priorRefunds = A.refundsAsOrders([
      { orderId: "old_order_from_august", userId: "u9", refundAmount: 40, status: "SUCCESS", initiatedAt: new Date("2026-09-26T08:00:00Z") },
    ], new Set()); // not in knownOrderIds of current month

    assert.strictEqual(priorRefunds[0].amount, 0, "No gross collections in current month for old order");
    assert.strictEqual(priorRefunds[0].refundAmount, 40);
    assert.strictEqual(priorRefunds[0].isPriorPeriodRefund, true);

    const currentOrders = A.normalizeOrders([
      { orderId: "new_order_september", amount: 100, status: "PAID", createdAt: new Date("2026-09-26T09:00:00Z") },
    ]);
    currentOrders.push(...priorRefunds);

    const s = A.summarize({ orders: currentOrders, jobs: [] });
    assert.strictEqual(s.revenue, 100, "Gross revenue strictly reflects current period sales (100, not 140)");
    assert.strictEqual(s.refundedAmount, 40, "Prior period refund is recognized as outflow");
    assert.strictEqual(s.netRevenue, 60, "Net cash collections is 100 - 40 = 60");
    assert.strictEqual(s.orders, 1, "Only 1 paid order in current period");
  });

  it("deduplicates orders across orders and payment_transactions while merging richer refund info", () => {
    const orders = A.normalizeOrders(
      [{ orderId: "same_1", amount: 50, status: "PAID" }],
      [{ orderId: "same_1", amount: 50, status: "REFUNDED", refundAmount: 15, paymentMethod: "upi", cashfreePaymentId: "cf_99" }],
      [{ orderId: "same_1", refundAmount: 15, status: "SUCCESS" }]
    );
    assert.strictEqual(orders.length, 1, "Deduplicated to single record");
    assert.strictEqual(orders[0].status, "REFUNDED");
    assert.strictEqual(orders[0].refundAmount, 15);
    assert.strictEqual(orders[0].gatewayRef, "cf_99");
    assert.strictEqual(orders[0].method, "UPI");
  });

  it("audits WhatsApp orders without fabricating gateway collections", () => {
    const jobs = A.normalizeJobs([
      { id: "wj1", orderId: "WA-12345678", status: "completed", totalCost: 28, pageCount: 5 },
      { id: "wj2", orderId: "WA-FREE-001", status: "completed", totalCost: 0, pageCount: 2 },
    ]);
    const s = A.summarize({ orders: [], jobs });
    assert.strictEqual(s.revenue, 0, "No raw print_job is treated as verified gateway revenue without transaction record");
    assert.strictEqual(s.whatsappAudit.totalJobs, 2);
    assert.strictEqual(s.whatsappAudit.confirmedJobs, 1);
    assert.strictEqual(s.whatsappAudit.estimatedJobCost, 28);
    assert.strictEqual(s.whatsappAudit.reconciliationStatus, "unreconciled_gateway_records_missing");
  });

  it("reports data truncation and partial completeness status when document ceiling is reached", () => {
    const s = A.summarize({ orders: [], jobs: [], truncated: true });
    assert.strictEqual(s.completeness, "PARTIAL_RECORDS_TRUNCATED");
  });

  it("supports dateBasis=payment for bucketing based on payment completion rather than creation", () => {
    const range = A.parseRange({ from: "2026-09-26T00:00:00Z", to: "2026-09-27T00:00:00Z", tzOffset: 0, dateBasis: "payment" });
    assert.strictEqual(range.dateBasis, "payment");
    const orders = A.normalizeOrders([
      {
        orderId: "o_late_pay",
        amount: 80,
        status: "PAID",
        createdAt: new Date("2026-09-26T01:00:00Z"),
        paymentDetails: { paidAt: new Date("2026-09-26T05:00:00Z") }
      }
    ]);
    const series = A.buildSeries({ orders, jobs: [] }, range);
    assert.strictEqual(series.find((p) => p.key === "2026-09-26T01").revenue, 0);
    assert.strictEqual(series.find((p) => p.key === "2026-09-26T05").revenue, 80);
  });

  it("retrospective queries: subsequent-period refund does not inflate previous-period refunds in summary when date bounds are provided", () => {
    const orders = A.normalizeOrders([
      {
        orderId: "sep_order",
        amount: 100,
        status: "REFUNDED",
        refundAmount: 100,
        createdAt: new Date("2026-09-15T10:00:00Z"),
        refundedAt: new Date("2026-10-05T10:00:00Z"),
      }
    ]);
    const sepFrom = new Date("2026-09-01T00:00:00Z").getTime();
    const sepTo = new Date("2026-10-01T00:00:00Z").getTime();
    const s = A.summarize({ orders, jobs: [], fromMs: sepFrom, toMs: sepTo });
    assert.strictEqual(s.revenue, 100, "September gross revenue remains ₹100");
    assert.strictEqual(s.refundedAmount, 0, "October refund is not attributed to September summary");
    assert.strictEqual(s.netRevenue, 100, "September net collections remains ₹100");
  });
});
