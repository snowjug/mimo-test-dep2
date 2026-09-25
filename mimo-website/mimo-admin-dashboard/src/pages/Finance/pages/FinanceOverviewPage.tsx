import React, { useState } from 'react';
import {
  IndianRupee,
  CreditCard,
  Clock,
  RotateCcw,
  TrendingUp,
  Wallet,
  Download,
  RotateCw,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Eye,
  BarChart3,
  PieChart as PieIcon,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { FinanceMetricCard } from '../components/FinanceMetricCard';
import { FinanceChartCard } from '../components/FinanceChartCard';
import { StatusBadge } from '../components/StatusBadge';
import { FinanceDetailsDrawer } from '../components/FinanceDetailsDrawer';

export interface FinanceOverviewProps {
  metrics: {
    totalRevenue: number;
    successfulPayments: number;
    pendingPayments: number;
    refundsIssued: number;
    netRevenue: number;
    walletBalance: number;
  };
  recentTransactions: any[];
  refundRequests: any[];
  loading: boolean;
  onRefresh: () => void;
  onNavigateToTab?: (tab: string) => void;
}

export const FinanceOverviewPage: React.FC<FinanceOverviewProps> = ({
  metrics,
  recentTransactions,
  refundRequests,
  loading,
  onRefresh,
  onNavigateToTab,
}) => {
  const [trendRange, setTrendRange] = useState<'7D' | '30D' | '90D' | '1Y'>('30D');
  const [selectedTxn, setSelectedTxn] = useState<any | null>(null);

  // Revenue Trend data
  const generateTrendData = () => {
    if (trendRange === '7D') {
      return [
        { date: 'Sep 20', revenue: 1420, successful: 1350, refunds: 70 },
        { date: 'Sep 21', revenue: 1850, successful: 1720, refunds: 130 },
        { date: 'Sep 22', revenue: 2100, successful: 1980, refunds: 120 },
        { date: 'Sep 23', revenue: 2400, successful: 2320, refunds: 80 },
        { date: 'Sep 24', revenue: 2050, successful: 1950, refunds: 100 },
        { date: 'Sep 25', revenue: 2680, successful: 2590, refunds: 90 },
        { date: 'Sep 26', revenue: 2950, successful: 2890, refunds: 60 },
      ];
    }
    if (trendRange === '30D') {
      return [
        { date: 'Sep 1', revenue: 950, successful: 900, refunds: 50 },
        { date: 'Sep 4', revenue: 1420, successful: 1380, refunds: 40 },
        { date: 'Sep 7', revenue: 1890, successful: 1800, refunds: 90 },
        { date: 'Sep 10', revenue: 2150, successful: 2050, refunds: 100 },
        { date: 'Sep 13', revenue: 2450, successful: 2380, refunds: 70 },
        { date: 'Sep 16', revenue: 2200, successful: 2120, refunds: 80 },
        { date: 'Sep 19', revenue: 2600, successful: 2510, refunds: 90 },
        { date: 'Sep 22', revenue: 2800, successful: 2710, refunds: 90 },
        { date: 'Sep 26', revenue: 3120, successful: 3040, refunds: 80 },
      ];
    }
    return [
      { date: 'Q1', revenue: 32400, successful: 31200, refunds: 1200 },
      { date: 'Q2', revenue: 48900, successful: 47100, refunds: 1800 },
      { date: 'Q3', revenue: 61200, successful: 59300, refunds: 1900 },
    ];
  };

  // Payment Method Distribution Data
  const paymentMethodData = [
    { name: 'UPI', value: 68730, percentage: '48.2%', amount: '₹68,730', color: '#6D35E8' },
    { name: 'Card', value: 40003, percentage: '28.1%', amount: '₹40,003', color: '#00C7F2' },
    { name: 'Wallet', value: 21935, percentage: '15.4%', amount: '₹21,935', color: '#10B981' },
    { name: 'Cash', value: 8980, percentage: '6.3%', amount: '₹8,980', color: '#F59E0B' },
    { name: 'Others', value: 2852, percentage: '2.0%', amount: '₹2,852', color: '#8B5CF6' },
  ];

  // Revenue by Kiosk Data
  const kioskList = [
    { id: 'CV-001', name: 'Main Library', amount: '₹32,450', percent: 85, color: '#6D35E8' },
    { id: 'CV-002', name: 'Admin Block', amount: '₹28,180', percent: 72, color: '#8555F6' },
    { id: 'SV-001', name: 'Cafeteria', amount: '₹24,670', percent: 64, color: '#A07BF8' },
    { id: 'SV-002', name: 'Hostel Block', amount: '₹18,920', percent: 48, color: '#BA9FFB' },
    { id: 'SV-003', name: 'Science Block', amount: '₹12,280', percent: 32, color: '#D5C4FD' },
    { id: 'Others', name: 'Remaining Fleet', amount: '₹26,000', percent: 68, color: '#9065FD' },
  ];

  const handleExportSummary = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'Metric,Amount (INR)\n' +
      `Total Revenue,${metrics.totalRevenue}\n` +
      `Successful Payments,${metrics.successfulPayments}\n` +
      `Pending Payments,${metrics.pendingPayments}\n` +
      `Refunds Issued,${metrics.refundsIssued}\n` +
      `Net Revenue,${metrics.netRevenue}\n` +
      `Wallet Balance,${metrics.walletBalance}\n`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `MIMO_Finance_Overview_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* ── TOP HEADER SECTION ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-[#EDE9FE] rounded-2xl p-5 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#EDE8FF] text-[#6D35E8] flex items-center justify-center shrink-0 shadow-xs">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-[#19162D] tracking-tight leading-tight">
              Finance Overview
            </h1>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Monitor payments, revenue, refunds, and financial performance across the MIMO network.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#6D35E8]' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleExportSummary}
            className="px-5 py-2.5 text-xs font-bold text-white bg-[#6D35E8] hover:bg-[#5b29c9] shadow-md shadow-purple-500/20 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export Report
          </button>
        </div>
      </div>

      {/* ── 6 FINANCIAL KPI CARDS ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <FinanceMetricCard
          title="Total Revenue"
          value="₹1,42,500"
          change="↑ 14.2%"
          trend="up"
          comparisonText="vs. prev. period"
          icon={<IndianRupee className="w-5 h-5" />}
          iconBgColor="bg-emerald-50"
          iconColor="text-emerald-600"
          sparklineData={[12000, 14500, 13800, 16200, 18400, 21000]}
          sparklineColor="#10B981"
          loading={loading}
        />
        <FinanceMetricCard
          title="Successful Payments"
          value="₹1,28,430"
          change="↑ 12.8%"
          trend="up"
          comparisonText="vs. prev. period"
          icon={<CreditCard className="w-5 h-5" />}
          iconBgColor="bg-blue-50"
          iconColor="text-blue-600"
          sparklineData={[10000, 12000, 11500, 14000, 16000, 18500]}
          sparklineColor="#3B82F6"
          loading={loading}
        />
        <FinanceMetricCard
          title="Pending Payments"
          value="₹18,450"
          change="↘ 5.3%"
          trend="down"
          comparisonText="vs. prev. period"
          icon={<Clock className="w-5 h-5" />}
          iconBgColor="bg-amber-50"
          iconColor="text-amber-600"
          sparklineData={[3000, 2800, 3100, 2500, 2200, 1950]}
          sparklineColor="#F59E0B"
          loading={loading}
        />
        <FinanceMetricCard
          title="Refunds Issued"
          value="₹3,240"
          change="↑ 2.1%"
          trend="neutral"
          comparisonText="vs. prev. period"
          icon={<RotateCcw className="w-5 h-5" />}
          iconBgColor="bg-rose-50"
          iconColor="text-rose-600"
          sparklineData={[400, 600, 450, 700, 520, 480]}
          sparklineColor="#EF4444"
          loading={loading}
        />
        <FinanceMetricCard
          title="Net Revenue"
          value="₹1,25,190"
          change="↑ 16.4%"
          trend="up"
          comparisonText="vs. prev. period"
          icon={<TrendingUp className="w-5 h-5" />}
          iconBgColor="bg-purple-50"
          iconColor="text-[#6D35E8]"
          sparklineData={[9600, 11400, 11050, 13300, 15480, 18020]}
          sparklineColor="#6D35E8"
          loading={loading}
        />
        <FinanceMetricCard
          title="Wallet Balance"
          value="₹12,500"
          change="↑ 8.1%"
          trend="up"
          comparisonText="vs. prev. period"
          icon={<Wallet className="w-5 h-5" />}
          iconBgColor="bg-cyan-50"
          iconColor="text-cyan-600"
          sparklineData={[8000, 8500, 9200, 10100, 11400, 12500]}
          sparklineColor="#06B6D4"
          loading={loading}
        />
      </div>

      {/* ── CHARTS ROW: REVENUE TREND + PAYMENT DISTRIBUTION + REVENUE BY KIOSK ─ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Card 1: Revenue Trend (6 Cols) */}
        <div className="lg:col-span-6 flex flex-col">
          <FinanceChartCard
            title="Revenue Trend"
            subtitle="Daily revenue, successful payments and refunds"
            action={
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
                {(['7D', '30D', '90D', '1Y'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setTrendRange(r)}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      trendRange === r
                        ? 'bg-[#6D35E8] text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            }
          >
            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={generateTrendData()} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevMimo" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6D35E8" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#6D35E8" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="colorSuccMimo" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00C7F2" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#00C7F2" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="date" stroke="#94A3B8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#19162D',
                      borderRadius: '12px',
                      color: '#FFF',
                      fontSize: '12px',
                      border: 'none',
                    }}
                    formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, '']}
                  />
                  <Area isAnimationActive={false} type="monotone" dataKey="revenue" stroke="#6D35E8" strokeWidth={2.8} fillOpacity={1} fill="url(#colorRevMimo)" />
                  <Area isAnimationActive={false} type="monotone" dataKey="successful" stroke="#00C7F2" strokeWidth={2.2} fillOpacity={1} fill="url(#colorSuccMimo)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-6 mt-3 text-xs text-slate-500 font-semibold border-t border-slate-100 pt-3">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#6D35E8]" /> Revenue
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#00C7F2]" /> Successful Payments
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Refunds
              </span>
            </div>
          </FinanceChartCard>
        </div>

        {/* Card 2: Payment Method Distribution (3 Cols) */}
        <div className="lg:col-span-3 flex flex-col">
          <FinanceChartCard
            title="Payment Method Distribution"
            icon={<PieIcon className="w-4 h-4" />}
          >
            <div className="w-full h-44 relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    isAnimationActive={false}
                    data={paymentMethodData}
                    innerRadius={50}
                    outerRadius={72}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {paymentMethodData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => `₹${Number(value).toLocaleString('en-IN')}`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-sm font-black text-slate-900 font-mono">
                  ₹1,42,500
                </span>
                <span className="text-[10px] font-semibold text-slate-400">Total Revenue</span>
              </div>
            </div>

            <div className="space-y-2 mt-2 pt-2 border-t border-slate-100">
              {paymentMethodData.map((m) => (
                <div key={m.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                    <span className="text-slate-700 font-bold">{m.name}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span className="text-slate-500 font-semibold">{m.percentage}</span>
                    <span className="text-slate-400">{m.amount}</span>
                  </div>
                </div>
              ))}
            </div>
          </FinanceChartCard>
        </div>

        {/* Card 3: Revenue by Kiosk (3 Cols) */}
        <div className="lg:col-span-3 flex flex-col">
          <FinanceChartCard
            title="Revenue by Kiosk"
            action={
              <button
                type="button"
                onClick={() => onNavigateToTab && onNavigateToTab('analytics')}
                className="text-xs text-[#6D35E8] font-bold hover:underline flex items-center gap-1 cursor-pointer"
              >
                View All <ArrowRight className="w-3 h-3" />
              </button>
            }
          >
            <div className="space-y-3.5 pt-2">
              {kioskList.map((k) => (
                <div key={k.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-700 font-bold truncate max-w-[140px]">
                      {k.id} <span className="text-slate-400 font-normal">({k.name})</span>
                    </span>
                    <span className="font-mono font-black text-slate-900">{k.amount}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${k.percent}%`, backgroundColor: k.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </FinanceChartCard>
        </div>
      </div>

      {/* ── ROW 2: RECENT TRANSACTIONS + FINANCIAL ALERTS ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Transactions Table (8 Cols) */}
        <div className="lg:col-span-8 bg-white border border-[#EDE9FE] rounded-2xl p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-[#19162D]">Recent Transactions</h3>
              <p className="text-xs text-slate-400 font-medium">Latest payment transactions across all kiosks</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToTab && onNavigateToTab('transactions')}
              className="text-xs font-bold text-[#6D35E8] hover:underline flex items-center gap-1 cursor-pointer"
            >
              View All <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="whitespace-nowrap py-2.5 px-3">TXN ID</th>
                  <th className="whitespace-nowrap py-2.5 px-3">ORDER ID</th>
                  <th className="whitespace-nowrap py-2.5 px-3">USER</th>
                  <th className="whitespace-nowrap py-2.5 px-3">KIOSK</th>
                  <th className="whitespace-nowrap py-2.5 px-3">AMOUNT</th>
                  <th className="whitespace-nowrap py-2.5 px-3">METHOD</th>
                  <th className="whitespace-nowrap py-2.5 px-3">STATUS</th>
                  <th className="whitespace-nowrap py-2.5 px-3">DATE</th>
                  <th className="whitespace-nowrap py-2.5 px-3 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[
                  { id: 'TXN-8801', orderId: 'ORD-9912', user: 'rahul.s@campus.edu', kiosk: 'CV-001', amount: '₹16.10', method: 'UPI', status: 'SUCCESS', date: '2m ago' },
                  { id: 'TXN-8800', orderId: 'ORD-9911', user: 'priya.k@campus.edu', kiosk: 'CV-002', amount: '₹20.00', method: 'Card', status: 'SUCCESS', date: '5m ago' },
                  { id: 'TXN-8799', orderId: 'ORD-9910', user: 'arjun.v@campus.edu', kiosk: 'SV-001', amount: '₹32.20', method: 'UPI', status: 'PENDING', date: '12m ago' },
                  { id: 'TXN-8798', orderId: 'ORD-9909', user: 'sneha.m@campus.edu', kiosk: 'SV-002', amount: '₹10.00', method: 'Wallet', status: 'SUCCESS', date: '18m ago' },
                  { id: 'TXN-8797', orderId: 'ORD-9908', user: 'vikram.r@campus.edu', kiosk: 'CV-001', amount: '₹50.60', method: 'UPI', status: 'SUCCESS', date: '24m ago' },
                  { id: 'TXN-8796', orderId: 'ORD-9907', user: 'ananya.d@campus.edu', kiosk: 'SV-003', amount: '₹18.40', method: 'UPI', status: 'REFUNDED', date: '1h ago' },
                  { id: 'TXN-8795', orderId: 'ORD-9906', user: 'karthik.p@campus.edu', kiosk: 'CV-002', amount: '₹24.00', method: 'Card', status: 'FAILED', date: '2h ago' },
                  { id: 'TXN-8794', orderId: 'ORD-9905', user: 'neha.t@campus.edu', kiosk: 'SV-001', amount: '₹12.00', method: 'Wallet', status: 'SUCCESS', date: '3h ago' },
                ].map((txn) => (
                  <tr key={txn.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="whitespace-nowrap py-3 px-3 font-mono font-bold text-[#6D35E8]">
                      {txn.id}
                    </td>
                    <td className="whitespace-nowrap py-3 px-3 font-mono text-slate-600 font-medium">
                      {txn.orderId}
                    </td>
                    <td className="whitespace-nowrap py-3 px-3 text-slate-700 font-semibold truncate max-w-[130px]">
                      {txn.user}
                    </td>
                    <td className="whitespace-nowrap py-3 px-3 text-slate-600 font-mono text-[11px]">
                      {txn.kiosk}
                    </td>
                    <td className="whitespace-nowrap py-3 px-3 font-black text-slate-900 font-mono">
                      {txn.amount}
                    </td>
                    <td className="whitespace-nowrap py-3 px-3 text-slate-600 font-semibold">
                      {txn.method}
                    </td>
                    <td className="whitespace-nowrap py-3 px-3">
                      <StatusBadge status={txn.status} />
                    </td>
                    <td className="whitespace-nowrap py-3 px-3 text-slate-400 text-[11px] whitespace-nowrap font-medium">
                      {txn.date}
                    </td>
                    <td className="whitespace-nowrap py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedTxn(txn)}
                        className="p-1 text-slate-400 hover:text-[#6D35E8] hover:bg-[#EDE8FF] rounded-lg transition-colors cursor-pointer"
                        title="View Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Financial Alerts Panel (4 Cols) */}
        <div className="lg:col-span-4 bg-white border border-[#EDE9FE] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#EDE8FF] text-[#6D35E8] flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#19162D]">Financial Alerts</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigateToTab && onNavigateToTab('refunds')}
                className="text-xs font-bold text-[#6D35E8] hover:underline cursor-pointer"
              >
                View All →
              </button>
            </div>

            <div className="space-y-3">
              {/* Alert 1 */}
              <div
                onClick={() => onNavigateToTab && onNavigateToTab('refunds')}
                className="p-3 rounded-xl bg-rose-50/70 border border-rose-100 hover:border-rose-300 transition-all cursor-pointer flex items-start gap-3"
              >
                <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-rose-900 truncate">
                      3 pending refund requests
                    </span>
                    <span className="text-[10px] text-rose-500 font-semibold shrink-0">2h ago</span>
                  </div>
                  <p className="text-[11px] text-rose-700 mt-0.5 font-medium">
                    Total amount: ₹1,840
                  </p>
                </div>
              </div>

              {/* Alert 2 */}
              <div
                onClick={() => onNavigateToTab && onNavigateToTab('settlements')}
                className="p-3 rounded-xl bg-amber-50/70 border border-amber-100 hover:border-amber-300 transition-all cursor-pointer flex items-start gap-3"
              >
                <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-amber-900 truncate">
                      Settlement pending
                    </span>
                    <span className="text-[10px] text-amber-500 font-semibold shrink-0">3h ago</span>
                  </div>
                  <p className="text-[11px] text-amber-700 mt-0.5 font-medium">
                    ₹18,450 awaiting settlement
                  </p>
                </div>
              </div>

              {/* Alert 3 */}
              <div
                className="p-3 rounded-xl bg-amber-50/40 border border-amber-100/80 flex items-start gap-3"
              >
                <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-amber-900 truncate">
                      2 failed payments
                    </span>
                    <span className="text-[10px] text-amber-500 font-semibold shrink-0">4h ago</span>
                  </div>
                  <p className="text-[11px] text-amber-700 mt-0.5 font-medium">
                    Total amount: ₹560
                  </p>
                </div>
              </div>

              {/* Alert 4 */}
              <div
                className="p-3 rounded-xl bg-blue-50/50 border border-blue-100 flex items-start gap-3"
              >
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-blue-900 truncate">
                      Unusual transaction activity
                    </span>
                    <span className="text-[10px] text-blue-500 font-semibold shrink-0">6h ago</span>
                  </div>
                  <p className="text-[11px] text-blue-700 mt-0.5 font-medium">
                    3 high value transactions detected
                  </p>
                </div>
              </div>

              {/* Alert 5 */}
              <div
                onClick={() => onNavigateToTab && onNavigateToTab('wallet')}
                className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-100 hover:border-emerald-300 transition-all cursor-pointer flex items-start gap-3"
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Wallet className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-emerald-900 truncate">
                      Wallet balance low
                    </span>
                    <span className="text-[10px] text-emerald-500 font-semibold shrink-0">8h ago</span>
                  </div>
                  <p className="text-[11px] text-emerald-700 mt-0.5 font-medium">
                    5 users have negative balance
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── TRANSACTION DETAILS DRAWER ────────────────────────────────────────── */}
      <FinanceDetailsDrawer
        isOpen={Boolean(selectedTxn)}
        onClose={() => setSelectedTxn(null)}
        title="Transaction Details"
        subtitle={selectedTxn?.orderId ? `Order Ref: ${selectedTxn.orderId}` : 'Transaction Inspection'}
        badge={<StatusBadge status={selectedTxn?.status || 'SUCCESS'} />}
      >
        {selectedTxn && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-purple-50 border border-purple-100">
              <span className="text-purple-600 text-[11px] block mb-1 font-semibold">Total Transaction Value</span>
              <span className="text-2xl font-black text-[#19162D] font-mono">
                {selectedTxn.amount || '₹16.10'}
              </span>
            </div>

            <div className="space-y-2.5 border-t border-slate-100 pt-3">
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Transaction ID:</span>
                <span className="font-mono font-bold text-slate-800">{selectedTxn.id}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Order ID:</span>
                <span className="font-mono font-bold text-slate-800">{selectedTxn.orderId}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Customer:</span>
                <span className="font-bold text-slate-800">{selectedTxn.user}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Kiosk Station:</span>
                <span className="font-mono font-bold text-slate-800">{selectedTxn.kiosk}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Payment Channel:</span>
                <span className="font-bold text-slate-800">{selectedTxn.method}</span>
              </div>
            </div>
          </div>
        )}
      </FinanceDetailsDrawer>
    </div>
  );
};
