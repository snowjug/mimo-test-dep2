"use strict";
// A deployed function must run as its own runtime service account (Application Default Credentials). Loading a
// serviceAccountKey.json from disk is a local-development convenience only: if one is ever uploaded with a deploy,
// it silently replaces the runtime identity. That happened in production (a read-only key bundled into the deployed
// source made every Storage write fail with 403, so no customer could upload a file). config/firebase.js therefore
// consults this before it looks for key files.

function isDeployedRuntime(env = process.env) {
  if (env.FUNCTIONS_EMULATOR === "true") return false; // the emulator is local development, key files are fine
  return Boolean(env.K_SERVICE || env.FUNCTION_TARGET); // Cloud Run / Cloud Functions set these on every revision
}

module.exports = { isDeployedRuntime };
