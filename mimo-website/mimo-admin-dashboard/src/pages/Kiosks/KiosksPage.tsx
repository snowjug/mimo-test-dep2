import React, { useState, useEffect } from 'react';
import {
  Cpu,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  TrendingUp,
  Layers,
  Droplet,
} from 'lucide-react';
import { kiosksService } from '../../services/kiosks.service';
import { KiosksPageData, KioskStatus } from '../../types/kiosks.types';
import { Badge } from '../../components/ui/Badge';
import { MetricCard } from '../../components/ui/MetricCard';

export const KiosksPage: React.FC = () => {
  const [data, setData] = useState<KiosksPageData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<KioskStatus | 'All'>('All');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const res = await kiosksService.getKiosks();
      setData(res);
    } catch (e) {
      console.error('Error fetching kiosks data', e);
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

  const kiosks = data?.kiosks || [];
  const kpis = data?.kpis;

  const filteredKiosks = kiosks.filter((k) => {
    const matchesSearch =
      k.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.model.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (filterStatus !== 'All' && k.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-8 sm:space-y-10 select-none font-sans text-[#F5F7FA]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[#F5F7FA]">
            Kiosk Fleet Network
          </h1>
          <p className="text-base sm:text-lg font-medium mt-1.5 text-[#8EA6BF] leading-relaxed">
            Autonomous campus edge terminals, hardware health, and consumable status
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 bg-[#10223A] border border-[#1D3A59] rounded-xl text-sm font-bold text-[#8EA6BF] hover:text-[#F5F7FA] hover:border-[#20D3A2]/50 transition-all shadow-xs cursor-pointer"
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin text-[#20D3A2]' : 'text-[#8EA6BF]'} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh Telemetry'}</span>
          </button>
        </div>
      </div>

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="TOTAL EDGE NODES"
          value={kpis?.totalKiosks ?? 4}
          subtext="Campus-wide deployment mesh"
          icon={<Cpu size={18} className="text-[#20D3A2]" />}
        />
        <MetricCard
          title="ONLINE & READY"
          value={kpis?.onlineCount ?? 3}
          subtext="Dispatch latency < 1.2s"
          icon={<CheckCircle2 size={18} className="text-[#20D3A2]" />}
          isLive={true}
        />
        <MetricCard
          title="ATTENTION NEEDED"
          value={kpis?.attentionCount ?? 1}
          subtext="Low paper or toner warning"
          icon={<AlertTriangle size={18} className="text-amber-400" />}
          trendBadge={{ text: '1 Node Alert', positive: false }}
        />
        <MetricCard
          title="TOTAL VOLUME TODAY"
          value={(kpis?.totalPagesToday ?? 1474).toLocaleString()}
          subtext="Sheets processed today"
          icon={<TrendingUp size={18} className="text-purple-400" />}
          trendBadge={{ text: `${kpis?.fleetSuccessRate ?? 98.8}% SLA`, positive: true }}
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 p-1.5 rounded-xl bg-[#0A1728] border border-[#1D3A59] overflow-x-auto max-w-full">
          {(['All', 'Online', 'Attention', 'Offline', 'Maintenance'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilterStatus(st as any)}
              className={`min-h-[40px] px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterStatus === st
                  ? 'bg-[#20D3A2]/20 text-[#20D3A2] border border-[#20D3A2]/40 shadow-xs'
                  : 'text-[#8EA6BF] hover:text-[#F5F7FA]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6F89A3]" />
          <input
            type="text"
            placeholder="Search kiosk by name, code, location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-[44px] pl-10 pr-4 py-2 text-sm rounded-xl bg-[#0A1728] border border-[#1D3A59] text-[#F5F7FA] placeholder-[#6F89A3] focus:outline-none focus:border-[#20D3A2] focus:ring-2 focus:ring-[#20D3A2]/20"
          />
        </div>
      </div>

      {/* Kiosk Fleet Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredKiosks.map((kiosk) => {
          return (
            <div
              key={kiosk.id}
              className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 sm:p-7 shadow-xl flex flex-col justify-between hover:border-[#20D3A2]/40 transition-all"
            >
              {/* Card Header */}
              <div>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-xl font-black text-[#F5F7FA]">{kiosk.name}</h3>
                      <span className="font-mono text-xs font-black px-2.5 py-0.5 rounded-md bg-[#20D3A2]/15 text-[#20D3A2] border border-[#20D3A2]/30">
                        {kiosk.code}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs sm:text-sm text-[#8EA6BF] mt-1.5 font-medium">
                      <MapPin size={15} className="text-[#20D3A2]" />
                      <span>{kiosk.location}</span>
                    </div>
                  </div>

                  <Badge status={kiosk.status} />
                </div>

                {/* Model & IP info */}
                <div className="flex items-center justify-between text-xs sm:text-sm text-[#8EA6BF] pb-4 border-b border-[#1D3A59]">
                  <span className="font-semibold text-[#F5F7FA]">{kiosk.model}</span>
                  <span className="font-mono text-[#8EA6BF]">{kiosk.ipAddress}</span>
                </div>

                {/* Gauges (Paper & Toner) */}
                <div className="space-y-4 my-5 p-5 rounded-xl bg-[#0A1728] border border-[#1D3A59]">
                  {/* Paper Tray */}
                  <div>
                    <div className="flex justify-between text-xs sm:text-sm font-bold text-[#F5F7FA] mb-2">
                      <span className="flex items-center gap-2">
                        <Layers size={15} className="text-[#8EA6BF]" />
                        Paper Tray Capacity
                      </span>
                      <span
                        className={
                          kiosk.paperLevel < 20
                            ? 'text-amber-400 font-bold'
                            : 'text-[#20D3A2] font-bold'
                        }
                      >
                        {kiosk.paperLevel}%
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden bg-[#132943]">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          kiosk.paperLevel < 20 ? 'bg-amber-400' : 'bg-[#20D3A2]'
                        }`}
                        style={{ width: `${kiosk.paperLevel}%` }}
                      />
                    </div>
                  </div>

                  {/* Toner Level */}
                  <div>
                    <div className="flex justify-between text-xs sm:text-sm font-bold text-[#F5F7FA] mb-2">
                      <span className="flex items-center gap-2">
                        <Droplet size={15} className="text-[#8EA6BF]" />
                        Toner Cartridge
                      </span>
                      <span
                        className={
                          kiosk.tonerLevel < 20
                            ? 'text-amber-400 font-bold'
                            : 'text-[#20D3A2] font-bold'
                        }
                      >
                        {kiosk.tonerLevel}%
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden bg-[#132943]">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          kiosk.tonerLevel < 20 ? 'bg-amber-400' : 'bg-[#20D3A2]'
                        }`}
                        style={{ width: `${kiosk.tonerLevel}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Telemetry Row */}
                <div className="grid grid-cols-3 gap-3 py-3.5 border-t border-[#1D3A59] text-center mt-2">
                  <div>
                    <div className="text-xs font-bold uppercase text-[#8EA6BF]">Pages Today</div>
                    <div className="text-lg font-black text-[#F5F7FA] mt-1">
                      {kiosk.pagesToday}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase text-[#8EA6BF]">Revenue</div>
                    <div className="text-lg font-black text-[#F5F7FA] mt-1">
                      ₹{kiosk.revenueToday.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase text-[#8EA6BF]">Uptime / SLA</div>
                    <div className="text-lg font-black text-[#20D3A2] mt-1">{kiosk.uptime}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
