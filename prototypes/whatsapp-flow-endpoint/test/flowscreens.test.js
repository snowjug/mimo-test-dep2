"use strict";
// Flow definition + screen-transition tests. Synthetic files and test-only credentials; no network beyond a
// loopback fixture CDN. Nothing here can create orders, take payment or print.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { createFlowHandler } = require("../src/flowHandler");
const { createCdnFetcher } = require("../src/cdn");
const { createIdempotency } = require("../src/idempotency");
const { pricingContext } = require("../src/pricingAdapter");
const { COLOR_NOTICE, SCREENS, MAX_COPIES } = require("../src/flowContract");
const { validateFlow } = require("../flow/validate-flow");
const f = require("./fixtures");

const FLOW_PATH = path.join(__dirname, "..", "flow", "mimo-print.flow.json");
const VALIDATOR = path.join(__dirname, "..", "flow", "validate-flow.js");
const flow = () => JSON.parse(fs.readFileSync(FLOW_PATH, "utf8"));
const keys = f.generateKeys();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Flow JSON: structure ----------
test("the shipped Flow JSON passes the local structural validator", () => {
  const { errors } = validateFlow(flow());
  assert.deepStrictEqual(errors, []);
});

test("validator: catches duplicate ids, bad targets, missing routing, unknown references, unreachable and misplaced complete", () => {
  const mutate = (fn) => { const x = flow(); fn(x); return validateFlow(x).errors.join(" | "); };
  assert.match(mutate((x) => { x.screens[1].id = "UPLOAD"; }), /duplicate screen id "UPLOAD"/);
  assert.match(mutate((x) => { x.screens[0].layout.children[0].children[3]["on-click-action"].next.name = "NOWHERE"; }), /unknown screen "NOWHERE"/);
  assert.match(mutate((x) => { delete x.routing_model.REVIEW; }), /no entry for screen "REVIEW"/);
  assert.match(mutate((x) => { x.routing_model.UPLOAD = []; }), /missing from routing_model\.UPLOAD/);
  assert.match(mutate((x) => { x.screens[2].layout.children[1].text = "${data.nope}"; }), /does not declare/);
  assert.match(mutate((x) => { x.screens[1].layout.children[0].children[3]["on-click-action"].payload.color = "${form.ghost}"; }), /no such field/);
  assert.match(mutate((x) => { x.routing_model.CONFIGURE = []; }), /unreachable/);
  assert.match(mutate((x) => { x.screens[2].layout.children[3]["on-click-action"] = { name: "complete", payload: {} }; }), /only valid on a terminal screen/);
  assert.match(mutate((x) => { x.screens[4].terminal = false; }), /no terminal screen/);
  assert.match(mutate((x) => { delete x.data_api_version; }), /data_api_version/);
  assert.match(mutate((x) => { x.screens[1].layout.children[0].children.push({ type: "TextBody", name: "color", text: "x" }); }), /duplicate component name "color"/);
  assert.match(mutate((x) => { x.screens[0].layout.children[0].children[3]["on-click-action"].name = "teleport"; }), /unknown action "teleport"/);
});

test("validator CLI: exit 0 for the real Flow, 1 for an invalid Flow, 2 for unparseable input", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flowtest-cli-"));
  try {
    const run = (file) => spawnSync(process.execPath, file ? [VALIDATOR, file] : [VALIDATOR], { encoding: "utf8" });
    assert.strictEqual(run().status, 0);
    const bad = flow(); bad.screens.push({ ...bad.screens[0] });
    fs.writeFileSync(path.join(dir, "dup.json"), JSON.stringify(bad));
    const r = run(path.join(dir, "dup.json"));
    assert.strictEqual(r.status, 1);
    assert.match(r.stdout, /duplicate screen id/);
    fs.writeFileSync(path.join(dir, "broken.json"), "{ not json");
    assert.strictEqual(run(path.join(dir, "broken.json")).status, 2);
    assert.strictEqual(run(path.join(dir, "missing.json")).status, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------- Flow JSON: product rules ----------
const allStrings = (v, out = []) => { if (typeof v === "string") out.push(v); else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out)); else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => { out.push(k); allStrings(x, out); }); return out; };

