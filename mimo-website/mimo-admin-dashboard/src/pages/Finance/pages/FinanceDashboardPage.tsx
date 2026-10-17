import React, { useState, useMemo, useEffect } from 'react';
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
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import api from '../../../api';
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

export interface MonthlyRecord {
  month: string;
  label: string;
  shortLabel: string;
  monthIndex: number;
  gross: number;
  refunds: number;
  net: number;
  orders: number;
  pages: number;
  quarter: string;
  settled?: number | null;
  settlementStatus?: 'RECONCILED' | 'UNRECONCILED';
  isCurrent?: boolean;
}

const FY_QUARTERS = [
  { id: 'Q4 FY26', label: 'Q4 FY2026', period: 'Jan – Mar 2026', months: ['Jan 2026', 'Feb 2026', 'Mar 2026'] },
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
  label: string;
  value: string;
  sub?: string;
  accent?: 'indigo' | 'rose' | 'emerald' | 'amber';
  icon: React.ReactNode;
}> = ({ label, value, sub, accent = 'indigo', icon }) => {
  const styles: Record<string, string> = {
    indigo: 'from-indigo-50 to-indigo-100/40 border-indigo-200/60 text-indigo-700 dark:from-indigo-950/40 dark:to-indigo-900/20 dark:border-indigo-800 dark:text-indigo-300',
    rose: 'from-rose-50 to-rose-100/40 border-rose-200/60 text-rose-700 dark:from-rose-950/40 dark:to-rose-900/20 dark:border-rose-800 dark:text-rose-300',
    emerald: 'from-emerald-50 to-emerald-100/40 border-emerald-200/60 text-emerald-700 dark:from-emerald-950/40 dark:to-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300',
    amber: 'from-amber-50 to-amber-100/40 border-amber-200/60 text-amber-700 dark:from-amber-950/40 dark:to-amber-900/20 dark:border-amber-800 dark:text-amber-300',
  };
  const bg: Record<string, string> = {
    indigo: 'bg-indigo-600',
    rose: 'bg-rose-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
  };

  return (
    <div className={`p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br border ${styles[accent]} flex flex-col gap-1.5 shadow-2xs`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider opacity-80">{label}</span>
        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl ${bg[accent]} flex items-center justify-center text-white shadow-xs shrink-0`}>
          {icon}
        </div>
      </div>
      <p className="text-xl sm:text-2xl font-black tracking-tight font-mono">{value}</p>
      {sub && <p className="text-[10px] sm:text-[11px] font-semibold opacity-70 truncate">{sub}</p>}
    </div>
  );
};

export const FinanceDashboardPage: React.FC<FinanceDashboardPageProps> = ({
  analytics: a,
  loading: _loading,
  error,
  onRefresh,
}) => {
  const [view, setView] = useState<PerfView>('monthly');
  const [serverMonths, setServerMonths] = useState<MonthlyRecord[]>([]);
  const [loadingMonths, setLoadingMonths] = useState<boolean>(true);
  const cur = a?.current;

  const fetchMonthlySummary = async () => {
    setLoadingMonths(true);
    try {
      const res = await api.get('/admin/analytics/monthly-summary');
      if (res.data?.months && Array.isArray(res.data.months)) {
        setServerMonths(res.data.months);
      }
    } catch (err) {
      console.error('Failed to load monthly summary from server:', err);
    } finally {
      setLoadingMonths(false);
    }
  };

  useEffect(() => {
    fetchMonthlySummary();
  }, []);

  const allMonthlyData = useMemo(() => {
    if (serverMonths.length > 0) return serverMonths;
    if (!cur) return [];

    const livGross = cur.grossCollections ?? cur.revenue ?? 0;
    const livRef = cur.refundedAmount ?? 0;
    const livNet = cur.netCollections ?? cur.netRevenue ?? Math.max(0, livGross - livRef);
    const livOrders = cur.orders ?? 0;
    const livPages = cur.pages ?? 0;

    return [
      {
        month: 'Current Active Range',
        label: 'Current Active Range',
        shortLabel: 'Current',
        monthIndex: 1,
        gross: livGross,
        refunds: livRef,
        net: livNet,
        orders: livOrders,
        pages: livPages,
        quarter: 'Active',
        isCurrent: true,
        settlementStatus: 'UNRECONCILED' as const,
      },
    ];
  }, [serverMonths, cur]);

  const totalGross = useMemo(() => allMonthlyData.reduce((a, m) => a + m.gross, 0), [allMonthlyData]);
  const totalRefunds = useMemo(() => allMonthlyData.reduce((a, m) => a + m.refunds, 0), [allMonthlyData]);
  const totalNet = useMemo(() => allMonthlyData.reduce((a, m) => a + m.net, 0), [allMonthlyData]);
  const totalOrders = useMemo(() => allMonthlyData.reduce((a, m) => a + m.orders, 0), [allMonthlyData]);

  const startMonth = allMonthlyData[0] || { month: 'Jan 2026', gross: 0 };
  const currentMonth = allMonthlyData[allMonthlyData.length - 1] || { month: 'Present', gross: 0 };
  const sinceStart =
    startMonth.gross > 0
      ? (((currentMonth.gross - startMonth.gross) / startMonth.gross) * 100).toFixed(0)
      : '0';

  /* ── Quarterly Aggregation ── */
  const quarterlyData = useMemo(() => {
    return FY_QUARTERS.map((q) => {
      const qMonths = allMonthlyData.filter((m) => q.months.includes(m.month) || m.quarter === q.id);
      const gross = qMonths.reduce((a, m) => a + m.gross, 0);
      const refunds = qMonths.reduce((a, m) => a + m.refunds, 0);
      const net = qMonths.reduce((a, m) => a + m.net, 0);
      const orders = qMonths.reduce((a, m) => a + m.orders, 0);
      const pages = qMonths.reduce((a, m) => a + m.pages, 0);
      return {
        ...q,
        gross: Math.round(gross * 100) / 100,
        refunds: Math.round(refunds * 100) / 100,
        net: Math.round(net * 100) / 100,
        orders,
        pages,
        hasData: qMonths.length > 0 && gross > 0,
      };
    });
  }, [allMonthlyData]);

  /* ── Yearly Aggregation ── */
  const yearlyData = useMemo(() => {
    const fy26Months = allMonthlyData.filter((m) => m.month.endsWith('2026') && ['Jan', 'Feb', 'Mar'].some((mo) => m.month.startsWith(mo)));
    const fy27Months = allMonthlyData.filter((m) =>
      (m.month.endsWith('2026') && !['Jan', 'Feb', 'Mar'].some((mo) => m.month.startsWith(mo))) ||
      (m.month.endsWith('2027') && ['Jan', 'Feb', 'Mar'].some((mo) => m.month.startsWith(mo)))
    );

    const agg = (label: string, period: string, list: MonthlyRecord[]) => {
      const gross = list.reduce((a, m) => a + m.gross, 0);
      const refunds = list.reduce((a, m) => a + m.refunds, 0);
      const net = list.reduce((a, m) => a + m.net, 0);
      const orders = list.reduce((a, m) => a + m.orders, 0);
      const pages = list.reduce((a, m) => a + m.pages, 0);
      return {
        year: label,
        period,
        gross: Math.round(gross * 100) / 100,
        refunds: Math.round(refunds * 100) / 100,
        net: Math.round(net * 100) / 100,
        orders,
        pages,
        monthCount: list.length,
      };
    };

    return [
      agg('FY2025-26 (Inception)', 'Jan 2026 – Mar 2026', fy26Months),
      agg('FY2026-27 (Current)', 'Apr 2026 – Mar 2027', fy27Months),
    ];
  }, [allMonthlyData]);

  const exportCsv = () => {
    const headers = ['Month Index', 'Month', 'Gross Collections (INR)', 'Refunds (INR)', 'Net Collections (INR)', 'Orders', 'Pages'];
    const rows = [
      headers,
      ...allMonthlyData.map((m) => [`M${m.monthIndex}`, m.month, m.gross.toFixed(2), m.refunds.toFixed(2), m.net.toFixed(2), m.orders, m.pages]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `MIMO_Financial_Summary_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">Finance Dashboard</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <Sparkles className="w-3 h-3" />Authoritative Timeline (Launch Jan 2026)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Verified financial stream from January 2026 · Dynamic monthly aggregation &amp; reconciliation
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button
            type="button"
            onClick={fetchMonthlySummary}
            disabled={loadingMonths}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3.5 text-xs font-bold transition-all cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loadingMonths ? 'animate-spin' : ''}`} />
            Refresh Timeline
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={allMonthlyData.length === 0}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-[#093765] hover:bg-[#062A4E] text-white px-3.5 text-xs font-bold shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />Export CSV
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={onRefresh} />}

      {/* ── KPI Tiles (Strictly Separated Concepts) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiBadge
          label="Gross Collections"
          value={totalGross > 0 ? inr(totalGross) : cur ? inr(cur.grossCollections ?? cur.revenue) : '₹0'}
          sub={`${int(totalOrders || (cur ? cur.orders : 0))} paid orders since launch`}
          accent="indigo"
          icon={<IndianRupee className="w-4 h-4" />}
        />
        <KpiBadge
          label="Completed Refunds"
          value={totalRefunds > 0 ? inr(totalRefunds) : cur ? inr(cur.refundedAmount) : '₹0'}
          sub={totalGross > 0 ? `${((totalRefunds / totalGross) * 100).toFixed(1)}% refund rate` : 'Fully reconciled'}
          accent="rose"
          icon={<RotateCcw className="w-4 h-4" />}
        />
        <KpiBadge
          label="Net Collections (Operational)"
          value={totalNet > 0 ? inr(totalNet) : cur ? inr(cur.netCollections ?? cur.netRevenue) : '₹0'}
          sub="Gross collections minus processed refunds"
          accent="emerald"
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <KpiBadge
          label="Bank Settlements"
          value="Awaiting UTR Batch"
          sub="External Cashfree Payout · Unreconciled in Firestore"
          accent="amber"
          icon={<Landmark className="w-4 h-4" />}
        />
      </div>

      {/* ── Growth from Launch Chart ── */}
      <div className="p-4 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs min-w-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">Revenue Growth — Verified Timeline</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                +{sinceStart}% growth
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Progression from Launch (Jan 2026) to Present · Collections vs Refunds
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 shrink-0">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" /> Gross Collections
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Net Collections
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" /> Refunds
            </span>
          </div>
        </div>

        {allMonthlyData.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400 font-medium">
            Loading authoritative monthly timeline from Firestore...
          </div>
        ) : (
          <div className="h-64 sm:h-72 mt-4 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={allMonthlyData} margin={{ left: -15, right: 6, top: 20, bottom: 0 }}>
                <defs>
                  <linearGradient id="dGrossGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="dNetGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} vertical={false} />
                <XAxis dataKey="shortLabel" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} width={45} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="gross"
                  name="Gross Collections"
                  stroke="#4F46E5"
                  strokeWidth={2.5}
                  fill="url(#dGrossGrad)"
                  dot={{ r: 4, fill: '#4F46E5', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6 }}
                />
                <Area
                  type="monotone"
                  dataKey="net"
                  name="Net Collections"
                  stroke="#10B981"
                  strokeWidth={2}
                  fill="url(#dNetGrad)"
                  dot={{ r: 3.5, fill: '#10B981', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 5 }}
                />
                <Area
                  type="monotone"
                  dataKey="refunds"
                  name="Refunds"
                  stroke="#F43F5E"
                  strokeWidth={1.5}
                  fill="#F43F5E"
                  fillOpacity={0.08}
                  dot={{ r: 3, fill: '#F43F5E', strokeWidth: 2, stroke: '#fff' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Month badges row */}
        <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 overflow-x-auto pb-1.5 no-scrollbar">
          {allMonthlyData.map((m) => (
            <div
              key={m.month}
              className={`shrink-0 min-w-[85px] sm:min-w-0 sm:flex-1 flex flex-col items-center px-2.5 py-2 rounded-xl text-center ${
                m.isCurrent
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : m.monthIndex === 1
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                  : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-black uppercase opacity-80">M{m.monthIndex}</span>
                {m.monthIndex === 1 && <span className="text-[8px] bg-emerald-600 text-white font-extrabold px-1 rounded">Launch</span>}
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
      <div className="p-4 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs min-w-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">Performance Breakdown</h3>
            <p className="text-xs text-slate-400">Complete historical monthly view from January 2026 launch</p>
          </div>
          <div className="grid grid-cols-3 sm:flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full sm:w-auto">
            {(['monthly', 'quarterly', 'yearly'] as PerfView[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  view === v
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {v === 'monthly' && (
                  <>
                    <CalendarDays className="w-3 h-3" />
                    <span>Monthly</span>
                  </>
                )}
                {v === 'quarterly' && (
                  <>
                    <BarChart3 className="w-3 h-3" />
                    <span>Quarterly</span>
                  </>
                )}
                {v === 'yearly' && (
                  <>
                    <Calendar className="w-3 h-3" />
                    <span>Yearly</span>
                  </>
                )}
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="shortLabel" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} width={45} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="gross" name="Gross Collections" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="refunds" name="Refunds" fill="#F43F5E" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="net" name="Net Collections" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              <table className="w-full text-xs min-w-[520px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold text-[10px] uppercase">
                    {['#', 'Month', 'Quarter', 'Gross Collections', 'Refunds', 'Net Collections', 'Bank Settlements', 'Orders', 'Pages'].map((h) => (
                      <th key={h} className="text-left py-2.5 px-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {allMonthlyData.map((m) => (
                    <tr
                      key={m.month}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                        m.isCurrent ? 'bg-indigo-50/40 dark:bg-indigo-950/20 font-semibold' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-400">M{m.monthIndex}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">{m.month}</td>
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{m.quarter}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">{inr(m.gross)}</td>
                      <td className="py-2.5 px-3 font-mono text-rose-500">{m.refunds > 0 ? `-${inr(m.refunds)}` : '—'}</td>
                      <td className="py-2.5 px-3 font-mono font-black text-emerald-600 dark:text-emerald-400">{inr(m.net)}</td>
                      <td className="py-2.5 px-3 font-mono text-amber-600 dark:text-amber-400 text-[11px]">
                        {m.settled != null ? inr(m.settled) : 'Unreconciled'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">{int(m.orders)}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">{int(m.pages)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Quarterly */}
        {view === 'quarterly' && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {quarterlyData.map((q) => (
                <div
                  key={q.id}
                  className={`p-4 rounded-xl border flex flex-col justify-between ${
                    q.hasData
                      ? 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 shadow-2xs'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400">{q.id}</span>
                    <span className="text-[10px] text-slate-400">{q.period}</span>
                  </div>
                  <div>
                    <span className="text-xl font-mono font-black text-slate-900 dark:text-white">{inr(q.gross)}</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">Net: {inr(q.net)} · {int(q.orders)} orders</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Yearly */}
        {view === 'yearly' && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {yearlyData.map((y) => (
                <div key={y.year} className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-black text-base text-slate-900 dark:text-white">{y.year}</h4>
                      <p className="text-xs text-slate-400">{y.period}</p>
                    </div>
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                      {y.monthCount} months recorded
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-700 text-center">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold">Gross</p>
                      <p className="font-mono font-bold text-sm text-slate-800 dark:text-slate-200">{inr(y.gross)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold">Net</p>
                      <p className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">{inr(y.net)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold">Orders</p>
                      <p className="font-mono font-bold text-sm text-slate-800 dark:text-slate-200">{int(y.orders)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
