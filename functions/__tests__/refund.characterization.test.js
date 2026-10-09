// CHARACTERIZATION TESTS for refunds: the automatic refund trigger and the admin refund endpoint.
// They pin down today's behaviour; KNOWN RISK tests document weaknesses and must be flipped on purpose when fixed.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { installAxiosStub } = require("./helpers/stubAxios");

process.env.JWT_SECRET = "characterization-test-secret-fixture-32ch"; // must be >= 32 chars (see src/config/env.js)
process.env.CASHFREE_ENV = "sandbox";

const fake = createFakeFirestore();
fake.install();
const http = installAxiosStub();
const { autoRefundJob } = require("../src/triggers/printJob.triggers");
const { postAdminRefund } = require("../src/controllers/admin.controller");

const REFUND_URL = /\/orders\/([^/]+)\/refunds$/;
const refundCalls = () => http.calls.filter((c) => c.method === "post" && REFUND_URL.test(c.url));
const event = (before, after, jobId = "job1") => ({
  params: { jobId },
  data: { before: { data: () => before }, after: { data: () => after } },
});
const failing = (over = {}) => event({ status: "printing", orderId: "order_1" }, { status: "failed", orderId: "order_1", ...over });
const orders = (over = {}) => ({ orders: { o1: { orderId: "order_1", userId: "u1", amount: 25, status: "PAID", ...over } } });
const delay = () => new Promise((r) => setImmediate(r));

function response() {
  return { code: 200, body: undefined,
    status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; }, sendStatus(c) { this.code = c; return this; } };
}

