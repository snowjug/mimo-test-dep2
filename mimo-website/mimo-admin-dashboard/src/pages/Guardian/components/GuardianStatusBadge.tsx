import React from 'react';
import type { GuardianFreshness, GuardianOverall } from '../../../types/guardian.types';

/** Same visual language as pages/Finance/components/StatusBadge.tsx (dot + pill, border, text label
 * — never colour alone). Two small badges instead of one generic one because freshness and
 * diagnosis are genuinely different dimensions with different vocabularies; sharing styling logic
 * would blur that distinction, not clarify it. */
const base = 'inline-flex items-center gap-1.5 font-semibold rounded-full border px-2 py-0.5 text-[11px] tracking-tight whitespace-nowrap';

const FRESHNESS_STYLE: Record<GuardianFreshness, { cls: string; dot: string; label: string }> = {
  FRESH: { cls: 'bg-emerald-50/90 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30', dot: 'bg-emerald-500', label: 'Fresh' },
  STALE: { cls: 'bg-amber-50/90 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30', dot: 'bg-amber-500', label: 'Stale' },
  NO_TELEMETRY: { cls: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', dot: 'bg-slate-400', label: 'No telemetry' },
};

export const GuardianFreshnessBadge: React.FC<{ freshness: GuardianFreshness }> = ({ freshness }) => {
  const s = FRESHNESS_STYLE[freshness] ?? FRESHNESS_STYLE.NO_TELEMETRY;
  return (
    <span className={`${base} ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
};

const OVERALL_STYLE: Record<GuardianOverall, { cls: string; dot: string; label: string }> = {
  HEALTHY: { cls: 'bg-emerald-50/90 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30', dot: 'bg-emerald-500', label: 'Healthy' },
  DEGRADED: { cls: 'bg-amber-50/90 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30', dot: 'bg-amber-500', label: 'Degraded' },
  FAILING: { cls: 'bg-rose-50/90 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30', dot: 'bg-rose-500', label: 'Failing' },
  UNKNOWN: { cls: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', dot: 'bg-slate-400', label: 'Unknown' },
};

/** `overall` is null for a kiosk with no telemetry at all -- rendered as the same "Unknown" style
 * rather than inventing a diagnosis that was never reported. */
export const GuardianOverallBadge: React.FC<{ overall: GuardianOverall | null }> = ({ overall }) => {
  const s = overall ? (OVERALL_STYLE[overall] ?? OVERALL_STYLE.UNKNOWN) : OVERALL_STYLE.UNKNOWN;
  return (
    <span className={`${base} ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {overall ? s.label : 'No data'}
    </span>
  );
};

const CHECK_STATE_STYLE: Record<string, { cls: string; label: string }> = {
  PASS: { cls: 'bg-emerald-50/90 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30', label: 'Pass' },
  FAIL: { cls: 'bg-rose-50/90 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30', label: 'Fail' },
  UNKNOWN: { cls: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', label: 'Unknown' },
  NOT_RUN: { cls: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', label: 'Not run' },
  STALE: { cls: 'bg-amber-50/90 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30', label: 'Stale' },
};

export const GuardianCheckStateBadge: React.FC<{ state: string }> = ({ state }) => {
  const s = CHECK_STATE_STYLE[state] ?? CHECK_STATE_STYLE.UNKNOWN;
  return <span className={`${base} ${s.cls}`}>{s.label}</span>;
};

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: 'bg-rose-50/90 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30',
  MANAGEMENT: 'bg-amber-50/90 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30',
  WARNING: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

export const GuardianSeverityBadge: React.FC<{ severity: string }> = ({ severity }) => (
  <span className={`${base} ${SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.WARNING}`}>{severity}</span>
);