test("Flow screens match the handler's screen IDs and the exact colour notice appears once, verbatim", () => {
  assert.deepStrictEqual(flow().screens.map((s) => s.id), Object.values(SCREENS));
  const hits = allStrings(flow()).filter((s) => s.includes("Color printing is available"));
  assert.deepStrictEqual(hits, [COLOR_NOTICE]);
  assert.strictEqual(COLOR_NOTICE, "🎨 Color printing is available only at MIMO 2.0. Your job will be routed automatically to MIMO 2.0.");
  const cond = flow().screens[1].layout.children[0].children.find((c) => c.type === "If");
  assert.strictEqual(cond.condition, "${form.color} == 'color'");
});

test("no printer selection: no kiosk ids, MIMO 1.0, destination or printer choice anywhere except the required notice", () => {
  const DISCLAIMER = "This was a simulated workflow. No order was created, no payment was collected and nothing was sent to a printer.";
  const strings = allStrings(flow()).filter((s) => s !== COLOR_NOTICE);
  for (const s of strings) assert.doesNotMatch(s, /kiosk|CV-001|SV-00\d|MIMO 1\.0|destination/i, s);
  for (const s of strings.filter((x) => x !== DISCLAIMER)) assert.doesNotMatch(s, /printer/i, s); // the word may appear only in the confirmation disclaimer
  const types = JSON.stringify(flow());
  assert.doesNotMatch(types, /"name":\s*"(printer|kiosk|destination)/i);
});

test("copies dropdown offers exactly 1..MAX_COPIES; colour offers exactly bw/color; no duplex or total-price fields", () => {
  const comps = flow().screens[1].layout.children[0].children;
  const copies = comps.find((c) => c.name === "copies");
  assert.deepStrictEqual(copies["data-source"].map((o) => o.id), Array.from({ length: MAX_COPIES }, (_, i) => String(i + 1)));
  assert.deepStrictEqual(comps.find((c) => c.name === "color")["data-source"].map((o) => o.id), ["bw", "color"]);
  assert.doesNotMatch(JSON.stringify(flow()), /duplex|total_price|order_total|"price"/i);
});

test("upload screen declares the supported types/limits and does not claim validation at pick time", () => {
  const picker = flow().screens[0].layout.children[0].children.find((c) => c.type === "DocumentPicker");
  assert.deepStrictEqual(picker["allowed-mime-types"], ["application/pdf", "image/jpeg", "image/png"]);
  assert.ok(picker["max-uploaded-documents"] <= 30 && picker["max-file-size-kb"] <= 25600);
  assert.match(allStrings(flow().screens[0]).join(" "), /does not mean it is valid/);
});

test("the confirmation screen is labelled as an internal test and claims no payment or printing", () => {
  const txt = allStrings(flow().screens.find((s) => s.id === "SUCCESS")).join(" ");
  assert.match(txt, /simulated/i);
  assert.match(txt, /No order was created, no payment was collected/);
  assert.doesNotMatch(txt, /paid|printed successfully|payment (successful|received)/i);
});

test("src/ requires nothing from payment, Cashfree, Firebase, kiosk or the production WhatsApp code", () => {
  const dir = path.join(__dirname, "..", "src");
  for (const file of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, file), "utf8");
    for (const m of src.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) assert.doesNotMatch(m[1], /payment|cashfree|firebase|kiosk|whatsapp\.(controller|service|routes)|printJob|admin/i, `${file}: ${m[1]}`);
  }
});

// ---------- Handler: screen transitions ----------
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }

/** Records every database call; any write throws so a test-mode write cannot go unnoticed. */
function recordingDb(rates = { pricePerPageBW: 3.1, pricePerPageColor: 12 }) {
  const log = { reads: [], writes: 0 };
  const writer = () => { log.writes++; throw new Error("WRITE ATTEMPTED IN TEST MODE"); };
  return {
    log,
    collection: (name) => ({ doc: (id) => ({ get: async () => { log.reads.push(`${name}/${id}`); return { exists: true, data: () => rates }; }, set: writer, update: writer, delete: writer }), add: writer, set: writer }),
  };
}

