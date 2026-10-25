/**
 * MIMO Edge Guardian — Phase 2B ingestion route.
 *   POST /kiosk/guardian/health
 *
 * Isolated from the print path on purpose (CLAUDE.md: "Guardian shares no code or files with
 * pi-listener/ or pi_scripts/"): this file is its own router, mounted with no prefix at the
 * top level of server.js (full path baked into the route itself) rather than nested under
 * createKioskRouter()'s /kiosk mount, and it imports nothing from kiosk.routes.js. It never
 * writes to system_status, kiosk_commands or print_jobs.
 *
 * See docs/architecture/MIMO_EDGE_GUARDIAN_PHASE_2A_CONTRACT.md for the full design; this is the
 * first implemented slice (Phase 2B) of that design — admin-side GET /admin/guardian/health is not
 * part of this slice.
 */
const express = require("express");
const { db, admin } = require("../config/firebase");
const { createFailureLimiter } = require("../middleware/rateLimit");
const { getMasterKeyHex } = require("../guardian/secret");
const { deriveKioskKey, canonicalString, sha256Hex, hmacSha256Hex, hexEqualConstantTime } = require("../guardian/crypto");
const { validateSnapshot, MAX_SNAPSHOT_BYTES } = require("../guardian/snapshotSchema");
const { runReplayTransaction } = require("../guardian/ingest.service");
const { getKioskRecord, isKeyVersionPermitted, STATUS } = require("../guardian/registry");

// Contract §5.3: replay-window placeholders (documented as proposed, not final, in Phase 2A §16).
const STALE_WINDOW_S = 300;
const FUTURE_SKEW_S = 30;

const KIOSK_RE = /^[A-Z]{2}-\d{3}$/;
const STREAM_RE = /^[0-9a-f]{32}$/;
// Phase 2D: bootId is the Pi's kernel boot UUID (/proc/sys/kernel/random/boot_id, dashes stripped,
// lowercased), the same 32-lowercase-hex shape as streamId -- NOT a decimal counter as the Phase 2A
// document originally specified. See ingest.service.js's module docstring for why bootId plays no
// role in the accept/reject decision any more (a UUID carries no ordering information at all).
const BOOT_ID_RE = /^[0-9a-f]{32}$/;
const DIGITS_RE = /^\d{1,20}$/;
const SIGNATURE_RE = /^[0-9a-f]{64}$/i;
// Phase 2F: which derived-key version this request claims to be signed with.
const KEY_VERSION_RE = /^[1-9]\d{0,8}$/;

/** Reads and syntactically validates the six X-Guardian-* headers. Returns
 * { ok: true, parsed } or { ok: false }. No crypto or Firestore work happens before this passes. */
function parseGuardianHeaders(req) {
  const kioskId = req.get("X-Guardian-Kiosk-Id");
  const streamId = req.get("X-Guardian-Stream-Id");
  const bootId = req.get("X-Guardian-Boot-Id");
  const timestampRaw = req.get("X-Guardian-Timestamp");
  const signatureRaw = req.get("X-Guardian-Signature");
  const keyVersionRaw = req.get("X-Guardian-Key-Version");

  if (!kioskId || !KIOSK_RE.test(kioskId)) return { ok: false };
  if (!streamId || !STREAM_RE.test(streamId)) return { ok: false };
  if (!bootId || !BOOT_ID_RE.test(bootId)) return { ok: false };
  if (!timestampRaw || !DIGITS_RE.test(timestampRaw)) return { ok: false };
  if (!signatureRaw || !SIGNATURE_RE.test(signatureRaw)) return { ok: false };
  if (!keyVersionRaw || !KEY_VERSION_RE.test(keyVersionRaw)) return { ok: false };

  const timestamp = Number(timestampRaw);
  const keyVersion = Number(keyVersionRaw);
  if (!Number.isSafeInteger(timestamp) || !Number.isSafeInteger(keyVersion)) return { ok: false };

  return { ok: true, parsed: { kioskId, streamId, bootId, timestamp, keyVersion, signature: signatureRaw.toLowerCase() } };
}

