import React, { useEffect, useState } from 'react';
import {
  IndianRupee,
  FileCheck2,
  Printer,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  HardDrive,
  Activity,
  Sparkles,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import { dashboardService } from '../../services/dashboard.service';
import type { DashboardOverviewData } from '../../types/dashboard.types';
import { MetricCard } from '../../components/ui/MetricCard';
import { Badge } from '../../components/ui/Badge';
import { RevenueVolumeAreaChart } from '../../components/charts/RevenueVolumeAreaChart';
import { FulfillmentDonutChart } from '../../components/charts/FulfillmentDonutChart';

interface OverviewPageProps {
  onNavigateTab: (tab: string) => void;
  searchQuery?: string;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({ onNavigateTab, searchQuery = '' }) => {
  const [data, setData] = useState<DashboardOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const res = await dashboardService.getOverview();
      setData(res);
    } catch (err) {
      console.error('Failed to load overview data', err);
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
          <span className="text-sm font-semibold text-[#8EA6BF]">Loading Command Center...</span>
        </div>
      </div>
    );
  }

  // Filter items if search query is present
  const filteredNeedsAttention = data.needsAttention.filter(
    (item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description ? item.description.toLowerCase().includes(searchQuery.toLowerCase()) : false)
  );

  const filteredKiosks = data.kiosks.filter((k) =>
    k.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredOps = data.liveOperations.filter(
    (op) =>
      op.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      op.kioskName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black text-[#F5F7FA] tracking-tight">
              Executive Overview
            </h1>
            <Badge variant="active" size="sm">
              LIVE TELEMETRY
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-[#8EA6BF] font-medium mt-1">
            Real-time multi-kiosk telemetry, revenue performance, and print operations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#10223A] hover:bg-[#132943] border border-[#1D3A59] text-[#F5F7FA] rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-[#20D3A2]' : ''} />
            <span>{refreshing ? 'Syncing...' : 'Sync Fleet'}</span>
          </button>
        </div>
      </div>

      {/* Row 1: Primary Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
        <MetricCard
          title="Total Revenue (Gross)"
          value={data.kpis.totalRevenue.formatted}
          subtext="All connected kiosks today"
          icon={<IndianRupee size={20} />}
          trendText="+18.4%"
          trendPositive={true}
        />
        <MetricCard
          title="Paid Pages"
          value={data.kpis.paidPages.formatted}
          subtext="Customer billed pages"
          icon={<FileCheck2 size={20} />}
          trendText="+12.2%"
          trendPositive={true}
        />
        <MetricCard
          title="Printed Pages"
          value={data.kpis.printedPages.formatted}
          subtext="Hardware raster output"
          icon={<Printer size={20} />}
          trendText="98.8% Ratio"
          trendPositive={true}
        />
        <MetricCard
          title="Fleet Success Rate"
          value={data.kpis.successRate.formatted}
          subtext="Target SLA ≥ 98.0%"
          icon={<ShieldCheck size={20} />}
          trendText="Optimal"
          trendPositive={true}
        />
      </div>

      {/* Row 2: Secondary 3 Wide Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
        <div className="p-5 sm:p-6 rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle size={24} />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#8EA6BF] uppercase tracking-wider">
                Active Incidents
              </p>
              <p className="text-2xl font-black text-[#F5F7FA] mt-0.5">
                {data.incidents.critical + data.incidents.high}{' '}
                <span className="text-xs font-semibold text-amber-400">
                  ({data.incidents.critical} Critical)
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('incidents')}
            className="p-2 rounded-xl text-[#8EA6BF] hover:text-[#20D3A2] hover:bg-[#132943] transition-all"
            title="View Incidents"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="p-5 sm:p-6 rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
              <IndianRupee size={24} />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#8EA6BF] uppercase tracking-wider">
                Value At Risk
              </p>
              <p className="text-2xl font-black text-[#F5F7FA] mt-0.5">
                {data.kpis.customerValueAtRisk.formatted}
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-[#8EA6BF] bg-[#132943] px-3 py-1 rounded-lg border border-[#1D3A59]">
            Retrying
          </span>
        </div>

        <div className="p-5 sm:p-6 rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#20D3A2]/15 border border-[#20D3A2]/30 text-[#20D3A2] flex items-center justify-center shrink-0">
              <Activity size={24} />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#8EA6BF] uppercase tracking-wider">
                Connected Nodes
              </p>
              <p className="text-2xl font-black text-[#F5F7FA] mt-0.5">
                3 / 4 <span className="text-xs font-semibold text-[#20D3A2]">Online</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('kiosks')}
            className="p-2 rounded-xl text-[#8EA6BF] hover:text-[#20D3A2] hover:bg-[#132943] transition-all"
            title="View Fleet Kiosks"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Row 3: Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
        <div className="lg:col-span-2">
          <RevenueVolumeAreaChart data={data.revenueTrends} />
        </div>
        <div className="lg:col-span-1">
          <FulfillmentDonutChart stats={data.fulfillment} />
        </div>
      </div>

      {/* Row 4: Operational Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 sm:gap-6">
        {/* Card 1: Items Needing Attention */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#1D3A59]">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-400" />
                <h3 className="text-sm font-bold text-[#F5F7FA]">Needs Attention</h3>
              </div>
              <span className="text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                {filteredNeedsAttention.length} Issues
              </span>
            </div>

            <div className="mt-3.5 space-y-3">
              {filteredNeedsAttention.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-[#07111F]/60 border border-[#1D3A59]/80 space-y-1 hover:border-[#1D3A59] transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#F5F7FA] truncate max-w-[170px]">
                      {item.title}
                    </span>
                    <span className="text-[10px] text-[#8EA6BF] shrink-0">{item.timeAgo}</span>
                  </div>
                  <p className="text-[11px] text-[#8EA6BF] line-clamp-2">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('incidents')}
            className="mt-4 pt-3 border-t border-[#1D3A59] text-xs font-bold text-[#20D3A2] hover:text-[#20D3A2]/80 flex items-center justify-between w-full cursor-pointer"
          >
            <span>Resolve Fleet Alerts</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Card 2: Fleet Kiosks Overview */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#1D3A59]">
              <div className="flex items-center gap-2">
                <HardDrive size={16} className="text-[#20D3A2]" />
                <h3 className="text-sm font-bold text-[#F5F7FA]">Active Kiosks</h3>
              </div>
              <span className="text-[11px] font-bold text-[#20D3A2] bg-[#20D3A2]/10 px-2 py-0.5 rounded-md border border-[#20D3A2]/20">
                {data.kiosks.length} Nodes
              </span>
            </div>

            <div className="mt-3.5 space-y-2.5">
              {filteredKiosks.map((kiosk) => (
                <div
                  key={kiosk.id}
                  className="p-2.5 rounded-xl bg-[#07111F]/60 border border-[#1D3A59]/80 flex items-center justify-between"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-bold text-[#F5F7FA] truncate">{kiosk.name}</p>
                    <p className="text-[10px] text-[#8EA6BF] mt-0.5">
                      {kiosk.pagesToday} pgs • ₹{kiosk.revenueToday}
                    </p>
                  </div>
                  <Badge variant={kiosk.status === 'Online' ? 'online' : 'warning'} size="sm">
                    {kiosk.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('kiosks')}
            className="mt-4 pt-3 border-t border-[#1D3A59] text-xs font-bold text-[#20D3A2] hover:text-[#20D3A2]/80 flex items-center justify-between w-full cursor-pointer"
          >
            <span>Inspect All Nodes</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Card 3: Live Operations */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#1D3A59]">
              <div className="flex items-center gap-2">
                <Printer size={16} className="text-sky-400" />
                <h3 className="text-sm font-bold text-[#F5F7FA]">Live Print Queue</h3>
              </div>
              <span className="text-[11px] font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
                Real-time
              </span>
            </div>

            <div className="mt-3.5 space-y-2.5">
              {filteredOps.map((op) => (
                <div
                  key={op.id}
                  className="p-2.5 rounded-xl bg-[#07111F]/60 border border-[#1D3A59]/80 space-y-1"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-[#F5F7FA] truncate max-w-[160px]">
                      {op.fileName}
                    </span>
                    <Badge variant={op.status === 'PRINTING' ? 'printing' : 'active'} size="sm">
                      {op.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-[#8EA6BF]">
                    <span>{op.kioskName}</span>
                    <span>{op.pageCount} pages • {op.duration}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('operations')}
            className="mt-4 pt-3 border-t border-[#1D3A59] text-xs font-bold text-[#20D3A2] hover:text-[#20D3A2]/80 flex items-center justify-between w-full cursor-pointer"
          >
            <span>Open Full Queue</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Card 4: Fleet Insights */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#1D3A59]">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-[#20D3A2]" />
                <h3 className="text-sm font-bold text-[#F5F7FA]">Fleet Intelligence</h3>
              </div>
              <span className="text-[11px] font-bold text-[#20D3A2] bg-[#20D3A2]/10 px-2 py-0.5 rounded-md border border-[#20D3A2]/20">
                Automated
              </span>
            </div>

            <div className="mt-3.5 space-y-3">
              {data.intelligence.map((intel) => (
                <div
                  key={intel.id}
                  className="p-3 rounded-xl bg-[#07111F]/60 border border-[#1D3A59]/80 flex gap-2.5"
                >
                  <CheckCircle2 size={16} className="text-[#20D3A2] shrink-0 mt-0.5" />
                  <p className="text-[11px] text-[#CAD7E6] leading-relaxed">{intel.text}</p>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('analytics')}
            className="mt-4 pt-3 border-t border-[#1D3A59] text-xs font-bold text-[#20D3A2] hover:text-[#20D3A2]/80 flex items-center justify-between w-full cursor-pointer"
          >
            <span>Explore Analytics</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
