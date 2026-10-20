"use strict";
// Mission 08: the isolated CREATE_ORDER operation for the WhatsApp Flow prototype. Connects:
//   verified sender identity -> resolveWhatsAppUser (functions/src/services/whatsappIdentity.service.js)
//   the durable job's validated result -> durableJobStore.js (getJob)
//   authoritative pricing/order creation -> order.service.js (createOrderForUser, channel:"whatsapp")
// NOT wired to any public endpoint, NOT connected to real Meta traffic, NOT a trigger. This is a plain
// function a future endpoint handler would call once a request's Meta signature has already been verified.
//
// Mission 38: createOrderForUser/OrderServiceError now come from the real
// functions/src/services/order.service.js — a fresh extraction of current main's postCreateOrder/
// postPaymentSuccess (not the old feature branch's version; see that file's own header for why, and the
// Mission 38 report). Mission 37's orderServiceDependency.js stub is retired by this change.
//
// TRUST BOUNDARY (re-stated because it is the whole point of this file): `flowToken` and `waId` are the ONLY
// two inputs this function accepts from outside, and BOTH must come from server-verified request context —
// `waId` from Meta's own signed/encrypted envelope, `flowToken` from the same source. Nothing else — no
// userId, no page count, no price, no payment status, no print code — is ever accepted as an argument here;
// everything else is read from durable, server-held records (the job's `result`, the resolved identity).
// Mission 23: moved here from prototypes/whatsapp-flow-endpoint/src/ (that location now re-exports this
// file) so this module ships inside the deployed Cloud Functions package — the functions/src/services/*
// requires below are now plain relative requires, not a cross-package createRequire indirection.
const { resolveWhatsAppUser } = require("../services/whatsappIdentity.service.js");
const { createOrderForUser, OrderServiceError } = require("../services/order.service.js");
const { getJob } = require("./durableJobStore");
const { verifyStoredFileExists } = require("./storageAdapter");

const DEFAULT_JOB_COLLECTION = "whatsapp_flow_jobs";
const DEFAULT_ORDER_LINK_COLLECTION = "whatsapp_flow_orders";
const STALE_CLAIM_MS = 60 * 1000; // an in-progress claim older than this is treated as abandoned and may be retaken

// Mission 21: notification lease/attempt bounds — same idiom durableJobStore.js already uses for
// leaseMs/maxAttempts, deliberately re-expressed here rather than calling durableJobStore.js directly: that
// store's `submitJob` does a full (non-merge) `tx.set` of {fingerprint, payload, state, attempts, result,
// error, leaseOwner, leaseExpiresAt} onto whatever document it's given, which would destroy this SAME
// linkRef's existing order-creation fields (orderId, paymentSessionId, status:"created", ...) if reused on
// this document, and its 4-state model (PENDING/PROCESSING/COMPLETED/FAILED) has no way to express
// "ambiguous, do not blindly retry" as distinct from "server definitely rejected it" (requirement 4/5 of
// Mission 21). The CLAIM-LEASE-COMPLETE pattern itself is reused verbatim; only the state names and the
// document differ.
const DEFAULT_NOTIFY_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_NOTIFY_MAX_ATTEMPTS = 3;
const NOTIFY_STATES = Object.freeze({
  PENDING: "PENDING", // never attempted yet
  NOTIFYING: "NOTIFYING", // a lease is held; an attempt is (or was, if the lease expired) in flight
  NOTIFIED: "NOTIFIED", // confirmed delivered — terminal, never reset
  RETRYABLE: "RETRYABLE", // a DEFINITE failure (Meta rejected it) — safe to retry, attempts remain below the bound
  UNKNOWN: "UNKNOWN", // an AMBIGUOUS outcome (e.g. a timeout with no response), or retries exhausted — never
  // auto-retried; needs reconciliation (a human, or a future explicit reconciliation tool) before any further send.
});