async function setup(over = {}) {
  const cdn = await f.startFixtureCdn();
  const real = createCdnFetcher({ allowLoopbackHttp: true, maxBytes: 30 * 1024 * 1024 });
  const stats = { fetches: 0 };
  const gate = over.gate;
  const deps = { fetchCdn: async (...a) => { stats.fetches++; if (gate) await gate.promise; return real(...a); } };
  const db = over.db || recordingDb();
  const idempotency = over.noIdempotency ? undefined : createIdempotency();
  const handle = createFlowHandler({ privateKeyPem: keys.privateKey, appSecrets: [f.TEST_APP_SECRET], deps, db, idempotency, ...(over.handler || {}) });
  const call = async (payload) => {
    const req = f.buildEncryptedRequest(payload, keys.publicKey);
    const raw = Buffer.from(JSON.stringify(req.body));
    const res = await handle(raw, { "x-hub-signature-256": f.sign(raw) });
    return { res, plain: res.status === 200 ? f.decryptResponse(res.body, req.aesKey, req.iv) : null };
  };
  const exchange = (screen, token, data) => call({ action: "data_exchange", screen, flow_token: token, data });
  const submit = async (token, documents, extra = {}) => exchange("CONFIGURE", token, { documents, color: "bw", copies: "1", ...extra });
  const poll = async (token, { max = 150 } = {}) => {
    for (let i = 0; i < max; i++) { const r = await exchange("PROCESSING", token, { requested: "status" }); if (r.plain.screen !== "PROCESSING") return r; await sleep(20); }
    throw new Error("still PROCESSING after polling budget");
  };
  return { cdn, call, exchange, submit, poll, db, stats, idempotency, close: () => cdn.close() };
}

const routing = flow().routing_model;
const assertRoute = (from, to) => assert.ok((routing[from] || []).includes(to), `server routed ${from} -> ${to}, not allowed by routing_model`);

test("full path UPLOAD -> CONFIGURE -> PROCESSING -> REVIEW -> SUCCESS (B&W), every hop allowed by routing_model", async () => {
  const t = await setup();
  try {
    assert.deepStrictEqual((await t.call({ action: "INIT", flow_token: "tok-a" })).plain, { screen: "UPLOAD", data: {} });
    const docs = [f.addDocument(t.cdn, "a.pdf", await f.makePdf(3)), f.addDocument(t.cdn, "b.png", f.makePng(16, 16))];
    const s = await t.submit("tok-a", docs, { copies: "2" });
    assert.strictEqual(s.plain.screen, "PROCESSING"); assertRoute("CONFIGURE", "PROCESSING");
    assert.match(s.plain.data.status_text, /Check status/);
    const r = await t.poll("tok-a");
    assert.strictEqual(r.plain.screen, "REVIEW"); assertRoute("PROCESSING", "REVIEW");
    const d = r.plain.data;
    assert.strictEqual(d.total_pages, 4);
    assert.strictEqual(d.total_pages_text, "Total pages: 4");
    assert.match(d.files_summary, /a\.pdf - 3 page\(s\)/);
    assert.match(d.files_summary, /b\.png - 1 page\(s\)/);
    assert.strictEqual(d.settings_text, "B&W, 2 copies");
    assert.strictEqual(d.show_color_notice, false);
    assert.strictEqual(d.color_notice, "");
    assert.strictEqual(d.rates_text, "Configured rate: Rs 3.1 per page (B&W)");
    assert.strictEqual(d.pricing_status, "MISSING_INTERFACE:priceOrder");
    assert.match(d.pricing_text, /not calculated/);
    for (const k of Object.keys(d)) assert.doesNotMatch(k, /^(total_price|order_total|amount|price)$/);
    const done = await t.exchange("REVIEW", "tok-a", { requested: "finish" });
    assert.deepStrictEqual(done.plain, { screen: "SUCCESS", data: { extension_message_response: { params: { flow_token: "tok-a" } } } });
    assertRoute("REVIEW", "SUCCESS");
    assert.strictEqual((await t.exchange("PROCESSING", "tok-a", {})).plain.data.error_message, "Session expired. Please upload your files again.");
  } finally { await t.close(); }
});

test("colour selection shows the exact notice on REVIEW and uses the colour rate", async () => {
  const t = await setup();
  try {
    const docs = [f.addDocument(t.cdn, "c.pdf", await f.makePdf(2))];
    await t.submit("tok-c", docs, { color: "color" });
    const d = (await t.poll("tok-c")).plain.data;
    assert.strictEqual(d.color_notice, COLOR_NOTICE);
    assert.strictEqual(d.show_color_notice, true);
    assert.strictEqual(d.settings_text, "Color, 1 copy");
    assert.strictEqual(d.rates_text, "Configured rate: Rs 12 per page (Color)");
  } finally { await t.close(); }
});

