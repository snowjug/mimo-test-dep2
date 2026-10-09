// CHARACTERIZATION TESTS for the customer payment flow: they pin down what the code does TODAY so that
// refactors cannot change money behaviour by accident. A test marked KNOWN RISK documents behaviour that is
// questionable; change it deliberately (and say why in the pull request) when the behaviour is fixed.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { installAxiosStub } = require("./helpers/stubAxios");

process.env.JWT_SECRET = "characterization-test-secret";
delete process.env.GMAIL_APP_PASSWORD; // never try to send e-mail from tests
delete process.env.PORT;

const fake = createFakeFirestore();
fake.install();
const http = installAxiosStub();
const { getVerifyPayment, postPaymentSuccess } = require("../src/controllers/payment.controller");

function response() {
  return {
    code: 200, body: undefined,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    sendStatus(c) { this.code = c; return this; },
  };
}
const ORDER_URL = /\/orders\/order_1$/;
const internalCalls = () => http.calls.filter((c) => c.method === "post" && /\/payment-success$/.test(c.url));

// ───────────────────────── GET /verify-payment/:orderId ─────────────────────────
test.describe("GET /verify-payment/:orderId", () => {
  test.beforeEach(() => {
    http.reset();
    fake.reset({ orders: { o1: { orderId: "order_1", userId: "u1", amount: 25, status: "INITIATED" } } });
    http.on("post", /\/payment-success$/, () => ({ data: { printCode: "4821", directKioskId: "SV-002" } }));
  });

  test("Cashfree says PAID: order is marked PAID and the print code is generated through /payment-success", async () => {
    http.on("get", ORDER_URL, () => ({ data: { order_status: "PAID" } }));
    const res = response();
    await getVerifyPayment({ params: { orderId: "order_1" }, user: { userId: "u1" } }, res);

    assert.deepStrictEqual(res.body, { order_status: "PAID", printCode: "4821", directKioskId: "SV-002" });
    assert.strictEqual(fake.data("orders").o1.status, "PAID");
    const [call] = internalCalls();
    assert.ok(call, "internal /payment-success call made");
    assert.strictEqual(call.body.orderId, "order_1");
    assert.match(call.url, /^http:\/\/localhost:8080\/payment-success$/, "the API calls ITSELF over HTTP (design smell)");
    assert.match(call.config.headers.Authorization, /^Bearer .+\..+\..+$/, "with a freshly minted JWT for the order's user");
  });

  test("Cashfree says the order is still ACTIVE: nothing is marked paid, no code is generated", async () => {
    http.on("get", ORDER_URL, () => ({ data: { order_status: "ACTIVE" } }));
    const res = response();
    await getVerifyPayment({ params: { orderId: "order_1" }, user: { userId: "u1" } }, res);

    assert.deepStrictEqual(res.body, { order_status: "ACTIVE", printCode: null, directKioskId: null });
    assert.strictEqual(fake.data("orders").o1.status, "INITIATED");
    assert.strictEqual(internalCalls().length, 0);
  });

  test("Cashfree unreachable: falls back to the status stored in Firestore", async () => {
    http.on("get", ORDER_URL, () => { throw new Error("timeout"); });
    fake.reset({ orders: { o1: { orderId: "order_1", userId: "u1", amount: 25, status: "PAID" } } });
    const res = response();
    await getVerifyPayment({ params: { orderId: "order_1" }, user: { userId: "u1" } }, res);

    assert.strictEqual(res.body.order_status, "PAID");
    assert.strictEqual(res.body.printCode, "4821");
    assert.strictEqual(internalCalls().length, 1);
  });

  test("unknown order and Cashfree unreachable: reported as CREATED, nothing happens", async () => {
    http.on("get", /.*/, () => { throw new Error("timeout"); });
    const res = response();
    await getVerifyPayment({ params: { orderId: "order_missing" } }, res);
    assert.deepStrictEqual(res.body, { order_status: "CREATED", printCode: null, directKioskId: null });
    assert.strictEqual(internalCalls().length, 0);
  });

  test("a failure inside /payment-success does not fail the verification response (code is simply null)", async () => {
    http.reset();
    http.on("get", ORDER_URL, () => ({ data: { order_status: "PAID" } }));
    http.on("post", /\/payment-success$/, () => { throw new Error("internal failure"); });
    const res = response();
    await getVerifyPayment({ params: { orderId: "order_1" }, user: { userId: "u1" } }, res);
    assert.strictEqual(res.code, 200);
    assert.deepStrictEqual(res.body, { order_status: "PAID", printCode: null, directKioskId: null });
  });

  test("SECURITY: a caller who is not the order's owner is refused with 403 and never sees the print code", async () => {
    http.on("get", ORDER_URL, () => ({ data: { order_status: "PAID" } }));
    const res = response();
    await getVerifyPayment({ params: { orderId: "order_1" }, user: { userId: "someone-else" } }, res);

    assert.strictEqual(res.code, 403);
    assert.strictEqual(res.body.printCode, undefined);
    assert.strictEqual(internalCalls().length, 0, "the internal /payment-success call (which hands out the code) is never made");
    // The order's PAID status is still not advanced past what Cashfree already reported as part of ownership check short-circuit.
    assert.strictEqual(fake.data("orders").o1.status, "INITIATED");
  });
});

