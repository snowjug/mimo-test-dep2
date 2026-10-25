import React, { useMemo } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Radio, Clock, HelpCircle } from 'lucide-react';
import type { GuardianKioskSummary } from '../../../types/guardian.types';

interface Props {
  kiosks: GuardianKioskSummary[];
}

/**
 * Six cards: three freshness buckets, three diagnosis buckets. These are two SEPARATE tallies over
 * the same list, not six mutually-exclusive slices of one pie -- a kiosk contributes to exactly one
 * freshness card (every kiosk has a freshness) and, independently, to at most one of the three
 * diagnosis cards (a kiosk with no telemetry, or whose last diagnosis was UNKNOWN, contributes to
 * neither Healthy/Degraded/Failing -- it is not silently folded into one of them).
 */
function summarize(kiosks: GuardianKioskSummary[]) {
  const fresh = kiosks.filter((k) => k.freshness === 'FRESH').length;
  const stale = kiosks.filter((k) => k.freshness === 'STALE').length;
  const noTelemetry = kiosks.filter((k) => k.freshness === 'NO_TELEMETRY').length;
  const healthy = kiosks.filter((k) => k.overall === 'HEALTHY').length;
  const degraded = kiosks.filter((k) => k.overall === 'DEGRADED').length;
  const failing = kiosks.filter((k) => k.overall === 'FAILING').length;
  return { fresh, stale, noTelemetry, healthy, degraded, failing };
}

const CardSkeleton: React.FC = () => (
  <div className="rounded-[var(--radius-lg)] p-4 bg-[var(--surface)] border border-[var(--border)] min-h-[92px] flex flex-col justify-between">
    <div className="skeleton h-3 w-20 rounded" />
    <div className="skeleton h-7 w-12 rounded mt-2" />
  </div>
);

const Card: React.FC<{ icon: React.ReactNode; label: string; value: number; tone: 'emerald' | 'amber' | 'rose' | 'slate' }> = ({ icon, label, value, tone }) => {
  const toneCls: Record<typeof tone, string> = {
    emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10',
    amber: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10',
    rose: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10',
    slate: 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800',
  };
  return (
    <div className="rounded-[var(--radius-lg)] p-4 bg-[var(--surface)] border border-[var(--border)] shadow-xs flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${toneCls[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-[var(--text-3)] truncate">{label}</p>
        <p className="text-xl font-black tabular-nums text-[var(--text-1)]">{value}</p>
      </div>
    </div>
  );
};

export const GuardianSummaryCards: React.FC<Props & { loading?: boolean }> = ({ kiosks, loading }) => {
  const counts = useMemo(() => summarize(kiosks), [kiosks]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      <Card icon={<Radio size={16} />} label="Fresh telemetry" value={counts.fresh} tone="emerald" />
      <Card icon={<Clock size={16} />} label="Stale telemetry" value={counts.stale} tone="amber" />
      <Card icon={<HelpCircle size={16} />} label="No telemetry" value={counts.noTelemetry} tone="slate" />
      <Card icon={<CheckCircle2 size={16} />} label="Healthy diagnoses" value={counts.healthy} tone="emerald" />
      <Card icon={<AlertTriangle size={16} />} label="Degraded diagnoses" value={counts.degraded} tone="amber" />
      <Card icon={<XCircle size={16} />} label="Failing diagnoses" value={counts.failing} tone="rose" />
    </div>
  );
};
