// WhatsApp webhook: X-Hub-Signature-256 is always verified before any message is processed.
// Regression test for the P0.2 finding: postWhatsappWebhook previously had no signature check at all,
// so anyone who knew the webhook URL could forge inbound WhatsApp messages.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const crypto = require("crypto");

process.env.WA_APP_SECRET = "unit-test-wa-app-secret";
process.env.JWT_SECRET = "unit-test-jwt-secret-fixture-32-chars"; // must be >= 32 chars (see src/config/env.js)

// ---- fake Firestore (signature-rejected requests must never reach it) ----
const state = { writes: 0 };
const db = {
  collection: () => ({
    doc: () => ({
      get: async () => ({ exists: false, data: () => ({}) }),
      create: async () => { state.writes++; },
      update: async () => { state.writes++; },
      set: async () => { state.writes++; },
    }),
    where: () => ({ get: async () => ({ empty: true, docs: [], forEach: () => {} }) }),
  }),
};
const admin = { firestore: { FieldValue: { serverTimestamp: () => "TS" } } };
const firebasePath = require.resolve("../src/config/firebase");
require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: { admin, db } };

const { postWhatsappWebhook } = require("../src/controllers/whatsapp.controller");

const sign = (raw, secret) => "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
function request(body, { signed = true, badSignature = false, secret = process.env.WA_APP_SECRET } = {}) {
  const raw = Buffer.from(JSON.stringify(body));
  const headers = {};
  if (signed) headers["x-hub-signature-256"] = badSignature ? "sha256=" + "0".repeat(64) : sign(raw, secret);
  return { headers, rawBody: raw, body };
}
function response() {
  return { code: null, body: null,
    status(c) { this.code = c; return this; }, send(b) { this.body = b; return this; },
    sendStatus(c) { this.code = c; return this; } };
}

// Not whatsapp_business_account -> the handler's own early-exit (200) once past the signature gate.
// Used so a "valid signature" test doesn't need to mock the full session/message pipeline.
const benignBody = { object: "not_whatsapp" };

test("missing X-Hub-Signature-256 is rejected, nothing is read or written", async () => {
  state.writes = 0;
  const res = response();
  await postWhatsappWebhook(request(benignBody, { signed: false }), res);
  assert.strictEqual(res.code, 403);
  assert.strictEqual(state.writes, 0);
});

test("an invalid/forged signature is rejected", async () => {
  state.writes = 0;
  const res = response();
  await postWhatsappWebhook(request(benignBody, { badSignature: true }), res);
  assert.strictEqual(res.code, 403);
  assert.strictEqual(state.writes, 0);
});

test("a signature computed with the wrong secret is rejected (forgery attempt)", async () => {
  state.writes = 0;
  const res = response();
  await postWhatsappWebhook(request(benignBody, { secret: "attacker-guessed-this" }), res);
  assert.strictEqual(res.code, 403);
  assert.strictEqual(state.writes, 0);
});

test("a correctly signed request passes the signature gate", async () => {
  const res = response();
  await postWhatsappWebhook(request(benignBody), res);
  // Past the signature check, the handler's own object-type guard answers 200 immediately.
  assert.strictEqual(res.code, 200);
});

test("a request with no raw body bytes is rejected (Cloud Functions body-already-parsed edge case)", async () => {
  state.writes = 0;
  const res = response();
  await postWhatsappWebhook({ headers: {}, body: benignBody }, res);
  assert.strictEqual(res.code, 400);
  assert.strictEqual(state.writes, 0);
});

test("missing WA_APP_SECRET fails closed instead of silently accepting unsigned requests", async () => {
  const original = process.env.WA_APP_SECRET;
  delete process.env.WA_APP_SECRET;
  delete require.cache[require.resolve("../src/config/env")];
  delete require.cache[require.resolve("../src/controllers/whatsapp.controller")];
  const { postWhatsappWebhook: handlerWithoutSecret } = require("../src/controllers/whatsapp.controller");
  const res = response();
  await handlerWithoutSecret(request(benignBody, { signed: false }), res);
  assert.strictEqual(res.code, 500);
  process.env.WA_APP_SECRET = original;
  delete require.cache[require.resolve("../src/config/env")];
  delete require.cache[require.resolve("../src/controllers/whatsapp.controller")];
});
