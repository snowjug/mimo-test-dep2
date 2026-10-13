const { onSchedule } = require("firebase-functions/v2/scheduler");
const { admin, db } = require("../config/firebase");
const { runOrphanStoragePass, defaults } = require("../services/storageCleanup.service");

// Bucket-linked Storage cleanup (hourly, offset from the job sweep): finds customer objects that never got a Firestore job
// (customer left before finalising, conversion failed, ...) and deletes them once they are 24 h past their real upload time.
// It only DELETES when ORPHAN_CLEANUP_MODE=delete is set for the function; otherwise it is a dry run that logs what it would do.
// Algorithm and rollout: services/storageCleanup.service.js (runOrphanStoragePass), docs/deployment/STORAGE_CLEANUP.md.
exports.scheduledOrphanStorageCleanup = onSchedule(
  {
    schedule: "20 * * * *",
    timeZone: "Asia/Kolkata",
    timeoutSeconds: 540,
    memory: "512MiB",
    maxInstances: 1,
  },
  async () => {
    console.log(`[ORPHAN] Run started at ${new Date().toISOString()}`);
    try {
      await runOrphanStoragePass({ db, admin, bucket: admin.storage().bucket(), config: defaults() });
    } catch (err) {
      console.error("[ORPHAN CRITICAL ERROR]", String(err && err.stack || err).slice(0, 500));
    }
  }
);
