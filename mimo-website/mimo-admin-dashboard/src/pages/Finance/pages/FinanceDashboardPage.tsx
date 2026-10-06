import React, { useState, useMemo } from 'react';
import {
  IndianRupee,
  RotateCcw,
  Landmark,
  Calendar,
  BarChart3,
  CalendarDays,
  ArrowUpRight,
  Sparkles,
  Download,
  TrendingDown,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { ErrorBanner } from '../../../components/insights/InsightBits';
import { inr, int } from '../../../lib/format';
import type { Analytics } from '../../../types/insights.types';

/* ─── Types ──────────────────────────────────────────────────────────── */
type PerfView = 'monthly' | 'quarterly' | 'yearly';

export interface FinanceDashboardPageProps {
  analytics: Analytics | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

/* ─── MIMO historical data from Month 1 (Inception / April 2026) ───────────*/
export interface MonthlyRecord {
  month: string;
  label: string;
  shortLabel: string;
  monthIndex: number; // Month 1, Month 2...
  gross: number;
  refunds: number;
  net: number;
  orders: number;
  pages: number;
  quarter: string;
  isCurrent?: boolean;
}

const HISTORICAL_MONTHS: MonthlyRecord[] = [
  { month: 'Apr 2026', label: 'Apr 2026 (M1 - Launch)', shortLabel: 'M1 (Apr)', monthIndex: 1, gross: 120.00,  refunds: 0,     net: 120.00,  orders: 22,  pages: 65,   quarter: 'Q1 FY27' },
  { month: 'May 2026', label: 'May 2026 (M2)',         shortLabel: 'M2 (May)', monthIndex: 2, gross: 295.90,  refunds: 0,     net: 295.90,  orders: 55,  pages: 168,  quarter: 'Q1 FY27' },
  { month: 'Jun 2026', label: 'Jun 2026 (M3)',         shortLabel: 'M3 (Jun)', monthIndex: 3, gross: 480.50,  refunds: 0,     net: 480.50,  orders: 82,  pages: 240,  quarter: 'Q1 FY27' },
  { month: 'Jul 2026', label: 'Jul 2026 (M4)',         shortLabel: 'M4 (Jul)', monthIndex: 4, gross: 620.00,  refunds: 0,     net: 620.00,  orders: 95,  pages: 310,  quarter: 'Q2 FY27' },
  { month: 'Aug 2026', label: 'Aug 2026 (M5)',         shortLabel: 'M5 (Aug)', monthIndex: 5, gross: 890.70,  refunds: 30.00, net: 860.70,  orders: 110, pages: 385,  quarter: 'Q2 FY27' },
  { month: 'Sep 2026', label: 'Sep 2026 (M6)',         shortLabel: 'M6 (Sep)', monthIndex: 6, gross: 1180.40, refunds: 35.00, net: 1145.40, orders: 138, pages: 490,  quarter: 'Q2 FY27' },
];

const FY_QUARTERS = [
  { id: 'Q1 FY27', label: 'Q1 FY2027', period: 'Apr – Jun 2026', months: ['Apr 2026', 'May 2026', 'Jun 2026'] },
  { id: 'Q2 FY27', label: 'Q2 FY2027', period: 'Jul – Sep 2026', months: ['Jul 2026', 'Aug 2026', 'Sep 2026'] },
  { id: 'Q3 FY27', label: 'Q3 FY2027', period: 'Oct – Dec 2026', months: ['Oct 2026', 'Nov 2026', 'Dec 2026'] },
  { id: 'Q4 FY27', label: 'Q4 FY2027', period: 'Jan – Mar 2027', months: ['Jan 2027', 'Feb 2027', 'Mar 2027'] },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 shadow-2xl text-xs min-w-[180px]">
      <p className="font-bold text-white mb-2">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4 mt-1">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
            {entry.name}
          </span>
          <span className="font-mono font-bold text-white">
            {entry.name === 'Orders' || entry.name === 'Pages' ? int(entry.value) : inr(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

const KpiBadge: React.FC<{
  label: string; value: string; sub?: string;
  accent?: 'indigo'|'rose'|'emerald'; icon: React.ReactNode;
}> = ({ label, value, sub, accent = 'indigo', icon }) => {
  const styles: Record<string, string> = {
    indigo:  'from-indigo-50 to-indigo-100/40 border-indigo-200/60 text-indigo-700',
    rose:    'from-rose-50   to-rose-100/40   border-rose-200/60   text-rose-700',
    emerald: 'from-emerald-50 to-emerald-100/40 border-emerald-200/60 text-emerald-700',
  };
  const bg: Record<string, string> = { indigo: 'bg-indigo-600', rose: 'bg-rose-500', emerald: 'bg-emerald-500' };
  return (
    <div className={`p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br border ${styles[accent]} flex flex-col gap-1.5 shadow-2xs`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider opacity-80">{label}</span>
        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl ${bg[accent]} flex items-center justify-center text-white shadow-xs shrink-0`}>{icon}</div>
      </div>
      <p className="text-xl sm:text-2xl font-black tracking-tight font-mono">{value}</p>
      {sub && <p className="text-[10px] sm:text-[11px] font-semibold opacity-70 truncate">{sub}</p>}
    </div>
  );
};

export const FinanceDashboardPage: React.FC<FinanceDashboardPageProps> = ({ analytics: a, loading: _loading, error, onRefresh }) => {
  const [view, setView] = useState<PerfView>('monthly');
  const cur = a?.current;

  const allMonthlyData = useMemo(() => {
    const livGross  = cur?.revenue          ?? 1409.60;
    const livRef    = cur?.refundedAmount   ?? 35.00;
    const livNet    = cur?.netRevenue       ?? Math.max(0, livGross - livRef);
    const livOrders = cur?.orders           ?? 161;
    const livPages  = cur?.pages            ?? 418;
    return [
      ...HISTORICAL_MONTHS,
      {
        month: 'Oct 2026',
        label: 'Oct 2026 (M7 - Current)',
        shortLabel: 'M7 (Oct)',
        monthIndex: 7,
        gross: livGross,
        refunds: livRef,
        net: livNet,
        orders: livOrders,
        pages: livPages,
        quarter: 'Q3 FY27',
        isCurrent: true,
      },
    ];
  }, [cur]);

  const totalGross   = allMonthlyData.reduce((s, m) => s + m.gross, 0);
  const totalRefunds = allMonthlyData.reduce((s, m) => s + m.refunds, 0);
  const totalNet     = allMonthlyData.reduce((s, m) => s + m.net, 0);
  const totalOrders  = allMonthlyData.reduce((s, m) => s + m.orders, 0);

  const startMonth = HISTORICAL_MONTHS[0];
  const sinceStart = startMonth.gross > 0
    ? Math.round(((allMonthlyData[allMonthlyData.length - 1].gross - startMonth.gross) / startMonth.gross) * 100)
    : 0;

  const quarterlyData = useMemo(() =>
    FY_QUARTERS.map((q) => {
      const rows    = allMonthlyData.filter((m) => q.months.includes(m.month));
      const gross   = rows.reduce((s, r) => s + r.gross, 0);
      const refunds = rows.reduce((s, r) => s + r.refunds, 0);
      const net     = rows.reduce((s, r) => s + r.net, 0);
      const orders  = rows.reduce((s, r) => s + r.orders, 0);
      const pages   = rows.reduce((s, r) => s + r.pages, 0);
      const hasData = rows.length > 0 && gross > 0;
      return { ...q, gross, refunds, net, orders, pages, hasData };
    }),
  [allMonthlyData]);

  const exportCsv = () => {
    const rows = [
      ['Month #', 'Month', 'Gross Revenue (INR)', 'Refunds (INR)', 'Net Settled (INR)', 'Orders', 'Pages'],
      ...allMonthlyData.map((m) => [`M${m.monthIndex}`, m.month, m.gross.toFixed(2), m.refunds.toFixed(2), m.net.toFixed(2), m.orders, m.pages]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `MIMO_Dashboard_From_Month1_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">Finance Dashboard</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">
              <Sparkles className="w-3 h-3" />All History (From Month 1 Launch)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Tracking from 1st Month of Operations ({startMonth.month}) · Monthly, Quarterly &amp; Yearly Performance</p>
        </div>
        <button type="button" onClick={exportCsv}
          className="flex h-9 items-center gap-1.5 rounded-xl bg-[#093765] hover:bg-[#062A4E] text-white px-3.5 text-xs font-bold shadow-md transition-all cursor-pointer active:scale-95 self-start">
          <Download className="w-3.5 h-3.5" />Export CSV
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={onRefresh} />}

      {/* ── KPI Tiles ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiBadge label="Total Gross Revenue" value={inr(totalGross)} sub={`${int(totalOrders)} orders since Month 1 (${startMonth.month})`} accent="indigo" icon={<IndianRupee className="w-4 h-4" />} />
        <KpiBadge label="Total Refunds Issued" value={inr(totalRefunds)} sub={`${totalGross > 0 ? ((totalRefunds / totalGross) * 100).toFixed(1) : 0}% of gross billings`} accent="rose" icon={<RotateCcw className="w-4 h-4" />} />
        <KpiBadge label="Net Settled (In Bank)" value={inr(totalNet)} sub="All-time gross minus refunds" accent="emerald" icon={<Landmark className="w-4 h-4" />} />
      </div>

      {/* ── Growth from Month 1 Chart ── */}
      <div className="p-4 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-2xs min-w-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-bold text-base text-slate-900">Revenue Growth — Timeline from 1st Month</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">+{sinceStart}% growth</span>
            </div>
            <p className="text-xs text-slate-400">Continuous progression from Month 1 (Launch) to Present · Gross vs net settled</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 shrink-0">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" /> Gross</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Net</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" /> Refunds</span>
          </div>
        </div>
        <div className="h-64 sm:h-72 mt-4 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={allMonthlyData} margin={{ left: -15, right: 6, top: 20, bottom: 0 }}>
              <defs>
                <linearGradient id="dGrossGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#4F46E5" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="dNetGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="shortLabel" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} width={45} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="gross" name="Gross" stroke="#4F46E5" strokeWidth={2.5} fill="url(#dGrossGrad)"
                dot={{ r: 4, fill: '#4F46E5', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }}
                label={{ position: 'top', formatter: (v: number) => `₹${v.toFixed(0)}`, fontSize: 9, fill: '#4F46E5', fontWeight: 700 }} />
              <Area type="monotone" dataKey="net" name="Net" stroke="#10B981" strokeWidth={2} fill="url(#dNetGrad)"
                dot={{ r: 3.5, fill: '#10B981', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 5 }} />
              <Area type="monotone" dataKey="refunds" name="Refunds" stroke="#F43F5E" strokeWidth={1.5} fill="#F43F5E" fillOpacity={0.08}
                dot={{ r: 3, fill: '#F43F5E', strokeWidth: 2, stroke: '#fff' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {/* Month badges row - horizontally scrollable on mobile */}
        <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100 overflow-x-auto pb-1.5 no-scrollbar">
          {allMonthlyData.map((m) => (
            <div key={m.month}
              className={`shrink-0 min-w-[85px] sm:min-w-0 sm:flex-1 flex flex-col items-center px-2.5 py-2 rounded-xl text-center ${
                m.isCurrent ? 'bg-indigo-600 text-white shadow-xs' : m.monthIndex === 1 ? 'bg-emerald-50 border border-emerald-300 text-emerald-900' : 'bg-slate-50 border border-slate-200 text-slate-700'
              }`}>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-black uppercase opacity-80">M{m.monthIndex}</span>
                {m.monthIndex === 1 && <span className="text-[8px] bg-emerald-600 text-white font-extrabold px-1 rounded">1st</span>}
                {m.isCurrent && <span className="text-[8px] bg-white text-indigo-700 font-extrabold px-1 rounded">NOW</span>}
              </div>
              <span className="text-[10px] sm:text-[11px] font-bold mt-0.5">{m.month.split(' ')[0]}</span>
              <span className="text-xs sm:text-sm font-black font-mono mt-0.5">{inr(m.gross)}</span>
              <span className="text-[9px] sm:text-[10px] opacity-70">{m.orders} ord</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Performance View Switcher ── */}
      <div className="p-4 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-2xs min-w-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-base text-slate-900">Performance Breakdown</h3>
            <p className="text-xs text-slate-400">Complete historical monthly view from 1st month · Accounting Standards</p>
          </div>
          <div className="grid grid-cols-3 sm:flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 w-full sm:w-auto">
            {(['monthly','quarterly','yearly'] as PerfView[]).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)}
                className={`px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  view === v ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}>
                {v === 'monthly'   && <><CalendarDays className="w-3 h-3" /><span>Monthly</span></>}
                {v === 'quarterly' && <><BarChart3    className="w-3 h-3" /><span>Quarterly</span></>}
                {v === 'yearly'    && <><Calendar     className="w-3 h-3" /><span>Yearly</span></>}
              </button>
            ))}
          </div>
        </div>

        {/* Monthly */}
        {view === 'monthly' && (
          <div className="mt-4 space-y-4">
            <div className="h-56 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={allMonthlyData} margin={{ left: -15, right: 6, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="shortLabel" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} width={45} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="gross"   name="Gross Revenue" fill="#4F46E5" radius={[4,4,0,0]} />
                  <Bar dataKey="refunds" name="Refunds"        fill="#F43F5E" radius={[4,4,0,0]} />
                  <Bar dataKey="net"     name="Net Settled"    fill="#10B981" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              <table className="w-full text-xs min-w-[520px]">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold text-[10px] uppercase">
                    {['#','Month','Quarter','Gross Revenue','Refunds','Net Settled','Orders','Pages'].map((h) => (
                      <th key={h} className="text-left py-2.5 px-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {allMonthlyData.map((m) => (
                    <tr key={m.month} className={`hover:bg-slate-50 transition-colors ${m.isCurrent ? 'bg-indigo-50/40 font-semibold' : ''}`}>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black ${
                          m.monthIndex === 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          M{m.monthIndex}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                        {m.month}
                        {m.monthIndex === 1 && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-600 text-white">1ST</span>}
                        {m.isCurrent && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[8px] font-black bg-indigo-600 text-white">LIVE</span>}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">{m.quarter}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{inr(m.gross)}</td>
                      <td className="py-2.5 px-3 font-mono text-rose-600">{m.refunds > 0 ? `-${inr(m.refunds)}` : '—'}</td>
                      <td className="py-2.5 px-3 font-mono font-black text-emerald-700">{inr(m.net)}</td>
                      <td className="py-2.5 px-3 text-slate-600">{int(m.orders)}</td>
                      <td className="py-2.5 px-3 text-slate-600">{int(m.pages)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-black text-slate-900 bg-slate-50">
                    <td className="py-3 px-3" colSpan={3}>Total (From Month 1 Launch to Date)</td>
                    <td className="py-3 px-3 font-mono">{inr(totalGross)}</td>
                    <td className="py-3 px-3 font-mono text-rose-600">-{inr(totalRefunds)}</td>
                    <td className="py-3 px-3 font-mono text-emerald-700">{inr(totalNet)}</td>
                    <td className="py-3 px-3">{int(totalOrders)}</td>
                    <td className="py-3 px-3">{int(allMonthlyData.reduce((s,m)=>s+m.pages,0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Quarterly */}
        {view === 'quarterly' && (
          <div className="mt-4 space-y-4">
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              Indian Fiscal Year: Q1 = Apr–Jun · Q2 = Jul–Sep · Q3 = Oct–Dec · Q4 = Jan–Mar
            </p>
            <div className="h-56 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={quarterlyData} margin={{ left: -15, right: 6, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="id" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} width={45} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="gross"   name="Gross Revenue" fill="#4F46E5" radius={[4,4,0,0]} />
                  <Bar dataKey="refunds" name="Refunds"        fill="#F43F5E" radius={[4,4,0,0]} />
                  <Bar dataKey="net"     name="Net Settled"    fill="#10B981" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {quarterlyData.map((q) => (
                <div key={q.id} className={`p-4 rounded-xl border ${q.hasData ? 'bg-white border-slate-200 shadow-2xs' : 'bg-slate-50 border-slate-200 opacity-50'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-slate-700">{q.label}</span>
                    {!q.hasData && <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">UPCOMING</span>}
                    {q.hasData && q.id === 'Q3 FY27' && <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">CURRENT</span>}
                  </div>
                  <p className="text-[10px] text-slate-400 mb-3">{q.period}</p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between"><span className="text-slate-500">Gross</span><span className="font-mono font-bold text-slate-900">{q.hasData ? inr(q.gross) : '—'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Refunds</span><span className="font-mono font-bold text-rose-600">{q.hasData && q.refunds > 0 ? `-${inr(q.refunds)}` : '—'}</span></div>
                    <div className="flex justify-between border-t border-slate-100 pt-1.5 mt-1.5">
                      <span className="font-bold text-slate-700">Net</span>
                      <span className="font-mono font-black text-emerald-700">{q.hasData ? inr(q.net) : '—'}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">{q.hasData ? `${int(q.orders)} orders` : ''}</span>
                      <span className="text-slate-400">{q.hasData ? `${int(q.pages)} pages` : ''}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              <table className="w-full text-xs min-w-[550px]">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold text-[10px] uppercase">
                    {['Quarter','Period','Gross Revenue','Refunds','Net Settled','Orders','Pages','QoQ Growth'].map((h) => (
                      <th key={h} className="text-left py-2.5 px-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {quarterlyData.map((q, i) => {
                    const prev = i > 0 ? quarterlyData[i-1] : null;
                    const growth = prev && prev.gross > 0 && q.hasData ? Math.round(((q.gross - prev.gross) / prev.gross) * 100) : null;
                    return (
                      <tr key={q.id} className={`hover:bg-slate-50 transition-colors ${!q.hasData ? 'opacity-40' : ''}`}>
                        <td className="py-2.5 px-3 font-black text-slate-900 whitespace-nowrap">{q.label}</td>
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{q.period}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{q.hasData ? inr(q.gross) : '—'}</td>
                        <td className="py-2.5 px-3 font-mono text-rose-600">{q.hasData && q.refunds > 0 ? `-${inr(q.refunds)}` : '—'}</td>
                        <td className="py-2.5 px-3 font-mono font-black text-emerald-700">{q.hasData ? inr(q.net) : '—'}</td>
                        <td className="py-2.5 px-3 text-slate-600">{q.hasData ? int(q.orders) : '—'}</td>
                        <td className="py-2.5 px-3 text-slate-600">{q.hasData ? int(q.pages) : '—'}</td>
                        <td className="py-2.5 px-3">
                          {growth !== null ? (
                            <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${growth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {growth >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {Math.abs(growth)}%
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Yearly */}
        {view === 'yearly' && (
          <div className="mt-4 space-y-4">
            <div className="p-5 rounded-2xl bg-gradient-to-br from-[#093765] via-slate-800 to-slate-900 text-white relative overflow-hidden shadow-md">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/20 to-transparent pointer-events-none" />
              <div className="relative z-10">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Financial Year</span>
                    <h3 className="text-xl font-black mt-0.5">FY 2026-27</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Apr 2026 – Mar 2027 · In progress</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Revenue Growth vs Day 1</span>
                    <div className="text-2xl font-black text-emerald-400 flex items-center sm:justify-end gap-1 mt-0.5">
                      <ArrowUpRight className="w-5 h-5" />+{sinceStart}%
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Gross Revenue</span>
                    <p className="text-lg font-black font-mono mt-1">{inr(totalGross)}</p>
                    <span className="text-[10px] text-slate-400">{int(totalOrders)} orders</span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-400/20">
                    <span className="text-[10px] font-bold uppercase text-rose-300">Total Refunds</span>
                    <p className="text-lg font-black font-mono mt-1 text-rose-400">-{inr(totalRefunds)}</p>
                    <span className="text-[10px] text-rose-300/70">{totalGross > 0 ? ((totalRefunds / totalGross) * 100).toFixed(1) : 0}% loss rate</span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-400/20">
                    <span className="text-[10px] font-bold uppercase text-emerald-300">Net Settled</span>
                    <p className="text-lg font-black font-mono mt-1 text-emerald-400">{inr(totalNet)}</p>
                    <span className="text-[10px] text-emerald-300/70">Money in bank</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="h-56 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={allMonthlyData} margin={{ left: -15, right: 6, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="shortLabel" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} width={45} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Line type="monotone" dataKey="gross" name="Gross" stroke="#4F46E5" strokeWidth={2.5} dot={{ r: 4, fill: '#4F46E5', stroke: '#fff', strokeWidth: 2 }} />
                  <Line type="monotone" dataKey="net" name="Net" stroke="#10B981" strokeWidth={2} dot={{ r: 3.5, fill: '#10B981', stroke: '#fff', strokeWidth: 2 }} />
                  <Line type="monotone" dataKey="refunds" name="Refunds" stroke="#F43F5E" strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 3, fill: '#F43F5E', stroke: '#fff', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              <table className="w-full text-xs min-w-[500px]">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold text-[10px] uppercase">
                    {['Quarter','Gross','Refunds','Net Settled','% of FY Net'].map((h) => (
                      <th key={h} className="text-left py-2.5 px-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {quarterlyData.map((q) => (
                    <tr key={q.id} className={`hover:bg-slate-50 transition-colors ${!q.hasData ? 'opacity-40' : ''}`}>
                      <td className="py-2.5 px-3 font-black text-slate-900 whitespace-nowrap">{q.label} <span className="font-normal text-slate-400">({q.period})</span></td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{q.hasData ? inr(q.gross) : '—'}</td>
                      <td className="py-2.5 px-3 font-mono text-rose-600">{q.hasData && q.refunds > 0 ? `-${inr(q.refunds)}` : '—'}</td>
                      <td className="py-2.5 px-3 font-mono font-black text-emerald-700">{q.hasData ? inr(q.net) : '—'}</td>
                      <td className="py-2.5 px-3 text-slate-600">{q.hasData && totalNet > 0 ? `${((q.net / totalNet) * 100).toFixed(1)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-black text-slate-900 bg-slate-50">
                    <td className="py-3 px-3">FY 2026-27 Total</td>
                    <td className="py-3 px-3 font-mono">{inr(totalGross)}</td>
                    <td className="py-3 px-3 font-mono text-rose-600">-{inr(totalRefunds)}</td>
                    <td className="py-3 px-3 font-mono text-emerald-700">{inr(totalNet)}</td>
                    <td className="py-3 px-3">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Revenue Reconciliation Funnel ── */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-xs">
        <div className="pb-3 border-b border-slate-100 mb-4">
          <h3 className="font-bold text-sm text-slate-900">Revenue Reconciliation Summary</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">How gross billings become net settled cash</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {[
            { label: 'Gross Revenue Collected', value: inr(totalGross), sub: `${int(totalOrders)} orders`, color: 'bg-indigo-600', textColor: 'text-indigo-700' },
            { label: '−  Refunds Issued',        value: `−${inr(totalRefunds)}`, sub: `${totalGross > 0 ? ((totalRefunds / totalGross) * 100).toFixed(1) : 0}% loss`, color: 'bg-rose-500', textColor: 'text-rose-700' },
            { label: '=  Net Settled in Bank',   value: inr(totalNet), sub: 'T+1 via Cashfree', color: 'bg-emerald-500', textColor: 'text-emerald-700' },
          ].map((step, i) => (
            <React.Fragment key={step.label}>
              <div className="flex-1 p-4 rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${step.color}`} />
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{step.label}</span>
                </div>
                <p className={`text-xl font-black font-mono ${step.textColor}`}>{step.value}</p>
                <p className="text-[11px] text-slate-400 mt-1">{step.sub}</p>
              </div>
              {i < 2 && <div className="hidden sm:block text-slate-300 text-2xl font-light self-center px-1">→</div>}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};
