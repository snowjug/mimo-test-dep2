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
const { createKioskRouter } = require("../src/routes/kiosk.routes");

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
  printCode: "4821", kioskId: "CV-001", status: "completed", pageCount: 3, copies: 4, colorMode: "bw",
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
