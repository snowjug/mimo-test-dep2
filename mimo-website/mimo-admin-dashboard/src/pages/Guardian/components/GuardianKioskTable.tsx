import React, { useMemo, useState } from 'react';
import { ArrowUpDown, ChevronRight } from 'lucide-react';
import type { GuardianKioskSummary } from '../../../types/guardian.types';
import { GuardianFreshnessBadge, GuardianOverallBadge } from './GuardianStatusBadge';
import { SearchInput, EmptyState } from '../../../components/ui/shared';
import { dateTime, timeAgo } from '../../../lib/format';
import { rootCauseSentence } from '../guardianRootCauseText';

interface Props {
  kiosks: GuardianKioskSummary[];
  onViewDetails: (kioskId: string) => void;
}

type SortField = 'kioskId' | 'freshness' | 'overall' | 'serverReceivedAt' | 'lastAcceptedSeq';
type SortDir = 'asc' | 'desc';

const FRESHNESS_RANK: Record<string, number> = { FRESH: 0, STALE: 1, NO_TELEMETRY: 2 };
const OVERALL_RANK: Record<string, number> = { HEALTHY: 0, UNKNOWN: 1, DEGRADED: 2, FAILING: 3 };

function compare(a: GuardianKioskSummary, b: GuardianKioskSummary, field: SortField): number {
  switch (field) {
    case 'kioskId':
      return a.kioskId.localeCompare(b.kioskId);
    case 'freshness':
      return (FRESHNESS_RANK[a.freshness] ?? 9) - (FRESHNESS_RANK[b.freshness] ?? 9);
    case 'overall':
      return (OVERALL_RANK[a.overall ?? 'UNKNOWN'] ?? 9) - (OVERALL_RANK[b.overall ?? 'UNKNOWN'] ?? 9);
    case 'serverReceivedAt':
      return (a.serverReceivedAt ? new Date(a.serverReceivedAt).getTime() : -1) - (b.serverReceivedAt ? new Date(b.serverReceivedAt).getTime() : -1);
    case 'lastAcceptedSeq':
      return (a.lastAcceptedSeq ?? -1) - (b.lastAcceptedSeq ?? -1);
    default:
      return 0;
  }
}

/** Phase 2.4: a one-line, plain-English "why" for a kiosk that currently has a root cause.
 * Renders nothing for a healthy/unknown kiosk -- this is additive, never a replacement for the
 * freshness/diagnosis badges already shown. */
const WhyLine: React.FC<{ kiosk: GuardianKioskSummary; className?: string }> = ({ kiosk, className = '' }) => {
  if (!kiosk.topRootCause) return null;
  const { severity, detail } = kiosk.topRootCause;
  const tone = severity === 'WARNING' || severity === 'MANAGEMENT' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';
  return (
    <p className={`text-[11px] ${tone} ${className}`}>
      {rootCauseSentence(kiosk.topRootCause.code)}
      {detail && <span className="text-[var(--text-3)]"> · {detail}</span>}
    </p>
  );
};