// ───────────────────────── POST /payment-success ─────────────────────────
test.describe("POST /payment-success (assigns the 4-digit print code)", () => {
  const job = (over = {}) => ({ userId: "u1", orderId: "order_1", status: "pending", printOptions: {}, ...over });
  const order = (over = {}) => ({ orderId: "order_1", userId: "u1", amount: 25, status: "PAID", ...over });
  const paid = { orders: { o1: order() } }; // the order behind the jobs, marked PAID by /verify-payment or the webhook
  test.beforeEach(() => { http.reset(); });

  test("gives every code-less pending job of the order the SAME 4-digit code and marks it paid for the default kiosk", async () => {
    fake.reset({ print_jobs: { j1: job(), j2: job() }, users: { u1: { email: "a@example.com" } }, ...paid });
    const res = response();
    await postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: "order_1" } }, res);

    assert.strictEqual(res.code, 200);
    assert.match(res.body.printCode, /^[1-9]\d{3}$/);
    assert.strictEqual(res.body.directKioskId, null);
    const jobs = fake.data("print_jobs");
    for (const id of ["j1", "j2"]) {
      assert.strictEqual(jobs[id].status, "paid");
      assert.strictEqual(jobs[id].printCode, res.body.printCode);
      assert.strictEqual(jobs[id].kioskId, "CV-001", "no kiosk chosen -> defaults to CV-001");
      assert.strictEqual(jobs[id].isPrinted, false);
    }
  });

  test("a kiosk chosen in the print options is kept and returned as directKioskId", async () => {
    fake.reset({ print_jobs: { j1: job({ printOptions: { directKioskId: "SV-002" } }) }, ...paid });
    const res = response();
    await postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: "order_1" } }, res);
    assert.strictEqual(res.body.directKioskId, "SV-002");
    assert.strictEqual(fake.data("print_jobs").j1.kioskId, "SV-002");
  });

  test("jobs that already have a code: the existing code is returned and nothing is written (idempotent)", async () => {
    fake.reset({ print_jobs: { j1: job({ status: "paid", printCode: "1111", kioskId: "SV-002" }) } });
    const res = response();
    await postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: "order_1" } }, res);
    assert.deepStrictEqual(res.body, { printCode: "1111", directKioskId: "SV-002" });
    assert.strictEqual(fake.log.writes.length, 0);
  });

  test("no pending or paid jobs: 400", async () => {
    fake.reset({ print_jobs: { j1: job({ status: "completed" }) } });
    const res = response();
    await postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: "order_1" } }, res);
    assert.strictEqual(res.code, 400);
    assert.deepStrictEqual(res.body, { error: "No pending jobs found" });
  });

  test("only the caller's own jobs and only the given order are touched", async () => {
    fake.reset({ print_jobs: {
      mine: job(), otherOrder: job({ orderId: "order_2" }), otherUser: job({ userId: "u2" }),
    }, ...paid });
    const res = response();
    await postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: "order_1" } }, res);
    const jobs = fake.data("print_jobs");
    assert.strictEqual(jobs.mine.status, "paid");
    assert.strictEqual(jobs.otherOrder.status, "pending");
    assert.strictEqual(jobs.otherUser.status, "pending");
  });

  test("a code is refused unless the order behind the jobs is PAID: the job stays pending and nothing is written", async () => {
    const refused = async (orders, jobs = { j1: job() }, body = { orderId: "order_1" }) => {
      fake.reset({ print_jobs: jobs, ...(orders ? { orders } : {}) });
      const res = response();
      await postPaymentSuccess({ user: { userId: "u1" }, body }, res);
      assert.strictEqual(res.code, 403);
      assert.deepStrictEqual(res.body, { error: "Payment has not been confirmed for this order." });
      assert.strictEqual(fake.log.writes.length, 0);
      assert.strictEqual(Object.values(fake.data("print_jobs"))[0].status, "pending");
    };
    await refused(undefined);                                                          // no order record at all
    await refused({ o1: order({ status: "INITIATED" }) });                              // created, not paid
    await refused({ o1: order({ status: "REFUNDED" }) });                               // refunded
    await refused({ o1: order({ userId: "u2" }) });                                     // someone else's paid order
    await refused({ o1: order({ orderId: "order_9" }) });                               // a different order
    await refused({ o1: order() }, { j1: job({ orderId: undefined }) }, {});          // job without an order id
  });

  test("a PAID order in payment_transactions (the gateway path) is accepted, and so is one in orders (free orders)", async () => {
    for (const collection of ["payment_transactions", "orders"]) {
      fake.reset({ print_jobs: { j1: job() }, [collection]: { o1: order() } });
      const res = response();
      await postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: "order_1" } }, res);
      assert.strictEqual(res.code, 200, collection);
      assert.match(res.body.printCode, /^[1-9]\d{3}$/);
    }
  });

  test("all orders behind a multi-order call must be paid, otherwise nothing is issued", async () => {
    fake.reset({ print_jobs: { a: job(), b: job({ orderId: "order_2" }) }, orders: { o1: order(), o2: order({ orderId: "order_2", status: "INITIATED" }) } });
    const res = response();
    await postPaymentSuccess({ user: { userId: "u1" }, body: {} }, res);
    assert.strictEqual(res.code, 403);
    assert.strictEqual(fake.log.writes.length, 0);
  });

  test("KNOWN RISK: print codes are random 4-digit numbers with no uniqueness check across users", async () => {
    // 9 000 possible codes; two customers can receive the same code. The kiosk disambiguates by status/kiosk only.
    fake.reset({ print_jobs: { j1: job() }, ...paid });
    const res = response();
    await postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: "order_1" } }, res);
    const codeQueries = fake.log.writes.filter((w) => w.type === "update");
    assert.strictEqual(codeQueries.length, 1);
    assert.ok(!fake.log.writes.some((w) => w.path.startsWith("print_codes/")), "no code registry exists");
  });
});
