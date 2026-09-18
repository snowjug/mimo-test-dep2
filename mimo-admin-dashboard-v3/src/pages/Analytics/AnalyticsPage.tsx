import React from 'react';
import {
  IndianRupee,
  FileText,
  Printer,
  Percent,
  Users,
  Download,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  FileSpreadsheet,
  FileDown,
} from 'lucide-react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useAnalytics } from '../../hooks/useAnalytics';
import { MetricCard } from '../../components/cards/MetricCard';
import { PageHeader } from '../../components/ui/PageHeader';
import { LoadingSkeleton } from '../../components/ui/LoadingSkeleton';
import { EmptyState } from '../../components/ui/EmptyState';

export interface AnalyticsPageProps {
  searchQuery?: string;
}

export const AnalyticsPage: React.FC<AnalyticsPageProps> = () => {
  const { data, loading, error, refresh } = useAnalytics();
  const timeRange = 'Last 30 Days';

  if (loading) return <LoadingSkeleton rows={5} />;
  if (error || !data) {
    return (
      <EmptyState
        title="Failed to Load Analytics"
        description={error || 'An error occurred while computing telemetry metrics.'}
        actionText="Retry"
        onAction={refresh}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-3.5 lg:gap-4 animate-in fade-in duration-200 font-sans">
      {/* Page Header */}
      <PageHeader
        title="Analytics"
        description="Turn data into better decisions. Understand usage, fulfillment ratios, peak hours and growth across MIMO."
        actions={
          <button
            type="button"
            onClick={() => alert('Exporting comprehensive Analytics PDF/CSV...')}
            className="flex items-center gap-2 px-4.5 h-11 bg-[#6366F1] hover:bg-[#4F46E5] text-white rounded-xl text-sm sm:text-[15px] font-medium transition-all shadow-xs cursor-pointer"
          >
            <Download size={16} />
            <span>Export Report</span>
          </button>
        }
      />

      {/* Row 1: 5 KPI Cards with Sparklines */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-3.5 lg:gap-4 items-start">
        {/* 1. Total Revenue */}
        <MetricCard
          title="Total Revenue"
          value={`₹${data.kpis.totalRevenue.toLocaleString()}`}
          trendText={`+${data.kpis.revenueTrend}% vs prev`}
          trendPositive={true}
          icon={<IndianRupee size={16} />}
          iconBg="bg-[#EEF2FF] text-[#4F46E5] dark:bg-[#818CF8]/20 dark:text-[#818CF8]"
          sparklineColor="#6366F1"
        />

        {/* 2. Total Paid Pages */}
        <MetricCard
          title="Total Paid Pages"
          value={data.kpis.totalPaidPages.toLocaleString()}
          trendText={`+${data.kpis.paidPagesTrend}% vs prev`}
          trendPositive={true}
          icon={<FileText size={16} />}
          iconBg="bg-[#E0F2FE] text-[#0284C7] dark:bg-[#0284C7]/20 dark:text-[#38BDF8]"
          sparklineColor="#0284C7"
        />

        {/* 3. Printed Pages */}
        <MetricCard
          title="Printed Pages"
          value={data.kpis.printedPages.toLocaleString()}
          trendText={`+${data.kpis.printedPagesTrend}% vs prev`}
          trendPositive={true}
          icon={<Printer size={16} />}
          iconBg="bg-[#F3E8FF] text-[#7C3AED] dark:bg-[#9333EA]/20 dark:text-[#C084FC]"
          sparklineColor="#7C3AED"
        />

        {/* 4. Print Success Rate */}
        <MetricCard
          title="Success Rate"
          value={`${data.kpis.printSuccessRate}%`}
          trendText={`${data.kpis.successRateTrend}% vs prev`}
          trendPositive={true}
          icon={<Percent size={16} />}
          iconBg="bg-[#EEF2FF] text-[#4F46E5] dark:bg-indigo-950/60 dark:text-[#A5B4FC]"
          sparklineColor="#6366F1"
        />

        {/* 5. Unique Customers */}
        <MetricCard
          title="Unique Users"
          value={data.kpis.uniqueCustomers.toLocaleString()}
          trendText={`+${data.kpis.customersTrend}% vs prev`}
          trendPositive={true}
          icon={<Users size={16} />}
          iconBg="bg-[#FCE7F3] text-[#DB2777] dark:bg-[#DB2777]/20 dark:text-[#F472B6]"
          sparklineColor="#EC4899"
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* Row 2: Revenue & Page Volume + Fulfillment Funnel + Pages by Category */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-3.5 lg:gap-4 items-start">
        {/* Large Chart: Revenue & Page Volume (6 cols) */}
        <div className="lg:col-span-6 mimo-card p-5 sm:p-6 flex flex-col justify-between">
          <div className="mimo-card-header">
            <h3 className="text-base sm:text-[18px] font-semibold text-slate-900 dark:text-[#F1F5F9]">Revenue & Page Volume</h3>

            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-600 dark:text-[#C3CFDD]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 dark:bg-indigo-400" /> Rev (₹)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-sky-400" /> Paid
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 dark:bg-slate-600" /> Printed
                </span>
              </div>
              <div className="flex items-center gap-1 px-3 h-8 bg-slate-50 dark:bg-[#14243A] border border-slate-200 dark:border-[#1E314B] rounded-lg text-xs font-semibold text-slate-700 dark:text-[#C3CFDD]">
                <span>{timeRange}</span>
                <ChevronDown size={12} />
              </div>
            </div>
          </div>

          <div className="mimo-card-body min-h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.revenueVolumeSeries} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1E314B" opacity={0.4} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#8495AA', fontSize: 11 }} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fill: '#8495AA', fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
                <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fill: '#8495AA', fontSize: 11 }} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    return (
                      <div className="bg-slate-900 dark:bg-[#0C1829] border border-slate-700 dark:border-[#1E314B] p-2.5 rounded-xl shadow-xl text-xs text-white">
                        <p className="font-semibold text-slate-300 mb-1">{label}</p>
                        {payload.map((entry, idx) => (
                          <p key={idx} className="font-semibold text-[11px]" style={{ color: entry.color }}>
                            {entry.name}: {entry.value}
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <Bar yAxisId="right" dataKey="paidPages" fill="#38BDF8" radius={[4, 4, 0, 0]} barSize={14} />
                <Bar yAxisId="right" dataKey="printedPages" fill="#CBD5E1" radius={[4, 4, 0, 0]} barSize={14} />
                <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#6366F1" strokeWidth={2.5} dot={{ r: 3, fill: '#6366F1' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Middle: Page Fulfillment Funnel (3 cols) */}
        <div className="lg:col-span-3 mimo-card p-5 sm:p-6 flex flex-col justify-between">
          <div className="mimo-card-header">
            <h3 className="text-base sm:text-[18px] font-semibold text-slate-900 dark:text-[#F1F5F9]">Fulfillment Funnel</h3>
          </div>

          <div className="mimo-card-body flex flex-col justify-around gap-2.5 min-h-[240px]">
            {data.funnel.map((f) => (
              <div key={f.stage} className="space-y-1">
                <div className="flex items-center justify-between text-xs sm:text-[13px]">
                  <span className="font-semibold text-slate-800 dark:text-[#F1F5F9]">{f.count.toLocaleString()}</span>
                  <span className="font-semibold text-indigo-600 dark:text-[#818CF8]">{f.percentage}%</span>
                </div>
                <div className="p-2.5 rounded-xl bg-indigo-50/50 dark:bg-[#0C1829] text-xs sm:text-[13px] font-medium text-slate-800 dark:text-[#F1F5F9] flex items-center justify-between border border-indigo-100/60 dark:border-[#1E314B]">
                  <span className="truncate">{f.stage}</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0 ml-1" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Pages by Category Donut (3 cols) */}
        <div className="lg:col-span-3 mimo-card p-5 sm:p-6 flex flex-col justify-between">
          <div className="mimo-card-header">
            <h3 className="text-base sm:text-[18px] font-semibold text-slate-900 dark:text-[#F1F5F9]">By Category</h3>
            <span className="text-xs sm:text-[13px] font-medium text-slate-400 dark:text-[#8495AA]">30 Days</span>
          </div>

          <div className="mimo-card-body flex flex-col justify-around min-h-[240px]">
            <div className="relative flex items-center justify-center my-1 h-[130px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.categories}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={56}
                    dataKey="percentage"
                    strokeWidth={0}
                  >
                    {data.categories.map((c) => (
                      <Cell key={c.category} fill={c.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-base font-semibold text-slate-900 dark:text-[#F1F5F9] leading-none">12,842</span>
                <span className="text-[10px] text-slate-400 dark:text-[#8495AA] font-normal mt-0.5">Total Pages</span>
              </div>
            </div>

            <div className="space-y-1.5 text-xs pt-2 border-t border-slate-100 dark:border-[#1E314B]">
              {data.categories.map((c) => (
                <div key={c.category} className="flex items-center justify-between text-slate-600 dark:text-[#C3CFDD]">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    <span className="text-xs sm:text-[13px] font-medium truncate">{c.category}</span>
                  </div>
                  <span className="font-semibold text-slate-900 dark:text-[#F1F5F9] text-xs sm:text-[13px]">{c.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Kiosk Performance + Usage Heatmap + Top Documents */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-3.5 lg:gap-4 items-start">
        {/* Kiosk Performance (5 cols) */}
        <div className="lg:col-span-5 mimo-card p-5 sm:p-6 flex flex-col justify-between">
          <div className="mimo-card-header">
            <h3 className="text-base sm:text-[18px] font-semibold text-slate-900 dark:text-[#F1F5F9]">Kiosk Performance</h3>
            <span className="text-xs sm:text-[13px] font-medium text-slate-400 dark:text-[#8495AA]">30 Days</span>
          </div>

          <div className="mimo-card-body overflow-x-auto min-h-[220px]">
            <table className="w-full text-left text-xs sm:text-[14px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-[#1E314B] text-[12px] sm:text-[13px] font-semibold uppercase text-slate-400 dark:text-[#8495AA]">
                  <th className="pb-3">Kiosk</th>
                  <th className="pb-3">Pages</th>
                  <th className="pb-3">Revenue (₹)</th>
                  <th className="pb-3">Success</th>
                  <th className="pb-3">Active</th>
                  <th className="pb-3 text-right">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1E314B]">
                {data.kioskPerformance.map((k) => (
                  <tr key={k.name} className="hover:bg-slate-50 dark:hover:bg-[#15253B] h-[48px]">
                    <td className="py-3 font-semibold text-slate-900 dark:text-[#F1F5F9] flex items-center gap-1.5">
                      <Printer size={14} className="text-indigo-600 dark:text-[#818CF8]" />
                      <span>{k.name}</span>
                    </td>
                    <td className="py-3 text-slate-700 dark:text-[#C3CFDD]">{k.pages.toLocaleString()}</td>
                    <td className="py-3 font-semibold text-slate-900 dark:text-[#F1F5F9]">₹{k.revenue.toLocaleString()}</td>
                    <td className="py-3 font-semibold text-slate-900 dark:text-[#F1F5F9]">{k.successRate}%</td>
                    <td className="py-3 text-slate-500 dark:text-[#8495AA]">{k.activeHours}h</td>
                    <td className="py-3 text-right font-semibold text-indigo-600 dark:text-[#818CF8]">
                      {k.trend > 0 ? `↑ ${k.trend}%` : `↓ ${Math.abs(k.trend)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Usage Heatmap (4 cols) */}
        <div className="lg:col-span-4 mimo-card p-5 sm:p-6 flex flex-col justify-between">
          <div className="mimo-card-header">
            <h3 className="text-base sm:text-[18px] font-semibold text-slate-900 dark:text-[#F1F5F9]">Usage by Time of Day</h3>
            <span className="text-xs sm:text-[13px] font-medium text-slate-400 dark:text-[#8495AA]">30 Days</span>
          </div>

          <div className="mimo-card-body flex flex-col justify-around gap-2 text-xs min-h-[220px]">
            <div className="space-y-2">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, dIdx) => (
                <div key={day} className="flex items-center gap-2">
                  <span className="w-8 font-semibold text-slate-500 dark:text-[#8495AA] text-xs">{day}</span>
                  <div className="flex-1 grid grid-cols-8 gap-1.5">
                    {Array.from({ length: 8 }).map((_, hIdx) => {
                      const intensity = (dIdx * 3 + hIdx * 2) % 5;
                      const colors = [
                        'bg-slate-100 dark:bg-[#0C1829]',
                        'bg-indigo-100 dark:bg-indigo-950/70',
                        'bg-indigo-300 dark:bg-indigo-800',
                        'bg-indigo-500 dark:bg-indigo-600',
                        'bg-indigo-700 dark:bg-indigo-400',
                      ];
                      return <div key={hIdx} className={`h-4 rounded-xs ${colors[intensity]}`} />;
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-[#8495AA] pt-2 border-t border-slate-100 dark:border-[#1E314B]">
              <span>12AM  4AM  8AM  12PM  4PM  8PM</span>
              <div className="flex items-center gap-1.5">
                <span>Low</span>
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-indigo-100 dark:bg-indigo-950/70 rounded-xs" />
                  <span className="w-2 h-2 bg-indigo-400 dark:bg-indigo-600 rounded-xs" />
                  <span className="w-2 h-2 bg-indigo-700 dark:bg-indigo-400 rounded-xs" />
                </div>
                <span>High</span>
              </div>
            </div>
          </div>
        </div>

        {/* Top Documents (3 cols) */}
        <div className="lg:col-span-3 mimo-card p-5 sm:p-6 flex flex-col justify-between">
          <div className="mimo-card-header">
            <h3 className="text-base sm:text-[18px] font-semibold text-slate-900 dark:text-[#F1F5F9]">Top Documents</h3>
            <span className="text-xs sm:text-[13px] font-medium text-slate-400 dark:text-[#8495AA]">Rank</span>
          </div>

          <div className="mimo-card-body flex flex-col justify-around gap-2 text-xs sm:text-[13px] min-h-[220px]">
            {data.topDocuments.map((doc) => (
              <div key={doc.rank} className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-[#14243A]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xs font-semibold text-slate-400 dark:text-[#8495AA] w-3">{doc.rank}</span>
                  <span className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-transparent dark:border-purple-800/60 text-[10px] font-bold uppercase">
                    {doc.iconType}
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-[#F1F5F9] truncate">{doc.documentType}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-semibold text-slate-900 dark:text-[#F1F5F9]">{doc.pages.toLocaleString()}</span>
                  <span className="text-[11px] text-slate-400 dark:text-[#8495AA] block">{doc.percentage}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 4: Trends & Insights (6 cols) + Export & Reports (6 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-3.5 lg:gap-4 items-start">
        {/* Trends & Insights */}
        <div className="mimo-card p-5 sm:p-6 flex flex-col justify-between">
          <div className="mimo-card-header">
            <h3 className="text-base sm:text-[18px] font-semibold text-slate-900 dark:text-[#F1F5F9]">Trends & Insights</h3>
          </div>

          <div className="mimo-card-body">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-[14px]">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0C1829] border border-slate-200/60 dark:border-[#1E314B] flex items-start gap-3">
                <ArrowUpRight size={18} className="text-indigo-600 dark:text-[#818CF8] shrink-0 mt-0.5" />
                <p className="font-medium text-slate-800 dark:text-[#F1F5F9] leading-snug">Revenue increased by 18.4% compared to previous period.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0C1829] border border-slate-200/60 dark:border-[#1E314B] flex items-start gap-3">
                <Printer size={18} className="text-purple-600 dark:text-[#C084FC] shrink-0 mt-0.5" />
                <p className="font-medium text-slate-800 dark:text-[#F1F5F9] leading-snug">MIMO 1 has the highest throughput (4,350 pages).</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0C1829] border border-slate-200/60 dark:border-[#1E314B] flex items-start gap-3">
                <ArrowDownRight size={18} className="text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
                <p className="font-medium text-slate-800 dark:text-[#F1F5F9] leading-snug">Print success rate is 96.2% (↓ 1.1%).</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0C1829] border border-slate-200/60 dark:border-[#1E314B] flex items-start gap-3">
                <Percent size={18} className="text-indigo-600 dark:text-[#818CF8] shrink-0 mt-0.5" />
                <p className="font-medium text-slate-800 dark:text-[#F1F5F9] leading-snug">Peak campus usage window is 10 AM – 2 PM.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Export & Reports */}
        <div className="mimo-card p-5 sm:p-6 flex flex-col justify-between">
          <div className="mimo-card-header">
            <div>
              <h3 className="text-base sm:text-[18px] font-semibold text-slate-900 dark:text-[#F1F5F9]">Export & Reports</h3>
              <p className="text-xs text-slate-500 dark:text-[#8495AA]">Generate structured data exports</p>
            </div>
          </div>

          <div className="mimo-card-body flex items-center justify-center">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
              <button
                type="button"
                onClick={() => alert('Exporting Revenue CSV...')}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0C1829] hover:bg-indigo-50 dark:hover:bg-[#14243A] border border-slate-200/80 dark:border-[#1E314B] transition-all text-center flex flex-col items-center justify-center gap-1.5 cursor-pointer"
              >
                <IndianRupee size={18} className="text-indigo-600 dark:text-[#818CF8]" />
                <span className="text-xs sm:text-[13px] font-semibold text-slate-800 dark:text-[#F1F5F9]">Revenue</span>
              </button>
              <button
                type="button"
                onClick={() => alert('Exporting Kiosk CSV...')}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0C1829] hover:bg-purple-50 dark:hover:bg-[#14243A] border border-slate-200/80 dark:border-[#1E314B] transition-all text-center flex flex-col items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer size={18} className="text-purple-600 dark:text-[#C084FC]" />
                <span className="text-xs sm:text-[13px] font-semibold text-slate-800 dark:text-[#F1F5F9]">Kiosks</span>
              </button>
              <button
                type="button"
                onClick={() => alert('Exporting Usage CSV...')}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0C1829] hover:bg-sky-50 dark:hover:bg-[#14243A] border border-slate-200/80 dark:border-[#1E314B] transition-all text-center flex flex-col items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet size={18} className="text-sky-600 dark:text-[#38BDF8]" />
                <span className="text-xs sm:text-[13px] font-semibold text-slate-800 dark:text-[#F1F5F9]">Usage</span>
              </button>
              <button
                type="button"
                onClick={() => alert('Exporting Failures CSV...')}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0C1829] hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200/80 dark:border-[#1E314B] transition-all text-center flex flex-col items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileDown size={18} className="text-rose-600 dark:text-rose-400" />
                <span className="text-xs sm:text-[13px] font-semibold text-slate-800 dark:text-[#F1F5F9]">Failures</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
