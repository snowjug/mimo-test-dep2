// GET /admin/issues (adminInsights.controller.getAdminIssues): the dated, deduplicated issue history for the admin
// dashboard, with live alerts kept in a separate `current` list. Read-only; no customer contact details.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

process.env.JWT_SECRET = "admin-issues-test-secret-fixture-32chars"; // must be >= 32 chars (see src/config/env.js)
const fake = createFakeFirestore();
fake.install();
const { getAdminIssues } = require("../src/controllers/adminInsights.controller");

const FROM = new Date("2026-10-01T00:00:00+05:30");
const TO = new Date("2026-10-02T00:00:00+05:30");
const at = (hhmm) => new Date(`2026-10-01T${hhmm}:00+05:30`);
const RANGE = { from: FROM.toISOString(), to: TO.toISOString(), tzOffset: "330" };

function response() {
  return { code: 200, body: undefined, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}
const issues = async (query = {}) => { const res = response(); await getAdminIssues({ query: { ...RANGE, ...query } }, res); return res; };

const SEED = {
  print_jobs: {
    j1: { kioskId: "CV-001", userId: "u1", userEmail: "student@example.com", userPhone: "9999999999", status: "failed", printerStatus: "Printer out of paper", orderId: "o1", createdAt: at("09:00"), failedAt: at("09:02") },
    j2: { kioskId: "SV-002", userId: "u2", status: "completed", createdAt: at("10:00"), printCode: "4321", customerIssue: { type: "faint", label: "Too faint or streaky", kioskId: "SV-002", verdict: "needs_proof", evidence: "cannot see ink", reportedAt: at("10:20") } },
    j3: { kioskId: "SV-002", userId: "u2", status: "completed", createdAt: at("10:01"), printCode: "4321", customerIssue: { type: "faint", label: "Too faint or streaky", kioskId: "SV-002", verdict: "needs_proof", evidence: "cannot see ink", reportedAt: at("10:20") } },
    j4: { kioskId: "SV-002", userId: "u3", status: "failed", printerStatus: "Print timeout: Printer not responding (check power/cable)", createdAt: at("11:00") },
    j5: { kioskId: "CV-001", userId: "u4", status: "completed", createdAt: new Date("2026-09-30T12:00:00+05:30") }, // outside the range
  },
  refund_requests: {
    r1: { orderId: "o1", userId: "u1", status: "pending", amount: 6, requestedAt: at("09:30") },
    r2: { orderId: "o7", userId: "u5", status: "pending", amount: 4, reason: "Never printed", requestedAt: at("12:00") },
  },
  system_status: { "CV-001": { lastSeen: new Date(), printerStatus: "B&W: Paused/Error | Color: Paused/Error" } },
};

test("returns deduplicated issues for the range with categories, basis and evidence", async () => {
  fake.reset(SEED);
  const res = await issues();
  assert.strictEqual(res.code, 200);
  const b = res.body;
  assert.strictEqual(b.total, 4, "j1 failure (+ r1 attached), one report on j2+j3, j4 timeout, r2 payment");
  const byId = Object.fromEntries(b.issues.map((i) => [i.id, i]));
  assert.strictEqual(byId["job-j1"].category, "paper");
  assert.strictEqual(byId["job-j1"].basis, "inferred");
  assert.strictEqual(byId["job-j1"].machineName, "MIMO 1.0");
  assert.strictEqual(byId["job-j1"].related[0].type, "refund_request");
  assert.strictEqual(byId["job-j4"].category, "timeout");
  assert.strictEqual(byId["job-j4"].basis, "exact");
  const report = b.issues.find((i) => i.source === "customer_report");
  assert.deepStrictEqual(report.jobIds.sort(), ["j2", "j3"]);
  assert.strictEqual(report.basis, "customer");
  assert.strictEqual(byId["refund-r2"].category, "payment");
  assert.ok(b.issues.every((i) => i.rangeMs === undefined), "internal range key is not exposed");
  assert.strictEqual(b.counts.total, 4);
  assert.strictEqual(b.categories.length, 9);
});

test("never includes customer contact details", async () => {
  fake.reset(SEED);
  const text = JSON.stringify((await issues()).body);
  assert.ok(!text.includes("student@example.com"));
  assert.ok(!text.includes("9999999999"));
});

test("filters by category, machine and source; counts stay for the whole range", async () => {
  fake.reset(SEED);
  const byCat = (await issues({ category: "timeout" })).body;
  assert.deepStrictEqual(byCat.issues.map((i) => i.id), ["job-j4"]);
  assert.strictEqual(byCat.total, 1);
  assert.strictEqual(byCat.counts.total, 4);
  assert.deepStrictEqual((await issues({ kioskId: "CV-001" })).body.issues.map((i) => i.id), ["job-j1"]);
  assert.deepStrictEqual((await issues({ source: "refund_request" })).body.issues.map((i) => i.id), ["refund-r2"]);
});

test("limit truncates and reports it", async () => {
  fake.reset(SEED);
  const b = (await issues({ limit: "2" })).body;
  assert.strictEqual(b.issues.length, 2);
  assert.strictEqual(b.total, 4);
  assert.strictEqual(b.truncated, true);
});

test("live alerts are separate from the dated history and can be skipped", async () => {
  fake.reset(SEED);
  const b = (await issues()).body;
  const ids = b.current.map((a) => a.id);
  assert.ok(ids.includes("now-printer-CV-001"), "paused queue from the heartbeat's printerStatus");
  assert.ok(ids.includes("now-offline-SV-002"), "no heartbeat seeded for SV-002");
  assert.strictEqual(b.total, 4, "current alerts are not counted in the range");
  assert.deepStrictEqual((await issues({ current: "0" })).body.current, []);
});

test("rejects an invalid range with 400", async () => {
  fake.reset(SEED);
  const res = await issues({ from: "nope" });
  assert.strictEqual(res.code, 400);
});

test("the route exists behind the admin auth middleware", () => {
  const app = require("../src/server");
  let chain = null;
  for (const layer of (app.router || app._router).stack) {
    const stack = layer.route ? [layer] : layer.handle && layer.handle.stack ? layer.handle.stack.filter((l) => l.route) : [];
    for (const l of stack) if (l.route.path === "/admin/issues" && l.route.methods.get) chain = l.route.stack.map((s) => s.name || "anonymous");
  }
  assert.ok(chain, "GET /admin/issues exists");
  assert.ok(chain.length >= 2 && chain[0] === "adminAuthMiddleware", `auth before handler (got: ${chain && chain.join(" -> ")})`);
});
