import React, { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  AlertTriangle,
  ChevronRight,
  Sparkles,
  Printer,
  Zap,
  Cpu,
  Check,
} from 'lucide-react';
import { DashboardOverviewData } from '../../types/dashboard.types';
import { dashboardService } from '../../services/dashboard.service';
import { useTheme } from '../../context/ThemeContext';

export const OverviewPage: React.FC = () => {
  const { isDark } = useTheme();
  const [data, setData] = useState<DashboardOverviewData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    dashboardService.getDashboardOverview().then((res) => {
      if (isMounted) {
        setData(res);
        setLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#7c3aed] border-t-transparent" />
      </div>
    );
  }

  const { kpis, revenueTrends, fulfillment, needsAttention, kiosks, liveOperations, intelligence, incidents } = data;

  // Donut Gauge Ring calculation
  const radius = 62;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (fulfillment.percentage / 100) * circumference;

  return (
    <div className="w-full space-y-5 pb-10 select-none font-sans">
      {/* ── 1. Dashboard Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className={`text-2xl sm:text-3xl font-black tracking-tight ${
            isDark ? 'text-white' : 'text-[#1e1b4b]'
          }`}>
            Executive Dashboard
          </h1>
          <p className={`text-xs sm:text-sm font-medium mt-0.5 ${
            isDark ? 'text-slate-400' : 'text-gray-500'
          }`}>
            Welcome back — real-time campus print network telemetry
          </p>
        </div>

        {/* Live Telemetry Status Pill */}
        <div className="self-start sm:self-auto">
          <span className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider shadow-sm ${
            isDark
              ? 'bg-purple-950/60 border border-purple-800/60 text-[#a78bfa]'
              : 'bg-[#f3e8ff] border border-[#ddd6fe] text-[#7c3aed]'
          }`}>
            <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
            LIVE TELEMETRY ACTIVE
          </span>
        </div>
      </div>

      {/* ── 2. Top KPI Row (4 Large Equal Cards) ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Revenue (Solid/Gradient Purple Card) */}
        <div className="rounded-2xl p-5 flex flex-col justify-between bg-gradient-to-br from-[#7c3aed] via-[#702be7] to-[#6d28d9] text-white shadow-lg shadow-purple-500/15 min-h-[140px]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-white/80">
              TOTAL REVENUE
            </span>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#22c55e]/25 text-[#86efac] border border-[#22c55e]/30">
                +14.2%
              </span>
              <div className="w-6 h-6 rounded-full bg-white/20 text-white flex items-center justify-center font-bold text-xs">
                ₹
              </div>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black tracking-tight text-white">
              ₹14250.00
            </div>
            <p className="text-xs font-medium text-white/75 mt-1">
              Daily print billing
            </p>
          </div>
        </div>

        {/* KPI 2: Paid Pages */}
        <div className={`rounded-2xl p-5 flex flex-col justify-between border shadow-sm min-h-[140px] ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${
              isDark ? 'text-slate-400' : 'text-gray-500'
            }`}>
              PAID PAGES
            </span>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                +8.6%
              </span>
              <div className="w-6 h-6 rounded-lg bg-orange-500/15 text-orange-400 flex items-center justify-center">
                <Zap size={13} className="fill-orange-400" />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <div className={`text-3xl font-black tracking-tight ${
              isDark ? 'text-white' : 'text-[#1e1b4b]'
            }`}>
              4821
            </div>
            <p className={`text-xs font-medium mt-1 ${
              isDark ? 'text-slate-400' : 'text-gray-400'
            }`}>
              184 free pages
            </p>
          </div>
        </div>

        {/* KPI 3: Printed Pages */}
        <div className={`rounded-2xl p-5 flex flex-col justify-between border shadow-sm min-h-[140px] ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${
              isDark ? 'text-slate-400' : 'text-gray-500'
            }`}>
              PRINTED PAGES
            </span>
            <div className="w-6 h-6 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center">
              <Printer size={13} />
            </div>
          </div>
          <div className="mt-4">
            <div className={`text-3xl font-black tracking-tight ${
              isDark ? 'text-white' : 'text-[#1e1b4b]'
            }`}>
              4762
            </div>
            <p className={`text-xs font-medium mt-1 ${
              isDark ? 'text-slate-400' : 'text-gray-400'
            }`}>
              lifetime: 4946
            </p>
          </div>
        </div>

        {/* KPI 4: Success Rate */}
        <div className={`rounded-2xl p-5 flex flex-col justify-between border shadow-sm min-h-[140px] ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${
              isDark ? 'text-slate-400' : 'text-gray-500'
            }`}>
              SUCCESS RATE
            </span>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Target 98%
              </span>
              <div className="w-6 h-6 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center">
                <Check size={13} className="stroke-[3]" />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <div className={`text-3xl font-black tracking-tight ${
              isDark ? 'text-white' : 'text-[#1e1b4b]'
            }`}>
              98.8%
            </div>
            <p className={`text-xs font-medium mt-1 ${
              isDark ? 'text-slate-400' : 'text-gray-400'
            }`}>
              Across all nodes
            </p>
          </div>
        </div>
      </div>

      {/* ── 3. Second Row (3 Summary Cards) ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Customer Value at Risk */}
        <div className={`rounded-2xl p-5 flex flex-col justify-between border shadow-sm ${
          isDark ? 'bg-[#1e293b] border-amber-500/30' : 'bg-white border-amber-200/80'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center border border-amber-500/30">
                <AlertTriangle size={13} />
              </div>
              <span className={`text-[11px] font-extrabold uppercase tracking-wider ${
                isDark ? 'text-amber-300' : 'text-gray-600'
              }`}>
                CUSTOMER VALUE AT RISK
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-amber-500/20 text-amber-400 border border-amber-500/30">
              2 AT RISK
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black tracking-tight text-amber-500">
              ₹580.00
            </div>
            <p className={`text-xs font-medium mt-1 ${
              isDark ? 'text-slate-400' : 'text-gray-500'
            }`}>
              Pending print retries or unfulfilled orders
            </p>
          </div>
        </div>

        {/* Card 2: Kiosk Network Status */}
        <div className={`rounded-2xl p-5 flex items-center justify-between border shadow-sm ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center border border-amber-500/30 flex-shrink-0">
              <Cpu size={20} />
            </div>
            <div>
              <div className={`text-[11px] font-extrabold uppercase tracking-wider ${
                isDark ? 'text-slate-300' : 'text-gray-600'
              }`}>
                KIOSK NETWORK STATUS
              </div>
              <div className={`text-xs font-medium mt-0.5 ${
                isDark ? 'text-slate-400' : 'text-gray-400'
              }`}>
                Autonomous edge nodes
              </div>
            </div>
          </div>
          <div className={`text-2xl sm:text-3xl font-black tracking-tight ${
            isDark ? 'text-white' : 'text-[#1e1b4b]'
          }`}>
            2/4 Online
          </div>
        </div>

        {/* Card 3: Active Print Queue */}
        <div className={`rounded-2xl p-5 flex items-center justify-between border shadow-sm ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center border border-blue-500/30 flex-shrink-0">
              <Printer size={20} />
            </div>
            <div>
              <div className={`text-[11px] font-extrabold uppercase tracking-wider ${
                isDark ? 'text-slate-300' : 'text-gray-600'
              }`}>
                ACTIVE PRINT QUEUE
              </div>
              <div className={`text-xs font-medium mt-0.5 ${
                isDark ? 'text-slate-400' : 'text-gray-400'
              }`}>
                Real-time dispatch pipeline
              </div>
            </div>
          </div>
          <div className={`text-2xl sm:text-3xl font-black tracking-tight ${
            isDark ? 'text-white' : 'text-[#1e1b4b]'
          }`}>
            3 Jobs
          </div>
        </div>
      </div>

      {/* ── 4. Analytics Section: Revenue Trends Chart + Paid Page Fulfillment Donut ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Revenue Trends (approx 65-70% width, col-span-8) */}
        <div className={`lg:col-span-8 border shadow-sm rounded-2xl p-6 flex flex-col justify-between ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h2 className={`text-lg font-black tracking-tight ${
                isDark ? 'text-white' : 'text-[#1e1b4b]'
              }`}>
                Revenue Trends
              </h2>
              <p className={`text-xs mt-0.5 ${
                isDark ? 'text-slate-400' : 'text-gray-400'
              }`}>
                Daily print volume and financial collections
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider self-start sm:self-auto ${
              isDark
                ? 'bg-purple-950/60 text-[#a78bfa] border border-purple-800/60'
                : 'bg-purple-50 text-purple-700 border border-purple-100'
            }`}>
              All Months
            </span>
          </div>

          {/* Area Chart Container */}
          <div className="h-64 sm:h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={revenueTrends}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="purpleRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={isDark ? '#334155' : '#f1f5f9'}
                />
                <XAxis
                  dataKey="displayDate"
                  tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  dy={8}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  dx={-4}
                  tickFormatter={(v) => `₹${v}`}
                  ticks={[0, 400, 800, 1200, 1600]}
                  domain={[0, 1600]}
                />
                <Tooltip
                  cursor={{ stroke: '#7c3aed', strokeWidth: 1, strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className={`rounded-xl p-3 shadow-xl text-xs space-y-1 border ${
                          isDark ? 'bg-[#0f172a] border-slate-700 text-white' : 'bg-white border-[#ede9fe] text-[#1e1b4b]'
                        }`}>
                          <div className="font-bold text-gray-400 text-[10px]">{d.date}</div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[#a78bfa] font-bold">Revenue:</span>
                            <span className="font-black">₹{d.revenue}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-gray-400">Paid Pages:</span>
                            <span className="font-bold">{d.paidPageVolume}</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#7c3aed"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#purpleRevGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Paid Page Fulfillment (approx 30-35% width, col-span-4) */}
        <div className={`lg:col-span-4 border shadow-sm rounded-2xl p-6 flex flex-col justify-between ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <h2 className={`text-lg font-black tracking-tight ${
              isDark ? 'text-white' : 'text-[#1e1b4b]'
            }`}>
              Paid Page Fulfillment
            </h2>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wider ${
              isDark ? 'bg-purple-950/60 text-[#a78bfa]' : 'bg-purple-100 text-purple-700'
            }`}>
              98.8% SLA
            </span>
          </div>

          {/* Centered Circular Donut Chart */}
          <div className="flex flex-col items-center justify-center my-auto py-4">
            <div className="relative w-44 h-44 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
                {/* Background Ring */}
                <circle
                  cx="80"
                  cy="80"
                  r={radius}
                  stroke={isDark ? '#334155' : '#f3e8ff'}
                  strokeWidth={strokeWidth}
                  fill="transparent"
                />
                {/* Progress Ring */}
                <circle
                  cx="80"
                  cy="80"
                  r={radius}
                  stroke="#7c3aed"
                  strokeWidth={strokeWidth}
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              {/* Inner Center Statistics */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className={`text-4xl font-black tracking-tight ${
                  isDark ? 'text-white' : 'text-[#1e1b4b]'
                }`}>
                  98.8%
                </span>
                <span className={`text-[11px] font-black uppercase tracking-wider mt-0.5 ${
                  isDark ? 'text-[#a78bfa]' : 'text-[#7c3aed]'
                }`}>
                  FULFILLED
                </span>
                <span className={`text-xs font-medium mt-1 ${
                  isDark ? 'text-slate-400' : 'text-gray-400'
                }`}>
                  4,762 / 4,821 pages
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Legend */}
          <div className={`pt-4 border-t flex items-center justify-center gap-6 text-xs font-bold ${
            isDark ? 'border-slate-700 text-slate-300' : 'border-gray-100 text-gray-500'
          }`}>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#7c3aed]" />
              <span>Fulfilled (98.8%)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isDark ? 'bg-slate-700' : 'bg-[#ede9fe]'}`} />
              <span className={isDark ? 'text-slate-500' : 'text-gray-400'}>Remainder (1.2%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. Lower Operational Sections ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card 1: Needs Attention */}
        <div className={`border shadow-sm rounded-2xl p-5 flex flex-col justify-between ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className={`text-sm font-black tracking-tight ${
                isDark ? 'text-white' : 'text-[#1e1b4b]'
              }`}>
                Needs Attention
              </h2>
              <span className="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center bg-red-500/20 text-red-400">
                {needsAttention.length}
              </span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              UPDATED 12s AGO
            </span>
          </div>

          <div className="space-y-2 flex-1">
            {needsAttention.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border p-3 flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                  isDark
                    ? 'bg-slate-800/60 border-slate-700/60 hover:border-purple-500/50'
                    : 'bg-gray-50/70 border-gray-100 hover:border-purple-200'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      item.severity === 'critical'
                        ? 'bg-red-500'
                        : item.severity === 'warning'
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                  />
                  <div className="truncate">
                    <p className={`text-xs font-bold truncate ${
                      isDark ? 'text-white' : 'text-[#1e1b4b]'
                    }`}>
                      {item.title}
                    </p>
                    {item.description && (
                      <p className="text-[11px] truncate text-gray-400">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-medium text-gray-400 flex-shrink-0">
                  <span>{item.timeAgo}</span>
                  <ChevronRight size={13} className="text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Card 2: Kiosk Network */}
        <div className={`border shadow-sm rounded-2xl p-5 flex flex-col justify-between ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-sm font-black tracking-tight ${
                  isDark ? 'text-white' : 'text-[#1e1b4b]'
                }`}>
                  Kiosk Network
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {kiosks.filter((k) => k.status === 'Online').length} ONLINE
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Fleet-health kiosk entities
              </p>
            </div>
            <button
              type="button"
              className="text-xs font-bold text-[#a78bfa] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
            >
              View all <ChevronRight size={13} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1">
            {kiosks.slice(0, 2).map((kiosk) => (
              <div
                key={kiosk.id}
                className={`rounded-xl border p-3 flex flex-col justify-between space-y-2 transition-colors ${
                  isDark
                    ? 'bg-slate-800/60 border-slate-700/60 hover:border-purple-500/50'
                    : 'bg-gray-50/70 border-gray-100 hover:border-purple-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>
                    {kiosk.name}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {kiosk.status}
                  </span>
                </div>
                <div className="space-y-0.5 text-[11px] text-gray-400">
                  <div>{kiosk.pagesToday} pages</div>
                  <div className={`font-bold ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>₹{kiosk.revenueToday}</div>
                  <div className="text-[#a78bfa] font-bold">{kiosk.successRate}% success</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Card 3: Live Print Operations Table */}
        <div className={`border shadow-sm rounded-2xl p-5 flex flex-col justify-between ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <h2 className={`text-sm font-black tracking-tight ${
              isDark ? 'text-white' : 'text-[#1e1b4b]'
            }`}>
              Live Print Operations
            </h2>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              REAL-TIME QUEUE
            </span>
          </div>
          <p className="text-[10px] text-gray-400 mb-3 truncate">
            Real-time queue dispatch telemetry
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className={`border-b text-[10px] uppercase font-extrabold ${
                  isDark ? 'border-slate-700 text-slate-400' : 'border-gray-100 text-gray-400'
                }`}>
                  <th className="pb-2 font-bold">Name</th>
                  <th className="pb-2 font-bold">Kiosk</th>
                  <th className="pb-2 font-bold">Pages</th>
                  <th className="pb-2 font-bold">Stage</th>
                  <th className="pb-2 font-bold text-right">Status</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-slate-700/60' : 'divide-gray-100'}`}>
                {liveOperations.slice(0, 3).map((op) => (
                  <tr key={op.id} className="hover:bg-purple-500/10 transition-colors">
                    <td className={`py-2.5 pr-1 font-bold truncate max-w-[90px] text-[11px] ${
                      isDark ? 'text-white' : 'text-[#1e1b4b]'
                    }`}>
                      {op.fileName}
                    </td>
                    <td className="py-2.5 pr-1 text-gray-400 text-[11px] whitespace-nowrap">
                      {op.kioskName}
                    </td>
                    <td className={`py-2.5 pr-1 font-bold text-[11px] whitespace-nowrap ${
                      isDark ? 'text-white' : 'text-[#1e1b4b]'
                    }`}>
                      {op.pageCount} pgs
                    </td>
                    <td className="py-2.5 pr-1 text-gray-400 text-[11px] whitespace-nowrap">
                      {op.stage}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider ${
                          op.status === 'ACTIVE'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : op.status === 'PRINTING'
                            ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {op.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── 6. Executive Section: MIMO Intelligence & Incidents ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: MIMO Intelligence */}
        <div className={`lg:col-span-8 border shadow-sm rounded-2xl p-6 flex flex-col justify-between ${
          isDark
            ? 'bg-gradient-to-br from-slate-900 via-purple-950/30 to-slate-900 border-purple-800/40'
            : 'bg-gradient-to-br from-purple-50/90 via-indigo-50/40 to-white border-purple-200/80'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#7c3aed] text-white flex items-center justify-center shadow-sm">
                <Sparkles size={14} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className={`text-sm font-black tracking-tight ${
                    isDark ? 'text-white' : 'text-[#1e1b4b]'
                  }`}>
                    MIMO Intelligence
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-purple-500/20 text-[#a78bfa] border border-purple-500/30">
                    LIVE
                  </span>
                </div>
              </div>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              UPDATED 12s AGO
            </span>
          </div>
          <p className="text-xs font-medium text-gray-400 mb-4">
            Executive telemetry analysis module
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-semibold">
            {intelligence.map((insight) => (
              <div key={insight.id} className={`flex items-start gap-2 border rounded-xl p-3 shadow-2xs ${
                isDark ? 'bg-slate-800/80 border-slate-700 text-slate-200' : 'bg-white/80 border-purple-100 text-gray-700'
              }`}>
                <span className="text-[#a78bfa] font-bold">•</span>
                <span>{insight.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Incidents 3-Tier Widget */}
        <div className={`lg:col-span-4 border shadow-sm rounded-2xl p-6 flex flex-col justify-between ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <span className={`text-xs font-black uppercase tracking-wider ${
              isDark ? 'text-white' : 'text-[#1e1b4b]'
            }`}>
              Incidents
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              LAST 24 HOURS
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5 my-auto">
            {/* Critical */}
            <div className={`border rounded-xl p-3 text-center flex flex-col items-center justify-center ${
              isDark ? 'bg-red-950/40 border-red-800/50 text-red-300' : 'bg-red-50 border-red-200 text-red-900'
            }`}>
              <div className="text-2xl font-black text-red-500">{incidents.critical}</div>
              <div className="text-[9px] font-extrabold uppercase tracking-wider mt-1 text-red-400">
                Critical
              </div>
            </div>
            {/* High */}
            <div className={`border rounded-xl p-3 text-center flex flex-col items-center justify-center ${
              isDark ? 'bg-amber-950/40 border-amber-800/50 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}>
              <div className="text-2xl font-black text-amber-500">{incidents.high}</div>
              <div className="text-[9px] font-extrabold uppercase tracking-wider mt-1 text-amber-400">
                High
              </div>
            </div>
            {/* Medium */}
            <div className={`border rounded-xl p-3 text-center flex flex-col items-center justify-center ${
              isDark ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}>
              <div className="text-2xl font-black text-emerald-500">{incidents.medium}</div>
              <div className="text-[9px] font-extrabold uppercase tracking-wider mt-1 text-emerald-400">
                Medium
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
