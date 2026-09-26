const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { parseDotenv, parseLiveEnv, parseLiveSecretRefs, mergeSources, validate, toDotenv } = require("../functions-env");

const SCRIPT = path.join(__dirname, "..", "functions-env.js");
const GOOD = {
  JWT_SECRET: "j".repeat(48), ADMIN_EMAIL: "ops@example.com", ADMIN_PASSWORD: "correct-horse-battery-staple",
  CASHFREE_ENV: "production", CASHFREE_APP_ID: "app-id-value", CASHFREE_SECRET_KEY: "cf-secret-value",
  GMAIL_APP_PASSWORD: "gmail-app-pass-value",
};

const run = (env, live) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fenv-"));
  const out = path.join(dir, ".env");
  const e = { PATH: process.env.PATH, FUNCTIONS_ENV_FILE: Object.entries(env).map(([k, v]) => `${k}="${v}"`).join("\n") };
  if (live) {
    const p = path.join(dir, "live.json");
    fs.writeFileSync(p, JSON.stringify(live));
    e.LIVE_ENV_JSON_PATH = p;
  }
  const r = spawnSync(process.execPath, [SCRIPT, out], { env: e, encoding: "utf8" });
  return { ...r, out, dir, written: fs.existsSync(out) };
};
const liveDoc = (env) => ({ spec: { template: { spec: { containers: [{ env: Object.entries(env).map(([name, value]) => ({ name, value })) }] } } } });

test("parseDotenv handles quotes, comments and escapes", () => {
  const e = parseDotenv('# c\nA="x y"\nB=plain\nexport C=\'s\'\nD="l1\\nl2"\n');
  assert.deepStrictEqual(e, { A: "x y", B: "plain", C: "s", D: "l1\nl2" });
});

test("parseLiveEnv reads Cloud Run env and tolerates bad input", () => {
  assert.deepStrictEqual(parseLiveEnv(liveDoc({ A: "1", B: "2" })), { A: "1", B: "2" });
  assert.deepStrictEqual(parseLiveEnv("not json"), {});
  assert.deepStrictEqual(parseLiveEnv({}), {});
});

test("mergeSources drops reserved names and never lets an empty value win", () => {
  const { merged, dropped } = mergeSources({
    live: { JWT_SECRET: "real", FIREBASE_PRIVATE_KEY: "x", PORT: "3000", K_SERVICE: "api", KIOSK1_PI_URL: "http://pi" },
    secretEnv: { JWT_SECRET: "", ADMIN_EMAIL: "a" },
  });
  assert.strictEqual(merged.JWT_SECRET, "real");
  assert.strictEqual(merged.ADMIN_EMAIL, "a");
  assert.strictEqual(merged.KIOSK1_PI_URL, "http://pi");
  assert.ok(!("FIREBASE_PRIVATE_KEY" in merged) && !("PORT" in merged));
  assert.deepStrictEqual(dropped.sort(), ["FIREBASE_PRIVATE_KEY", "K_SERVICE", "PORT"].sort());
});

test("validate: good config passes", () => {
  const v = validate(GOOD);
  assert.deepStrictEqual([v.missing, v.insecure], [[], []]);
});

test("validate: flags default admin credentials and weak/public JWT secrets", () => {
  assert.ok(validate({ ...GOOD, ADMIN_PASSWORD: "admin" }).insecure.length);
  assert.ok(validate({ ...GOOD, ADMIN_PASSWORD: '"admin"' }).insecure.length);
  assert.ok(validate({ ...GOOD, ADMIN_PASSWORD: "short1" }).insecure.length);
  assert.ok(validate({ ...GOOD, JWT_SECRET: "fallback_secret_key_change_me_in_prod" }).insecure.length);
  assert.ok(validate({ ...GOOD, JWT_SECRET: "tooshort" }).insecure.length);
});

test("toDotenv round-trips awkward values", () => {
  const env = { A: 'he said "hi"', B: "line1\nline2", C: "back\\slash" };
  assert.deepStrictEqual(parseDotenv(toDotenv(env)), env);
});

test("CLI: complete secure config writes .env and prints no secret values", () => {
  const r = run(GOOD);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.written);
  const shown = r.stdout.replace(/::add-mask::.*/g, "");
  for (const [k, v] of Object.entries(GOOD)) if (k !== "CASHFREE_ENV") assert.ok(!shown.includes(v), "secret value leaked to log");
  assert.ok(fs.readFileSync(r.out, "utf8").includes("JWT_SECRET="));
});

test("CLI: live production values are preserved and empty secret values do not overwrite them", () => {
  const r = run({ ADMIN_PASSWORD: "", JWT_SECRET: "" }, liveDoc(GOOD));
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(parseDotenv(fs.readFileSync(r.out, "utf8")).JWT_SECRET, GOOD.JWT_SECRET);
});

test("CLI: missing configuration fails with exit 1, names the keys, writes nothing", () => {
  const { JWT_SECRET, CASHFREE_SECRET_KEY, ...rest } = GOOD;
  const r = run(rest);
  assert.strictEqual(r.status, 1);
  assert.ok(r.stderr.includes("JWT_SECRET") && r.stderr.includes("CASHFREE_SECRET_KEY"));
  assert.ok(r.stderr.includes("FUNCTIONS_ENV_FILE"));
  assert.ok(!r.written);
});

test("CLI: nothing supplied at all fails (never deploys with an empty environment)", () => {
  const r = run({});
  assert.strictEqual(r.status, 1);
  assert.ok(!r.written);
});

test("CLI: default admin/admin and the public JWT fallback block the deploy (exit 2)", () => {
  const a = run({ ...GOOD, ADMIN_EMAIL: "admin", ADMIN_PASSWORD: "admin" });
  assert.strictEqual(a.status, 2);
  assert.ok(a.stderr.includes("ADMIN_PASSWORD") && !a.written);
  const b = run({ ...GOOD, JWT_SECRET: "fallback_secret_key_change_me_in_prod" });
  assert.strictEqual(b.status, 2);
  assert.ok(!b.written);
});

test("secret-manager references on the live function are detected and explained when required", () => {
  const doc = { spec: { template: { spec: { containers: [{ env: [
    { name: "ADMIN_EMAIL", value: "ops@example.com" },
    { name: "GMAIL_APP_PASSWORD", valueFrom: { secretKeyRef: { name: "GMAIL_APP_PASSWORD", key: "latest" } } },
  ] }] } } } };
  assert.deepStrictEqual(parseLiveSecretRefs(doc), ["GMAIL_APP_PASSWORD"]);
  const { GMAIL_APP_PASSWORD, ...rest } = GOOD;
  const r = run(rest, doc);
  assert.strictEqual(r.status, 1);
  assert.ok(r.stderr.includes("Secret Manager reference"));
  assert.ok(r.stdout.includes("Secret Manager references: GMAIL_APP_PASSWORD"));
});
