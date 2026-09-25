const { onRequest } = require("firebase-functions/v2/https");
const app = require("./src/server");

exports.api = onRequest({ cors: true, maxInstances: 10 }, app);

// Firestore / scheduler triggers (function names are part of the deployed contract)
Object.assign(
  exports,
  require("./src/triggers/printJob.triggers"),
  require("./src/triggers/retention.trigger")
);
