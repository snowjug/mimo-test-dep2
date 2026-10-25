/**
 * MIMO Edge Guardian — master secret access.
 *
 * Target architecture (docs/architecture/MIMO_EDGE_GUARDIAN_PHASE_2A_CONTRACT.md §4): the master
 * secret is a Google Cloud Secret Manager secret named GUARDIAN_MASTER_KEY. Production wiring is
 * the same mechanism already used for GMAIL_APP_PASSWORD (functions/index.js's
 * `onRequest({ secrets: [...] }, app)` on the exported v2 HTTPS function) — once GUARDIAN_MASTER_KEY
 * is added to that `secrets` array AND a real secret value is created in Secret Manager for this
 * project, Cloud Functions injects it into process.env.GUARDIAN_MASTER_KEY at runtime. This module
 * never calls the Secret Manager API itself and never creates, fetches, or caches a production
 * secret value — it only reads whatever is already in process.env.
 *
 * Deliberately lazy and non-throwing. Unlike config/env.js's JWT_SECRET (required for the entire
 * app to boot, since it is already load-bearing for every other route), an unset or malformed
 * GUARDIAN_MASTER_KEY must never crash app startup or any unrelated route: Guardian ingestion fails
 * safely (503, see routes/guardianHealth.routes.js) instead. See CLAUDE.md: "Guardian is never a
 * dependency of the print path, in either direction."
 */

const MASTER_KEY_HEX_RE = /^[0-9a-f]{64}$/i;

/** Returns the lowercase hex master key, or null if unset / not a well-formed 32-byte hex secret.
 * Read fresh on every call (not cached at module scope) so a secret bound later in the Cloud
 * Functions lifecycle, or set differently per test, is always picked up. */
function getMasterKeyHex() {
  const raw = process.env.GUARDIAN_MASTER_KEY;
  if (typeof raw !== "string" || !MASTER_KEY_HEX_RE.test(raw)) return null;
  return raw.toLowerCase();
}

module.exports = { getMasterKeyHex, MASTER_KEY_HEX_RE };
