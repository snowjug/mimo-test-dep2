import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Loader2, PackagePlus, Check, AlertTriangle } from 'lucide-react';
import api from '../../api';
import { useRange } from '../../context/RangeContext';
import { useTheme } from '../../context/ThemeContext';
import { useLiveQuery, errorMessage } from '../../hooks/useLiveQuery';
import { insights } from '../../services/insights.service';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { LiveIndicator } from '../../components/ui/LiveIndicator';
import { ErrorBanner } from '../../components/insights/InsightBits';
import { describeRange } from '../../lib/dateRange';
import { inr, int, timeAgo } from '../../lib/format';
import { MachineBadge, PrintHistoryList } from '../../components/history/PrintHistory';
import type { KioskLive, PrinterInfo } from '../../types/insights.types';
const RECENT_PRINTS = 6;
// Tray to refill when the Pi has not reported any printer for this kiosk yet.
const DEFAULT_TRAY: Record<string, string> = { 'CV-001': 'CV-001', 'SV-002': 'SV-002-BW' };
// Printer panel messages that are normal and not worth showing on the home page.
const NORMAL_PANEL = /^(ready|sleep|deep sleep|printing|please wait|warming up|cooling down)$/i;

/** Switch admin tab the same way the browser back button does (App listens to popstate). */
const goTo = (tab: string) => {
  window.history.pushState(null, '', `/admin/${tab}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

const Stat: React.FC<{ label: string; value: string; sub?: string; tone?: string; loading: boolean }> = ({ label, value, sub, tone = 'text-[var(--text-1)]', loading }) => (
  <div className="px-4 py-3.5 sm:px-5 sm:py-4">
    <p className="text-[12px] font-medium text-[var(--text-3)]">{label}</p>
    {loading ? <div className="skeleton mt-1.5 h-7 w-20" /> : <p className={`mt-0.5 text-[26px] font-bold leading-tight tabular-nums tracking-tight ${tone}`}>{value}</p>}
    {!loading && sub && <p className="mt-0.5 truncate text-[11px] text-[var(--text-3)]">{sub}</p>}
  </div>
);

/** "Refill paper": the first tap arms it, a second tap within 4 s records it, so a stray tap on a phone does nothing. */
const RefillButton: React.FC<{ kioskId: string; printerKey: string; onDone: () => void; onError: (m: string) => void }> = ({ kioskId, printerKey, onDone, onError }) => {
  const [state, setState] = useState<'idle' | 'armed' | 'saving' | 'done'>('idle');
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const tap = async () => {
    if (state === 'idle') {
      setState('armed');
      timer.current = window.setTimeout(() => setState('idle'), 4000);
      return;
    }
    if (state !== 'armed') return;
    if (timer.current) clearTimeout(timer.current);
    setState('saving');
    try {
      await api.post(`/admin/kiosks/${encodeURIComponent(kioskId)}/refill-paper`, { printerKey });
      setState('done');
      onDone();
      timer.current = window.setTimeout(() => setState('idle'), 2500);
    } catch (err) {
      setState('idle');
      onError(errorMessage(err));
    }
  };

  return (
    <button
      type="button"
      onClick={tap}
      disabled={state === 'saving'}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors active:scale-[0.98] ${
        state === 'armed' ? 'bg-amber-500 text-white' : state === 'done' ? 'bg-emerald-500 text-white' : 'bg-[var(--surface-2)] text-[var(--text-1)] hover:bg-[var(--border)]'
      }`}
    >
      {state === 'saving' ? <Loader2 size={13} className="animate-spin" /> : state === 'done' ? <Check size={13} /> : <PackagePlus size={13} />}
      {state === 'armed' ? 'Tap again to confirm' : state === 'done' ? 'Refilled' : 'Refill paper'}
    </button>
  );
};

