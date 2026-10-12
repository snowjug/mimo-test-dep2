// getWaPay (/wa-pay/:orderId): WhatsApp orders are created via Cashfree's Payment Links API (POST /links),
// not the Orders API, so reading one back must call GET /links/{id}, not GET /orders/{id}.
// Regression test for the P0.5 finding: the fallback page previously called the wrong endpoint, which
// 404s against a link_id and surfaces "Something went wrong" for a real, live payment.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");

process.env.WA_APP_SECRET = "unit-test-wa-app-secret";
process.env.JWT_SECRET = "unit-test-jwt-secret-fixture-32-chars"; // must be >= 32 chars (see src/config/env.js)

// ---- fake Firestore (unused by getWaPay, but required by the controller module at import time) ----
const db = {
  collection: () => ({
    doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }),
    where: () => ({ get: async () => ({ empty: true, docs: [], forEach: () => {} }) }),
  }),
};
const admin = { firestore: { FieldValue: { serverTimestamp: () => "TS" } } };
const firebasePath = require.resolve("../src/config/firebase");
require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: { admin, db } };

// ---- fake axios: records every call so tests can assert the exact URL/endpoint used ----
const calls = { get: [] };
let nextGetResult = null; // { data } to resolve with, or an Error instance to reject with
const axiosPath = require.resolve("axios");
require.cache[axiosPath] = {
  id: axiosPath, filename: axiosPath, loaded: true,
  exports: {
    get: async (url, config) => {
      calls.get.push({ url, config });
      if (nextGetResult instanceof Error) throw nextGetResult;
      return nextGetResult;
    },
    post: async () => { throw new Error("not used by getWaPay"); },
  },
};

const { getWaPay } = require("../src/controllers/whatsapp.controller");

function request(orderId) {
  return { params: { orderId } };
}
function response() {
  return { code: null, body: null, redirectedTo: null,
    status(c) { this.code = c; return this; },
    send(b) { this.body = b; if (this.code === null) this.code = 200; return this; },
    redirect(code, url) { this.code = code; this.redirectedTo = url; return this; } };
}

test("reads the order via GET /links/{id}, never /orders/{id}", async () => {
  calls.get = [];
  nextGetResult = { data: { link_status: "ACTIVE", link_url: "https://payments.cashfree.com/links/abc123" } };
  const res = response();
  await getWaPay(request("WA-ABCD1234"), res);
  assert.strictEqual(calls.get.length, 1);
  assert.match(calls.get[0].url, /\/links\/WA-ABCD1234$/);
  assert.doesNotMatch(calls.get[0].url, /\/orders\//);
});

test("an active, unpaid link redirects to Cashfree's hosted page", async () => {
  calls.get = [];
  nextGetResult = { data: { link_status: "ACTIVE", link_url: "https://payments.cashfree.com/links/abc123" } };
  const res = response();
  await getWaPay(request("WA-ABCD1234"), res);
  assert.strictEqual(res.code, 302);
  assert.strictEqual(res.redirectedTo, "https://payments.cashfree.com/links/abc123");
});

test("an already-PAID link shows the already-paid page instead of redirecting", async () => {
  nextGetResult = { data: { link_status: "PAID", link_url: "https://payments.cashfree.com/links/abc123" } };
  const res = response();
  await getWaPay(request("WA-ABCD1234"), res);
  assert.strictEqual(res.redirectedTo, null);
  assert.match(res.body, /Already (Received|Paid)/i);
});

test("an EXPIRED link shows a clear expired message, not a generic error", async () => {
  nextGetResult = { data: { link_status: "EXPIRED", link_url: null } };
  const res = response();
  await getWaPay(request("WA-ABCD1234"), res);
  assert.strictEqual(res.code, 400);
  assert.match(res.body, /Expired/i);
});

test("a CANCELLED link also shows the expired/invalid message, not a redirect", async () => {
  nextGetResult = { data: { link_status: "CANCELLED", link_url: "https://payments.cashfree.com/links/abc123" } };
  const res = response();
  await getWaPay(request("WA-ABCD1234"), res);
  assert.strictEqual(res.redirectedTo, null);
  assert.strictEqual(res.code, 400);
});

test("an unknown/invalid order id (Cashfree 404s the lookup) fails safely with a retry message", async () => {
  const err = new Error("Request failed with status code 404");
  err.response = { data: { message: "link not found" } };
  nextGetResult = err;
  const res = response();
  await getWaPay(request("not-a-real-id"), res);
  assert.strictEqual(res.code, 500);
  assert.match(res.body, /went wrong/i);
});