class FlowOrderError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.name = "FlowOrderError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Builds the `print_jobs`-shaped pending-job document createOrderForUser already knows how to merge
 * (functions/src/services/order.service.js's `files[]` branch: `fileItem.name/originalFileName/url/type/
 * size/pageCount`). This is the smallest adapter between a completed Flow job's validated result and the
 * EXISTING order-creation contract — no new field is invented on the `print_jobs` side.
 *
 * BLOCKER, surfaced explicitly rather than papered over: pipeline.js/worker.js validate files by downloading
 * them to a temporary directory and deleting it once validation finishes (pipeline.js: `finally { rm(workDir,
 * ...) }`) — by design, since this prototype was built as a stateless validation check, not an upload
 * pipeline. A job's `result.files[]` therefore had NO persisted `url` before Mission 09; worker.js now
 * uploads every validated file to Storage (storageAdapter.js) before the job can be marked COMPLETED, so a
 * `url`/`storagePath`/`contentHash` is present on each file whenever the job genuinely finished successfully.
 * This function still fails with a named, typed error (`FILE_STORAGE_NOT_IMPLEMENTED`) if it ever sees a file
 * without a `url` — e.g. a job completed by an older worker that was not given a `bucket` — instead of
 * inventing one or writing a broken print job.
 *
 * Adds only NEW, additive fields to the existing `print_jobs` schema (`contentHash`) — every field
 * `createOrderForUser` already reads (`name`/`originalFileName`/`url`/`type`/`size`/`pageCount`) keeps its
 * existing meaning and shape.
 */
function buildPendingPrintJobDoc({ userId, files, totalPages, expectedFileCount }) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new FlowOrderError(500, "JOB_NOT_READY", "The completed job has no validated files.");
  }
  // Defense in depth: pipeline.js's all-files-must-validate rule already guarantees this can't diverge for a
  // genuinely COMPLETED job, but CREATE_ORDER re-checks it rather than assuming the invariant held upstream.
  if (Number.isInteger(expectedFileCount) && files.length !== expectedFileCount) {
    throw new FlowOrderError(409, "FILE_COUNT_MISMATCH", `Expected ${expectedFileCount} validated file(s), job result has ${files.length}.`);
  }
  if (files.some((f) => !f.url || !f.storagePath)) {
    throw new FlowOrderError(
      501,
      "FILE_STORAGE_NOT_IMPLEMENTED",
      "One or more Flow-uploaded files are not persisted to durable storage; CREATE_ORDER cannot build a print job without a file reference."
    );
  }
  return {
    userId,
    status: "pending",
    files: files.map((f) => ({ name: f.name, originalFileName: f.name, url: f.url, type: f.type || "application/octet-stream", size: f.size || 0, pageCount: f.pages, contentHash: f.contentHash })),
    fileName: files.length > 1 ? `Multiple Files (${files.length})` : files[0].name,
    fileUrl: files[0].url,
    mimetype: files[0].type || "application/octet-stream",
    size: files.reduce((acc, f) => acc + (f.size || 0), 0),
    pageCount: totalPages,
  };
}

/**
 * CREATE_ORDER. Idempotent and safe under duplicate delivery / concurrent requests for the SAME `flowToken`
 * via a Firestore-transaction claim on `whatsapp_flow_orders/{flowToken}` (same claim-then-release shape as
 * the repository's existing `refund.service.js:claimRefund`). See the Mission 08 report for the one
 * remaining, explicitly-documented restart-timing gap this mechanism does NOT close.
 *
 * @param {object} args
 * @param {FirebaseFirestore.Firestore} args.db - the functions/ Firestore instance (orders, users, print_jobs, ...)
 * @param {FirebaseFirestore.Firestore} [args.jobDb] - the durable-job-store Firestore instance (defaults to `db`)
 * @param {string} [args.jobCollection]
 * @param {string} [args.orderLinkCollection]
 * @param {string} args.flowToken - server-held session/job id. NEVER accept this from Flow `data`'s own fields.
 * @param {string} args.waId - server-VERIFIED WhatsApp sender id (post signature verification). NEVER accept
 *   this from Flow `data`'s own fields, and never treat `flowToken` itself as proof of who this is.
 * @param {Function} [args.now]
 * @returns {Promise<{orderId:string, amount:number, paymentSessionId:string|null, free?:boolean, idempotent?:boolean}>}
 */
async function createOrderFromFlowJob({
  db, jobDb = db, jobCollection = DEFAULT_JOB_COLLECTION, orderLinkCollection = DEFAULT_ORDER_LINK_COLLECTION,
  flowToken, waId, bucket, now = () => Date.now(),
}) {
  if (typeof flowToken !== "string" || !flowToken) {
    throw new FlowOrderError(400, "BAD_SESSION", "flowToken is required.");
  }
  if (typeof waId !== "string" || !waId) {
    throw new FlowOrderError(400, "BAD_SENDER", "A verified sender id is required.");
  }

  const linkRef = db.collection(orderLinkCollection).doc(flowToken);
  const nowMs = now();

  // 1) Claim the (flowToken) slot BEFORE doing anything else. A duplicate delivery or a second concurrent
  // request for the same session either finds the order already created (returns it unchanged) or finds a
  // live claim in progress (refused, not duplicated).
  const claim = await db.runTransaction(async (tx) => {
    const snap = await tx.get(linkRef);
    const data = snap.exists ? snap.data() : null;
    if (data && data.status === "created") return { outcome: "already_created", link: data };
    if (data && data.status === "creating" && nowMs - (Number(data.claimedAt) || 0) < STALE_CLAIM_MS) {
      return { outcome: "in_progress" };
    }
    tx.set(linkRef, { flowToken, waId, status: "creating", claimedAt: nowMs });
    return { outcome: "claimed" };
  });

  if (claim.outcome === "already_created") {
    // Idempotent replay: the caller's waId must still match who actually created it — a session hijack
    // attempt (different waId, same flowToken) is refused even on the cached path.
    if (claim.link.waId !== waId) throw new FlowOrderError(403, "SESSION_JOB_MISMATCH", "This session does not belong to the requesting sender.");
    return { orderId: claim.link.orderId, amount: claim.link.amount, paymentSessionId: claim.link.paymentSessionId, free: claim.link.free, idempotent: true };
  }
  if (claim.outcome === "in_progress") {
    throw new FlowOrderError(409, "ORDER_CREATION_IN_PROGRESS", "Order creation for this session is already in progress.");
  }

  // 2) From here on we hold the claim. Any thrown error below leaves the claim in "creating" until it goes
  // stale (STALE_CLAIM_MS) and can be retried — never left permanently stuck, never silently retried as a
  // NEW order while this attempt might still be in flight elsewhere.
  try {
    // 3) Resolve identity — read-only, never creates/links an account.
    const identity = await resolveWhatsAppUser(db, waId);
    if (identity.status === "invalid") throw new FlowOrderError(400, "IDENTITY_INVALID", identity.reason);
    if (identity.status === "unresolved") throw new FlowOrderError(403, "IDENTITY_UNRESOLVED", `Sender identity could not be resolved (${identity.reason}).`);

    // 4) Load the durable job by the SAME server-held id as the session. Ownership is checked against the
    // job's OWN recorded sender (set when the job was submitted), never against anything in this request.
    const job = await getJob({ db: jobDb, collection: jobCollection, jobId: flowToken });
    if (!job) throw new FlowOrderError(404, "JOB_NOT_FOUND", "No processing job exists for this session.");
    if (!job.payload || job.payload.waId !== waId) {
      throw new FlowOrderError(403, "SESSION_JOB_MISMATCH", "This session's job does not belong to the requesting sender.");
    }
    if (job.state !== "COMPLETED" || !job.result || job.result.ok !== true) {
      throw new FlowOrderError(409, "JOB_NOT_READY", `The processing job is not completed (state: ${job.state}).`);
    }

    // 5) Validated totals come ONLY from the job's durable result — never from this request's arguments
    // (which carry none anyway) and never re-derived from anything client-suppliable.
    const { totalPages, files } = job.result;
    const colorMode = job.payload.color === "color" ? "color" : "bw";
    const copies = Number(job.payload.copies) || 1;
    const expectedFileCount = Array.isArray(job.payload.documents) ? job.payload.documents.length : undefined;

    // Re-verify, right now, that every referenced Storage object is still actually there — a job that
    // completed successfully some time ago could in principle have had an object deleted since (accidental
    // removal, a lifecycle rule). Never assume "it was fine at upload time" still holds at order-creation time.
    if (bucket && Array.isArray(files)) {
      for (const f of files) {
        if (!f.storagePath) continue; // handled by buildPendingPrintJobDoc's own check below
        const exists = await verifyStoredFileExists({ bucket, storagePath: f.storagePath });
        if (!exists) throw new FlowOrderError(409, "MISSING_STORAGE_OBJECT", `Persisted file ${f.storagePath} is no longer present in storage.`);
      }
    }

    const pendingJobDoc = buildPendingPrintJobDoc({ userId: identity.userId, files, totalPages, expectedFileCount });
    const printJobRef = db.collection("print_jobs").doc(`wa_flow_${flowToken}`); // deterministic: safe to retry
    await printJobRef.set(pendingJobDoc);

    // 6) Authoritative pricing/order creation — channel:"whatsapp" activates the SV-002 colour-routing guard
    // (functions/src/services/order.service.js, Mission 07). Website callers are unaffected (they never pass
    // `channel`). This call creates AN ORDER ONLY: no payment is marked, no print code is issued, no print
    // job is dispatched to a kiosk.
    const order = await createOrderForUser({ db, userId: identity.userId, jobIds: [printJobRef.id], printOptions: { colorMode, copies }, channel: "whatsapp" });

    // 7) Record the claim as fulfilled so a retry (even after a restart) returns this SAME order.
    // notifyState starts PENDING here — exactly once, only on a FRESH creation, never reset by an idempotent
    // replay (the "already_created" branch above returns early and never reaches this write).
    await linkRef.set({
      flowToken, waId, status: "created", claimedAt: nowMs, orderId: order.orderId, amount: order.amount,
      paymentSessionId: order.paymentSessionId, free: order.free || false,
      notifyState: NOTIFY_STATES.PENDING, notifyAttempts: 0, notifyLeaseOwner: null, notifyLeaseExpiresAt: 0, notifyError: null,
    });

    return { orderId: order.orderId, amount: order.amount, paymentSessionId: order.paymentSessionId, free: order.free };
  } catch (err) {
    // Release the claim on failure (any kind) so the SAME session can be retried without waiting out the
    // stale-claim window — mirrors refund.service.js's releaseRefund.
    await linkRef.delete().catch(() => {});
    throw err;
  }
}

/**
 * Mission 21 (replaces Mission 19's permanent pre-send latch): a transactional CLAIM on the SAME
 * `whatsapp_flow_orders/{flowToken}` link doc createOrderFromFlowJob already writes — the PAYMENT_PENDING
 * hand-off step in the lifecycle:
 *   REVIEW -> ORDER_CREATED (linkRef.status:"created") -> PAYMENT_PENDING (this claim, notifyState:NOTIFYING
 *   -> NOTIFIED/RETRYABLE/UNKNOWN via completeFlowOrderNotification below) -> PAYMENT_VERIFIED/
 *   PRINT_CODE_AVAILABLE/FULFILLED (existing, untouched: Cashfree webhook/verify-payment -> fulfillPaidOrder
 *   -> kiosk redemption).
 *
 * UNLIKE Mission 19: the latch is no longer set before the send is attempted. A claim only means "I, workerId,
 * am now responsible for attempting the send, with a lease that expires if I crash." Nothing is marked
 * NOTIFIED until completeFlowOrderNotification is called back with a CONFIRMED outcome.
 *
 * Claims when notifyState is PENDING, RETRYABLE (a prior definite failure, safe to retry), or NOTIFYING with
 * an EXPIRED lease (the previous attempt crashed/never reported back — recovered exactly like
 * durableJobStore.js's claimJob recovers a stale PROCESSING job). Refuses when: no such created order yet;
 * already NOTIFIED (terminal, never reset); UNKNOWN (an ambiguous or exhausted-retry outcome — requirement 5:
 * never blindly retried without an explicit reconciliation decision); or NOTIFYING with a still-live lease
 * held by someone else (a genuinely concurrent attempt).
 */
async function claimFlowOrderNotification({
  db, orderLinkCollection = DEFAULT_ORDER_LINK_COLLECTION, flowToken, workerId, leaseMs = DEFAULT_NOTIFY_LEASE_MS, now = () => Date.now(),
}) {
  const linkRef = db.collection(orderLinkCollection).doc(flowToken);
  const ts = now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(linkRef);
    if (!snap.exists || snap.data().status !== "created") return { claimed: false, reason: "no_such_order" };
    const data = snap.data();
    const state = data.notifyState || NOTIFY_STATES.PENDING;
    if (state === NOTIFY_STATES.NOTIFIED) return { claimed: false, reason: "already_notified" };
    if (state === NOTIFY_STATES.UNKNOWN) return { claimed: false, reason: "ambiguous_needs_reconciliation" };
    if (state === NOTIFY_STATES.NOTIFYING && Number(data.notifyLeaseExpiresAt) > ts) {
      return { claimed: false, reason: "lease_held", leaseOwner: data.notifyLeaseOwner };
    }
    // PENDING, RETRYABLE, or NOTIFYING-with-an-expired-lease: claim it.
    const attempts = (data.notifyAttempts || 0) + 1;
    tx.update(linkRef, {
      notifyState: NOTIFY_STATES.NOTIFYING, notifyLeaseOwner: workerId, notifyLeaseExpiresAt: ts + leaseMs, notifyAttempts: attempts,
    });
    return {
      claimed: true, attempts, orderId: data.orderId, amount: data.amount,
      paymentSessionId: data.paymentSessionId, free: data.free || false, waId: data.waId,
    };
  });
}

/**
 * Mission 21: reports the outcome of a claimed notification attempt. Requires the CALLER to still hold the
 * lease at write time (re-checked inside the transaction, same as durableJobStore.js's completeJob/failJob) —
 * a worker whose lease was reclaimed by someone else (or simply expired) can still call this, but the write
 * is silently rejected, exactly like durableJobStore.js's stale-worker protection.
 *
 * @param {"confirmed"|"definite_failure"|"ambiguous"} outcome
 *   confirmed       -> NOTIFIED (terminal; requirement 6/7 untouched — this never touches orders/payments).
 *   definite_failure -> RETRYABLE, unless notifyAttempts has reached maxAttempts, in which case UNKNOWN (stop
 *                        auto-retrying; needs reconciliation rather than retrying forever).
 *   ambiguous        -> UNKNOWN, ALWAYS, regardless of attempts (requirement 5: a timeout that might have
 *                        delivered the message is NEVER blindly retried — only an explicit reconciliation
 *                        decision, not another automatic claim, may act on it next).
 */
async function completeFlowOrderNotification({
  db, orderLinkCollection = DEFAULT_ORDER_LINK_COLLECTION, flowToken, workerId, outcome, error,
  maxAttempts = DEFAULT_NOTIFY_MAX_ATTEMPTS, now = () => Date.now(),
}) {
  if (!["confirmed", "definite_failure", "ambiguous"].includes(outcome)) {
    throw new Error(`completeFlowOrderNotification: unknown outcome "${outcome}"`);
  }
  const linkRef = db.collection(orderLinkCollection).doc(flowToken);
  const ts = now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(linkRef);
    if (!snap.exists) return { written: false, reason: "not_found" };
    const data = snap.data();
    if (data.notifyLeaseOwner !== workerId || Number(data.notifyLeaseExpiresAt) <= ts) {
      return { written: false, reason: "lease_lost" };
    }
    let nextState;
    if (outcome === "confirmed") nextState = NOTIFY_STATES.NOTIFIED;
    else if (outcome === "ambiguous") nextState = NOTIFY_STATES.UNKNOWN;
    else nextState = (data.notifyAttempts || 0) >= maxAttempts ? NOTIFY_STATES.UNKNOWN : NOTIFY_STATES.RETRYABLE;
    tx.update(linkRef, {
      notifyState: nextState, notifyLeaseOwner: null, notifyLeaseExpiresAt: 0,
      notifyError: nextState === NOTIFY_STATES.NOTIFIED ? null : (error ? String(error) : data.notifyError || null),
    });
    return { written: true, state: nextState };
  });
}

module.exports = {
  createOrderFromFlowJob, buildPendingPrintJobDoc, claimFlowOrderNotification, completeFlowOrderNotification,
  NOTIFY_STATES, DEFAULT_NOTIFY_LEASE_MS, DEFAULT_NOTIFY_MAX_ATTEMPTS,
  FlowOrderError, OrderServiceError, DEFAULT_JOB_COLLECTION, DEFAULT_ORDER_LINK_COLLECTION, STALE_CLAIM_MS,
};
