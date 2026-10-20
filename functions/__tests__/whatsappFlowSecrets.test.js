"use strict";
// Mission 17 regression: `exports.api`'s Secret Manager bindings must include FLOW_PRIVATE_KEY_PEM and
// FLOW_APP_SECRET, or those values would always read as "" in production (Secret Manager only injects a
// secret into process.env for a function that explicitly lists it) and the Flow endpoint would permanently
// 500 every real request even once the secrets exist. See index.js's own comment for the full story.
//
// Loading functions/index.js pulls in server.js -> user.routes.js -> user.controller.js -> "busboy", which is
// a PRE-EXISTING, unrelated environment gap (declared in package.json, absent from node_modules — also
// breaks apiSurface.test.js and parts of cashfreeWebhook.test.js/portedRoutes.test.js; not caused or fixed by
// this change). A real `npm install` is the real fix and is out of this test's scope; this file only needs to
// inspect exports.api's static deployment descriptor (not actually run busboy-dependent code), so it stubs
// the module loader narrowly, for this file only, strictly to unblock that one static inspection.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const Module = require("module");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

process.env.JWT_SECRET = process.env.JWT_SECRET || "whatsapp-flow-secrets-test-fixture-32-chars"; // must be >= 32 chars (see src/config/env.js)
createFakeFirestore().install();

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "busboy") return function fakeBusboyStub() { throw new Error("busboy stub: unused by this test"); };
  return originalLoad.apply(this, arguments);
};
let index;
try {
  index = require("../index.js");
} finally {
  Module._load = originalLoad;
}

test("exports.api binds FLOW_PRIVATE_KEY_PEM and FLOW_APP_SECRET from Secret Manager (not just GMAIL_APP_PASSWORD)", () => {
  const secrets = (index.api.__endpoint.secretEnvironmentVariables || []).map((s) => s.key);
  assert.ok(secrets.includes("GMAIL_APP_PASSWORD"), "pre-existing binding must be preserved");
  assert.ok(secrets.includes("FLOW_PRIVATE_KEY_PEM"), "Flow private key must be bound or it reads as \"\" in production");
  assert.ok(secrets.includes("FLOW_APP_SECRET"), "Flow app secret must be bound or it reads as \"\" in production");
});

test("exports.scheduledWhatsappFlowWorkerSweep is registered and exported", () => {
  assert.ok(index.scheduledWhatsappFlowWorkerSweep, "scheduled worker sweep must be exported for deployment");
});
