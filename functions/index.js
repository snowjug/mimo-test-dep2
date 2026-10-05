const { onRequest } = require("firebase-functions/v2/https");
const app = require("./src/server");

// GMAIL_APP_PASSWORD is a Secret Manager secret on the live function; it must be bound here (not written to .env).
// Capacity: 10 instances x 256 MiB was the ceiling at lunch rush. 50 instances x 512 MiB gives headroom for peaks; the
// cost only grows when traffic actually needs the instances. Concurrency (80 per instance) is unchanged.
exports.api = onRequest({ cors: true, maxInstances: 50, memory: "512MiB", secrets: ["GMAIL_APP_PASSWORD"] }, app);

// Firestore / scheduler triggers (function names are part of the deployed contract)
Object.assign(
  exports,
  require("./src/triggers/printJob.triggers"),
  require("./src/triggers/retention.trigger")
);
// printTimeout.trigger also exports a plain runPrintTimeoutSweep() for direct unit testing —
// only the wrapped Cloud Function itself should be deployed.
exports.scheduledPrintTimeoutSweep = require("./src/triggers/printTimeout.trigger").scheduledPrintTimeoutSweep;
