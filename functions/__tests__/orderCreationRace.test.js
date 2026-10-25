// Regression test for the checkout race (audit finding F-05): two near-simultaneous /create-order calls for
// the SAME pending job(s) -- a double-click, or a client retry while the first request is still in flight --
// used to both pass a plain read-based pending check and both go on to create a live order for the same
// files. The fix re-verifies every job fresh, inside a Firestore transaction, immediately before the one
// write that actually matters (deleting the source jobs and creating the merged one); a loser sees its job
// already consumed and is rejected with a clean 409 instead of silently duplicating it.
//
// This needs `strictTransactions: true` (see printCodeAllocation.test.js's header comment) to actually model
// Firestore's optimistic-concurrency abort-and-retry -- the shared orderHarness fake used by the other
// order-creation tests does not enable it, so this lives in its own small, self-contained file rather than
// reusing that harness.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

process.env.JWT_SECRET = "order-race-test-secret-fixture-32-chars-ok";
delete process.env.GMAIL_APP_PASSWORD;
delete process.env.PORT;

const fake = createFakeFirestore({}, { strictTransactions: true });
fake.install();
const controller = require("../src/controllers/payment.controller");

function response() {
  return {
    code: 200,
    body: undefined,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

test.beforeEach(() => fake.reset({
  users: { u1: { email: "u1@example.com", mimo_coins: { balance: 0, total_earned: 0, total_used: 0 } } },
  print_jobs: {
    j1: {
      userId: "u1", status: "pending", fileName: "doc.pdf", fileUrl: "https://files.example/doc.pdf",
      mimetype: "application/pdf", size: 100, pageCount: 1,
    },
  },
  // 100%-off coupon forces the free-order bypass regardless of the configured per-page price, so this test
  // never needs to stub the Cashfree gateway call -- only the one write path under test is exercised.
  coupons: { FREE100: { isActive: true, discountPercentage: 100 } },
}));

const checkout = () => {
  const res = response();
  return controller.postCreateOrder(
    { user: { userId: "u1" }, body: { jobIds: ["j1"], couponCode: "FREE100" } },
    res
  ).then(() => res);
};

test("two concurrent checkouts for the same job: exactly one succeeds, the other gets a clean 409, no duplicate job is created", async () => {
  const [resA, resB] = await Promise.all([checkout(), checkout()]);

  const codes = [resA.code, resB.code].sort();
  assert.deepStrictEqual(codes, [200, 409], `expected one 200 and one 409, got ${JSON.stringify([resA.code, resB.code])}`);

  const winner = resA.code === 200 ? resA : resB;
  const loser = resA.code === 200 ? resB : resA;
  assert.match(loser.body.error, /already claimed by another checkout/);
  assert.ok(winner.body.printCode, "the winning checkout got its print code (free-order bypass)");

  // Exactly one paid job exists for j1's content -- not two live merged jobs for the same underlying file.
  const paidJobs = Object.values(fake.data("print_jobs")).filter((j) => j.status === "paid");
  assert.strictEqual(paidJobs.length, 1, "exactly one paid job was created, not two");

  // The loser's checkout left nothing behind: the original job is gone (consumed by the winner), and there is
  // no second job document sitting around half-written.
  assert.strictEqual(Object.keys(fake.data("print_jobs")).length, 1, "no orphaned second job from the loser");
});

test("after losing the race, the SAME job cannot be checked out again under its old id (it no longer exists)", async () => {
  await Promise.all([checkout(), checkout()]);
  const retry = await checkout();
  assert.strictEqual(retry.code, 400);
  assert.match(retry.body.error, /not found: j1/);
});
