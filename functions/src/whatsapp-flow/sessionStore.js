"use strict";
// Mission 04 Part B: a session-store ABSTRACTION that separates flowHandler.js from how CONFIGURE/PROCESSING
// job state is persisted. flowHandler.js only ever calls the three async methods below; it does not know or
// care whether the backing is the in-memory Map (isolated tests, exactly like the old testState.js) or
// Firestore (durable across a process restart, atomic across concurrent instances).
//
// TEST-WORKFLOW SCOPE ONLY. Nothing in this file creates an order, takes a payment, prints anything, or trusts
// a client-provided price/page-count/payment-status/order-id/print-code — a session entry's `result` is
// whatever the Flow handler's own `run` callback computed (page counts from pipeline.js, rates from
// pricingAdapter.js); this store never interprets or re-validates that payload, it only stores and returns it.
//
// ───────────────────────────────── Contract ─────────────────────────────────
// A session store is any object exposing:
//   async start(token, fingerprint, run) -> Promise<void>
//     Idempotent: if a live (unexpired) entry already exists for `token` with the SAME fingerprint, `run` is
//     NOT invoked again — the in-flight/previous outcome is left alone. Otherwise a fresh PROCESSING entry is
//     recorded (replacing any stale one) and `run` is invoked once, in the background: `start` resolves as soon
//     as the entry is durably recorded, it does NOT wait for `run` to finish. `run`'s outcome (resolve -> DONE
//     with `result`, reject -> FAILED with `error`) is written back when it completes; a failure is never
//     written as a success.
//   async get(token) -> Promise<{fingerprint, state:"PROCESSING"|"DONE"|"FAILED", result, error}|undefined>
//     `undefined` for a token that was never started OR whose entry has expired (both are treated as "unknown"
//     to the FLOW — flowHandler's "Session expired" message already covers both cases on purpose: telling a
//     user which one it was would leak whether a given token ever existed). Use `peek` (below) when a caller
//     genuinely needs to tell them apart.
//   async delete(token) -> Promise<void>
//
// Diagnostic-only, not used by flowHandler.js (tests use it to prove expiry is handled on purpose, not as a
// side effect of something else being broken):
//   async peek(token) -> Promise<"missing"|"expired"|"active">
//
// Every method is async so a durable backend is a drop-in replacement for the in-memory one; the in-memory
// implementation's methods simply resolve synchronously-computed results.

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes — same session-lifetime decision recorded for the chatbot
                                        // session in docs/engineering/MIMO_WHATSAPP_MASTER_BLUEPRINT.md (OD-5).
const DEFAULT_MAX_ENTRIES = 1000;

const errorMessage = (err) => (err && err.message) || String(err);

/**
 * In-memory session store: one process, lost on restart — the correct choice for isolated unit tests and for
 * the existing test-only httpAdapter.js. Functionally equivalent to the original testState.js `createJobStore`
 * (same start/get/delete semantics, same de-duplication-by-fingerprint rule), with two additions required by
 * this mission: explicit TTL/expiry, and an async-first interface so callers do not need to know which
 * implementation they were given.
 */
function createInMemorySessionStore({ ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES, now = () => Date.now() } = {}) {
  const sessions = new Map(); // token -> { fingerprint, state, result, error, expiresAt }

  function isLive(entry) {
    return entry && entry.expiresAt > now();
  }

  async function start(token, fingerprint, run) {
    const current = sessions.get(token);
    if (isLive(current) && current.fingerprint === fingerprint) return; // duplicate submit: never run twice
    const entry = { fingerprint, state: "PROCESSING", result: null, error: null, expiresAt: now() + ttlMs };
    sessions.delete(token); // re-insert so Map iteration order tracks recency, mirrors the original store
    sessions.set(token, entry);
    while (sessions.size > maxEntries) sessions.delete(sessions.keys().next().value);
    // Fire-and-forget: `start` itself resolves immediately; this is what lets the CONFIGURE handler answer
    // with the PROCESSING screen right away while the real work (file download/decrypt/page-count) continues.
    Promise.resolve().then(run).then(
      (result) => { if (sessions.get(token) === entry) { entry.state = "DONE"; entry.result = result; } },
      (error) => { if (sessions.get(token) === entry) { entry.state = "FAILED"; entry.error = errorMessage(error); } }
    );
  }

  async function get(token) {
    const entry = sessions.get(token);
    if (!entry) return undefined;
    if (!isLive(entry)) { sessions.delete(token); return undefined; }
    return { fingerprint: entry.fingerprint, state: entry.state, result: entry.result, error: entry.error };
  }

  async function del(token) {
    sessions.delete(token);
  }

  async function peek(token) {
    const entry = sessions.get(token);
    if (!entry) return "missing";
    if (!isLive(entry)) return "expired";
    return "active";
  }

  return { start, get, delete: del, peek, size: () => sessions.size };
}

