import React from 'react';
import { Globe, AlertTriangle, Loader2 } from 'lucide-react';
import type { WebsiteHealthResponse } from '../../../types/guardian.types';

interface Props {
  health: WebsiteHealthResponse | null;
  loading?: boolean;
  onClick: () => void;
}

export const CustomerWebsiteStatusButton: React.FC<Props> = ({ health, loading, onClick }) => {
  if (loading && !health) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)] opacity-80 cursor-wait"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Customer Website: Checking...</span>
      </button>
    );
  }

  const isGood = health?.isGood ?? true;

  if (isGood) {
    return (
      <button
        type="button"
        onClick={onClick}
        title="Customer website is running smoothly without errors. Click for detailed diagnostics."
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all shadow-xs cursor-pointer bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60"
      >
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        <Globe size={13} className="text-emerald-600 dark:text-emerald-400" />
        <span>Customer Website: Good</span>
      </button>
    );
  }

  // Issue detected: Show prominent red alert button with pulse
  return (
    <button
      type="button"
      onClick={onClick}
      title="Customer website has reported issues or errors! Click to view where and what happened."
      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all shadow-sm cursor-pointer bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-700/80 animate-pulse"
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping" />
        <span className="relative inline-flex size-2 rounded-full bg-rose-600" />
      </span>
      <AlertTriangle size={13} className="text-rose-600 dark:text-rose-400" />
      <span>Customer Website: Issue Detected</span>
    </button>
  );
};

