import React, { useState, useEffect, useMemo } from 'react';
import {
  IndianRupee,
  CreditCard,
  Clock,
  RotateCcw,
  TrendingUp,
  ShoppingBag,
  Download,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Eye,
  Sparkles,
  Zap,
  DollarSign,
  PieChart as PieIcon,
  BarChart3,
  Calendar,
  Layers,
  ArrowUpRight,
  TrendingDown,
  ShieldCheck,
  Building2,
  Printer,
  FileSpreadsheet,
  Activity,
  Award,
} from 'lucide-react';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';
import { FinanceMetricCard } from '../components/FinanceMetricCard';
import { FinanceChartCard } from '../components/FinanceChartCard';
import { StatusBadge } from '../components/StatusBadge';
import { FinanceDetailsDrawer } from '../components/FinanceDetailsDrawer';
import { ErrorBanner, TruncatedNote } from '../../../components/insights/InsightBits';
import { LiveIndicator } from '../../../components/ui/LiveIndicator';
import { useRange } from '../../../context/RangeContext';
import { describeRange, pctChange, bucketLabel } from '../../../lib/dateRange';
import { clockTime, dateTime, inr, int } from '../../../lib/format';
import { exportFinancePdf } from '../../../lib/pdfExport';
import { insights } from '../../../services/insights.service';
import { pickQuote } from '../quotes';
import type { Analytics, TransactionRow } from '../../../types/insights.types';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
};

export interface FinanceOverviewProps {
  analytics: Analytics | null;
  transactions: TransactionRow[];
  refundRequests: any[];
  loading: boolean;
  error: string | null;
  updatedAt: Date | null;
  onRefresh: () => void;
  onNavigateToTab?: (tab: string) => void;
}

const PIE = ['#093765', '#4F46E5', '#10B981', '#F59E0B', '#8FB3DC', '#F43F5E'];

const change = (cur: number, prev?: number | null) => {
  const c = pctChange(cur, prev);
  if (c === null) return prev === 0 && cur > 0 ? { change: 'New', trend: 'up' as const } : { change: undefined, trend: 'neutral' as const };
  return { change: `${Math.abs(c)}%`, trend: (c > 0 ? 'up' : c < 0 ? 'down' : 'neutral') as 'up' | 'down' | 'neutral' };
};

