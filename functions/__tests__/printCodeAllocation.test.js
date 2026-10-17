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
const crypto = require("node:crypto");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

const fake = createFakeFirestore({}, { strictTransactions: true });
fake.install();
const { generateUniquePrintCode, CODE_VALIDITY_MS } = require("../src/services/printCode.service");

const withForcedRandom = async (codes, fn) => {
  const original = crypto.randomInt;
  let i = 0;
  // randomCode() calls crypto.randomInt(1000, 10000) directly for the candidate code, so forcing it here
  // deterministically picks which 4-digit code each call will FIRST attempt.
  crypto.randomInt = () => codes[Math.min(i++, codes.length - 1)];
  try {
    return await fn();
  } finally {
    crypto.randomInt = original;
  }
};

test.beforeEach(() => fake.reset({}));

test("two concurrent allocations forced to the same first-choice code never return the same code", async () => {
  // Both calls' first attempt computes the identical candidate code (5500 both times).
  // If the fix works, Firestore's transaction conflict makes the loser retry with 1900 -> a different code.
  const [a, b] = await withForcedRandom([5500, 5500, 1900, 1900], () => Promise.all([generateUniquePrintCode(fake.db), generateUniquePrintCode(fake.db)]));
  assert.notStrictEqual(a, b, `both calls returned the same code (${a}) -- the race is NOT closed`);
});

test("a sequential second call for the same forced candidate gets a different code", async () => {
  const first = await withForcedRandom([5500], () => generateUniquePrintCode(fake.db));
  const second = await withForcedRandom([5500, 1900], () => generateUniquePrintCode(fake.db));
  assert.notStrictEqual(first, second);
});

test("a claim does not block reuse once it has expired (24h validity)", async () => {
  const realNow = Date.now;
  try {
    Date.now = () => realNow() - CODE_VALIDITY_MS - 1000; // claim it "25 hours ago"
    const stale = await withForcedRandom([5500], () => generateUniquePrintCode(fake.db));
    Date.now = realNow;
    const reused = await withForcedRandom([5500], () => generateUniquePrintCode(fake.db));
    assert.strictEqual(stale, reused, "an expired claim must become available again");
  } finally {
    Date.now = realNow;
  }
});

test("a fresh (non-expired) claim is never handed out again", async () => {
  const first = await withForcedRandom([5500], () => generateUniquePrintCode(fake.db));
  const second = await withForcedRandom([5500, 1900], () => generateUniquePrintCode(fake.db));
  assert.notStrictEqual(first, second, "a still-fresh claim must not be reused");
});
