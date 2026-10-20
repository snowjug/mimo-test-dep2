"use strict";
// Mission 05: durable document-processing jobs for the WhatsApp Flow prototype.
//
// WHY THIS FILE EXISTS
// Mission 04's `createFirestoreSessionStore` (src/sessionStore.js) recorded a PROCESSING doc and then ran the
// actual work as `Promise.resolve().then(run)` IN THE SAME PROCESS. That is unsafe for production for two
// reasons this mission calls out explicitly: (1) a Cloud Function is not guaranteed to stay warm after it
// returns its HTTP response, so work started that way can simply never finish; (2) `run` was an in-memory
// closure — if the process died before it finished, there was no durable record of WHAT to redo, only that
// something was "PROCESSING". A durable job needs its INPUT persisted, not just its status.
//
// WHAT EXISTS IN THIS REPOSITORY (inspected before designing this)
//   - No Cloud Tasks, no Pub/Sub, no job-queue library anywhere in functions/ (checked package.json and
//     every src/ file). This mission's instruction not to assume a queue exists is correct for this repo.
//   - The established durable-work pattern IS already here: `functions/src/services/refund.service.js`
//     (`claimRefund`/`releaseRefund`) — a Firestore TRANSACTION claims a unit of work by writing a status +
//     a claimed-at timestamp, a `STALE_CLAIM_MS` window lets a crashed claim be retaken, and the work itself
//     runs in whatever process calls `claimRefund` (an onUpdate trigger, an admin HTTP handler, or a
//     scheduled sweep — `functions/src/triggers/printTimeout.trigger.js` is the scheduled-sweep precedent).
//   This file generalises that EXACT pattern (claim -> do work -> release, with staleness-based reclaim)
//   into a reusable job store, instead of inventing a new concurrency primitive.
//
// THE MISSING-INFRASTRUCTURE BOUNDARY (documented, not implemented — see worker.js and the mission report)
//   What actually INVOKES a worker tick in production is NOT decided by this file and is NOT built in this
//   mission (no public endpoint, no deployment). Two options exist using only what this repo already has:
//     (a) A Firestore `onDocumentCreated`/`onDocumentWritten` trigger on this collection (same shape as
//         `printJob.triggers.js`) claims and processes the job the moment it is written.
//     (b) A scheduled sweep (same shape as `scheduledPrintTimeoutSweep`) periodically claims any PENDING or
//         stale-leased job and processes it.
//   Either is a small, idiomatic addition to `functions/index.js` once a real endpoint exists; this mission
//   stops at the store + worker-tick function that such a trigger or sweep would call.
//
// TRUST BOUNDARY: a job's `payload` is whatever the caller of submitJob() puts there (e.g. Flow media
// references + chosen colour/copies). This store never prices anything, never creates an order, a payment or
// a print job, and never trusts `payload` as a page count/price/payment status — it is opaque data in and
// opaque `result` data out. The caller's `process()` function (worker.js) is responsible for recomputing
// page counts/prices from the files themselves, exactly as pipeline.js already does.
//
// ───────────────────────────────── Contract ─────────────────────────────────
// Job document shape (one per `collection(name).doc(jobId)`):
//   { fingerprint, payload, state: "PENDING"|"PROCESSING"|"COMPLETED"|"FAILED",
//     attempts, result, error, leaseOwner, leaseExpiresAt, createdAt, updatedAt }
//
// submitJob({db, collection, jobId, fingerprint, payload, now}) -> {submitted:boolean, reason?}
//   Persists the job BEFORE the caller acknowledges the request (requirement: persist-before-ack). Idempotent
//   per (jobId, fingerprint): if a live (non-terminal-FAILED) job with the SAME fingerprint already exists,
//   it is left untouched — a duplicate submission is a no-op, not a double-write. A DIFFERENT fingerprint, or
//   a prior terminal FAILED job, starts a fresh PENDING job with attempts reset to 0.
//
// claimJob({db, collection, jobId, workerId, leaseMs, now}) -> {claimed, reason?, fingerprint?, payload?, attempts?}
//   Atomic claim via `db.runTransaction` (the real guarantee, not a process-local lock — see worker.js and
//   the mission report for what this means against the repository's in-memory Firestore fake vs. real
//   Firestore). Claims a PENDING job, OR a PROCESSING job whose lease has expired (the holder crashed or was
//   killed mid-work). Refuses to claim a job that is COMPLETED, terminally FAILED, or actively leased by
//   someone else.
//
// completeJob({db, collection, jobId, workerId, result, now}) -> {written, reason?}
// failJob({db, collection, jobId, workerId, error, maxAttempts, now}) -> {written, terminal, reason?}
//   Both require the CALLER to still hold the lease (`leaseOwner === workerId` AND the lease has not expired)
//   at write time, re-checked inside a transaction. A worker whose lease was reclaimed by someone else (or
//   simply expired) can finish its work and call these, but the write is silently rejected — this is what
//   stops a stale worker from overwriting a newer result. `failJob` increments `attempts`; once `attempts`
//   reaches `maxAttempts` the job becomes terminally FAILED (no further claim is ever possible); otherwise it
//   goes back to PENDING so a future claim (by the same or another worker) can retry it.
//
// getJob({db, collection, jobId}) -> entry|undefined   (undefined only when the document does not exist)

