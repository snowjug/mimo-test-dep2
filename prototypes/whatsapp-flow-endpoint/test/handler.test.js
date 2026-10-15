"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { createFlowHandler } = require("../src/flowHandler");
const { createCdnFetcher } = require("../src/cdn");
const { createIdempotency } = require("../src/idempotency");
const { pricingContext } = require("../src/pricingAdapter");
const f = require("./fixtures");

const keys = f.generateKeys();
const COLOR_MSG = "🎨 Color printing is available only at MIMO 2.0. Your job will be routed automatically to MIMO 2.0.";

async function setup(over = {}) {
  const cdn = await f.startFixtureCdn();
  const deps = { fetchCdn: createCdnFetcher({ allowLoopbackHttp: true, maxBytes: 30 * 1024 * 1024 }) };
  const idempotency = createIdempotency();
  const handle = createFlowHandler({ privateKeyPem: keys.privateKey, appSecrets: [f.TEST_APP_SECRET], deps, db: f.stubDb(), idempotency, ...over });
  const call = async (payload, { signed = true, mutate } = {}) => {
    const req = f.buildEncryptedRequest(payload, keys.publicKey);
    const raw = Buffer.from(JSON.stringify(mutate ? mutate(req.body) : req.body));
    const res = await handle(raw, signed ? { "x-hub-signature-256": f.sign(raw) } : {});
    return { res, plain: res.status === 200 ? f.decryptResponse(res.body, req.aesKey, req.iv) : null };
  };
  return { cdn, call, idempotency, deps };
}

test("ping -> encrypted {data:{status:'active'}}", async () => {
  const { call, cdn } = await setup();
  const { res, plain } = await call({ action: "ping" });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers["Content-Type"], "text/plain");
  assert.deepStrictEqual(plain, { data: { status: "active" } });
  await cdn.close();
});

test("INIT, BACK, completion and client-error acknowledgement", async () => {
  const { call, cdn } = await setup();
  assert.deepStrictEqual((await call({ action: "INIT", flow_token: "t" })).plain, { screen: "UPLOAD", data: {} });
  assert.deepStrictEqual((await call({ action: "BACK", screen: "REVIEW", flow_token: "t" })).plain.screen, "UPLOAD");
  assert.deepStrictEqual((await call({ action: "data_exchange", screen: "REVIEW", flow_token: "tok-1", data: {} })).plain,
    { screen: "SUCCESS", data: { extension_message_response: { params: { flow_token: "tok-1" } } } });
  assert.deepStrictEqual((await call({ action: "data_exchange", data: { error: "x", error_message: "y" } })).plain, { data: { acknowledged: true } });
  await cdn.close();
});

test("HTTP 421 on decryption failure; signature failure rejected before decryption", async () => {
  const { call, cdn } = await setup();
  assert.strictEqual((await call({ action: "ping" }, { mutate: (b) => ({ ...b, encrypted_flow_data: Buffer.alloc(40, 1).toString("base64") }) })).res.status, 421);
  assert.strictEqual((await call({ action: "ping" }, { signed: false })).res.status, 432);
  await cdn.close();
});

test("upload screen: processes files, returns REVIEW with page total and the exact colour message; pricing exposes rates, never a total", async () => {
  const { call, cdn } = await setup();
  const documents = [f.addDocument(cdn, "a.pdf", await f.makePdf(4)), f.addDocument(cdn, "b.png", f.makePng(16, 16))];
  const { plain } = await call({ action: "data_exchange", screen: "UPLOAD", flow_token: "t", data: { documents, color: "color", copies: 2 } });
  assert.strictEqual(plain.screen, "REVIEW");
  assert.strictEqual(plain.data.total_pages, 5);
  assert.strictEqual(plain.data.color_notice, COLOR_MSG);
  assert.strictEqual(plain.data.pricing_status, "MISSING_INTERFACE:priceOrder");
  const bw = await call({ action: "data_exchange", screen: "UPLOAD", flow_token: "t2", data: { documents, color: "bw" } });
  assert.strictEqual(bw.plain.data.color_notice, "");
  await cdn.close();
});

