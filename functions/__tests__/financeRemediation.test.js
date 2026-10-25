const test = require("node:test");
const assert = require("node:assert");
const { toPaise, toRupees, formatINR, sumPaise, subtractPaise, multiplyPaise, allocatePaise } = require("../src/utils/money");
const A = require("../src/services/analytics.service");

test("Money precision — toPaise accurately converts numbers, floats and formatted strings", () => {
  assert.strictEqual(toPaise(0), 0);
  assert.strictEqual(toPaise(12.5), 1250);
  assert.strictEqual(toPaise("19.99"), 1999);
  assert.strictEqual(toPaise("₹1,250.75"), 125075);
  // IEEE 754 precision trap: 1.15 * 100 in vanilla JS is 114.99999999999999
  assert.strictEqual(toPaise(1.15), 115);
  assert.strictEqual(toPaise(null), 0);
  assert.strictEqual(toPaise(undefined), 0);
  assert.strictEqual(toPaise(""), 0);
});

test("Money precision — toRupees converts integer paise to exact 2-decimal rupee floats", () => {
  assert.strictEqual(toRupees(1250), 12.5);
  assert.strictEqual(toRupees(1999), 19.99);
  assert.strictEqual(toRupees(0), 0);
  assert.strictEqual(toRupees(115), 1.15);
});

test("Money precision — formatINR produces formatted Indian Rupee strings", () => {
  const formatted = formatINR(12503.54, false);
  assert.ok(formatted.includes("12,503.54") || formatted.includes("12,503.5"), `Formatted string: ${formatted}`);
  const fromPaise = formatINR(1250354, true);
  assert.ok(fromPaise.includes("12,503.54") || fromPaise.includes("12,503.5"), `From paise: ${fromPaise}`);
});

test("Money precision — allocatePaise distributes integer paise exactly without penny leakage (Hare-Niemeyer method)", () => {
  // Distribute 1000 paise (₹10.00) in 1:1:1 ratio
  const splits3 = allocatePaise(1000, [1, 1, 1]);
  assert.strictEqual(splits3.length, 3);
  assert.strictEqual(splits3.reduce((a, b) => a + b, 0), 1000, "Sum of splits must equal exactly 1000");
  assert.deepStrictEqual(splits3, [334, 333, 333], "Largest remainder awarded to first elements");

  // Distribute 280 paise (₹2.80) across 2 jobs with weights 3 pages and 7 pages
  const splitsWeighted = allocatePaise(280, [3, 7]);
  assert.strictEqual(splitsWeighted.reduce((a, b) => a + b, 0), 280);
  assert.deepStrictEqual(splitsWeighted, [84, 196]); // 280 * 0.3 = 84, 280 * 0.7 = 196
});

test("Phase 10 — Machine Revenue Attribution allocates multi-job orders proportionally across kiosks without Map overwrite", () => {
  const range = { from: 1000000, to: 2000000, offsetMs: 330 * 60000, granularity: "day" };

  // One order "ORD-MULTI-1" paying ₹20.00 (2000 paise), containing 2 jobs on 2 different machines
  const orders = [
    {
      orderId: "ORD-MULTI-1",
      amount: 20.00,
      status: "PAID",
      method: "upi",
      createdAtMs: 1500000,
    },
  ];

  const jobs = [
    {
      id: "JOB-1",
      orderId: "ORD-MULTI-1",
      kioskId: "CV-001",
      pages: 1, // 25% of pages
      status: "completed",
      isPrinted: true,
      createdAtMs: 1500000,
    },
    {
      id: "JOB-2",
      orderId: "ORD-MULTI-1",
      kioskId: "SV-002",
      pages: 3, // 75% of pages
      status: "completed",
      isPrinted: true,
      createdAtMs: 1500000,
    },
  ];

  const res = A.breakdowns({ orders, jobs }, range);
  const cv001 = res.byKiosk.find((k) => k.kioskId === "CV-001");
  const sv002 = res.byKiosk.find((k) => k.kioskId === "SV-002");

  assert.ok(cv001, "CV-001 row exists");
  assert.ok(sv002, "SV-002 row exists");

  // ₹20.00 split 1:3 -> CV-001 gets ₹5.00, SV-002 gets ₹15.00
  assert.strictEqual(cv001.revenue, 5.00, "CV-001 must receive proportional 25% share (₹5.00)");
  assert.strictEqual(sv002.revenue, 15.00, "SV-002 must receive proportional 75% share (₹15.00)");
  assert.strictEqual(res.unassignedRevenue, 0, "No revenue unassigned");
});

test("Phase 10 — Machine Revenue Attribution isolates unassigned revenue when order has no matching job or machine", () => {
  const range = { from: 1000000, to: 2000000, offsetMs: 330 * 60000, granularity: "day" };
  const orders = [
    {
      orderId: "ORD-ORPHAN",
      amount: 45.50,
      status: "PAID",
      method: "card",
      createdAtMs: 1500000,
    },
  ];
  const jobs = [];

  const res = A.breakdowns({ orders, jobs }, range);
  assert.strictEqual(res.unassignedRevenue, 45.50, "Full amount isolated in unassignedRevenue");
});

test("Phase 2 — Launch date constant is January 2026", () => {
  assert.strictEqual(A.LAUNCH_DATE_IST, "2026-01-01");
});
