"use strict";
// Mission 12: the orchestration layer connecting the already-built, previously-isolated pieces
// (sessionStore.js, durableJobStore.js, worker.js, productionDeps.js, createOrderOperation.js) to the SAME
// screen contract flowHandler.js already uses — WITHOUT creating a public endpoint, a trigger, or redesigning
// any screen. It is the durable-store-backed counterpart to flowHandler.js's in-memory `submitOptions` /
// `checkStatus` / REVIEW-finish logic: same screens, same `flowContract.js` constants, same response shapes,
// different (durable, Storage-persisting, order-creating) backing.
//
// This file is NOT wired into flowHandler.js and flowHandler.js is NOT changed beyond two additive exports
// (`reviewData`, `fingerprintOf`) it already computed internally — the in-memory path flowHandler.js serves
// by default is untouched. A future real endpoint would call the functions below directly, the same way
// these integration tests do.
//
// TRUST BOUNDARY, restated because it is the point of this file: `waId` must be the sender id from an
// ALREADY VERIFIED Meta request (same contract as whatsappIdentity.service.js / createOrderOperation.js).
// Nothing here accepts a `waId` or `userId` from the Flow `data` payload itself — every function below takes
// it as a separate, caller-supplied argument representing verified request context, never something parsed
// out of the encrypted body's own fields.
// Mission 23: moved here from prototypes/whatsapp-flow-endpoint/src/ (that location now re-exports this
// file) so this module ships inside the deployed Cloud Functions package — see this file's own
// defaultNotifyFlowOrder below for the one require this enables simplifying (functions/src/services/* is
// now a plain relative require, not a cross-package createRequire indirection).
const { SCREENS, COLOR_MODES, MAX_COPIES } = require("./flowContract");
const { reviewData, fingerprintOf } = require("./flowHandler");
const { submitJob, getJob, DEFAULT_LEASE_MS } = require("./durableJobStore");
const { runWorkerOnce, createDocumentProcessingTask } = require("./worker");
const { pricingContext } = require("./pricingAdapter");
const {
  createOrderFromFlowJob, claimFlowOrderNotification, completeFlowOrderNotification, FlowOrderError, OrderServiceError,
} = require("./createOrderOperation");

// Mission 19: the SAME base URL whatsapp.service.js (notify_url/return_url) and whatsapp.controller.js
// (returnUrl) already hardcode for this deployed API — reused here, not invented, so the payment-link page
// this points at is the EXISTING /wa-pay/:orderId route (whatsapp.controller.js's getWaPay), which already
// builds a Cashfree Orders-API checkout page for exactly the kind of order createOrderForUser creates.
const API_BASE_URL = "https://api-upqxuj7evq-uc.a.run.app";

/**
 * Mission 21 (was Mission 19's defaultNotifyFlowOrder, now returns/throws a classified outcome instead of a
 * bare resolve/reject): reuses the EXISTING, already-production messaging functions (whatsapp.service.js)
 * exactly as the chatbot's own _finalizePayment does for the same purpose — no new Cashfree call, no new
 * WhatsApp message type, no new template. A free order was already notified with its print code by
 * createOrderForUser itself (order.service.js's own "Send WhatsApp Notification for free orders" step) — this
 * never double-sends; it reports "confirmed" immediately so the state machine still resolves to NOTIFIED.
 * @returns {Promise<{classification:"confirmed", messageId:string|null}>}
 * @throws {Error} with `.classification` of "definite_failure" or "ambiguous" (see whatsapp.service.js:sendWhatsAppCTAButtonTracked)
 */
async function defaultNotifyFlowOrder({ waId, orderId, free }) {
  if (free) return { classification: "confirmed", messageId: null };
  const { sendWhatsAppCTAButtonTracked } = require("../services/whatsapp.service.js");
  const paymentLink = `${API_BASE_URL}/wa-pay/${orderId}`;
  return sendWhatsAppCTAButtonTracked(
    waId,
    `🧾 Your MIMO print order is ready for payment.\n\nTap below to pay securely — your print code will be sent here once payment is confirmed.`,
    "Pay Now",
    paymentLink
  );
}

const DEFAULT_JOB_COLLECTION = "whatsapp_flow_jobs";
const DEFAULT_ORDER_LINK_COLLECTION = "whatsapp_flow_orders";

const uploadError = (error_message) => ({ screen: SCREENS.UPLOAD, data: { error_message } });
const processing = (status_text) => ({ screen: SCREENS.PROCESSING, data: { status_text } });
// Mission 27: REVIEW's own error response — a "refresh" of the CURRENT screen (Meta's routing_model rule 1:
// a screen can be refreshed via data_exchange without a declared self-edge), never a backward navigation to
// UPLOAD. Mirrors CONFIGURE's own pre-existing error pattern (`{screen: SCREENS.CONFIGURE, data:
// {error_message}}`), which Meta's real validator already accepts without complaint.
const reviewError = (error_message) => ({ screen: SCREENS.REVIEW, data: { error_message } });

