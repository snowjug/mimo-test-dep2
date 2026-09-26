import React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import { useRange } from '../../context/RangeContext';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { insights } from '../../services/insights.service';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { LiveIndicator } from '../../components/ui/LiveIndicator';
import { Delta, ErrorBanner, PeriodComparison, TrendChart, TruncatedNote } from '../../components/insights/InsightBits';
import { describeRange } from '../../lib/dateRange';
import { inr, int, pct } from '../../lib/format';
import type { Analytics } from '../../types/insights.types';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6'];

const Card: React.FC<{ title: string; subtitle?: string; className?: string; children: React.ReactNode }> = ({ title, subtitle, className = '', children }) => (
  <section className={`p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs ${className}`}>
    <h2 className="text-sm font-bold text-[var(--text-1)]">{title}</h2>
    {subtitle && <p className="text-xs text-[var(--text-3)] mt-0.5">{subtitle}</p>}
    <div className="mt-4">{children}</div>
  </section>
);
const NoData: React.FC<{ text?: string }> = ({ text = 'No data in this period' }) => <p className="py-10 text-center text-xs font-semibold text-[var(--text-3)]">{text}</p>;

const exportCsv = (a: Analytics) => {
  const rows = [['Period', a.range.from, a.range.to], [], ['Bucket', 'Revenue', 'Refunds', 'Orders', 'Jobs', 'Pages', 'Failed'],
    ...a.series.map((p) => [p.key, p.revenue, p.refunds, p.orders, p.jobs, p.pages, p.failed])];
  const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `mimo-analytics-${a.range.from.slice(0, 10)}_${a.range.to.slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const AnalyticsPage: React.FC = () => {
  const { range, setRange, current, live } = useRange();
  const q = useLiveQuery(() => insights.analytics(current()), [range], { live });
  const a = q.data;

  const hours = a?.byHour.filter((h) => h.jobs > 0) ?? [];
  const modePie = a ? [
    { name: 'Colour', value: a.modes.color.pages },
    { name: 'Black & white', value: a.modes.bw.pages },
  ].filter((m) => m.value > 0) : [];
  const sidePie = a ? [
    { name: 'Double-sided', value: a.modes.duplex.pages },
    { name: 'Single-sided', value: a.modes.simplex.pages },
  ].filter((m) => m.value > 0) : [];

  return (
    <div className="space-y-6 animate-fadeIn font-sans select-none">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-1)]">Analytics &amp; Reports</h1>
          <p className="text-xs sm:text-sm text-[var(--text-2)] mt-1">Demand, utilisation and payment mix · {describeRange(range)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LiveIndicator updatedAt={q.updatedAt} live={live} fetching={q.fetching} onRefresh={q.refresh} />
          <DateRangePicker value={range} onChange={setRange} tone="admin" />
          <button type="button" disabled={!a} onClick={() => a && exportCsv(a)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-2)] cursor-pointer disabled:opacity-50">
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {q.error && <ErrorBanner message={q.error} onRetry={q.refresh} />}
      <TruncatedNote show={a?.truncated} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Revenue', value: a ? inr(a.current.revenue) : '', cur: a?.current.revenue, prev: a?.previous?.summary.revenue },
          { label: 'Pages printed', value: a ? int(a.current.pages) : '', cur: a?.current.pages, prev: a?.previous?.summary.pages },
          { label: 'Print success rate', value: a ? pct(a.current.successRate) : '', cur: null, prev: null },
          { label: 'Avg order value', value: a ? inr(a.current.avgOrderValue) : '', cur: a?.current.avgOrderValue, prev: a?.previous?.summary.avgOrderValue },
        ].map((k) => (
          <div key={k.label} className="p-4 sm:p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
            <span className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">{k.label}</span>
            {q.loading ? <div className="skeleton h-8 w-24 mt-3" /> : <p className="text-2xl sm:text-3xl font-black text-[var(--text-1)] mt-2 tabular-nums">{k.value}</p>}
            <div className="mt-1.5 min-h-[16px]">{!q.loading && k.cur !== null && k.cur !== undefined && <Delta current={k.cur} previous={k.prev} />}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2" title="Trend" subtitle={a ? `${a.range.granularity === 'hour' ? 'Hourly' : 'Daily'} totals for the selected dates` : undefined}>
          {a ? <TrendChart series={a.series} tone="admin" metrics={['revenue', 'orders', 'pages', 'jobs']} height={360} /> : <div className="skeleton h-[320px]" />}
        </Card>
        <Card title="Selected period vs previous" subtitle="The previous period is the same number of days immediately before">
          {a ? <PeriodComparison current={a.current} previous={a.previous?.summary ?? null} tone="admin" /> : <div className="skeleton h-72" />}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <Card title="Pages per machine" subtitle="Printed pages, revenue and failures by kiosk">
          {!a ? <div className="skeleton h-56" /> : (
            <>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={a.byKiosk} margin={{ left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
                    <XAxis dataKey="kioskId" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Bar dataKey="pages" name="Pages" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                      {a.byKiosk.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-3 space-y-1.5 text-xs">
                {a.byKiosk.map((k) => (
                  <li key={k.kioskId} className="flex items-center justify-between gap-3 text-[var(--text-2)]">
                    <span><b className="text-[var(--text-1)]">{k.name}</b> <span className="font-mono text-[var(--text-3)]">{k.kioskId}</span></span>
                    <span className="tabular-nums">{int(k.pages)} pages · {inr(k.revenue)}{k.failed > 0 && <span className="text-rose-600"> · {k.failed} failed</span>}</span>
                  </li>
                ))}
                {a.unassignedRevenue > 0 && <li className="text-[11px] text-[var(--text-3)]">{inr(a.unassignedRevenue)} of revenue could not be tied to a machine.</li>}
              </ul>
            </>
          )}
        </Card>

        <Card title="Colour vs black &amp; white" subtitle="Share of printed pages">
          {!a ? <div className="skeleton h-56" /> : modePie.length === 0 ? <NoData /> : (
            <MiniPie data={modePie} />
          )}
        </Card>

        <Card title="Single vs double-sided" subtitle="Share of printed pages">
          {!a ? <div className="skeleton h-56" /> : sidePie.length === 0 ? <NoData /> : (
            <MiniPie data={sidePie} />
          )}
        </Card>

        <Card title="Peak hours" subtitle="Print jobs by hour of day (your local time)" className="lg:col-span-2">
          {!a ? <div className="skeleton h-56" /> : hours.length === 0 ? <NoData /> : (
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={a.byHour} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
                  <XAxis dataKey="hour" tickFormatter={(h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={1} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip labelFormatter={(h: number) => `${h}:00 – ${h}:59`} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="jobs" name="Jobs" fill="#6366f1" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Payment methods" subtitle="Paid orders by how customers paid">
          {!a ? <div className="skeleton h-56" /> : a.byPaymentMethod.length === 0 ? <NoData /> : (
            <ul className="space-y-3">
              {a.byPaymentMethod.map((m, i) => {
                const total = a.byPaymentMethod.reduce((x, y) => x + y.count, 0) || 1;
                return (
                  <li key={m.method}>
                    <div className="flex justify-between text-xs mb-1"><span className="font-bold text-[var(--text-1)]">{m.method}</span><span className="text-[var(--text-2)] tabular-nums">{m.count} orders · {inr(m.amount)}</span></div>
                    <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(m.count / total) * 100}%`, background: COLORS[i % COLORS.length] }} /></div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Job outcomes" subtitle="Where this period's print jobs ended up" className="lg:col-span-2 xl:col-span-3">
          {!a ? <div className="skeleton h-16" /> : a.byStatus.length === 0 ? <NoData /> : (
            <div className="flex flex-wrap gap-3">
              {a.byStatus.sort((x, y) => y.count - x.count).map((s) => (
                <div key={s.status} className="px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/50 min-w-[110px]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)] capitalize">{s.status}</p>
                  <p className="text-xl font-black text-[var(--text-1)] tabular-nums">{int(s.count)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

const MiniPie: React.FC<{ data: { name: string; value: number }[] }> = ({ data }) => {
  const total = data.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <div className="flex items-center gap-4">
      <div style={{ width: 150, height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={2} isAnimationActive={false}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: number) => `${int(v)} pages`} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-2 text-xs">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2 text-[var(--text-2)]">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="font-bold text-[var(--text-1)]">{d.name}</span> {Math.round((d.value / total) * 100)}% <span className="text-[var(--text-3)]">({int(d.value)})</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
