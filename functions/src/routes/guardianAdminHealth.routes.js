/**
 * MIMO Edge Guardian — Phase 2E admin read route.
 *   GET /admin/guardian/health
 *   GET /admin/guardian/health?kioskId=<id>
 *   GET /admin/guardian/health?kioskId=<id>&detail=1
 *
 * Read-only: this route never writes anything, anywhere, to any collection -- it issues no kiosk
 * commands, changes no kiosk status, and never touches system_status, kiosk_commands or
 * print_jobs. It reads only `guardian_health_latest` (guardian/ingest.service.js's
 * STATE_COLLECTION), the same collection POST /kiosk/guardian/health writes to.
 *
 * Authentication is the EXISTING `adminAuthMiddleware` (src/middleware/auth.js), used completely
 * unchanged -- no new or weaker auth path is introduced for Guardian.
 *
 * Isolated from admin.routes.js on purpose, the same reasoning as guardianHealth.routes.js: its own
 * file, mounted separately in server.js, sharing no code with the print/kiosk-command path.
 *
 * Secret exclusion (hard requirement): the response never includes a master key, a derived key, an
 * HMAC signature, or any other credential -- none of those are ever stored in
 * guardian_health_latest in the first place (see ingest.service.js's module docstring for exactly
 * what is written there), so there is no field to accidentally leak. This route also deliberately
 * does not echo back `bodySha256OfLastAccepted` or `lastAcceptedTimestamp`: both are internal
 * replay-protection bookkeeping, not admin-facing diagnostic data, and keeping the response schema
 * to only what an operator needs keeps it bounded and simple to audit.
 *
 * Untrusted text: `snapshot.checks[].detail` and similar free-text fields are returned exactly as
 * Phase 1 already sanitised and size-capped them (guardian/model.py's sanitize_text) -- this route
 * does not reinterpret, template, or execute them in any way; they are opaque JSON string values in
 * the response, nothing more.
 */
const express = require("express");
const { db } = require("../config/firebase");
const { adminAuthMiddleware } = require("../middleware/auth");
const { STATE_COLLECTION } = require("../guardian/ingest.service");
const { computeFreshness } = require("../guardian/freshness");

const KIOSK_RE = /^[A-Z]{2}-\d{3}$/;
const MAX_SUMMARY_ROWS = 500; // defensive bound: one doc per kiosk, a fleet is nowhere near this

function toMillis(value) {
  if (value == null) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return null;
}

function toIso(ms) {
  return ms == null ? null : new Date(ms).toISOString();
}

/** Phase 2 (2.4): the single highest-severity root cause from this kiosk's last-accepted
 * diagnosis, plus the first check detail that actually explains it -- enough for the dashboard to
 * show a one-line "why" next to a kiosk without a second request. `rootCauses` is already sorted
 * by severity (CRITICAL first) by guardian/classifier.py, so [0] is the one worth surfacing; the
 * full list, with every code/evidence/cascade, remains available unchanged via detail=1. Returns
 * null when there is no root cause (HEALTHY/UNKNOWN) or no snapshot at all -- never a placeholder
 * object, so the frontend's presence check (`if (topRootCause)`) is the only branch it needs.
 * `detail` is exactly what the matching check already carried (guardian/model.py's sanitize_text,
 * applied on the Pi before this ever reaches the backend) -- this route adds no new text of its
 * own and introduces no new field that could carry a secret. */
function topRootCause(data) {
  const rootCauses = data && data.snapshot && data.snapshot.diagnosis && data.snapshot.diagnosis.rootCauses;
  if (!Array.isArray(rootCauses) || rootCauses.length === 0) return null;
  const rc = rootCauses[0];
  const checks = (data.snapshot.checks && Array.isArray(data.snapshot.checks)) ? data.snapshot.checks : [];
  const explaining = (rc.checks || [])
    .map((checkId) => checks.find((c) => c && c.id === checkId))
    .find((c) => c && typeof c.detail === "string" && c.detail.length > 0);
  return { code: rc.code, severity: rc.severity, detail: explaining ? explaining.detail : null };
}

/** The bounded row shape shared by every kiosk, in both the all-kiosks summary and the
 * single-kiosk (non-detail) response. `data` is the raw guardian_health_latest document, or null
 * if there is no record for this kiosk at all. */
function summaryRow(kioskId, data, nowMs) {
  const serverReceivedAtMs = data ? toMillis(data.serverReceivedAt) : null;
  const { freshness, ageSeconds } = computeFreshness(serverReceivedAtMs, nowMs);
  const overall = (data && data.snapshot && data.snapshot.diagnosis && data.snapshot.diagnosis.overall) || null;
  return {
    kioskId,
    overall,
    freshness,
    ageSeconds,
    serverReceivedAt: toIso(serverReceivedAtMs),
    lastAcceptedSeq: data && typeof data.lastAcceptedSeq === "number" ? data.lastAcceptedSeq : null,
    streamId: (data && data.streamId) || null,
    topRootCause: topRootCause(data),
  };
}

function createGuardianAdminHealthRouter({ now = Date.now } = {}) {
  const router = express.Router();

  router.get("/admin/guardian/health", adminAuthMiddleware, async (req, res) => {
    try {
      const rawKioskId = req.query.kioskId;
      const rawDetail = req.query.detail;

      if (rawKioskId !== undefined && (typeof rawKioskId !== "string" || !KIOSK_RE.test(rawKioskId))) {
        return res.status(400).json({ error: "kioskId must look like 'AB-123'" });
      }
      if (rawDetail !== undefined && rawDetail !== "1" && rawDetail !== "0") {
        return res.status(400).json({ error: "detail must be '1' or '0'" });
      }
      const detailRequested = rawDetail === "1";
      if (detailRequested && !rawKioskId) {
        return res.status(400).json({ error: "detail=1 requires a kioskId" });
      }

      const nowMs = now();

      if (!rawKioskId) {
        const snap = await db.collection(STATE_COLLECTION).limit(MAX_SUMMARY_ROWS).get();
        const rows = [];
        snap.forEach((doc) => rows.push(summaryRow(doc.id, doc.data(), nowMs)));
        rows.sort((a, b) => a.kioskId.localeCompare(b.kioskId));
        return res.json({ kiosks: rows });
      }

      const doc = await db.collection(STATE_COLLECTION).doc(rawKioskId).get();
      if (!doc.exists) {
        // No record at all is one of the two cases the NO_TELEMETRY freshness bucket is defined to
        // cover (task requirement 5) -- returned as a normal 200 row, not a 404, so a caller that
        // only reads `freshness` handles "never reported" and "reported long ago" identically.
        return res.json(summaryRow(rawKioskId, null, nowMs));
      }

      const data = doc.data();
      const row = summaryRow(rawKioskId, data, nowMs);
      if (!detailRequested) {
        return res.json(row);
      }
      return res.json({ ...row, bootId: data.bootId || null, snapshot: data.snapshot || null });
    } catch (err) {
      console.error("[GUARDIAN-ADMIN-HEALTH] read failed:", err && err.message);
      return res.status(503).json({ error: "Service unavailable" });
    }
  });

  return router;
}

// Default export is a ready-to-mount router (same convention as guardianHealth.routes.js), built
// against the real db/admin. Tests needing a fake clock use createGuardianAdminHealthRouter directly.
module.exports = createGuardianAdminHealthRouter();
module.exports.createGuardianAdminHealthRouter = createGuardianAdminHealthRouter;