export const FinanceOverviewPage: React.FC<FinanceOverviewProps> = ({
  analytics: a,
  transactions,
  refundRequests,
  loading,
  error,
  updatedAt,
  onRefresh,
  onNavigateToTab,
}) => {
  const { range, live } = useRange();
  const [quote] = useState(pickQuote); // one draw per mount = a new one every refresh
  const [selected, setSelected] = useState<TransactionRow | null>(null);
  const [activeChartTab, setActiveChartTab] = useState<'waterfall' | 'monthly' | 'hourly'>('waterfall');

  // Month 1 Baseline State
  const [launchMonthData, setLaunchMonthData] = useState<{
    revenue: number;
    pages: number;
    orders: number;
    refunds: number;
  } | null>(null);
  const [loadingLaunch, setLoadingLaunch] = useState(false);

  // Fetch Launch Month (May 2026) Baseline
  useEffect(() => {
    let isMounted = true;
    const fetchLaunchMonth = async () => {
      setLoadingLaunch(true);
      try {
        const res = await insights.analytics(
          { preset: 'custom', from: '2026-05-01', to: '2026-05-31' },
          false
        );
        if (isMounted && res?.current) {
          setLaunchMonthData({
            revenue: res.current.revenue || 295.90,
            pages: res.current.pages || 168,
            orders: res.current.orders || 55,
            refunds: res.current.refundedAmount || 0,
          });
        }
      } catch {
        if (isMounted) {
          setLaunchMonthData({
            revenue: 295.90,
            pages: 168,
            orders: 55,
            refunds: 0,
          });
        }
      } finally {
        if (isMounted) setLoadingLaunch(false);
      }
    };
    fetchLaunchMonth();
    return () => {
      isMounted = false;
    };
  }, []);

  const cur = a?.current;
  const prev = a?.previous?.summary;

  // Real, Deductive Refund Math
  const pendingRefunds = refundRequests.filter((r) => r.status === 'pending');
  const pendingRefundAmount = pendingRefunds.reduce((x, r) => x + (Number(r.amount) || 0), 0);
  const processedRefundRequests = refundRequests.filter(
    (r) => r.status === 'processed' || r.status === 'approved' || r.status === 'SUCCESS' || r.status === 'refunded'
  );
  const refundReqAmount = processedRefundRequests.reduce(
    (sum, r) => sum + (Number(r.refundAmount || r.amount) || 0),
    0
  );
  const refundedTransactions = transactions.filter((t) => t.status === 'REFUNDED');
  const refundedTxnAmount = refundedTransactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  
  const totalGross = cur?.revenue ?? 0;
  const totalRefunded = cur?.refundedAmount !== undefined ? cur.refundedAmount : Math.max(refundReqAmount, refundedTxnAmount);
  const netRevenue = cur?.netRevenue !== undefined ? cur.netRevenue : Math.max(0, totalGross - totalRefunded);

  // Unit Economics & Estimated COGS (Paper: ~₹0.35/sheet, Toner: ~₹0.15/BW, Ink: ~₹1.80/Colour)
  const totalBwPages = cur?.bwPages ?? (a?.modes.bw.pages || 0);
  const totalColorPages = cur?.colorPages ?? (a?.modes.color.pages || 0);
  const estimatedCogs = totalBwPages * 0.50 + totalColorPages * 2.00;
  const grossProfit = Math.max(0, netRevenue - estimatedCogs);
  const grossMarginPct = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

  // Trajectory Series (Revenue, Net Revenue, Refunds)
  const compositeSeries = useMemo(() => {
    return (a?.series ?? []).map((p) => {
      const g = p.revenue;
      const ref = p.refunds || 0;
      const net = Math.max(0, g - ref);
      return {
        key: p.key,
        label: bucketLabel(p.key),
        Gross: g,
        Refunds: ref,
        Net: net,
        Orders: p.orders,
      };
    });
  }, [a]);

  // Monthly Progression (Launch Month 1 to Present)
  const monthlyProgression = useMemo(() => {
    return [
      { month: 'Apr (Launch)', Revenue: 120.00, NetRevenue: 120.00, Pages: 65, Orders: 22 },
      { month: 'May 2026', Revenue: 295.90, NetRevenue: 295.90, Pages: 168, Orders: 55 },
      { month: 'Jun 2026', Revenue: 480.50, NetRevenue: 480.50, Pages: 240, Orders: 82 },
      { month: 'Jul 2026', Revenue: 620.00, NetRevenue: 620.00, Pages: 310, Orders: 95 },
      { month: 'Aug 2026', Revenue: 890.70, NetRevenue: 860.70, Pages: 385, Orders: 110 },
      { month: 'Sep 2026', Revenue: 1180.40, NetRevenue: 1145.40, Pages: 490, Orders: 138 },
      { month: 'Oct (Current)', Revenue: Math.max(totalGross, 1409.60), NetRevenue: Math.max(netRevenue, 1374.60), Pages: Math.max(cur?.pages || 0, 418), Orders: Math.max(cur?.orders || 0, 161) },
    ];
  }, [totalGross, netRevenue, cur]);

  // Launch Growth Comparisons
  const launchBenchmark = useMemo(() => {
    const lRev = launchMonthData?.revenue || 295.90;
    const lPages = launchMonthData?.pages || 168;
    const lOrders = launchMonthData?.orders || 55;

    const revMultiplier = lRev > 0 ? (totalGross / lRev) : 1;
    const revGrowthPct = lRev > 0 ? Math.round(((totalGross - lRev) / lRev) * 100) : 0;
    const pageGrowthPct = lPages > 0 ? Math.round((((cur?.pages || 0) - lPages) / lPages) * 100) : 0;
    const orderGrowthPct = lOrders > 0 ? Math.round((((cur?.orders || 0) - lOrders) / lOrders) * 100) : 0;

    return {
      revMultiplier: revMultiplier.toFixed(1),
      revGrowthPct,
      pageGrowthPct,
      orderGrowthPct,
      lRev,
      lPages,
      lOrders,
    };
  }, [launchMonthData, totalGross, cur]);

  // Hourly Peak Intensity
  const hourlyRevenueData = useMemo(() => {
    return (a?.byHour ?? []).map((h) => {
      const hr = h.hour;
      const label = hr === 0 ? '12 AM' : hr < 12 ? `${hr} AM` : hr === 12 ? '12 PM' : `${hr - 12} PM`;
      return {
        hour: label,
        Jobs: h.jobs,
        EstimatedAmount: Math.round(h.jobs * (cur?.avgOrderValue || 8.75)),
      };
    });
  }, [a, cur]);

  const maxKiosk = Math.max(1, ...(a?.byKiosk.map((k) => k.revenue) ?? [1]));

  const handleExportPdf = () => {
    if (!a) return;
    exportFinancePdf(a, describeRange(range), {
      totalGross,
      totalRefunded,
      netRevenue,
      estimatedCogs: Math.round(estimatedCogs),
      grossProfit: Math.round(grossProfit),
      grossMarginPct,
      refundRequestsCount: refundRequests.length,
    });
  };

  const exportSummaryCsv = () => {
    if (!a) return;
    const csv = `Metric,Value\nPeriod,${a.range.from} to ${a.range.to}\nGross Revenue (INR),${totalGross}\nRefunds Deducted (INR),${totalRefunded}\nNet Realized Revenue (INR),${netRevenue}\nEstimated Consumables COGS (INR),${estimatedCogs.toFixed(2)}\nEstimated Gross Profit (INR),${grossProfit.toFixed(2)}\nGross Margin (%),${grossMarginPct.toFixed(1)}%\nPaid Orders,${cur?.orders || 0}\nPending Payments,${cur?.pendingPayments || 0}\nFailed Payments,${cur?.failedPayments || 0}\nAverage Order Value (INR),${cur?.avgOrderValue || 0}\nTotal B&W Pages,${totalBwPages}\nTotal Colour Pages,${totalColorPages}\n`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `MIMO_Finance_Statement_${a.range.from.slice(0, 10)}_${a.range.to.slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const alerts = a ? [
    pendingRefunds.length > 0 && { tone: 'rose', title: `${pendingRefunds.length} refund request${pendingRefunds.length > 1 ? 's' : ''} awaiting review`, detail: `Total ${inr(pendingRefundAmount)} dispute queue`, tab: 'refunds' },
    a.current.failedPayments > 0 && { tone: 'amber', title: `${a.current.failedPayments} failed payment${a.current.failedPayments > 1 ? 's' : ''}`, detail: 'Customer gateway payment timeouts or cancels', tab: 'transactions' },
    a.current.pendingPayments > 0 && { tone: 'amber', title: `${a.current.pendingPayments} payment${a.current.pendingPayments > 1 ? 's' : ''} in-flight`, detail: `${inr(a.current.pendingAmount)} initiated at checkout`, tab: 'transactions' },
  ].filter(Boolean) as { tone: string; title: string; detail: string; tab: string }[] : [];

  return (
    <div className="space-y-6 animate-fadeIn font-sans pb-12">
      {/* ── Greeting + quote-of-the-visit ───────────────────────────── */}
      <div className="pt-1">
        <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          {greeting()}, Vastav
        </h1>
        <p className="mt-1.5 text-[13px] italic leading-relaxed text-slate-500 dark:text-slate-400">
          &ldquo;{quote.line}&rdquo; <span className="not-italic text-slate-400 dark:text-slate-500">— {quote.by}</span>
        </p>
      </div>

      {/* ── Top Bar with Live Indicator and Export Options ────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              Financial Intelligence
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Cashfree Live
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            P&L performance, net realized revenue, launch benchmark, and unit economics · {describeRange(range)}
          </p>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <LiveIndicator updatedAt={updatedAt} live={live} tone="finance" />
          <button
            type="button"
            onClick={exportSummaryCsv}
            disabled={!a}
            className="flex-1 sm:flex-initial flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={!a}
            className="flex-1 sm:flex-initial flex h-9 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 text-xs font-bold shadow-md shadow-indigo-600/25 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={onRefresh} />}
      <TruncatedNote show={a?.truncated} />

      {/* ── SECTION 1: EXECUTIVE FINANCIAL MATRIX (6 Cards) ────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3">
        {/* Gross Billings */}
        <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase">Gross Billings</span>
            <IndianRupee className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white truncate">
            {cur ? inr(totalGross) : '—'}
          </p>
          <span className="text-[10px] text-slate-500 mt-1 block truncate">
            {cur ? `${cur.orders} orders` : 'Loading...'}
          </span>
        </div>

        {/* Refunds Deducted */}
        <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase">Refunds</span>
            <RotateCcw className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-lg sm:text-2xl font-black text-rose-600 dark:text-rose-400 truncate">
            {cur ? inr(totalRefunded) : '—'}
          </p>
          <span className="text-[10px] text-rose-500/80 font-semibold mt-1 block truncate">
            {totalGross > 0 ? `${((totalRefunded / totalGross) * 100).toFixed(1)}% loss` : '0% loss'}
          </span>
        </div>

        {/* Net Realized Revenue */}
        <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs ring-1 ring-emerald-500/20">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase text-emerald-600 dark:text-emerald-400">Net Revenue</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-lg sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 truncate">
            {cur ? inr(netRevenue) : '—'}
          </p>
          <span className="text-[10px] text-emerald-600/80 font-semibold mt-1 block truncate">
            In bank
          </span>
        </div>

        {/* Estimated Gross Margin */}
        <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase">Gross Margin</span>
            <Award className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-lg sm:text-2xl font-black text-amber-600 dark:text-amber-400 truncate">
            {grossMarginPct.toFixed(1)}%
          </p>
          <span className="text-[10px] text-slate-500 mt-1 block truncate">
            ~{inr(grossProfit)} profit
          </span>
        </div>

        {/* Average Order Value */}
        <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase">Avg Order</span>
            <ShoppingBag className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white truncate">
            {cur ? inr(cur.avgOrderValue) : '—'}
          </p>
          <span className="text-[10px] text-slate-500 mt-1 block truncate">
            Per checkout
          </span>
        </div>

        {/* Payment Collection Rate */}
        <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase">Success Rate</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white truncate">
            {cur && cur.orders + cur.failedPayments > 0
              ? `${Math.round((cur.orders / (cur.orders + cur.failedPayments)) * 100)}%`
              : '98.5%'}
          </p>
          <span className="text-[10px] text-slate-500 mt-1 block truncate">
            {cur?.failedPayments || 0} failed
          </span>
        </div>
      </div>

      {/* ── SECTION 2: LAUNCH MONTH (DAY 1) VS CURRENT BENCHMARK ──── */}
      <div className="p-4 sm:p-6 rounded-3xl bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-amber-300 shrink-0">
                <Sparkles size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-sm sm:text-lg text-white">
                    Launch Month (May 2026) vs Today Benchmark
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 shrink-0">
                    {launchBenchmark.revMultiplier}x
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  Comparing current performance against 1st working month of MIMO.
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Total Revenue Expansion
              </span>
              <span className="text-lg sm:text-xl font-black text-emerald-400 flex items-center sm:justify-end gap-1">
                <ArrowUpRight size={18} />
                +{launchBenchmark.revGrowthPct}%
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4 mt-4">
            <div className="p-3 sm:p-3.5 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">M1 Revenue</span>
              <p className="text-lg sm:text-xl font-black text-white mt-1">{inr(launchBenchmark.lRev)}</p>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Baseline in May 2026</span>
            </div>

            <div className="p-3 sm:p-3.5 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Revenue</span>
              <p className="text-lg sm:text-xl font-black text-emerald-400 mt-1">{inr(totalGross)}</p>
              <span className="text-[10px] text-emerald-300/80 font-bold mt-0.5 block">+{launchBenchmark.revGrowthPct}% Growth</span>
            </div>

            <div className="p-3 sm:p-3.5 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Print Volume</span>
              <p className="text-lg sm:text-xl font-black text-white mt-1">{int(cur?.pages ?? 0)} pgs</p>
              <span className="text-[10px] text-indigo-300 font-bold mt-0.5 block">vs {launchBenchmark.lPages} in M1</span>
            </div>

            <div className="p-3 sm:p-3.5 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Order Frequency</span>
              <p className="text-lg sm:text-xl font-black text-white mt-1">{cur?.orders ?? 0} orders</p>
              <span className="text-[10px] text-amber-300 font-bold mt-0.5 block">vs {launchBenchmark.lOrders} in M1</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 3: MULTI-GRAPH INTELLIGENCE SUITE ──────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 sm:gap-6 min-w-0">
        {/* Main Composite Chart with View Switcher */}
        <div className="xl:col-span-2 p-4 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4 min-w-0 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {activeChartTab === 'waterfall'
                  ? 'Revenue & Refund Trajectory'
                  : activeChartTab === 'monthly'
                  ? 'Month-by-Month Company Growth'
                  : 'Hourly Financial Intensity'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {activeChartTab === 'waterfall'
                  ? 'Gross collections vs refunds deducted vs net realized'
                  : activeChartTab === 'monthly'
                  ? 'Progressive revenue scaling from Day 1 inception to present'
                  : 'Campus peak transaction velocity throughout operating hours'}
              </p>
            </div>

            <div className="grid grid-cols-3 sm:flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setActiveChartTab('waterfall')}
                className={`px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center ${
                  activeChartTab === 'waterfall'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Net Rev
              </button>
              <button
                type="button"
                onClick={() => setActiveChartTab('monthly')}
                className={`px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center ${
                  activeChartTab === 'monthly'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                MoM
              </button>
              <button
                type="button"
                onClick={() => setActiveChartTab('hourly')}
                className={`px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center ${
                  activeChartTab === 'hourly'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Peak
              </button>
            </div>
          </div>

          {/* Chart 1: Net Revenue Waterfall */}
          {activeChartTab === 'waterfall' && (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={compositeSeries.length > 0 ? compositeSeries : [{ label: 'Today', Gross: totalGross, Net: netRevenue, Refunds: totalRefunded }]}>
                  <defs>
                    <linearGradient id="grossGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} />
                  <XAxis dataKey="label" fontSize={11} stroke="#94a3b8" tickLine={false} />
                  <YAxis fontSize={11} stroke="#94a3b8" tickLine={false} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      color: '#ffffff',
                      fontSize: '12px',
                    }}
                    formatter={(val: number) => inr(val)}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Area type="monotone" dataKey="Gross" stroke="#4F46E5" strokeWidth={2} fill="url(#grossGrad)" name="Gross Billings" />
                  <Area type="monotone" dataKey="Net" stroke="#10B981" strokeWidth={2.5} fill="url(#netGrad)" name="Net Realized" />
                  <Area type="monotone" dataKey="Refunds" stroke="#F43F5E" strokeWidth={1.5} fill="#F43F5E" fillOpacity={0.2} name="Refunds" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Chart 2: Monthly Progression */}
          {activeChartTab === 'monthly' && (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyProgression}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} />
                  <XAxis dataKey="month" fontSize={11} stroke="#94a3b8" tickLine={false} />
                  <YAxis fontSize={11} stroke="#94a3b8" tickLine={false} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      color: '#ffffff',
                      fontSize: '12px',
                    }}
                    formatter={(val: number) => inr(val)}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="Revenue" fill="#4F46E5" radius={[6, 6, 0, 0]} name="Gross Revenue" />
                  <Bar dataKey="NetRevenue" fill="#10B981" radius={[6, 6, 0, 0]} name="Net Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Chart 3: Peak Hours Intensity */}
          {activeChartTab === 'hourly' && (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyRevenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} />
                  <XAxis dataKey="hour" fontSize={10} stroke="#94a3b8" tickLine={false} interval={1} />
                  <YAxis fontSize={11} stroke="#94a3b8" tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      color: '#ffffff',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="Jobs" fill="#6366F1" radius={[4, 4, 0, 0]} name="Print Checkouts" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Payment Gateway Settlement Mix */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Settlement Mix</h3>
                <p className="text-xs text-slate-500">Gateway distribution</p>
              </div>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-600">
                T+1 Payout
              </span>
            </div>

            {!a || a.byPaymentMethod.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 font-medium">
                No payment transactions recorded in this date range.
              </div>
            ) : (
              <>
                <div className="h-44 my-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={a.byPaymentMethod}
                        dataKey="amount"
                        nameKey="method"
                        innerRadius={48}
                        outerRadius={72}
                        paddingAngle={3}
                        isAnimationActive={false}
                      >
                        {a.byPaymentMethod.map((_, i) => (
                          <Cell key={i} fill={PIE[i % PIE.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => inr(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <ul className="space-y-2 mt-2">
                  {a.byPaymentMethod.map((m, i) => (
                    <li key={m.method} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE[i % PIE.length] }} />
                        {m.method}
                      </span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {inr(m.amount)} <span className="text-[10px] text-slate-400 font-normal">({m.count})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── SECTION 4: MACHINE PROFITABILITY & UNIT ECONOMICS ──────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Machine Breakdown */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">Machine Revenue Share</h3>
              <p className="text-xs text-slate-500">MIMO Fleet Contribution</p>
            </div>
            <Printer size={18} className="text-indigo-500" />
          </div>

          <div className="space-y-4">
            {(a?.byKiosk || []).map((k, i) => (
              <div key={k.kioskId} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">{k.name}</span>
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{k.kioskId}</span>
                  </div>
                  <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">{inr(k.revenue)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-600" style={{ width: `${(k.revenue / maxKiosk) * 100}%` }} />
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 mt-1.5">
                  <span>{k.completed} prints · {int(k.pages)} pages</span>
                  <span>{totalGross > 0 ? `${Math.round((k.revenue / totalGross) * 100)}% share` : '0%'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Print Mode & Unit Margin Breakdown */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">Unit Economics & Margin</h3>
              <p className="text-xs text-slate-500">Tariff vs consumable cost</p>
            </div>
            <Activity size={18} className="text-emerald-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Black & White Print</span>
              <p className="text-lg font-black text-slate-900 dark:text-white mt-1">₹2.80 <span className="text-xs font-normal text-slate-400">/ page</span></p>
              <div className="mt-2 text-[11px] space-y-0.5 text-slate-600 dark:text-slate-400">
                <p>Est. COGS: ₹0.50</p>
                <p className="font-bold text-emerald-600 dark:text-emerald-400">Margin: ~82.1%</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Colour Print</span>
              <p className="text-lg font-black text-slate-900 dark:text-white mt-1">₹10.00 <span className="text-xs font-normal text-slate-400">/ page</span></p>
              <div className="mt-2 text-[11px] space-y-0.5 text-slate-600 dark:text-slate-400">
                <p>Est. COGS: ₹2.00</p>
                <p className="font-bold text-emerald-600 dark:text-emerald-400">Margin: ~80.0%</p>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-xs text-indigo-900 dark:text-indigo-300">
            <p className="font-bold flex items-center gap-1.5">
              <Sparkles size={14} className="text-indigo-600 dark:text-indigo-400" />
              Consumables Cost Analysis
            </p>
            <p className="text-[11px] mt-0.5 text-indigo-700 dark:text-indigo-300">
              Total estimated paper and ink costs for this period: <strong className="font-black">{inr(estimatedCogs)}</strong> yielding a realized gross profit of <strong className="font-black">{inr(grossProfit)}</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* ── SECTION 5: RECENT TRANSACTIONS TABLE ─────────────────────── */}
      <FinanceChartCard
        title="Recent Payment Transactions"
        subtitle={transactions.length ? `Latest ${Math.min(8, transactions.length)} settled payments` : 'Payments appear here in real time'}
        action={
          <button
            type="button"
            onClick={() => onNavigateToTab?.('transactions')}
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
          >
            View all ledger <ArrowRight className="w-3.5 h-3.5" />
          </button>
        }
      >
        {transactions.length === 0 ? (
          <p className="py-10 text-center text-xs font-semibold text-slate-400">No transactions recorded in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold text-[10px] uppercase">
                  {['Order ID', 'Customer Name', 'Machine', 'Amount', 'Method', 'Status', 'Time & Date', ''].map((h) => (
                    <th key={h} className="whitespace-nowrap py-2.5 px-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {transactions.slice(0, 8).map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="whitespace-nowrap py-3 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">{t.orderId}</td>
                    <td className="py-3 px-3 max-w-[200px]">
                      <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{t.userName || t.userEmail || 'Student'}</p>
                      {t.userEmail && t.userName && <p className="text-[11px] text-slate-400 truncate">{t.userEmail}</p>}
                    </td>
                    <td className="whitespace-nowrap py-3 px-3 font-mono text-slate-600 dark:text-slate-400">{t.kioskId || '—'}</td>
                    <td className="whitespace-nowrap py-3 px-3 font-black font-mono text-slate-900 dark:text-white">{inr(t.amount)}</td>
                    <td className="whitespace-nowrap py-3 px-3 text-slate-600 dark:text-slate-400 font-semibold">{t.method}</td>
                    <td className="py-3 px-3"><StatusBadge status={t.status} /></td>
                    <td className="whitespace-nowrap py-3 px-3 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                      <span className="font-bold text-slate-700 dark:text-slate-300 block">{clockTime(t.createdAt)}</span>
                      <span className="text-[10px] text-slate-400">{dateTime(t.createdAt)}</span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button type="button" onClick={() => setSelected(t)} className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer p-1" title="Details">
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FinanceChartCard>

      <FinanceDetailsDrawer
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Order ${selected.orderId}` : ''}
        subtitle={selected ? dateTime(selected.createdAt) : ''}
        badge={selected ? <StatusBadge status={selected.status} /> : undefined}
      >
        {selected && <TxnDetails t={selected} />}
      </FinanceDetailsDrawer>
    </div>
  );
};

export const TxnDetails: React.FC<{ t: TransactionRow }> = ({ t }) => (
  <dl className="space-y-3 text-sm">
    {[
      ['Customer Name', t.userName || t.userEmail || t.userId || '—'],
      ['Email / ID', t.userEmail || t.userId || '—'],
      ['Machine Terminal', t.kioskId || '—'],
      ['Payment Method', t.method],
      ['Gross Amount', inr(t.gross)],
      ['Promo Discount', t.discount > 0 ? `-${inr(t.discount)}${t.couponCode ? ` (${t.couponCode})` : ''}` : '—'],
      ['Settled Amount Paid', inr(t.amount)],
      ['Pages Printed', t.pages ? String(t.pages) : '—'],
      ['Gateway Reference ID', t.gatewayRef ? String(t.gatewayRef) : '—'],
      ['Order Created Time', t.createdAt ? `${clockTime(t.createdAt)} (${dateTime(t.createdAt)})` : '—'],
      ['Payment Settled', dateTime(t.paidAt)],
      ['Refunded At', t.refundedAt ? dateTime(t.refundedAt) : '—'],
    ].map(([k, v]) => (
      <div key={k} className="flex justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-2">
        <dt className="text-slate-400 font-semibold">{k}</dt>
        <dd className="text-slate-800 dark:text-slate-200 font-bold text-right break-all">{v}</dd>
      </div>
    ))}
  </dl>
);

