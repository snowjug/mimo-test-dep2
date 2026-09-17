import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Search,
  Check,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface IncidentItem {
  id: string;
  title: string;
  description: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Resolved';
  kiosk: string;
  kioskCode: string;
  status: 'Open' | 'Investigating' | 'Resolved';
  slaRemaining: string;
  timeAgo: string;
  assignee: string;
}

const INITIAL_INCIDENTS: IncidentItem[] = [
  {
    id: 'INC-4092',
    title: 'Paper Tray Low (below 15%)',
    description: 'Tray 1 capacity reached 70 sheets. Prompting replenishment.',
    severity: 'High',
    kiosk: 'MIMO 2 (Admin Block)',
    kioskCode: 'SV-002',
    status: 'Open',
    slaRemaining: '45m remaining',
    timeAgo: '14m ago',
    assignee: 'Campus Facilities',
  },
  {
    id: 'INC-4091',
    title: 'Print retry backlog reached threshold',
    description: '2 jobs queued for automatic re-dispatch due to user session pause.',
    severity: 'High',
    kiosk: 'MIMO 2 (Admin Block)',
    kioskCode: 'SV-002',
    status: 'Investigating',
    slaRemaining: '1h 10m remaining',
    timeAgo: '38m ago',
    assignee: 'Auto-Dispatch Guard',
  },
  {
    id: 'INC-4090',
    title: 'Toner Cartridge warning',
    description: 'Black toner level at 18%. Refill recommended before peak rush.',
    severity: 'Medium',
    kiosk: 'MIMO 3 (Cafeteria)',
    kioskCode: 'SV-003',
    status: 'Open',
    slaRemaining: '3h remaining',
    timeAgo: '1h ago',
    assignee: 'Campus Support',
  },
  {
    id: 'INC-4089',
    title: 'Print spooler service delayed',
    description: 'Spooler process latency recovered to 0.8s.',
    severity: 'Resolved',
    kiosk: 'MIMO 1 (Main Library)',
    kioskCode: 'CV-001',
    status: 'Resolved',
    slaRemaining: 'Met SLA (8m)',
    timeAgo: '2h ago',
    assignee: 'System Watchdog',
  },
  {
    id: 'INC-4088',
    title: 'Network gateway reconnect',
    description: 'Autonomous mesh fallback engaged smoothly.',
    severity: 'Resolved',
    kiosk: 'MIMO 4 (Hostel Block)',
    kioskCode: 'SV-004',
    status: 'Resolved',
    slaRemaining: 'Met SLA (2m)',
    timeAgo: '4h ago',
    assignee: 'Mesh Telemetry',
  },
];

