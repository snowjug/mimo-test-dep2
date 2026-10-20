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
process.env.JWT_SECRET = "unit-test-jwt-secret-fixture-32-chars"; // must be >= 32 chars (see src/config/env.js)

// ---- fake Firestore injected in place of config/firebase ----
// The controller captures { admin, db } once at import, so these objects are stable and their state is reset per test.
const state = { store: new Map(), log: null, existingCode: true, jobCommitFailures: 0, refundDocExists: false, jobStatus: undefined, hasOrdersDoc: true, hasTxnDoc: false, eventCreateError: false };
function resetFake({ existingCode = true, failFirstJobsCommit = false, refundDocExists = false, jobStatus = undefined, hasOrdersDoc = true, hasTxnDoc = false, eventCreateError = false } = {}) {
  state.store = new Map();
  state.log = { batchCommits: 0, updates: [], sets: [], deletes: [] };
  state.existingCode = existingCode;
  state.jobCommitFailures = failFirstJobsCommit ? 1 : 0;
  state.refundDocExists = refundDocExists;
  state.jobStatus = jobStatus;
  state.hasOrdersDoc = hasOrdersDoc;
  state.hasTxnDoc = hasTxnDoc;
  state.eventCreateError = eventCreateError;
  return state;
}
const snap = (docs) => ({ empty: docs.length === 0, docs, size: docs.length, forEach: (f) => docs.forEach(f) });
const docRef = (col, id) => ({
  col, id, // exposed so batch.update's log can be filtered by collection in assertions
  create: async (data) => {
    if (col === "webhook_events" && state.eventCreateError) {
      throw new Error("13 INTERNAL: simulated non-duplicate Firestore failure");
    }
    const k = `${col}/${id}`;
    if (state.store.has(k)) { const e = new Error("6 ALREADY_EXISTS: Document already exists"); e.code = 6; throw e; }
    state.store.set(k, data);
  },
  delete: async () => { state.store.delete(`${col}/${id}`); state.log.deletes.push(`${col}/${id}`); },
  update: async (u) => { state.log.updates.push([col, id, u]); },
  set: async (d, opts) => { state.log.sets.push([col, id, d, opts]); },
  get: async () => ({ exists: false, data: () => ({}) }),
});
const orderDoc = { ref: docRef("orders", "o1"), data: () => ({}) };
const jobDoc = { ref: docRef("print_jobs", "j1"), data: () => ({ pageCount: 3, status: state.jobStatus }) };
const refundDoc = { ref: docRef("refunds", "r1"), data: () => ({}) };
const txnDoc = { ref: docRef("payment_transactions", "t1"), data: () => ({}) };
const db = {
  collection: (name) => {
    const filteredFields = [];
    const q = {
      doc: (id) => docRef(name, id),
      where(field) { filteredFields.push(field); return q; },
      limit() { return q; },
      get: async () => {
        if (name === "orders") return snap(state.hasOrdersDoc ? [orderDoc] : []);
        if (name === "print_jobs") {
          // The duplicate-code guard filters on printCode (scoped by orderId); the plain jobs-to-mark-paid query does not.
          if (filteredFields.includes("printCode")) return snap(state.existingCode ? [jobDoc] : []);
          return snap([jobDoc]);
        }
        if (name === "refunds") return snap(state.refundDocExists ? [refundDoc] : []);
        if (name === "payment_transactions") return snap(state.hasTxnDoc ? [txnDoc] : []);
        return snap([]);
      },
    };
    return q;
  },
  batch: () => ({ update: (ref, u) => { state.log.updates.push([ref, u]); }, commit: async () => {
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

test("a tampered/malformed timestamp invalidates the signature and is rejected (P0.1 regression)", async () => {
  fake = resetFake();
  // A real signature is bound to the exact timestamp string it was computed over (HMAC(timestamp + body)).
  // Modeling an attacker who intercepts a legitimate delivery and corrupts/replaces the timestamp header
  // without the secret: the signature no longer matches the (now different) timestamp, so this must reject
  // exactly like any other signature mismatch -- there is no code path that trusts the header on its own.
  const raw = Buffer.from(JSON.stringify(successEvent));
  const originalTimestamp = "1700000000";
  const validSignatureForOriginalTimestamp = sign(originalTimestamp, raw.toString("utf8"));
  const res = response();
  await postCashfreeWebhook({
    headers: { "x-webhook-timestamp": "not-a-timestamp", "x-webhook-signature": validSignatureForOriginalTimestamp },
    rawBody: raw, body: successEvent,
  }, res);
  assert.strictEqual(res.code, 403);
  assert.strictEqual(fake.log.batchCommits + fake.log.updates.length + fake.log.sets.length + fake.store.size, 0, "no database writes");
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

// ───────────────────────── Mission 40: previously-uncovered event branches ─────────────────────────
// Mission 38's extraction shrank payment.controller.js down to mostly webhook/error-handling code, which
// lowered the file's overall coverage percentage below the CI gate even though nothing here is new or
// changed — these event types/branches were always reachable, just never exercised with REAL event data (the
// existing "every non-success event is acknowledged" test above only sends `data: {}`, which trips each
// branch's own early "no order_id/no refund data, acknowledged" guard before reaching the real logic).

test("a webhook arrives with no CASHFREE_SECRET_KEY configured: 500, never silently accepted as unsigned", async () => {
  // Checked before the signature itself is verified (see payment.controller.js), so no valid signature can
  // be computed for this case anyway -- any raw body/headers reach the same "not configured" branch.
  fake = resetFake();
  const saved = process.env.CASHFREE_SECRET_KEY;
  delete process.env.CASHFREE_SECRET_KEY;
  try {
    const res = response();
    const raw = Buffer.from(JSON.stringify(successEvent));
    await postCashfreeWebhook({ headers: { "x-webhook-timestamp": "1700000000", "x-webhook-signature": "irrelevant" }, rawBody: raw, body: successEvent }, res);
    assert.strictEqual(res.code, 500);
    assert.strictEqual(res.body, "Webhook not configured");
  } finally {
    process.env.CASHFREE_SECRET_KEY = saved;
  }
});

test("PAYMENT_SUCCESS with no 'orders' doc falls back to payment_transactions for both the status update and the audit record", async () => {
  fake = resetFake({ hasOrdersDoc: false, hasTxnDoc: true });
  const res = response();
  await postCashfreeWebhook(request(successEvent), res);
  assert.strictEqual(res.body, "Webhook received");
  // The fallback-found payment_transactions doc was marked PAID (via orderBatch.update on its ref)...
  const batchUpdates = fake.log.updates.filter(([ref]) => typeof ref === "object" && ref.col === "payment_transactions");
  assert.ok(batchUpdates.length >= 1, "the payment_transactions doc found via fallback was marked PAID");
  assert.strictEqual(batchUpdates[0][1].status, "PAID");
  // ...and the SEPARATE audit-record step (lines 227-238) also found the same doc and wrote the gateway details to it directly.
  const [auditUpdate] = fake.log.updates.filter(([col, id]) => col === "payment_transactions" && id === "t1");
  assert.ok(auditUpdate, "the audit-record update ran against the payment_transactions doc");
  assert.strictEqual(auditUpdate[2]["transactionStatus.status"], "completed");
});

test("PAYMENT_SUCCESS with no existing print code yet calls the internal /payment-success endpoint (network failure there is logged, never fails the webhook)", async () => {
  fake = resetFake({ existingCode: false });
  const res = response();
  await postCashfreeWebhook(request(successEvent), res);
  // Nothing is listening on localhost:PORT in this test process, so the internal call genuinely fails
  // (ECONNREFUSED) -- proving the webhook still answers 200 (the internal call's failure is caught and
  // logged, never surfaced as a webhook failure to Cashfree, which would otherwise retry forever).
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body, "Webhook received");
});

test("SETTLEMENT_SUCCESS with real settlement data is recorded in cashfree_settlements", async () => {
  fake = resetFake();
  const res = response();
  const settlement = { type: "SETTLEMENT_SUCCESS", data: { settlement: { settlement_id: "stl_1", settlement_amount: 500, utr: "UTR123" } } };
  await postCashfreeWebhook(request(settlement), res);
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body, "Settlement webhook processed");
  const [set] = fake.log.sets.filter(([c, id]) => c === "cashfree_settlements" && id === "stl_1");
  assert.ok(set, "the settlement was written to cashfree_settlements");
  assert.strictEqual(set[2].settlementAmount, 500);
  assert.strictEqual(set[2].utr, "UTR123");
  assert.strictEqual(set[2].reconciledStatus, "RECORDED");
});

test("duplicate delivery of the same settlement webhook is ignored, not reprocessed", async () => {
  fake = resetFake();
  const settlement = { type: "SETTLEMENT_SUCCESS", data: { settlement: { settlement_id: "stl_dup_1", settlement_amount: 500 } } };
  const first = response(), second = response();
  await postCashfreeWebhook(request(settlement), first);
  await postCashfreeWebhook(request(settlement, { timestamp: "1700000099" }), second);
  assert.strictEqual(first.body, "Settlement webhook processed");
  assert.strictEqual(second.code, 200);
  assert.strictEqual(second.body, "Duplicate webhook ignored");
  assert.strictEqual(fake.log.sets.filter(([c]) => c === "cashfree_settlements").length, 1, "recorded only once");
});

test("SETTLEMENT_SUCCESS/TRANSFER_SUCCESS with no usable data is acknowledged without writing anything", async () => {
  fake = resetFake();
  const res = response();
  await postCashfreeWebhook(request({ type: "TRANSFER_SUCCESS", data: {} }), res);
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body, "Webhook ignored");
  assert.strictEqual(fake.log.sets.filter(([c]) => c === "cashfree_settlements").length, 0);
});

test("REFUND_STATUS_WEBHOOK with a matching refund record updates its status and gateway fields", async () => {
  fake = resetFake({ refundDocExists: true });
  const res = response();
  const refundEvent = { type: "REFUND_STATUS_WEBHOOK", data: { refund: { order_id: "order_x1", cf_refund_id: "cfr_1", refund_status: "SUCCESS" } } };
  await postCashfreeWebhook(request(refundEvent), res);
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body, "Refund webhook processed");
  const [update] = fake.log.updates.filter(([col, id]) => col === "refunds" && id === "r1");
  assert.ok(update, "the matching refund doc was updated");
  assert.strictEqual(update[2].status, "SUCCESS");
  assert.strictEqual(update[2].cashfreeRefundId, "cfr_1");
});

test("REFUND_STATUS_WEBHOOK for an order with no matching refund record is still acknowledged, writing nothing", async () => {
  fake = resetFake({ refundDocExists: false });
  const res = response();
  const refundEvent = { type: "REFUND_STATUS_WEBHOOK", data: { refund: { order_id: "order_unknown", refund_status: "SUCCESS" } } };
  await postCashfreeWebhook(request(refundEvent), res);
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body, "Refund webhook processed");
  assert.strictEqual(fake.log.updates.filter(([col]) => col === "refunds").length, 0);
});

test("PAYMENT_FAILED_WEBHOOK marks every PENDING job of the order abandoned (making the failure visible immediately, not after a 24h sweep)", async () => {
  fake = resetFake({ jobStatus: "pending" });
  const res = response();
  const failedEvent = { type: "PAYMENT_FAILED_WEBHOOK", data: { order: { order_id: "order_x1" } } };
  await postCashfreeWebhook(request(failedEvent), res);
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body, "Webhook processed");
  assert.strictEqual(fake.log.batchCommits, 1, "the abandon-marking batch was committed because at least one job was pending");
  const [update] = fake.log.updates.filter(([ref]) => typeof ref === "object" && ref.col === "print_jobs");
  assert.ok(update, "the pending job was included in the abandon batch");
  assert.strictEqual(update[1].status, "abandoned");
  assert.strictEqual(update[1].abandonReason, "PAYMENT_FAILED_WEBHOOK");
});

