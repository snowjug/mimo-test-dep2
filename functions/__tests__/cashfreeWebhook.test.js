// Cashfree webhook: signature is always verified, every event is answered, success events are idempotent.
// Regression tests for the production 504s (handler never answered non-success events) and for the skipped
// signature check (under Cloud Functions the body arrives pre-parsed, so req.body is not a Buffer).
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const crypto = require("crypto");
const http = require("http");
const path = require("path");

process.env.CASHFREE_SECRET_KEY = "unit-test-secret";
process.env.JWT_SECRET = "unit-test-jwt";

// ---- fake Firestore injected in place of config/firebase ----
// The controller captures { admin, db } once at import, so these objects are stable and their state is reset per test.
const state = { store: new Map(), log: null, existingCode: true, jobCommitFailures: 0 };
function resetFake({ existingCode = true, failFirstJobsCommit = false } = {}) {
  state.store = new Map();
  state.log = { batchCommits: 0, updates: [], sets: [], deletes: [] };
  state.existingCode = existingCode;
  state.jobCommitFailures = failFirstJobsCommit ? 1 : 0;
  return state;
}
const snap = (docs) => ({ empty: docs.length === 0, docs, size: docs.length, forEach: (f) => docs.forEach(f) });
const docRef = (col, id) => ({
  create: async (data) => {
    const k = `${col}/${id}`;
    if (state.store.has(k)) { const e = new Error("6 ALREADY_EXISTS: Document already exists"); e.code = 6; throw e; }
    state.store.set(k, data);
  },
  delete: async () => { state.store.delete(`${col}/${id}`); state.log.deletes.push(`${col}/${id}`); },
  update: async (u) => { state.log.updates.push([col, id, u]); },
  set: async (d) => { state.log.sets.push([col, id, d]); },
  get: async () => ({ exists: false, data: () => ({}) }),
});
const orderDoc = { ref: docRef("orders", "o1"), data: () => ({}) };
const jobDoc = { ref: docRef("print_jobs", "j1"), data: () => ({ pageCount: 3 }) };
const db = {
  collection: (name) => {
    let wheres = 0;
    const q = {
      doc: (id) => docRef(name, id),
      where() { wheres += 1; return q; },
      limit() { return q; },
      get: async () => {
        if (name === "orders") return snap([orderDoc]);
        if (name === "print_jobs") return wheres >= 3 ? snap(state.existingCode ? [jobDoc] : []) : snap([jobDoc]);
        return snap([]);
      },
    };
    return q;
  },
  batch: () => ({ update: () => {}, commit: async () => {
    state.log.batchCommits += 1;
    if (state.jobCommitFailures > 0 && state.log.batchCommits === 2) { state.jobCommitFailures -= 1; throw new Error("simulated Firestore failure"); }
  } }),
};
const admin = { firestore: { FieldValue: { serverTimestamp: () => "TS", increment: (n) => ({ inc: n }) } } };

let fake = resetFake();
const firebasePath = require.resolve("../src/config/firebase");
require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: { admin, db } };
const { postCashfreeWebhook } = require("../src/controllers/payment.controller");

const sign = (ts, raw) => crypto.createHmac("sha256", process.env.CASHFREE_SECRET_KEY).update(ts + raw).digest("base64");
function request(event, { signed = true, badSignature = false, timestamp = "1700000000" } = {}) {
  const raw = Buffer.from(JSON.stringify(event));
  const headers = {};
  if (signed) { headers["x-webhook-timestamp"] = timestamp; headers["x-webhook-signature"] = badSignature ? "WRONG" : sign(timestamp, raw.toString("utf8")); }
  // Functions runtime shape: body already parsed, exact bytes in rawBody, so req.body is NOT a Buffer.
  return { headers, rawBody: raw, body: event };
}
function response() {
  return { code: null, body: null, headersSent: false,
    status(c) { this.code = c; return this; }, send(b) { this.body = b; this.headersSent = true; return this; },
    sendStatus(c) { this.code = c; this.headersSent = true; return this; } };
}
const successEvent = { type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: "order_x1", order_amount: 25 }, customer_details: { customer_id: "u1" }, payment: {} } };

test("unsigned or wrongly signed webhooks are rejected and touch nothing", async () => {
  for (const opts of [{ signed: false }, { badSignature: true }]) {
    fake = resetFake();
    const res = response();
    await postCashfreeWebhook(request(successEvent, opts), res);
    assert.strictEqual(res.code, 403);
    assert.strictEqual(fake.log.batchCommits + fake.log.updates.length + fake.log.sets.length + fake.store.size, 0, "no database writes");
  }
});

