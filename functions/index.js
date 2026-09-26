const { onRequest } = require("firebase-functions/v2/https");
const app = require("./src/server");

// GMAIL_APP_PASSWORD is a Secret Manager secret on the live function; it must be bound here (not written to .env).
exports.api = onRequest({ cors: true, maxInstances: 10, secrets: ["GMAIL_APP_PASSWORD"] }, app);

// Firestore / scheduler triggers (function names are part of the deployed contract)
Object.assign(
  exports,
  require("./src/triggers/printJob.triggers"),
  require("./src/triggers/retention.trigger")
);
