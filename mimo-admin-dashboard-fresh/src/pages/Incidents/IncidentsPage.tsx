import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  Clock,
  CheckCircle2,
  MapPin,
  Check,
} from 'lucide-react';
import { incidentsService } from '../../services/incidents.service';
import type { IncidentsPageData } from '../../types/incidents.types';
import { MetricCard } from '../../components/cards/MetricCard';

interface IncidentsPageProps {
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export const IncidentsPage: React.FC<IncidentsPageProps> = ({
  searchQuery = '',
}) => {
  const [data, setData] = useState<IncidentsPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'All' | 'Critical' | 'High' | 'Medium' | 'Resolved'>('All');

  const loadData = async () => {
    try {
      const res = await incidentsService.getIncidents();
      setData(res);
    } catch (err) {
      console.error('Failed to load incidents', err);
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
          <span className="text-sm font-semibold text-[#8EA6BF]">Loading Incident Management & SLAs...</span>
        </div>
      </div>
    );
  }

  const filterTabs = [
    { id: 'All', label: 'All (4)' },
    { id: 'Critical', label: 'Critical (1)' },
    { id: 'High', label: 'High (1)' },
    { id: 'Medium', label: 'Medium (1)' },
    { id: 'Resolved', label: 'Resolved (1)' },
  ] as const;

  const filteredIncidents = data.incidents.filter((inc) => {
    let matchesFilter = true;
    if (activeFilter === 'Critical') matchesFilter = inc.severity === 'critical';
    else if (activeFilter === 'High') matchesFilter = inc.severity === 'high';
    else if (activeFilter === 'Medium') matchesFilter = inc.severity === 'medium';
    else if (activeFilter === 'Resolved') matchesFilter = inc.status === 'resolved';

    const matchesSearch =
      !searchQuery ||
      inc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.kioskName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.incidentCode.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-200 font-sans">
      {/* Header: Title + Subtitle + Refresh Button (Exact match to Screenshot 2) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#F5F7FA] tracking-tight">
            Incident Management & SLAs
          </h1>
          <p className="text-xs sm:text-sm text-[#8EA6BF] font-medium mt-1">
            Real-time tracking of hardware alerts, paper jams, and service requests
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
            <span>{refreshing ? 'Refreshing...' : 'Refresh Alerts'}</span>
          </button>
        </div>
      </div>

      {/* Row 1: 4 Top KPI Cards (2x2 Grid on Mobile, 4 Cols on Desktop — Screenshot 2) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {/* 1. CRITICAL */}
        <MetricCard
          title="CRITICAL"
          value="1"
          subtitle="Immediate SLA (< 30m)"
          topBadge={
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/30">
              Urgent
            </span>
          }
          icon={<ShieldAlert size={16} className="text-rose-400" />}
          iconBg="bg-rose-500/15 text-rose-400"
        />

        {/* 2. HIGH / MEDIUM */}
        <MetricCard
          title="HIGH / MEDIUM"
          value="2"
          subtitle="Active investigating"
          icon={<AlertTriangle size={16} className="text-amber-400" />}
          iconBg="bg-amber-500/15 text-amber-400"
        />

        {/* 3. AVG RESOLUTION */}
        <MetricCard
          title="AVG RESOLUTION"
          value="1.4h"
          subtitle="Within SLA target"
          icon={<Clock size={16} className="text-[#20D3A2]" />}
          iconBg="bg-[#20D3A2]/15 text-[#20D3A2]"
          highlightColor="emerald"
        />

        {/* 4. RESOLVED TODAY */}
        <MetricCard
          title="RESOLVED TODAY"
          value="1"
          subtitle="Completed tickets"
          icon={<CheckCircle2 size={16} className="text-[#20D3A2]" />}
          iconBg="bg-[#20D3A2]/15 text-[#20D3A2]"
        />
      </div>

      {/* Row 2: Filter Tabs (Screenshot 2) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {filterTabs.map((tab) => {
          const isActive = activeFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0 ${
                isActive
                  ? 'bg-[#20D3A2]/20 border border-[#20D3A2]/50 text-[#20D3A2] shadow-sm shadow-[#20D3A2]/20'
                  : 'bg-[#10223A] border border-[#1D3A59] text-[#8EA6BF] hover:text-[#F5F7FA] hover:bg-[#132943]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Row 3: Incidents Cards Feed (Matching Screenshot 2 Card Geometry) */}
      <div className="space-y-3.5 sm:space-y-4">
        {filteredIncidents.map((inc) => (
          <div
            key={inc.id}
            className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-4 sm:p-5 shadow-xl hover:border-[#20D3A2]/40 transition-all space-y-3"
          >
            {/* Top Metadata Row: ID + Severity Badge + Status Badge */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-[#8EA6BF] font-semibold">
                  {inc.incidentCode}
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                  inc.severity === 'critical'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : inc.severity === 'high'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                }`}>
                  {inc.severity}
                </span>
              </div>

              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                inc.status === 'open'
                  ? 'bg-[#20D3A2]/15 text-[#20D3A2] border border-[#20D3A2]/30'
                  : 'bg-[#132943] text-[#8EA6BF]'
              }`}>
                {inc.status}
              </span>
            </div>

            {/* Title */}
            <h3 className="text-base sm:text-lg font-bold text-[#F5F7FA] tracking-tight">
              {inc.title}
            </h3>

            {/* Bottom Metadata: Location + SLA Remaining */}
            <div className="pt-2 border-t border-[#1D3A59]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-[#CAD7E6]">
                <MapPin size={14} className="text-[#20D3A2] shrink-0" />
                <span className="font-semibold">{inc.kioskName}</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                  <Clock size={14} className="shrink-0" />
                  <span>{inc.slaRemaining || '28m'} SLA rem.</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => alert(`Acknowledged ticket ${inc.incidentCode}`)}
                    className="px-2.5 py-1 rounded-lg bg-[#07111F] hover:bg-[#20D3A2]/20 border border-[#1D3A59] text-[11px] font-bold text-[#20D3A2] transition-all"
                  >
                    Acknowledge
                  </button>
                  <button
                    type="button"
                    onClick={() => alert(`Resolved ticket ${inc.incidentCode}`)}
                    className="px-2.5 py-1 rounded-lg bg-[#07111F] hover:bg-emerald-500/20 border border-[#1D3A59] text-[11px] font-bold text-emerald-400 transition-all"
                  >
                    <Check size={12} className="inline mr-1" />
                    Resolve
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
