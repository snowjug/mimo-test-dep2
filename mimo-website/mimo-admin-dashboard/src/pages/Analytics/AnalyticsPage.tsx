import React, { useState } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  Printer,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const REVENUE_DATA = [
  { date: 'Aug 27', revenue: 220, paidPages: 240, printedPages: 235 },
  { date: 'Aug 29', revenue: 190, paidPages: 210, printedPages: 205 },
  { date: 'Aug 31', revenue: 341.7, paidPages: 380, printedPages: 375 },
  { date: 'Sep 02', revenue: 260, paidPages: 290, printedPages: 285 },
  { date: 'Sep 04', revenue: 682, paidPages: 710, printedPages: 698 },
  { date: 'Sep 06', revenue: 520, paidPages: 560, printedPages: 550 },
  { date: 'Sep 08', revenue: 890, paidPages: 920, printedPages: 910 },
  { date: 'Sep 09', revenue: 760, paidPages: 800, printedPages: 790 },
  { date: 'Sep 10', revenue: 840, paidPages: 870, printedPages: 860 },
  { date: 'Sep 12', revenue: 210, paidPages: 230, printedPages: 228 },
];

const KIOSK_UTILIZATION_DATA = [
  { kiosk: 'MIMO 1', bwPages: 280, colorPages: 70, revenue: 840 },
  { kiosk: 'MIMO 2', bwPages: 420, colorPages: 194, revenue: 1480 },
  { kiosk: 'MIMO 3', bwPages: 310, colorPages: 40, revenue: 840 },
  { kiosk: 'MIMO 4', bwPages: 160, colorPages: 30, revenue: 456 },
];

const HOURLY_TRAFFIC = [
  { hour: '8 AM', prints: 35 },
  { hour: '10 AM', prints: 110 },
  { hour: '12 PM', prints: 240 },
  { hour: '2 PM', prints: 190 },
  { hour: '4 PM', prints: 280 },
  { hour: '6 PM', prints: 160 },
  { hour: '8 PM', prints: 75 },
];

export const AnalyticsPage: React.FC = () => {
  const { isDark } = useTheme();
  const [timeframe, setTimeframe] = useState<'7D' | '30D' | '90D' | 'ALL'>('30D');

  return (
    <div className="w-full space-y-6 pb-12 select-none font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className={`text-2xl sm:text-3xl font-black tracking-tight ${
            isDark ? 'text-white' : 'text-[#1e1b4b]'
          }`}>
            Telemetry Analytics
          </h1>
          <p className={`text-xs sm:text-sm font-medium mt-0.5 ${
            isDark ? 'text-slate-400' : 'text-gray-500'
          }`}>
            Deep dive into print volume, revenue trends, kiosk load, and operational SLA performance
          </p>
        </div>

        {/* Timeframe Filter Pills */}
        <div className={`flex items-center gap-1.5 p-1 rounded-xl border shadow-sm self-start sm:self-auto ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          {['7D', '30D', '90D', 'ALL'].map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timeframe === tf
                  ? 'bg-[#7c3aed] text-white shadow-xs'
                  : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Row (4 cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`border rounded-2xl p-5 shadow-sm ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">TOTAL REVENUE</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">+14.2%</span>
          </div>
          <div className="mt-3">
            <div className={`text-3xl font-black ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>₹14,250.00</div>
            <p className="text-xs text-gray-400 mt-0.5">Daily print billing</p>
          </div>
        </div>

        <div className={`border rounded-2xl p-5 shadow-sm ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">PAID VOLUME</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">+8.6%</span>
          </div>
          <div className="mt-3">
            <div className={`text-3xl font-black ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>4,821</div>
            <p className="text-xs text-gray-400 mt-0.5">184 free promo pages</p>
          </div>
        </div>

        <div className={`border rounded-2xl p-5 shadow-sm ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">DISPATCH SUCCESS</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/15 text-purple-400 border border-purple-500/30">Target 98%</span>
          </div>
          <div className="mt-3">
            <div className={`text-3xl font-black ${isDark ? 'text-purple-400' : 'text-[#7c3aed]'}`}>98.8%</div>
            <p className="text-xs text-gray-400 mt-0.5">Across all 4 kiosks</p>
          </div>
        </div>

        <div className={`border rounded-2xl p-5 shadow-sm ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">TOTAL PRINTED</span>
            <div className="w-6 h-6 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center">
              <Printer size={13} />
            </div>
          </div>
          <div className="mt-3">
            <div className={`text-3xl font-black ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>4,762</div>
            <p className="text-xs text-gray-400 mt-0.5">lifetime: 4,946</p>
          </div>
        </div>
      </div>

      {/* Main Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Revenue Area Chart (7 cols) */}
        <div className={`lg:col-span-7 border rounded-2xl p-6 shadow-sm flex flex-col justify-between ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className={`text-base font-bold ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>Revenue & Volume Trajectory</h2>
              <p className="text-xs text-gray-400 mt-0.5">Collections vs paid sheet dispatches</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
              isDark ? 'bg-purple-950/60 text-[#a78bfa]' : 'bg-purple-50 text-[#7c3aed]'
            }`}>
              Daily Volume
            </span>
          </div>

          <div className="h-68 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={REVENUE_DATA} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#334155' : '#f1f5f9'} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className={`rounded-xl p-3 shadow-xl text-xs space-y-1 border ${
                          isDark ? 'bg-[#0f172a] border-slate-700 text-white' : 'bg-white border-[#ede9fe] text-[#1e1b4b]'
                        }`}>
                          <div className="font-bold text-gray-400 text-[10px]">{d.date}</div>
                          <div className="font-black">Revenue: ₹{d.revenue}</div>
                          <div className="text-gray-400">Paid Pages: {d.paidPages}</div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#7c3aed" strokeWidth={3} fill="url(#purpleGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Kiosk Node Utilization Bar Chart (5 cols) */}
        <div className={`lg:col-span-5 border rounded-2xl p-6 shadow-sm flex flex-col justify-between ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className={`text-base font-bold ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>Kiosk Volume Distribution</h2>
              <p className="text-xs text-gray-400 mt-0.5">B&W vs Color pages printed by node</p>
            </div>
          </div>

          <div className="h-68 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={KIOSK_UTILIZATION_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#334155' : '#f1f5f9'} />
                <XAxis dataKey="kiosk" tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="bwPages" name="B&W Pages" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                <Bar dataKey="colorPages" name="Color Pages" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Hourly Peak Rush Traffic Card */}
      <div className={`border rounded-2xl p-6 shadow-sm ${
        isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className={`text-base font-bold ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>Hourly Campus Traffic Rush</h2>
            <p className="text-xs text-gray-400 mt-0.5">Peak print queue activity by time of day</p>
          </div>
          <span className="text-xs font-bold text-gray-400">Peak: 4 PM - 6 PM</span>
        </div>

        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={HOURLY_TRAFFIC} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#334155' : '#f1f5f9'} />
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="prints" name="Print Dispatches" fill="#a855f7" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
