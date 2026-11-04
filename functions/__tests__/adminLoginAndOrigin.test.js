// This repository is public, so the admin/finance login must accept ONLY the secret-managed credentials, and the
// admin/finance API must refuse browsers calling from any site other than the official dashboard (for example an
// intern's `npm run dev` on http://localhost:5173 pointed at production).
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

const JWT = "admin-login-test-secret-fixture-32-chars-long";
process.env.JWT_SECRET = JWT;
createFakeFirestore().install();
const { postAdminLogin } = require("../src/controllers/admin.controller");
const { adminOriginGuard, allowedOrigins } = require("../src/middleware/adminOriginGuard");

const FAKE = {
  ADMIN_EMAIL: "unit-admin-id", ADMIN_PASSWORD: "unit-admin-password-A1!",
  FINANCE_EMAIL: "unit-finance-id", FINANCE_PASSWORD: "unit-finance-password-B2@",
};

function withEnv(env, fn) {
  return async () => {
    const names = Object.keys({ ...FAKE, ...env });
    const saved = {};
    for (const k of names) saved[k] = process.env[k];
    const merged = { ...FAKE, ...env };
    for (const k of names) { if (merged[k] === undefined) delete process.env[k]; else process.env[k] = merged[k]; }
    try { await fn(); } finally {
      for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  };
}

function login(body) {
  const out = { status: 200, body: null };
  const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
  postAdminLogin({ body }, res);
  return out;
}

test("the old built-in admin logins no longer work, even with real credentials configured", withEnv({}, () => {
  for (const [id, pw] of [["mimo.admin", "admin123"], ["admin@printmimo.tech", "admin"], ["mimo.admin", "admin"], ["admin@printmimo.tech", "admin123"]]) {
    assert.strictEqual(login({ email: id, password: pw }).status, 401, `${id}/${pw} must be rejected`);
  }
}));

test("with NO credentials configured nobody can log in (no silent default)", withEnv({ ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined, FINANCE_EMAIL: undefined, FINANCE_PASSWORD: undefined }, () => {
  assert.strictEqual(login({ email: "mimo.admin", password: "admin123" }).status, 401);
  assert.strictEqual(login({ email: "", password: "" }).status, 401);
}));

test("the configured admin credentials work and the token lasts hours, not a month", withEnv({}, () => {
  const r = login({ email: FAKE.ADMIN_EMAIL, password: FAKE.ADMIN_PASSWORD });
  assert.strictEqual(r.status, 200);
  const claims = jwt.verify(r.body.token, JWT);
  assert.strictEqual(claims.isAdmin, true);
  assert.ok(claims.exp - claims.iat <= 24 * 3600, "token must expire within a day");
}));

test("the configured finance credentials work, and only for finance (not admin)", withEnv({}, () => {
  const r = login({ email: FAKE.FINANCE_EMAIL, password: FAKE.FINANCE_PASSWORD });
  assert.strictEqual(r.status, 200);
  const claims = jwt.verify(r.body.token, JWT);
  assert.strictEqual(claims.role, "finance");
  assert.strictEqual(claims.isAdmin, false);
  assert.ok(claims.exp - claims.iat <= 24 * 3600);
}));

test("a right identifier with a wrong password, and the reverse, are both rejected", withEnv({}, () => {
  assert.strictEqual(login({ email: FAKE.ADMIN_EMAIL, password: "wrong" }).status, 401);
  assert.strictEqual(login({ email: "someone", password: FAKE.ADMIN_PASSWORD }).status, 401);
}));

// ---------------------------------------------------------------- origin guard
function guard(origin, opts = {}) {
  const saved = { K: process.env.K_SERVICE, A: process.env.ADMIN_ALLOWED_ORIGINS };
  if (opts.local) delete process.env.K_SERVICE; else process.env.K_SERVICE = "api";
  if (opts.allowed === undefined) delete process.env.ADMIN_ALLOWED_ORIGINS; else process.env.ADMIN_ALLOWED_ORIGINS = opts.allowed;
  let result = "next";
  const req = { method: "GET", originalUrl: "/admin/jobs", header: (h) => (h.toLowerCase() === "origin" ? origin : undefined) };
  const res = { status(c) { result = c; return this; }, json() { return this; } };
  try { adminOriginGuard(req, res, () => { result = "next"; }); } finally {
    if (saved.K === undefined) delete process.env.K_SERVICE; else process.env.K_SERVICE = saved.K;
    if (saved.A === undefined) delete process.env.ADMIN_ALLOWED_ORIGINS; else process.env.ADMIN_ALLOWED_ORIGINS = saved.A;
  }
  return result;
}

test("a dashboard running on localhost is refused by the deployed admin API", () => {
  assert.strictEqual(guard("http://localhost:5173"), 403);
  assert.strictEqual(guard("http://127.0.0.1:3000"), 403);
  assert.strictEqual(guard("https://evil.example.com"), 403);
});

test("the official dashboard origins are allowed (trailing slash and letter case do not matter)", () => {
  assert.strictEqual(guard("https://printmimo.tech"), "next");
  assert.strictEqual(guard("https://www.printmimo.tech/"), "next");
  assert.strictEqual(guard("HTTPS://PRINTMIMO.TECH"), "next");
});

test("requests without an Origin header are not judged by the guard (the token still is)", () => {
  assert.strictEqual(guard(undefined), "next");
});

test("the guard does nothing off Cloud Run, so local emulator development keeps working", () => {
  assert.strictEqual(guard("http://localhost:5173", { local: true }), "next");
});

test("ADMIN_ALLOWED_ORIGINS overrides the default list (for a staging dashboard)", () => {
  assert.deepStrictEqual(allowedOrigins({ ADMIN_ALLOWED_ORIGINS: " https://staging.example.com/ ,https://b.example.com" }), ["https://staging.example.com", "https://b.example.com"]);
  assert.strictEqual(guard("https://staging.example.com", { allowed: "https://staging.example.com" }), "next");
  assert.strictEqual(guard("https://printmimo.tech", { allowed: "https://staging.example.com" }), 403);
});
