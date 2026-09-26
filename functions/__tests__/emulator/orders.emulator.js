// Integration checks against the REAL Firestore emulator (not part of `npm test`, run with `npm run test:emulator`).
// They exercise what the in-memory fake cannot prove: transactions, batches, FieldValue increments/deletes, dotted-path updates
// and multi-field equality queries, through the real payment code (Cashfree is stubbed, nothing leaves the machine).
const assert = require("node:assert");
const test = require("node:test");
require("../helpers/quiet");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Run through the emulator:  npm run test:emulator");
  process.exit(1);
}
process.env.GCLOUD_PROJECT = "demo-mimo-emulator";
process.env.CASHFREE_ENV = "sandbox";
process.env.JWT_SECRET = "emulator-test-secret";

const { installAxiosStub } = require("../helpers/stubAxios");
const http = installAxiosStub();
const { admin, db } = require("../../src/config/firebase");
const { claimRefund } = require("../../src/services/refund.service");
const payment = require("../../src/controllers/payment.controller");
const { autoRefundJob } = require("../../src/triggers/printJob.triggers");
const { postAdminRefund } = require("../../src/controllers/admin.controller");

const res = () => ({ code: 200, body: undefined, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, sendStatus(c) { this.code = c; return this; } });
const clear = async () => { for (const c of ["users", "print_jobs", "orders", "payment_transactions", "refunds", "refund_requests", "coupons", "mimo_settings"]) { const s = await db.collection(c).get(); await Promise.all(s.docs.map((d) => d.ref.delete())); } };
const delay = () => new Promise((r) => setTimeout(r, 15));

test.beforeEach(async () => {
  http.reset();
  await clear();
  http.on("post", /sandbox\.cashfree\.com\/pg\/orders$/, () => ({ data: { payment_session_id: "sess" } }));
  http.on("post", /\/refunds$/, async () => { await delay(); return { data: { refund_status: "PENDING", cf_refund_id: 1 } }; });
});

test("claimRefund: 8 concurrent claims on one order, exactly one wins (real transaction)", async () => {
  await db.collection("orders").doc("o1").set({ orderId: "order_1", userId: "u1", amount: 25, status: "PAID" });
  const results = await Promise.all(Array.from({ length: 8 }, () => claimRefund(db, db.collection("orders").doc("o1"))));
  assert.strictEqual(results.filter((r) => r.claimed).length, 1);
  assert.strictEqual((await db.collection("orders").doc("o1").get()).data().refundStatus, "PROCESSING");
});

test("one failed print, three refund paths at once: exactly one Cashfree refund, order ends REFUNDED/SUCCESS", async () => {
  await db.collection("orders").doc("o1").set({ orderId: "order_1", userId: "u1", amount: 25, status: "PAID" });
  await db.collection("print_jobs").doc("job1").set({ userId: "u1", orderId: "order_1", status: "failed" });
  const event = { params: { jobId: "job1" }, data: { before: { data: () => ({ status: "printing", orderId: "order_1" }) }, after: { data: () => ({ status: "failed", orderId: "order_1" }) } } };
  const adminRes = res();
  await Promise.all([autoRefundJob.run(event), autoRefundJob.run(event), postAdminRefund({ body: { orderId: "order_1" } }, adminRes)]);
  const refunds = http.calls.filter((c) => /\/refunds$/.test(c.url));
  assert.strictEqual(refunds.length, 1);
  const order = (await db.collection("orders").doc("o1").get()).data();
  assert.strictEqual(order.refundStatus, "SUCCESS");
  assert.ok(!("refundClaimedAt" in order), "the claim field was really deleted");
});

