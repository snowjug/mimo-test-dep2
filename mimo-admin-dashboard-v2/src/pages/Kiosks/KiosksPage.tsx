import React, { useEffect, useState } from 'react';
import {
  HardDrive,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Layers,
  Droplet,
  Clock,
  FileCheck2,
} from 'lucide-react';
import { kiosksService } from '../../services/kiosks.service';
import type { KiosksPageData } from '../../types/kiosks.types';
import { MetricCard } from '../../components/ui/MetricCard';
import { Badge } from '../../components/ui/Badge';

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
  const [statusFilter, setStatusFilter] = useState<'All' | 'Online' | 'Attention'>('All');
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
          <span className="text-sm font-semibold text-[#8EA6BF]">Loading Kiosk Fleet...</span>
        </div>
      </div>
    );
  }

  const filteredKiosks = data.kiosks.filter((kiosk) => {
    const matchesStatus =
      statusFilter === 'All' || kiosk.status.toLowerCase() === statusFilter.toLowerCase();
    const matchesSearch =
      !effectiveSearch ||
      kiosk.name.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      kiosk.code.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      kiosk.location.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      kiosk.model.toLowerCase().includes(effectiveSearch.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black text-[#F5F7FA] tracking-tight">
              Fleet Kiosks & Hardware
            </h1>
            <Badge variant="active" size="sm">
              TELEMETRY MESH
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-[#8EA6BF] font-medium mt-1">
            Real-time peripheral health, paper levels, toner cartridge life, and network telemetry.
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
            <span>{refreshing ? 'Ping Fleet...' : 'Ping Kiosks'}</span>
          </button>
        </div>
      </div>

      {/* Row 1: Fleet Health KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
        <MetricCard
          title="Total Registered Fleet"
          value={data.kpis.totalKiosks.toString()}
          subtext="Distributed campus endpoints"
          icon={<HardDrive size={20} />}
        />
        <MetricCard
          title="Operational / Online"
          value={data.kpis.onlineCount.toString()}
          subtext="Accepting print jobs"
          icon={<CheckCircle2 size={20} />}
          trendText="Active"
          trendPositive={true}
        />
        <MetricCard
          title="Requires Attention"
          value={data.kpis.attentionCount.toString()}
          subtext="Low paper / consumable alerts"
          icon={<AlertTriangle size={20} />}
          trendText={data.kpis.attentionCount > 0 ? 'Action Needed' : 'Nominal'}
          trendPositive={data.kpis.attentionCount === 0}
        />
        <MetricCard
          title="Fleet Output Today"
          value={`${data.kpis.totalPagesToday.toLocaleString()} pgs`}
          subtext={`₹${(data.kpis.totalPagesToday * 3).toLocaleString()} gross rev`}
          icon={<FileCheck2 size={20} />}
          trendText="98.8% SLA"
          trendPositive={true}
        />
      </div>

      {/* Row 2: Filter Toolbar */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {(['All', 'Online', 'Attention'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                statusFilter === st
                  ? 'bg-[#20D3A2] text-[#07111F] shadow-md shadow-[#20D3A2]/20 font-black'
                  : 'bg-[#07111F]/70 text-[#8EA6BF] hover:text-[#F5F7FA] hover:bg-[#132943] border border-[#1D3A59]'
              }`}
            >
              {st} {st === 'All' ? `(${data.kiosks.length})` : ''}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8EA6BF]" />
          <input
            type="text"
            placeholder="Search kiosk name, code, location..."
            value={effectiveSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[#07111F]/70 border border-[#1D3A59] rounded-xl text-xs text-[#F5F7FA] placeholder-[#6F89A3] focus:border-[#20D3A2] focus:outline-hidden transition-all"
          />
        </div>
      </div>

      {/* Row 3: Kiosk Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        {filteredKiosks.map((kiosk) => {
          const isAttention = kiosk.status === 'Attention';
          return (
            <div
              key={kiosk.id}
              className={`p-5 sm:p-6 rounded-2xl bg-[#10223A] border transition-all shadow-lg flex flex-col justify-between ${
                isAttention
                  ? 'border-amber-500/40 bg-linear-to-b from-[#10223A] to-amber-950/10'
                  : 'border-[#1D3A59] hover:border-[#20D3A2]/40'
              }`}
            >
              <div>
                {/* Kiosk Header */}
                <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#1D3A59]">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm shrink-0 border ${
                        isAttention
                          ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                          : 'bg-[#20D3A2]/15 border-[#20D3A2]/30 text-[#20D3A2]'
                      }`}
                    >
                      <HardDrive size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-[#F5F7FA]">{kiosk.name}</h3>
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#07111F] text-[#8EA6BF] border border-[#1D3A59]">
                          {kiosk.code}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-[#8EA6BF] mt-1">
                        <MapPin size={13} className="text-[#6F89A3]" />
                        <span className="truncate">{kiosk.location}</span>
                      </div>
                    </div>
                  </div>

                  <Badge variant={isAttention ? 'warning' : 'online'} size="sm">
                    {kiosk.status}
                  </Badge>
                </div>

                {/* Device & Network Details */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-4 py-3 px-3.5 rounded-xl bg-[#07111F]/60 border border-[#1D3A59]/80 text-xs">
                  <div>
                    <span className="text-[10px] text-[#6F89A3] uppercase font-bold tracking-wider">
                      Hardware Model
                    </span>
                    <p className="text-xs font-semibold text-[#F5F7FA] truncate mt-0.5">
                      {kiosk.model.split('(')[0]}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#6F89A3] uppercase font-bold tracking-wider">
                      IP & Mesh
                    </span>
                    <p className="text-xs font-mono font-semibold text-[#8EA6BF] truncate mt-0.5">
                      {kiosk.ipAddress}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#6F89A3] uppercase font-bold tracking-wider">
                      Uptime
                    </span>
                    <p className="text-xs font-semibold text-[#20D3A2] mt-0.5">
                      {kiosk.uptime}
                    </p>
                  </div>
                </div>

                {/* Consumable Levels */}
                <div className="space-y-3 pt-1">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <div className="flex items-center gap-1.5 text-[#CAD7E6] font-medium">
                        <Layers size={14} className="text-[#8EA6BF]" />
                        <span>Paper Tray Capacity</span>
                      </div>
                      <span
                        className={`font-black ${
                          kiosk.paperLevel < 20 ? 'text-amber-400' : 'text-[#F5F7FA]'
                        }`}
                      >
                        {kiosk.paperLevel}%
                      </span>
                    </div>
                    <div className="h-2 w-full bg-[#07111F] rounded-full overflow-hidden border border-[#1D3A59]">
                      <div
                        className={`h-full rounded-full transition-all ${
                          kiosk.paperLevel < 20
                            ? 'bg-amber-400'
                            : 'bg-linear-to-r from-emerald-500 to-[#20D3A2]'
                        }`}
                        style={{ width: `${kiosk.paperLevel}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <div className="flex items-center gap-1.5 text-[#CAD7E6] font-medium">
                        <Droplet size={14} className="text-[#8EA6BF]" />
                        <span>Toner Cartridge Life</span>
                      </div>
                      <span
                        className={`font-black ${
                          kiosk.tonerLevel < 20 ? 'text-amber-400' : 'text-[#F5F7FA]'
                        }`}
                      >
                        {kiosk.tonerLevel}%
                      </span>
                    </div>
                    <div className="h-2 w-full bg-[#07111F] rounded-full overflow-hidden border border-[#1D3A59]">
                      <div
                        className={`h-full rounded-full transition-all ${
                          kiosk.tonerLevel < 20
                            ? 'bg-amber-400'
                            : 'bg-linear-to-r from-cyan-500 to-blue-500'
                        }`}
                        style={{ width: `${kiosk.tonerLevel}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="mt-5 pt-3.5 border-t border-[#1D3A59] flex items-center justify-between text-xs text-[#8EA6BF]">
                <div className="flex items-center gap-3">
                  <span>
                    Output: <strong className="text-[#F5F7FA] font-bold">{kiosk.pagesToday} pgs</strong>
                  </span>
                  <span>
                    Gross: <strong className="text-[#20D3A2] font-bold">₹{kiosk.revenueToday.toFixed(0)}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-[#6F89A3]">
                  <Clock size={12} />
                  <span>Ping: {kiosk.lastPing}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
