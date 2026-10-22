// Finance expense ledger: create / list / update / reverse. These handlers had no tests and dragged
// admin.controller.js below its branch-coverage ratchet in CI.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

process.env.JWT_SECRET = "characterization-test-secret-fixture-32ch"; // must be >= 32 chars (see src/config/env.js)
process.env.CASHFREE_ENV = "sandbox";

const fake = createFakeFirestore();
fake.install();
const {
  getAdminExpenses, postAdminExpense, patchAdminExpense, deleteAdminExpense,
} = require("../src/controllers/admin.controller");

function response() {
  return { code: 200, body: undefined,
    status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}
const call = async (handler, req) => { const res = response(); await handler({ query: {}, params: {}, body: {}, ...req }, res); return res; };

test("creating an expense rejects a missing or non-positive amount", async () => {
  fake.reset({});
  for (const amount of [undefined, 0, -5, "abc"]) {
    const res = await call(postAdminExpense, { body: { amount, date: "2026-10-01", category: "Paper" } });
    assert.strictEqual(res.code, 400, `amount=${amount}`);
  }
});

test("creating an expense rejects a bad date and a blank category", async () => {
  fake.reset({});
  assert.strictEqual((await call(postAdminExpense, { body: { amount: 10, date: "01-10-2026", category: "Paper" } })).code, 400);
  assert.strictEqual((await call(postAdminExpense, { body: { amount: 10, category: "Paper" } })).code, 400);
  assert.strictEqual((await call(postAdminExpense, { body: { amount: 10, date: "2026-10-01", category: "  " } })).code, 400);
});

test("a valid expense is stored in paise-accurate form with defaults filled in", async () => {
  fake.reset({});
  const res = await call(postAdminExpense, { body: { amount: "12.345", date: "2026-10-05", category: " Paper ", description: "A4 ream" } });
  assert.strictEqual(res.code, 201);
  assert.strictEqual(res.body.category, "Paper");
  assert.strictEqual(res.body.amount, 12.35);
  assert.strictEqual(res.body.amountPaise, 1235);
  assert.strictEqual(res.body.paidBy, "Company");
  assert.strictEqual(res.body.status, "approved");
  assert.strictEqual(res.body.monthKey, "2026-10");
  assert.strictEqual(res.body.year, 2026);
  assert.strictEqual(res.body.isReversed, false);
  assert.ok(fake.data("expense_ledger")[res.body.id], "written to expense_ledger");
});

test("an expense saved as a draft stays a draft; any other status becomes approved", async () => {
  fake.reset({});
  const draft = await call(postAdminExpense, { body: { amount: 5, date: "2026-10-05", category: "Ink", status: "draft", reference: "INV-1", notes: "n" } });
  assert.strictEqual(draft.body.status, "draft");
  assert.strictEqual(draft.body.reference, "INV-1");
  const other = await call(postAdminExpense, { body: { amount: 5, date: "2026-10-05", category: "Ink", status: "whatever" } });
  assert.strictEqual(other.body.status, "approved");
  assert.strictEqual(other.body.reference, null);
});

test("the expense list filters, sorts newest first and excludes reversed rows from the total", async () => {
  fake.reset({
    expense_ledger: {
      a: { date: "2026-10-01", category: "Paper", monthKey: "2026-10", year: 2026, amount: 100, isReversed: false },
      b: { date: "2026-10-09", category: "Paper", monthKey: "2026-10", year: 2026, amount: 50.5, isReversed: false },
      c: { date: "2026-10-05", category: "Paper", monthKey: "2026-10", year: 2026, amount: 999, isReversed: true },
      d: { date: "2026-09-20", category: "Ink", monthKey: "2026-09", year: 2026, amount: 10, isReversed: false },
    },
  });
  const all = await call(getAdminExpenses, {});
  assert.deepStrictEqual(all.body.expenses.map((e) => e.id), ["b", "c", "a", "d"]);
  assert.strictEqual(all.body.totalAmount, 160.5);

  const filtered = await call(getAdminExpenses, { query: { category: "Paper", monthKey: "2026-10", year: "2026" } });
  assert.deepStrictEqual(filtered.body.expenses.map((e) => e.id).sort(), ["a", "b", "c"]);
  assert.strictEqual(filtered.body.totalAmount, 150.5);
});

test("updating an expense changes only the supplied fields and validates the amount", async () => {
  fake.reset({ expense_ledger: { e1: { date: "2026-10-01", category: "Paper", monthKey: "2026-10", year: 2026, amount: 100, status: "approved" } } });
  assert.strictEqual((await call(patchAdminExpense, { params: {} })).code, 400);
  assert.strictEqual((await call(patchAdminExpense, { params: { id: "missing" } })).code, 404);
  assert.strictEqual((await call(patchAdminExpense, { params: { id: "e1" }, body: { amount: -1 } })).code, 400);

  const res = await call(patchAdminExpense, { params: { id: "e1" }, body: {
    date: "2026-11-03", category: " Toner ", description: " d ", amount: 20.1, paidBy: " Ops ", reference: "", notes: "x", status: "draft",
  } });
  assert.strictEqual(res.code, 200);
  const saved = fake.data("expense_ledger").e1;
  assert.strictEqual(saved.monthKey, "2026-11");
  assert.strictEqual(saved.year, 2026);
  assert.strictEqual(saved.category, "Toner");
  assert.strictEqual(saved.amountPaise, 2010);
  assert.strictEqual(saved.paidBy, "Ops");
  assert.strictEqual(saved.reference, null);
  assert.strictEqual(saved.status, "draft");
});

test("reversing an expense marks it rejected instead of deleting it", async () => {
  fake.reset({ expense_ledger: { e1: { date: "2026-10-01", category: "Paper", amount: 100, isReversed: false, status: "approved" } } });
  assert.strictEqual((await call(deleteAdminExpense, { params: {} })).code, 400);
  assert.strictEqual((await call(deleteAdminExpense, { params: { id: "nope" } })).code, 404);

  const res = await call(deleteAdminExpense, { params: { id: "e1" }, admin: { email: "fin@example.com" } });
  assert.strictEqual(res.code, 200);
  const saved = fake.data("expense_ledger").e1;
  assert.strictEqual(saved.isReversed, true);
  assert.strictEqual(saved.status, "rejected");
  assert.strictEqual(saved.reversedBy, "fin@example.com");
});