test("PROCESSING is an explicit poll: pending answers are never cached, then the same request returns REVIEW", async () => {
  const gate = deferred();
  const t = await setup({ gate });
  try {
    const docs = [f.addDocument(t.cdn, "slow.pdf", await f.makePdf(1))];
    await t.submit("tok-p", docs);
    const same = () => t.exchange("PROCESSING", "tok-p", { requested: "status" });
    const first = await same(); const second = await same();
    assert.strictEqual(first.plain.screen, "PROCESSING"); assert.strictEqual(second.plain.screen, "PROCESSING");
    assert.match(first.plain.data.status_text, /Still checking/);
    gate.resolve();
    let r; for (let i = 0; i < 150; i++) { r = await same(); if (r.plain.screen !== "PROCESSING") break; await sleep(20); }
    assert.strictEqual(r.plain.screen, "REVIEW"); // an identical request now gets a different, fresh answer
  } finally { gate.resolve(); await t.close(); }
});

test("unsupported / corrupt file: back to UPLOAD with a snackbar message, never REVIEW or SUCCESS; session then cleared", async () => {
  const t = await setup();
  try {
    const good = await f.makePdf(2);
    const docs = [f.addDocument(t.cdn, "ok.pdf", good), f.addDocument(t.cdn, "bad.pdf", good, (e) => e.subarray(0, 30)), f.addDocument(t.cdn, "deck.pptx", Buffer.from([0x50, 0x4b, 3, 4, ...Array(60).fill(1)]))];
    await t.submit("tok-bad", docs);
    const r = await t.poll("tok-bad");
    assert.strictEqual(r.plain.screen, "UPLOAD"); assertRoute("PROCESSING", "UPLOAD");
    assert.match(r.plain.data.error_message, /Could not process 2 file\(s\)/);
    assert.match(r.plain.data.error_message, /NEEDS_CONVERSION/);
    assert.strictEqual(r.plain.data.total_pages, undefined);
    assert.match((await t.exchange("PROCESSING", "tok-bad", {})).plain.data.error_message, /Session expired/);
  } finally { await t.close(); }
});

test("malformed CONFIGURE input is rejected on the right screen and never starts a job", async () => {
  const t = await setup();
  try {
    const docs = [f.addDocument(t.cdn, "a.pdf", await f.makePdf(1))];
    const bad = async (token, data, screen, re) => {
      const r = await t.exchange("CONFIGURE", token, data);
      assert.strictEqual(r.res.status, 200);
      assert.strictEqual(r.plain.screen, screen, JSON.stringify(data));
      assert.match(r.plain.data.error_message, re);
    };
    await bad("m1", { documents: "not-an-array", color: "bw", copies: "1" }, "UPLOAD", /at least one file/);
    await bad("m2", { documents: [], color: "bw", copies: "1" }, "UPLOAD", /at least one file/);
    await bad("m3", { color: "bw", copies: "1" }, "UPLOAD", /at least one file/);
    await bad("m4", { documents: docs, color: "rainbow", copies: "1" }, "CONFIGURE", /B&W or Color/);
    await bad("m5", { documents: docs, color: "bw", copies: "0" }, "CONFIGURE", /between 1 and 10/);
    await bad("m6", { documents: docs, color: "bw", copies: "11" }, "CONFIGURE", /between 1 and 10/);
    await bad("m7", { documents: docs, color: "bw", copies: "abc" }, "CONFIGURE", /between 1 and 10/);
    await bad("m8", { documents: docs, color: "bw", copies: "1.5" }, "CONFIGURE", /between 1 and 10/);
    await bad("m9", { documents: docs, color: "bw" }, "CONFIGURE", /between 1 and 10/);
    const noToken = await t.call({ action: "data_exchange", screen: "CONFIGURE", data: { documents: docs, color: "bw", copies: "1" } });
    assert.strictEqual(noToken.plain.screen, "UPLOAD"); assert.match(noToken.plain.data.error_message, /Session missing/);
    const nullData = await t.call({ action: "data_exchange", screen: "CONFIGURE", flow_token: "m10", data: null });
    assert.strictEqual(nullData.res.status, 200); assert.strictEqual(nullData.plain.screen, "UPLOAD");
    assert.strictEqual(t.stats.fetches, 0, "no download may start for rejected input");
  } finally { await t.close(); }
});

