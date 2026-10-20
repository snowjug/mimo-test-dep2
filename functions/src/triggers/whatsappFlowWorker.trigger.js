"use strict";
// Mission 16 Step 2: the smallest reliable mechanism to actually RUN a submitted WhatsApp Flow job
// (flowOrchestrator.js's runOrchestratedWorkerTick) without depending on the Flow endpoint's own HTTP
// response staying alive. Mirrors the existing scheduled-sweep pattern already deployed in this repo
// (triggers/printTimeout.trigger.js) instead of introducing Cloud Tasks/Pub/Sub, which nothing else here uses.
//
// durableJobStore.js's claimJob/completeJob/failJob already provide the idempotency/lease guarantees this
// mission requires (a job claimed, completed, or terminally failed by one tick is never reprocessed or
// overwritten by a concurrent or later tick) — this file adds no new concurrency primitive. It only decides
// WHEN a tick runs and WHICH jobs it looks at: any whatsapp_flow_jobs doc currently PENDING, or PROCESSING
// with a lease that may have expired (claimJob itself re-checks the lease and no-ops if it hasn't).
// Mission 23: moved off prototypes/whatsapp-flow-endpoint/src/ (never uploaded by Firebase — see
// whatsappFlow.controller.js's own note on the resulting deploy crash) onto src/whatsapp-flow/, which ships
// inside the deployed package.
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { admin, db } = require("../config/firebase");
const {
  runOrchestratedWorkerTick,
  DEFAULT_JOB_COLLECTION,
} = require("../whatsapp-flow/flowOrchestrator");
const { createCdnFetcher } = require("../whatsapp-flow/cdn");

const FLOW_MEDIA_CDN_HOST_SUFFIXES = ["whatsapp.net"]; // [DOC CONFIRMED, Mission 17] — see whatsappFlow.controller.js's own note
const MAX_MEDIA_BYTES = 30 * 1024 * 1024;
const MAX_JOBS_PER_SWEEP = 20; // [ASSUMED] small batch for a controlled prototype; raise only with evidence of real backlog

/** Plain, framework-free function so it can be unit tested directly — same convention as runPrintTimeoutSweep. */
async function runWhatsappFlowWorkerSweep() {
  const snap = await db
    .collection(DEFAULT_JOB_COLLECTION)
    .where("state", "in", ["PENDING", "PROCESSING"])
    .limit(MAX_JOBS_PER_SWEEP)
    .get();
  if (snap.empty) return { scanned: 0, ticked: 0 };

  const bucket = admin.storage().bucket();
  const deps = { fetchCdn: createCdnFetcher({ allowedHostSuffixes: FLOW_MEDIA_CDN_HOST_SUFFIXES, maxBytes: MAX_MEDIA_BYTES }) };
  const workerId = `sweep-${process.pid}-${Date.now()}`;

  let ticked = 0;
  for (const doc of snap.docs) {
    try {
      const result = await runOrchestratedWorkerTick({ db, bucket, flowToken: doc.id, workerId, deps });
      if (result.outcome !== "not_claimed") ticked++;
    } catch (err) {
      console.error(`[WHATSAPP FLOW WORKER SWEEP] tick failed for ${doc.id}:`, err.message);
    }
  }
  return { scanned: snap.docs.length, ticked };
}

exports.scheduledWhatsappFlowWorkerSweep = onSchedule(
  { schedule: "every 2 minutes", timeZone: "Asia/Kolkata", timeoutSeconds: 120, maxInstances: 1 },
  runWhatsappFlowWorkerSweep
);

// Exported separately for direct unit testing — see __tests__/whatsappFlowWorkerSweep.test.js
exports.runWhatsappFlowWorkerSweep = runWhatsappFlowWorkerSweep;
exports.FLOW_MEDIA_CDN_HOST_SUFFIXES = FLOW_MEDIA_CDN_HOST_SUFFIXES;
