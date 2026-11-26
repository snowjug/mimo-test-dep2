const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert/strict");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { installAxiosStub } = require("./helpers/stubAxios");

process.env.JWT_SECRET = "pi-pickup-timeout-test-secret-32chars";
process.env.CASHFREE_ENV = "sandbox";
process.env.CASHFREE_APP_ID = "test_app_id";
process.env.CASHFREE_SECRET_KEY = "test_secret_key";

const fake = createFakeFirestore();
fake.install();
const http = installAxiosStub();

const { createKioskRouter } = require("../src/routes/kiosk.routes");
const { isColorJob } = require("../src/services/printJob.service");
const { validateKioskJobStatusResponse } = require("../src/validators/kioskContract");
const { PI_PICKUP_TIMEOUT_MS, PI_PICKUP_TIMEOUT_MESSAGE } = require("../src/services/printTimeout.service");
const { autoRefundJob } = require("../src/triggers/printJob.triggers");
const { CASHFREE_BASE_URL, cashfreeHeaders } = require("../src/config/env");

const router = createKioskRouter({
  db: fake.db,
  admin: fake.admin,
  isColorJob,
  CASHFREE_BASE_URL,
  cashfreeHeaders,
  axios: http,
});
const statusLayer = router.stack.find((l) => l.route && l.route.path === "/job-status" && l.route.methods.get).route.stack;
const getJobStatus = statusLayer[statusLayer.length - 1].handle;

function response() {
  return { code: 200, body: undefined, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}

test.beforeEach(() => {
  fake.reset({});
  http.reset();
});

test("GET /kiosk/job-status keeps waiting within 60s when Pi has not picked up the job", async () => {
  const now = new Date();
  fake.reset({
    print_jobs: {
      j1: {
        printCode: "6844",
        orderId: "ord_6844",
        status: "printing",
        kioskId: "SV-002",
        colorMode: "color",
        pageCount: 1,
        createdAt: now,
        printStartedAt: new Date(Date.now() - (PI_PICKUP_TIMEOUT_MS - 3000)),
      },
    },
  });

  const res = response();
  await getJobStatus({ query: { printCode: "6844" } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.status, "printing");
  assert.equal(res.body.piReceivedAt, null);
  assert.equal(fake.data("print_jobs").j1.status, "printing");
});

test("GET /kiosk/job-status fails at 60s when Pi cannot reach the job and triggers safe auto-refund", async () => {
  const created = new Date();
  fake.reset({
    orders: {
      o1: { orderId: "ord_6844", userId: "u1", amount: 10, status: "PAID" },
    },
    print_jobs: {
      j1: {
        printCode: "6844",
        orderId: "ord_6844",
        userId: "u1",
        status: "printing",
        kioskId: "SV-002",
        colorMode: "color",
        pageCount: 1,
        createdAt: created,
        printStartedAt: new Date(Date.now() - (PI_PICKUP_TIMEOUT_MS + 1000)),
      },
    },
  });
  http.on("post", /\/orders\/ord_6844\/refunds$/, () => ({ data: { refund_status: "PENDING" } }));

  const before = { ...fake.data("print_jobs").j1 };
  const res = response();
  await getJobStatus({ query: { printCode: "6844" } }, res);

  assert.equal(res.code, 200);
  assert.equal(res.body.status, "failed");
  assert.equal(res.body.isPrinted, false);
  assert.equal(res.body.printerStatus, PI_PICKUP_TIMEOUT_MESSAGE);
  assert.equal(validateKioskJobStatusResponse(res.body).valid, true);

  const after = fake.data("print_jobs").j1;
  assert.equal(after.status, "failed");
  assert.equal(after.printerStatus, PI_PICKUP_TIMEOUT_MESSAGE);
  assert.ok(after.failedAt);

  // Transition triggers autoRefundJob safely once
  await autoRefundJob.run({
    params: { jobId: "j1" },
    data: { before: { data: () => before }, after: { data: () => after } },
  });
  const refundCalls = http.calls.filter((c) => c.method === "post" && /\/refunds$/.test(c.url));
  assert.equal(refundCalls.length, 1);
  assert.equal(fake.data("orders").o1.refundStatus, "SUCCESS");

  // Re-polling after failure remains failed cleanly
  const res2 = response();
  await getJobStatus({ query: { printCode: "6844" } }, res2);
  assert.equal(res2.body.status, "failed");
  assert.equal(res2.body.printerStatus, PI_PICKUP_TIMEOUT_MESSAGE);
});

test("GET /kiosk/job-status does NOT kill a job at >60s once Pi has picked it up (piReceivedAt set)", async () => {
  const created = new Date();
  fake.reset({
    print_jobs: {
      j1: {
        printCode: "7777",
        orderId: "ord_7777",
        status: "printing",
        kioskId: "SV-002",
        colorMode: "color",
        pageCount: 2,
        createdAt: created,
        printStartedAt: new Date(Date.now() - 180 * 1000),
        piReceivedAt: new Date(Date.now() - 178 * 1000),
      },
    },
  });

  const res = response();
  await getJobStatus({ query: { printCode: "7777" } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.status, "printing");
  assert.ok(res.body.piReceivedAt);
  assert.equal(fake.data("print_jobs").j1.status, "printing");
});

test("Multi-file session where doc 1 is being printed by Pi does not fail doc 2 at 60s", async () => {
  const created = new Date();
  fake.reset({
    print_jobs: {
      j1: {
        printCode: "8888",
        orderId: "ord_8888",
        status: "printing",
        kioskId: "SV-002",
        colorMode: "color",
        pageCount: 1,
        createdAt: created,
        printStartedAt: new Date(Date.now() - 90 * 1000),
        piReceivedAt: new Date(Date.now() - 88 * 1000),
      },
      j2: {
        printCode: "8888",
        orderId: "ord_8888",
        status: "printing",
        kioskId: "SV-002",
        colorMode: "bw",
        pageCount: 1,
        createdAt: created,
        printStartedAt: new Date(Date.now() - 90 * 1000),
      },
    },
  });

  const res = response();
  await getJobStatus({ query: { printCode: "8888" } }, res);
  assert.equal(res.body.status, "printing");
  assert.equal(fake.data("print_jobs").j1.status, "printing");
  assert.equal(fake.data("print_jobs").j2.status, "printing");
});
