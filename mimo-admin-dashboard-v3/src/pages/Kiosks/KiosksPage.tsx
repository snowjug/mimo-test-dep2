import React, { useState } from 'react';
import {
  HardDrive,
  Printer,
  Clock,
  Plus,
  Filter,
  RotateCcw,
  PowerOff,
  Settings,
  MoreHorizontal,
} from 'lucide-react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useKiosks } from '../../hooks/useKiosks';
import { MetricCard } from '../../components/cards/MetricCard';
import { PageHeader } from '../../components/ui/PageHeader';
import { LoadingSkeleton } from '../../components/ui/LoadingSkeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { SearchInput } from '../../components/ui/SearchInput';
import { KioskBadge } from '../../components/cards/RecentPrintJobsCard';
import type { KioskEntityRecord } from '../../types/kiosk';

export interface KiosksPageProps {
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export const KiosksPage: React.FC<KiosksPageProps> = ({
  searchQuery = '',
}) => {
  const { data, loading, error, refresh } = useKiosks();
  const [filterTab, setFilterTab] = useState<'all' | 'online' | 'offline' | 'printing' | 'idle'>('all');
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [selectedKiosk, setSelectedKiosk] = useState<KioskEntityRecord | null>(null);

  if (loading) return <LoadingSkeleton rows={5} />;
  if (error || !data) {
    return (
      <EmptyState
        title="Failed to Load Kiosks"
        description={error || 'An error occurred while loading kiosk telemetry.'}
        actionText="Retry"
        onAction={refresh}
      />
    );
  }

  const activeKiosk = selectedKiosk || data.selectedKiosk;
  const effectiveSearch = searchQuery || localSearch;
  const filteredKiosks = data.kiosks.filter((k) => {
    const matchesTab =
      filterTab === 'all' ||
      (filterTab === 'online' && k.status === 'Online') ||
      (filterTab === 'printing' && k.status === 'Printing') ||
      (filterTab === 'idle' && k.status === 'Idle') ||
      (filterTab === 'offline' && k.status === 'Offline');

    const matchesSearch =
      !effectiveSearch ||
      k.name.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      k.location.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      k.kioskCode.toLowerCase().includes(effectiveSearch.toLowerCase());

    return matchesTab && matchesSearch;
  });

  return (
    <div className="flex flex-col gap-3 sm:gap-3.5 lg:gap-4 animate-in fade-in duration-200 font-sans">
      {/* Page Header */}
      <PageHeader
        title="Kiosks"
        description="Monitor, manage and configure all MIMO physical printing kiosks in real-time."
        actions={
          <button
            type="button"
            onClick={() => alert('Add New Kiosk provisioning modal')}
            className="flex items-center gap-2 px-4.5 h-11 bg-[#6366F1] hover:bg-[#4F46E5] text-white rounded-xl text-sm sm:text-[15px] font-medium transition-all shadow-xs cursor-pointer"
          >
            <Plus size={16} />
            <span>Add New Kiosk</span>
          </button>
        }
      />

      {/* Row 1: Left 5 KPI Cards (8 cols) + Right Selected Kiosk Hero Card (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-3.5 lg:gap-4 items-start">
        {/* Left Column: 5 KPI Cards + Kiosks Table */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-3 sm:gap-3.5 lg:gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-3.5 lg:gap-4 items-start">
            <MetricCard
              title="Total Kiosks"
              value={data.kpis.totalKiosks}
              subtitle="All kiosks in fleet"
              icon={<HardDrive size={16} />}
              iconBg="bg-[#EEF2FF] text-[#4F46E5] dark:bg-[#818CF8]/20 dark:text-[#818CF8]"
            />
            <MetricCard
              title="Online"
              value={data.kpis.online}
              subtitle="100% online"
              icon={<span className="w-2.5 h-2.5 rounded-full bg-[#6366F1] animate-pulse" />}
              iconBg="bg-[#EEF2FF] text-[#4F46E5] dark:bg-indigo-950/60 dark:text-[#A5B4FC]"
            />
            <MetricCard
              title="Printing"
              value={data.kpis.printingNow}
              subtitle="Active jobs"
              icon={<Printer size={16} />}
              iconBg="bg-[#F3E8FF] text-[#7C3AED] dark:bg-[#9333EA]/20 dark:text-[#C084FC]"
            />
            <MetricCard
              title="Idle"
              value={data.kpis.idle}
              subtitle="Ready for users"
              icon={<Clock size={16} />}
              iconBg="bg-[#E0F2FE] text-[#0284C7] dark:bg-[#0284C7]/20 dark:text-[#38BDF8]"
            />
            <MetricCard
              title="Offline"
              value={data.kpis.offline}
              subtitle="Operational"
              icon={<HardDrive size={16} />}
              iconBg="bg-[#FCE7F3] text-[#E11D48] dark:bg-[#E11D48]/20 dark:text-[#FB7185]"
              className="col-span-2 sm:col-span-1"
            />
          </div>

          {/* Kiosks Table / Filter Strip */}
          <div className="mimo-card overflow-hidden p-5 sm:p-6 lg:p-7 !h-auto">
            <div className="pb-4 border-b border-slate-100 dark:border-[#1E314B] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {(['all', 'online', 'offline', 'printing', 'idle'] as const).map((tab) => (
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
                    {tab === 'all' ? 'All (3)' : tab === 'online' ? 'Online (3)' : tab === 'offline' ? 'Offline (0)' : tab === 'printing' ? 'Printing (1)' : 'Idle (2)'}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <div className="min-w-[220px] sm:min-w-[260px]">
                  <SearchInput
                    placeholder="Search kiosk name..."
                    value={localSearch}
                    onChange={(e) => setLocalSearch(e.target.value)}
                    iconSize={16}
                    inputSize="sm"
                    className="!h-10 text-xs sm:text-[14px]"
                  />
                </div>
                <div className="flex items-center gap-1.5 px-3.5 h-10 bg-slate-50 dark:bg-[#14243A] border border-slate-200 dark:border-[#1E314B] rounded-xl text-xs sm:text-[14px] font-semibold text-slate-700 dark:text-[#C3CFDD] cursor-pointer hover:bg-slate-100 dark:hover:bg-[#1B2E4A] transition-colors">
                  <Filter size={14} className="text-indigo-600 dark:text-[#818CF8]" />
                  <span>Filter</span>
                </div>
              </div>
            </div>

            <div className="mt-3.5 overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-[#1E314B] text-[13px] sm:text-[14px] font-semibold uppercase text-slate-400 dark:text-[#8495AA] tracking-wider">
                    <th className="py-3 px-3 min-w-[140px]">Kiosk</th>
                    <th className="py-3 px-3 min-w-[100px]">Status</th>
                    <th className="py-3 px-3 min-w-[150px]">Current Job</th>
                    <th className="py-3 px-3 text-center min-w-[80px]">Pages</th>
                    <th className="py-3 px-3 text-right min-w-[100px]">Revenue</th>
                    <th className="py-3 px-3 min-w-[130px]">Location</th>
                    <th className="py-3 px-3 min-w-[90px]">Uptime</th>
                    <th className="py-3 px-2 text-right min-w-[40px]">•••</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1E314B]">
                  {filteredKiosks.map((k) => (
                    <tr
                      key={k.id}
                      onClick={() => setSelectedKiosk(k)}
                      className={`hover:bg-slate-50 dark:hover:bg-[#15253B] transition-colors cursor-pointer h-[50px] sm:h-[54px] ${
                        activeKiosk.id === k.id ? 'bg-indigo-50/50 dark:bg-indigo-950/40' : ''
                      }`}
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <KioskBadge 
                            kiosk={k.name.includes('MIMO 1') || k.kioskCode.startsWith('CV-001') ? 'M1' : 'M2'} 
                            isColor={k.isColor ?? (k.printerType === 'Color')} 
                          />
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-[#F1F5F9] text-[14px] sm:text-[15px] leading-tight">{k.name}</p>
                            <span className="text-xs text-slate-400 dark:text-[#8495AA] font-mono">{k.kioskCode}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-xs sm:text-[13px] font-semibold text-[#6366F1] dark:text-[#A5B4FC]">
                          <span className="w-2 h-2 rounded-full bg-[#6366F1] animate-pulse" />
                          <span>{k.status}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        {k.currentJobName && k.currentJobName !== 'Idle' ? (
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-[#F1F5F9] text-xs sm:text-[13px]">{k.currentJobName}</p>
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#8495AA] mt-0.5">
                              <span>{k.currentJobPages} pages</span>
                              <div className="w-14 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${k.currentJobProgress || 50}%` }} />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <p className="font-semibold text-slate-700 dark:text-[#C3CFDD] text-xs sm:text-[13px]">Idle</p>
                            <span className="text-xs text-slate-400 dark:text-[#8495AA]">Ready for users</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-semibold text-slate-800 dark:text-[#F1F5F9] text-[14px] sm:text-[15px]">{k.pagesToday}</td>
                      <td className="py-3 px-3 text-right font-semibold text-indigo-700 dark:text-[#818CF8] text-[14px] sm:text-[15px]">₹{k.revenueToday.toLocaleString()}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-[#8495AA] text-[13px] sm:text-[14px]">{k.location}</td>
                      <td className="py-3 px-3 font-semibold text-slate-900 dark:text-[#F1F5F9] text-[14px] sm:text-[15px]">{k.uptimePercent}%</td>
                      <td className="py-3 px-2 text-right">
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
        </div>

        {/* Right Column: Selected Kiosk Detail Card */}
        <div className="lg:col-span-5 xl:col-span-4 mimo-card p-6 sm:p-7 flex flex-col justify-between !h-auto shadow-xs">
          <div className="space-y-6 sm:space-y-7">
            {/* 1. Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#1E314B]">
              <div className="flex items-center gap-3">
                <KioskBadge 
                  kiosk={activeKiosk.name.includes('MIMO 1') || activeKiosk.kioskCode.startsWith('CV-001') ? 'M1' : 'M2'} 
                  isColor={activeKiosk.isColor ?? (activeKiosk.printerType === 'Color')} 
                />
                <h3 className="text-lg sm:text-[20px] font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight">{activeKiosk.name}</h3>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#EEF2FF] text-[#6366F1] dark:bg-indigo-950/70 dark:text-[#A5B4FC] border border-indigo-200/80 dark:border-indigo-800/70">
                  <span className="w-2 h-2 rounded-full bg-[#6366F1] animate-pulse" />
                  <span>{activeKiosk.status}</span>
                </span>
              </div>
              <button
                type="button"
                title="Actions"
                className="p-1.5 text-slate-400 dark:text-[#8495AA] hover:text-slate-700 dark:hover:text-[#F1F5F9] rounded-lg hover:bg-slate-100 dark:hover:bg-[#1E314B] transition-colors cursor-pointer"
              >
                <MoreHorizontal size={18} />
              </button>
            </div>

            {/* 2. Device Info & Preview */}
            <div className="flex items-center gap-5 sm:gap-6">
              {/* Kiosk preview container */}
              <div className="w-18 sm:w-20 h-28 sm:h-32 rounded-2xl bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950 text-white flex flex-col items-center justify-between p-2.5 shadow-md shrink-0 border border-indigo-900/60 dark:border-[#1E314B]">
                <div className="w-full h-18 bg-indigo-900/40 rounded-xl flex flex-col items-center justify-center text-[10px] text-indigo-300 font-bold border border-indigo-700/50 shadow-inner">
                  <span className="tracking-wider">MIMO</span>
                  <span className="w-4 h-0.5 bg-indigo-400/70 rounded-full mt-1.5" />
                </div>
                <div className="w-6 h-1.5 bg-slate-700 rounded-full mb-0.5" />
              </div>

              {/* Information 2-column layout */}
              <div className="flex-1 min-w-0 space-y-2.5 text-xs sm:text-[14px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400 dark:text-[#8495AA] shrink-0">Kiosk ID</span>
                  <span className="font-semibold text-slate-900 dark:text-[#F1F5F9] text-right font-mono">{activeKiosk.kioskCode}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400 dark:text-[#8495AA] shrink-0">Location</span>
                  <span className="font-semibold text-slate-900 dark:text-[#F1F5F9] text-right truncate" title={activeKiosk.location}>
                    {activeKiosk.location}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400 dark:text-[#8495AA] shrink-0">IP Address</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-[#F1F5F9] text-right">{activeKiosk.ipAddress}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400 dark:text-[#8495AA] shrink-0">Uptime</span>
                  <span className="font-semibold text-slate-900 dark:text-[#F1F5F9] text-right">{activeKiosk.uptimePercent}%</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400 dark:text-[#8495AA] shrink-0">Firmware</span>
                  <span className="font-semibold text-slate-900 dark:text-[#F1F5F9] text-right">{activeKiosk.firmware}</span>
                </div>
              </div>
            </div>

            {/* 3. Quick Actions */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={() => alert(`Restarting ${activeKiosk.name}...`)}
                className="h-10 sm:h-11 px-2 bg-slate-50 dark:bg-[#14243A] hover:bg-slate-100 dark:hover:bg-[#1A2E4B] border border-slate-200 dark:border-[#1E314B] rounded-xl text-xs sm:text-[14px] font-semibold text-slate-700 dark:text-[#C3CFDD] flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <RotateCcw size={14} className="shrink-0 text-indigo-600 dark:text-[#818CF8]" />
                <span>Restart</span>
              </button>
              <button
                type="button"
                onClick={() => alert(`Disabling ${activeKiosk.name}...`)}
                className="h-10 sm:h-11 px-2 bg-slate-50 dark:bg-[#14243A] hover:bg-rose-50 dark:hover:bg-rose-950/60 border border-slate-200 dark:border-[#1E314B] rounded-xl text-xs sm:text-[14px] font-semibold text-slate-700 dark:text-[#C3CFDD] hover:text-rose-700 dark:hover:text-rose-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <PowerOff size={14} className="shrink-0" />
                <span>Disable</span>
              </button>
              <button
                type="button"
                onClick={() => alert(`Configuring ${activeKiosk.name}...`)}
                className="h-10 sm:h-11 px-2 bg-slate-50 dark:bg-[#14243A] hover:bg-slate-100 dark:hover:bg-[#1A2E4B] border border-slate-200 dark:border-[#1E314B] rounded-xl text-xs sm:text-[14px] font-semibold text-slate-700 dark:text-[#C3CFDD] flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <Settings size={14} className="shrink-0" />
                <span>Configure</span>
              </button>
            </div>

            {/* 4. Today's Performance */}
            <div className="pt-4 sm:pt-5 border-t border-slate-100 dark:border-[#1E314B]">
              <h4 className="text-sm sm:text-[15px] font-bold text-slate-900 dark:text-[#F1F5F9] mb-3 sm:mb-3.5 tracking-tight">
                Today's Performance
              </h4>
              <div className="grid grid-cols-4 gap-3 sm:gap-3.5 text-center">
                {/* 1. Pages */}
                <div className="py-3.5 px-2.5 sm:py-4 sm:px-3 rounded-2xl bg-slate-50 dark:bg-[#0C1829] border border-slate-200/80 dark:border-[#1E314B] flex flex-col items-center justify-center hover:border-purple-500/40 transition-colors">
                  <Printer size={16} className="text-[#7C3AED] dark:text-[#C084FC] mb-1.5 shrink-0" />
                  <p className="font-bold text-base sm:text-lg text-slate-900 dark:text-[#F1F5F9] leading-tight">
                    {activeKiosk.pagesToday}
                  </p>
                  <span className="text-xs text-slate-400 dark:text-[#8495AA] mt-1 font-medium">Pages</span>
                </div>

                {/* 2. Revenue */}
                <div className="py-3.5 px-2.5 sm:py-4 sm:px-3 rounded-2xl bg-slate-50 dark:bg-[#0C1829] border border-slate-200/80 dark:border-[#1E314B] flex flex-col items-center justify-center hover:border-indigo-500/40 transition-colors">
                  <span className="font-bold text-[#4F46E5] dark:text-[#818CF8] text-sm leading-none mb-1.5">₹</span>
                  <p className="font-bold text-base sm:text-lg text-slate-900 dark:text-[#F1F5F9] leading-tight">
                    ₹{activeKiosk.revenueToday}
                  </p>
                  <span className="text-xs text-slate-400 dark:text-[#8495AA] mt-1 font-medium">Revenue</span>
                </div>

                {/* 3. Active */}
                <div className="py-3.5 px-2.5 sm:py-4 sm:px-3 rounded-2xl bg-slate-50 dark:bg-[#0C1829] border border-slate-200/80 dark:border-[#1E314B] flex flex-col items-center justify-center hover:border-blue-500/40 transition-colors">
                  <Clock size={16} className="text-[#0284C7] dark:text-[#38BDF8] mb-1.5 shrink-0" />
                  <p className="font-bold text-base sm:text-lg text-slate-900 dark:text-[#F1F5F9] leading-tight">
                    {activeKiosk.activeTimeHours}h
                  </p>
                  <span className="text-xs text-slate-400 dark:text-[#8495AA] mt-1 font-medium">Active</span>
                </div>

                {/* 4. Users */}
                <div className="py-3.5 px-2.5 sm:py-4 sm:px-3 rounded-2xl bg-slate-50 dark:bg-[#0C1829] border border-slate-200/80 dark:border-[#1E314B] flex flex-col items-center justify-center hover:border-pink-500/40 transition-colors">
                  <span className="text-sm leading-none mb-1.5">👥</span>
                  <p className="font-bold text-base sm:text-lg text-slate-900 dark:text-[#F1F5F9] leading-tight">
                    {activeKiosk.usersCount}
                  </p>
                  <span className="text-xs text-slate-400 dark:text-[#8495AA] mt-1 font-medium">Users</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Kiosk Locations Map + Recent Events + Performance History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-3.5 lg:gap-4 items-start">
        {/* Map (4 cols) */}
        <div className="lg:col-span-4 mimo-card p-5 sm:p-6 flex flex-col justify-between">
          <div className="mimo-card-header">
            <div>
              <h3 className="text-base sm:text-[18px] font-semibold text-slate-900 dark:text-[#F1F5F9]">Kiosk Locations</h3>
              <p className="text-xs text-slate-500 dark:text-[#8495AA]">Geo distribution of fleet</p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold uppercase bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-[#818CF8]">3 NODES</span>
          </div>

          <div className="mimo-card-body min-h-[220px] w-full rounded-2xl bg-indigo-50/20 dark:bg-[#0C1829] border border-indigo-100/60 dark:border-[#1E314B] relative overflow-hidden p-4">
            <div className="absolute inset-0 bg-[radial-gradient(#CBD5E1_1px,transparent_1px)] dark:bg-[radial-gradient(#1E314B_1px,transparent_1px)] [background-size:20px_20px] opacity-70 dark:opacity-40" />
            
            <div className="absolute top-4 left-6 flex items-center gap-2 p-2.5 rounded-xl bg-white/95 dark:bg-[#14243A]/95 shadow-md border border-slate-200/90 dark:border-[#1E314B] text-xs sm:text-[13px] font-semibold text-slate-900 dark:text-[#F1F5F9] backdrop-blur-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-ping" />
              <div>
                <span className="block leading-tight font-semibold">MIMO 2</span>
                <span className="text-[11px] font-normal text-slate-500 dark:text-[#8495AA]">Central Library</span>
              </div>
            </div>
            
            <div className="absolute top-8 right-6 flex items-center gap-2 p-2.5 rounded-xl bg-white/95 dark:bg-[#14243A]/95 shadow-md border border-slate-200/90 dark:border-[#1E314B] text-xs sm:text-[13px] font-semibold text-slate-900 dark:text-[#F1F5F9] backdrop-blur-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-600 animate-ping" />
              <div>
                <span className="block leading-tight font-semibold">MIMO 3</span>
                <span className="text-[11px] font-normal text-slate-500 dark:text-[#8495AA]">Cafeteria Hub</span>
              </div>
            </div>
            
            <div className="absolute bottom-4 left-12 flex items-center gap-2 p-2.5 rounded-xl bg-white/95 dark:bg-[#14243A]/95 shadow-md border border-slate-200/90 dark:border-[#1E314B] text-xs sm:text-[13px] font-semibold text-slate-900 dark:text-[#F1F5F9] backdrop-blur-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-pink-500 animate-ping" />
              <div>
                <span className="block leading-tight font-semibold">MIMO 1</span>
                <span className="text-[11px] font-normal text-slate-500 dark:text-[#8495AA]">Main Lobby Gate</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Events (4 cols) */}
        <div className="lg:col-span-4 mimo-card p-5 sm:p-6 flex flex-col justify-between">
          <div className="mimo-card-header">
            <h3 className="text-base sm:text-[18px] font-semibold text-slate-900 dark:text-[#F1F5F9]">Recent Kiosk Events</h3>
            <span className="text-xs sm:text-[13px] font-semibold text-indigo-600 dark:text-[#818CF8]">Live stream</span>
          </div>

          <div className="mimo-card-body flex flex-col justify-around gap-2.5 min-h-[220px]">
            {data.events.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/80 dark:bg-[#0C1829] border border-slate-100 dark:border-[#1E314B] hover:bg-slate-100/90 dark:hover:bg-[#14243A] transition-all">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ev.dotColor }} />
                  <span className="font-semibold text-[13px] sm:text-[14px] text-slate-900 dark:text-[#F1F5F9] shrink-0">{ev.kioskName}</span>
                  <span className="text-slate-600 dark:text-[#C3CFDD] truncate text-xs sm:text-[13px]">{ev.eventText}</span>
                </div>
                <span className="text-xs font-mono text-slate-400 dark:text-[#8495AA] shrink-0 ml-2">{ev.timeAgo}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Performance Chart (4 cols) */}
        <div className="lg:col-span-4 mimo-card p-5 sm:p-6 flex flex-col justify-between">
          <div className="mimo-card-header">
            <h3 className="text-base sm:text-[18px] font-semibold text-slate-900 dark:text-[#F1F5F9]">Kiosk Performance</h3>
            <span className="text-xs sm:text-[13px] font-medium text-slate-500 dark:text-[#8495AA]">Last 7 Days</span>
          </div>

          <div className="mimo-card-body min-h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.performanceHistory} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1E314B" opacity={0.4} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#8495AA', fontSize: 11 }} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fill: '#8495AA', fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fill: '#8495AA', fontSize: 11 }} />
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
                <Bar yAxisId="left" dataKey="pagesPrinted" fill="#6366F1" radius={[4, 4, 0, 0]} barSize={14} />
                <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#EC4899" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