test("a body without raw bytes is rejected", async () => {
  const res = response();
  await postCashfreeWebhook({ headers: {}, body: successEvent }, res);
  assert.strictEqual(res.code, 400);
});

test("every non-success event is acknowledged (previously it hung until Cashfree gave up with 504)", async () => {
  for (const type of ["PAYMENT_FAILED_WEBHOOK", "PAYMENT_USER_DROPPED_WEBHOOK", "REFUND_STATUS_WEBHOOK", "WEBHOOK"]) {
    fake = resetFake();
    const res = response();
    await postCashfreeWebhook(request({ type, data: {} }), res);
    assert.strictEqual(res.code, 200, type);
    assert.strictEqual(res.body, "Webhook ignored");
    assert.strictEqual(fake.log.batchCommits, 0);
  }
});

test("a signed PAYMENT_SUCCESS is processed once and counters move once", async () => {
  fake = resetFake();
  const res = response();
  await postCashfreeWebhook(request(successEvent), res);
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body, "Webhook received");
  const metrics = fake.log.sets.filter(([c, id]) => c === "system" && id === "metrics");
  assert.strictEqual(metrics.length, 1);
  assert.deepStrictEqual(metrics[0][2].totalRevenue, { inc: 25 });
  assert.strictEqual(fake.log.updates.filter(([c]) => c === "users").length, 1);
});

test("duplicate delivery of the same success webhook is ignored", async () => {
  fake = resetFake();
  const first = response(), second = response();
  await postCashfreeWebhook(request(successEvent), first);
  await postCashfreeWebhook(request(successEvent, { timestamp: "1700000099" }), second);
  assert.strictEqual(first.body, "Webhook received");
  assert.strictEqual(second.code, 200);
  assert.strictEqual(second.body, "Duplicate webhook ignored");
  assert.strictEqual(fake.log.sets.filter(([c]) => c === "system").length, 1, "metrics incremented once");
});

test("if processing fails the idempotency marker is removed so a retry can complete", async () => {
  fake = resetFake({ failFirstJobsCommit: true });
  const failed = response();
  await postCashfreeWebhook(request(successEvent), failed);
  assert.strictEqual(failed.code, 500);
  assert.strictEqual(fake.store.size, 0, "marker removed");
  const retry = response();
  await postCashfreeWebhook(request(successEvent), retry);
  assert.strictEqual(retry.body, "Webhook received");
});

test("over real HTTP with a Functions-style pre-parsed body: answers, verifies, never hangs", async () => {
  fake = resetFake();
  const express = require("express");
  const app = express();
  // Emulates the Functions Framework: it consumes the stream, parses JSON and exposes req.rawBody
  app.use((req, res, next) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => { req.rawBody = Buffer.concat(chunks); try { req.body = JSON.parse(req.rawBody.toString() || "{}"); } catch { req.body = {}; } next(); });
  });
  app.use(express.json());
  app.use(require("../src/routes/payment.routes"));
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const post = (event, opts) => new Promise((resolve, reject) => {
    const rq = request(event, opts);
    const data = rq.rawBody;
    const req = http.request({ port: server.address().port, path: "/cashfree-webhook", method: "POST", timeout: 3000,
      headers: { "content-type": "application/json", "content-length": data.length, ...rq.headers } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve([res.statusCode, b]));
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("request hung")); });
    req.on("error", reject);
    req.end(data);
  });
  try {
    assert.strictEqual((await post({ type: "PAYMENT_FAILED_WEBHOOK", data: {} }))[0], 200);
    assert.strictEqual((await post(successEvent, { signed: false }))[0], 403);
    assert.strictEqual((await post(successEvent, { badSignature: true }))[0], 403);
    assert.strictEqual((await post(successEvent))[0], 200);
  } finally { server.close(); }
});

test("plain Express (dev server): server.js keeps the raw bytes so signatures verify there too", async () => {
  fake = resetFake();
  const app = require("../src/server");
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const rq = request({ type: "WEBHOOK", data: {} });
  const data = rq.rawBody;
  const result = await new Promise((resolve, reject) => {
    const req = http.request({ port: server.address().port, path: "/cashfree-webhook", method: "POST", timeout: 3000,
      headers: { "content-type": "application/json", "content-length": data.length, ...rq.headers } }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); });
    req.on("timeout", () => { req.destroy(); reject(new Error("hung")); });
    req.on("error", reject); req.end(data);
  });
  server.close();
  assert.strictEqual(result, 200);
});
