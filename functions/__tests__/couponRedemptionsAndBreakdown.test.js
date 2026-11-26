const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { installAxiosStub } = require("./helpers/stubAxios");

process.env.JWT_SECRET = "coupon-breakdown-test-secret-32chars";
process.env.CASHFREE_ENV = "sandbox";
process.env.CASHFREE_APP_ID = "test_app_id";
process.env.CASHFREE_SECRET_KEY = "test_secret_key";
delete process.env.GMAIL_APP_PASSWORD;
delete process.env.PORT;

const fake = createFakeFirestore();
fake.install();
const http = installAxiosStub();

const paymentController = require("../src/controllers/payment.controller");
const adminController = require("../src/controllers/admin.controller");
const insightsController = require("../src/controllers/adminInsights.controller");
const whatsappController = require("../src/controllers/whatsapp.controller");

function response() {
  return {
    code: 200,
    body: undefined,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
  };
}

test.beforeEach(() => {
  http.reset();
  http.on("post", /sandbox\.cashfree\.com\/pg\/orders$/, () => ({ data: { payment_session_id: "sess_1" } }));
  http.on("post", /graph\.facebook\.com/, () => ({ data: {} }));
});

test("Website paid order with coupon + MIMO coins records full payment breakdown and increments coupon redemption once upon payment", async () => {
  fake.reset({
    users: {
      u1: { username: "Asha", email: "asha@example.com", mimo_coins: { balance: 20, total_earned: 20, total_used: 0 } },
    },
    coupons: {
      SAVE20: { code: "SAVE20", discountPercentage: 20, isActive: true, maxUses: 10 },
    },
    print_jobs: {
      j1: { userId: "u1", status: "pending", fileName: "notes.pdf", fileUrl: "https://files.example/notes.pdf", mimetype: "application/pdf", pageCount: 10 },
    },
  });

  // 10 B&W pages = ₹28.00 gross; 4 coins = ₹2.00 -> ₹26.00; 20% off -> ₹20.80 paid, ₹5.20 coupon discount
  const createRes = response();
  await paymentController.postCreateOrder(
    { user: { userId: "u1" }, body: { jobIds: ["j1"], printOptions: {}, couponCode: "save20", coinsToUse: 4 } },
    createRes
  );
  assert.strictEqual(createRes.code, 200);
  assert.strictEqual(createRes.body.amount, 20.8);

  // Before payment is confirmed, redemption counter must NOT increment
  assert.strictEqual(fake.data("coupons").SAVE20.usedCount, undefined);

  // Confirm payment and fulfill twice (idempotency check)
  const txn = Object.values(fake.data("payment_transactions"))[0];
  assert.strictEqual(txn.couponCode, "SAVE20");
  assert.strictEqual(txn.discountPercentage, 20);
  assert.strictEqual(txn.discountAmount, 5.2);
  assert.strictEqual(txn.coinsUsed, 4);
  assert.strictEqual(txn.coinsValue, 2);
  assert.strictEqual(txn.gross, 28);

  const txId = Object.keys(fake.data("payment_transactions"))[0];
  await fake.db.collection("payment_transactions").doc(txId).update({ status: "PAID" });

  await paymentController.postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: createRes.body.orderId } }, response());
  await paymentController.postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: createRes.body.orderId } }, response());

  assert.strictEqual(fake.data("coupons").SAVE20.usedCount, 1, "incremented exactly once on paid fulfillment");

  // Verify GET /admin/jobs exposes complete breakdown (serverTimestamp resolves to fakeFirestore's FIXED_NOW)
  const jobsRes = response();
  await insightsController.getAdminJobs({ query: { from: "2025-12-31T00:00:00.000Z", to: new Date(Date.now() + 3600e3).toISOString() } }, jobsRes);
  assert.strictEqual(jobsRes.code, 200);
  const job = jobsRes.body.jobs[0];
  assert.strictEqual(job.recordedOriginalAmount, 28);
  assert.strictEqual(job.couponCode, "SAVE20");
  assert.strictEqual(job.couponDiscountPercentage, 20);
  assert.strictEqual(job.couponDiscountAmount, 5.2);
  assert.strictEqual(job.coinsUsed, 4);
  assert.strictEqual(job.coinsValue, 2);
  assert.strictEqual(job.actualAmountPaid, 20.8);
  assert.strictEqual(job.paymentStatus, "PAID");
});

