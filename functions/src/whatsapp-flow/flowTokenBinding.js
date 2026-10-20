"use strict";
// Mission 14: the durable flow_token -> waId binding. Mission 13's metaFlowAdapter.js established that Meta's
// Flow Data Exchange request carries no sender field at all, so `resolveWaId(flowToken)` must read a binding
// the BUSINESS recorded when it sent the Flow message, never anything from the inbound payload. This file is
// that binding's only reader/writer.
//
// LIFECYCLE (explicit, because the mission requires one): a binding is created PREPARED (the outbound send
// attempt is about to happen, but Meta has not yet confirmed it), then moves to exactly one of:
//   SENT    - the WhatsApp API call confirmed delivery (outboundFlowMessage.js saw a message id back).
//   FAILED  - the send attempt errored, or returned a response that did not confirm delivery (ambiguous
//             outcomes are treated as FAILED, never as SENT, because resolveWaId must never trust a binding
//             nobody can prove was actually delivered to that recipient).
//   REVOKED - an operator/test explicitly invalidates an otherwise-live binding (e.g. a compromised token).
// Only a SENT binding, read before its expiry, is ever "valid" — see resolveFlowTokenWaId. PREPARED is
// deliberately NOT valid: until a send is confirmed, nothing has actually told this waId's device about the
// token, so treating it as resolvable would let a caller's own prepare-but-never-send race look live.
//
// EXPIRY: Meta does not publicly document a flow_token lifetime; WhatsApp's own 24-hour customer-service
// messaging window is the closest documented analogue, so DEFAULT_TTL_MS below is an ASSUMPTION pinned to
// that window, not a fact read out of Meta's Flow docs. Override `ttlMs` once a real value is confirmed.
//
// ATOMICITY: binding creation uses `db.runTransaction` + `tx.create` (ALREADY_EXISTS on a collision), the
// same primitive durableJobStore.js already uses for claim/complete/fail. This file makes NO claim of atomicity
// between the Firestore write and the WhatsApp API call that follows it in outboundFlowMessage.js — those are
// two separate systems and are never treated as a single transaction.
//
// Never logs flowToken, waId, or any binding document field.
const crypto = require("crypto");

const DEFAULT_COLLECTION = "whatsapp_flow_identity"; // same collection metaFlowAdapter.js's default resolver already reads
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // [ASSUMED] — see EXPIRY above
const VALID_STATES = new Set(["PREPARED", "SENT", "FAILED", "REVOKED"]);

/** Cryptographically random, URL-safe, 256 bits of entropy — unguessable as a Firestore doc id or wire token. */
function generateFlowToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function ref({ db, collection = DEFAULT_COLLECTION, flowToken }) {
  return db.collection(collection).doc(flowToken);
}

/**
 * Creates the binding BEFORE the outbound message is sent (requirement: bind before send). Atomic: a
 * duplicate flowToken (collision, or a caller reusing one) is rejected, never silently overwritten.
 */
async function prepareFlowTokenBinding({ db, collection = DEFAULT_COLLECTION, flowToken, waId, now = () => Date.now(), ttlMs = DEFAULT_TTL_MS }) {
  if (!db || typeof db.runTransaction !== "function") throw new Error("prepareFlowTokenBinding requires a Firestore-shaped db");
  if (!flowToken) throw new Error("prepareFlowTokenBinding requires flowToken");
  if (typeof waId !== "string" || !waId) throw new Error("prepareFlowTokenBinding requires a waId string");
  const docRef = ref({ db, collection, flowToken });
  const ts = now();
  try {
    await db.runTransaction(async (tx) => {
      tx.create(docRef, {
        waId, state: "PREPARED",
        createdAt: ts, expiresAt: ts + ttlMs,
        sentAt: null, failedAt: null, revokedAt: null,
      });
    });
    return { created: true };
  } catch (err) {
    if (err && (err.code === 6 || /ALREADY_EXISTS/.test(err.message || ""))) {
      return { created: false, reason: "duplicate" };
    }
    throw err;
  }
}

/** PREPARED -> SENT. Refuses to move a binding that is not currently PREPARED (no FAILED/REVOKED -> SENT path). */
async function markBindingSent({ db, collection = DEFAULT_COLLECTION, flowToken, now = () => Date.now() }) {
  if (!flowToken) return { updated: false, reason: "missing_token" };
  const docRef = ref({ db, collection, flowToken });
  const ts = now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists) return { updated: false, reason: "not_found" };
    const data = snap.data();
    if (data.state !== "PREPARED") return { updated: false, reason: "invalid_state", state: data.state };
    tx.update(docRef, { state: "SENT", sentAt: ts });
    return { updated: true };
  });
}

/** PREPARED -> FAILED. A binding already SENT can never be retroactively marked FAILED. */
async function markBindingFailed({ db, collection = DEFAULT_COLLECTION, flowToken, now = () => Date.now(), reason: failReason }) {
  if (!flowToken) return { updated: false, reason: "missing_token" };
  const docRef = ref({ db, collection, flowToken });
  const ts = now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists) return { updated: false, reason: "not_found" };
    const data = snap.data();
    if (data.state === "SENT") return { updated: false, reason: "already_sent" };
    if (data.state === "FAILED") return { updated: true, reason: "already_failed" }; // idempotent no-op
    tx.update(docRef, { state: "FAILED", failedAt: ts, failReason: failReason ? String(failReason).slice(0, 200) : null });
    return { updated: true };
  });
}

/** Explicit invalidation of an otherwise-live (PREPARED or SENT) binding. Never resurrects a FAILED one. */
async function revokeFlowTokenBinding({ db, collection = DEFAULT_COLLECTION, flowToken, now = () => Date.now() }) {
  if (!flowToken) return { updated: false, reason: "missing_token" };
  const docRef = ref({ db, collection, flowToken });
  const ts = now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists) return { updated: false, reason: "not_found" };
    const data = snap.data();
    if (data.state === "REVOKED") return { updated: true, reason: "already_revoked" }; // idempotent no-op
    if (data.state === "FAILED") return { updated: false, reason: "already_failed" };
    tx.update(docRef, { state: "REVOKED", revokedAt: ts });
    return { updated: true };
  });
}

/**
 * The ONLY read resolveWaId (metaFlowAdapter.js) should ever use. Returns the waId for a SENT, unexpired
 * binding — anything else (unknown token, PREPARED, FAILED, REVOKED, or expired) returns null, identically,
 * so a caller can never distinguish "never existed" from "existed but is no longer valid".
 */
async function resolveFlowTokenWaId({ db, collection = DEFAULT_COLLECTION, flowToken, now = () => Date.now() }) {
  if (!flowToken) return null;
  const snap = await ref({ db, collection, flowToken }).get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (!data || data.state !== "SENT") return null;
  if (typeof data.expiresAt === "number" && data.expiresAt <= now()) return null;
  return typeof data.waId === "string" && data.waId ? data.waId : null;
}

module.exports = {
  DEFAULT_COLLECTION, DEFAULT_TTL_MS, VALID_STATES,
  generateFlowToken, prepareFlowTokenBinding, markBindingSent, markBindingFailed,
  revokeFlowTokenBinding, resolveFlowTokenWaId,
};
