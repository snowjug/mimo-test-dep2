const { onRequest } = require("firebase-functions/v2/https");
const app = require("./src/server");

// GMAIL_APP_PASSWORD is a Secret Manager secret on the live function; it must be bound here (not written to .env).
// Capacity: 10 instances x 256 MiB was the ceiling at lunch rush. 50 instances x 512 MiB gives headroom for peaks; the
// cost only grows when traffic actually needs the instances. Concurrency (80 per instance) is unchanged.
//
// Mission 37: FLOW_PRIVATE_KEY_PEM and FLOW_APP_SECRET (functions/src/config/env.js, read by
// whatsappFlow.controller.js) are Secret Manager secrets too, but v2 Cloud Functions only injects a secret
// into process.env for functions that explicitly list it here. FLOW_APP_SECRET_PREVIOUS is intentionally NOT
// listed yet: Secret Manager deploy fails if a listed secret doesn't exist, and no rotation secret has been
// created — add it here only once it actually exists.
exports.api = onRequest({ cors: true, maxInstances: 50, memory: "512MiB", secrets: ["GMAIL_APP_PASSWORD", "FLOW_PRIVATE_KEY_PEM", "FLOW_APP_SECRET"] }, app);

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

// Mission 37: periodic worker tick for WhatsApp Flow document-processing jobs (see triggers/whatsappFlowWorker.trigger.js).
exports.scheduledWhatsappFlowWorkerSweep = require("./src/triggers/whatsappFlowWorker.trigger").scheduledWhatsappFlowWorkerSweep;