test("Website free 100%-coupon order increments usedCount and populates GET /admin/coupons and GET /admin/users", async () => {
  fake.reset({
    users: {
      u1: { username: "Kushal", email: "kushal@example.com", mimo_coins: { balance: 15, total_earned: 25, total_used: 10 } },
    },
    coupons: {
      GOD: { code: "GOD", discountPercentage: 100, isActive: true, maxUses: 20 },
    },
    print_jobs: {
      j1: { userId: "u1", status: "pending", fileName: "free.pdf", fileUrl: "https://files.example/free.pdf", mimetype: "application/pdf", pageCount: 2 },
    },
  });

  const createRes = response();
  await paymentController.postCreateOrder(
    { user: { userId: "u1" }, body: { jobIds: ["j1"], printOptions: {}, couponCode: "GOD", coinsToUse: 0 } },
    createRes
  );
  assert.strictEqual(createRes.code, 200);
  assert.strictEqual(createRes.body.free, true);
  assert.strictEqual(fake.data("coupons").GOD.usedCount, 1);

  const couponsRes = response();
  await adminController.getAdminCoupons({}, couponsRes);
  assert.strictEqual(couponsRes.code, 200);
  const god = couponsRes.body.find((c) => c.code === "GOD");
  assert.strictEqual(god.usedCount, 1);
  assert.strictEqual(god.totalDiscountINR, 5.6);
  assert.strictEqual(god.uniqueUsersCount, 1);

  const usersRes = response();
  await adminController.getAdminUsers({}, usersRes);
  assert.strictEqual(usersRes.code, 200);
  assert.deepStrictEqual(usersRes.body.users[0].mimoCoins, { balance: 15, totalEarned: 25, totalUsed: 10 });
  assert.deepStrictEqual(usersRes.body.users[0].couponsUsed, ["GOD"]);
  assert.strictEqual(usersRes.body.users[0].totalDiscountSaved, 5.6);
});

test("GET /admin/users handles users without mimo_coins, gross-only discount fallback, and empty coin fields", async () => {
  fake.reset({
    users: {
      u1: { username: "NoCoins", email: "nocoins@example.com" },
      u2: { username: "ZeroCoins", email: "zero@example.com", mimo_coins: {} },
    },
    orders: {
      o1: { orderId: "ord_gross", userId: "u1", couponCode: "SAVE20", gross: 10, amount: 8, status: "PAID", createdAt: new Date() },
    },
    print_jobs: {
      j1: { userId: "u2", pageCount: 3, couponUsed: "SHEERSH", status: "completed", createdAt: new Date() },
    },
  });

  const usersRes = response();
  await adminController.getAdminUsers({}, usersRes);
  assert.strictEqual(usersRes.code, 200);
  const u1 = usersRes.body.users.find((u) => u.id === "u1");
  const u2 = usersRes.body.users.find((u) => u.id === "u2");
  assert.strictEqual(u1.mimoCoins, null);
  assert.deepStrictEqual(u1.couponsUsed, ["SAVE20"]);
  assert.strictEqual(u1.totalDiscountSaved, 2);
  assert.deepStrictEqual(u2.mimoCoins, { balance: 0, totalEarned: 0, totalUsed: 0 });
  assert.deepStrictEqual(u2.couponsUsed, ["SHEERSH"]);
});

test("GET /admin/coupons and GET /admin/coupons/analytics deduplicate historical orders, txns, and WhatsApp couponUsed jobs", async () => {
  fake.reset({
    coupons: {
      THANKYOUKUSHAL: { code: "THANKYOUKUSHAL", discountPercentage: 20, isActive: true, maxUses: 1 },
      SHEERSH: { code: "SHEERSH", discountPercentage: 15, isActive: true },
      UNUSED: { discountPercentage: 10, isActive: true, usedCount: 2 },
    },
    orders: {
      o1: { orderId: "ord_1", userId: "u1", couponCode: "THANKYOUKUSHAL", discountPercentage: 20, gross: 10, amount: 8, status: "PAID", createdAt: new Date() },
    },
    payment_transactions: {
      // Same order also in payment_transactions -> must not double count!
      t1: { orderId: "ord_1", userId: "u1", couponCode: "THANKYOUKUSHAL", discountPercentage: 20, gross: 10, amount: 8, status: "PAID", createdAt: new Date() },
      // Abandoned checkout -> must NOT count!
      t_abandoned: { orderId: "ord_abandoned", userId: "u2", couponCode: "SHEERSH", discountPercentage: 15, gross: 20, amount: 17, status: "INITIATED", createdAt: new Date() },
    },
    print_jobs: {
      // Historical WhatsApp job with legacy `couponUsed` field
      j_wa: { orderId: "WA-1234", userId: "wa:919999999999", status: "completed", couponUsed: "SHEERSH", totalCost: 8.5, originalCost: 10, createdAt: new Date() },
      // Also pending job -> must NOT count
      j_pend: { orderId: "WA-PEND", userId: "wa:918888888888", status: "pending", couponUsed: "SHEERSH", totalCost: 8.5, createdAt: new Date() },
    },
  });

  const couponsRes = response();
  await adminController.getAdminCoupons({}, couponsRes);
  const byCode = Object.fromEntries(couponsRes.body.map((c) => [c.id, c]));
  assert.strictEqual(byCode.THANKYOUKUSHAL.usedCount, 1);
  assert.strictEqual(byCode.SHEERSH.usedCount, 1);
  assert.strictEqual(byCode.UNUSED.usedCount, 2);
  assert.strictEqual(byCode.UNUSED.totalDiscountINR, 0);
  assert.strictEqual(byCode.UNUSED.uniqueUsersCount, 0);
  assert.strictEqual(byCode.UNUSED.lastRedeemedAt, null);

  const analyticsRes = response();
  await adminController.getAdminCouponsAnalytics({}, analyticsRes);
  const aByCode = Object.fromEntries(analyticsRes.body.couponAnalytics.map((c) => [c.code, c]));
  assert.strictEqual(aByCode.THANKYOUKUSHAL.redemptionCount, 1);
  assert.strictEqual(aByCode.SHEERSH.redemptionCount, 1);
  assert.strictEqual(aByCode.SHEERSH.active, true);
});

