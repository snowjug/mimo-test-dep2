const { onRequest } = require("firebase-functions/v2/https");
const app = require("./src/server");

// GMAIL_APP_PASSWORD is a Secret Manager secret on the live function; it must be bound here (not written to .env).
// Capacity: 10 instances x 256 MiB was the ceiling at lunch rush. 50 instances x 512 MiB gives headroom for peaks; the
// cost only grows when traffic actually needs the instances. Concurrency (80 per instance) is unchanged.
// GUARDIAN_MASTER_KEY (MIMO Edge Guardian, Phase 2A/2B design) is declared here the same way — bound from Secret
// Manager at runtime, never written to .env or source.
//
// JWT_SECRET / ADMIN_EMAIL / ADMIN_PASSWORD moved here from functions/.env (now functions/.env.local, which
// Firebase never bundles into a deploy — see functions/dev.js). They used to be plain values in functions/.env,
// which Firebase DOES bundle into every deploy; that accidentally shipped local-dev-only placeholder values
// (including JWT_SECRET) to production. Real values now live only in Secret Manager, injected at runtime exactly
// like GMAIL_APP_PASSWORD/GUARDIAN_MASTER_KEY -- src/config/env.js and admin.controller.js are unchanged, since
// both already read these from process.env directly.
exports.api = onRequest(
  {
    cors: true,
    maxInstances: 50,
    memory: "512MiB",
    secrets: ["GMAIL_APP_PASSWORD", "GUARDIAN_MASTER_KEY", "JWT_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD"],
  },
  app
);

// Firestore / scheduler triggers (function names are part of the deployed contract)
Object.assign(
  exports,
  require("./src/triggers/printJob.triggers"),
  require("./src/triggers/retention.trigger"),
  require("./src/triggers/orphanStorage.trigger")
);
// printTimeout.trigger also exports a plain runPrintTimeoutSweep() for direct unit testing —
// only the wrapped Cloud Function itself should be deployed.
exports.scheduledPrintTimeoutSweep = require("./src/triggers/printTimeout.trigger").scheduledPrintTimeoutSweep;
