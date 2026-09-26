// CHARACTERIZATION TESTS for POST /kiosk/report-failure (the Raspberry Pi reports a failed print) and for how it
// cooperates with the failure trigger and the admin refund: one failed print must produce ONE refund, whichever path runs first.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { installAxiosStub } = require("./helpers/stubAxios");

process.env.CASHFREE_ENV = "sandbox";
process.env.INTERNAL_WEBHOOK_SECRET = "test-internal-secret";
const fake = createFakeFirestore();
fake.install();
const http = installAxiosStub();
const { CASHFREE_BASE_URL, cashfreeHeaders } = require("../src/config/env");
const { isColorJob } = require("../src/services/printJob.service");
const { createKioskRouter } = require("../src/routes/kiosk.routes");
const { autoRefundJob } = require("../src/triggers/printJob.triggers");
const { postAdminRefund } = require("../src/controllers/admin.controller");

const router = createKioskRouter({ db: fake.db, admin: fake.admin, isColorJob, CASHFREE_BASE_URL, cashfreeHeaders, axios: http });
const reportFailure = router.stack.find((l) => l.route && l.route.path === "/report-failure" && l.route.methods.post).route.stack[0].handle;

const REFUND_URL = /\/orders\/([^/]+)\/refunds$/;
const refundCalls = () => http.calls.filter((c) => c.method === "post" && REFUND_URL.test(c.url));
const delay = () => new Promise((r) => setImmediate(r));
function response() {
  return { code: 200, body: undefined, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } };
}
const report = async (body) => { const res = response(); await reportFailure({ body: { secret: "test-internal-secret", jobId: "job1", reason: "Paper jam", ...body } }, res); return res; };
const world = ({ job = {}, order = {} } = {}) => ({
  print_jobs: { job1: { userId: "u1", orderId: "order_1", status: "printing", ...job } },
  orders: { o1: { orderId: "order_1", userId: "u1", amount: 25, status: "PAID", ...order } },
});

test.beforeEach(() => {
  http.reset();
  fake.reset(world());
  http.on("post", REFUND_URL, () => ({ data: { refund_status: "PENDING", cf_refund_id: 9 } }));
});

test("the shared internal secret is required and the job must exist", async () => {
  assert.strictEqual((await report({ secret: "wrong" })).code, 403);
  assert.strictEqual((await report({ jobId: undefined })).code, 400);
  assert.strictEqual((await report({ jobId: "ghost" })).code, 404);
  assert.strictEqual(refundCalls().length, 0);
});

test("only jobs that are paid or printing are refundable", async () => {
  for (const status of ["pending", "completed", "failed", "refunded"]) {
    fake.reset(world({ job: { status } }));
    const res = await report({});
    assert.strictEqual(res.body.skipped, true, status);
  }
  assert.strictEqual(refundCalls().length, 0);
});

test("a job that already carries a refund id is skipped", async () => {
  fake.reset(world({ job: { refundId: "r1" } }));
  assert.deepStrictEqual((await report({})).body, { skipped: true, reason: "Already refunded" });
});

test("a free order (amount 0) is marked failed without touching the gateway", async () => {
  fake.reset(world({ order: { amount: 0 } }));
  const res = await report({});
  assert.deepStrictEqual(res.body, { refunded: false, reason: "Free order — no refund needed" });
  assert.strictEqual(fake.data("print_jobs").job1.status, "failed");
  assert.strictEqual(refundCalls().length, 0);
});

test("a paid order is refunded in full: job becomes refunded, order REFUNDED with refundStatus SUCCESS, a refunds record is written", async () => {
  const res = await report({});
  assert.deepStrictEqual(res.body, { refunded: true, refundId: "autorefund_job1", amount: 25, error: null });
  assert.strictEqual(refundCalls()[0].body.refund_amount, 25);
  assert.strictEqual(refundCalls()[0].body.refund_id, "autorefund_job1");
  const job = fake.data("print_jobs").job1;
  assert.deepStrictEqual([job.status, job.refundId, job.autoRefundAttempted, job.printerStatus], ["refunded", "autorefund_job1", true, "Paper jam"]);
  const order = fake.data("orders").o1;
  assert.deepStrictEqual([order.status, order.orderStatus, order.refundStatus, order.refundAmount], ["REFUNDED", "refunded", "SUCCESS", 25]);
  assert.strictEqual(order.refundClaimedAt, undefined);
  const record = fake.data("refunds").autorefund_job1;
  assert.deepStrictEqual([record.refundAmount, record.triggeredBy, record.status, record.jobId], [25, "auto", "PENDING", "job1"]);
});

test("a Cashfree failure marks the job failed and the order FAILED with refundStatus FAILED (so the failure trigger can retry)", async () => {
  http.reset();
  http.on("post", REFUND_URL, () => { throw Object.assign(new Error("x"), { response: { data: { message: "declined" } } }); });
  const res = await report({});
  assert.deepStrictEqual(res.body, { refunded: false, refundId: "autorefund_job1", amount: 25, error: "declined" });
  const job = fake.data("print_jobs").job1;
  assert.deepStrictEqual([job.status, job.refundId, job.autoRefundError], ["failed", null, "declined"]);
  const order = fake.data("orders").o1;
  assert.deepStrictEqual([order.status, order.refundStatus], ["FAILED", "FAILED"]);
  assert.strictEqual(fake.data("refunds").autorefund_job1.status, "CASHFREE_FAILED");
});

test("an order already refunded by an admin is skipped: no second gateway call", async () => {
  fake.reset(world({ order: { status: "REFUNDED", refundAmount: 25 } }));
  const res = await report({});
  assert.deepStrictEqual(res.body, { skipped: true, reason: "Already refunded" });
  assert.strictEqual(refundCalls().length, 0);
});

test("reporting the same failure twice at once refunds once", async () => {
  http.reset();
  http.on("post", REFUND_URL, async () => { await delay(); return { data: { refund_status: "PENDING" } }; });
  const [a, b] = await Promise.all([report({}), report({})]);
  assert.strictEqual(refundCalls().length, 1);
  assert.strictEqual([a, b].filter((r) => r.body.skipped).length, 1);
});

test("ONE failed print, THREE refund paths (Pi report, failure trigger, admin): exactly one refund reaches Cashfree", async () => {
  http.reset();
  http.on("post", REFUND_URL, async () => { await delay(); return { data: { refund_status: "PENDING" } }; });
  const failedEvent = { params: { jobId: "job1" }, data: { before: { data: () => ({ status: "printing", orderId: "order_1" }) }, after: { data: () => ({ status: "failed", orderId: "order_1" }) } } };
  const admin = response();
  await Promise.all([report({}), autoRefundJob.run(failedEvent), postAdminRefund({ body: { orderId: "order_1" } }, admin)]);
  assert.strictEqual(refundCalls().length, 1);
  assert.strictEqual(fake.data("orders").o1.status === "REFUNDED" || fake.data("orders").o1.refundStatus === "SUCCESS", true);
});

test("sequential: the Pi report refunds first, the later failure trigger and an admin click are both refused", async () => {
  await report({});
  const failedEvent = { params: { jobId: "job1" }, data: { before: { data: () => ({ status: "printing", orderId: "order_1" }) }, after: { data: () => ({ status: "failed", orderId: "order_1" }) } } };
  await autoRefundJob.run(failedEvent);
  const admin = response();
  await postAdminRefund({ body: { orderId: "order_1" } }, admin);
  assert.strictEqual(refundCalls().length, 1);
  assert.strictEqual(admin.code, 409);
});