// ───────────────────────── autoRefundJob (Firestore trigger) ─────────────────────────
test.describe("autoRefundJob: print_jobs/{jobId} becomes `failed`", () => {
  test.beforeEach(() => {
    http.reset();
    fake.reset({ ...orders(), print_jobs: { job1: { status: "failed", orderId: "order_1" } } });
    http.on("post", REFUND_URL, () => ({ data: { refund_status: "PENDING", cf_refund_id: 1 } }));
  });

  test("refunds the FULL order amount through the Cashfree refunds API and marks the order refunded", async () => {
    await autoRefundJob.run(failing());
    const [call] = refundCalls();
    assert.ok(call, "Cashfree refund requested");
    assert.match(call.url, /\/orders\/order_1\/refunds$/);
    assert.strictEqual(call.body.refund_amount, 25);
    assert.strictEqual(call.body.refund_id, "refund_auto_order_1", "derived from the order, so Cashfree can recognise a repeated request");
    assert.match(call.body.refund_note, /job1/);
    const order = fake.data("orders").o1;
    assert.strictEqual(order.refundStatus, "SUCCESS");
    assert.strictEqual(order.refundId, call.body.refund_id);
    assert.ok(order.refundedAt instanceof Date);
    assert.strictEqual(order.refundClaimedAt, undefined, "the temporary claim is cleared");
  });

  test("the print JOB itself stays `failed` — only the order records the refund (the job is not moved to `refunded`)", async () => {
    await autoRefundJob.run(failing());
    assert.strictEqual(fake.data("print_jobs").job1.status, "failed");
    assert.ok(!fake.log.writes.some((w) => w.path === "print_jobs/job1"));
  });

  test("does nothing unless the status CHANGES to failed", async () => {
    await autoRefundJob.run(event({ status: "failed", orderId: "order_1" }, { status: "failed", orderId: "order_1" }));
    await autoRefundJob.run(event({ status: "paid", orderId: "order_1" }, { status: "printing", orderId: "order_1" }));
    assert.strictEqual(refundCalls().length, 0);
  });

  test("a job without orderId is skipped", async () => {
    await autoRefundJob.run(event({ status: "printing" }, { status: "failed" }));
    assert.strictEqual(refundCalls().length, 0);
  });

  test("an order that is not found in `orders` is looked up in `payment_transactions`", async () => {
    fake.reset({ payment_transactions: { t1: { orderId: "order_1", userId: "u1", amount: 40 } } });
    await autoRefundJob.run(failing());
    assert.strictEqual(refundCalls()[0].body.refund_amount, 40);
    assert.strictEqual(fake.data("payment_transactions").t1.refundStatus, "SUCCESS");
  });

  test("an unknown order is skipped", async () => {
    fake.reset({});
    await autoRefundJob.run(failing());
    assert.strictEqual(refundCalls().length, 0);
  });

  test("an order already marked refundStatus SUCCESS is not refunded again", async () => {
    fake.reset(orders({ refundStatus: "SUCCESS" }));
    await autoRefundJob.run(failing());
    assert.strictEqual(refundCalls().length, 0);
  });

  test("a zero-amount (free) order is marked SUCCESS without calling Cashfree", async () => {
    fake.reset(orders({ amount: 0 }));
    await autoRefundJob.run(failing());
    assert.strictEqual(refundCalls().length, 0);
    assert.strictEqual(fake.data("orders").o1.refundStatus, "SUCCESS");
    assert.match(fake.data("orders").o1.refundNote, /Zero amount/);
  });

  test("a Cashfree error records refundStatus FAILED with the reason (no retry, no alert)", async () => {
    http.reset();
    http.on("post", REFUND_URL, () => { throw Object.assign(new Error("bad gateway"), { response: { data: { message: "refund not allowed" } } }); });
    await autoRefundJob.run(failing());
    const order = fake.data("orders").o1;
    assert.strictEqual(order.refundStatus, "FAILED");
    assert.strictEqual(order.refundError, "refund not allowed");
    assert.strictEqual(order.refundId, undefined);
  });

  test("two concurrent deliveries of the same failure reach Cashfree exactly ONCE", async () => {
    http.reset();
    http.on("post", REFUND_URL, async () => { await delay(); return { data: { refund_status: "PENDING" } }; });
    await Promise.all([autoRefundJob.run(failing()), autoRefundJob.run(failing()), autoRefundJob.run(failing())]);
    assert.strictEqual(refundCalls().length, 1);
    assert.strictEqual(fake.data("orders").o1.refundStatus, "SUCCESS");
  });

  test("a redelivery after the refund completed does nothing", async () => {
    await autoRefundJob.run(failing());
    await autoRefundJob.run(failing());
    assert.strictEqual(refundCalls().length, 1);
  });

  test("an order already refunded by an admin or by the kiosk failure report (status REFUNDED) is not refunded again", async () => {
    fake.reset(orders({ status: "REFUNDED", refundAmount: 25 }));
    await autoRefundJob.run(failing());
    assert.strictEqual(refundCalls().length, 0);
  });

  test("a refund that FAILED at the gateway can be retried by a later failure event", async () => {
    http.reset();
    http.on("post", REFUND_URL, () => { throw new Error("gateway down"); });
    await autoRefundJob.run(failing());
    assert.strictEqual(fake.data("orders").o1.refundStatus, "FAILED");
    http.reset();
    http.on("post", REFUND_URL, () => ({ data: { refund_status: "PENDING" } }));
    await autoRefundJob.run(failing());
    assert.strictEqual(refundCalls().length, 1);
    assert.strictEqual(fake.data("orders").o1.refundStatus, "SUCCESS");
  });

  test("a fresh in-progress claim blocks another run; a stale one (crashed run) is taken over", async () => {
    fake.reset(orders({ refundStatus: "PROCESSING", refundClaimedAt: Date.now() }));
    await autoRefundJob.run(failing());
    assert.strictEqual(refundCalls().length, 0);
    fake.reset(orders({ refundStatus: "PROCESSING", refundClaimedAt: Date.now() - 11 * 60 * 1000 }));
    await autoRefundJob.run(failing());
    assert.strictEqual(refundCalls().length, 1);
  });
});

