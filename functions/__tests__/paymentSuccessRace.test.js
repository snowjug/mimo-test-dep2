// Regression test for the race condition fixed in postPaymentSuccess: the read ("is this job already coded? are
// coins already deducted?"), the decision, and the write now all happen inside ONE db.runTransaction, keyed by the
// jobs' orderId, instead of a plain read followed by a separate db.batch() write. Without that, two near-simultaneous
// calls for the SAME order (e.g. the Cashfree webhook and a client's /verify-payment poll landing within
// milliseconds of each other) could both observe "no printCode yet" / "coins not deducted yet" before either one's
// write committed, double-issuing a printCode and double-charging coins.
//
// The default fakeFirestore test double does not model Firestore's optimistic-concurrency abort-and-retry, so it
// cannot by itself prove a fix that depends on it. `createFakeFirestore(seed, { strictTransactions: true })` adds
// that one behaviour (see helpers/fakeFirestore.js): a transaction's writes are queued, and if ANY other write lands
// anywhere in the store while its callback is still running, the whole callback is discarded and re-run with fresh
// reads -- exactly the guarantee real `db.runTransaction` provides and that this fix relies on.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { installAxiosStub } = require("./helpers/stubAxios");

process.env.JWT_SECRET = "race-test-secret";
delete process.env.GMAIL_APP_PASSWORD; // never try to send e-mail from this test
delete process.env.PORT;

const fake = createFakeFirestore({}, { strictTransactions: true });
fake.install();
installAxiosStub();
const { postPaymentSuccess } = require("../src/controllers/payment.controller");

function response() {
  return {
    code: 200, body: undefined,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
  };
}

const call = async () => { const res = response(); await postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: "order_1" } }, res); return res; };

test.beforeEach(() => {
  fake.reset({
    print_jobs: { j1: { userId: "u1", orderId: "order_1", status: "pending", printOptions: {}, coinsToDeduct: 10 } },
    orders: { o1: { orderId: "order_1", userId: "u1", amount: 25, status: "PAID" } },
    users: { u1: { email: "a@example.com", mimo_coins: { balance: 100, total_used: 0 } } },
  });
});

test("two near-simultaneous calls for the same order issue exactly ONE print code and deduct coins exactly ONCE", async () => {
  const r1 = response(), r2 = response();
  await Promise.all([
    postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: "order_1" } }, r1),
    postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: "order_1" } }, r2),
  ]);

  assert.strictEqual(r1.code, 200);
  assert.strictEqual(r2.code, 200);
  // Both callers get the SAME code back (the second one hits the idempotent "already issued" branch).
  assert.ok(r1.body.printCode, "first caller gets a code");
  assert.strictEqual(r2.body.printCode, r1.body.printCode, "second caller gets the SAME code, not a fresh one");

  const job = fake.data("print_jobs").j1;
  assert.strictEqual(job.printCode, r1.body.printCode);
  assert.strictEqual(job.coinsDeducted, true);

  // Coins were deducted exactly once (10), never twice (20).
  const user = fake.data("users").u1;
  assert.strictEqual(user.mimo_coins.balance, 90, "coins deducted exactly once");
  assert.strictEqual(user.mimo_coins.total_used, 10, "coins deducted exactly once");
});

test("three-way near-simultaneous calls still only issue one code and charge coins once", async () => {
  const [r1, r2, r3] = await Promise.all([call(), call(), call()]);
  const codes = new Set([r1.body.printCode, r2.body.printCode, r3.body.printCode]);
  assert.strictEqual(codes.size, 1, "every caller sees the same code");

  const user = fake.data("users").u1;
  assert.strictEqual(user.mimo_coins.balance, 90);
});

test("a later, non-concurrent call after the first one completes is still idempotent (no regression on the normal path)", async () => {
  const first = response();
  await postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: "order_1" } }, first);
  const second = response();
  await postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: "order_1" } }, second);

  assert.strictEqual(second.body.printCode, first.body.printCode);
  assert.strictEqual(fake.data("users").u1.mimo_coins.balance, 90);
});
