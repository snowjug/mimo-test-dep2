// The Finance "Refunds & Disputes" list must only offer an order for approval when it has NOT been refunded.
// Regression: rows from the `refunds` collection carry Cashfree's own refund_status, and "PENDING" (refund in
// flight at the bank) used to be shown as a pending request. "Approve All" on those hit "already refunded" 409
// for every order (31 of 31 on 2026-10-22).
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

process.env.JWT_SECRET = "characterization-test-secret-fixture-32ch"; // must be >= 32 chars (see src/config/env.js)
process.env.CASHFREE_ENV = "sandbox";

const fake = createFakeFirestore();
fake.install();
const { getAdminRefundRequests } = require("../src/controllers/admin.controller");

function response() {
  return { code: 200, body: undefined,
    status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}
const list = async () => {
  const res = response();
  await getAdminRefundRequests({ query: {} }, res);
  return res.body.requests;
};

test("a refund Cashfree reports as PENDING is shown as processed, not as an approvable request", async () => {
  fake.reset({
    refunds: { r1: { refundId: "refund_adm_1", orderId: "order_1", refundAmount: 2.8, status: "PENDING", initiatedAt: "2026-10-22T09:00:00.000Z" } },
  });
  const [row] = await list();
  assert.strictEqual(row.orderId, "order_1");
  assert.strictEqual(row.status, "processed");
  assert.strictEqual(row.gatewayStatus, "PENDING");
});

test("a customer refund request with no refund yet stays pending and approvable", async () => {
  fake.reset({
    refund_requests: { q1: { orderId: "order_2", amount: 5.6, status: "pending", requestedAt: "2026-10-22T10:00:00.000Z" } },
  });
  const [row] = await list();
  assert.strictEqual(row.status, "pending");
});

test("an order that already has a refund record is listed once, as the refund", async () => {
  fake.reset({
    refund_requests: { q1: { orderId: "order_3", amount: 2.8, status: "processed", requestedAt: "2026-10-22T08:00:00.000Z" } },
    refunds: { r1: { refundId: "refund_adm_3", orderId: "order_3", refundAmount: 2.8, status: "SUCCESS", initiatedAt: "2026-10-22T09:00:00.000Z" } },
  });
  const rows = await list();
  assert.strictEqual(rows.length, 1);
  assert.notStrictEqual(rows[0].status, "pending");
});
