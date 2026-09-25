import React, { useState } from 'react';
import {
  IndianRupee,
  TrendingUp,
  BarChart3,
  Layers,
  Printer,
  Download,
  Clock,
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
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { FinanceMetricCard } from '../components/FinanceMetricCard';
import { FinanceChartCard } from '../components/FinanceChartCard';

export interface FinanceAnalyticsPageProps {
  metrics: {
    totalRevenue: number;
    totalOrders: number;
    totalPages: number;
    activeUsers: number;
  };
  loading: boolean;
}

export const FinanceAnalyticsPage: React.FC<FinanceAnalyticsPageProps> = ({
  metrics,
  loading,
}) => {
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');
  const [selectedKiosk, setSelectedKiosk] = useState('ALL');

  const grossRevenue = metrics.totalRevenue || 142500;
  const netRevenue = grossRevenue - 3240;
  const totalOrders = metrics.totalOrders || 8420;
  const aov = totalOrders > 0 ? (grossRevenue / totalOrders).toFixed(2) : '16.92';
  const revenuePerKiosk = (grossRevenue / 5).toFixed(0);

  // Chart 1: Revenue Over Time
  const revenueTimeData = [
    { label: '08:00', revenue: 4200, orders: 240 },
    { label: '10:00', revenue: 12800, orders: 760 },
    { label: '12:00', revenue: 24500, orders: 1420 },
    { label: '14:00', revenue: 31200, orders: 1850 },
    { label: '16:00', revenue: 28400, orders: 1680 },
    { label: '18:00', revenue: 22100, orders: 1310 },
    { label: '20:00', revenue: 14300, orders: 840 },
    { label: '22:00', revenue: 5000, orders: 320 },
  ];

  // Chart 2: Revenue by Printing Mode
  const printingModeData = [
    { name: 'Black & White (A4)', value: 88400, color: '#6D35E8', percent: '62%' },
    { name: 'Color Printing', value: 39900, color: '#00C7F2', percent: '28%' },
    { name: 'Duplex (Double Sided)', value: 14200, color: '#10B981', percent: '10%' },
  ];

  // Chart 3: Revenue by Campus Location
  const locationData = [
    { location: 'Central Library', revenue: 48900, orders: 2890 },
    { location: 'Engineering Block 1', revenue: 38200, orders: 2240 },
    { location: 'Student Cafeteria', revenue: 29500, orders: 1740 },
    { location: 'Science Complex', revenue: 15400, orders: 920 },
    { location: 'Hostel Quad', revenue: 10500, orders: 630 },
  ];

  // Chart 4: Revenue vs Refunds
  const revenueVsRefundsData = [
    { month: 'May', gross: 24000, refunds: 800, net: 23200 },
    { month: 'Jun', gross: 28500, refunds: 650, net: 27850 },
    { month: 'Jul', gross: 34200, refunds: 920, net: 33280 },
    { month: 'Aug', gross: 41000, refunds: 1100, net: 39900 },
    { month: 'Sep', gross: 48900, refunds: 1240, net: 47660 },
  ];

  // Chart 5: Peak Revenue Hours
  const peakHoursData = [
    { hour: '8 AM', volume: 15 },
    { hour: '10 AM', volume: 45 },
    { hour: '11 AM', volume: 78 },
    { hour: '12 PM', volume: 95 },
    { hour: '1 PM', volume: 88 },
    { hour: '2 PM', volume: 92 },
    { hour: '3 PM', volume: 84 },
    { hour: '4 PM', volume: 76 },
    { hour: '5 PM', volume: 62 },
    { hour: '6 PM', volume: 48 },
    { hour: '8 PM', volume: 30 },
    { hour: '10 PM', volume: 12 },
  ];

  const exportAnalyticsReport = () => {
    const csv =
      'data:text/csv;charset=utf-8,' +
      'Location,Revenue (INR),Orders\n' +
      locationData.map((l) => `"${l.location}",${l.revenue},${l.orders}`).join('\n');
    const encoded = encodeURI(csv);
    const link = document.createElement('a');
    link.href = encoded;
    link.download = `MIMO_Revenue_Analytics_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* ── TOP METRICS ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <FinanceMetricCard
          title="Gross Revenue"
          value={`₹${grossRevenue.toLocaleString('en-IN')}`}
          change="+18.5%"
          trend="up"
          icon={<IndianRupee className="w-5 h-5" />}
          iconBgColor="bg-emerald-50"
          iconColor="text-emerald-600"
          loading={loading}
        />
        <FinanceMetricCard
          title="Net Revenue"
          value={`₹${netRevenue.toLocaleString('en-IN')}`}
          change="+17.2%"
          trend="up"
          icon={<TrendingUp className="w-5 h-5" />}
          iconBgColor="bg-purple-50"
          iconColor="text-[#6D35E8]"
          loading={loading}
        />
        <FinanceMetricCard
          title="Total Print Orders"
          value={totalOrders.toLocaleString('en-IN')}
          change="+24.1%"
          trend="up"
          icon={<Printer className="w-5 h-5" />}
          iconBgColor="bg-cyan-50"
          iconColor="text-cyan-600"
          loading={loading}
        />
        <FinanceMetricCard
          title="Avg. Order Value (AOV)"
          value={`₹${aov}`}
          change="₹16.92 / job"
          trend="neutral"
          icon={<BarChart3 className="w-5 h-5" />}
          iconBgColor="bg-amber-50"
          iconColor="text-amber-600"
          loading={loading}
        />
        <FinanceMetricCard
          title="Revenue Growth (MoM)"
          value="+19.4%"
          change="Accelerating"
          trend="up"
          icon={<Layers className="w-5 h-5" />}
          iconBgColor="bg-indigo-50"
          iconColor="text-indigo-600"
          loading={loading}
        />
        <FinanceMetricCard
          title="Revenue Per Kiosk"
          value={`₹${Number(revenuePerKiosk).toLocaleString('en-IN')}`}
          change="5 Active Stations"
          trend="up"
          icon={<Clock className="w-5 h-5" />}
          iconBgColor="bg-rose-50"
          iconColor="text-rose-600"
          loading={loading}
        />
      </div>

      {/* ── FILTER & ACTION HEADER ─────────────────────────────────────────────── */}
      <div className="bg-white border border-[#EDE9FE] rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-xs font-semibold">
            {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 rounded-lg capitalize transition-all cursor-pointer ${
                  timeframe === tf
                    ? 'bg-[#6D35E8] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <select
            value={selectedKiosk}
            onChange={(e) => setSelectedKiosk(e.target.value)}
            className="bg-[#FAF9FD] border border-[#EDE9FE] text-xs font-semibold text-slate-700 px-3 py-1.5 rounded-xl focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Kiosks</option>
            <option value="CV-001">CV-001 (Main Library)</option>
            <option value="CV-002">CV-002 (Admin Block)</option>
            <option value="SV-001">SV-001 (Cafeteria)</option>
            <option value="SV-002">SV-002 (Hostel Block)</option>
          </select>
        </div>

        <button
          onClick={exportAnalyticsReport}
          className="px-4 py-2 text-xs font-bold text-white bg-[#6D35E8] hover:bg-[#5b29c9] rounded-xl shadow-md shadow-purple-500/20 transition-all flex items-center gap-2 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          Export Intelligence Report
        </button>
      </div>

      {/* ── ROW 1: REVENUE OVER TIME & REVENUE BY PRINTING MODE ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <FinanceChartCard
            title="Revenue & Order Volume Over Time"
            subtitle="Hourly transaction density and gross intake"
          >
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueTimeData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="areaRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6D35E8" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#6D35E8" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="label" stroke="#94A3B8" fontSize={11} />
                  <YAxis stroke="#94A3B8" fontSize={11} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString('en-IN')}`} />
                  <Area type="monotone" dataKey="revenue" stroke="#6D35E8" strokeWidth={3} fillOpacity={1} fill="url(#areaRev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </FinanceChartCard>
        </div>

        <div className="lg:col-span-4">
          <FinanceChartCard
            title="Revenue by Printing Mode"
            subtitle="Breakdown by B&W, Color & Duplex"
            icon={<PieIcon className="w-4 h-4" />}
          >
            <div className="h-48 relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={printingModeData} innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="value">
                    {printingModeData.map((e, idx) => (
                      <Cell key={`cell-${idx}`} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString('en-IN')}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-2">
              {printingModeData.map((mode) => (
                <div key={mode.name} className="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: mode.color }} />
                    <span className="text-slate-700 font-medium">{mode.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-mono text-[11px]">{mode.percent}</span>
                    <span className="font-bold text-slate-900 font-mono">₹{mode.value.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              ))}
            </div>
          </FinanceChartCard>
        </div>
      </div>

      {/* ── ROW 2: LOCATION REVENUE & REVENUE VS REFUNDS & PEAK HOURS ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4">
          <FinanceChartCard
            title="Revenue by Campus Location"
            subtitle="Comparative kiosk performance"
          >
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={locationData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <XAxis type="number" stroke="#94A3B8" fontSize={10} tickFormatter={(v) => `₹${v / 1000}k`} />
                  <YAxis type="category" dataKey="location" stroke="#94A3B8" fontSize={10} width={90} tickFormatter={(v) => v.split(' ')[0]} />
                  <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString('en-IN')}`} />
                  <Bar dataKey="revenue" fill="#6D35E8" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </FinanceChartCard>
        </div>

        <div className="lg:col-span-4">
          <FinanceChartCard
            title="Revenue vs Refunds"
            subtitle="Monthly gross intake and refund overhead"
          >
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueVsRefundsData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="month" stroke="#94A3B8" fontSize={11} />
                  <YAxis stroke="#94A3B8" fontSize={11} tickFormatter={(v) => `₹${v / 1000}k`} />
                  <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString('en-IN')}`} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar dataKey="gross" name="Gross Revenue" fill="#6D35E8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="net" name="Net Revenue" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="refunds" name="Refunds" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </FinanceChartCard>
        </div>

        <div className="lg:col-span-4">
          <FinanceChartCard
            title="Peak Revenue Hours"
            subtitle="Campus traffic heat by hour"
          >
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={peakHoursData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="hour" stroke="#94A3B8" fontSize={10} />
                  <YAxis stroke="#94A3B8" fontSize={10} />
                  <Tooltip formatter={(v: any) => [`${v}% Volume`, 'Utilization']} />
                  <Bar dataKey="volume" fill="#00C7F2" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </FinanceChartCard>
        </div>
      </div>
    </div>
  );
};