test("create-order (paid, with coins) -> payment-success: real batches, increments and dotted updates", async () => {
  await db.collection("users").doc("u1").set({ email: "u1@example.com", mimo_coins: { balance: 50, total_earned: 50, total_used: 0 } });
  await db.collection("print_jobs").doc("j1").set({ userId: "u1", status: "pending", fileName: "a.pdf", fileUrl: "https://x/a.pdf", pageCount: 10, mimetype: "application/pdf" });
  const created = res();
  await payment.postCreateOrder({ user: { userId: "u1" }, body: { jobIds: ["j1"], printOptions: {}, coinsToUse: 4 } }, created);
  assert.strictEqual(created.code, 200, JSON.stringify(created.body));
  assert.strictEqual(created.body.amount, 26);
  assert.strictEqual((await db.collection("print_jobs").doc("j1").get()).exists, false, "original pending job merged away");
  const jobs = await db.collection("print_jobs").where("orderId", "==", created.body.orderId).get();
  assert.strictEqual(jobs.size, 1);
  assert.strictEqual(jobs.docs[0].data().coinsToDeduct, 4);
  assert.strictEqual((await db.collection("users").doc("u1").get()).data().mimo_coins.balance, 50, "coins only reserved");

  // what /verify-payment does after Cashfree confirms
  const txn = await db.collection("payment_transactions").where("orderId", "==", created.body.orderId).get();
  await txn.docs[0].ref.update({ status: "PAID" });
  const done = res();
  await payment.postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: created.body.orderId } }, done);
  assert.strictEqual(done.code, 200, JSON.stringify(done.body));
  assert.match(done.body.printCode, /^[1-9]\d{3}$/);
  assert.deepStrictEqual((await db.collection("users").doc("u1").get()).data().mimo_coins, { balance: 46, total_earned: 50, total_used: 4 });

  const again = res();
  await payment.postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: created.body.orderId } }, again);
  assert.strictEqual(again.body.printCode, done.body.printCode);
  assert.strictEqual((await db.collection("users").doc("u1").get()).data().mimo_coins.balance, 46, "charged once");
});

test("payment-success refuses an unpaid order against the real database", async () => {
  await db.collection("print_jobs").doc("j1").set({ userId: "u1", status: "pending", orderId: "order_9", fileName: "a.pdf", pageCount: 1 });
  await db.collection("payment_transactions").doc("t1").set({ orderId: "order_9", userId: "u1", status: "INITIATED" });
  const r = res();
  await payment.postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: "order_9" } }, r);
  assert.strictEqual(r.code, 403);
  assert.strictEqual((await db.collection("print_jobs").doc("j1").get()).data().status, "pending");
});

test("free order with a 100% coupon: real batch, coin deduction and unique print code", async () => {
  await db.collection("users").doc("u1").set({ email: "u1@example.com", mimo_coins: { balance: 10, total_earned: 10, total_used: 0 } });
  await db.collection("coupons").doc("ALL").set({ isActive: true, discountPercentage: 100 });
  await db.collection("print_jobs").doc("busy").set({ userId: "u9", status: "paid", printCode: "1234" });
  await db.collection("print_jobs").doc("j1").set({ userId: "u1", status: "pending", fileName: "a.pdf", fileUrl: "https://x/a.pdf", pageCount: 1 });
  const r = res();
  await payment.postCreateOrder({ user: { userId: "u1" }, body: { jobIds: ["j1"], printOptions: {}, couponCode: "ALL", coinsToUse: 2 } }, r);
  assert.strictEqual(r.body.free, true);
  assert.notStrictEqual(r.body.printCode, "1234");
  assert.deepStrictEqual((await db.collection("users").doc("u1").get()).data().mimo_coins, { balance: 8, total_earned: 10, total_used: 2 });
  const order = (await db.collection("orders").where("orderId", "==", r.body.orderId).get()).docs[0].data();
  assert.strictEqual(order.status, "PAID");
});

test("a Cashfree failure writes nothing to the real database", async () => {
  await db.collection("users").doc("u1").set({ mimo_coins: { balance: 10, total_earned: 10, total_used: 0 } });
  await db.collection("print_jobs").doc("j1").set({ userId: "u1", status: "pending", fileName: "a.pdf", fileUrl: "https://x/a.pdf", pageCount: 3 });
  http.reset();
  http.on("post", /sandbox\.cashfree\.com/, () => { throw new Error("down"); });
  const r = res();
  await payment.postCreateOrder({ user: { userId: "u1" }, body: { jobIds: ["j1"], printOptions: {}, coinsToUse: 2 } }, r);
  assert.strictEqual(r.code, 500);
  assert.strictEqual((await db.collection("print_jobs").doc("j1").get()).data().status, "pending");
  assert.strictEqual((await db.collection("payment_transactions").get()).size, 0);
});

test.after(async () => { await clear(); void admin; });
