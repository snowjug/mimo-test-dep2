// Regression test for a real production incident: two customers' print codes collided (both got handed the
// SAME 4-digit code), and the kiosk's own tie-break served the wrong customer's job. Root cause: the old
// generateUniquePrintCode read "is this code free?" then simply returned it -- a real window existed between
// that check and the caller actually writing the print_jobs doc with it, during which a second concurrent
// caller could observe the same code as free and be handed it too.
//
// The default fakeFirestore test double does not model Firestore's optimistic-concurrency abort-and-retry, so
// it cannot by itself prove a fix that depends on it. `createFakeFirestore(seed, { strictTransactions: true })`
// adds that one behaviour (see helpers/fakeFirestore.js): a transaction's writes are queued, and if ANY other
// write lands anywhere in the store while its callback is still running, the whole callback is discarded and
// re-run with fresh reads -- exactly the guarantee real `db.runTransaction` provides and that this fix relies on.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

const fake = createFakeFirestore({}, { strictTransactions: true });
fake.install();
const { generateUniquePrintCode, CODE_VALIDITY_MS } = require("../src/services/printCode.service");

const withForcedRandom = async (values, fn) => {
  const original = Math.random;
  let i = 0;
  // Math.random() must return a value in [0, 1); randomCode() computes Math.floor(1000 + r*9000), so picking
  // r values here deterministically picks which 4-digit code each call will FIRST attempt.
  Math.random = () => values[Math.min(i++, values.length - 1)];
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
};

test.beforeEach(() => fake.reset({}));

test("two concurrent allocations forced to the same first-choice code never return the same code", async () => {
  // Both calls' first attempt computes the identical candidate code (r=0.5 -> code "5500" both times).
  // If the fix works, Firestore's transaction conflict makes the loser retry with r=0.1 -> a different code.
  const [a, b] = await withForcedRandom([0.5, 0.5, 0.1, 0.1], () => Promise.all([generateUniquePrintCode(fake.db), generateUniquePrintCode(fake.db)]));
  assert.notStrictEqual(a, b, `both calls returned the same code (${a}) -- the race is NOT closed`);
});

test("a sequential second call for the same forced candidate gets a different code", async () => {
  const first = await withForcedRandom([0.5], () => generateUniquePrintCode(fake.db));
  const second = await withForcedRandom([0.5, 0.1], () => generateUniquePrintCode(fake.db));
  assert.notStrictEqual(first, second);
});

test("a claim does not block reuse once it has expired (24h validity)", async () => {
  const realNow = Date.now;
  try {
    Date.now = () => realNow() - CODE_VALIDITY_MS - 1000; // claim it "25 hours ago"
    const stale = await withForcedRandom([0.5], () => generateUniquePrintCode(fake.db));
    Date.now = realNow;
    const reused = await withForcedRandom([0.5], () => generateUniquePrintCode(fake.db));
    assert.strictEqual(stale, reused, "an expired claim must become available again");
  } finally {
    Date.now = realNow;
  }
});

test("a fresh (non-expired) claim is never handed out again", async () => {
  const first = await withForcedRandom([0.5], () => generateUniquePrintCode(fake.db));
  const second = await withForcedRandom([0.5, 0.1], () => generateUniquePrintCode(fake.db));
  assert.notStrictEqual(first, second, "a still-fresh claim must not be reused");
});