test("invalid navigation: status without a job, unknown screen, unknown action, SUCCESS has no exchange", async () => {
  const t = await setup();
  try {
    assert.strictEqual((await t.exchange("PROCESSING", "never-started", {})).plain.screen, "UPLOAD");
    assert.deepStrictEqual((await t.exchange("NOPE", "x", {})).plain, { screen: "NOPE", data: { error_message: "Unsupported request" } });
    assert.deepStrictEqual((await t.exchange("SUCCESS", "x", {})).plain, { screen: "SUCCESS", data: { error_message: "Unsupported request" } });
    assert.deepStrictEqual((await t.call({ action: "TELEPORT", flow_token: "x" })).plain, { screen: "UPLOAD", data: { error_message: "Unsupported request" } });
  } finally { await t.close(); }
});

test("duplicate submits run once: concurrent identical requests, and a repeat without the idempotency layer", async () => {
  for (const noIdempotency of [false, true]) {
    const t = await setup({ noIdempotency });
    try {
      const docs = [f.addDocument(t.cdn, "d.pdf", await f.makePdf(2))];
      const results = await Promise.all([t.submit("tok-d", docs), t.submit("tok-d", docs), t.submit("tok-d", docs)]);
      for (const r of results) assert.strictEqual(r.plain.screen, "PROCESSING");
      assert.strictEqual((await t.poll("tok-d")).plain.screen, "REVIEW");
      await t.submit("tok-d", docs); // late duplicate
      assert.strictEqual(t.stats.fetches, 1, `noIdempotency=${noIdempotency}: the file must be downloaded once`);
    } finally { await t.close(); }
  }
});

test("changing options with the same token starts a fresh job and the REVIEW reflects the new choice", async () => {
  const t = await setup();
  try {
    const docs = [f.addDocument(t.cdn, "e.pdf", await f.makePdf(1))];
    await t.submit("tok-e", docs); assert.strictEqual((await t.poll("tok-e")).plain.data.settings_text, "B&W, 1 copy");
    await t.submit("tok-e", docs, { color: "color", copies: "3" });
    const r = await t.poll("tok-e");
    assert.strictEqual(r.plain.data.settings_text, "Color, 3 copies");
    assert.strictEqual(r.plain.data.color_notice, COLOR_NOTICE);
  } finally { await t.close(); }
});

test("failure handling: a pricing exception surfaces as a retryable UPLOAD message (HTTP 200), not a fake REVIEW, and a retry succeeds", async () => {
  let boom = true;
  const pricing = async (db, args) => { if (boom) { boom = false; throw new Error("transient"); } return pricingContext(db, args); };
  const t = await setup({ handler: { pricing } });
  try {
    const docs = [f.addDocument(t.cdn, "g.pdf", await f.makePdf(1))];
    await t.submit("tok-g", docs);
    const r = await t.poll("tok-g");
    assert.strictEqual(r.res.status, 200);
    assert.strictEqual(r.plain.screen, "UPLOAD");
    assert.match(r.plain.data.error_message, /Something went wrong/);
    await t.submit("tok-g", docs);
    assert.strictEqual((await t.poll("tok-g")).plain.screen, "REVIEW");
  } finally { await t.close(); }
});

test("test-mode isolation: the whole journey only reads pricing settings; zero database writes", async () => {
  const db = recordingDb();
  const t = await setup({ db });
  try {
    const docs = [f.addDocument(t.cdn, "i.pdf", await f.makePdf(2))];
    await t.call({ action: "INIT", flow_token: "tok-i" });
    await t.submit("tok-i", docs, { color: "color" });
    assert.strictEqual((await t.poll("tok-i")).plain.screen, "REVIEW");
    assert.strictEqual((await t.exchange("REVIEW", "tok-i", {})).plain.screen, "SUCCESS");
    assert.strictEqual(db.log.writes, 0);
    assert.ok(db.log.reads.length >= 1 && db.log.reads.every((r) => r === "mimo_settings/pricing"), JSON.stringify(db.log.reads));
  } finally { await t.close(); }
});

test("legacy single-call UPLOAD route still works and shares the REVIEW shape", async () => {
  const t = await setup();
  try {
    const documents = [f.addDocument(t.cdn, "l.pdf", await f.makePdf(2))];
    const r = await t.exchange("UPLOAD", "tok-l", { documents, color: "color", copies: 2 });
    assert.strictEqual(r.plain.screen, "REVIEW");
    assert.strictEqual(r.plain.data.color_notice, COLOR_NOTICE);
    assert.strictEqual(r.plain.data.settings_text, "Color, 2 copies");
  } finally { await t.close(); }
});
