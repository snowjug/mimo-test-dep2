const test = require("node:test");
const assert = require("node:assert");
const { scanAddedLines } = require("../secret-scan");

const diff = (file, ...added) => `+++ b/${file}\n@@ -0,0 +1,${added.length} @@\n${added.map((l) => "+" + l).join("\n")}\n`;
const rules = (d) => scanAddedLines(d).map((f) => f.rule);

test("detects real-looking secrets in added lines", () => {
  assert.deepStrictEqual(rules(diff("a.js", "const k = 'cfsk_ma_prod_0123456789abcdef0123456789abcdef_ab12cd34';")), ["Cashfree secret key"]);
  assert.deepStrictEqual(rules(diff("a.js", "-----BEGIN PRIVATE KEY-----")), ["private key block"]);
  assert.deepStrictEqual(rules(diff("a.py", "client.connect(host, password='hunter2hunter2')")), ["hard-coded credential assignment"]);
  assert.deepStrictEqual(rules(diff("a.md", "ssh pi@100.107.95.16")), ["Tailscale / private network address"]);
  assert.deepStrictEqual(rules(diff("a.js", "const t = 'EAA" + "x".repeat(70) + "';")), ["Meta / WhatsApp access token"]);
});

test("ignores placeholders, environment reads, tests, lockfiles, the allow marker and removed lines", () => {
  assert.deepStrictEqual(rules(diff("a.js", "const secret = process.env.SECRET;", "JWT_SECRET=\"<32+ random chars>\"", "password = 'changeme-please'")), []);
  assert.deepStrictEqual(rules(diff("functions/__tests__/x.test.js", "const password = 'realisticlooking1';")), []);
  assert.deepStrictEqual(rules(diff("package-lock.json", "\"integrity\": \"password='abcdefghijk'\"")), []);
  assert.deepStrictEqual(rules(diff("a.js", "const password = 'realisticlooking1'; // secret-scan:allow")), []);
  assert.deepStrictEqual(rules("+++ b/a.js\n@@ -1 +0,0 @@\n-const password = 'realisticlooking1';\n"), []);
});

test("vendored third-party bundles are skipped (a minified/base64 blob can coincidentally match a rule)", () => {
  assert.deepStrictEqual(rules(diff("mimo-website/public/vendor/opencv/opencv-4.9.0.js", "const t='EAA" + "x".repeat(70) + "';")), []);
});

test("reports the file and line of the finding", () => {
  const d = "+++ b/src/x.js\n@@ -10,0 +11,2 @@\n+const ok = 1;\n+const password = 'realisticlooking1';\n";
  const [f] = scanAddedLines(d);
  assert.deepStrictEqual([f.file, f.line], ["src/x.js", 12]);
});

test("public Firebase web keys are allowed only in firebase.ts", () => {
  const key = "AIza" + "Sy".padEnd(35, "a");
  assert.deepStrictEqual(rules(diff("mimo-website/src/lib/firebase.ts", `apiKey: "${key}"`)), []);
  assert.ok(rules(diff("mimo-website/src/other.ts", `apiKey: "${key}"`)).includes("Google API key"));
});
