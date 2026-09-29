// The kiosk summary screen asks "Did your pages print correctly?". A "no" posts to /kiosk/report-problem, which
// flags the order and emails the team once. It never refunds by itself, and only accepts a report for a print from
// the last 30 minutes at the same kiosk, so an old or foreign code cannot be used to raise false complaints.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

const fake = createFakeFirestore();
fake.install();
const { isColorJob } = require("../src/services/printJob.service");
const { createKioskRouter, judgeReport } = require("../src/routes/kiosk.routes");

const emails = [];
let failEmail = false;
const router = createKioskRouter({
  db: fake.db, admin: fake.admin, isColorJob, CASHFREE_BASE_URL: "", cashfreeHeaders: {}, axios: null,
  sendIssueEmail: async (msg) => { if (failEmail) throw new Error("smtp down"); emails.push(msg); },
});
const layer = router.stack.find((l) => l.route && l.route.path === "/report-problem" && l.route.methods.post).route.stack;
const reportProblem = layer[layer.length - 1].handle; // skip the rate limiter

function response() {
  return { code: 200, body: undefined, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, set() { return this; } };
}
const job = (over = {}) => ({
  printCode: "4821", kioskId: "CV-001", userId: "u1", status: "completed", pageCount: 3, copies: 4, colorMode: "bw",
  printVerified: true, sheetsVerified: 12, printedAt: new Date(), ...over,
});
const post = async (body) => { const res = response(); await reportProblem({ body }, res); return res; };

test.beforeEach(() => { emails.length = 0; failEmail = false; });

test("a report flags the order and emails the team once, without refunding", async () => {
  fake.reset({ print_jobs: { j1: job() } });
  const res = await post({ printCode: "4821", kioskId: "CV-001", issue: "blank" });
  assert.deepStrictEqual(res.body, { received: true });
  const saved = fake.data("print_jobs").j1;
  assert.strictEqual(saved.customerIssue.type, "blank");
  assert.strictEqual(saved.customerIssue.label, "Blank pages");
  assert.strictEqual(saved.customerIssue.kioskId, "CV-001");
  assert.strictEqual(saved.status, "completed", "no automatic refund or status change");
  assert.strictEqual(emails.length, 1);
  assert.strictEqual(emails[0].issue, "Blank pages");
  assert.strictEqual(emails[0].jobs[0].id, "j1");
});

test("reporting the same print twice does not send a second email", async () => {
  fake.reset({ print_jobs: { j1: job() } });
  await post({ printCode: "4821", kioskId: "CV-001", issue: "blank" });
  const again = await post({ printCode: "4821", kioskId: "CV-001", issue: "faint" });
  assert.deepStrictEqual(again.body, { received: true });
  assert.strictEqual(emails.length, 1);
  assert.strictEqual(fake.data("print_jobs").j1.customerIssue.type, "blank", "first report is kept");
});

test("bad input is rejected", async () => {
  fake.reset({ print_jobs: { j1: job() } });
  assert.strictEqual((await post({ printCode: "48", kioskId: "CV-001", issue: "blank" })).code, 400);
  assert.strictEqual((await post({ printCode: "4821", kioskId: "CV-001", issue: "refund-me" })).code, 400);
  assert.strictEqual((await post({})).code, 400);
  assert.strictEqual(emails.length, 0);
});

test("an old print or one from the other kiosk cannot be reported", async () => {
  fake.reset({ print_jobs: { j1: job({ printedAt: new Date(Date.now() - 45 * 60 * 1000) }) } });
  assert.strictEqual((await post({ printCode: "4821", kioskId: "CV-001", issue: "blank" })).code, 404);
  fake.reset({ print_jobs: { j1: job() } });
  assert.strictEqual((await post({ printCode: "4821", kioskId: "SV-002", issue: "blank" })).code, 404);
  assert.strictEqual(emails.length, 0);
});

test("the report is still saved when the email cannot be sent", async () => {
  fake.reset({ print_jobs: { j1: job() } });
  failEmail = true;
  const res = await post({ printCode: "4821", kioskId: "CV-001", issue: "missing" });
  assert.deepStrictEqual(res.body, { received: true });
  assert.strictEqual(fake.data("print_jobs").j1.customerIssue.type, "missing");
});

test("the email carries what the printer proved", async () => {
  fake.reset({ print_jobs: { j1: job() } });
  await post({ printCode: "4821", kioskId: "CV-001", issue: "missing" });
  assert.strictEqual(emails[0].judgement.verdict, "contradicted");
  assert.match(emails[0].judgement.note, /counted all 12 sheet/);
  assert.strictEqual(fake.data("print_jobs").j1.customerIssue.verdict, "contradicted");
  assert.deepStrictEqual(emails[0].history, { prints: 0, reports: 0 });
});

test("verdicts: missing pages are checked against the counter, blank pages need the paper", () => {
  assert.strictEqual(judgeReport("missing", { printVerified: true, sheetsVerified: 4 }).verdict, "contradicted");
  assert.strictEqual(judgeReport("missing", {}).verdict, "unverified");
  assert.strictEqual(judgeReport("blank", { printVerified: true, sheetsVerified: 4 }).verdict, "needs_proof");
  assert.strictEqual(judgeReport("faint", {}).verdict, "needs_proof");
  assert.strictEqual(judgeReport("blank", { status: "refunded" }).verdict, "already_failed");
});

test("a customer who keeps reporting is recorded but no longer emails the team", async () => {
  const old = (id) => job({ printCode: "1111", createdAt: new Date(Date.now() - 86400000), customerIssue: { type: "blank", reportedAt: new Date(Date.now() - 86400000) } });
  fake.reset({ print_jobs: { a: old(), b: old(), c: old(), j1: job({ createdAt: new Date() }) } });
  const res = await post({ printCode: "4821", kioskId: "CV-001", issue: "blank" });
  assert.deepStrictEqual(res.body, { received: true });
  assert.strictEqual(emails.length, 0);
  const saved = fake.data("print_jobs").j1.customerIssue;
  assert.strictEqual(saved.muted, true);
  assert.strictEqual(saved.earlierReports, 3);
});

test("two earlier reports still email, with the history in it", async () => {
  const old = () => job({ printCode: "1111", createdAt: new Date(Date.now() - 86400000), customerIssue: { type: "blank", reportedAt: new Date(Date.now() - 86400000) } });
  fake.reset({ print_jobs: { a: old(), b: old(), j1: job({ createdAt: new Date() }) } });
  await post({ printCode: "4821", kioskId: "CV-001", issue: "blank" });
  assert.strictEqual(emails.length, 1);
  assert.deepStrictEqual(emails[0].history, { prints: 2, reports: 2 });
});
