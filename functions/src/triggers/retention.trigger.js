const { onSchedule } = require("firebase-functions/v2/scheduler");
const { admin, db } = require("../config/firebase");
const { runJobRetentionPass, defaults } = require("../services/storageCleanup.service");

// Job-linked Storage cleanup (hourly). Policy and algorithm: services/storageCleanup.service.js (runJobRetentionPass),
// rationale and rollout: docs/deployment/STORAGE_CLEANUP.md. Name, region and schedule are deployment contracts
// (pinned by __tests__/triggerDeployment.test.js).
exports.scheduledFileRetentionCleanup = onSchedule(
  {
    schedule: "every 1 hours",
    timeZone: "Asia/Kolkata",
    timeoutSeconds: 300,
    maxInstances: 1,
  },
  async () => {
    console.log(`[RETENTION CLEANUP] Run started at ${new Date().toISOString()}`);
    try {
      await runJobRetentionPass({ db, admin, bucket: admin.storage().bucket(), config: defaults() });
    } catch (err) {
      console.error("[RETENTION CLEANUP CRITICAL ERROR]", String(err && err.stack || err).slice(0, 500));
    }
  }
);