const DEFAULT_LEASE_MS = 2 * 60 * 1000; // generous for a Cloud Function's own request budget plus margin
const DEFAULT_MAX_ATTEMPTS = 3;
const TERMINAL_STATES = new Set(["COMPLETED", "FAILED"]);

const errorMessage = (err) => (err && err.message) || String(err);

function ref({ db, collection, jobId }) {
  return db.collection(collection).doc(jobId);
}

async function submitJob({ db, collection, jobId, fingerprint, payload, now = () => Date.now() }) {
  if (!db || typeof db.runTransaction !== "function") throw new Error("submitJob requires a Firestore-shaped db");
  if (!jobId) throw new Error("submitJob requires jobId");
  const docRef = ref({ db, collection, jobId });
  const ts = now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const data = snap.exists ? snap.data() : null;
    if (data && data.fingerprint === fingerprint && data.state !== "FAILED") {
      return { submitted: false, reason: "duplicate" }; // already pending/processing/completed with the SAME inputs
    }
    tx.set(docRef, {
      fingerprint, payload, state: "PENDING", attempts: 0, result: null, error: null,
      leaseOwner: null, leaseExpiresAt: 0, createdAt: ts, updatedAt: ts,
    });
    return { submitted: true };
  });
}

async function claimJob({ db, collection, jobId, workerId, leaseMs = DEFAULT_LEASE_MS, now = () => Date.now() }) {
  if (!db || typeof db.runTransaction !== "function") throw new Error("claimJob requires a Firestore-shaped db");
  const docRef = ref({ db, collection, jobId });
  const ts = now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists) return { claimed: false, reason: "not_found" };
    const data = snap.data();
    if (TERMINAL_STATES.has(data.state)) return { claimed: false, reason: "terminal", state: data.state };
    if (data.state === "PROCESSING" && data.leaseExpiresAt > ts) {
      return { claimed: false, reason: "leased", leaseOwner: data.leaseOwner };
    }
    // PENDING, or PROCESSING with an EXPIRED lease (the previous worker died or was killed): claim it.
    tx.update(docRef, { state: "PROCESSING", leaseOwner: workerId, leaseExpiresAt: ts + leaseMs, updatedAt: ts });
    return { claimed: true, fingerprint: data.fingerprint, payload: data.payload, attempts: data.attempts || 0 };
  });
}

async function completeJob({ db, collection, jobId, workerId, result, now = () => Date.now() }) {
  const docRef = ref({ db, collection, jobId });
  const ts = now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists) return { written: false, reason: "not_found" };
    const data = snap.data();
    // Lease check at write time, not just at claim time: a worker whose lease has since expired — even if
    // nobody else has claimed it YET — must not be allowed to record a result nobody can trust is still
    // exclusive. This is stricter than "leaseOwner matches" alone, which would miss the case where the same
    // (zombie) worker is still the recorded owner purely because no one has reclaimed the expired lease yet.
    if (data.leaseOwner !== workerId || data.leaseExpiresAt <= ts) return { written: false, reason: "lease_lost" };
    tx.update(docRef, { state: "COMPLETED", result, error: null, leaseOwner: null, leaseExpiresAt: 0, updatedAt: ts });
    return { written: true };
  });
}

async function failJob({ db, collection, jobId, workerId, error, maxAttempts = DEFAULT_MAX_ATTEMPTS, now = () => Date.now() }) {
  const docRef = ref({ db, collection, jobId });
  const ts = now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists) return { written: false, reason: "not_found" };
    const data = snap.data();
    if (data.leaseOwner !== workerId || data.leaseExpiresAt <= ts) return { written: false, reason: "lease_lost" };
    const attempts = (data.attempts || 0) + 1;
    const terminal = attempts >= maxAttempts;
    tx.update(docRef, {
      state: terminal ? "FAILED" : "PENDING", // retryable failures go back to PENDING for a future claim
      attempts, error: errorMessage(error), leaseOwner: null, leaseExpiresAt: 0, updatedAt: ts,
    });
    return { written: true, terminal, attempts };
  });
}

async function getJob({ db, collection, jobId }) {
  const snap = await ref({ db, collection, jobId }).get();
  return snap.exists ? snap.data() : undefined;
}

module.exports = {
  DEFAULT_LEASE_MS, DEFAULT_MAX_ATTEMPTS, TERMINAL_STATES,
  submitJob, claimJob, completeJob, failJob, getJob,
};