const PaperTray: React.FC<{ k: KioskLive; p: PrinterInfo | null; trayKey: string; onChanged: () => void; onError: (m: string) => void }> = ({ k, p, trayKey, onChanged, onError }) => {
  const pct = p?.paperPct ?? null;
  const bar = pct === null ? 'bg-[var(--border)]' : pct < 15 ? 'bg-rose-500' : pct < 25 ? 'bg-amber-500' : 'bg-emerald-500';
  const label = p?.type === 'color' ? 'Colour tray' : k.kioskId === 'SV-002' ? 'B&W tray' : 'Paper';
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-2 text-[12px]">
          <span className="text-[var(--text-2)]">{label}</span>
          <span className="font-semibold tabular-nums text-[var(--text-1)]">
            {p && p.paperLevel !== null ? `${p.paperLevel} / ${p.paperCapacity}` : 'Not set'}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${pct ?? 0}%` }} />
        </div>
      </div>
      <RefillButton kioskId={k.kioskId} printerKey={trayKey} onDone={onChanged} onError={onError} />
    </div>
  );
};

export const OverviewPage: React.FC = () => {
  const { isDark } = useTheme();
  const { range, setRange, current, live } = useRange();
  const analytics = useLiveQuery(() => insights.analytics(current(), false), [range], { live });
  const kiosks = useLiveQuery(() => insights.kiosks(current()), [range], { live: true, intervalMs: 20000 });
  const jobs = useLiveQuery(() => insights.jobs(current(), { limit: 1000 }), [range], { live });
  const [actionError, setActionError] = useState('');

  const cur = analytics.data?.current;
  const list = jobs.data?.jobs ?? [];
  const refundedJobs = list.filter((j) => j.outcome === 'refunded' || j.status === 'refunded');
  const refundCount = Math.max(cur?.refundCount ?? 0, refundedJobs.length);
  const refundedAmount = Math.max(
    cur?.refundedAmount ?? 0,
    refundedJobs.reduce((s, j) => s + (j.refund?.amount ?? j.cost ?? 0), 0)
  );
  const printed = list.filter((j) => j.outcome === 'printed').length;
  const failed = list.filter((j) => j.outcome === 'failed').length;

  return (
    <div className="space-y-5 animate-fadeIn font-sans sm:space-y-6">
      {/* Clean Professional Greeting Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Hello, {isDark ? 'Ankit' : 'Vishal'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Network revenue &amp; operational performance
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveIndicator updatedAt={jobs.updatedAt} live={live} fetching={jobs.fetching || analytics.fetching} onRefresh={() => { analytics.refresh(); kiosks.refresh(); jobs.refresh(); }} />
          <DateRangePicker value={range} onChange={setRange} tone="admin" />
        </div>
      </div>

      {(analytics.error || jobs.error) && <ErrorBanner message={analytics.error || jobs.error || ''} onRetry={() => { analytics.refresh(); jobs.refresh(); }} />}
      {actionError && <ErrorBanner message={actionError} />}

      {/* The four numbers that matter, one grouped card */}
      <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] lg:grid-cols-4 [&>*]:border-[var(--border)] [&>*:nth-child(odd)]:border-r [&>*:nth-child(-n+2)]:border-b lg:[&>*]:border-b-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
        <Stat label="Revenue" loading={analytics.loading} value={cur ? inr(cur.revenue) : '—'} sub={refundedAmount > 0 ? `${inr(refundedAmount)} refunded` : 'No refunds'} />
        <Stat label="Pages printed" loading={analytics.loading} value={cur ? int(cur.pages) : '—'} sub={cur ? `${int(cur.bwPages)} B&W · ${int(cur.colorPages)} colour` : undefined} />
        <Stat label="Prints" loading={jobs.loading} value={int(list.length)} sub={`${printed} printed · ${failed} failed`} />
        <Stat label="Refunds" loading={jobs.loading && analytics.loading} value={cur || list.length ? inr(refundedAmount) : '—'} sub={refundCount > 0 ? `${refundCount} refund${refundCount === 1 ? '' : 's'}` : 'No refunds'} tone={refundedAmount > 0 ? 'text-blue-600 dark:text-blue-400' : undefined} />
      </div>

      {/* Machines */}
      <section>
        <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-[var(--text-3)]">Machines</h2>
        {kiosks.error && <ErrorBanner message={kiosks.error} onRetry={kiosks.refresh} />}
        <div className="grid gap-3 lg:grid-cols-2">
          {kiosks.loading && <><div className="skeleton h-32 rounded-2xl" /><div className="skeleton h-32 rounded-2xl" /></>}
          {kiosks.data?.kiosks.map((k) => {
            const trays = k.printers.filter((p) => {
              if (k.kioskId === 'SV-002' && (p.paperCapacity === 500 || p.key === 'SV-002' || p.printerId === 'SV-002')) {
                return false;
              }
              return p.paperPct !== null || p.type === 'bw' || p.type === 'color';
            });
            const panel = k.printers.map((p) => p.panelMessage).find((m) => m && !NORMAL_PANEL.test(m.trim()));
            const supplyLow = k.printers.find((p) => (p.tonerLevel ?? p.inkLevel ?? 100) <= 20);
            return (
              <div key={k.kioskId} className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex items-center gap-3">
                  <MachineBadge kioskId={k.kioskId} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-[var(--text-1)]">{k.name}</p>
                    <p className="text-[12px] text-[var(--text-3)]">
                      {k.online ? `${k.stats.jobs} prints · ${inr(k.stats.revenue)}` : `Last seen ${timeAgo(k.lastSeen)}`}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${k.online ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}>
                    <span className={`size-2 rounded-full ${k.online ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    {k.online ? 'Online' : 'Offline'}
                  </span>
                </div>
                {(panel || supplyLow) && (
                  <p className="flex items-center gap-1.5 rounded-xl bg-amber-500/10 px-3 py-2 text-[12px] font-semibold text-amber-700 dark:text-amber-400">
                    <AlertTriangle size={13} /> {panel ? `Printer shows: ${panel}` : `${supplyLow!.type === 'color' ? 'Ink' : 'Toner'} is low`}
                  </p>
                )}
                {(trays.length ? trays : [null]).map((p) => (
                  <PaperTray key={p?.key ?? 'default'} k={k} p={p} trayKey={p?.key ?? DEFAULT_TRAY[k.kioskId] ?? k.kioskId}
                    onChanged={kiosks.refresh} onError={setActionError} />
                ))}
              </div>
            );
          })}
        </div>
      </section>

      {/* Recent prints */}
      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-3)]">Recent prints</h2>
          <button type="button" onClick={() => goTo('operations')} className="inline-flex items-center text-[13px] font-semibold text-[var(--primary)]">
            See all <ChevronRight size={15} />
          </button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          {jobs.loading ? <div className="skeleton h-48" /> : <PrintHistoryList jobs={list.slice(0, RECENT_PRINTS)} emptyText="No prints yet" />}
        </div>
      </section>
    </div>
  );
};
