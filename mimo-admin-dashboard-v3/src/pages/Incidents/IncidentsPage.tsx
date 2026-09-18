import React, { useState } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Plus,
  MoreHorizontal,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useIncidents } from '../../hooks/useIncidents';
import { MetricCard } from '../../components/cards/MetricCard';
import { PageHeader } from '../../components/ui/PageHeader';
import { LoadingSkeleton } from '../../components/ui/LoadingSkeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { SearchInput } from '../../components/ui/SearchInput';
import type { IncidentRecord } from '../../types/incident';

export interface IncidentsPageProps {
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export const IncidentsPage: React.FC<IncidentsPageProps> = ({
  searchQuery = '',
}) => {
  const { data, loading, error, refresh } = useIncidents();
  const [filterTab, setFilterTab] = useState<'all' | 'open' | 'in_progress' | 'resolved' | 'archived'>('all');
  const [localSearch, setLocalSearch] = useState(searchQuery);

  if (loading) return <LoadingSkeleton rows={5} />;
  if (error || !data) {
    return (
      <EmptyState
        title="Failed to Load Incidents"
        description={error || 'An error occurred while loading incident tracking.'}
        actionText="Retry"
        onAction={refresh}
      />
    );
  }

  const effectiveSearch = searchQuery || localSearch;
  const filteredIncidents = data.incidents.filter((inc) => {
    const matchesTab =
      filterTab === 'all' ||
      (filterTab === 'open' && inc.status === 'open') ||
      (filterTab === 'in_progress' && inc.status === 'in_progress') ||
      (filterTab === 'resolved' && inc.status === 'resolved');

    const matchesSearch =
      !effectiveSearch ||
      inc.title.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      inc.incidentCode.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      inc.kioskName.toLowerCase().includes(effectiveSearch.toLowerCase());

    return matchesTab && matchesSearch;
  });

  const getSeverityBadge = (sev: IncidentRecord['severity']) => {
    switch (sev) {
      case 'critical':
        return <span className="px-2.5 py-1 rounded-full text-xs sm:text-[12px] font-semibold uppercase tracking-wider bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">Critical</span>;
      case 'high':
        return <span className="px-2.5 py-1 rounded-full text-xs sm:text-[12px] font-semibold uppercase tracking-wider bg-orange-100 dark:bg-orange-950/70 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-800/60">High</span>;
      case 'medium':
        return <span className="px-2.5 py-1 rounded-full text-xs sm:text-[12px] font-semibold uppercase tracking-wider bg-yellow-100 dark:bg-yellow-950/70 text-yellow-800 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800/60">Medium</span>;
      case 'low':
        return <span className="px-2.5 py-1 rounded-full text-xs sm:text-[12px] font-semibold uppercase tracking-wider bg-[#EEF2FF] dark:bg-indigo-950/70 text-[#4F46E5] dark:text-[#A5B4FC] border border-indigo-200 dark:border-indigo-800/60">Low</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs sm:text-[12px] font-semibold uppercase tracking-wider bg-slate-100 dark:bg-[#1E314B] text-slate-600 dark:text-[#CBD5E1]">Info</span>;
    }
  };

  const getStatusBadge = (status: IncidentRecord['status']) => {
    switch (status) {
      case 'open':
        return <span className="px-2.5 py-1 rounded-full text-xs sm:text-[12px] font-semibold uppercase tracking-wider bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60">Open</span>;
      case 'in_progress':
        return <span className="px-2.5 py-1 rounded-full text-xs sm:text-[12px] font-semibold uppercase tracking-wider bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60">In Progress</span>;
      case 'resolved':
        return <span className="px-2.5 py-1 rounded-full text-xs sm:text-[12px] font-semibold uppercase tracking-wider bg-[#EEF2FF] dark:bg-indigo-950/50 text-[#4F46E5] dark:text-[#A5B4FC] border border-indigo-200 dark:border-indigo-800/60">Resolved</span>;
      case 'archived':
        return <span className="px-2.5 py-1 rounded-full text-xs sm:text-[12px] font-semibold uppercase tracking-wider bg-slate-100 dark:bg-[#1E314B] text-slate-600 dark:text-[#CBD5E1]">Archived</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs sm:text-[12px] font-semibold uppercase tracking-wider bg-slate-100 dark:bg-[#1E314B] text-slate-600 dark:text-[#CBD5E1]">{status}</span>;
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:gap-3.5 lg:gap-4 animate-in fade-in duration-200 font-sans">
      {/* Page Header */}
      <PageHeader
        title="Incidents"
        description="Track, analyze and resolve hardware faults, SLA timers, and printer status across all MIMO kiosks."
        actions={
          <button
            type="button"
            onClick={() => alert('New Incident reporting modal')}
            className="flex items-center gap-2 px-4.5 h-11 bg-[#6366F1] hover:bg-[#4F46E5] text-white rounded-xl text-sm sm:text-[15px] font-medium transition-all shadow-xs cursor-pointer"
          >
            <Plus size={16} />
            <span>Report Incident</span>
          </button>
        }
      />

      {/* Row 1: 5 Severity KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-3.5 lg:gap-4 items-start">
        <MetricCard
          title="Critical"
          value={data.kpis.critical}
          trendText="— 0% vs yesterday"
          icon={<AlertCircle size={16} />}
          iconBg="bg-[#FCE7F3] text-[#E11D48] dark:bg-[#E11D48]/20 dark:text-[#FB7185]"
        />
        <MetricCard
          title="High"
          value={data.kpis.high}
          trendText="↑ +1 vs yesterday"
          trendPositive={false}
          icon={<AlertTriangle size={16} className="text-orange-600 dark:text-orange-400" />}
          iconBg="bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400"
        />
        <MetricCard
          title="Medium"
          value={data.kpis.medium}
          trendText="↓ -2 vs yesterday"
          trendPositive={true}
          icon={<AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />}
          iconBg="bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400"
        />
        <MetricCard
          title="Low"
          value={data.kpis.low}
          trendText="↓ -6 vs yesterday"
          trendPositive={true}
          icon={<CheckCircle2 size={16} />}
          iconBg="bg-[#D1FAE5] text-[#059669] dark:bg-[#059669]/20 dark:text-[#34D399]"
        />
        <MetricCard
          title="Resolved"
          value={data.kpis.resolvedToday}
          trendText="↗ +31% vs yesterday"
          trendPositive={true}
          icon={<CheckCircle2 size={16} />}
          iconBg="bg-[#EEF2FF] text-[#4F46E5] dark:bg-[#818CF8]/20 dark:text-[#818CF8]"
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* Row 2: Incident Trend + Incidents by Category + Top Affected Kiosks */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-3.5 lg:gap-4 items-start">
        {/* Incident Trend (5 cols) */}
        <div className="lg:col-span-5 mimo-card p-5 sm:p-6 flex flex-col justify-between">
          <div className="mimo-card-header">
            <h3 className="text-base sm:text-[18px] font-semibold text-slate-900 dark:text-[#F1F5F9]">Incident Trend</h3>
            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-[#8495AA]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Critical</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /> High</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Med</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#6366F1]" /> Low</span>
            </div>
          </div>

          <div className="mimo-card-body min-h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trends} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1E314B" opacity={0.4} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#8495AA', fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#8495AA', fontSize: 11 }} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    return (
                      <div className="bg-slate-900 dark:bg-[#0C1829] border border-slate-700 dark:border-[#1E314B] p-2.5 rounded-xl shadow-xl text-xs text-white">
                        <p className="font-semibold text-slate-300 mb-1">{label}</p>
                        {payload.map((entry, idx) => (
                          <p key={idx} className="font-semibold text-[11px]" style={{ color: entry.color }}>
                            {entry.name}: {entry.value}
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="low" stackId="1" stroke="#6366F1" fill="#6366F1" fillOpacity={0.4} />
                <Area type="monotone" dataKey="medium" stackId="1" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.4} />
                <Area type="monotone" dataKey="high" stackId="1" stroke="#F97316" fill="#F97316" fillOpacity={0.4} />
                <Area type="monotone" dataKey="critical" stackId="1" stroke="#EF4444" fill="#EF4444" fillOpacity={0.4} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Incidents by Category (4 cols) */}
        <div className="lg:col-span-4 mimo-card p-5 sm:p-6 flex flex-col justify-between">
          <div className="mimo-card-header">
            <h3 className="text-base sm:text-[18px] font-semibold text-slate-900 dark:text-[#F1F5F9]">Incidents by Category</h3>
            <span className="text-xs sm:text-[13px] font-medium text-slate-500 dark:text-[#8495AA]">Last 7 Days</span>
          </div>

          <div className="mimo-card-body flex flex-col sm:flex-row items-center justify-around gap-4 min-h-[220px]">
            <div className="relative flex items-center justify-center w-[130px] h-[130px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.categories}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={56}
                    dataKey="count"
                    strokeWidth={0}
                  >
                    {data.categories.map((c) => (
                      <Cell key={c.category} fill={c.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-lg font-semibold text-slate-900 dark:text-[#F1F5F9] leading-none">17</span>
                <span className="text-[11px] text-slate-400 dark:text-[#8495AA] font-normal mt-0.5">Total</span>
              </div>
            </div>

            <div className="flex-1 space-y-2 text-xs w-full">
              {data.categories.map((cat) => (
                <div key={cat.category} className="flex items-center justify-between text-xs sm:text-[13px] text-slate-600 dark:text-[#C3CFDD] p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-[#14243A]">
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="truncate font-medium">{cat.category}</span>
                  </div>
                  <span className="font-semibold text-slate-900 dark:text-[#F1F5F9] ml-2">{cat.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Affected Kiosks (3 cols) */}
        <div className="lg:col-span-3 mimo-card p-5 sm:p-6 flex flex-col justify-between">
          <div className="mimo-card-header">
            <h3 className="text-base sm:text-[18px] font-semibold text-slate-900 dark:text-[#F1F5F9]">Top Affected</h3>
            <span className="text-xs sm:text-[13px] font-medium text-slate-500 dark:text-[#8495AA]">7 Days</span>
          </div>

          <div className="mimo-card-body flex flex-col justify-around gap-3 min-h-[220px]">
            {data.affectedKiosks.map((k) => (
              <div key={k.kioskName} className="space-y-1.5">
                <div className="flex items-center justify-between font-medium text-slate-800 dark:text-[#F1F5F9] text-xs sm:text-[13px]">
                  <span>{k.kioskName}</span>
                  <span className="font-semibold">{k.count}</span>
                </div>
                <div className="h-2 w-full bg-slate-100 dark:bg-[#0C1829] rounded-full overflow-hidden border border-slate-200/60 dark:border-[#1E314B]">
                  <div className="h-full rounded-full" style={{ width: `${(k.count / 6) * 100}%`, backgroundColor: k.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Main Incident Table (8 cols) + Right Activity & SLA (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-3.5 lg:gap-4 items-start">
        {/* Left Column: Incidents Table (8 cols) */}
        <div className="lg:col-span-8 mimo-card overflow-hidden p-5 sm:p-6 lg:p-7 !h-auto">
          {/* Filter Tabs & Search Controls */}
          <div className="pb-4 border-b border-slate-100 dark:border-[#1E314B] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {(['all', 'open', 'in_progress', 'resolved'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilterTab(tab)}
                  className={`px-4 py-2 h-10 rounded-xl text-xs sm:text-[14px] font-semibold transition-all cursor-pointer ${
                    filterTab === tab
                      ? 'bg-[#6366F1] text-white shadow-xs dark:bg-[#6366F1] dark:text-white'
                      : 'bg-slate-100 dark:bg-[#0C1829] text-slate-600 dark:text-[#C3CFDD] hover:text-slate-900 dark:hover:text-white border border-transparent dark:border-[#1E314B]'
                  }`}
                >
                  {tab === 'all' ? 'All (17)' : tab === 'open' ? 'Open (7)' : tab === 'in_progress' ? 'In Progress (3)' : 'Resolved (17)'}
                </button>
              ))}
            </div>

            <div className="w-full sm:w-auto min-w-[240px] sm:min-w-[280px]">
              <SearchInput
                placeholder="Search incident title, kiosk..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                iconSize={16}
                inputSize="sm"
                className="!h-10 text-xs sm:text-[14px]"
              />
            </div>
          </div>

          {/* Table */}
          <div className="mt-3.5 overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-[#1E314B] text-[13px] sm:text-[14px] font-semibold uppercase text-slate-400 dark:text-[#8495AA] tracking-wider">
                  <th className="py-3 px-3 min-w-[80px]">#</th>
                  <th className="py-3 px-3 min-w-[170px]">Title</th>
                  <th className="py-3 px-3 min-w-[90px]">Kiosk</th>
                  <th className="py-3 px-3 min-w-[120px]">Category</th>
                  <th className="py-3 px-3 min-w-[110px]">Severity</th>
                  <th className="py-3 px-3 min-w-[120px]">Status</th>
                  <th className="py-3 px-3 min-w-[150px]">Reported At</th>
                  <th className="py-3 px-3 min-w-[110px]">Assigned To</th>
                  <th className="py-3 px-2 text-right min-w-[40px]">•••</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1E314B]">
                {filteredIncidents.map((inc) => (
                  <tr key={inc.id} className="hover:bg-slate-50 dark:hover:bg-[#15253B] transition-colors h-[50px] sm:h-[54px]">
                    <td className="py-3 px-3 font-mono font-semibold text-[13px] sm:text-[14px] text-slate-500 dark:text-[#8495AA] whitespace-nowrap">{inc.incidentCode}</td>
                    <td className="py-3 px-3 font-semibold text-[14px] sm:text-[15px] text-slate-900 dark:text-[#F1F5F9] max-w-[200px] truncate">{inc.title}</td>
                    <td className="py-3 px-3 text-slate-700 dark:text-[#C3CFDD] font-medium text-[14px] sm:text-[15px] whitespace-nowrap">{inc.kioskName}</td>
                    <td className="py-3 px-3 text-slate-600 dark:text-[#8495AA] text-[13px] sm:text-[14px] whitespace-nowrap">{inc.category}</td>
                    <td className="py-3 px-3 whitespace-nowrap">{getSeverityBadge(inc.severity)}</td>
                    <td className="py-3 px-3 whitespace-nowrap">{getStatusBadge(inc.status)}</td>
                    <td className="py-3 px-3 text-slate-500 dark:text-[#8495AA] text-[13px] sm:text-[14px] font-medium whitespace-nowrap">{inc.reportedAt}</td>
                    <td className="py-3 px-3 text-slate-700 dark:text-[#C3CFDD] text-[14px] sm:text-[15px] font-medium whitespace-nowrap">{inc.assignedTo}</td>
                    <td className="py-3 px-2 text-right whitespace-nowrap">
                      <button type="button" title="Actions" className="p-1.5 text-slate-400 dark:text-[#8495AA] hover:text-slate-700 dark:hover:text-[#F1F5F9] rounded-lg hover:bg-slate-100 dark:hover:bg-[#1E314B] cursor-pointer">
                        <MoreHorizontal size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Recent Activity + Incident SLA (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-3 sm:gap-3.5 lg:gap-4">
          {/* Recent Activity */}
          <div className="mimo-card p-5 sm:p-6 lg:p-7 space-y-4 !h-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1E314B]">
              <h3 className="text-base sm:text-[18px] font-semibold text-slate-900 dark:text-[#F1F5F9]">Recent Activity</h3>
              <a href="#activity" className="text-xs sm:text-[13px] font-semibold text-indigo-600 dark:text-[#818CF8] hover:underline">View all →</a>
            </div>

            <div className="space-y-3">
              {data.recentActivity.map((act) => (
                <div key={act.id} className="flex items-start gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: act.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[13px] sm:text-[14px] text-slate-800 dark:text-[#F1F5F9] truncate">{act.text}</p>
                    <span className="text-xs text-slate-400 dark:text-[#8495AA]">{act.timeAgo}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Incident SLA */}
          <div className="mimo-card p-5 sm:p-6 lg:p-7 space-y-4 !h-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1E314B]">
              <h3 className="text-base sm:text-[18px] font-semibold text-slate-900 dark:text-[#F1F5F9]">Incident SLA</h3>
              <span className="text-xs sm:text-[13px] font-medium text-slate-500 dark:text-[#8495AA]">7 Days</span>
            </div>

            <div className="flex items-center gap-4 pt-1">
              <div className="relative flex items-center justify-center w-[90px] h-[90px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[{ name: 'Within SLA', value: data.slaPercentage }, { name: 'Breached', value: 100 - data.slaPercentage }]}
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={42}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      <Cell fill="#6366F1" />
                      <Cell fill="#E2E8F0" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-base font-semibold text-slate-900 dark:text-[#F1F5F9] leading-none">{data.slaPercentage}%</span>
                </div>
              </div>

              <div>
                <p className="text-sm sm:text-[15px] font-semibold text-slate-900 dark:text-[#F1F5F9]">Resolved within SLA</p>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-[#8495AA] mt-1">{data.slaResolvedCount} / {data.slaTotalCount} incidents</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
