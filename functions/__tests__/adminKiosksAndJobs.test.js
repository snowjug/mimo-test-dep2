// Closes a pre-existing gap the fleet-architecture audit found: getAdminKiosks and getAdminJobs had zero test
// coverage, before or after the registry work, despite being the two admin-dashboard endpoints that changed
// the most (shortLabel, locationName, lifecycleStatus, liveState, destinationShortLabel all added here).
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

process.env.JWT_SECRET = "admin-kiosks-jobs-test-secret-fixture-32"; // must be >= 32 chars (see src/config/env.js)
const fake = createFakeFirestore();
fake.install();
const { getAdminKiosks, getAdminJobs } = require("../src/controllers/adminInsights.controller");

function response() {
  return { code: 200, body: undefined, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}
const kiosks = async (query = {}) => { const res = response(); await getAdminKiosks({ query }, res); return res; };
const jobs = async (query = {}) => { const res = response(); await getAdminJobs({ query }, res); return res; };

test("getAdminKiosks with no registry seeded returns exactly CV-001 and SV-002 with defaulted registry fields", async () => {
  fake.reset({});
  const res = await kiosks();
  assert.strictEqual(res.code, 200);
  const byId = Object.fromEntries(res.body.kiosks.map((k) => [k.kioskId, k]));
  assert.deepStrictEqual(Object.keys(byId).sort(), ["CV-001", "SV-002"]);
  assert.strictEqual(byId["CV-001"].name, "MIMO 1.0");
  assert.strictEqual(byId["CV-001"].shortLabel, "M1");
  assert.strictEqual(byId["CV-001"].lifecycleStatus, "ACTIVE");
  assert.strictEqual(byId["CV-001"].liveState, "OFFLINE"); // no system_status heartbeat seeded
  assert.strictEqual(byId["SV-002"].locationName, "Central Library");
});

test("getAdminKiosks picks up a registry-only third machine alongside the defaults, unmodified", async () => {
  fake.reset({
    machines: { "CV-003": { name: "MIMO 3.0", status: "ACTIVE", shortLabel: "M3", locationId: "jain-university" } },
    locations: { "jain-university": { name: "Jain University" } },
    system_status: { "CV-003": { lastSeen: new Date() } },
  });
  const res = await kiosks();
  const byId = Object.fromEntries(res.body.kiosks.map((k) => [k.kioskId, k]));
  assert.deepStrictEqual(Object.keys(byId).sort(), ["CV-001", "CV-003", "SV-002"]);
  assert.strictEqual(byId["CV-003"].shortLabel, "M3");
  assert.strictEqual(byId["CV-003"].locationName, "Jain University");
  assert.strictEqual(byId["CV-003"].liveState, "AVAILABLE");
  // CV-001/SV-002 must be completely unaffected by CV-003 existing.
  assert.strictEqual(byId["CV-001"].name, "MIMO 1.0");
  assert.strictEqual(byId["SV-002"].name, "MIMO 2.0");
});

test("getAdminKiosks reflects a machine put into MAINTENANCE in the registry", async () => {
  fake.reset({ machines: { "SV-002": { status: "MAINTENANCE" } } });
  const res = await kiosks();
  const sv002 = res.body.kiosks.find((k) => k.kioskId === "SV-002");
  assert.strictEqual(sv002.lifecycleStatus, "MAINTENANCE");
  assert.strictEqual(sv002.liveState, "MAINTENANCE");
  // The merge is additive: fields not overridden (name/type/description) still come from the default.
  assert.strictEqual(sv002.name, "MIMO 2.0");
});

test("getAdminJobs includes destinationShortLabel from the registry's shortLabel, falling back to the id slice", async () => {
  fake.reset({
    print_jobs: {
      j1: { kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "a.pdf", pageCount: 1 },
      j2: { kioskId: "ZZ-999", userId: "u1", status: "completed", createdAt: new Date(), fileName: "b.pdf", pageCount: 1 },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  const byId = Object.fromEntries(res.body.jobs.map((j) => [j.id, j]));
  assert.strictEqual(byId.j1.destinationShortLabel, "M1");
  assert.strictEqual(byId.j2.destinationShortLabel, "ZZ", "an id with no registry entry falls back to its own first two letters");
});

// Read cost: unfiltered calls (the dashboards' default) must read only `limit` jobs and count the rest, not
// every job in the range. Five jobs today, newest first: j5 (now) ... j1 (4 min ago).
const fiveJobsToday = () => Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`j${i}`, {
  kioskId: "CV-001", userId: "u1", status: i === 2 ? "failed" : "completed",
  createdAt: new Date(Date.now() - (5 - i) * 60000), fileName: `${i}.pdf`, pageCount: 1,
}]));

test("getAdminJobs without filters returns only the newest `limit` jobs and the full count as total", async () => {
  fake.reset({ print_jobs: fiveJobsToday() });
  const res = await jobs({ limit: "2" });
  assert.strictEqual(res.code, 200);
  assert.deepStrictEqual(res.body.jobs.map((j) => j.id), ["j5", "j4"]);
  assert.strictEqual(res.body.total, 5);
  assert.strictEqual(res.body.truncated, true);
});

test("getAdminJobs with a status filter still filters the whole range and reports the filtered total", async () => {
  fake.reset({ print_jobs: fiveJobsToday() });
  const res = await jobs({ status: "failed" });
  assert.strictEqual(res.code, 200);
  assert.deepStrictEqual(res.body.jobs.map((j) => j.id), ["j2"]);
  assert.strictEqual(res.body.total, 1);
  assert.strictEqual(res.body.truncated, false);
});

test("getAdminJobs without filters and a limit above the range size returns every job, untruncated", async () => {
  fake.reset({ print_jobs: fiveJobsToday() });
  const res = await jobs();
  assert.deepStrictEqual(res.body.jobs.map((j) => j.id), ["j5", "j4", "j3", "j2", "j1"]);
  assert.strictEqual(res.body.total, 5);
  assert.strictEqual(res.body.truncated, false);
});

test("getAdminJobs accurately retrieves printCode directly from job without order fallback and preserves leading zeroes", async () => {
  fake.reset({
    print_jobs: {
      j1: { kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "a.pdf", pageCount: 1, printCode: "0421", finalCost: 10 },
      j2: { kioskId: "CV-001", userId: "u2", status: "completed", createdAt: new Date(), fileName: "b.pdf", pageCount: 1, printCode: null, finalCost: 10 },
      // Multiple jobs sharing one order-level code
      j_multi_1: { orderId: "ord_multi", kioskId: "CV-001", userId: "u3", status: "completed", createdAt: new Date(), fileName: "doc1.pdf", pageCount: 2, printCode: "0099", finalCost: 10 },
      j_multi_2: { orderId: "ord_multi", kioskId: "CV-001", userId: "u3", status: "completed", createdAt: new Date(), fileName: "doc2.pdf", pageCount: 3, printCode: "0099", finalCost: 15 },
      // Job with no printCode on job document, even if order had one (fallback removed!)
      j_no_code: { orderId: "ord_legacy", kioskId: "CV-001", userId: "u4", status: "completed", createdAt: new Date(), fileName: "doc3.pdf", pageCount: 1, finalCost: 5 },
    },
    orders: {
      o_legacy: { orderId: "ord_legacy", userId: "u4", printCode: "1234", amount: 5, status: "PAID" },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  const byId = Object.fromEntries(res.body.jobs.map((j) => [j.id, j]));

  // Exact job-specific retrieval with leading zeroes preserved
  assert.strictEqual(byId.j1.printCode, "0421", "Preserves leading zeroes on printCode string");
  // Missing printCode on job -> null (Unavailable)
  assert.strictEqual(byId.j2.printCode, null, "Returns null when printCode is missing/unassigned");
  // Multiple jobs sharing one order-level code
  assert.strictEqual(byId.j_multi_1.printCode, "0099", "Job 1 has shared order code");
  assert.strictEqual(byId.j_multi_2.printCode, "0099", "Job 2 has shared order code");
  // No order.printCode fallback: returns null because write path only writes to print_jobs
  assert.strictEqual(byId.j_no_code.printCode, null, "Does not fallback to orders.printCode");
});

test("getAdminJobs handles payment status and refund precedence correctly", async () => {
  fake.reset({
    print_jobs: {
      j_paid: { orderId: "ord_paid", kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "paid.pdf", pageCount: 1 },
      j_refunded: { orderId: "ord_refunded", kioskId: "CV-001", userId: "u2", status: "completed", createdAt: new Date(), fileName: "ref.pdf", pageCount: 1 },
      j_pending_ref: { orderId: "ord_pend", kioskId: "CV-001", userId: "u3", status: "failed", createdAt: new Date(), fileName: "pend.pdf", pageCount: 1 },
      j_no_status: { kioskId: "CV-001", userId: "u4", status: "completed", createdAt: new Date(), fileName: "nostatus.pdf", pageCount: 1 },
    },
    orders: {
      o_paid: { orderId: "ord_paid", status: "PAID", amount: 10 },
      // Successfully refunded order whose order.status remains PAID, but refundStatus is SUCCESS
      o_refunded: { orderId: "ord_refunded", status: "PAID", orderStatus: "refunded", refundStatus: "SUCCESS", amount: 10 },
      // Pending refund order
      o_pend: { orderId: "ord_pend", status: "PAID", refundStatus: "PENDING", amount: 10 },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  const byId = Object.fromEntries(res.body.jobs.map((j) => [j.id, j]));

  // Paid without refund
  assert.strictEqual(byId.j_paid.paymentStatus, "PAID");
  // Refunded order whose status remains PAID displays REFUNDED
  assert.strictEqual(byId.j_refunded.paymentStatus, "REFUNDED", "Refund precedence overrides PAID order status");
  // Pending refund displays REFUND_PENDING
  assert.strictEqual(byId.j_pending_ref.paymentStatus, "REFUND_PENDING");
  // Missing status information displays null (UI displays Unavailable)
  assert.strictEqual(byId.j_no_status.paymentStatus, null);
});

test("getAdminJobs merges orders and payment_transactions by exact orderId", async () => {
  fake.reset({
    print_jobs: {
      // Order exists in orders with missing amount, but matching payment_transactions has amount
      j_split: { orderId: "ord_split", kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "split.pdf", pageCount: 2, printCode: "5555" },
      // 100% Free order with recorded amount zero
      j_free: { orderId: "ord_free", kioskId: "CV-001", userId: "u2", status: "completed", createdAt: new Date(), fileName: "free.pdf", pageCount: 1, printCode: "7777" },
    },
    orders: {
      o_split: { orderId: "ord_split", couponCode: "SAVE10", discountPercentage: 10, amount: null, status: "PAID" },
      o_free: { orderId: "ord_free", couponCode: "FREE100", discountPercentage: 100, amount: 0, coinsUsed: 20, status: "PAID" },
    },
    payment_transactions: {
      tx_split: { orderId: "ord_split", amount: 18, status: "PAID" },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  const byId = Object.fromEntries(res.body.jobs.map((j) => [j.id, j]));

  // Split: orders gave couponCode + discountPercentage, payment_transactions gave amount 18
  assert.strictEqual(byId.j_split.actualAmountPaid, 18, "Amount merged from payment_transactions when orders.amount is null");
  assert.strictEqual(byId.j_split.couponCode, "SAVE10");
  assert.strictEqual(byId.j_split.couponDiscountPercentage, 10);
  assert.strictEqual(byId.j_split.paymentStatus, "PAID");

  // Free: recorded amount is exactly 0 (not null or undefined)
  assert.strictEqual(byId.j_free.actualAmountPaid, 0, "Free order preserves recorded amount 0");
  assert.strictEqual(byId.j_free.couponCode, "FREE100");
  assert.strictEqual(byId.j_free.couponDiscountPercentage, 100);
  assert.strictEqual(byId.j_free.coinsUsed, 20);
  assert.strictEqual(byId.j_free.paymentStatus, "PAID (FREE)");
});

test("getAdminJobs provides complete payment breakdown across all coupon and coin scenarios with zero invented values", async () => {
  fake.reset({
    print_jobs: {
      // 1. Standard: No coupon, no coins
      j_std: { orderId: "ord_std", kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "std.pdf", pageCount: 2, finalCost: 10 },
      // 2. Coupon only: gross 20, coupon SAVE5 (discountAmount 5), actual paid 15
      j_coup: { orderId: "ord_coup", kioskId: "CV-001", userId: "u2", status: "completed", createdAt: new Date(), fileName: "coup.pdf", pageCount: 4, finalCost: 15, discount: 5 },
      // 3. Coins only: gross 20, 10 coins used (monetary value NOT recorded in DB), actual paid 15
      j_coins: { orderId: "ord_coins", kioskId: "CV-001", userId: "u3", status: "completed", createdAt: new Date(), fileName: "coins.pdf", pageCount: 4, finalCost: 15, coinsToDeduct: 10 },
      // 4. Coupon + Coins with recorded coin value: gross 30, coupon SAVE5 (discount 5), 10 coins (explicit coinsValue: 5), actual paid 20
      j_both: { orderId: "ord_both", kioskId: "CV-001", userId: "u4", status: "completed", createdAt: new Date(), fileName: "both.pdf", pageCount: 6, finalCost: 20, coinsToDeduct: 10, coinsValue: 5, discount: 5 },
      // 5. Job without order record: no payment transaction exists
      j_no_ord: { kioskId: "CV-001", userId: "u5", status: "pending", createdAt: new Date(), fileName: "unpaid.pdf", pageCount: 1, finalCost: 5 },
    },
    orders: {
      o_std: { orderId: "ord_std", gross: 10, amount: 10, status: "PAID" },
      o_coup: { orderId: "ord_coup", gross: 20, amount: 15, couponCode: "SAVE5", status: "PAID" },
      o_coins: { orderId: "ord_coins", gross: 20, amount: 15, coinsUsed: 10, status: "PAID" },
      o_both: { orderId: "ord_both", gross: 30, amount: 20, couponCode: "SAVE5", coinsUsed: 10, coinsValue: 5, status: "PAID" },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  const byId = Object.fromEntries(res.body.jobs.map((j) => [j.id, j]));

  // Standard
  assert.strictEqual(byId.j_std.recordedOriginalAmount, 10);
  assert.strictEqual(byId.j_std.actualAmountPaid, 10);
  assert.strictEqual(byId.j_std.couponCode, null);
  assert.strictEqual(byId.j_std.couponDiscountPercentage, null);
  assert.strictEqual(byId.j_std.couponDiscountAmount, null);
  assert.strictEqual(byId.j_std.coinsUsed, null);
  assert.strictEqual(byId.j_std.coinsValue, null);
  assert.strictEqual(byId.j_std.paymentStatus, "PAID");

  // Coupon only
  assert.strictEqual(byId.j_coup.recordedOriginalAmount, 20);
  assert.strictEqual(byId.j_coup.actualAmountPaid, 15);
  assert.strictEqual(byId.j_coup.couponCode, "SAVE5");
  assert.strictEqual(byId.j_coup.couponDiscountAmount, 5);
  assert.strictEqual(byId.j_coup.coinsUsed, null);
  assert.strictEqual(byId.j_coup.coinsValue, null);

  // Coins only (monetary value NOT recorded -> must be null, never guessed!)
  assert.strictEqual(byId.j_coins.recordedOriginalAmount, 20);
  assert.strictEqual(byId.j_coins.actualAmountPaid, 15);
  assert.strictEqual(byId.j_coins.couponCode, null);
  assert.strictEqual(byId.j_coins.couponDiscountAmount, null);
  assert.strictEqual(byId.j_coins.coinsUsed, 10);
  assert.strictEqual(byId.j_coins.coinsValue, null, "Coins monetary value is null when not recorded in DB, never assumed @ 0.5");

  // Both with recorded coin value
  assert.strictEqual(byId.j_both.recordedOriginalAmount, 30);
  assert.strictEqual(byId.j_both.actualAmountPaid, 20);
  assert.strictEqual(byId.j_both.couponCode, "SAVE5");
  assert.strictEqual(byId.j_both.couponDiscountAmount, 5);
  assert.strictEqual(byId.j_both.coinsUsed, 10);
  assert.strictEqual(byId.j_both.coinsValue, 5);

  // No order: actualAmountPaid is null, never inferred from job cost!
  assert.strictEqual(byId.j_no_ord.recordedOriginalAmount, null);
  assert.strictEqual(byId.j_no_ord.actualAmountPaid, null, "actualAmountPaid is null when order is missing, never inferred from job cost");
  assert.strictEqual(byId.j_no_ord.paymentStatus, null);
});

test("getAdminJobs maintains strict cross-customer and cross-order data isolation", async () => {
  fake.reset({
    print_jobs: {
      j_u1: { orderId: "ord_1", kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(Date.now() - 1000), fileName: "u1.pdf", pageCount: 1, finalCost: 15, printCode: "1111" },
      j_u2: { orderId: "ord_2", kioskId: "CV-001", userId: "u2", status: "completed", createdAt: new Date(Date.now() - 2000), fileName: "u2.pdf", pageCount: 1, finalCost: 20, printCode: "2222" },
      j_u3: { kioskId: "CV-001", userId: "u3", status: "completed", createdAt: new Date(Date.now() - 3000), fileName: "u3.pdf", pageCount: 1, finalCost: 5, printCode: "3333" },
    },
    orders: {
      o1: { orderId: "ord_1", userId: "u1", amount: 15, gross: 25, couponCode: "DISC10", status: "PAID" },
      o2: { orderId: "ord_2", userId: "u2", amount: 20, gross: 20, status: "PAID" },
    },
    users: {
      u1: { name: "Alice", email: "alice@test.com" },
      u2: { name: "Bob", email: "bob@test.com" },
      u3: { name: "Charlie", email: "charlie@test.com" },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  const byId = Object.fromEntries(res.body.jobs.map((j) => [j.id, j]));

  // User 1
  assert.strictEqual(byId.j_u1.userName, "Alice");
  assert.strictEqual(byId.j_u1.orderId, "ord_1");
  assert.strictEqual(byId.j_u1.printCode, "1111");
  assert.strictEqual(byId.j_u1.couponCode, "DISC10");
  assert.strictEqual(byId.j_u1.recordedOriginalAmount, 25);
  assert.strictEqual(byId.j_u1.actualAmountPaid, 15);

  // User 2 (not contaminated by u1's coupon or print code)
  assert.strictEqual(byId.j_u2.userName, "Bob");
  assert.strictEqual(byId.j_u2.orderId, "ord_2");
  assert.strictEqual(byId.j_u2.printCode, "2222");
  assert.strictEqual(byId.j_u2.couponCode, null);
  assert.strictEqual(byId.j_u2.recordedOriginalAmount, 20);
  assert.strictEqual(byId.j_u2.actualAmountPaid, 20);

  // User 3 (no order, standalone printCode on job)
  assert.strictEqual(byId.j_u3.userName, "Charlie");
  assert.strictEqual(byId.j_u3.orderId, null);
  assert.strictEqual(byId.j_u3.printCode, "3333");
  assert.strictEqual(byId.j_u3.couponCode, null);
  assert.strictEqual(byId.j_u3.actualAmountPaid, null, "actualAmountPaid is null when order is missing, never inferred from job cost");
  assert.strictEqual(byId.j_u3.cost, 5, "job cost is preserved");
});

// ═══════════════════════════════════════════════════════════════════════════
// SPECIFICATION COVERAGE: 18 SPECIFIC EXPANDED DETAIL SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════

test("Case 1: Valid 4-digit code is retrieved directly from print_jobs", async () => {
  fake.reset({
    print_jobs: {
      j_code: { kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "doc.pdf", pageCount: 1, printCode: "4183" },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.jobs[0].printCode, "4183");
});

test("Case 2: Code with leading zero (e.g. 0412) preserves string format and leading zeroes", async () => {
  fake.reset({
    print_jobs: {
      j_zero: { kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "doc.pdf", pageCount: 1, printCode: "0412" },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.jobs[0].printCode, "0412");
});

test("Case 3: Multiple jobs belonging to same order each display the order's print code", async () => {
  fake.reset({
    print_jobs: {
      j_m1: { orderId: "ord_multi", kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(Date.now() - 1000), fileName: "file1.pdf", pageCount: 1, printCode: "9988" },
      j_m2: { orderId: "ord_multi", kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "file2.pdf", pageCount: 2, printCode: "9988" },
    },
    orders: {
      ord_multi: { orderId: "ord_multi", userId: "u1", amount: 20, status: "PAID" },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  const byId = Object.fromEntries(res.body.jobs.map((j) => [j.id, j]));
  assert.strictEqual(byId.j_m1.printCode, "9988");
  assert.strictEqual(byId.j_m2.printCode, "9988");
  assert.strictEqual(byId.j_m1.orderId, "ord_multi");
  assert.strictEqual(byId.j_m2.orderId, "ord_multi");
});

test("Case 4: Order with recorded original amount resolves totalCost or pricing.jobCost", async () => {
  fake.reset({
    print_jobs: {
      j_tc: { orderId: "ord_tc", kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(Date.now() - 1000), fileName: "tc.pdf", pageCount: 1, totalCost: 13.20 },
      j_jc: { orderId: "ord_jc", kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "jc.pdf", pageCount: 1, pricing: { jobCost: 26.40 } },
    },
    orders: {
      ord_tc: { orderId: "ord_tc", amount: 0, status: "PAID" },
      ord_jc: { orderId: "ord_jc", amount: 20, status: "PAID" },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  const byId = Object.fromEntries(res.body.jobs.map((j) => [j.id, j]));
  assert.strictEqual(byId.j_tc.recordedOriginalAmount, 13.20);
  assert.strictEqual(byId.j_jc.recordedOriginalAmount, 26.40);
});

test("Case 5: Valid coupon percentage with 0 coins yields verified calculated discount amount", async () => {
  fake.reset({
    print_jobs: {
      j_coup: { orderId: "ord_sfk", kioskId: "SV-002", userId: "u1", status: "completed", createdAt: new Date(), fileName: "review.pdf", pageCount: 8, totalCost: 13.20, printCode: "4183" },
    },
    orders: {
      ord_sfk: { orderId: "ord_sfk", couponCode: "SFK", discountPercentage: 100, amount: 0, coinsUsed: 0, status: "PAID" },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  const job = res.body.jobs[0];
  assert.strictEqual(job.printCode, "4183");
  assert.strictEqual(job.recordedOriginalAmount, 13.20);
  assert.strictEqual(job.couponCode, "SFK");
  assert.strictEqual(job.couponDiscountPercentage, 100);
  assert.strictEqual(job.couponDiscountAmount, 13.20);
  assert.strictEqual(job.coinsUsed, 0);
  assert.strictEqual(job.actualAmountPaid, 0);
  assert.strictEqual(job.paymentStatus, "PAID (FREE)");
});

test("Case 6: Coupon percentage with coins used returns null for coupon discount amount when not explicitly stored", async () => {
  fake.reset({
    print_jobs: {
      j_mix: { orderId: "ord_mix", kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "mix.pdf", pageCount: 4, totalCost: 20.00 },
    },
    orders: {
      ord_mix: { orderId: "ord_mix", couponCode: "SAVE10", discountPercentage: 10, amount: 8, coinsUsed: 20, status: "PAID" },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  const job = res.body.jobs[0];
  assert.strictEqual(job.recordedOriginalAmount, 20.00);
  assert.strictEqual(job.couponCode, "SAVE10");
  assert.strictEqual(job.couponDiscountPercentage, 10);
  assert.strictEqual(job.couponDiscountAmount, null, "Discount currency amount is null when coins were also used and discount was not explicitly recorded");
  assert.strictEqual(job.coinsUsed, 20);
});

test("Case 7: Order with zero coins used strictly preserves coinsUsed as 0, not null", async () => {
  fake.reset({
    print_jobs: {
      j_zero_coins: { orderId: "ord_zc", kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "zc.pdf", pageCount: 1, totalCost: 10 },
    },
    orders: {
      ord_zc: { orderId: "ord_zc", amount: 10, coinsUsed: 0, status: "PAID" },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.jobs[0].coinsUsed, 0, "coinsUsed: 0 is strictly preserved as numeric 0 to indicate customer chose not to use coins");
});

test("Case 8: Order with positive recorded coin count preserves coinsUsed as integer", async () => {
  fake.reset({
    print_jobs: {
      j_coins5: { orderId: "ord_c5", kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "c5.pdf", pageCount: 1, totalCost: 10 },
    },
    orders: {
      ord_c5: { orderId: "ord_c5", amount: 7.5, coinsUsed: 5, status: "PAID" },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.jobs[0].coinsUsed, 5);
});

test("Case 9: Coin monetary value missing returns null, never inferred", async () => {
  fake.reset({
    print_jobs: {
      j_nocoinval: { orderId: "ord_ncv", kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "ncv.pdf", pageCount: 1, totalCost: 10 },
    },
    orders: {
      ord_ncv: { orderId: "ord_ncv", amount: 7.5, coinsUsed: 5, status: "PAID" },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.jobs[0].coinsValue, null, "coinsValue is null when not explicitly saved in Firestore; never guessed at ₹0.50/coin");
});

test("Case 10: Paid order with matching payment transaction displays actualAmountPaid and PAID status", async () => {
  fake.reset({
    print_jobs: {
      j_paid_tx: { orderId: "ord_tx_paid", kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "paid.pdf", pageCount: 2, totalCost: 22.40 },
    },
    orders: {
      ord_tx_paid: { orderId: "ord_tx_paid", amount: 22.40, status: "PAID" },
    },
    payment_transactions: {
      tx_1: { orderId: "ord_tx_paid", amount: 22.40, status: "PAID" },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.jobs[0].actualAmountPaid, 22.40);
  assert.strictEqual(res.body.jobs[0].paymentStatus, "PAID");
});

test("Case 11: Free order with actual amount zero displays actualAmountPaid 0 and paymentStatus PAID (FREE)", async () => {
  fake.reset({
    print_jobs: {
      j_free: { orderId: "ord_free_zero", kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "free.pdf", pageCount: 1, totalCost: 10 },
    },
    orders: {
      ord_free_zero: { orderId: "ord_free_zero", amount: 0, status: "PAID", couponCode: "FREE100" },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.jobs[0].actualAmountPaid, 0);
  assert.strictEqual(res.body.jobs[0].paymentStatus, "PAID (FREE)");
});

test("Case 12: Successful refund displays paymentStatus REFUNDED with refund precedence over order status PAID", async () => {
  fake.reset({
    print_jobs: {
      j_ref: { orderId: "ord_ref", kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "ref.pdf", pageCount: 1, totalCost: 15 },
    },
    orders: {
      ord_ref: { orderId: "ord_ref", amount: 15, status: "PAID", refundStatus: "SUCCESS" },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.jobs[0].paymentStatus, "REFUNDED");
});

test("Case 13: Pending refund displays paymentStatus REFUND_PENDING", async () => {
  fake.reset({
    print_jobs: {
      j_pend_ref: { orderId: "ord_pref", kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "pref.pdf", pageCount: 1, totalCost: 15 },
    },
    orders: {
      ord_pref: { orderId: "ord_pref", amount: 15, status: "PAID", refundStatus: "PENDING" },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.jobs[0].paymentStatus, "REFUND_PENDING");
});

test("Case 14: Partial order doc with matching payment transaction merges payment amount", async () => {
  fake.reset({
    print_jobs: {
      j_partial: { orderId: "ord_partial", kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "part.pdf", pageCount: 2, totalCost: 18 },
    },
    orders: {
      ord_partial: { orderId: "ord_partial", amount: null, status: "PAID" },
    },
    payment_transactions: {
      tx_part: { orderId: "ord_partial", amount: 18, status: "PAID" },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.jobs[0].actualAmountPaid, 18);
  assert.strictEqual(res.body.jobs[0].paymentStatus, "PAID");
});

test("Case 15: Missing payment data displays actualAmountPaid null and paymentStatus null", async () => {
  fake.reset({
    print_jobs: {
      j_orphan: { kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "orphan.pdf", pageCount: 1, totalCost: 10 },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.jobs[0].actualAmountPaid, null);
  assert.strictEqual(res.body.jobs[0].paymentStatus, null);
});

test("Case 16: Strict cross-customer and cross-order isolation", async () => {
  fake.reset({
    print_jobs: {
      j_cust_a: { orderId: "ord_a", kioskId: "CV-001", userId: "user_a", status: "completed", createdAt: new Date(Date.now() - 1000), fileName: "a.pdf", pageCount: 1, printCode: "1111", totalCost: 10 },
      j_cust_b: { orderId: "ord_b", kioskId: "SV-002", userId: "user_b", status: "completed", createdAt: new Date(), fileName: "b.pdf", pageCount: 2, printCode: "2222", totalCost: 20 },
    },
    orders: {
      ord_a: { orderId: "ord_a", userId: "user_a", couponCode: "DISCA", discountPercentage: 50, amount: 5, status: "PAID" },
      ord_b: { orderId: "ord_b", userId: "user_b", amount: 20, status: "PAID" },
    },
    users: {
      user_a: { name: "Alice", email: "alice@mimo.tech" },
      user_b: { name: "Bob", email: "bob@mimo.tech" },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  const byId = Object.fromEntries(res.body.jobs.map((j) => [j.id, j]));
  // Customer A
  assert.strictEqual(byId.j_cust_a.userName, "Alice");
  assert.strictEqual(byId.j_cust_a.printCode, "1111");
  assert.strictEqual(byId.j_cust_a.couponCode, "DISCA");
  assert.strictEqual(byId.j_cust_a.actualAmountPaid, 5);
  // Customer B (must NOT see Customer A's data)
  assert.strictEqual(byId.j_cust_b.userName, "Bob");
  assert.strictEqual(byId.j_cust_b.printCode, "2222");
  assert.strictEqual(byId.j_cust_b.couponCode, null);
  assert.strictEqual(byId.j_cust_b.actualAmountPaid, 20);
});

test("Case 17: Missing print code returns null (displays Unavailable)", async () => {
  fake.reset({
    print_jobs: {
      j_nocode: { kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "nocode.pdf", pageCount: 1 },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.jobs[0].printCode, null);
});

test("Case 18: Missing original pricing data returns null (displays Unavailable)", async () => {
  fake.reset({
    print_jobs: {
      j_noprice: { kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "noprice.pdf", pageCount: 1 },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.jobs[0].recordedOriginalAmount, null);
});
