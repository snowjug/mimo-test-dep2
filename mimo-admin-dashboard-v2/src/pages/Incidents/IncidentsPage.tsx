import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Filter,
} from 'lucide-react';
import { incidentsService } from '../../services/incidents.service';
import type { IncidentsPageData, IncidentItem } from '../../types/incidents.types';
import { MetricCard } from '../../components/ui/MetricCard';
import { Badge } from '../../components/ui/Badge';

interface IncidentsPageProps {
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export const IncidentsPage: React.FC<IncidentsPageProps> = ({
  searchQuery = '',
  onSearchChange,
}) => {
  const [data, setData] = useState<IncidentsPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<'All' | 'critical' | 'high' | 'medium' | 'low'>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'open' | 'investigating' | 'resolved'>('All');
  const [localSearch, setLocalSearch] = useState(searchQuery);

  const loadData = async () => {
    try {
      const res = await incidentsService.getIncidents();
      setData(res);
    } catch (err) {
      console.error('Failed to load incidents data', err);
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
          <span className="text-sm font-semibold text-[#8EA6BF]">Loading Fleet Alerts & Incidents...</span>
        </div>
      </div>
    );
  }

  const filteredIncidents = data.incidents.filter((inc) => {
    const matchesSev = severityFilter === 'All' || inc.severity === severityFilter;
    const matchesStat = statusFilter === 'All' || inc.status === statusFilter;
    const matchesSearch =
      !effectiveSearch ||
      inc.incidentCode.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      inc.title.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      inc.description.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      inc.kioskName.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      inc.category.toLowerCase().includes(effectiveSearch.toLowerCase());

    return matchesSev && matchesStat && matchesSearch;
  });

  const getSeverityBadge = (sev: IncidentItem['severity']) => {
    switch (sev) {
      case 'critical':
        return <Badge variant="critical" size="sm">CRITICAL</Badge>;
      case 'high':
        return <Badge variant="warning" size="sm">HIGH</Badge>;
      case 'medium':
        return <Badge variant="warning" size="sm">MEDIUM</Badge>;
      case 'low':
        return <Badge variant="low" size="sm">LOW</Badge>;
      default:
        return <Badge variant="default" size="sm">{sev}</Badge>;
    }
  };

  const getStatusBadge = (st: IncidentItem['status']) => {
    switch (st) {
      case 'open':
        return <Badge variant="critical" size="sm">OPEN</Badge>;
      case 'investigating':
        return <Badge variant="warning" size="sm">INVESTIGATING</Badge>;
      case 'resolved':
        return <Badge variant="completed" size="sm">RESOLVED</Badge>;
      default:
        return <Badge variant="default" size="sm">{st}</Badge>;
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black text-[#F5F7FA] tracking-tight">
              Incidents & Alerts
            </h1>
            <Badge variant="warning" size="sm">
              FLEET SURVEILLANCE
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-[#8EA6BF] font-medium mt-1">
            Track hardware malfunctions, low paper thresholds, print spool errors, and system exceptions.
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
            <span>{refreshing ? 'Updating...' : 'Refresh Alerts'}</span>
          </button>
        </div>
      </div>

      {/* Row 1: KPI Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
        <MetricCard
          title="Critical Severity"
          value={data.kpis.critical.toString()}
          subtext="Hardware or queue blockage"
          icon={<ShieldAlert size={20} />}
          trendText="Action Required"
          trendPositive={false}
        />
        <MetricCard
          title="High Severity"
          value={data.kpis.high.toString()}
          subtext="Low consumables threshold"
          icon={<AlertTriangle size={20} />}
          trendText="Threshold"
          trendPositive={false}
        />
        <MetricCard
          title="Mean Time To Resolve"
          value={`${data.kpis.avgResolutionTimeHours} hrs`}
          subtext="Fleet service SLA < 2.0 hrs"
          icon={<Clock size={20} />}
          trendText="Optimal"
          trendPositive={true}
        />
        <MetricCard
          title="Resolved (Last 24h)"
          value={data.kpis.resolved.toString()}
          subtext="Closed without escalation"
          icon={<CheckCircle2 size={20} />}
          trendText="Healthy"
          trendPositive={true}
        />
      </div>

      {/* Row 2: Filter Toolbar */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        {/* Severity Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {(['All', 'critical', 'high', 'medium', 'low'] as const).map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => setSeverityFilter(sev)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold uppercase transition-all shrink-0 cursor-pointer ${
                severityFilter === sev
                  ? 'bg-[#20D3A2] text-[#07111F] shadow-md shadow-[#20D3A2]/20 font-black'
                  : 'bg-[#07111F]/70 text-[#8EA6BF] hover:text-[#F5F7FA] hover:bg-[#132943] border border-[#1D3A59]'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>

        {/* Status Dropdown & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex items-center gap-2 bg-[#07111F]/70 border border-[#1D3A59] rounded-xl px-3 py-2">
            <Filter size={15} className="text-[#8EA6BF] shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              aria-label="Filter by status"
              className="bg-transparent text-xs font-semibold text-[#F5F7FA] outline-hidden cursor-pointer"
            >
              <option value="All" className="bg-[#0A1728] text-[#F5F7FA]">All Statuses</option>
              <option value="open" className="bg-[#0A1728] text-[#F5F7FA]">Open</option>
              <option value="investigating" className="bg-[#0A1728] text-[#F5F7FA]">Investigating</option>
              <option value="resolved" className="bg-[#0A1728] text-[#F5F7FA]">Resolved</option>
            </select>
          </div>

          <div className="relative min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8EA6BF]" />
            <input
              type="text"
              placeholder="Search alert, kiosk, error..."
              value={effectiveSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#07111F]/70 border border-[#1D3A59] rounded-xl text-xs text-[#F5F7FA] placeholder-[#6F89A3] focus:border-[#20D3A2] focus:outline-hidden transition-all"
            />
          </div>
        </div>
      </div>

      {/* Row 3: Desktop Table & Mobile Stacked Cards */}
      <div className="rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[#1D3A59] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-bold text-[#F5F7FA]">Fleet Incident Log</h3>
            <span className="text-xs font-semibold text-[#8EA6BF]">
              ({filteredIncidents.length} {filteredIncidents.length === 1 ? 'record' : 'records'})
            </span>
          </div>
        </div>

        {filteredIncidents.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 size={36} className="mx-auto text-[#20D3A2] opacity-80 mb-3" />
            <p className="text-sm font-bold text-[#F5F7FA]">No incidents matched your query</p>
            <p className="text-xs text-[#8EA6BF] mt-1">Fleet conditions are within normal thresholds.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1D3A59] bg-[#07111F]/40 text-[11px] font-black uppercase text-[#6F89A3] tracking-wider">
                    <th className="py-3.5 px-5">Incident ID</th>
                    <th className="py-3.5 px-5">Severity</th>
                    <th className="py-3.5 px-5">Title & Diagnostics</th>
                    <th className="py-3.5 px-5">Kiosk Node</th>
                    <th className="py-3.5 px-5">Category</th>
                    <th className="py-3.5 px-5 text-center">Status</th>
                    <th className="py-3.5 px-5 text-right">Reported</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1D3A59]/60 text-xs text-[#CAD7E6]">
                  {filteredIncidents.map((inc) => (
                    <tr
                      key={inc.id}
                      className="hover:bg-[#132943]/40 transition-colors"
                    >
                      <td className="py-4 px-5 font-mono font-bold text-[#20D3A2]">
                        {inc.incidentCode}
                      </td>
                      <td className="py-4 px-5">
                        {getSeverityBadge(inc.severity)}
                      </td>
                      <td className="py-4 px-5 max-w-[340px]">
                        <p className="font-bold text-[#F5F7FA]">{inc.title}</p>
                        <p className="text-[11px] text-[#8EA6BF] truncate mt-0.5">{inc.description}</p>
                      </td>
                      <td className="py-4 px-5">
                        <span className="font-semibold text-[#F5F7FA]">{inc.kioskName}</span>
                      </td>
                      <td className="py-4 px-5">
                        <span className="px-2 py-0.5 rounded bg-[#07111F] text-[#8EA6BF] text-[11px] border border-[#1D3A59]">
                          {inc.category}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-center">
                        {getStatusBadge(inc.status)}
                      </td>
                      <td className="py-4 px-5 text-right text-[11px] text-[#8EA6BF]">
                        {inc.timeAgo}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Card View */}
            <div className="md:hidden divide-y divide-[#1D3A59]/60">
              {filteredIncidents.map((inc) => (
                <div key={inc.id} className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-[#20D3A2]">
                        {inc.incidentCode}
                      </span>
                      {getSeverityBadge(inc.severity)}
                    </div>
                    {getStatusBadge(inc.status)}
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-[#F5F7FA]">{inc.title}</h4>
                    <p className="text-[11px] text-[#8EA6BF] mt-0.5">{inc.description}</p>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#8EA6BF] pt-1">
                    <span>{inc.kioskName}</span>
                    <span>{inc.timeAgo}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