test("a failing file never becomes a successful completion", async () => {
  const { call, cdn } = await setup();
  const good = await f.makePdf(2);
  const documents = [f.addDocument(cdn, "ok.pdf", good), f.addDocument(cdn, "bad.pdf", good, (e) => e.subarray(0, 30))];
  const { plain } = await call({ action: "data_exchange", screen: "UPLOAD", flow_token: "t", data: { documents } });
  assert.strictEqual(plain.screen, "UPLOAD");
  assert.match(plain.data.error_message, /Could not process 1 file/);
  assert.strictEqual(plain.data.total_pages, undefined);
  await cdn.close();
});

test("retry/duplicate simulation: identical requests give identical outcomes with one execution", async () => {
  const { call, cdn, idempotency } = await setup();
  const documents = [f.addDocument(cdn, "a.pdf", await f.makePdf(3))];
  const payload = { action: "data_exchange", screen: "UPLOAD", flow_token: "dup", data: { documents } };
  const [a, b, c] = await Promise.all([call(payload), call(payload), call(payload)]); // concurrent duplicates
  const d = await call(payload); // later retry
  for (const x of [b, c, d]) assert.deepStrictEqual(x.plain, a.plain);
  assert.strictEqual(idempotency.stats.executions, 1);
  assert.strictEqual(idempotency.stats.joined + idempotency.stats.replays, 3);
  await cdn.close();
});

test("exception between stages -> HTTP 500, nothing cached as success, and the retry then succeeds", async () => {
  let boom = true;
  const pricing = async (db, args) => { if (boom) { boom = false; throw new Error("transient"); } return pricingContext(db, args); };
  const { cdn, idempotency, deps } = await setup();
  const handle = createFlowHandler({ privateKeyPem: keys.privateKey, appSecrets: [f.TEST_APP_SECRET], deps, db: f.stubDb(), idempotency, pricing });
  try {
    const documents = [f.addDocument(cdn, "a.pdf", await f.makePdf(2))];
    const payload = { action: "data_exchange", screen: "UPLOAD", flow_token: "retry", data: { documents } };
    const send = async () => {
      const req = f.buildEncryptedRequest(payload, keys.publicKey);
      const raw = Buffer.from(JSON.stringify(req.body));
      const res = await handle(raw, { "x-hub-signature-256": f.sign(raw) });
      return { res, plain: res.status === 200 ? f.decryptResponse(res.body, req.aesKey, req.iv) : null };
    };
    const first = await send();
    assert.strictEqual(first.res.status, 500);
    assert.strictEqual(first.plain, null);
    assert.strictEqual(idempotency.size(), 0);
    const second = await send();
    assert.strictEqual(second.res.status, 200);
    assert.strictEqual(second.plain.screen, "REVIEW");
    assert.strictEqual(idempotency.stats.executions, 2);
  } finally { await cdn.close(); }
});

test("repository loadPricing fails open to defaults when the settings read throws (so pricing cannot 500 the Flow)", async () => {
  const ctx = await pricingContext({ collection: () => { throw new Error("db down"); } }, { totalRawPages: 1, colorMode: "bw", copies: 1 });
  assert.strictEqual(ctx.rates.pricePerPageBW, 2.8);
});

test("pricing adapter reuses the repository's loadPricing/sanitizeRates (rates only)", async () => {
  const ctx = await pricingContext(f.stubDb({ pricePerPageBW: 3.1, pricePerPageColor: -5 }), { totalRawPages: 10, colorMode: "bw", copies: 1 });
  assert.strictEqual(ctx.rates.pricePerPageBW, 3.1);
  assert.strictEqual(ctx.rates.pricePerPageColor, 10); // invalid value falls back to the repo default, proving the real sanitizer ran
  assert.strictEqual(ctx.total, null);
});