test("WhatsApp paid fulfillment (getWaPaySuccess) increments coupon redemption once and historical couponUsed resolves discountPercentage in getAdminJobs", async () => {
  fake.reset({
    coupons: {
      SHEERSH: { code: "SHEERSH", discountPercentage: 15, isActive: true },
    },
    print_jobs: {
      j_wa: { orderId: "WA-5555", userId: "u1", status: "pending", fileName: "DOC-WA.pdf", pageCount: 1, originalCost: 2.8, totalCost: 2.38, couponUsed: "SHEERSH", createdAt: new Date() },
    },
    payment_transactions: {
      t_wa: { orderId: "WA-5555", userId: "wa:919876543210", amount: 2.38, status: "INITIATED" },
    },
  });

  http.on("get", /\/links\/WA-5555$/, () => ({ data: { link_status: "PAID" } }));
  http.on("get", /\/links\/WA-5555\/orders$/, () => ({ data: [{ order_id: "CF_5555", order_status: "PAID" }] }));

  await whatsappController.getWaPaySuccess({ params: { orderId: "WA-5555" } }, response());
  await whatsappController.getWaPaySuccess({ params: { orderId: "WA-5555" } }, response());

  assert.strictEqual(fake.data("coupons").SHEERSH.usedCount, 1);

  const jobsRes = response();
  await insightsController.getAdminJobs({ query: { from: new Date(Date.now() - 3600e3).toISOString(), to: new Date(Date.now() + 3600e3).toISOString() } }, jobsRes);
  const job = jobsRes.body.jobs[0];
  assert.strictEqual(job.couponCode, "SHEERSH");
  assert.strictEqual(job.couponDiscountPercentage, 15);
  assert.strictEqual(job.recordedOriginalAmount, 2.8);
  assert.strictEqual(job.couponDiscountAmount, 0.42);
  assert.strictEqual(job.actualAmountPaid, 2.38);
});

test("postAdminCoupons and deleteAdminCoupons validate input, persist normalized coupon fields, and delete codes", async () => {
  fake.reset({});

  const badRes = response();
  await adminController.postAdminCoupons({ body: { code: "" } }, badRes);
  assert.strictEqual(badRes.code, 400);

  const createRes = response();
  await adminController.postAdminCoupons({
    body: { code: " welcome10 ", discountPercentage: 10, expiryDate: "2027-01-01T00:00:00.000Z", maxUses: 5 },
  }, createRes);
  assert.strictEqual(createRes.code, 200);
  assert.strictEqual(fake.data("coupons").WELCOME10.discountPercentage, 10);
  assert.strictEqual(fake.data("coupons").WELCOME10.maxUses, 5);
  assert.strictEqual(fake.data("coupons").WELCOME10.isActive, true);

  const updateRes = response();
  await adminController.postAdminCoupons({
    body: { code: "WELCOME10", discountPercentage: 15, isActive: false },
  }, updateRes);
  assert.strictEqual(updateRes.code, 200);
  assert.strictEqual(fake.data("coupons").WELCOME10.isActive, false);
  assert.strictEqual(fake.data("coupons").WELCOME10.expiryDate, null);

  const delRes = response();
  await adminController.deleteAdminCoupons({ params: { code: "WELCOME10" } }, delRes);
  assert.strictEqual(delRes.code, 200);
  assert.strictEqual(fake.data("coupons").WELCOME10, undefined);
});
