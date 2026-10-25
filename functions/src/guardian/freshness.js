/**
 * MIMO Edge Guardian — Phase 2E freshness classification.
 *
 * Pure function, computed at READ time (never stored): freshness reflects "how long ago did our
 * server last hear from this kiosk," which must always be current relative to now, not to whenever
 * the state document happened to last be written.
 *
 * Thresholds are the task's proposed initial values, not re-derived from anywhere else:
 *   FRESH:         age <= 180s
 *   STALE:         180s  < age <= 900s
 *   NO_TELEMETRY:  age > 900s, OR no record at all (serverReceivedAtMs is null/undefined)
 */
const FRESH_MAX_S = 180;
const STALE_MAX_S = 900;

/**
 * @param serverReceivedAtMs  epoch milliseconds of the last accepted request's server receipt
 *                            time, or null/undefined if there is no record at all.
 * @param nowMs               epoch milliseconds to compute age against (injectable for tests).
 * @returns {{ freshness: "FRESH"|"STALE"|"NO_TELEMETRY", ageSeconds: number|null }}
 */
function computeFreshness(serverReceivedAtMs, nowMs) {
  if (serverReceivedAtMs == null || !Number.isFinite(serverReceivedAtMs)) {
    return { freshness: "NO_TELEMETRY", ageSeconds: null };
  }
  const ageSeconds = Math.max(0, Math.round((nowMs - serverReceivedAtMs) / 1000));
  if (ageSeconds <= FRESH_MAX_S) return { freshness: "FRESH", ageSeconds };
  if (ageSeconds <= STALE_MAX_S) return { freshness: "STALE", ageSeconds };
  return { freshness: "NO_TELEMETRY", ageSeconds };
}

module.exports = { computeFreshness, FRESH_MAX_S, STALE_MAX_S };