test("PAYMENT_USER_DROPPED_WEBHOOK for an order whose jobs are already paid/printed leaves them untouched (no batch commit)", async () => {
  fake = resetFake({ jobStatus: "paid" }); // not "pending" -> the abandon branch never fires
  const res = response();
  const droppedEvent = { type: "PAYMENT_USER_DROPPED_WEBHOOK", data: { order: { order_id: "order_x1" } } };
  await postCashfreeWebhook(request(droppedEvent), res);
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body, "Webhook processed");
  assert.strictEqual(fake.log.batchCommits, 0, "nothing was pending, so the batch is never committed");
});

test("a non-duplicate Firestore failure while claiming the PAYMENT_SUCCESS idempotency marker is NOT swallowed as 'duplicate' -- it fails the webhook (500) so Cashfree retries", async () => {
  fake = resetFake({ eventCreateError: true });
  const res = response();
  await postCashfreeWebhook(request(successEvent), res);
  assert.strictEqual(res.code, 500, "a genuine Firestore failure must not be mistaken for an already-processed duplicate");
  assert.strictEqual(fake.log.sets.filter(([c]) => c === "system").length, 0, "nothing was processed");
});

test("a non-duplicate Firestore failure while claiming the SETTLEMENT idempotency marker is NOT swallowed as 'duplicate' -- it fails the webhook (500)", async () => {
  fake = resetFake({ eventCreateError: true });
  const res = response();
  const settlement = { type: "SETTLEMENT_SUCCESS", data: { settlement: { settlement_id: "stl_1", settlement_amount: 500 } } };
  await postCashfreeWebhook(request(settlement), res);
  assert.strictEqual(res.code, 500);
  assert.strictEqual(fake.log.sets.filter(([c]) => c === "cashfree_settlements").length, 0, "the settlement was never recorded");
});
