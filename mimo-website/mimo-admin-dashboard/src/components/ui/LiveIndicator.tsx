import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  updatedAt: Date | null;
  /** The selected range includes today and is being polled. */
  live: boolean;
  fetching?: boolean;
  onRefresh?: () => void;
  tone?: 'admin' | 'finance';
}

const ago = (d: Date, now: number) => {
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ago` : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/** "● Live · updated 12s ago" (or a plain timestamp for past ranges) with a manual refresh button. */
export const LiveIndicator: React.FC<Props> = ({ updatedAt, live, fetching = false, onRefresh, tone = 'admin' }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 5000); return () => window.clearInterval(id); }, []);
  const accent = tone === 'finance' ? 'text-[#6D35E8]' : 'text-indigo-600 dark:text-indigo-400';
  return (
    <div className="inline-flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
      {live ? (
        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
        </span>
      ) : (
        <span>Historical</span>
      )}
      <span aria-live="polite">{updatedAt ? `· updated ${ago(updatedAt, now)}` : '· loading…'}</span>
      {onRefresh && (
        <button type="button" onClick={onRefresh} disabled={fetching} title="Refresh now"
          className={`p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50 ${accent}`}>
          <RefreshCw size={13} className={fetching ? 'animate-spin' : ''} />
        </button>
      )}
    </div>
  );
};
