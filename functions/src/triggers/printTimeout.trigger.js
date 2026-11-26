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
const {
  evaluatePrintingJobTimeout,
  hasPiReachedJob,
} = require("../services/printTimeout.service");

// Plain, framework-free function so it can be unit tested directly (onSchedule's HTTP-shaped
// invocation wrapper is not worth fighting in tests just to exercise this logic).
async function runPrintTimeoutSweep() {
  const snap = await db.collection("print_jobs").where("status", "==", "printing").get();
  if (snap.empty) return;

  const nowMs = Date.now();
  let resolvedCount = 0;

  const entries = snap.docs.map((doc) => ({ doc, data: doc.data() }));
  const busyKioskIds = new Set();
  const docsByOrder = new Map();

  for (const { data } of entries) {
    if (data.kioskId && hasPiReachedJob(data)) {
      busyKioskIds.add(data.kioskId);
    }
    if (data.orderId) {
      if (!docsByOrder.has(data.orderId)) docsByOrder.set(data.orderId, []);
      docsByOrder.get(data.orderId).push(data);
    }
  }

  for (const { doc, data: d } of entries) {
    const sessionDocs = d.orderId ? docsByOrder.get(d.orderId) : null;
    const timeoutHit = evaluatePrintingJobTimeout({
      job: d,
      sessionDocs,
      busyKioskIds,
      isColor: isColorJob(d),
      nowMs,
    });
    if (!timeoutHit) continue;

    // Re-check inside a transaction right before writing: the job may have legitimately
    // completed or been picked up by the Pi between this query and now.
    try {
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        if (!fresh.exists) return;
        const freshData = fresh.data();
        if (freshData.status !== "printing") return;
        if (timeoutHit.kind === "pi_unreachable" && hasPiReachedJob(freshData)) return;
        tx.update(doc.ref, {
          status: "failed",
          printerStatus: timeoutHit.reason,
          failedAt: admin.firestore.FieldValue.serverTimestamp(),
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