// Safe, non-leaky messages for a user-facing screen. Internal codes (logged/returned separately for tests
// and operators) are never shown to the end user.
const SAFE_MESSAGE_BY_CODE = {
  BAD_SESSION: "Your session has expired. Please start again.",
  BAD_SENDER: "We couldn't verify your WhatsApp account. Please try again.",
  IDENTITY_INVALID: "We couldn't verify your WhatsApp account. Please try again.",
  IDENTITY_UNRESOLVED: "We couldn't find a MIMO account for this WhatsApp number. Please link your account on the website first.",
  JOB_NOT_FOUND: "Your session has expired. Please upload your files again.",
  SESSION_JOB_MISMATCH: "This session is no longer valid. Please start again.",
  JOB_NOT_READY: "Your files are still being checked. Please wait and try again.",
  ORDER_CREATION_IN_PROGRESS: "Your order is already being created. Please wait a moment.",
  FILE_COUNT_MISMATCH: "Something went wrong while checking your files. Please upload them again.",
  FILE_STORAGE_NOT_IMPLEMENTED: "We couldn't save your files. Please try again shortly.",
  MISSING_STORAGE_OBJECT: "One of your files is no longer available. Please upload it again.",
};
const DEFAULT_SAFE_MESSAGE = "We couldn't complete your order. Please try again.";

function safeMessageFor(err) {
  if (err instanceof OrderServiceError) return "Color printing is temporarily unavailable. Please try again shortly.";
  if (err instanceof FlowOrderError) return SAFE_MESSAGE_BY_CODE[err.code] || DEFAULT_SAFE_MESSAGE;
  return DEFAULT_SAFE_MESSAGE;
}

// Matches flow/mimo-print.flow.json's DocumentPicker `max-uploaded-documents` (client-side limit); re-checked
// here because a client-declared UI limit is never authoritative on its own.
const MAX_UPLOAD_DOCUMENTS = 10;
const REQUIRED_DOCUMENT_FIELDS = ["media_id", "cdn_url", "file_name", "encryption_metadata"];

/**
 * UPLOAD -> CONFIGURE. Mission 27: added because Meta's real Flow-JSON validator rejects forwarding a
 * DocumentPicker's value through a client-side `navigate` action's payload ("The value of DocumentPicker
 * component is not allowed in the payload of navigate action") — the DocumentPicker's result must instead be
 * forwarded through `data_exchange`, which is why this dispatch branch exists at all.
 *
 * This is a STATELESS pass-through: no durable job is written, no Storage access, no order, nothing that
 * could leave a duplicate side effect on a retry — the ONLY job-creating call remains submitConfigure below,
 * unchanged. Only the SHAPE of the submitted documents is checked (presence of the fields Meta's own
 * DocumentPicker response actually carries — [DOC CONFIRMED] media_id/cdn_url/file_name/encryption_metadata;
 * no `mime_type` or size field exists in Meta's real payload, so neither is checked here: validating a field
 * that was never sent would be a fabricated check, not a real one. Authoritative file-type/size validation
 * happens exactly where it already did — pipeline.js, after the real bytes are downloaded, triggered later
 * by submitConfigure/the worker — this function does not duplicate or pre-empt that.
 */
function submitUpload({ data }) {
  const { documents } = data || {};
  if (!Array.isArray(documents) || documents.length === 0) return uploadError("Please choose at least one file.");
  if (documents.length > MAX_UPLOAD_DOCUMENTS) return uploadError(`Please choose at most ${MAX_UPLOAD_DOCUMENTS} files.`);
  const malformed = documents.some((d) => !d || typeof d !== "object" || REQUIRED_DOCUMENT_FIELDS.some((f) => !(f in d)));
  if (malformed) return uploadError("One or more files could not be read. Please try choosing them again.");
  return { screen: SCREENS.CONFIGURE, data: { documents } };
}

/**
 * CONFIGURE -> PROCESSING. Durable-store-backed equivalent of flowHandler.js's `submitOptions`. Validates
 * the form exactly the same way, then persists the submission (idempotent per (flowToken, fingerprint) —
 * see durableJobStore.js) INSTEAD OF starting in-process work. Nothing is processed here; a separate,
 * explicit worker tick (`runOrchestratedWorkerTick` below) does that.
 */
