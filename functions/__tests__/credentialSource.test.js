"use strict";
// Regression guard for the production upload outage: a read-only serviceAccountKey.json was uploaded inside a
// deploy, config/firebase.js picked it up as the credential, and every Storage write failed with 403. A deployed
// function must always use its runtime service account, and key files must never be uploaded.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const { isDeployedRuntime } = require("../src/config/credentialSource");

test("a Cloud Run / Cloud Functions runtime counts as deployed", () => {
  assert.strictEqual(isDeployedRuntime({ K_SERVICE: "api" }), true);
  assert.strictEqual(isDeployedRuntime({ FUNCTION_TARGET: "api" }), true);
});

test("plain local development is not deployed", () => {
  assert.strictEqual(isDeployedRuntime({}), false);
});

test("the Functions emulator is local development even though it sets FUNCTION_TARGET", () => {
  assert.strictEqual(isDeployedRuntime({ FUNCTIONS_EMULATOR: "true", FUNCTION_TARGET: "api" }), false);
});

test("firebase.json never uploads key files or local env files with the functions source", () => {
  const cfg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../firebase.json"), "utf8"));
  const ignore = cfg.functions.ignore;
  assert.ok(Array.isArray(ignore), "functions.ignore must be set");
  assert.ok(ignore.includes("**/serviceAccountKey.json"));
  assert.ok(ignore.includes("**/.env.local"));
  assert.ok(ignore.includes("node_modules"), "setting ignore replaces Firebase's defaults, so they must be repeated");
});

// Loads config/firebase.js in isolation with a stubbed firebase-admin and a decoy key file in the working directory,
// and reports whether the key file was used as the credential.
function loadFirebaseConfig(env) {
  const decoyDir = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-cred-"));
  fs.writeFileSync(
    path.join(decoyDir, "serviceAccountKey.json"),
    JSON.stringify({ client_email: "decoy@example.invalid", private_key: "not-a-real-key" })
  );
  const calls = { cert: 0, initConfig: null };
  const adminStub = {
    apps: [],
    credential: { cert: (sa) => { calls.cert += 1; return { stub: sa.client_email }; } },
    initializeApp(cfg) { calls.initConfig = cfg; this.apps.push({}); },
    firestore: () => ({ settings() {} }),
  };

  const saved = {};
  const keys = ["K_SERVICE", "FUNCTION_TARGET", "FUNCTIONS_EMULATOR", "MIMO_SA_PRIVATE_KEY", "MIMO_SA_CLIENT_EMAIL"];
  for (const k of keys) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, env);
  const cwd = process.cwd();
  const originalLoad = Module._load;
  Module._load = function (request, ...rest) {
    return request === "firebase-admin" ? adminStub : originalLoad.call(this, request, ...rest);
  };
  const target = require.resolve("../src/config/firebase");
  delete require.cache[target];
  try {
    process.chdir(decoyDir);
    require(target);
  } finally {
    process.chdir(cwd);
    Module._load = originalLoad;
    delete require.cache[target];
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    fs.rmSync(decoyDir, { recursive: true, force: true });
  }
  return calls;
}

test("on a deployed runtime a key file on disk is ignored and the runtime service account (ADC) is used", () => {
  const calls = loadFirebaseConfig({ K_SERVICE: "api" });
  assert.strictEqual(calls.cert, 0, "the key file must not be turned into a credential");
  assert.ok(calls.initConfig, "firebase-admin must still be initialised");
  assert.strictEqual(calls.initConfig.credential, undefined, "no explicit credential means ADC");
});

test("in local development a key file is still used", () => {
  const calls = loadFirebaseConfig({});
  assert.strictEqual(calls.cert, 1);
  // Which file wins is not asserted: a developer machine may also have a real key at the repo root, which
  // config/firebase.js checks before the working directory. All that matters is that a key file IS used locally.
  assert.ok(calls.initConfig.credential && typeof calls.initConfig.credential.stub === "string");
});
