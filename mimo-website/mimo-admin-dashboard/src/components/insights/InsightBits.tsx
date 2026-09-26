import React, { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SeriesPoint, Summary } from '../../types/insights.types';
import { bucketLabel, pctChange } from '../../lib/dateRange';
import { inr, int } from '../../lib/format';

export type Tone = 'admin' | 'finance';

const T = {
  admin: { accent: '#6366f1', accent2: '#10b981', grid: '#94a3b833', axis: '#94a3b8', muted: 'text-[var(--text-3)]', text: 'text-[var(--text-1)]', sub: 'text-[var(--text-2)]', track: 'bg-[var(--surface-2)]', chip: 'bg-[var(--surface-2)] text-[var(--text-2)]', chipOn: 'bg-indigo-600 text-white' },
  finance: { accent: '#6D35E8', accent2: '#00C7F2', grid: '#EDE9FE', axis: '#94a3b8', muted: 'text-slate-400', text: 'text-[#19162D]', sub: 'text-slate-600', track: 'bg-[#F3EFFF]', chip: 'bg-[#F3EFFF] text-slate-600', chipOn: 'bg-[#6D35E8] text-white' },
} as const;

/** "▲ 12.5%" style badge. `goodWhenDown` flips the colour for things like refunds / failures. */
export const Delta: React.FC<{ current: number; previous?: number | null; goodWhenDown?: boolean; label?: string }> = ({ current, previous, goodWhenDown, label = 'vs previous period' }) => {
  const change = pctChange(current, previous);
  if (change === null) {
    return <span className="text-[11px] text-slate-400 font-medium">{previous === undefined || previous === null ? 'No comparison' : `New (was 0)`}</span>;
  }
  const up = change > 0;
  const flat = change === 0;
  const good = flat ? null : goodWhenDown ? !up : up;
  const color = flat ? 'bg-slate-100 text-slate-500 dark:bg-slate-800' : good ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400';
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-bold ${color}`}><Icon size={11} />{Math.abs(change)}%</span>
      {label}
    </span>
  );
};

type MetricKey = 'revenue' | 'orders' | 'pages' | 'jobs';
const METRICS: { key: MetricKey; label: string; fmt: (n: number) => string }[] = [
  { key: 'revenue', label: 'Revenue', fmt: inr },
  { key: 'orders', label: 'Orders', fmt: int },
  { key: 'pages', label: 'Pages', fmt: int },
  { key: 'jobs', label: 'Jobs', fmt: int },
];

/** Time-series for the selected range (hourly for ≤2 days, daily otherwise) with a metric switcher. */
export const TrendChart: React.FC<{ series: SeriesPoint[]; tone?: Tone; height?: number; metrics?: MetricKey[]; showRefunds?: boolean }> = ({ series, tone = 'admin', height = 260, metrics = ['revenue', 'orders', 'pages'], showRefunds = true }) => {
  const c = T[tone];
  const options = METRICS.filter((m) => metrics.includes(m.key));
  const [metric, setMetric] = useState<MetricKey>(options[0].key);
  const active = options.find((m) => m.key === metric) || options[0];
  const data = series.map((p) => ({ ...p, label: bucketLabel(p.key) }));
  const empty = series.every((p) => p.revenue === 0 && p.orders === 0 && p.pages === 0 && p.jobs === 0);
  const gid = `trend-${tone}-${active.key}`;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {options.map((m) => (
          <button key={m.key} type="button" onClick={() => setMetric(m.key)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${m.key === active.key ? c.chipOn : c.chip}`}>{m.label}</button>
        ))}
        {empty && <span className={`ml-2 text-[11px] ${c.muted}`}>No activity in this period</span>}
      </div>
      <div style={{ height }} aria-label={`${active.label} over time`} role="img">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.accent} stopOpacity={0.35} />
                <stop offset="100%" stopColor={c.accent} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: c.axis }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={{ fontSize: 10, fill: c.axis }} tickLine={false} axisLine={false} width={48} allowDecimals={false}
              tickFormatter={(v: number) => (active.key === 'revenue' ? `₹${v >= 1000 ? `${Math.round(v / 100) / 10}k` : v}` : v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))} />
            <Tooltip formatter={(v: number, name: string) => [name === 'refunds' ? inr(v) : active.fmt(v), name === 'refunds' ? 'Refunds' : active.label]}
              labelFormatter={(l: string) => l} contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid #e2e8f0' }} />
            <Area type="monotone" dataKey={active.key} stroke={c.accent} strokeWidth={2} fill={`url(#${gid})`} isAnimationActive={false} />
            {showRefunds && active.key === 'revenue' && <Area type="monotone" dataKey="refunds" stroke="#f43f5e" strokeDasharray="4 3" strokeWidth={1.5} fill="none" isAnimationActive={false} />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

interface Row { label: string; current: number; previous: number; fmt: (n: number) => string; goodWhenDown?: boolean }
const rowsFor = (cur: Summary, prev: Summary): Row[] => [
  { label: 'Revenue', current: cur.revenue, previous: prev.revenue, fmt: inr },
  { label: 'Orders', current: cur.orders, previous: prev.orders, fmt: int },
  { label: 'Pages printed', current: cur.pages, previous: prev.pages, fmt: int },
  { label: 'Refunds', current: cur.refundedAmount, previous: prev.refundedAmount, fmt: inr, goodWhenDown: true },
  { label: 'Failed prints', current: cur.failedJobs, previous: prev.failedJobs, fmt: int, goodWhenDown: true },
  { label: 'New users', current: cur.newUsers, previous: prev.newUsers, fmt: int },
];

/** Current period vs the equally long period right before it. */
export const PeriodComparison: React.FC<{ current: Summary; previous: Summary | null; tone?: Tone; previousLabel?: string }> = ({ current, previous, tone = 'admin', previousLabel = 'previous period' }) => {
  const c = T[tone];
  if (!previous) return <p className={`text-xs ${c.muted}`}>No comparison available for this range.</p>;
  return (
    <ul className="space-y-4">
      {rowsFor(current, previous).map((r) => {
        const max = Math.max(r.current, r.previous, 1);
        return (
          <li key={r.label}>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className={`font-bold ${c.text}`}>{r.label}</span>
              <Delta current={r.current} previous={r.previous} goodWhenDown={r.goodWhenDown} label="" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className={`flex-1 h-2 rounded-full overflow-hidden ${c.track}`}><div className="h-full rounded-full" style={{ width: `${(r.current / max) * 100}%`, background: c.accent }} /></div>
                <span className={`w-24 text-right text-[11px] font-bold tabular-nums ${c.text}`}>{r.fmt(r.current)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`flex-1 h-2 rounded-full overflow-hidden ${c.track}`}><div className="h-full rounded-full opacity-40" style={{ width: `${(r.previous / max) * 100}%`, background: c.accent }} /></div>
                <span className={`w-24 text-right text-[11px] font-medium tabular-nums ${c.muted}`}>{r.fmt(r.previous)}</span>
              </div>
            </div>
          </li>
        );
      })}
      <li className={`flex items-center gap-4 text-[10px] ${c.muted}`}>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: c.accent }} />Selected period</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm opacity-40" style={{ background: c.accent }} />{previousLabel}</span>
      </li>
    </ul>
  );
};

/** Inline error strip for a failed fetch (never silently show empty data). */
export const ErrorBanner: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div role="alert" className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 text-xs font-semibold">
    <span>Couldn't load live data: {message}</span>
    {onRetry && <button type="button" onClick={onRetry} className="px-3 py-1 rounded-lg bg-rose-600 text-white cursor-pointer">Retry</button>}
  </div>
);

export const TruncatedNote: React.FC<{ show?: boolean }> = ({ show }) =>
  show ? <p className="text-[11px] text-amber-600">Very large range: showing the first 5,000 records per collection. Narrow the dates for exact totals.</p> : null;
