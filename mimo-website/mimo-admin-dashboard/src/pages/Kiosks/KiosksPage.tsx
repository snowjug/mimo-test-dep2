import React, { useState } from 'react';
import { Printer, Wifi, WifiOff, Loader2, PackagePlus, Droplets } from 'lucide-react';
import api from '../../api';
import { useRange } from '../../context/RangeContext';
import { useLiveQuery, errorMessage } from '../../hooks/useLiveQuery';
import { insights } from '../../services/insights.service';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { LiveIndicator } from '../../components/ui/LiveIndicator';
import { ErrorBanner } from '../../components/insights/InsightBits';
import { LevelBar } from '../../components/ui/shared';
import { describeRange } from '../../lib/dateRange';
import { inr, timeAgo } from '../../lib/format';
import type { KioskLive, PrinterInfo } from '../../types/insights.types';

/** Live machine status. Online = the Raspberry Pi sent a heartbeat in the last 5 minutes. */
export const KiosksPage: React.FC = () => {
  const { range, setRange, current } = useRange();
  // Machine health is always live, whatever range is selected for the activity numbers.
  const q = useLiveQuery(() => insights.kiosks(current()), [range], { live: true, intervalMs: 20000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const restock = async (printer: PrinterInfo, what: 'paper' | 'supply') => {
    const id = `${printer.key}:${what}`;
    setBusy(id);
    setActionError('');
    try {
      const patch = what === 'paper' ? { paperLevel: printer.paperCapacity } : printer.type === 'color' ? { inkLevel: 100 } : { tonerLevel: 100 };
      await api.post('/admin/hardware', { updates: { [printer.key]: patch } });
      q.refresh();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn font-sans select-none">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-1)]">Kiosk Network</h1>
            {q.data && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${q.data.summary.offline === 0 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/30'}`}>
                {q.data.summary.online}/{q.data.summary.total} online
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-2)] mt-1">Machine health, paper &amp; toner, and print activity for {describeRange(range).toLowerCase()}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LiveIndicator updatedAt={q.updatedAt} live fetching={q.fetching} onRefresh={q.refresh} />
          <DateRangePicker value={range} onChange={setRange} tone="admin" />
        </div>
      </div>

      {q.error && <ErrorBanner message={q.error} onRetry={q.refresh} />}
      {actionError && <ErrorBanner message={actionError} />}

      {q.loading && <div className="grid grid-cols-1 xl:grid-cols-2 gap-6"><div className="skeleton h-72" /><div className="skeleton h-72" /></div>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {q.data?.kiosks.map((k: KioskLive) => (
          <section key={k.kioskId} className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-[var(--primary-light)] text-[var(--primary)] flex items-center justify-center flex-shrink-0"><Printer size={20} /></div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-black text-[var(--text-1)]">{k.name}</h2>
                    <span className="font-mono text-xs text-[var(--text-3)]">{k.kioskId}</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${k.type === 'color' ? 'bg-fuchsia-500/10 text-fuchsia-600' : 'bg-slate-500/10 text-slate-500'}`}>{k.type === 'color' ? 'Colour' : 'B&W'}</span>
                  </div>
                  <p className="text-xs text-[var(--text-3)]">{k.description}</p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${k.online ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                {k.online ? <Wifi size={13} /> : <WifiOff size={13} />}{k.online ? 'Online' : 'Offline'}
              </span>
            </div>

            <div className="mt-3 text-xs text-[var(--text-2)]">
              <p><span className="text-[var(--text-3)]">Last heartbeat:</span> {k.lastSeen ? `${timeAgo(k.lastSeen)} (${new Date(k.lastSeen).toLocaleTimeString()})` : 'never'}</p>
              {k.printerStatus && <p className="mt-0.5 break-words"><span className="text-[var(--text-3)]">Printer status:</span> {k.printerStatus}</p>}
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[['Jobs', String(k.stats.jobs)], ['Printed', String(k.stats.completed)], ['Failed', String(k.stats.failed)], ['Revenue', inr(k.stats.revenue)]].map(([label, value]) => (
                <div key={label} className="p-3 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--border)]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)]">{label}</p>
                  <p className={`text-lg font-black tabular-nums ${label === 'Failed' && k.stats.failed > 0 ? 'text-rose-600' : 'text-[var(--text-1)]'}`}>{value}</p>
                </div>
              ))}
            </div>
            {(k.queue.paid + k.queue.printing) > 0 && (
              <p className="mt-3 text-xs font-bold text-amber-600 dark:text-amber-400">Queue: {k.queue.printing} printing · {k.queue.paid} waiting to be collected</p>
            )}

            <div className="mt-4 space-y-4">
              {k.printers.length === 0 && <p className="text-xs text-[var(--text-3)]">No paper/toner levels have been reported for this machine yet.</p>}
              {k.printers.map((p) => {
                const supply = p.tonerLevel ?? p.inkLevel;
                return (
                  <div key={p.key} className="p-3 rounded-xl border border-[var(--border)]">
                    <p className="text-[11px] font-bold text-[var(--text-2)] mb-2">{p.type === 'color' ? 'Colour printer' : 'B&W printer'} <span className="font-mono text-[var(--text-3)]">({p.key})</span></p>
                    {p.paperPct !== null && <LevelBar value={p.paperPct} label={`Paper tray · ${p.paperLevel}/${p.paperCapacity} sheets`} />}
                    {supply !== null && <div className="mt-3"><LevelBar value={supply} label={p.type === 'color' ? 'Ink reserve' : 'Toner'} /></div>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {p.paperPct !== null && (
                        <button type="button" disabled={busy !== null} onClick={() => restock(p, 'paper')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-2)] cursor-pointer disabled:opacity-50">
                          {busy === `${p.key}:paper` ? <Loader2 size={12} className="animate-spin" /> : <PackagePlus size={12} />} Paper refilled ({p.paperCapacity})
                        </button>
                      )}
                      {supply !== null && (
                        <button type="button" disabled={busy !== null} onClick={() => restock(p, 'supply')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-2)] cursor-pointer disabled:opacity-50">
                          {busy === `${p.key}:supply` ? <Loader2 size={12} className="animate-spin" /> : <Droplets size={12} />} {p.type === 'color' ? 'Ink' : 'Toner'} refilled
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};
