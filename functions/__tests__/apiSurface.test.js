// API surface freeze: the list of METHOD + path the deployed API exposes is a contract with the website, kiosk,
// dashboards, Pis, Cashfree and Meta. This test fails when a route is added, removed or renamed by accident.
// Intentional change?  Run  UPDATE_SNAPSHOT=1 npm test  and commit the changed fixture with an explanation in the PR.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

createFakeFirestore().install(); // no real Firebase in tests
const app = require("../src/server");

const SNAPSHOT = path.join(__dirname, "fixtures", "route-table.json");

function collectRoutes() {
  const out = new Set();
  const stack = (app.router || app._router).stack;
  for (const layer of stack) {
    if (layer.route) {
      for (const m of Object.keys(layer.route.methods)) out.add(`${m.toUpperCase()} ${layer.route.path}`);
    } else if (layer.handle && layer.handle.stack) {
      // Sub-routers are mounted without a prefix except the kiosk router, which is mounted at /kiosk
      const isKiosk = layer.handle.stack.some((l) => l.route && l.route.path === "/job-status");
      for (const l of layer.handle.stack) {
        if (l.route) for (const m of Object.keys(l.route.methods)) out.add(`${m.toUpperCase()} ${isKiosk ? "/kiosk" : ""}${l.route.path}`);
      }
    }
  }
  return [...out].sort();
}

test("the API exposes exactly the recorded routes", () => {
  const actual = collectRoutes();
  if (process.env.UPDATE_SNAPSHOT === "1") {
    fs.writeFileSync(SNAPSHOT, JSON.stringify(actual, null, 2) + "\n");
    return;
  }
  const expected = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  const added = actual.filter((r) => !expected.includes(r));
  const removed = expected.filter((r) => !actual.includes(r));
  assert.deepStrictEqual({ added, removed }, { added: [], removed: [] },
    "API surface changed. If intended: UPDATE_SNAPSHOT=1 npm test, commit __tests__/fixtures/route-table.json and explain why in the PR.");
});

test("money and refund endpoints keep their authentication (guards against a middleware being dropped)", () => {
  const find = (method, p) => {
    for (const layer of (app.router || app._router).stack) {
      const stack = layer.route ? [layer] : layer.handle && layer.handle.stack ? layer.handle.stack.filter((l) => l.route) : [];
      for (const l of stack) if (l.route.path === p && l.route.methods[method]) return l.route.stack.map((s) => s.name || "anonymous");
    }
    return null;
  };
  const guarded = [["post", "/create-order"], ["get", "/verify-payment/:orderId"], ["post", "/payment-success"], ["post", "/request-refund"], ["post", "/admin/refund"], ["get", "/admin/refund-requests"], ["get", "/admin/analytics"], ["get", "/admin/transactions"], ["post", "/admin/settings"], ["post", "/admin/coupons"]];
  for (const [method, p] of guarded) {
    const chain = find(method, p);
    assert.ok(chain, `${method.toUpperCase()} ${p} exists`);
    assert.ok(chain.length >= 2, `${method.toUpperCase()} ${p} must have an auth middleware before its handler (got: ${chain.join(" -> ")})`);
  }
  // Documented exceptions: public by design (see architecture.md section 7)
  for (const [method, p] of [["post", "/cashfree-webhook"], ["post", "/get-documents-by-code"]]) {
    assert.ok(find(method, p), `${method.toUpperCase()} ${p} exists`);
  }
});