// ───────────────────────── POST /admin/refund ─────────────────────────
test.describe("POST /admin/refund (manual refund by an admin)", () => {
  test.beforeEach(() => {
    http.reset();
    fake.reset({
      ...orders(),
      print_jobs: {
        waiting: { userId: "u1", orderId: "order_1", status: "paid" },
        done: { userId: "u1", orderId: "order_1", status: "completed" },
        busy: { userId: "u1", orderId: "order_1", status: "printing" },
      },
      refund_requests: { r1: { orderId: "order_1", status: "pending" } },
    });
    http.on("post", REFUND_URL, () => ({ data: { refund_status: "SUCCESS", cf_refund_id: 77 } }));
  });
  const call = async (body) => { const res = response(); await postAdminRefund({ body }, res); return res; };

  test("validation: orderId required; unknown order 404; amount must be within (0, original]", async () => {
    assert.strictEqual((await call({})).code, 400);
    assert.strictEqual((await call({ orderId: "nope" })).code, 404);
    assert.strictEqual((await call({ orderId: "order_1", refundAmount: 999 })).code, 400);
    assert.strictEqual((await call({ orderId: "order_1", refundAmount: -1 })).code, 400);
    assert.strictEqual(refundCalls().length, 0);
  });

  test("full refund: Cashfree called, refund recorded, order REFUNDED, unprinted jobs refunded, pending request processed", async () => {
    const res = await call({ orderId: "order_1", note: "customer asked" });
    assert.strictEqual(res.code, 200);
    assert.strictEqual(res.body.refundId, "refund_adm_order_1");
    assert.strictEqual(res.body.cashfreeStatus, "SUCCESS");
    assert.strictEqual(refundCalls()[0].body.refund_amount, 25);

    const refund = fake.data("refunds")[res.body.refundId];
    assert.strictEqual(refund.refundAmount, 25);
    assert.strictEqual(refund.orderId, "order_1");
    const order = fake.data("orders").o1;
    assert.strictEqual(order.status, "REFUNDED");
    assert.strictEqual(order.refundStatus, "SUCCESS");
    assert.strictEqual(order.refundClaimedAt, undefined);
    assert.strictEqual(order.refundAmount, 25);
    const jobs = fake.data("print_jobs");
    assert.strictEqual(jobs.waiting.status, "refunded", "not yet printed -> refunded");
    assert.strictEqual(jobs.done.status, "completed", "already printed -> untouched");
    assert.strictEqual(jobs.busy.status, "printing", "printing -> untouched");
    assert.strictEqual(fake.data("refund_requests").r1.status, "processed");
  });

  test("partial refund uses the requested amount", async () => {
    await call({ orderId: "order_1", refundAmount: 10 });
    assert.strictEqual(refundCalls()[0].body.refund_amount, 10);
    assert.strictEqual(fake.data("orders").o1.refundAmount, 10);
  });

  test("a Cashfree failure returns 502, records no refund and releases the claim so the refund can be retried", async () => {
    http.reset();
    http.on("post", REFUND_URL, () => { throw Object.assign(new Error("x"), { response: { data: { message: "declined" } } }); });
    const res = await call({ orderId: "order_1" });
    assert.strictEqual(res.code, 502);
    assert.match(res.body.error, /declined/);
    assert.deepStrictEqual(fake.data("refunds"), {});
    const order = fake.data("orders").o1;
    assert.strictEqual(order.status, "PAID");
    assert.strictEqual(order.refundStatus, undefined);
    assert.strictEqual(order.refundClaimedAt, undefined);
    http.reset();
    http.on("post", REFUND_URL, () => ({ data: { refund_status: "SUCCESS", cf_refund_id: 1 } }));
    assert.strictEqual((await call({ orderId: "order_1" })).code, 200, "the retry goes through");
  });

  test("an order that is already refunded (by the trigger, the kiosk report or an earlier admin refund) is refused with 409", async () => {
    for (const over of [{ status: "REFUNDED", refundAmount: 25 }, { refundStatus: "SUCCESS" }]) {
      http.reset();
      http.on("post", REFUND_URL, () => ({ data: { refund_status: "SUCCESS" } }));
      fake.reset(orders(over));
      const res = await call({ orderId: "order_1" });
      assert.strictEqual(res.code, 409);
      assert.match(res.body.error, /already been refunded/);
      assert.strictEqual(refundCalls().length, 0);
    }
  });

  test("clicking refund twice at once refunds once: the second request is refused while the first is in flight", async () => {
    http.reset();
    http.on("post", REFUND_URL, async () => { await delay(); return { data: { refund_status: "SUCCESS" } }; });
    const [a, b] = await Promise.all([call({ orderId: "order_1" }), call({ orderId: "order_1" })]);
    assert.deepStrictEqual([a.code, b.code].sort(), [200, 409]);
    assert.strictEqual(refundCalls().length, 1);
  });

  test("the refund id is derived from the order, so a repeat is the same refund, not a new one", async () => {
    await call({ orderId: "order_1", refundAmount: 5 });
    assert.strictEqual(refundCalls()[0].body.refund_id, "refund_adm_order_1");
  });
});
