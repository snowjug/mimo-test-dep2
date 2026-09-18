import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Search,
  RefreshCw,
} from 'lucide-react';
import { incidentsService } from '../../services/incidents.service';
import { IncidentsPageData, IncidentSeverity } from '../../types/incidents.types';
import { Badge } from '../../components/ui/Badge';
import { MetricCard } from '../../components/ui/MetricCard';

export const IncidentsPage: React.FC = () => {
  const [data, setData] = useState<IncidentsPageData | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<IncidentSeverity | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const res = await incidentsService.getIncidents();
      setData(res);
    } catch (e) {
      console.error('Error fetching incidents data', e);
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

  const incidents = data?.incidents || [];
  const kpis = data?.kpis;

  const filteredIncidents = incidents.filter((inc) => {
    const matchesSearch =
      inc.incidentCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.kioskName.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (filterSeverity !== 'all' && inc.severity !== filterSeverity) return false;
    return true;
  });

  return (
    <div className="space-y-8 sm:space-y-10 select-none font-sans text-[#F5F7FA]">
      {/* Header matching Image 3 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[#F5F7FA]">
            Incident Management & SLAs
          </h1>
          <p className="text-base sm:text-lg font-medium mt-1.5 text-[#8EA6BF] leading-relaxed">
            Real-time tracking of hardware alerts, paper jams, and service requests
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 bg-[#10223A] border border-[#1D3A59] rounded-xl text-sm font-bold text-[#8EA6BF] hover:text-[#F5F7FA] hover:border-[#20D3A2]/50 transition-all shadow-xs cursor-pointer"
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin text-[#20D3A2]' : 'text-[#8EA6BF]'} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh Alerts'}</span>
          </button>
        </div>
      </div>

      {/* 4 Summary KPI Cards matching Image 3 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="CRITICAL"
          value={kpis?.critical ?? 1}
          subtext="Immediate SLA (< 30m)"
          icon={<ShieldAlert size={18} className="text-rose-400" />}
          trendBadge={{ text: 'Urgent', positive: false }}
        />
        <MetricCard
          title="HIGH / MEDIUM"
          value={kpis?.high ?? 2}
          subtext="Active investigating"
          icon={<AlertTriangle size={18} className="text-amber-400" />}
        />
        <MetricCard
          title="AVG RESOLUTION"
          value={`${kpis?.avgResolutionTimeHours ?? 1.4}h`}
          subtext="Historical average"
          icon={<Clock size={18} className="text-blue-400" />}
        />
        <MetricCard
          title="RESOLVED TODAY"
          value={kpis?.resolved ?? 1}
          subtext="Past 24 hours resolved"
          icon={<CheckCircle2 size={18} className="text-[#20D3A2]" />}
          trendBadge={{ text: 'Healthy', positive: true }}
        />
      </div>

      {/* Filter and Search Bar Card */}
      <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 p-1.5 rounded-xl bg-[#0A1728] border border-[#1D3A59] overflow-x-auto max-w-full">
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => setFilterSeverity(sev)}
              className={`min-h-[40px] px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer capitalize whitespace-nowrap ${
                filterSeverity === sev
                  ? 'bg-[#20D3A2]/20 text-[#20D3A2] border border-[#20D3A2]/40 shadow-xs'
                  : 'text-[#8EA6BF] hover:text-[#F5F7FA]'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6F89A3]" />
          <input
            type="text"
            placeholder="Search incidents by ID, title, kiosk..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-[44px] pl-10 pr-4 py-2 text-sm rounded-xl bg-[#0A1728] border border-[#1D3A59] text-[#F5F7FA] placeholder-[#6F89A3] focus:outline-none focus:border-[#20D3A2] focus:ring-2 focus:ring-[#20D3A2]/20"
          />
        </div>
      </div>

      {/* Main Incident Records Table Card */}
      <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 sm:p-7 shadow-xl space-y-5">
        {/* Desktop View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#1D3A59] text-xs uppercase font-black tracking-wider text-[#8EA6BF]">
                <th className="pb-4 pl-3">Incident ID</th>
                <th className="pb-4">Severity</th>
                <th className="pb-4">Issue Title & Description</th>
                <th className="pb-4">Kiosk Node</th>
                <th className="pb-4">Category</th>
                <th className="pb-4">Status</th>
                <th className="pb-4 pr-3 text-right">Reported</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1D3A59] font-medium">
              {filteredIncidents.map((inc) => (
                <tr key={inc.id} className="hover:bg-[#132943]/80 transition-colors">
                  <td className="py-4 pl-3 font-mono font-bold text-[#20D3A2]">
                    {inc.incidentCode}
                  </td>
                  <td className="py-4 whitespace-nowrap">
                    <Badge status={inc.severity} />
                  </td>
                  <td className="py-4 max-w-[300px]">
                    <div className="font-bold text-[#F5F7FA]">{inc.title}</div>
                    <div className="text-xs text-[#8EA6BF] truncate mt-0.5">{inc.description}</div>
                  </td>
                  <td className="py-4 whitespace-nowrap font-semibold text-[#F5F7FA]">
                    {inc.kioskName}
                  </td>
                  <td className="py-4 whitespace-nowrap">
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#132943] text-[#8EA6BF] border border-[#1D3A59]">
                      {inc.category}
                    </span>
                  </td>
                  <td className="py-4 whitespace-nowrap">
                    <Badge status={inc.status} />
                  </td>
                  <td className="py-4 pr-3 text-right text-[#8EA6BF] whitespace-nowrap text-xs font-semibold">
                    {inc.timeAgo}
                  </td>
                </tr>
              ))}
              {filteredIncidents.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-14 text-center text-[#8EA6BF] font-semibold text-sm">
                    No incident records matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Stacked View */}
        <div className="md:hidden space-y-3.5">
          {filteredIncidents.map((inc) => (
            <div
              key={inc.id}
              className="p-5 rounded-2xl border border-[#1D3A59] bg-[#0A1728] space-y-3 shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="font-mono text-xs font-bold text-[#20D3A2]">
                    {inc.incidentCode}
                  </span>
                  <h4 className="font-bold text-sm text-[#F5F7FA] mt-0.5">{inc.title}</h4>
                </div>
                <Badge status={inc.severity} />
              </div>

              <p className="text-xs sm:text-sm text-[#8EA6BF] leading-relaxed">{inc.description}</p>

              <div className="grid grid-cols-2 gap-3 text-xs py-2.5 border-t border-b border-[#1D3A59]">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#6F89A3]">Kiosk</span>
                  <div className="font-semibold text-[#F5F7FA] mt-0.5">{inc.kioskName}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#6F89A3]">Category</span>
                  <div className="font-semibold text-[#F5F7FA] mt-0.5">{inc.category}</div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-[#8EA6BF] font-medium">{inc.timeAgo}</span>
                <Badge status={inc.status} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
