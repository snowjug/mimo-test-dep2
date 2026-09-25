const { onSchedule } = require("firebase-functions/v2/scheduler");
const { admin, db } = require("../config/firebase");
const { discoverStoragePaths, getRetentionStartTime, isProtectedTemplate, isStoragePathReferencedByOtherActiveJob } = require("../services/storage.service");

exports.scheduledFileRetentionCleanup = onSchedule(
  {
    schedule: "every 1 hours",
    timeZone: "Asia/Kolkata",
    timeoutSeconds: 300,
    maxInstances: 1,
  },
  async (event) => {
    console.log(`[RETENTION CLEANUP] Run started at ${new Date().toISOString()}`);

    const bucket = admin.storage().bucket();
    const nowMs = Date.now();
    const RETENTION_MS = 24 * 60 * 60 * 1000;
    const LEASE_MS = 15 * 60 * 1000; // 15-minute recoverable lease
    const cutoffDate = new Date(nowMs - RETENTION_MS);
    const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffDate);

    const PAGE_SIZE = 100;
    const MAX_CANDIDATES_TOTAL = 200;
    const candidateMap = new Map();

    async function fetchCandidatesForField(fieldName) {
      let lastDoc = null;
      let pagesRead = 0;
      const MAX_PAGES = 5;

      while (pagesRead < MAX_PAGES && candidateMap.size < MAX_CANDIDATES_TOTAL) {
        let query = db.collection("print_jobs")
          .where(fieldName, "<", cutoffTimestamp)
          .orderBy(fieldName, "asc")
          .limit(PAGE_SIZE);

        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }

        const snap = await query.get();
        pagesRead++;

        if (snap.empty) break;

        for (const doc of snap.docs) {
          const d = doc.data();
          if (d.fileDeleted === true) continue;
          if (!candidateMap.has(doc.id)) {
            candidateMap.set(doc.id, doc);
            if (candidateMap.size >= MAX_CANDIDATES_TOTAL) break;
          }
        }

        lastDoc = snap.docs[snap.docs.length - 1];
        if (snap.docs.length < PAGE_SIZE) break;
      }
    }

    try {
      // 1. Primary candidate stream: retentionStartAt
      await fetchCandidatesForField("retentionStartAt");

      // 2. Fallback candidate streams for legacy jobs (if ceiling not reached)
      if (candidateMap.size < MAX_CANDIDATES_TOTAL) {
        await fetchCandidatesForField("codeCreatedAt");
      }
      if (candidateMap.size < MAX_CANDIDATES_TOTAL) {
        await fetchCandidatesForField("paymentTime");
      }
      if (candidateMap.size < MAX_CANDIDATES_TOTAL) {
        await fetchCandidatesForField("uploadedAt");
      }
      if (candidateMap.size < MAX_CANDIDATES_TOTAL) {
        await fetchCandidatesForField("createdAt");
      }

      console.log(`[RETENTION CLEANUP] Found ${candidateMap.size} unique candidates older than 24h.`);

      let processedCount = 0;
      let cleanedCount = 0;
      let skippedProtectedCount = 0;
      let leaseLockedCount = 0;
      let failedCount = 0;

      for (const [jobId, docSnapshot] of candidateMap.entries()) {
        processedCount++;
        const docRef = db.collection("print_jobs").doc(jobId);

        let leaseAcquired = false;
        let freshData = null;

        // Atomic recoverable lease claim with race protections
        try {
          await db.runTransaction(async (transaction) => {
            const freshDoc = await transaction.get(docRef);
            if (!freshDoc.exists) return;
            const data = freshDoc.data();

            // Guard: Already deleted
            if (data.fileDeleted === true) return;

            // Guard: Hard-protected active states
            if (["printing", "pending_conversion", "processing"].includes(data.status)) return;

            // Guard: Active print 30-minute buffer
            if (data.printStartedAt) {
              const printStartedDate = data.printStartedAt.toDate ? data.printStartedAt.toDate() : new Date(data.printStartedAt);
              if (!isNaN(printStartedDate.getTime()) && (Date.now() - printStartedDate.getTime() < 30 * 60 * 1000)) {
                return;
              }
            }

            // Guard: Authoritative retention deadline
            const startTime = getRetentionStartTime(data);
            if (!startTime || (Date.now() - startTime.getTime() < RETENTION_MS)) {
              return;
            }

            // Guard: Recoverable Lease check
            const currentMs = Date.now();
            if (data.cleanupLeaseExpiresAt) {
              const leaseExpires = data.cleanupLeaseExpiresAt.toDate ? data.cleanupLeaseExpiresAt.toDate() : new Date(data.cleanupLeaseExpiresAt);
              if (leaseExpires.getTime() > currentMs && data.cleanupState === "claiming") {
                return;
              }
            }

            // Atomically acquire lease
            const leaseExpiresTimestamp = admin.firestore.Timestamp.fromDate(new Date(currentMs + LEASE_MS));
            transaction.update(docRef, {
              cleanupState: "claiming",
              cleanupLeaseExpiresAt: leaseExpiresTimestamp,
              cleanupClaimedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            leaseAcquired = true;
            freshData = data;
          });
        } catch (txnErr) {
          console.error(`[RETENTION CLEANUP] Transaction error claiming lease for ${jobId}:`, txnErr.message);
          failedCount++;
          continue;
        }

        if (!leaseAcquired || !freshData) {
          leaseLockedCount++;
          continue;
        }

        // Discover and normalize all storage paths
        const storagePaths = discoverStoragePaths(freshData, bucket.name);
        let allSucceeded = true;
        let failureError = null;

        for (const p of storagePaths) {
          // Pre-deletion defense-in-depth re-read of latest job document
          const latestDocSnap = await docRef.get();
          if (!latestDocSnap.exists) {
            console.log(`[RETENTION CLEANUP] Job ${jobId} was deleted, aborting file cleanup`);
            allSucceeded = false;
            break;
          }
          const latestData = latestDocSnap.data();

          // Hard abort if job became active in the interim
          if (["printing", "pending_conversion", "processing"].includes(latestData.status)) {
            console.log(`[RETENTION CLEANUP] Aborting cleanup for ${jobId}: job became ${latestData.status}`);
            allSucceeded = false;
            break;
          }

          // Verify lease still belongs to this cleanup operation and has not expired
          const nowCheckMs = Date.now();
          const leaseExpires = latestData.cleanupLeaseExpiresAt
            ? (latestData.cleanupLeaseExpiresAt.toDate ? latestData.cleanupLeaseExpiresAt.toDate().getTime() : new Date(latestData.cleanupLeaseExpiresAt).getTime())
            : 0;
          if (latestData.cleanupState !== "claiming" || leaseExpires <= nowCheckMs) {
            console.log(`[RETENTION CLEANUP] Aborting cleanup for ${jobId}: lease expired or superseded`);
            allSucceeded = false;
            break;
          }

          // Template protection guard immediately before physical deletion
          if (isProtectedTemplate(p)) {
            console.log(`[RETENTION CLEANUP] Protected template skipped: ${p} for job ${jobId}`);
            continue;
          }

          // Active cross-job reference check
          const isReferenced = await isStoragePathReferencedByOtherActiveJob(db, p, jobId);
          if (isReferenced) {
            console.log(`[RETENTION CLEANUP] Preserving active referenced path: ${p} for job ${jobId}`);
            continue;
          }

          // Physical GCS deletion
          try {
            await bucket.file(p).delete();
            console.log(`[RETENTION CLEANUP] Deleted GCS object: ${p} for job ${jobId}`);
          } catch (delErr) {
            if (delErr.code === 404) {
              console.log(`[RETENTION CLEANUP] Object already gone (404): ${p} for job ${jobId}`);
            } else {
              console.error(`[RETENTION CLEANUP ERROR] Could not delete ${p} for job ${jobId}:`, delErr.message);
              allSucceeded = false;
              failureError = delErr.message;
            }
          }
        }

        if (allSucceeded) {
          const updatePayload = {
            fileDeleted: true,
            fileDeletedAt: admin.firestore.FieldValue.serverTimestamp(),
            cleanupState: "completed",
            cleanupLeaseExpiresAt: admin.firestore.FieldValue.delete()
          };

          // Validated state transitions:
          if (freshData.status === "paid") {
            updatePayload.status = "expired";
            updatePayload.printerStatus = "Expired (Files Purged)";
          } else if (freshData.status === "pending") {
            updatePayload.status = "abandoned";
            updatePayload.abandonedAt = admin.firestore.FieldValue.serverTimestamp();
          }

          try {
            await docRef.update(updatePayload);
            cleanedCount++;
            console.log(`[RETENTION CLEANUP] Successfully completed job ${jobId}: fileDeleted=true`);
          } catch (updateErr) {
            console.error(`[RETENTION CLEANUP ERROR] Failed updating Firestore for ${jobId}:`, updateErr.message);
            failedCount++;
          }
        } else {
          // Allow retry on future invocation once lease expires
          try {
            const freshDocAfterAbort = await docRef.get();
            const freshDataAfterAbort = freshDocAfterAbort.data() || {};
            // Only record failed cleanupState if the job did not actively transition to printing or completed
            if (!["printing", "completed"].includes(freshDataAfterAbort.status)) {
              await docRef.update({
                cleanupState: "failed",
                cleanupError: failureError || "Cleanup aborted or partial deletion failure"
              });
            }
          } catch (_) {}
          failedCount++;
        }
      }

      console.log(`[RETENTION CLEANUP] Run complete. Processed: ${processedCount}, Cleaned: ${cleanedCount}, LeaseLocked/Skipped: ${leaseLockedCount}, Failures: ${failedCount}`);
    } catch (queryErr) {
      console.error("[RETENTION CLEANUP CRITICAL ERROR] Query execution failed:", queryErr);
    }
  }
);
