"use strict";
// Mission 05: the worker TICK — claims one job from durableJobStore.js, runs a caller-supplied `process`
// function against its durably-stored payload, and records the outcome. This is deliberately NOT a Cloud
// Function, NOT a queue consumer loop, and NOT wired to any trigger or schedule: no such infrastructure is
// deployed in this repository for this feature, and this mission does not deploy anything. What calls
// `runWorkerOnce` in production (a Firestore trigger on the job collection, or a scheduled sweep — both
// patterns already exist elsewhere in functions/src/triggers/) is documented in durableJobStore.js and the
// mission report, not built here.
//
// `process` is passed in at CALL TIME, not stored. This is what makes the job durable across a restart: the
// thing that can't survive a process crash (the closure) is never what's persisted — only its plain-data
// INPUT (`payload`) is. Whoever runs the next worker tick (a test, or — later — real trigger/schedule code)
// supplies `process` fresh each time from ordinary deployed code.
const { claimJob, completeJob, failJob, DEFAULT_LEASE_MS, DEFAULT_MAX_ATTEMPTS } = require("./durableJobStore");
const { processDocuments } = require("./pipeline");
const { pricingContext } = require("./pricingAdapter");
const { uploadValidatedFile } = require("./storageAdapter");
const { COLOR_MODES, MAX_COPIES } = require("./flowContract");

const CONTENT_TYPE_BY_KIND = { pdf: "application/pdf", png: "image/png", jpeg: "image/jpeg" };

/**
 * One claim-process-record cycle for a single job. Safe to call even if the job is already claimed by
 * someone else, already terminal, or does not exist — it just reports why nothing happened.
 *
 * @returns {Promise<{outcome:"not_claimed"|"completed"|"retryable_failed"|"terminal_failed", claim:object, write?:object}>}
 */
async function runWorkerOnce({ db, collection, jobId, workerId, process: runProcess, leaseMs = DEFAULT_LEASE_MS, maxAttempts = DEFAULT_MAX_ATTEMPTS, now = () => Date.now() }) {
  const claim = await claimJob({ db, collection, jobId, workerId, leaseMs, now });
  if (!claim.claimed) return { outcome: "not_claimed", claim };

  let result;
  try {
    result = await runProcess(claim.payload, { attempts: claim.attempts, jobId });
  } catch (err) {
    const write = await failJob({ db, collection, jobId, workerId, error: err, maxAttempts, now });
    return { outcome: write.terminal ? "terminal_failed" : "retryable_failed", claim, write };
  }
  const write = await completeJob({ db, collection, jobId, workerId, result, now });
  // If the lease was lost between finishing the work and recording it, the job is left exactly as the
  // reclaiming worker leaves it — this worker's (possibly still-correct) result is simply discarded, never
  // forced onto the record. That IS the "stale worker cannot overwrite newer results" guarantee in effect.
  return { outcome: write.written ? "completed" : "not_claimed", claim, write };
}

/**
 * Reference `process` function for a WhatsApp Flow document-processing job: downloads/decrypts/validates
 * every file (pipeline.js) and reads per-page RATES ONLY (pricingAdapter.js — never a total; see
 * docs/engineering/MIMO_WHATSAPP_FLOW_APPLICATION_CONTRACT_v0.1.md for why). This is the exact logic
 * flowHandler.js's `submitOptions` runs inline for the in-memory store; here it is extracted into a
 * standalone function of `(payload) -> result`, driven by DURABLE data instead of a closure, so a worker
 * tick can run it without having been the process that received the original CONFIGURE request.
 *
 * ALL-FILES-MUST-VALIDATE is preserved exactly as pipeline.js already enforces it: `processDocuments` never
 * reports partial success, so a single bad file fails the whole job (never a job that "completed" with some
 * files silently dropped).
 *
 * Trust boundary: `payload.documents` are Flow media references (ids/CDN pointers), not file content and not
 * a claimed page count — pages are counted here, from the downloaded bytes, exactly as the in-memory path
 * does. Nothing here creates an order, a payment, or a print job.
 *
 * Mission 09: when `bucket` is supplied, every validated file is ALSO persisted to Storage
 * (storageAdapter.js) before the job can report success — ALL-FILES-MUST-VALIDATE is extended to
 * ALL-FILES-MUST-PERSIST: if any file's upload fails, the whole job fails (thrown, same bounded-retry path),
 * never a job COMPLETED with some files unpersisted. The raw plaintext bytes are only ever held in memory
 * long enough to upload — they are never included in the job's stored `result` (only the Storage reference,
 * size, validated page count and a server-computed content hash are).
 */
function createDocumentProcessingTask({ deps, db, bucket, pricing: pricingFn = pricingContext, concurrency = 1, limits } = {}) {
  return async function process(payload, { jobId } = {}) {
    const { documents, color, copies } = payload || {};
    if (!Array.isArray(documents) || documents.length === 0) {
      throw new Error("NO_FILES: payload has no documents");
    }
    if (!COLOR_MODES.includes(color)) throw new Error(`BAD_COLOR_MODE: ${color}`);
    const copiesN = Number(copies);
    if (!Number.isInteger(copiesN) || copiesN < 1 || copiesN > MAX_COPIES) throw new Error(`BAD_COPIES: ${copies}`);

    const r = await processDocuments(documents, deps, { concurrency, limits, keepPlaintext: !!bucket });
    if (r.errors.length) {
      // All-files-must-validate: ANY failing file fails the whole job. Thrown (not returned) so the worker
      // records it through failJob's bounded-retry path, exactly like a transient download error would be.
      throw new Error(`Could not process ${r.errors.length} file(s): ${[...new Set(r.errors.map((e) => e.code))].join(", ")}`);
    }

    let files = r.files;
    if (bucket) {
      if (!jobId) throw new Error("createDocumentProcessingTask: a jobId is required to persist files to Storage");
      // Sequential, deliberately: a deterministic (jobId, index) path means retrying a partially-uploaded
      // job re-uploads the SAME objects rather than racing several uploads whose partial-failure ordering
      // would be harder to reason about. If any upload throws, this whole `process()` call throws too.
      files = [];
      for (let i = 0; i < r.files.length; i++) {
        const f = r.files[i];
        const type = CONTENT_TYPE_BY_KIND[f.kind] || "application/octet-stream";
        const uploaded = await uploadValidatedFile({ bucket, jobId, index: i, name: f.name, bytes: f.plain, contentType: type });
        files.push({ name: f.name, kind: f.kind, type, pages: f.pages, size: uploaded.size, url: uploaded.fileUrl, storagePath: uploaded.storagePath, contentHash: uploaded.contentHash });
      }
    }

    const pricing = await pricingFn(db, { totalRawPages: r.totalPages, colorMode: color, copies: copiesN });
    return { ok: true, totalPages: r.totalPages, files, pricingStatus: pricing.status, rates: pricing.rates };
  };
}

module.exports = { runWorkerOnce, createDocumentProcessingTask, CONTENT_TYPE_BY_KIND };