function createGuardianHealthRouter({ now = Date.now } = {}) {
  const router = express.Router();

  // Counts only signature-verification failures as a "failure" for rate-limiting purposes (contract
  // §8): a legitimately misordered retry (409) must not burn the same budget a forged-signature
  // probe does. Reuses the exact Firestore-backed, fail-open limiter already in production use for
  // print-code guessing (middleware/rateLimit.js).
  const authFailureLimiter = createFailureLimiter(db, {
    scope: "guardian_auth",
    limits: [{ windowMs: 60 * 1000, max: 10 }, { windowMs: 60 * 60 * 1000, max: 50 }],
    failureStatuses: [401],
    now,
  });

  router.post("/kiosk/guardian/health", authFailureLimiter, async (req, res) => {
    try {
      if (!req.is("application/json")) {
        return res.status(400).json({ error: "Content-Type must be application/json" });
      }
      const rawBody = req.rawBody;
      if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
        return res.status(400).json({ error: "Missing request body" });
      }
      if (rawBody.length > MAX_SNAPSHOT_BYTES) {
        return res.status(413).json({ error: "Payload too large" });
      }

      const headerResult = parseGuardianHeaders(req);
      if (!headerResult.ok) {
        return res.status(400).json({ error: "Missing or malformed Guardian headers" });
      }
      const { kioskId, streamId, bootId, timestamp, keyVersion, signature } = headerResult.parsed;

      const schemaResult = validateSnapshot(req.body);
      if (!schemaResult.valid) {
        return res.status(400).json({ error: "Invalid snapshot" });
      }
      // Header/body identity check: the signed kiosk identity must match the snapshot it signed.
      if (req.body.kioskId !== kioskId) {
        return res.status(400).json({ error: "kioskId mismatch between header and body" });
      }

      // Phase 2F: explicit provisioning check. Kiosk-ID format validity alone is never
      // authorization (requirement 2) -- this is a PLAIN read, used only to decide whether it is
      // even worth deriving a key and verifying a signature; it is not the authoritative check
      // (that is the transactionally-fresh re-read inside runReplayTransaction, below) and a stale
      // value here can only ever cause an unnecessary crypto attempt, never a wrongly-accepted one.
      const registryRecord = await getKioskRecord(db, kioskId);
      if (!registryRecord) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (registryRecord.status !== STATUS.ACTIVE) {
        return res.status(403).json({ error: "Forbidden", reason: `kiosk_${registryRecord.status.toLowerCase()}` });
      }
      if (!isKeyVersionPermitted(registryRecord, keyVersion, now())) {
        return res.status(401).json({ error: "Unauthorized", reason: "unsupported_key_version" });
      }

      const masterKeyHex = getMasterKeyHex();
      if (!masterKeyHex) {
        console.error("[GUARDIAN-HEALTH] GUARDIAN_MASTER_KEY is not configured; rejecting ingestion");
        return res.status(503).json({ error: "Guardian ingestion is not configured" });
      }

      const derivedKey = deriveKioskKey(masterKeyHex, kioskId, keyVersion);
      const bodySha256Hex = sha256Hex(rawBody);
      const canonical = canonicalString({
        method: "POST",
        path: "/kiosk/guardian/health",
        kioskId,
        streamId,
        bootId,
        seq: req.body.seq,
        timestamp,
        bodySha256Hex,
      });
      const expectedSignature = hmacSha256Hex(derivedKey, canonical);
      if (!hexEqualConstantTime(signature, expectedSignature)) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Only after signature verification does timestamp/replay logic run (contract §3.3 step 6).
      const nowS = Math.floor(now() / 1000);
      if (nowS - timestamp > STALE_WINDOW_S) {
        return res.status(409).json({ error: "Conflict", reason: "stale_timestamp" });
      }
      if (timestamp - nowS > FUTURE_SKEW_S) {
        return res.status(409).json({ error: "Conflict", reason: "timestamp_in_future" });
      }

      const result = await runReplayTransaction(db, admin, {
        kioskId, streamId, bootId, seq: req.body.seq, timestamp, keyVersion, bodySha256Hex, snapshot: req.body,
      });

      if (result.outcome === "accepted" || result.outcome === "duplicate") {
        return res.status(202).json({ status: result.outcome });
      }
      if (result.outcome === "conflict") {
        return res.status(409).json({ error: "Conflict", reason: result.reason });
      }
      if (result.outcome === "unauthorized") {
        // The authoritative, transactionally-fresh check caught what the earlier plain read
        // (above) missed -- a revoke/disable/rotation that landed concurrently (requirement 7).
        const code = result.reason === "kiosk_not_provisioned" || result.reason === "unsupported_key_version" ? 401 : 403;
        return res.status(code).json({ error: code === 401 ? "Unauthorized" : "Forbidden", reason: result.reason });
      }
      return res.status(503).json({ error: "Service unavailable" });
    } catch (err) {
      console.error("[GUARDIAN-HEALTH] ingestion failed:", err && err.message);
      return res.status(503).json({ error: "Service unavailable" });
    }
  });

  return router;
}

// Default export is a ready-to-mount router (matches the other top-level routers in server.js, e.g.
// `app.use(require("./routes/auth.routes"))`), built against the real db/admin. Tests that need
// dependency injection (a fake clock) use createGuardianHealthRouter directly.
module.exports = createGuardianHealthRouter();
module.exports.createGuardianHealthRouter = createGuardianHealthRouter;
module.exports.parseGuardianHeaders = parseGuardianHeaders;