/**
 * Firestore-backed session store: durable across a process restart, atomic across concurrent instances via a
 * transaction. Requires a Firestore-shaped `db` (`.collection(name).doc(id)` with get/set/update, plus
 * `.runTransaction`) — in tests this MUST be the repository's existing in-memory Firestore fake
 * (functions/__tests__/helpers/fakeFirestore.js), never a real Firebase Admin SDK instance. This module never
 * imports firebase-admin and never reads production credentials; the caller decides what `db` is.
 *
 * NOT wired into the Flow endpoint by this mission (no public endpoint exists yet) and not the default backend
 * for flowHandler.js (the in-memory store remains the default, per requirement 1). This exists so a future
 * mission can inject it once a real, non-production Firestore project/collection is agreed.
 */
function createFirestoreSessionStore({ db, collection = "whatsapp_flow_sessions", ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
  if (!db || typeof db.runTransaction !== "function") {
    throw new Error("createFirestoreSessionStore requires a Firestore-shaped `db` with runTransaction()");
  }
  const ref = (token) => db.collection(collection).doc(token);
  const isLive = (data) => data && data.expiresAt > now();

  // A real Firestore transaction serialises concurrent writers to the SAME document via optimistic
  // concurrency control with automatic retry — a racing transaction whose read was invalidated by another
  // transaction's commit is retried until it sees a consistent view. The repository's in-memory Firestore
  // fake (functions/__tests__/helpers/fakeFirestore.js) does not implement that retry machinery — its
  // `runTransaction` just runs the callback once with no isolation — so two `start()` calls racing on the
  // same token could both read "no live session" before either writes. A per-token async lock restores the
  // same observable guarantee the real service provides (operations on one document are never interleaved)
  // without needing the fake to grow retry logic it was never meant to have.
  const locks = new Map();
  function serialisedPerToken(token, fn) {
    const prior = (locks.get(token) || Promise.resolve()).catch(() => {});
    const next = prior.then(fn);
    locks.set(token, next);
    return next;
  }

  let versionCounter = 0;

  async function start(token, fingerprint, run) {
    const docRef = ref(token);
    const expiresAt = now() + ttlMs;
    // Unique per call, NOT derived from the clock: two calls to start() in the same millisecond (easily
    // possible under `now()` overridden to a fixed test clock, or just fast real execution) would otherwise
    // compute the same `expiresAt` and make the completion-write guard below unable to tell "my own write"
    // from "a different racer's write that happens to expire at the same instant." A monotonically
    // increasing counter has no such collision.
    const version = `${token}:${++versionCounter}:${Math.random().toString(36).slice(2)}`;
    // Atomic across concurrent instances: read-then-write happens inside one transaction (serialised per
    // token — see `serialisedPerToken` above), so two Flow requests racing on the same flow_token with the
    // same fingerprint can only ever see ONE of them win the write; the loser's `run` is never invoked. This
    // is the "durable, transactional, atomic" de-duplication the mission asks for, in place of the in-memory
    // store's single-process Map check.
    const shouldRun = await serialisedPerToken(token, () => db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      const data = snap.exists ? snap.data() : null;
      if (isLive(data) && data.fingerprint === fingerprint) return false; // duplicate submit: never run twice
      tx.set(docRef, { fingerprint, state: "PROCESSING", result: null, error: null, expiresAt, version });
      return true;
    }));
    if (!shouldRun) return;
    Promise.resolve().then(run).then(
      async (result) => {
        try {
          // Only overwrite if nobody replaced this session with a NEWER submission while `run` was in
          // flight: `version` is unique per start() call, so this can never match a different racer's write.
          await serialisedPerToken(token, () => db.runTransaction(async (tx) => {
            const snap = await tx.get(docRef);
            if (snap.exists && snap.data().version === version) {
              tx.set(docRef, { fingerprint, state: "DONE", result, error: null, expiresAt, version });
            }
          }));
        } catch (e) { console.error("[sessionStore] failed to record DONE state:", e.message); }
      },
      async (error) => {
        try {
          await serialisedPerToken(token, () => db.runTransaction(async (tx) => {
            const snap = await tx.get(docRef);
            if (snap.exists && snap.data().version === version) {
              tx.set(docRef, { fingerprint, state: "FAILED", result: null, error: errorMessage(error), expiresAt, version });
            }
          }));
        } catch (e) { console.error("[sessionStore] failed to record FAILED state:", e.message); }
      }
    );
  }

  async function get(token) {
    const snap = await ref(token).get();
    if (!snap.exists) return undefined;
    const data = snap.data();
    if (!isLive(data)) { await ref(token).delete().catch(() => {}); return undefined; }
    return { fingerprint: data.fingerprint, state: data.state, result: data.result, error: data.error };
  }

  async function del(token) {
    await ref(token).delete();
  }

  async function peek(token) {
    const snap = await ref(token).get();
    if (!snap.exists) return "missing";
    return isLive(snap.data()) ? "active" : "expired";
  }

  return { start, get, delete: del, peek };
}

module.exports = { createInMemorySessionStore, createFirestoreSessionStore, DEFAULT_TTL_MS };
