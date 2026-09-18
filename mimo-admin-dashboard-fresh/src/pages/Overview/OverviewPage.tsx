import React, { useEffect, useState } from 'react';
import {
  IndianRupee,
  Zap,
  Printer,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import { dashboardService } from '../../services/dashboard.service';
import type { DashboardOverviewData } from '../../types/dashboard.types';
import { MetricCard } from '../../components/cards/MetricCard';
import { RevenueVolumeChart } from '../../components/charts/RevenueVolumeChart';
import { FulfillmentDonut } from '../../components/charts/FulfillmentDonut';
import { Badge } from '../../components/ui/Badge';

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
          <span className="text-sm font-semibold text-[#8EA6BF]">Loading Executive Dashboard...</span>
        </div>
      </div>
    );
  }

  const filteredKiosks = data.kiosks.filter((k) =>
    k.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    k.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredOps = data.liveOperations.filter((op) =>
    op.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    op.kioskName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    op.jobCode.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStageBadge = (status: string) => {
    switch (status.toUpperCase()) {
      case 'ACTIVE':
        return <Badge variant="active" size="sm">ACTIVE</Badge>;
      case 'PRINTING':
        return <Badge variant="printing" size="sm">PRINTING</Badge>;
      case 'WARNING':
        return <Badge variant="warning" size="sm">WARNING</Badge>;
      case 'QUEUED':
        return <Badge variant="queued" size="sm">QUEUED</Badge>;
      case 'COMPLETED':
        return <Badge variant="completed" size="sm">COMPLETED</Badge>;
      default:
        return <Badge variant="default" size="sm">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-200 font-sans">
      {/* Header: Title + Telemetry Status Pill + Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black text-[#F5F7FA] tracking-tight">
              Executive Dashboard
            </h1>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#20D3A2]/10 border border-[#20D3A2]/30 text-[#20D3A2]">
              <span className="w-2 h-2 rounded-full bg-[#20D3A2] animate-pulse" />
              <span>LIVE TELEMETRY ACTIVE</span>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-[#8EA6BF] font-medium mt-1">
            Welcome back — real-time campus print network telemetry
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#10223A] hover:bg-[#132943] border border-[#1D3A59] text-[#F5F7FA] rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-[#20D3A2]' : ''} />
            <span>{refreshing ? 'Syncing...' : 'Sync Fleet'}</span>
          </button>
        </div>
      </div>

      {/* ROW 1: 4 Top Primary KPI Cards (Exact match to Screenshots 3 & 5) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* 1. Total Revenue */}
        <MetricCard
          title="TOTAL REVENUE"
          value="₹14,250.00"
          subtitle="Daily print billing"
          trendText="+14.2%"
          trendPositive={true}
          icon={<IndianRupee size={16} className="text-[#20D3A2]" />}
          iconBg="bg-[#20D3A2]/15 text-[#20D3A2]"
          highlightColor="emerald"
        />

        {/* 2. Paid Pages */}
        <MetricCard
          title="PAID PAGES"
          value="4,821"
          subtitle="184 free pages"
          trendText="+8.6%"
          trendPositive={true}
          icon={<Zap size={16} className="text-amber-400" />}
          iconBg="bg-amber-400/15 text-amber-400"
        />

        {/* 3. Printed Pages */}
        <MetricCard
          title="PRINTED PAGES"
          value="4,762"
          subtitle="Lifetime: 4946"
          icon={<Printer size={16} className="text-purple-400" />}
          iconBg="bg-purple-400/15 text-purple-400"
        />

        {/* 4. Success Rate */}
        <MetricCard
          title="SUCCESS RATE"
          value="98.8%"
          subtitle="Across all nodes"
          topBadge={
            <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-[#20D3A2]/15 text-[#20D3A2] border border-[#20D3A2]/30">
              Target 98%
            </span>
          }
          icon={<CheckCircle2 size={16} className="text-[#20D3A2]" />}
          iconBg="bg-[#20D3A2]/15 text-[#20D3A2]"
        />
      </div>

      {/* ROW 2: 3 Operational Action Cards (Exact match to Screenshots 3 & 5) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {/* Card 1: Customer Value at Risk */}
        <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-4 sm:p-5 shadow-xl hover:border-amber-500/40 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <AlertTriangle size={15} />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#8EA6BF]">
                  Customer Value at Risk
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/15 text-amber-400 border border-amber-500/30">
                2 AT RISK
              </span>
            </div>

            <div className="my-1">
              <span className="text-2xl sm:text-3xl font-black text-amber-400 tracking-tight">
                ₹580.00
              </span>
            </div>
          </div>

          <p className="text-[11px] sm:text-xs text-[#8EA6BF] font-medium mt-1">
            Pending print retries or unfulfilled orders
          </p>
        </div>

        {/* Card 2: Kiosk Network Status */}
        <div
          onClick={() => onNavigateTab('kiosks')}
          className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-4 sm:p-5 shadow-xl hover:border-[#20D3A2]/40 transition-all flex items-center justify-between cursor-pointer group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#132943] border border-[#1D3A59] flex items-center justify-center text-[#20D3A2] group-hover:bg-[#20D3A2]/15 transition-all shrink-0">
              <HardDrive size={19} />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-[#F5F7FA] tracking-tight truncate">
                KIOSK NETWORK STATUS
              </p>
              <p className="text-[11px] text-[#8EA6BF] font-medium truncate mt-0.5">
                Autonomous edge nodes
              </p>
            </div>
          </div>

          <div className="text-right shrink-0 pl-2">
            <span className="text-xl sm:text-2xl font-black text-[#F5F7FA]">2/4 Online</span>
          </div>
        </div>

        {/* Card 3: Active Print Queue */}
        <div
          onClick={() => onNavigateTab('operations')}
          className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-4 sm:p-5 shadow-xl hover:border-[#20D3A2]/40 transition-all flex items-center justify-between cursor-pointer group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#132943] border border-[#1D3A59] flex items-center justify-center text-sky-400 group-hover:bg-sky-500/15 transition-all shrink-0">
              <Printer size={19} />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-[#F5F7FA] tracking-tight truncate">
                ACTIVE PRINT QUEUE
              </p>
              <p className="text-[11px] text-[#8EA6BF] font-medium truncate mt-0.5">
                Real-time dispatch pipeline
              </p>
            </div>
          </div>

          <div className="text-right shrink-0 pl-2">
            <span className="text-xl sm:text-2xl font-black text-[#F5F7FA]">3 Jobs</span>
          </div>
        </div>
      </div>

      {/* ROW 3: 2 Major Analytics Charts (Exact match to Screenshots 3 & 5) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Left Area Chart (~65% width / 8 cols) */}
        <div className="lg:col-span-8">
          <RevenueVolumeChart data={data.revenueTrends} />
        </div>

        {/* Right Fulfillment Donut (~35% width / 4 cols) */}
        <div className="lg:col-span-4">
          <FulfillmentDonut stats={data.fulfillment} />
        </div>
      </div>

      {/* ROW 4: Live Fleet Status & Queue Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        {/* Kiosks Live Telemetry Summary */}
        <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-[#1D3A59]">
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-[#F5F7FA]">Kiosk Fleet Status</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#20D3A2]/15 text-[#20D3A2] border border-[#20D3A2]/30">
                {filteredKiosks.length} Nodes
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('kiosks')}
              className="text-xs font-bold text-[#20D3A2] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Manage all</span>
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="mt-3.5 space-y-2.5">
            {filteredKiosks.map((kiosk) => (
              <div
                key={kiosk.id}
                className="p-3 rounded-xl bg-[#07111F]/70 border border-[#1D3A59]/80 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#F5F7FA] truncate">{kiosk.name}</span>
                    <span className="text-[10px] font-mono font-bold text-[#8EA6BF] bg-[#10223A] px-1.5 py-0.5 rounded border border-[#1D3A59]">
                      {kiosk.code}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#8EA6BF] mt-0.5">
                    {kiosk.pagesToday} pgs today • ₹{kiosk.revenueToday}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-bold text-[#20D3A2]">{kiosk.successRate}%</span>
                  <Badge variant="online" size="sm">Online</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Live Print Operations Queue */}
        <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-[#1D3A59]">
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-[#F5F7FA]">Active Print Pipeline</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
                {filteredOps.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('operations')}
              className="text-xs font-bold text-[#20D3A2] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View queue</span>
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="mt-3.5 space-y-2.5">
            {filteredOps.slice(0, 4).map((op) => (
              <div
                key={op.id}
                className="p-3 rounded-xl bg-[#07111F]/70 border border-[#1D3A59]/80 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#20D3A2]">{op.jobCode}</span>
                    <p className="text-xs font-bold text-[#F5F7FA] truncate">{op.fileName}</p>
                  </div>
                  <p className="text-[11px] text-[#8EA6BF] mt-0.5">
                    {op.kioskName} • {op.pageCount} pgs • {op.duration}
                  </p>
                </div>

                <div className="shrink-0">
                  {getStageBadge(op.status)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