export const IncidentsPage: React.FC = () => {
  const { isDark } = useTheme();
  const [incidents, setIncidents] = useState<IncidentItem[]>(INITIAL_INCIDENTS);
  const [filterSeverity, setFilterSeverity] = useState<'All' | 'Critical' | 'High' | 'Medium' | 'Resolved'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const handleResolve = (id: string) => {
    setIncidents((prev) =>
      prev.map((inc) => (inc.id === id ? { ...inc, status: 'Resolved', severity: 'Resolved' } : inc))
    );
  };

  const filteredIncidents = incidents.filter((inc) => {
    const matchesSearch =
      inc.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.kiosk.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (filterSeverity !== 'All' && inc.severity !== filterSeverity) return false;
    return true;
  });

  const criticalCount = incidents.filter((i) => i.severity === 'Critical').length;
  const highCount = incidents.filter((i) => i.severity === 'High').length;
  const mediumCount = incidents.filter((i) => i.severity === 'Medium').length;
  const resolvedCount = incidents.filter((i) => i.severity === 'Resolved').length;

  return (
    <div className="w-full space-y-6 pb-12 select-none font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className={`text-2xl sm:text-3xl font-black tracking-tight ${
            isDark ? 'text-white' : 'text-[#1e1b4b]'
          }`}>
            Incident Management & SLAs
          </h1>
          <p className={`text-xs sm:text-sm font-medium mt-0.5 ${
            isDark ? 'text-slate-400' : 'text-gray-500'
          }`}>
            Real-time tracking of hardware alerts, paper jams, and service requests
          </p>
        </div>

        <span className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider shadow-sm self-start sm:self-auto border ${
          isDark
            ? 'bg-purple-950/60 border-purple-800/60 text-[#a78bfa]'
            : 'bg-purple-50 border-purple-200 text-[#7c3aed]'
        }`}>
          2 Active SLA Timers
        </span>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Critical */}
        <div className={`border rounded-2xl p-5 shadow-sm ${
          isDark ? 'bg-red-950/30 border-red-800/40' : 'bg-red-50/60 border-red-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-extrabold uppercase tracking-wider ${
              isDark ? 'text-red-300' : 'text-red-800'
            }`}>
              CRITICAL INCIDENTS
            </span>
            <div className="w-7 h-7 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center font-bold">
              <ShieldAlert size={15} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-red-500">{criticalCount}</div>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-red-400' : 'text-red-700/80'}`}>Zero outages active</p>
          </div>
        </div>

        {/* High / Medium */}
        <div className={`border rounded-2xl p-5 shadow-sm ${
          isDark ? 'bg-amber-950/30 border-amber-800/40' : 'bg-amber-50/60 border-amber-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-extrabold uppercase tracking-wider ${
              isDark ? 'text-amber-300' : 'text-amber-800'
            }`}>
              HIGH & MEDIUM ALERTS
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
              <AlertTriangle size={15} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-amber-500">{highCount + mediumCount}</div>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-amber-400' : 'text-amber-700/80'}`}>{highCount} High, {mediumCount} Medium</p>
          </div>
        </div>

        {/* Average Resolution */}
        <div className={`border rounded-2xl p-5 shadow-sm ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              AVG RESOLUTION TIME
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center">
              <Clock size={15} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-blue-500">14m</div>
            <p className="text-xs text-gray-400 mt-0.5">SLA target: &lt;30m</p>
          </div>
        </div>

        {/* Resolved Today */}
        <div className={`border rounded-2xl p-5 shadow-sm ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              RESOLVED TODAY
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 size={15} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-emerald-500">{resolvedCount}</div>
            <p className="text-xs text-gray-400 mt-0.5">100% SLA compliance</p>
          </div>
        </div>
      </div>

      {/* Main Incident Records Table Card */}
      <div className={`border rounded-2xl p-6 shadow-sm space-y-4 ${
        isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
      }`}>
        {/* Filter and Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className={`flex items-center gap-1.5 p-1 rounded-xl border self-start md:self-auto overflow-x-auto max-w-full ${
            isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-gray-50 border-gray-200'
          }`}>
            {['All', 'Critical', 'High', 'Medium', 'Resolved'].map((sev) => (
              <button
                key={sev}
                onClick={() => setFilterSeverity(sev as any)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  filterSeverity === sev
                    ? isDark ? 'bg-purple-950/80 text-[#a78bfa]' : 'bg-white text-[#7c3aed] shadow-xs'
                    : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-80">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search incidents by ID, title, kiosk..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl transition-all focus:outline-none ${
                isDark
                  ? 'bg-slate-800/80 border border-slate-700 text-white placeholder-slate-400 focus:border-[#8b5cf6]'
                  : 'bg-gray-50 border border-gray-200 text-[#1e1b4b] placeholder-gray-400 focus:border-[#7c3aed] focus:bg-white'
              }`}
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className={`border-b text-[10px] uppercase font-extrabold tracking-wider ${
                isDark ? 'border-slate-700 text-slate-400' : 'border-gray-100 text-gray-400'
              }`}>
                <th className="pb-3 pl-2">Incident ID</th>
                <th className="pb-3">Severity</th>
                <th className="pb-3">Issue Title & Description</th>
                <th className="pb-3">Node Location</th>
                <th className="pb-3">SLA Status</th>
                <th className="pb-3">Time Ago</th>
                <th className="pb-3 pr-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className={`divide-y font-medium ${
              isDark ? 'divide-slate-700/60' : 'divide-gray-100'
            }`}>
              {filteredIncidents.map((inc) => (
                <tr key={inc.id} className="hover:bg-purple-500/10 transition-colors">
                  <td className="py-3.5 pl-2 font-mono font-bold text-[#a78bfa]">{inc.id}</td>
                  <td className="py-3.5 whitespace-nowrap">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                        inc.severity === 'Critical'
                          ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                          : inc.severity === 'High'
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : inc.severity === 'Medium'
                          ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                          : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {inc.severity}
                    </span>
                  </td>
                  <td className="py-3.5 max-w-[280px]">
                    <div className={`font-bold ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>{inc.title}</div>
                    <div className="text-[11px] text-gray-400 truncate mt-0.5">{inc.description}</div>
                  </td>
                  <td className={`py-3.5 whitespace-nowrap font-semibold ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                    {inc.kiosk}
                  </td>
                  <td className="py-3.5 whitespace-nowrap">
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>{inc.slaRemaining}</span>
                  </td>
                  <td className="py-3.5 text-gray-400 whitespace-nowrap text-[11px]">
                    {inc.timeAgo}
                  </td>
                  <td className="py-3.5 pr-2 text-right whitespace-nowrap">
                    {inc.status !== 'Resolved' ? (
                      <button
                        onClick={() => handleResolve(inc.id)}
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                          isDark
                            ? 'bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-400 border-emerald-800/40'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        <Check size={12} className="stroke-[3]" />
                        Mark Resolved
                      </button>
                    ) : (
                      <span className="text-xs font-bold text-gray-400">Closed</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredIncidents.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-gray-400">
                    No incidents matched your query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
