import React, { useEffect, useState } from 'react';
import {
  HardDrive,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  RotateCcw,
  Plus,
} from 'lucide-react';
import { kiosksService } from '../../services/kiosks.service';
import type { KiosksPageData } from '../../types/kiosks.types';
import { MetricCard } from '../../components/cards/MetricCard';

interface KiosksPageProps {
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export const KiosksPage: React.FC<KiosksPageProps> = ({
  searchQuery = '',
  onSearchChange,
}) => {
  const [data, setData] = useState<KiosksPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'All' | 'Online' | 'Warning'>('All');
  const [localSearch, setLocalSearch] = useState(searchQuery);

  const loadData = async () => {
    try {
      const res = await kiosksService.getKiosks();
      setData(res);
    } catch (err) {
      console.error('Failed to load kiosks data', err);
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

  const effectiveSearch = searchQuery || localSearch;

  const handleSearchChange = (val: string) => {
    setLocalSearch(val);
    if (onSearchChange) {
      onSearchChange(val);
    }
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#20D3A2] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-[#8EA6BF]">Loading Kiosk Fleet Management...</span>
        </div>
      </div>
    );
  }

  const filteredKiosks = data.kiosks.filter((kiosk) => {
    const matchesStatus =
      statusFilter === 'All' ||
      (statusFilter === 'Online' && kiosk.status.toLowerCase() === 'online') ||
      (statusFilter === 'Warning' && kiosk.status.toLowerCase() !== 'online');
    const matchesSearch =
      !effectiveSearch ||
      kiosk.name.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      kiosk.code.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      kiosk.location.toLowerCase().includes(effectiveSearch.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-200 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#F5F7FA] tracking-tight">
            Kiosk Fleet Management
          </h1>
          <p className="text-xs sm:text-sm text-[#8EA6BF] font-medium mt-1">
            Hardware status, paper/toner telemetry, and remote management
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-[#10223A] hover:bg-[#132943] border border-[#1D3A59] text-[#F5F7FA] rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-[#20D3A2]' : ''} />
            <span>{refreshing ? 'Polling...' : 'Refresh Nodes'}</span>
          </button>
        </div>
      </div>

      {/* Row 1: 4 Top KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        <MetricCard
          title="TOTAL KIOSKS"
          value="4"
          subtitle="Campus network"
          icon={<HardDrive size={15} className="text-[#8EA6BF]" />}
        />
        <MetricCard
          title="ONLINE"
          value="2"
          subtitle="Fully operational"
          icon={<CheckCircle2 size={15} className="text-[#20D3A2]" />}
          iconBg="bg-[#20D3A2]/15 text-[#20D3A2]"
          highlightColor="emerald"
        />
        <MetricCard
          title="WARNING"
          value="1"
          subtitle="Paper / ink low"
          icon={<AlertTriangle size={15} className="text-amber-400" />}
          iconBg="bg-amber-500/15 text-amber-400"
        />
        <MetricCard
          title="OFFLINE"
          value="1"
          subtitle="Power / network off"
          icon={<AlertTriangle size={15} className="text-rose-400" />}
          iconBg="bg-rose-500/15 text-rose-400"
        />
      </div>

      {/* Row 2: Search Bar & Filter Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6F89A3]" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search kiosk by name, ID, location..."
            className="w-full pl-10 pr-4 py-2 bg-[#07111F] border border-[#1D3A59] rounded-xl text-xs sm:text-sm text-[#F5F7FA] placeholder-[#6F89A3] focus:outline-none focus:border-[#20D3A2] focus:ring-1 focus:ring-[#20D3A2]/30 transition-all shadow-inner"
          />
        </div>

        <div className="flex items-center gap-2">
          {(['All', 'Online', 'Warning'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === filter
                  ? 'bg-[#20D3A2]/20 border border-[#20D3A2]/50 text-[#20D3A2]'
                  : 'bg-[#10223A] border border-[#1D3A59] text-[#8EA6BF] hover:text-[#F5F7FA]'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Row 3: Kiosks Telemetry Cards Grid (Exact geometry matching Screenshot 4) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {filteredKiosks.map((kiosk) => {
          const isWarning = kiosk.status.toLowerCase() === 'warning';
          const isOffline = kiosk.status.toLowerCase() === 'offline';
          return (
            <div
              key={kiosk.id}
              className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl hover:border-[#20D3A2]/40 transition-all space-y-4"
            >
              {/* Header: Title + Status Badge */}
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base sm:text-lg font-bold text-[#F5F7FA] tracking-tight">
                  {kiosk.name}
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                    isWarning
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : isOffline
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : 'bg-[#20D3A2]/15 text-[#20D3A2] border border-[#20D3A2]/30'
                  }`}
                >
                  ● {kiosk.status}
                </span>
              </div>

              {/* Location */}
              <div className="flex items-center gap-1.5 text-xs text-[#8EA6BF]">
                <MapPin size={14} className="text-[#20D3A2] shrink-0" />
                <span>{kiosk.location}</span>
              </div>

              {/* Meta Tags Row: ID + Printer Type + Uptime */}
              <div className="flex items-center gap-2 flex-wrap text-[11px] font-semibold">
                <span className="px-2 py-0.5 rounded-md bg-[#07111F] text-[#CAD7E6] border border-[#1D3A59]">
                  ID: {kiosk.code}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30">
                  {kiosk.model}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-[#07111F] text-[#20D3A2] border border-[#1D3A59]">
                  {kiosk.uptime}% Uptime
                </span>
              </div>

              {/* Telemetry Progress Bars (Color Ink & Paper Tray) */}
              <div className="space-y-3 pt-1">
                {/* Ink / Toner */}
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold mb-1">
                    <span className="text-[#CAD7E6]">Color Ink</span>
                    <span className="text-amber-400 font-bold">{kiosk.tonerLevel}%</span>
                  </div>
                  <div className="w-full h-2 bg-[#07111F] rounded-full overflow-hidden border border-[#1D3A59]/80">
                    <div
                      className="h-full bg-linear-to-r from-amber-500 to-amber-400 rounded-full"
                      style={{ width: `${kiosk.tonerLevel}%` }}
                    />
                  </div>
                </div>

                {/* Paper Tray */}
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold mb-1">
                    <span className="text-[#CAD7E6]">Paper Tray</span>
                    <span className="text-rose-400 font-bold">{kiosk.paperLevel} / 500</span>
                  </div>
                  <div className="w-full h-2 bg-[#07111F] rounded-full overflow-hidden border border-[#1D3A59]/80">
                    <div
                      className="h-full bg-linear-to-r from-rose-500 to-rose-400 rounded-full"
                      style={{ width: `${(kiosk.paperLevel / 500) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Bottom Metrics: Pages Today & Revenue Today */}
              <div className="pt-3 border-t border-[#1D3A59]/60 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#8EA6BF] block">
                    PAGES TODAY
                  </span>
                  <span className="text-base sm:text-lg font-black text-[#F5F7FA]">
                    {kiosk.pagesToday}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#8EA6BF] block">
                    REVENUE TODAY
                  </span>
                  <span className="text-base sm:text-lg font-black text-[#20D3A2]">
                    ₹{kiosk.revenueToday.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Actions: Refill Ink, Add Paper, Reboot */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => alert(`Refill ink action for ${kiosk.name}`)}
                  className="flex-1 py-2 rounded-xl bg-[#07111F] hover:bg-[#132943] border border-[#1D3A59] text-xs font-bold text-[#CAD7E6] transition-all"
                >
                  Refill Ink
                </button>
                <button
                  type="button"
                  onClick={() => alert(`Added paper to ${kiosk.name}`)}
                  className="flex-1 py-2 rounded-xl bg-[#07111F] hover:bg-[#132943] border border-[#1D3A59] text-xs font-bold text-[#CAD7E6] transition-all"
                >
                  <Plus size={13} className="inline mr-0.5" />
                  Add Paper (500)
                </button>
                <button
                  type="button"
                  onClick={() => alert(`Reboot command sent to ${kiosk.name}`)}
                  className="p-2 rounded-xl bg-[#07111F] hover:bg-rose-500/20 border border-[#1D3A59] hover:border-rose-500/40 text-rose-400 transition-all"
                  title="Reboot Kiosk Node"
                >
                  <RotateCcw size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
