/**
 * MIMO Edge Guardian — Phase 2F kiosk provisioning/authorization registry.
 *
 * Collection: `guardian_kiosks` (new, dedicated to Guardian — never repurposes system_status,
 * kiosk_commands, print_jobs, or the generic `machines`/`machineRegistry.service.js` registry).
 * One document per kiosk, id = kioskId:
 *
 * {
 *   status: "ACTIVE" | "DISABLED" | "REVOKED",
 *   activeKeyVersion: number,                   // >= 1
 *   previousKeyVersion: number | null,          // only valid until previousKeyVersionExpiresAt
 *   previousKeyVersionExpiresAt: Timestamp | null,
 *   provisionedAt: Timestamp,                   // set once, preserved across rotations/status changes
 *   updatedAt: Timestamp,
 * }
 *
 * No secret material is ever stored here. The derived signing key is never persisted anywhere
 * (guardian/crypto.js re-derives it from the master secret + kioskId + version on every request);
 * this record only says which version number(s) are currently permitted for a kiosk.
 *
 * Every mutation (provision / rotate / set status) runs inside its own `db.runTransaction`, so two
 * concurrent provisioning operations on the same kiosk cannot interleave into a corrupt record —
 * each transaction reads the current document fresh and writes a complete replacement, and
 * Firestore's optimistic-concurrency retry handles the race.
 *
 * Kiosk history isolation: revoking or disabling a kiosk only ever touches this collection. It
 * never writes to, reads from, or deletes anything in guardian_health_latest — a revoked kiosk's
 * previously accepted telemetry history is preserved exactly as it was (requirement 8).
 */

const KIOSK_REGISTRY_COLLECTION = "guardian_kiosks";

const STATUS = Object.freeze({ ACTIVE: "ACTIVE", DISABLED: "DISABLED", REVOKED: "REVOKED" });
const STATUSES = new Set(Object.values(STATUS));

// Default grace window during which a just-rotated-out key version is still accepted, so a kiosk
// mid-way through picking up its new derived key does not suddenly fail to authenticate.
const DEFAULT_ROTATION_GRACE_S = 24 * 60 * 60;

function toMillis(value) {
  if (value == null) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return null;
}

/** True if `presentedVersion` may currently be used to authenticate for this kiosk. A `record` of
 * `null` (unprovisioned) is never permitted. The previous version is honoured only strictly before
 * its expiry -- at or after expiry it is treated exactly like any other unrecognised version. */
function isKeyVersionPermitted(record, presentedVersion, nowMs) {
  if (!record) return false;
  if (presentedVersion === record.activeKeyVersion) return true;
  if (record.previousKeyVersion != null && presentedVersion === record.previousKeyVersion) {
    const expiresAtMs = toMillis(record.previousKeyVersionExpiresAt);
    return expiresAtMs == null || nowMs < expiresAtMs;
  }
  return false;
}

/** Creates a brand-new kiosk record, or fully re-provisions an existing one back to ACTIVE with a
 * fresh key version (e.g. re-commissioning a previously revoked kiosk) while preserving its
 * original `provisionedAt`. Transactional. */
async function provisionKiosk(db, admin, { kioskId, activeKeyVersion = 1 }) {
  if (!Number.isInteger(activeKeyVersion) || activeKeyVersion < 1) {
    throw new RangeError(`activeKeyVersion must be a positive integer, got ${activeKeyVersion}`);
  }
  const ref = db.collection(KIOSK_REGISTRY_COLLECTION).doc(kioskId);
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const doc = {
      status: STATUS.ACTIVE,
      activeKeyVersion,
      previousKeyVersion: null,
      previousKeyVersionExpiresAt: null,
      provisionedAt: existing.exists ? existing.data().provisionedAt : now,
      updatedAt: now,
    };
    tx.set(ref, doc);
    return doc;
  });
}

/**
 * Rotates a provisioned kiosk's active key version. The outgoing version remains valid for
 * `graceSeconds` (default 24h) — both the old and new versions authenticate during that window,
 * exactly the "overlapping key versions" the contract's rotation policy calls for.
 */
async function rotateKioskKey(db, admin, { kioskId, newVersion, graceSeconds = DEFAULT_ROTATION_GRACE_S, now = Date.now }) {
  if (!Number.isInteger(newVersion) || newVersion < 1) {
    throw new RangeError(`newVersion must be a positive integer, got ${newVersion}`);
  }
  const ref = db.collection(KIOSK_REGISTRY_COLLECTION).doc(kioskId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new Error(`cannot rotate key for unprovisioned kiosk ${kioskId}`);
    }
    const current = snap.data();
    const doc = {
      ...current,
      activeKeyVersion: newVersion,
      previousKeyVersion: current.activeKeyVersion,
      previousKeyVersionExpiresAt: new Date(now() + graceSeconds * 1000),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    tx.set(ref, doc);
    return doc;
  });
}

/** Sets a provisioned kiosk's status (ACTIVE / DISABLED / REVOKED). Revoking or disabling never
 * touches guardian_health_latest -- previously accepted telemetry is left exactly as it was. */
async function setKioskStatus(db, admin, { kioskId, status }) {
  if (!STATUSES.has(status)) {
    throw new RangeError(`invalid status: ${status}`);
  }
  const ref = db.collection(KIOSK_REGISTRY_COLLECTION).doc(kioskId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new Error(`cannot set status for unprovisioned kiosk ${kioskId}`);
    }
    const current = snap.data();
    const doc = { ...current, status, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    tx.set(ref, doc);
    return doc;
  });
}

/** Plain (non-transactional) read, for an initial "is it even worth trying crypto" pass before the
 * authoritative, transactionally-fresh re-check inside the replay transaction (see
 * guardian/ingest.service.js's module docstring for why both checks exist). */
async function getKioskRecord(db, kioskId) {
  const snap = await db.collection(KIOSK_REGISTRY_COLLECTION).doc(kioskId).get();
  return snap.exists ? snap.data() : null;
}

module.exports = {
  KIOSK_REGISTRY_COLLECTION,
  STATUS,
  STATUSES,
  DEFAULT_ROTATION_GRACE_S,
  toMillis,
  isKeyVersionPermitted,
  provisionKiosk,
  rotateKioskKey,
  setKioskStatus,
  getKioskRecord,
};