async function submitConfigure({ db, jobCollection = DEFAULT_JOB_COLLECTION, flowToken, waId, data }) {
  // Mission 27: these all self-refresh CONFIGURE instead of jumping back to UPLOAD (routing_model no longer
  // permits declaring that back-edge). `!waId` is already caught earlier by metaFlowAdapter.js's dispatch
  // for the real request path; this check stays as a defensive guard for direct/test callers.
  const configureError = (error_message) => ({ screen: SCREENS.CONFIGURE, data: { error_message } });
  if (!flowToken) return configureError("Session missing. Please close this and start a new print request.");
  if (!waId || typeof waId !== "string") return configureError("We couldn't verify your WhatsApp account. Please close this and start a new print request.");
  const { documents, color, copies: rawCopies } = data || {};
  if (!Array.isArray(documents) || documents.length === 0) return configureError("No files were received. Please close this and start a new print request.");
  if (!COLOR_MODES.includes(color)) return { screen: SCREENS.CONFIGURE, data: { error_message: "Please choose B&W or Color." } };
  const copies = Number(rawCopies);
  if (!Number.isInteger(copies) || copies < 1 || copies > MAX_COPIES) {
    return { screen: SCREENS.CONFIGURE, data: { error_message: `Copies must be between 1 and ${MAX_COPIES}.` } };
  }

  // `waId` is recorded as part of the job's OWN durable payload — this is what later lets CREATE_ORDER (and
  // the status poll below) verify "this session belongs to this sender" without trusting anything the next
  // request claims about itself.
  const fingerprint = fingerprintOf({ documents, color, copies });
  await submitJob({ db, collection: jobCollection, jobId: flowToken, fingerprint, payload: { waId, color, copies, documents } });
  return processing(`Checking ${documents.length} file(s). Nothing refreshes automatically: tap "Check status" to see progress.`);
}

/**
 * PROCESSING -> PROCESSING | REVIEW. Durable-store-backed equivalent of `checkStatus`. Read-only. Also
 * enforces sender ownership on the read itself — a different (even if otherwise valid) sender polling
 * someone else's flow_token gets the same "session expired" answer a truly unknown token would, never a
 * peek at someone else's file list.
 *
 * Mission 27: every failure branch now stays on PROCESSING (a "refresh" of the current screen, reusing the
 * existing `status_text` field — no new Flow JSON field needed) instead of routing back to UPLOAD, which
 * Meta's routing_model no longer permits declaring (back-edges are rejected; see the Mission 26 report). An
 * unrecoverable error here is a genuine dead end for THIS Flow session by design, not a bug: the user closes
 * the Flow and the business sends a fresh one (a new flow_token), which starts over at the real entry screen.
 */
async function pollProcessing({ db, jobCollection = DEFAULT_JOB_COLLECTION, flowToken, waId }) {
  const job = flowToken && (await getJob({ db, collection: jobCollection, jobId: flowToken }));
  if (!job || !job.payload || job.payload.waId !== waId) return processing("Session expired. Please close this and start a new print request.");
  if (job.state === "PENDING" || job.state === "PROCESSING") {
    return processing('Still checking your files. Tap "Check status" again in a few seconds.');
  }
  if (job.state === "FAILED") return processing("Something went wrong while checking your files. Please close this and start a new print request.");
  // COMPLETED
  const pricing = { rates: job.result.rates, status: job.result.pricingStatus };
  return { screen: SCREENS.REVIEW, data: reviewData({ files: job.result.files, totalPages: job.result.totalPages }, job.payload.color, job.payload.copies, pricing) };
}

/**
 * REVIEW -> SUCCESS | UPLOAD. The ONLY place this orchestrator creates an order. Delegates entirely to
 * createOrderFromFlowJob (Mission 08-09's idempotent claim + identity + ownership + completed-job + SV-002
 * guard + createOrderForUser chain) — nothing here duplicates any of that logic. On success, returns the
 * EXACT same Flow response shape flowHandler.js's REVIEW handler already returns (no order fields leaked
 * into the Flow response `data` — a real order id is never shown on the Flow's own SUCCESS screen, matching
 * the accepted Flow JSON, which declares no such field for SUCCESS). This never marks anything paid and
 * never issues a print code — createOrderFromFlowJob's own contract (Mission 08 Part D) guarantees that.
 *
 * Mission 21: after a (possibly idempotent-replayed) order exists, ONE attempt is made to hand the user the
 * next step, through the durable notification state machine (createOrderOperation.js's
 * claimFlowOrderNotification / completeFlowOrderNotification — PENDING/RETRYABLE -> NOTIFYING -> NOTIFIED,
 * RETRYABLE, or UNKNOWN):
 *   1. Claim the lease. If refused (already NOTIFIED, UNKNOWN pending reconciliation, or someone else's live
 *      lease), do nothing — this call never sends a second message for the same order.
 *   2. Attempt the send. Its outcome is CLASSIFIED (confirmed / definite_failure / ambiguous — see
 *      defaultNotifyFlowOrder / sendWhatsAppCTAButtonTracked), never assumed.
 *   3. Record that exact outcome, while still holding the lease. A definite failure becomes RETRYABLE (a
 *      later finishReview call, e.g. a genuine Meta retry, may claim and try again, up to the attempt bound).
 *      An AMBIGUOUS outcome (e.g. a timeout with no response) becomes UNKNOWN and is NEVER auto-retried —
 *      only an explicit reconciliation action may act on it next (requirement 5).
 * A notification failure of ANY kind is logged and never turns an already-created order into an error
 * response to the user — the order is real and already recorded either way; only the notification step can
 * fail here. If the recording write itself fails after a successful send (the one case this cannot fully
 * close — see the Mission 21 report's "remaining limitations"), that is logged distinctly so it is visible
 * rather than silently indistinguishable from an ordinary definite failure.
 */
