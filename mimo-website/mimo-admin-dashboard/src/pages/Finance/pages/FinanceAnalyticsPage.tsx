import React from 'react';
import { IndianRupee, TrendingUp, Layers, Printer, Download, Clock } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FinanceMetricCard } from '../components/FinanceMetricCard';
import { FinanceChartCard } from '../components/FinanceChartCard';
import { ErrorBanner, PeriodComparison, TrendChart, TruncatedNote } from '../../../components/insights/InsightBits';
import { useRange } from '../../../context/RangeContext';
import { bucketLabel, describeRange, pctChange } from '../../../lib/dateRange';
import { inr, int } from '../../../lib/format';
import type { Analytics } from '../../../types/insights.types';

export interface FinanceAnalyticsPageProps {
  analytics: Analytics | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

const COLORS = ['#6D35E8', '#00C7F2', '#10B981', '#F59E0B'];
const chg = (cur: number, prev?: number | null) => {
  const c = pctChange(cur, prev);
  if (c === null) return prev === 0 && cur > 0 ? { change: 'New', trend: 'up' as const } : {};
  return { change: `${Math.abs(c)}%`, trend: (c > 0 ? 'up' : c < 0 ? 'down' : 'neutral') as 'up' | 'down' | 'neutral' };
};

export const FinanceAnalyticsPage: React.FC<FinanceAnalyticsPageProps> = ({ analytics: a, loading, error, onRefresh }) => {
  const { range } = useRange();
  const cur = a?.current;
  const prev = a?.previous?.summary;
  const machines = a?.byKiosk.length || 1;
  const revenueBars = (a?.series ?? []).map((p) => ({ label: bucketLabel(p.key), Revenue: p.revenue, Refunds: p.refunds }));
  const modePie = a ? [{ name: 'Colour', value: a.modes.color.pages }, { name: 'Black & white', value: a.modes.bw.pages }].filter((m) => m.value > 0) : [];
  const busiest = a ? [...a.byHour].sort((x, y) => y.jobs - x.jobs)[0] : null;

  const exportCsv = () => {
    if (!a) return;
    const rows = [['Bucket', 'Revenue', 'Refunds', 'Orders', 'Jobs', 'Pages'], ...a.series.map((p) => [p.key, p.revenue, p.refunds, p.orders, p.jobs, p.pages])];
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' }));
    link.download = `MIMO_Revenue_Analytics_${a.range.from.slice(0, 10)}_${a.range.to.slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-[#19162D] tracking-tight">Revenue Analytics</h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">Trends, machine performance and peak demand · {describeRange(range)}</p>
        </div>
        <button type="button" onClick={exportCsv} disabled={!a} className="px-4 py-2.5 text-xs font-bold text-white bg-[#6D35E8] hover:bg-[#5b29c9] rounded-xl flex items-center gap-2 cursor-pointer disabled:opacity-50 self-start"><Download className="w-3.5 h-3.5" /> Export CSV</button>
      </div>

      {error && <ErrorBanner message={error} onRetry={onRefresh} />}
      <TruncatedNote show={a?.truncated} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <FinanceMetricCard title="Gross Revenue" value={cur ? inr(cur.revenue) : '—'} {...chg(cur?.revenue ?? 0, prev?.revenue)} icon={<IndianRupee className="w-5 h-5" />} loading={loading} />
        <FinanceMetricCard title="Net Revenue" value={cur ? inr(cur.netRevenue) : '—'} {...chg(cur?.netRevenue ?? 0, prev?.netRevenue)} icon={<TrendingUp className="w-5 h-5" />} iconBgColor="bg-indigo-50" iconColor="text-indigo-600" loading={loading} />
        <FinanceMetricCard title="Avg Order Value" value={cur ? inr(cur.avgOrderValue) : '—'} {...chg(cur?.avgOrderValue ?? 0, prev?.avgOrderValue)} icon={<Layers className="w-5 h-5" />} iconBgColor="bg-cyan-50" iconColor="text-cyan-600" loading={loading} />
        <FinanceMetricCard title="Revenue per Machine" value={inr((cur?.revenue ?? 0) / machines)} change={`${machines} machines`} comparisonText="" icon={<Printer className="w-5 h-5" />} iconBgColor="bg-emerald-50" iconColor="text-emerald-600" loading={loading} />
        <FinanceMetricCard title="Busiest Hour" value={busiest && busiest.jobs > 0 ? `${busiest.hour % 12 === 0 ? 12 : busiest.hour % 12}${busiest.hour < 12 ? ' am' : ' pm'}` : '—'} change={busiest && busiest.jobs > 0 ? `${busiest.jobs} jobs` : undefined} comparisonText="" icon={<Clock className="w-5 h-5" />} iconBgColor="bg-amber-50" iconColor="text-amber-600" loading={loading} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <FinanceChartCard title="Revenue over time" subtitle={a ? `${a.range.granularity === 'hour' ? 'Hourly' : 'Daily'} totals` : undefined} className="xl:col-span-2">
          {a ? <TrendChart series={a.series} tone="finance" metrics={['revenue', 'orders', 'pages']} height={280} /> : <div className="h-72 bg-slate-50 rounded-xl animate-pulse" />}
        </FinanceChartCard>
        <FinanceChartCard title="Selected period vs previous" subtitle="Same number of days right before">
          {a ? <PeriodComparison current={a.current} previous={prev ? prev : null} tone="finance" /> : <div className="h-72 bg-slate-50 rounded-xl animate-pulse" />}
        </FinanceChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
        <FinanceChartCard title="Revenue vs refunds" subtitle="Money in and money returned">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueBars} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EDE9FE" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip formatter={(v: number) => inr(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Revenue" fill="#6D35E8" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="Refunds" fill="#F43F5E" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </FinanceChartCard>

        <FinanceChartCard title="Colour vs black & white" subtitle="Printed pages">
          {modePie.length === 0 ? <p className="py-16 text-center text-xs font-semibold text-slate-400">No printed pages in this period</p> : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={modePie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3} isAnimationActive={false}>
                    {modePie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${int(v)} pages`} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </FinanceChartCard>

        <FinanceChartCard title="Machine performance" subtitle="Revenue, pages and failures">
          {!a ? <div className="h-40 bg-slate-50 rounded-xl animate-pulse" /> : (
            <ul className="space-y-4">
              {a.byKiosk.map((k) => (
                <li key={k.kioskId} className="p-3 rounded-xl border border-[#EDE9FE]">
                  <div className="flex justify-between"><span className="text-sm font-bold text-slate-800">{k.name} <span className="font-mono text-xs text-slate-400">{k.kioskId}</span></span><span className="font-black font-mono text-slate-900">{inr(k.revenue)}</span></div>
                  <p className="text-[11px] text-slate-500 mt-1">{k.jobs} jobs · {k.completed} printed · {int(k.pages)} pages · {k.failed} failed</p>
                </li>
              ))}
            </ul>
          )}
        </FinanceChartCard>

        <FinanceChartCard title="Peak hours" subtitle="Print jobs by hour of day (local time)" className="lg:col-span-2 xl:col-span-3">
          {!a || a.byHour.every((h) => h.jobs === 0) ? <p className="py-12 text-center text-xs font-semibold text-slate-400">No print jobs in this period</p> : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={a.byHour} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EDE9FE" vertical={false} />
                  <XAxis dataKey="hour" tickFormatter={(h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={1} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip labelFormatter={(h: number) => `${h}:00 – ${h}:59`} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="jobs" name="Jobs" fill="#6D35E8" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </FinanceChartCard>
      </div>
    </div>
  );
};
