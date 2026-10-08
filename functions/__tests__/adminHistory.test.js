// The admin print history shows one status per job: printed, failed, or refunded. A refund can come from the automatic
// failure path, the admin panel (lands on the order only), or by hand in the Cashfree app (lands nowhere in Firestore),
// so the history also asks Cashfree and caches the answer. Paper trays are 250 sheets and B&W paper left is computed
// from the printer's own page counter since the last refill.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

const fake = createFakeFirestore();
fake.install();
const { resolveRefunds, refundFromCashfree } = require("../src/services/refundSync.service");
const { jobOutcome, hardwareFor } = require("../src/controllers/adminInsights.controller");
const { postAdminRefillPaper } = require("../src/controllers/kioskCommands.controller");

const NOW = Date.parse("2026-09-29T12:00:00Z");
const job = (id, over = {}) => ({ id, orderId: `order_${id}`, cost: 2.8, status: "completed", createdAt: new Date(NOW - 3600e3), ...over });
const quietLog = { warn() {} };

test("a job refunded by hand in the Cashfree app shows as refunded", async () => {
  fake.reset({});
  const calls = [];
  const fetch = async (orderId) => { calls.push(orderId); return orderId === "order_a" ? [{ refund_status: "SUCCESS", refund_amount: 2.8, processed_at: "2026-09-29T11:30:00Z" }] : []; };
  const r = await resolveRefunds({ db: fake.db, jobs: [job("a"), job("b")], fetchCashfreeRefunds: fetch, now: NOW, log: quietLog });
  assert.deepStrictEqual(r.get("a"), { state: "refunded", amount: 2.8, at: "2026-09-29T11:30:00.000Z", source: "cashfree" });
  assert.strictEqual(r.get("b"), null);
  assert.deepStrictEqual(calls.sort(), ["order_a", "order_b"]);
  assert.strictEqual(fake.data("cashfree_refund_sync").order_a.result.state, "refunded");
});

test("Cashfree is asked at most once per 15 minutes per order, and never again once refunded", async () => {
  fake.reset({ cashfree_refund_sync: {
    order_a: { orderId: "order_a", checkedAt: new Date(NOW - 60e3), result: null },
    order_b: { orderId: "order_b", checkedAt: new Date(NOW - 20 * 60e3), result: null },
    order_c: { orderId: "order_c", checkedAt: new Date(NOW - 99 * 3600e3), result: { state: "refunded", amount: 2.8, source: "cashfree" } },
  } });
  const calls = [];
  const r = await resolveRefunds({ db: fake.db, jobs: [job("a"), job("b"), job("c")], fetchCashfreeRefunds: async (o) => { calls.push(o); return []; }, now: NOW, log: quietLog });
  assert.deepStrictEqual(calls, ["order_b"]);
  assert.strictEqual(r.get("c").state, "refunded");
});

test("an admin-panel refund on the order marks the printed job refunded without asking Cashfree", async () => {
  fake.reset({ orders: { o1: { orderId: "order_a", refundStatus: "SUCCESS", refundAmount: 2.8 } } });
  const calls = [];
  const r = await resolveRefunds({ db: fake.db, jobs: [job("a")], fetchCashfreeRefunds: async (o) => { calls.push(o); return []; }, now: NOW, log: quietLog });
  assert.strictEqual(r.get("a").state, "refunded");
  assert.strictEqual(r.get("a").source, "admin");
  assert.deepStrictEqual(calls, []);
});

test("free orders and Cashfree errors do not break the history", async () => {
  fake.reset({});
  const r = await resolveRefunds({ db: fake.db, jobs: [job("free", { cost: 0 }), job("x")], fetchCashfreeRefunds: async () => { throw new Error("timeout"); }, now: NOW, log: quietLog });
  assert.strictEqual(r.get("free"), null);
  assert.strictEqual(r.get("x"), null);
  assert.strictEqual(fake.data("cashfree_refund_sync").order_x.error, "timeout");
});

