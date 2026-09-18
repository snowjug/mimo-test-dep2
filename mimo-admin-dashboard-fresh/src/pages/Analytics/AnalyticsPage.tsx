import React, { useEffect, useState } from 'react';
import {
  RefreshCw,
  IndianRupee,
  FileText,
  Printer,
  CheckCircle2,
} from 'lucide-react';
import { analyticsService } from '../../services/analytics.service';
import type { AnalyticsPageData } from '../../types/analytics.types';
import { MetricCard } from '../../components/cards/MetricCard';
import { Badge } from '../../components/ui/Badge';
import { RevenueVolumeChart } from '../../components/charts/RevenueVolumeChart';

interface AnalyticsPageProps {
  searchQuery?: string;
}

export const AnalyticsPage: React.FC<AnalyticsPageProps> = ({ searchQuery = '' }) => {
  const [data, setData] = useState<AnalyticsPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');

  const loadData = async () => {
    try {
      const res = await analyticsService.getAnalytics();
      setData(res);
    } catch (err) {
      console.error('Failed to load analytics data', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#20D3A2] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-[#8EA6BF]">Loading Fleet Analytics & Trends...</span>
        </div>
      </div>
    );
  }

  const filteredKiosks = data.kioskPerformance.filter((k) =>
    k.kioskName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black text-[#F5F7FA] tracking-tight">
              Fleet Analytics & Insights
            </h1>
            <Badge variant="printing" size="sm">
              HISTORICAL METRICS
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-[#8EA6BF] font-medium mt-1">
            Aggregated revenue curves, document category breakdown, and multi-kiosk throughput metrics.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Time Range Selector */}
          <div className="flex items-center bg-[#10223A] border border-[#1D3A59] rounded-xl p-1">
            {(['7d', '30d', '90d'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  timeRange === r
                    ? 'bg-[#20D3A2] text-[#07111F]'
                    : 'text-[#8EA6BF] hover:text-[#F5F7FA]'
                }`}
              >
                {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-[#10223A] hover:bg-[#132943] border border-[#1D3A59] text-[#F5F7FA] rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-[#20D3A2]' : ''} />
            <span>{refreshing ? 'Calculating...' : 'Recalculate'}</span>
          </button>
        </div>
      </div>

      {/* Row 1: KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
        <MetricCard
          title="Total Gross Revenue"
          value={`₹${data.kpis.totalRevenue.toLocaleString()}`}
          subtitle="Cumulative across period"
          icon={<IndianRupee size={18} className="text-[#20D3A2]" />}
          trendText="+24.1%"
          trendPositive={true}
        />
        <MetricCard
          title="Paid Page Volume"
          value={data.kpis.paidPages.toLocaleString()}
          subtitle="Billed customer requests"
          icon={<FileText size={18} className="text-sky-400" />}
          trendText="+18.5%"
          trendPositive={true}
        />
        <MetricCard
          title="Hardware Printed Pages"
          value={data.kpis.printedPages.toLocaleString()}
          subtitle="Actual physical output"
          icon={<Printer size={18} className="text-purple-400" />}
          trendText="98.8% Conv"
          trendPositive={true}
        />
        <MetricCard
          title="Overall Fulfillment"
          value={`${data.kpis.fulfillmentRate}%`}
          subtitle="Fleet SLA Benchmark: 98%"
          icon={<CheckCircle2 size={18} className="text-[#20D3A2]" />}
          trendText="Above Target"
          trendPositive={true}
          accentBarColor="emerald"
        />
      </div>

      {/* Row 2: Main Revenue Chart */}
      <RevenueVolumeChart data={data.revenueTrends} height={320} />

      {/* Row 3: Kiosk Performance Comparison & Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        {/* Kiosk Output Comparison */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3.5 border-b border-[#1D3A59]">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[#F5F7FA]">Kiosk Output Comparison</h3>
                <p className="text-xs text-[#8EA6BF] mt-0.5">Top performing hardware endpoints</p>
              </div>
              <span className="text-xs font-bold text-[#20D3A2]">{filteredKiosks.length} Nodes</span>
            </div>

            <div className="mt-4 space-y-3.5">
              {filteredKiosks.map((k) => (
                <div key={k.kioskName} className="p-3 rounded-xl bg-[#07111F]/60 border border-[#1D3A59]/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#F5F7FA]">{k.kioskName}</span>
                    <span className="text-xs font-bold text-[#20D3A2]">₹{k.revenue.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#8EA6BF]">
                    <span>{k.pages.toLocaleString()} pages printed</span>
                    <span>{k.successRate}% Success SLA</span>
                  </div>
                  <div className="h-1.5 w-full bg-[#07111F] rounded-full overflow-hidden border border-[#1D3A59]">
                    <div
                      className="h-full bg-linear-to-r from-emerald-500 to-[#20D3A2] rounded-full"
                      style={{ width: `${(k.pages / 1000) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Document Categories Breakdown */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3.5 border-b border-[#1D3A59]">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[#F5F7FA]">Document Categories</h3>
                <p className="text-xs text-[#8EA6BF] mt-0.5">Distribution of user print workloads</p>
              </div>
              <span className="text-xs font-bold text-[#8EA6BF]">100% Total</span>
            </div>

            <div className="mt-4 space-y-3.5">
              {data.categoryBreakdown.map((cat) => (
                <div key={cat.category} className="p-3 rounded-xl bg-[#07111F]/60 border border-[#1D3A59]/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#F5F7FA]">{cat.category}</span>
                    <span className="text-xs font-bold text-[#F5F7FA]">{cat.percentage}%</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#8EA6BF]">
                    <span>{cat.pages.toLocaleString()} pages</span>
                    <span className="text-xs font-semibold" style={{ color: cat.color }}>
                      {cat.percentage}% of Fleet
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[#07111F] rounded-full overflow-hidden border border-[#1D3A59]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
