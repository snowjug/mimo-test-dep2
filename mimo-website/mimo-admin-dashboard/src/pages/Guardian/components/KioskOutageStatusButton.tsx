import React from 'react';
import { AlertTriangle, CheckCircle2, BellRing, Loader2 } from 'lucide-react';
import type { KioskOutageStatus } from '../../../types/guardian.types';

interface Props {
  outages: KioskOutageStatus | null;
  loading?: boolean;
  onClick: () => void;
}

export const KioskOutageStatusButton: React.FC<Props> = ({ outages, loading, onClick }) => {
  if (loading && !outages) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)] opacity-80 cursor-wait"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Customer Popups: Loading...</span>
      </button>
    );
  }

  const hasOutage = Boolean(
    outages?.allDown || outages?.mimo1Down || outages?.mimo2BwDown || outages?.mimo2ColorDown
  );

  if (hasOutage) {
    const activeCount = [
      outages?.allDown,
      outages?.mimo1Down,
      outages?.mimo2BwDown,
      outages?.mimo2ColorDown,
    ].filter(Boolean).length;

    return (
      <button
        type="button"
        onClick={onClick}
        title="Warning popup(s) are currently active on the customer website! Click to view or turn off."
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all shadow-xs cursor-pointer bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700 animate-pulse"
      >
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" />
          <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
        </span>
        <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400" />
        <span>Customer Popups: Active ({activeCount})</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title="All machines operating normally. Click to configure machine status overrides."
      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all shadow-xs cursor-pointer bg-surface-2 text-[var(--text-2)] hover:text-[var(--text-1)] border-[var(--border)] hover:bg-[var(--surface)]"
    >
      <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />
      <span>Customer Popups: Normal</span>
    </button>
  );
};
