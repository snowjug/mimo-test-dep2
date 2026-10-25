/**
 * MIMO Edge Guardian — admin dashboard types.
 * Mirrors exactly what functions/src/routes/guardianAdminHealth.routes.js returns from
 * GET /admin/guardian/health (summary / single-kiosk / detail=1). No field here is invented —
 * every property matches a real field the backend actually sends. Guardian is read-only: there is
 * no type here for a write/command payload, because none exists.
 */

export type GuardianFreshness = 'FRESH' | 'STALE' | 'NO_TELEMETRY';

/** The real Phase 1 diagnosis.overall values (guardian/classifier.py). UNKNOWN is a valid value the
 * backend can return, even though the dashboard's summary cards (task-specified) only tally
 * HEALTHY/DEGRADED/FAILING — an UNKNOWN kiosk still appears in the table, just not double-counted
 * into one of those three cards. */
export type GuardianOverall = 'HEALTHY' | 'DEGRADED' | 'FAILING' | 'UNKNOWN';

export type GuardianPlane = 'connectivity' | 'services' | 'management' | 'resources';
export type GuardianCheckState = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_RUN' | 'STALE';
export type GuardianSeverity = 'CRITICAL' | 'MANAGEMENT' | 'WARNING';

/** Phase 2 (2.4): the single highest-severity root cause from the kiosk's last-accepted diagnosis
 * (guardian/classifier.py already sorts `rootCauses` severity-first), plus whichever of that root
 * cause's checks actually carried a non-empty `detail`. `null` when the kiosk has no root cause
 * (HEALTHY/UNKNOWN) or no snapshot at all. `detail` is exactly that check's already-sanitised text
 * (guardian/model.py's sanitize_text, applied on the Pi) -- never re-interpreted, never HTML. */
export interface GuardianTopRootCause {
  code: string;
  severity: GuardianSeverity;
  detail: string | null;
}

/** The row shape shared by the all-kiosks summary and a single-kiosk (non-detail) lookup. */
export interface GuardianKioskSummary {
  kioskId: string;
  overall: GuardianOverall | null;
  freshness: GuardianFreshness;
  ageSeconds: number | null;
  serverReceivedAt: string | null; // ISO 8601, or null if this kiosk has never reported
  lastAcceptedSeq: number | null;
  streamId: string | null;
  topRootCause: GuardianTopRootCause | null;
}

export interface GuardianCheck {
  id: string;
  plane: GuardianPlane;
  required: boolean;
  state: GuardianCheckState;
  observedAt: string;
  durationMs: number | null;
  evidence: string[];
  detail: string; // already sanitised server-side (guardian/model.py's sanitize_text) -- render as text, never HTML
  streak: number;
}

export interface GuardianRootCause {
  code: string;
  plane: GuardianPlane;
  severity: GuardianSeverity;
  checks: string[];
  evidence: string[];
}

export interface GuardianCascade {
  check: string;
  blockedBy: string;
}

export interface GuardianSnapshot {
  schemaVersion: number;
  agentVersion: string;
  kioskId: string;
  seq: number;
  observedAt: string;
  cycle: {
    durationMs: number;
    budgetMs: number;
    budgetExceeded: boolean;
    detailsDropped: boolean;
  };
  checks: GuardianCheck[];
  diagnosis: {
    overall: GuardianOverall;
    rootCauses: GuardianRootCause[];
    cascades: GuardianCascade[];
    unknown: string[];
  };
}

/** Only present when the request asked for detail=1. */
export interface GuardianKioskDetail extends GuardianKioskSummary {
  bootId: string | null;
  snapshot: GuardianSnapshot | null;
}

export interface GuardianSummaryResponse {
  kiosks: GuardianKioskSummary[];
}