test("Cashfree refund list: success wins, pending is reported, cancelled is ignored", () => {
  assert.strictEqual(refundFromCashfree([{ refund_status: "CANCELLED" }]), null);
  assert.strictEqual(refundFromCashfree([{ refund_status: "PENDING", refund_amount: 5 }]).state, "pending");
  assert.strictEqual(refundFromCashfree([{ refund_status: "PENDING" }, { refund_status: "SUCCESS", refund_amount: 5 }]).state, "refunded");
  assert.strictEqual(refundFromCashfree(undefined), null);
});

test("status column: refunded beats failed beats printed", () => {
  assert.strictEqual(jobOutcome("completed", { state: "refunded" }), "refunded");
  assert.strictEqual(jobOutcome("failed", null), "failed");
  assert.strictEqual(jobOutcome("completed", null), "printed");
  assert.strictEqual(jobOutcome("printing", null), "printing");
  assert.strictEqual(jobOutcome("paid", null), "waiting");
});

test("status column: a job the customer uploaded/paid for and never claimed is its own outcome, not 'waiting'", () => {
  // retention.trigger.js sets these after the 24h cleanup: "pending" (never paid) -> "abandoned",
  // "paid" (paid, never printed) -> "expired". Both mean the same thing to an admin reading the list.
  assert.strictEqual(jobOutcome("abandoned", null), "abandoned");
  assert.strictEqual(jobOutcome("expired", null), "abandoned");
});

test("B&W trays are 250 sheets and paper left follows the printer's page counter", () => {
  const [bw] = hardwareFor({ "CV-001": { type: "bw", paperLevel: 500, paperCapacity: 500 } }, "CV-001");
  assert.strictEqual(bw.paperCapacity, 250);
  assert.strictEqual(bw.paperLevel, 250);
  const [tracked] = hardwareFor({ "CV-001": { type: "bw", paperLevel: 250, pageCount: 16500, paperRefillPageCount: 16440 } }, "CV-001");
  assert.strictEqual(tracked.paperLevel, 190);
  assert.strictEqual(tracked.paperTracked, true);
  const [colour] = hardwareFor({ "SV-002-COLOR": { type: "color", paperLevel: 40 } }, "SV-002");
  assert.strictEqual(colour.paperCapacity, 100);
});

test("a printer already live-decrementing paperLevel itself is trusted as-is, not double-corrected", () => {
  // Reproduces the live bug: CV-001 right now reports paperLevel=120 (already current, the Pi decrements it
  // directly and stamps lastPaperDeduction on every print) while also exposing pageCount/paperRefillPageCount.
  // Subtracting the page-counter delta on top of the already-current value drove the shown level to 0.
  const [selfReported] = hardwareFor({
    "CV-001": { type: "bw", paperLevel: 120, pageCount: 17477, paperRefillPageCount: 17318, lastPaperDeduction: { seconds: 1 } },
  }, "CV-001");
  assert.strictEqual(selfReported.paperLevel, 120);
  assert.strictEqual(selfReported.paperSource, "pi-live");
  assert.strictEqual(selfReported.paperTracked, true);

  // No lastPaperDeduction: the page-counter correction still applies (the newer, not-yet-deployed Pi
  // behaviour, where the Pi only reports a static pageCount and the backend computes paper left).
  const [computed] = hardwareFor({
    "CV-001": { type: "bw", paperLevel: 250, pageCount: 16500, paperRefillPageCount: 16440 },
  }, "CV-001");
  assert.strictEqual(computed.paperLevel, 190);
  assert.strictEqual(computed.paperSource, "computed");
});

test("refill sets the tray to 250 and remembers the page counter", async () => {
  fake.reset({ hardware: { printers: { "SV-002-BW": { type: "bw", pageCount: 5959, paperLevel: 12 } } } });
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await postAdminRefillPaper({ params: { kioskId: "SV-002" }, body: { printerKey: "SV-002-BW" } }, res);
  assert.deepStrictEqual(res.body, { printerKey: "SV-002-BW", paperLevel: 250, tracked: true });
  const saved = fake.data("hardware").printers["SV-002-BW"];
  assert.strictEqual(saved.paperLevel, 250);
  assert.strictEqual(saved.paperRefillPageCount, 5959);
  const bad = { ...res, code: 200 };
  await postAdminRefillPaper({ params: { kioskId: "SV-002" }, body: { printerKey: "CV-001" } }, bad);
  assert.strictEqual(bad.code, 400);
});