async function finishReview({
  db, bucket, jobCollection = DEFAULT_JOB_COLLECTION, orderLinkCollection = DEFAULT_ORDER_LINK_COLLECTION,
  flowToken, waId, workerId = `finishReview-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  notifyOrder = defaultNotifyFlowOrder,
}) {
  try {
    const order = await createOrderFromFlowJob({ db, bucket, jobCollection, orderLinkCollection, flowToken, waId });
    try {
      const claim = await claimFlowOrderNotification({ db, orderLinkCollection, flowToken, workerId });
      if (claim.claimed) {
        let outcome = "ambiguous"; // the conservative default if notifyOrder throws something unclassified
        let errMessage;
        try {
          await notifyOrder({ waId: claim.waId || waId, orderId: claim.orderId, amount: claim.amount, free: claim.free });
          outcome = "confirmed";
        } catch (sendErr) {
          outcome = sendErr && sendErr.classification === "definite_failure" ? "definite_failure" : "ambiguous";
          errMessage = sendErr && sendErr.message;
        }
        try {
          await completeFlowOrderNotification({ db, orderLinkCollection, flowToken, workerId, outcome, error: errMessage });
        } catch (recordErr) {
          console.error(
            `[FLOW ORCHESTRATOR] order ${order.orderId}: notification outcome "${outcome}" could not be recorded (${recordErr.message}) — ` +
            `a future claim may re-attempt once this lease expires, which is only safe because the outcome itself was never assumed to be "confirmed" here.`
          );
        }
      }
    } catch (notifyErr) {
      console.error(`[FLOW ORCHESTRATOR] order ${order.orderId} notification step failed:`, notifyErr.message);
    }
    return { response: { screen: SCREENS.SUCCESS, data: { extension_message_response: { params: { flow_token: flowToken } } } }, order };
  } catch (err) {
    // Mission 27: stays on REVIEW (a "refresh") instead of routing back to UPLOAD — same reasoning as
    // pollProcessing's error branches above. REVIEW's Flow JSON gained an `error_message` field for this.
    return { response: reviewError(safeMessageFor(err)), error: err };
  }
}

/**
 * Explicit, manual/test worker-tick entry point (requirement: "invoke the worker through an explicit
 * test/manual entry point", NOT a trigger or schedule — see durableJobStore.js/worker.js's own docs for why
 * no trigger is registered). Thin wrapper so a test (or, later, a human-run script / an actual trigger body)
 * has one obvious function to call.
 */
async function runOrchestratedWorkerTick({ db, bucket, jobCollection = DEFAULT_JOB_COLLECTION, flowToken, workerId, deps, pricing: pricingFn = pricingContext, concurrency = 1, limits, leaseMs = DEFAULT_LEASE_MS, maxAttempts }) {
  const process = createDocumentProcessingTask({ deps, db, bucket, pricing: pricingFn, concurrency, limits });
  return runWorkerOnce({ db, collection: jobCollection, jobId: flowToken, workerId, process, leaseMs, maxAttempts });
}

/** Read-only status retrieval outside the Flow screen flow (e.g. for an operator/test to inspect a session). */
async function getSessionStatus({ db, jobCollection = DEFAULT_JOB_COLLECTION, flowToken, waId }) {
  const job = await getJob({ db, collection: jobCollection, jobId: flowToken });
  if (!job) return { found: false };
  if (!job.payload || job.payload.waId !== waId) return { found: false }; // ownership-scoped, same as pollProcessing
  return { found: true, state: job.state, attempts: job.attempts, hasResult: !!job.result };
}

module.exports = {
  submitUpload, submitConfigure, pollProcessing, finishReview, runOrchestratedWorkerTick, getSessionStatus,
  DEFAULT_JOB_COLLECTION, DEFAULT_ORDER_LINK_COLLECTION, safeMessageFor, defaultNotifyFlowOrder,
  MAX_UPLOAD_DOCUMENTS, REQUIRED_DOCUMENT_FIELDS,
};
