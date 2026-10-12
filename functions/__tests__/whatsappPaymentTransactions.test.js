// _finalizePayment (whatsapp.service.js): every WhatsApp order -- free or paid -- must leave behind a
// payment_transactions document, because that's what autoRefundJob and /kiosk/report-failure key their
// refund-eligibility lookup on (both query payment_transactions/orders by `orderId`).
// Regression test for the P0.4 finding: previously no such document was ever written for WhatsApp orders,
// so a genuinely-paid order that later failed to print was indistinguishable from a free order -- the
// refund lookup found nothing, read amount as 0, and skipped the refund entirely.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");

process.env.JWT_SECRET = "unit-test-jwt-secret-fixture-32-chars"; // must be >= 32 chars (see src/config/env.js)
process.env.CASHFREE_APP_ID = "test_app_id";
process.env.CASHFREE_SECRET_KEY = "test_secret_key";

// ---- fake Firestore: records every write so tests can assert on the exact payment_transactions doc ----
const state = { writes: [], coupons: {} }; // coupons: { CODE: couponData }
function resetState() { state.writes = []; state.coupons = {}; }
function fakeDocRef(collection, id) {
  return {
    set: async (data) => { state.writes.push({ collection, data }); },
    update: async (data) => { state.writes.push({ collection, data, op: "update" }); },
    get: async () => {
      if (collection === "coupons" && state.coupons[id]) {
        return { exists: true, data: () => state.coupons[id] };
      }
      return { exists: false, data: () => ({}) };
    },
  };
}
const db = {
  collection: (name) => ({
    doc: (id) => fakeDocRef(name, id), // id undefined for .doc() with no args, matches real Firestore auto-id behavior
    get: async () => ({ exists: false, data: () => ({}) }),
    // generateUniquePrintCode checks for a collision via .where("printCode", "==", code).get(); always empty here.
    where: () => ({ get: async () => ({ empty: true, docs: [], forEach: () => {} }) }),
  }),
};
const admin = { firestore: { FieldValue: { serverTimestamp: () => "TS" } } };
const firebasePath = require.resolve("../src/config/firebase");
require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: { admin, db } };

// ---- fake axios: only the paid branch calls out (POST /links) ----
const axiosPath = require.resolve("axios");
require.cache[axiosPath] = {
  id: axiosPath, filename: axiosPath, loaded: true,
  exports: {
    post: async () => ({ data: { link_id: "WA-TEST1234", link_url: "https://payments.cashfree.com/links/WA-TEST1234" } }),
    get: async () => { throw new Error("not used by _finalizePayment"); },
  },
};

const { _finalizePayment } = require("../src/services/whatsapp.service");

function fakeSessionRef() {
  return { update: async () => {}, set: async () => {} };
}

test("a free (100%-coupon) order still records a payment_transactions document with amount 0", async () => {
  resetState();
  state.coupons["FREE100"] = { isActive: true, discountPercentage: 100 };
  const session = { rawTotal: 14, jobId: "job1", kioskId: "SV-002", colorMode: "bw", copies: 1, pageCount: 1 };
  await _finalizePayment("919876543210", session, fakeSessionRef(), "FREE100");

  const txWrites = state.writes.filter((w) => w.collection === "payment_transactions");
  assert.strictEqual(txWrites.length, 1, "exactly one payment_transactions doc written");
  assert.strictEqual(txWrites[0].data.amount, 0);
  assert.strictEqual(txWrites[0].data.status, "PAID");
  assert.strictEqual(txWrites[0].data.userId, "wa:919876543210");
  assert.ok(txWrites[0].data.orderId, "orderId must be set so refund logic can find this record");
});

test("a paid order records a payment_transactions document with the real amount before the job is updated", async () => {
  resetState();
  const session = { rawTotal: 25, jobId: "job2", kioskId: "SV-002", colorMode: "color", copies: 2, pageCount: 1, fileName: "doc.pdf" };
  await _finalizePayment("919876543210", session, fakeSessionRef(), null);

  const txWrites = state.writes.filter((w) => w.collection === "payment_transactions");
  assert.strictEqual(txWrites.length, 1, "exactly one payment_transactions doc written");
  assert.strictEqual(txWrites[0].data.amount, 25);
  assert.strictEqual(txWrites[0].data.status, "INITIATED");
  assert.strictEqual(txWrites[0].data.userId, "wa:919876543210");

  const jobWriteIndex = state.writes.findIndex((w) => w.collection === "print_jobs");
  const txWriteIndex = state.writes.findIndex((w) => w.collection === "payment_transactions");
  assert.ok(txWriteIndex < jobWriteIndex, "payment_transactions must exist before the print_jobs doc references its orderId");

  // Same orderId on both documents is what lets autoRefundJob/report-failure find the real amount later.
  assert.strictEqual(txWrites[0].data.orderId, state.writes[jobWriteIndex].data.orderId);
});

test("a paid order below the Cashfree minimum is still clamped to ₹1 and recorded at that amount", async () => {
  resetState();
  const session = { rawTotal: 0.5, jobId: "job3", colorMode: "bw", copies: 1, pageCount: 1, fileName: "doc.pdf" };
  await _finalizePayment("919876543210", session, fakeSessionRef(), null);

  const txWrites = state.writes.filter((w) => w.collection === "payment_transactions");
  assert.strictEqual(txWrites[0].data.amount, 1);
});
