import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  ChevronRight,
  RefreshCw,
  Loader2,
  IndianRupee,
  Zap,
  Printer,
  CheckCircle2,
  Cpu,
} from 'lucide-react';
import { dashboardService } from '../../services/dashboard.service';
import { DashboardOverviewData } from '../../types/dashboard.types';
import { MetricCard } from '../../components/ui/MetricCard';
import { Badge } from '../../components/ui/Badge';
import { RevenueVolumeAreaChart } from '../../components/charts/RevenueVolumeAreaChart';
import { FulfillmentDonutChart } from '../../components/charts/FulfillmentDonutChart';

export const OverviewPage: React.FC = () => {
  const [data, setData] = useState<DashboardOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const res = await dashboardService.getOverview();
      setData(res);
    } catch (err) {
      console.error('Failed to load overview data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading || !data) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-[#20D3A2]" />
        <p className="text-sm font-bold text-[#8EA6BF] uppercase tracking-wider">
          Loading MIMO Command Center...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 sm:space-y-10 select-none font-sans text-[#F5F7FA]">
      {/* 1. Page Header matching Image 4 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-[#F5F7FA] tracking-tight">
            Executive Dashboard
          </h1>
          <p className="text-base sm:text-lg font-medium text-[#8EA6BF] mt-1.5 leading-relaxed">
            Welcome back — real-time campus print network telemetry
          </p>
        </div>

        <div className="flex items-center gap-3.5 self-start sm:self-auto">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-bold bg-[#20D3A2]/15 border border-[#20D3A2]/30 text-[#20D3A2] shadow-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-[#20D3A2] animate-pulse" />
            LIVE TELEMETRY ACTIVE
          </span>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 bg-[#10223A] border border-[#1D3A59] rounded-xl text-sm font-bold text-[#8EA6BF] hover:text-[#F5F7FA] hover:border-[#20D3A2]/50 transition-all cursor-pointer shadow-xs"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin text-[#20D3A2]' : 'text-[#8EA6BF]'} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* 2. Top 4 Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="TOTAL REVENUE"
          value={data.kpis.totalRevenue.formatted}
          trendBadge={{ text: '+14.2%', positive: true }}
          subtext="Daily print billing"
          icon={<IndianRupee size={18} className="text-[#20D3A2]" />}
        />
        <MetricCard
          title="PAID PAGES"
          value={data.kpis.paidPages.formatted}
          trendBadge={{ text: '+8.6%', positive: true }}
          subtext="184 free pages"
          icon={<Zap size={18} className="text-amber-400" />}
        />
        <MetricCard
          title="PRINTED PAGES"
          value={data.kpis.printedPages.formatted}
          subtext="Lifetime: 4946"
          icon={<Printer size={18} className="text-purple-400" />}
        />
        <MetricCard
          title="SUCCESS RATE"
          value={data.kpis.successRate.formatted}
          trendBadge={{ text: 'Target 98%', positive: true }}
          subtext="Across all nodes"
          icon={<CheckCircle2 size={18} className="text-[#20D3A2]" />}
        />
      </div>

      {/* 3. Second Row: 3 Wide Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#10223A] rounded-2xl border border-amber-500/40 p-6 sm:p-7 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs sm:text-sm font-black text-amber-400 uppercase tracking-wider">
              CUSTOMER VALUE AT RISK
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-500/20 text-amber-400 border border-amber-500/30">
              2 AT RISK
            </span>
          </div>
          <div className="my-2">
            <span className="text-3xl sm:text-4xl font-black text-amber-400 tracking-tight font-sans">
              {data.kpis.customerValueAtRisk.formatted}
            </span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-[#8EA6BF] truncate mt-1">
            Pending print retries or unfulfilled orders
          </p>
        </div>

        <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 sm:p-7 shadow-xl flex flex-col justify-between hover:border-[#20D3A2]/40 transition-all">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs sm:text-sm font-black text-[#8EA6BF] uppercase tracking-wider">
              KIOSK NETWORK STATUS
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-black bg-[#20D3A2]/20 text-[#20D3A2] border border-[#20D3A2]/30">
              2/4 Online
            </span>
          </div>
          <div className="flex items-center gap-3 my-2">
            <div className="p-2.5 rounded-xl bg-[#132943] text-amber-400 border border-[#1D3A59]">
              <Cpu size={22} />
            </div>
            <div>
              <span className="text-2xl sm:text-3xl font-black text-[#F5F7FA]">Autonomous mesh</span>
            </div>
          </div>
          <p className="text-xs sm:text-sm font-medium text-[#8EA6BF] truncate mt-1">
            Edge terminals active & responding
          </p>
        </div>

        <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 sm:p-7 shadow-xl flex flex-col justify-between hover:border-[#20D3A2]/40 transition-all">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs sm:text-sm font-black text-[#8EA6BF] uppercase tracking-wider">
              ACTIVE PRINT QUEUE
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-500/20 text-blue-400 border border-blue-500/30">
              3 Jobs
            </span>
          </div>
          <div className="flex items-center gap-3 my-2">
            <div className="p-2.5 rounded-xl bg-[#132943] text-blue-400 border border-[#1D3A59]">
              <Printer size={22} />
            </div>
            <div>
              <span className="text-2xl sm:text-3xl font-black text-[#F5F7FA]">Real-time pipeline</span>
            </div>
          </div>
          <p className="text-xs sm:text-sm font-medium text-[#8EA6BF] truncate mt-1">
            Document processing & merging
          </p>
        </div>
      </div>

      {/* 4. Main Charts Row: Revenue Trends + Paid Page Fulfillment */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 flex flex-col">
          <RevenueVolumeAreaChart data={data.revenueTrends} height={290} />
        </div>
        <div className="lg:col-span-4 flex flex-col">
          <FulfillmentDonutChart stats={data.fulfillment} />
        </div>
      </div>

      {/* 5. Lower Dashboard: 4-Column Balanced Grid matching Image 4 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 items-stretch">
        {/* Card 1: Needs Attention */}
        <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#1D3A59]">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-rose-500" />
                <h3 className="text-base font-extrabold text-[#F5F7FA]">Needs Attention</h3>
              </div>
              <span className="text-xs font-black text-[#8EA6BF] uppercase tracking-wider">
                3 ALERTS
              </span>
            </div>

            <div className="space-y-2.5">
              {data.needsAttention.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-[#0A1728] border border-[#1D3A59] hover:border-[#20D3A2]/40 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        item.severity === 'critical'
                          ? 'bg-rose-500'
                          : item.severity === 'warning'
                          ? 'bg-amber-500'
                          : 'bg-[#20D3A2]'
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#F5F7FA] truncate group-hover:text-[#20D3A2]">
                        {item.title}
                      </p>
                      {item.description && (
                        <p className="text-xs text-[#8EA6BF] truncate mt-0.5">{item.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 text-[#8EA6BF] text-xs font-semibold">
                    <span>{item.timeAgo}</span>
                    <ChevronRight size={15} className="text-[#6F89A3] group-hover:text-[#F5F7FA]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 2: Kiosk Network */}
        <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#1D3A59]">
              <div>
                <h3 className="text-base font-extrabold text-[#F5F7FA]">Kiosk Network</h3>
                <p className="text-xs text-[#8EA6BF] font-medium mt-0.5">Edge telemetry mesh</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-[#20D3A2]/20 text-[#20D3A2] border border-[#20D3A2]/30">
                LIVE
              </span>
            </div>

            <div className="space-y-2.5">
              {data.kiosks.map((kiosk) => (
                <div
                  key={kiosk.id}
                  className="p-3.5 rounded-xl border border-[#1D3A59] bg-[#0A1728] hover:border-[#20D3A2]/40 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-bold text-[#F5F7FA]">{kiosk.name}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          kiosk.status === 'Online'
                            ? 'bg-[#20D3A2]'
                            : kiosk.status === 'Attention'
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                        }`}
                      />
                      <span className="text-xs font-bold text-[#8EA6BF]">{kiosk.status}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#8EA6BF] mt-1.5 font-medium">
                    <span>{kiosk.pagesToday} pgs</span>
                    <span className="font-bold text-[#F5F7FA]">₹{kiosk.revenueToday}</span>
                    <span className="text-[#20D3A2] font-bold">{kiosk.successRate}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 3: Live Print Operations */}
        <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#1D3A59]">
              <div>
                <h3 className="text-base font-extrabold text-[#F5F7FA]">Live Print Operations</h3>
                <p className="text-xs text-[#8EA6BF] font-medium mt-0.5">Active queue telemetry</p>
              </div>
              <span className="text-xs font-black text-[#8EA6BF] uppercase tracking-wider">
                LIVE
              </span>
            </div>

            <div className="space-y-2.5">
              {data.liveOperations.slice(0, 3).map((job) => (
                <div
                  key={job.id}
                  className="p-3.5 rounded-xl border border-[#1D3A59] bg-[#0A1728] hover:border-[#20D3A2]/40 transition-all flex items-center justify-between text-sm"
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-bold text-[#F5F7FA] truncate">{job.fileName}</p>
                    <p className="text-xs text-[#8EA6BF] mt-0.5">
                      {job.kioskName} · {job.pageCount} pgs · {job.duration}
                    </p>
                  </div>
                  <Badge
                    variant={
                      job.status === 'ACTIVE'
                        ? 'active'
                        : job.status === 'PRINTING'
                        ? 'printing'
                        : job.status === 'WARNING'
                        ? 'warning'
                        : 'queued'
                    }
                    size="sm"
                  >
                    {job.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 4: MIMO Intelligence + Incidents */}
        <div className="flex flex-col gap-6">
          {/* Intelligence */}
          <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-[#20D3A2]" />
                <h3 className="text-sm font-extrabold text-[#F5F7FA]">MIMO Intelligence</h3>
              </div>
              <span className="text-xs font-black px-2 py-0.5 rounded bg-[#20D3A2]/20 text-[#20D3A2] border border-[#20D3A2]/30">
                LIVE
              </span>
            </div>
            <ul className="space-y-2 text-xs sm:text-sm text-[#8EA6BF] font-medium leading-relaxed">
              {data.intelligence.slice(0, 2).map((item) => (
                <li key={item.id} className="flex items-start gap-2">
                  <span className="text-[#20D3A2] font-black shrink-0">•</span>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Incidents Summary Badges */}
          <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#1D3A59]">
              <h3 className="text-sm font-extrabold text-[#F5F7FA]">Incidents</h3>
              <span className="text-xs font-black text-[#8EA6BF]">LAST 24 HOURS</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400">
                <div className="text-xl font-black">{data.incidents.critical}</div>
                <div className="text-[10px] font-black uppercase tracking-wider mt-0.5">Critical</div>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400">
                <div className="text-xl font-black">{data.incidents.high}</div>
                <div className="text-[10px] font-black uppercase tracking-wider mt-0.5">High</div>
              </div>
              <div className="p-2.5 rounded-xl bg-[#20D3A2]/20 border border-[#20D3A2]/30 text-[#20D3A2]">
                <div className="text-xl font-black">{data.incidents.medium}</div>
                <div className="text-[10px] font-black uppercase tracking-wider mt-0.5">Medium</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
