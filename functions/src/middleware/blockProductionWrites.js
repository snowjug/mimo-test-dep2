// Local-dev-only safety switch. When a developer points their local backend's Firestore
// connection at real production data (LOCAL_TARGET=production in functions/.env), this blocks
// every write-capable request before any route/controller runs, so an accidental click (restart
// kiosk, issue refund, delete coupon, ...) can never mutate real production data. It is a no-op
// in every other configuration, including every existing test, which never sets LOCAL_TARGET.
//
// Login routes are allowlisted because they only compare credentials against local env vars
// (see admin.controller.js/hr.controller.js/marketing.controller.js/technical.controller.js) and
// never write anything.
//
// POST /kiosk/guardian/health is allowlisted too, but for a different reason: unlike every other
// write route here, it is meant to write to PRODUCTION from every real kiosk, always -- that is
// its entire purpose (see guardianHealth.routes.js/CLAUDE.md). It is also the one write this repo
// can prove is safe to let through unconditionally: HMAC-signed, replay-protected, and it only
// ever writes a bounded, validated, sanitised snapshot to its own guardian_health_latest
// collection -- never system_status, kiosk_commands, or print_jobs (see
// docs/architecture/MIMO_EDGE_GUARDIAN_PHASE_2A_CONTRACT.md). Blocking it here was never
// intentional: this switch exists to stop an accidental local click from mutating real data, not
// to stop a real kiosk's own telemetry from reaching real Firestore.
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const LOGIN_PATHS = new Set(["/admin/login", "/hr/login", "/marketing/login", "/technical/login"]);
const ALWAYS_ALLOWED_PATHS = new Set(["/kiosk/guardian/health"]);

const blockProductionWrites = (req, res, next) => {
  if (process.env.LOCAL_TARGET !== "production") return next();
  if (!WRITE_METHODS.has(req.method)) return next();
  if (LOGIN_PATHS.has(req.path)) return next();
  if (ALWAYS_ALLOWED_PATHS.has(req.path)) return next();

  return res.status(403).json({
    error:
      "Write blocked: this local backend is configured against PRODUCTION Firestore " +
      "(LOCAL_TARGET=production). Write/control actions are disabled for safety.",
  });
};

module.exports = { blockProductionWrites };
