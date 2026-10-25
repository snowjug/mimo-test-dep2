/**
 * MIMO Edge Guardian — Phase 2B/2D/2F transactional authorization + replay/acceptance logic.
 *
 * Storage is isolated to two collections, neither read nor written by any other part of this
 * codebase:
 *   - guardian_health_latest   one document per kiosk: the latest accepted snapshot + replay state.
 *   - guardian_kiosks          (Phase 2F) provisioning/authorization record — see guardian/registry.js.
 * This module never touches system_status, kiosk_commands or print_jobs (see CLAUDE.md, and
 * tests/guardianIngest.test.js's explicit regression check for this).
 *
 * Implements the decision table in docs/architecture/MIMO_EDGE_GUARDIAN_PHASE_2A_CONTRACT.md §5,
 * with deliberate, documented departures from that document:
 *  1. (Phase 2B) Within the SAME stream, any seq strictly greater than the last accepted seq is
 *     accepted, not only seq == lastAcceptedSeq + 1 (contract §10's Pi-side backoff means a cycle's
 *     publish attempt can legitimately be skipped). A *duplicate* or *lower* seq is still
 *     rejected/deduplicated exactly as specified.
 *  2. (Phase 2D) `bootId` is the Pi's kernel boot UUID (lowercase hex), not an incrementing
 *     integer. A UUID carries no ordering information, so a new stream is accepted only if its
 *     signed `timestamp` is strictly after the kiosk's `lastAcceptedTimestamp` — `bootId` is never
 *     compared numerically or lexicographically.
 *  3. (Phase 2F) "Is this kiosk allowed to ingest at all" is no longer a plain pre-check read
 *     outside the transaction (that was Phase 2B/2E's `isRevoked`, now removed). The caller
 *     (guardian/routes/guardianHealth.routes.js) still does one plain, non-transactional registry
 *     read first — but only to decide which key version to even attempt signature verification
 *     with; that read being stale is harmless, because this transaction RE-READS the registry
 *     record with `tx.get()` and re-validates status + key version before committing anything.
 *     Firestore's optimistic-concurrency guarantee on `tx.get()` means that if a revoke/rotate
 *     lands concurrently, this transaction either observes it directly or is forced to retry with
 *     a fresh read — a stale authorization read can never slip an acceptance past a revocation
 *     that is concurrently committing (requirement 7). Revoking or disabling a kiosk only ever
 *     writes to `guardian_kiosks`; a kiosk's already-accepted telemetry in
 *     `guardian_health_latest` is never touched by revocation (requirement 8).
 *
 * One naming deviation from the Phase 2A document (unchanged since Phase 2B): the Phase 2B
 * implementation task specified the collection name `guardian_health_latest`; the Phase 2A document
 * had proposed `guardian_kiosk_health`. The Phase 2B name is the one actually implemented here.
 */

const { KIOSK_REGISTRY_COLLECTION, STATUS, isKeyVersionPermitted } = require("./registry");

const STATE_COLLECTION = "guardian_health_latest";

/**
 * Accept/duplicate/conflict/unauthorized, applied in ONE transaction that reads both the kiosk's
 * authorization record and its replay state, and only ever writes the latter.
 *
 * @param db     Firestore instance (real or fakeFirestore)
 * @param admin  firebase-admin (real or fakeFirestore's stand-in) — used only for FieldValue.serverTimestamp()
 * @param input  { kioskId, streamId, bootId, seq, timestamp, keyVersion, bodySha256Hex, snapshot }
 *               `timestamp` and `keyVersion` are already signature-verified before this is called.
 * @returns { outcome: "accepted" | "duplicate" | "conflict" | "unauthorized", reason?: string }
 */
async function runReplayTransaction(db, admin, { kioskId, streamId, bootId, seq, timestamp, keyVersion, bodySha256Hex, snapshot }) {
  const stateRef = db.collection(STATE_COLLECTION).doc(kioskId);
  const registryRef = db.collection(KIOSK_REGISTRY_COLLECTION).doc(kioskId);

  return db.runTransaction(async (tx) => {
    // Authoritative, transactionally-fresh re-check (see module docstring, departure 3). A plain
    // pre-check happened before this transaction started (to pick a key version to verify the
    // signature with) — this is the one that actually gates the write.
    const registrySnap = await tx.get(registryRef);
    const record = registrySnap.exists ? registrySnap.data() : null;
    if (!record || record.status !== STATUS.ACTIVE) {
      return { outcome: "unauthorized", reason: record ? `kiosk_${record.status.toLowerCase()}` : "kiosk_not_provisioned" };
    }
    if (!isKeyVersionPermitted(record, keyVersion, Date.now())) {
      return { outcome: "unauthorized", reason: "unsupported_key_version" };
    }

    const docSnap = await tx.get(stateRef);
    const newDoc = {
      snapshot,
      streamId,
      bootId,
      lastAcceptedSeq: seq,
      lastAcceptedTimestamp: timestamp,
      bodySha256OfLastAccepted: bodySha256Hex,
      serverReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
      schemaVersion: 1,
    };

    if (!docSnap.exists) {
      tx.set(stateRef, newDoc);
      return { outcome: "accepted" };
    }

    const current = docSnap.data();

    if (current.streamId === streamId) {
      if (seq === current.lastAcceptedSeq) {
        if (bodySha256Hex === current.bodySha256OfLastAccepted) {
          return { outcome: "duplicate" };
        }
        return { outcome: "conflict", reason: "same_seq_different_body" };
      }
      if (seq < current.lastAcceptedSeq) {
        return { outcome: "conflict", reason: "stale_seq" };
      }
      tx.set(stateRef, newDoc);
      return { outcome: "accepted" };
    }

    // A different stream (a new bootId/process lifetime) is only legitimate if it is causally
    // AFTER the last request we accepted for this kiosk, in any stream: its signed timestamp must
    // be strictly greater than lastAcceptedTimestamp. bootId is NOT compared here (see module
    // docstring) -- it carries no ordering information once it is a random kernel boot UUID.
    if (timestamp > current.lastAcceptedTimestamp) {
      tx.set(stateRef, newDoc);
      return { outcome: "accepted" };
    }
    return { outcome: "conflict", reason: "stale_or_replayed_stream" };
  });
}

module.exports = { runReplayTransaction, STATE_COLLECTION };
