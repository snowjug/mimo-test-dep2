/**
 * Proactively resolves print_jobs stuck in "printing" past their expected duration.
 *
 * The reactive check in routes/kiosk.routes.js (GET /kiosk/job-status) only runs as a
 * side effect of the kiosk polling that endpoint. If the kiosk screen stops polling
 * (closed, crashed, or its own client-side timeout gave up first) before that check
 * ever fires, a stuck job — and the customer's refund — could sit unresolved forever.
 * This sweep is the backstop: it runs on a schedule regardless of whether anyone is
 * still polling, using the same timeout formula so the two never disagree.
 */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { admin, db } = require("../config/firebase");
const { isColorJob } = require("../services/printJob.service");
const { computePrintTimeoutMs, PRINT_TIMEOUT_MESSAGE } = require("../services/printTimeout.service");

// Plain, framework-free function so it can be unit tested directly (onSchedule's HTTP-shaped
// invocation wrapper is not worth fighting in tests just to exercise this logic).
async function runPrintTimeoutSweep() {
  const snap = await db.collection("print_jobs").where("status", "==", "printing").get();
  if (snap.empty) return;

  const nowMs = Date.now();
  let resolvedCount = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const startTs = d.printStartedAt || d.updatedAt;
    const startMs = startTs?.toDate ? startTs.toDate().getTime() : (startTs ? new Date(startTs).getTime() : null);
    if (!startMs) continue;

    const totalPageCount = Math.max(1, (d.pageCount || 1) * (d.printOptions?.copies || d.copies || 1));
    const timeoutMs = computePrintTimeoutMs({
      totalPageCount,
      isColor: isColorJob(d),
      fileSizeBytes: d.fileSize || d.fileSizeBytes || 0,
    });

    if (nowMs - startMs <= timeoutMs) continue;

    // Re-check inside a transaction right before writing: the job may have legitimately
    // completed in the time between this query and now, and we must not overwrite that.
    try {
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        if (!fresh.exists || fresh.data().status !== "printing") return;
        tx.update(doc.ref, {
          status: "failed",
          printerStatus: PRINT_TIMEOUT_MESSAGE,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        resolvedCount++;
      });
    } catch (err) {
      console.error(`[PRINT TIMEOUT SWEEP] Failed to resolve stuck job ${doc.id}:`, err);
    }
  }

  if (resolvedCount > 0) {
    console.log(`[PRINT TIMEOUT SWEEP] Resolved ${resolvedCount} stuck "printing" job(s).`);
  }
}

exports.scheduledPrintTimeoutSweep = onSchedule(
  {
    schedule: "every 2 minutes",
    timeZone: "Asia/Kolkata",
    timeoutSeconds: 120,
    maxInstances: 1,
  },
  runPrintTimeoutSweep
);

// Exported separately for direct unit testing — see __tests__/printTimeoutSweep.characterization.test.js
exports.runPrintTimeoutSweep = runPrintTimeoutSweep;
