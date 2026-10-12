// getWaPaySuccess: when a WhatsApp Payment Link is confirmed PAID, it must resolve and persist Cashfree's
// real underlying order_id (cfOrderId) onto both the print_jobs doc and the payment_transactions record.
// Regression test for the P0.4/P0.5 refund-target fix: Cashfree assigns a Payment Link's underlying order
// a SEPARATE order_id from our own link_id (confirmed via Cashfree's docs -- GET /links/{id}/orders exists
// specifically because link_id != order_id). Without capturing that id here, autoRefundJob and
// /kiosk/report-failure would call POST /orders/{our-link-id}/refunds, which 404s against the real order.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { installAxiosStub } = require("./helpers/stubAxios");

process.env.WA_APP_SECRET = "unit-test-wa-app-secret";
process.env.JWT_SECRET = "unit-test-jwt-secret-fixture-32-chars"; // must be >= 32 chars (see src/config/env.js)
process.env.CASHFREE_APP_ID = "test_app_id";
process.env.CASHFREE_SECRET_KEY = "test_secret_key";

const fake = createFakeFirestore();
fake.install();
const http = installAxiosStub();
http.on("post", /graph\.facebook\.com/, () => ({ data: {} })); // sendWhatsAppOrderCard notification, irrelevant here

const { getWaPaySuccess } = require("../src/controllers/whatsapp.controller");

function request(orderId) { return { params: { orderId } }; }
function response() { return { send(b) { this.body = b; return this; } }; }

const world = () => ({
  print_jobs: { job1: { userId: "u1", orderId: "WA-ABCD1234", status: "pending", fileName: "doc.pdf", colorMode: "bw", copies: 1, totalCost: 25 } },
  payment_transactions: { t1: { orderId: "WA-ABCD1234", userId: "wa:919876543210", amount: 25, status: "INITIATED" } },
});

test.beforeEach(() => { http.reset(); http.on("post", /graph\.facebook\.com/, () => ({ data: {} })); fake.reset(world()); });

test("resolves the real Cashfree order_id via GET /links/{id}/orders and stores it as cfOrderId", async () => {
  http.on("get", /\/links\/WA-ABCD1234$/, () => ({ data: { link_status: "PAID" } }));
  http.on("get", /\/links\/WA-ABCD1234\/orders$/, () => ({ data: [{ order_id: "CFPay_real_order_123", order_status: "PAID" }] }));

  await getWaPaySuccess(request("WA-ABCD1234"), response());

  assert.strictEqual(fake.data("print_jobs").job1.cfOrderId, "CFPay_real_order_123");
  assert.strictEqual(fake.data("print_jobs").job1.status, "paid");
  const tx = fake.data("payment_transactions").t1;
  assert.strictEqual(tx.cfOrderId, "CFPay_real_order_123");
  assert.strictEqual(tx.status, "PAID");
});

test("if resolving the Cashfree order_id fails, fulfillment still proceeds without cfOrderId (refund will fall back to orderId)", async () => {
  http.on("get", /\/links\/WA-ABCD1234$/, () => ({ data: { link_status: "PAID" } }));
  http.on("get", /\/links\/WA-ABCD1234\/orders$/, () => { throw new Error("network error"); });

  await getWaPaySuccess(request("WA-ABCD1234"), response());

  const job = fake.data("print_jobs").job1;
  assert.strictEqual(job.status, "paid");
  assert.ok(job.printCode);
  assert.strictEqual(job.cfOrderId, undefined);
});

test("an unpaid link does not mark the job paid and never calls the orders-resolution endpoint", async () => {
  http.on("get", /\/links\/WA-ABCD1234$/, () => ({ data: { link_status: "ACTIVE" } }));

  await getWaPaySuccess(request("WA-ABCD1234"), response());

  assert.strictEqual(fake.data("print_jobs").job1.status, "pending");
  assert.strictEqual(http.calls.some((c) => /\/orders$/.test(c.url)), false);
});
