// Regression test: "Your activity" on the upload page showed ₹0 Spent for real paying users. Root cause:
// getMimoStats only summed the `orders` collection, but a real (non-free) paid order is written to
// `payment_transactions` instead (see payment.controller.js's postCreateOrder) — `orders` only ever gets a
// direct write for the 100%-off/free path. The fix reuses analytics.service.js's normalizeOrders, the same
// merge the admin revenue dashboard already relies on.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

process.env.JWT_SECRET = "mimo-stats-test-secret-at-least-32-chars"; // >= 32 chars (see src/config/env.js)
const fake = createFakeFirestore();
fake.install();
const { getMimoStats } = require("../src/controllers/user.controller");

function response() {
  return { code: 200, body: undefined, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}
const getStats = async (userId) => {
  const res = response();
  await getMimoStats({ user: { userId } }, res);
  return res;
};

test.beforeEach(() => { fake.reset({}); });

test("a real paid order (in payment_transactions, the normal non-free path) counts toward totalSpent", async () => {
  fake.reset({
    payment_transactions: {
      t1: { orderId: "order_1", userId: "u1", amount: 24, status: "INITIATED", createdAt: new Date() },
    },
  });
  // The Cashfree webhook updates the transaction's status to "PAID" on success — simulate that here.
  await fake.db.collection("payment_transactions").doc("t1").update({ status: "PAID" });

  const res = await getStats("u1");
  assert.strictEqual(res.code, 200, JSON.stringify(res.body));
  assert.strictEqual(res.body.totalSpent, 24, "a real paid order must be counted, not silently dropped because it lives in payment_transactions");
});

test("an order still INITIATED (payment not completed) does not count toward totalSpent", async () => {
  fake.reset({
    payment_transactions: {
      t1: { orderId: "order_1", userId: "u1", amount: 24, status: "INITIATED", createdAt: new Date() },
    },
  });
  const res = await getStats("u1");
  assert.strictEqual(res.body.totalSpent, 0);
});

test("a free/coupon order (in `orders`, amount 0) and a real paid order (in payment_transactions) together sum correctly", async () => {
  fake.reset({
    orders: {
      o1: { orderId: "order_free", userId: "u1", amount: 0, status: "PAID", createdAt: new Date() },
    },
    payment_transactions: {
      t1: { orderId: "order_paid", userId: "u1", amount: 50, status: "PAID", createdAt: new Date() },
    },
  });
  const res = await getStats("u1");
  assert.strictEqual(res.body.totalSpent, 50);
});

test("another user's spending is never counted", async () => {
  fake.reset({
    payment_transactions: {
      t1: { orderId: "order_1", userId: "someone-else", amount: 999, status: "PAID", createdAt: new Date() },
    },
  });
  const res = await getStats("u1");
  assert.strictEqual(res.body.totalSpent, 0);
});