const SortButton: React.FC<{ field: SortField; label: string; sortField: SortField; sortDir: SortDir; onSort: (f: SortField) => void; align?: 'left' | 'right' }> = ({ field, label, sortField, sortDir, onSort, align = 'left' }) => (
  <button
    type="button"
    onClick={() => onSort(field)}
    aria-label={`Sort by ${label}${sortField === field ? (sortDir === 'asc' ? ', ascending' : ', descending') : ''}`}
    className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors cursor-pointer ${align === 'right' ? 'justify-end w-full' : ''}`}
  >
    {label}
    <ArrowUpDown size={11} className={sortField === field ? 'text-[var(--primary)]' : 'opacity-40'} />
  </button>
);

/** Kiosk ID is Guardian's own identity, deliberately never read from the printing system's
 * online/offline state -- a STALE row here says nothing about whether printing still works. */
export const GuardianKioskTable: React.FC<Props> = ({ kiosks, onViewDetails }) => {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('kioskId');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const onSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const filtered = useMemo(
    () => kiosks.filter((k) => k.kioskId.toLowerCase().includes(search.trim().toLowerCase())),
    [kiosks, search]
  );
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => compare(a, b, sortField) * (sortDir === 'asc' ? 1 : -1));
    return copy;
  }, [filtered, sortField, sortDir]);

  if (kiosks.length === 0) {
    return (
      <EmptyState
        title="No Guardian telemetry yet"
        description="No kiosk has reported Guardian health data to the backend yet. This is separate from the printing system's own online/offline status."
      />
    );
  }

  return (
    <div className="space-y-3">
      <SearchInput value={search} onChange={setSearch} placeholder="Search kiosk ID…" className="max-w-xs" />

      {sorted.length === 0 ? (
        <EmptyState title="No kiosks match your search" />
      ) : (
        <>
          {/* Desktop / tablet: a real table, horizontally scrollable if it ever needs to be. */}
          <div className="hidden sm:block overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)]">
            <table className="w-full text-sm">
              <caption className="sr-only">Guardian kiosk telemetry and diagnosis status</caption>
              <thead>
                <tr className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                  <th scope="col" className="text-left px-4 py-2.5"><SortButton field="kioskId" label="Kiosk ID" sortField={sortField} sortDir={sortDir} onSort={onSort} /></th>
                  <th scope="col" className="text-left px-4 py-2.5"><span className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-3)]">Why</span></th>
                  <th scope="col" className="text-left px-4 py-2.5"><SortButton field="freshness" label="Freshness" sortField={sortField} sortDir={sortDir} onSort={onSort} /></th>
                  <th scope="col" className="text-left px-4 py-2.5"><SortButton field="overall" label="Diagnosis" sortField={sortField} sortDir={sortDir} onSort={onSort} /></th>
                  <th scope="col" className="text-left px-4 py-2.5"><SortButton field="serverReceivedAt" label="Last received" sortField={sortField} sortDir={sortDir} onSort={onSort} /></th>
                  <th scope="col" className="text-right px-4 py-2.5"><SortButton field="lastAcceptedSeq" label="Seq" sortField={sortField} sortDir={sortDir} onSort={onSort} align="right" /></th>
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((k) => (
                  <tr key={k.kioskId} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)]/60 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-[var(--text-1)]">{k.kioskId}</td>
                    <td className="px-4 py-2.5 max-w-xs"><WhyLine kiosk={k} /></td>
                    <td className="px-4 py-2.5"><GuardianFreshnessBadge freshness={k.freshness} /></td>
                    <td className="px-4 py-2.5"><GuardianOverallBadge overall={k.overall} /></td>
                    <td className="px-4 py-2.5 text-xs text-[var(--text-2)]" title={k.serverReceivedAt ?? undefined}>
                      {k.serverReceivedAt ? `${dateTime(k.serverReceivedAt)} (${timeAgo(k.serverReceivedAt)})` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--text-2)]">{k.lastAcceptedSeq ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => onViewDetails(k.kioskId)}
                        aria-label={`View Guardian details for kiosk ${k.kioskId}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)] transition-colors cursor-pointer"
                      >
                        View Details <ChevronRight size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards (same convention as the Kiosk Network page's own per-kiosk cards). */}
          <div className="sm:hidden space-y-2">
            {sorted.map((k) => (
              <button
                key={k.kioskId}
                type="button"
                onClick={() => onViewDetails(k.kioskId)}
                aria-label={`View Guardian details for kiosk ${k.kioskId}`}
                className="w-full text-left p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-xs cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-[var(--text-1)]">{k.kioskId}</span>
                  <ChevronRight size={14} className="text-[var(--text-3)] flex-shrink-0" />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  <GuardianFreshnessBadge freshness={k.freshness} />
                  <GuardianOverallBadge overall={k.overall} />
                </div>
                <WhyLine kiosk={k} className="mt-2" />
                <p className="text-[11px] text-[var(--text-3)] mt-2">
                  {k.serverReceivedAt ? `Received ${timeAgo(k.serverReceivedAt)}` : 'Never received'}
                  {k.lastAcceptedSeq !== null && ` · seq ${k.lastAcceptedSeq}`}
                </p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
