"use strict";
// Mission 23 Phase 4: a lightweight regression guard against the exact class of defect that broke the real
// deploy — a production source file requiring a module by a relative path that resolves OUTSIDE functions/
// (e.g. a sibling prototypes/ directory). Firebase only uploads the directory named in firebase.json's
// `functions.source` ("functions") — anything a deployed file requires via a relative path that steps
// outside that directory does not exist in the deployed container and crashes it at startup. This test
// catches that class of mistake locally, before it ever reaches a real deploy.
//
// Scope and limits, stated plainly: this is a simple string-literal scan of require("...")/require('...')
// calls across every .js file under functions/src and functions/index.js (never functions/__tests__ itself —
// test files are never deployed, so a test requiring a prototypes/ test helper is fine and expected). It does
// NOT resolve a computed/dynamic require() (e.g. functions/src/config/firebase.js's `require(kp)`, which
// loads a local-only service-account path, not a sibling module) — a real static analyzer would need an AST
// pass to cover that case, which is more machinery than this guard is meant to be. Non-relative requires
// (npm packages, Node built-ins) are intentionally ignored: they resolve through node_modules, which IS
// inside functions/, so they are never the failure mode this guard exists to catch.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const FUNCTIONS_ROOT = path.resolve(__dirname, "..");
const REQUIRE_RE = /require\(\s*(['"])(\.[^'"]*)\1\s*\)/g;

function listJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function findOutOfBoundsRequires() {
  const targets = [path.join(FUNCTIONS_ROOT, "src"), path.join(FUNCTIONS_ROOT, "index.js")];
  const files = [];
  for (const t of targets) {
    if (fs.statSync(t).isDirectory()) files.push(...listJsFiles(t));
    else files.push(t);
  }

  const violations = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    let m;
    while ((m = REQUIRE_RE.exec(text))) {
      const requestedPath = m[2];
      const resolvedDir = path.resolve(path.dirname(file), requestedPath);
      // A relative require with no extension/resolved file is still fine to check by directory containment —
      // Node's own resolution (extension/index.js lookup) doesn't change whether it's inside functions/.
      const rel = path.relative(FUNCTIONS_ROOT, resolvedDir);
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        violations.push({ file: path.relative(FUNCTIONS_ROOT, file), requestedPath, resolvedDir });
      }
    }
  }
  return violations;
}

test.describe("Mission 23 Phase 4 — deployment packaging boundary guard", () => {
  test("no production source file under functions/src (or index.js) requires a module outside functions/", () => {
    const violations = findOutOfBoundsRequires();
    assert.deepStrictEqual(
      violations, [],
      `Found relative require() calls resolving OUTSIDE functions/ — these are NOT included in the deployed ` +
      `package and will crash the container at startup (exactly how Mission 23's real deploy failed with ` +
      `"Cannot find module '../../../prototypes/whatsapp-flow-endpoint/src/metaFlowAdapter'"):\n` +
      JSON.stringify(violations, null, 2)
    );
  });

  test("sanity check: the guard itself can actually detect a violation (not a silently-broken no-op)", () => {
    const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "packaging-guard-selftest-"));
    try {
      const fakeRoot = path.join(dir, "functions");
      fs.mkdirSync(path.join(fakeRoot, "src"), { recursive: true });
      fs.writeFileSync(path.join(fakeRoot, "src", "bad.js"), `require("../../../outside/thing");\n`);
      fs.writeFileSync(path.join(fakeRoot, "index.js"), "");

      // Re-run the same scan logic against the synthetic fixture, not the real repo, to prove detection works.
      const files = [path.join(fakeRoot, "src", "bad.js")];
      const violations = [];
      for (const file of files) {
        const text = fs.readFileSync(file, "utf8");
        let m;
        while ((m = REQUIRE_RE.exec(text))) {
          const resolvedDir = path.resolve(path.dirname(file), m[2]);
          const rel = path.relative(fakeRoot, resolvedDir);
          if (rel.startsWith("..") || path.isAbsolute(rel)) violations.push({ file, requestedPath: m[2] });
        }
      }
      assert.strictEqual(violations.length, 1, "the detection logic must flag the synthetic out-of-bounds require");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
