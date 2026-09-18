import React, { useState, useEffect } from 'react';
import {
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
  TrendingUp,
  RefreshCw,
  FileCheck,
  Percent,
} from 'lucide-react';
import { analyticsService } from '../../services/analytics.service';
import { AnalyticsPageData } from '../../types/analytics.types';
import { MetricCard } from '../../components/ui/MetricCard';
import { RevenueVolumeAreaChart } from '../../components/charts/RevenueVolumeAreaChart';

export const AnalyticsPage: React.FC = () => {
  const [data, setData] = useState<AnalyticsPageData | null>(null);
  const [timeframe, setTimeframe] = useState<'7D' | '30D' | '90D' | 'ALL'>('30D');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const res = await analyticsService.getAnalytics();
      setData(res);
    } catch (e) {
      console.error('Error fetching analytics data', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };

  const kpis = data?.kpis;
  const revenueTrends = data?.revenueTrends || [];
  const kioskPerformance = data?.kioskPerformance || [];
  const categoryBreakdown = data?.categoryBreakdown || [];

  return (
    <div className="space-y-8 sm:space-y-10 select-none font-sans text-[#F5F7FA]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[#F5F7FA]">
            Telemetry & Fleet Analytics
          </h1>
          <p className="text-base sm:text-lg font-medium mt-1.5 text-[#8EA6BF] leading-relaxed">
            Deep dive into print volume, revenue trends, kiosk load distribution, and fulfillment rates
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {/* Timeframe Filter Pills */}
          <div className="flex items-center gap-1.5 p-1.5 rounded-xl bg-[#0A1728] border border-[#1D3A59] shadow-xs">
            {(['7D', '30D', '90D', 'ALL'] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`min-h-[40px] px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer ${
                  timeframe === tf
                    ? 'bg-[#20D3A2]/20 text-[#20D3A2] border border-[#20D3A2]/40 shadow-xs'
                    : 'text-[#8EA6BF] hover:text-[#F5F7FA]'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 rounded-xl bg-[#10223A] border border-[#1D3A59] text-[#8EA6BF] hover:text-[#F5F7FA] hover:border-[#20D3A2]/50 transition-colors cursor-pointer"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin text-[#20D3A2]' : 'text-[#8EA6BF]'} />
          </button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="TOTAL REVENUE"
          value={`₹${(kpis?.totalRevenue ?? 14250).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          subtext="Campus print collections"
          trendBadge={{ text: '+14.2%', positive: true }}
          icon={<TrendingUp size={18} className="text-[#20D3A2]" />}
        />
        <MetricCard
          title="PAID VOLUME"
          value={(kpis?.paidPages ?? 4821).toLocaleString()}
          subtext="184 free promotional pages"
          trendBadge={{ text: '+8.6%', positive: true }}
          icon={<FileCheck size={18} className="text-amber-400" />}
        />
        <MetricCard
          title="DISPATCH SUCCESS"
          value={`${kpis?.fulfillmentRate ?? 98.8}%`}
          subtext="Across all 4 active kiosks"
          trendBadge={{ text: 'Target 98%', positive: true }}
          icon={<Percent size={18} className="text-[#20D3A2]" />}
        />
        <MetricCard
          title="TOTAL PRINTED SHEETS"
          value={(kpis?.printedPages ?? 4762).toLocaleString()}
          subtext="Lifetime: 4,946 sheets"
          icon={<Printer size={18} className="text-purple-400" />}
        />
      </div>

      {/* Revenue Area Chart Card */}
      <div className="w-full">
        <RevenueVolumeAreaChart data={revenueTrends} height={300} />
      </div>

      {/* Bottom Grid: Kiosk Performance & Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Kiosk Volume Distribution Bar Chart (7 cols) */}
        <div className="lg:col-span-7 bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 sm:p-7 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-[#F5F7FA]">Kiosk Volume Breakdown</h2>
              <p className="text-xs sm:text-sm text-[#8EA6BF] mt-0.5">Total sheets printed and revenue by node</p>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={kioskPerformance} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1D3A59" />
                <XAxis
                  dataKey="kioskName"
                  tick={{ fontSize: 12, fill: '#8EA6BF' }}
                  axisLine={{ stroke: '#1D3A59' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#8EA6BF' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#07111F',
                    borderColor: '#1D3A59',
                    color: '#F5F7FA',
                    borderRadius: '0.875rem',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                <Bar dataKey="pages" name="Pages Printed" fill="#20D3A2" radius={[6, 6, 0, 0]} />
                <Bar dataKey="revenue" name="Revenue (₹)" fill="#0284c7" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Breakdown Progress Cards (5 cols) */}
        <div className="lg:col-span-5 bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 sm:p-7 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold text-[#F5F7FA]">Document Categories</h2>
                <p className="text-xs sm:text-sm text-[#8EA6BF] mt-0.5">Distribution of campus print material</p>
              </div>
            </div>

            <div className="space-y-4 pt-1">
              {categoryBreakdown.map((cat) => (
                <div key={cat.category} className="space-y-2">
                  <div className="flex justify-between text-xs sm:text-sm font-bold text-[#8EA6BF]">
                    <span>{cat.category}</span>
                    <span className="text-[#F5F7FA]">
                      {cat.pages.toLocaleString()} pgs ({cat.percentage}%)
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden bg-[#0A1728] border border-[#1D3A59]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-5 border-t border-[#1D3A59] text-xs text-[#8EA6BF]">
            Based on student print telemetry across all 4 campuses.
          </div>
        </div>
      </div>
    </div>
  );
};
