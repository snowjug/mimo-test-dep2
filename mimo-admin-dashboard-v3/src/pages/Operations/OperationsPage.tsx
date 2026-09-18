import React, { useState } from 'react';
import {
  Printer,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCcw,
  Filter,
  FileText,
  MoreHorizontal,
} from 'lucide-react';
import { useOperations } from '../../hooks/useOperations';
import { MetricCard } from '../../components/cards/MetricCard';
import { Badge, type BadgeVariant } from '../../components/ui/Badge';
import { LoadingSkeleton } from '../../components/ui/LoadingSkeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { SearchInput } from '../../components/ui/SearchInput';
import type { OperationStatus } from '../../types/operation';

export interface OperationsPageProps {
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export const OperationsPage: React.FC<OperationsPageProps> = ({
  searchQuery = '',
}) => {
  const { data, loading, refreshing, error, refresh, retryOperation } = useOperations();
  const [filterTab, setFilterTab] = useState<'all' | 'processing' | 'completed' | 'failed'>('all');
  const [localSearch, setLocalSearch] = useState(searchQuery);

  if (loading) return <LoadingSkeleton rows={5} />;
  if (error || !data) {
    return (
      <EmptyState
        title="Failed to Load Operations Queue"
        description={error || 'An error occurred while communicating with the spooler service.'}
        actionText="Retry"
        onAction={refresh}
      />
    );
  }

  const filteredOperations = data.operations.filter((op) => {
    const matchesFilter =
      filterTab === 'all' ||
      (filterTab === 'processing' && (op.stage === 'Processing' || op.stage === 'Printing' || op.stage === 'Merge' || op.stage === 'Queued')) ||
      (filterTab === 'completed' && op.stage === 'Completed') ||
      (filterTab === 'failed' && op.stage === 'Failed');

    const effectiveQuery = searchQuery || localSearch;
    const matchesSearch =
      !effectiveQuery ||
      op.documentName.toLowerCase().includes(effectiveQuery.toLowerCase()) ||
      op.jobCode.toLowerCase().includes(effectiveQuery.toLowerCase()) ||
      op.kioskName.toLowerCase().includes(effectiveQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const getStatusBadgeVariant = (st: OperationStatus): BadgeVariant => {
    switch (st) {
      case 'active':
        return 'active';
      case 'printing':
        return 'printing';
      case 'completed':
        return 'completed';
      case 'warning':
        return 'warning';
      case 'failed':
        return 'critical';
      default:
        return 'queued';
    }
  };

  return (
    <div className="flex flex-col gap-5 sm:gap-6 px-1 sm:px-2 lg:px-3 animate-in fade-in duration-200 font-sans">
      {/* 1. Page Header with responsive left padding */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-0.5 pl-2 sm:pl-8 pr-1 sm:pr-2">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-[32px] lg:text-[34px] font-bold text-slate-900 dark:text-[#F8FAFC] tracking-tight leading-tight">
            Print Operations & Queue
          </h1>
          <p className="text-xs sm:text-[15px] lg:text-[16px] text-slate-500 dark:text-[#94A3B8] font-normal leading-relaxed">
            Real-time tracking of dispatch pipeline, queue processing, reprint requests and refund decisions.
          </p>
        </div>

        <div className="shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 sm:px-4 h-9 sm:h-11 bg-white dark:bg-[#111C30] hover:bg-slate-50 dark:hover:bg-[#1A2844] border border-slate-200 dark:border-[#1E293B] text-slate-700 dark:text-[#F1F5F9] rounded-xl text-xs sm:text-[14px] font-medium transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-indigo-600 dark:text-[#818CF8]' : 'text-indigo-500 dark:text-[#818CF8]'} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Jobs'}</span>
          </button>
        </div>
      </div>

      {/* 2. 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5 lg:gap-4 items-start">
        <MetricCard
          title="TOTAL PRINT JOBS"
          value={data.kpis.totalJobs.toLocaleString()}
          subtitle="All active records"
          icon={<Printer size={16} />}
          iconBg="bg-[#F3E8FF] text-[#9333EA] dark:bg-[#9333EA]/20 dark:text-[#C084FC]"
        />
        <MetricCard
          title="IN QUEUE"
          value={data.kpis.inQueue}
          subtitle="Active print passes"
          icon={<Clock size={16} />}
          iconBg="bg-[#E0F2FE] text-[#0284C7] dark:bg-[#0284C7]/20 dark:text-[#38BDF8]"
        />
        <MetricCard
          title="COMPLETED"
          value={data.kpis.completed}
          subtitle="98.6% success"
          icon={<CheckCircle2 size={16} />}
          iconBg="bg-[#EEF2FF] text-[#4F46E5] dark:bg-indigo-950/60 dark:text-[#A5B4FC]"
        />
        <MetricCard
          title="ACTION NEEDED"
          value={data.kpis.actionNeeded}
          badgeText={`${data.kpis.pendingRefunds} Pending`}
          badgeVariant="neutral"
          subtitle="Refunds eligible"
          icon={<AlertTriangle size={16} />}
          iconBg="bg-[#FCE7F3] text-[#E11D48] dark:bg-[#E11D48]/20 dark:text-[#FB7185]"
        />
      </div>

      {/* 3. Filter/Search Section: Structured with CLEAR 16-24px vertical gap between Tabs and Search Bar */}
      <div className="mimo-card !h-auto shrink-0 p-5 sm:p-6 flex flex-col gap-5 sm:gap-6">
        {/* Row 1: Filter Tabs (8-12px gap between tabs, font-size 14-15px, font-weight 600) */}
        <div className="flex items-center gap-2 sm:gap-2.5 overflow-x-auto pb-0.5 scrollbar-none">
          {(['all', 'processing', 'completed', 'failed'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilterTab(tab)}
              className={`h-9 sm:h-10 px-4 sm:px-4.5 rounded-xl text-xs sm:text-[14px] font-semibold transition-all cursor-pointer shrink-0 ${
                filterTab === tab
                  ? 'bg-[#6366F1] text-white shadow-xs dark:bg-[#6366F1] dark:text-white'
                  : 'bg-slate-100 dark:bg-[#0C1829] text-slate-600 dark:text-[#C3CFDD] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-[#14243A] border border-transparent dark:border-[#1E314B]'
              }`}
            >
              {tab === 'all'
                ? 'All Jobs'
                : tab === 'processing'
                ? 'Processing'
                : tab === 'completed'
                ? 'Completed'
                : 'Failed'}
            </button>
          ))}
        </div>

        {/* Row 2: Search Bar + Filter Button with explicit 16-24px vertical separation */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 sm:pt-5 border-t border-slate-100/80 dark:border-[#1E314B]/60">
          {/* Left Search Input (Compact height: 44-48px, font-size 14-15px) */}
          <div className="w-full sm:w-[380px] md:w-[420px]">
            <SearchInput
              placeholder="Search document, job ID, kiosk..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              iconSize={16}
              inputSize="sm"
              className="!h-10 sm:!h-11 text-xs sm:text-[14px]"
            />
          </div>

          {/* Right Action / Filter Controls */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              className="flex items-center gap-2 px-4 h-10 sm:h-11 bg-slate-50 dark:bg-[#14243A] hover:bg-slate-100 dark:hover:bg-[#1A2E4B] border border-slate-200 dark:border-[#1E314B] text-slate-800 dark:text-[#F8FAFC] rounded-xl text-xs sm:text-[14px] font-semibold transition-all shadow-xs cursor-pointer"
            >
              <Filter size={15} className="text-indigo-600 dark:text-[#818CF8]" />
              <span>Filter</span>
            </button>
            {(localSearch || filterTab !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setLocalSearch('');
                  setFilterTab('all');
                }}
                className="px-3 h-10 sm:h-11 text-xs sm:text-[13px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Main Operations Table Card (Desktop) */}
      <div className="hidden md:block mimo-card p-5 sm:p-6 lg:p-7 overflow-hidden !h-auto">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[780px]">
            <thead>
              <tr className="border-b border-slate-100 dark:border-[#1E314B] text-[13px] sm:text-[14px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#8495AA]">
                <th className="pb-3.5 pt-1 font-semibold min-w-[110px]">Job Code</th>
                <th className="pb-3.5 pt-1 font-semibold min-w-[200px]">Document</th>
                <th className="pb-3.5 pt-1 font-semibold min-w-[150px]">Kiosk</th>
                <th className="pb-3.5 pt-1 font-semibold min-w-[70px]">Pages</th>
                <th className="pb-3.5 pt-1 font-semibold min-w-[100px]">Stage</th>
                <th className="pb-3.5 pt-1 font-semibold min-w-[90px]">Duration</th>
                <th className="pb-3.5 pt-1 font-semibold min-w-[120px]">Submitted</th>
                <th className="pb-3.5 pt-1 font-semibold min-w-[100px]">Status</th>
                <th className="pb-3.5 pt-1 font-semibold text-right min-w-[90px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#1E314B]">
              {filteredOperations.map((op) => {
                const isDuplex = op.pages > 1;
                return (
                  <tr key={op.id} className="hover:bg-slate-50/80 dark:hover:bg-[#14243A]/60 transition-colors h-[48px] sm:h-[52px]">
                    <td className="py-3">
                      <div className="flex items-center gap-2 font-mono font-semibold text-[13px] sm:text-[14px] text-slate-900 dark:text-[#F8FAFC]">
                        <div className="w-6 h-6 rounded-lg bg-[#F3E8FF] dark:bg-[#9333EA]/20 text-[#7C3AED] dark:text-[#C084FC] flex items-center justify-center shrink-0">
                          <FileText size={13} />
                        </div>
                        <span>{op.jobCode}</span>
                      </div>
                    </td>
                    <td className="py-3 font-semibold text-[14px] sm:text-[15px] text-slate-900 dark:text-[#F8FAFC] max-w-[240px] truncate">
                      {op.documentName}
                    </td>
                    <td className="py-3 text-[14px] sm:text-[15px] font-medium text-slate-700 dark:text-[#CBD5E1]">
                      {op.kioskName}
                    </td>
                    <td className="py-3">
                      {isDuplex ? (
                        <div className="w-6 h-6 rounded-full border border-[#3B82F6] text-[#2563EB] dark:border-[#60A5FA] dark:text-[#93C5FD] font-semibold text-xs flex items-center justify-center select-none">
                          {op.pages}
                        </div>
                      ) : (
                        <span className="font-semibold text-[14px] sm:text-[15px] text-slate-900 dark:text-[#F8FAFC] pl-1.5">
                          {op.pages}
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-[14px] sm:text-[15px] font-medium text-slate-600 dark:text-[#94A3B8]">
                      {op.stage}
                    </td>
                    <td className="py-3 font-mono text-xs sm:text-[13px] text-slate-500 dark:text-[#94A3B8]">
                      {op.durationSeconds}s
                    </td>
                    <td className="py-3 text-xs sm:text-[13px] text-slate-500 dark:text-[#94A3B8]">
                      {op.submittedAt}
                    </td>
                    <td className="py-3">
                      <Badge variant={getStatusBadgeVariant(op.status)} size="sm" className="text-xs sm:text-[12px] font-semibold">
                        {op.status}
                      </Badge>
                    </td>
                    <td className="py-3 text-right">
                      {op.stage === 'Failed' ? (
                        <button
                          type="button"
                          onClick={() => retryOperation(op.id)}
                          className="inline-flex items-center gap-1.5 px-3 h-8 sm:h-8.5 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800/80 text-amber-800 dark:text-amber-300 rounded-lg text-xs sm:text-[13px] font-semibold transition-all cursor-pointer shadow-xs"
                        >
                          <RotateCcw size={13} />
                          <span>Reprint</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="p-1 text-slate-400 dark:text-[#8495AA] hover:text-slate-700 dark:hover:text-[#F8FAFC] rounded-lg transition-colors cursor-pointer"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card Layout (< 768px) */}
      <div className="md:hidden space-y-3.5">
        {filteredOperations.map((op) => (
          <div key={op.id} className="mimo-card p-4 sm:p-5 space-y-3 !h-auto">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs sm:text-sm font-semibold text-slate-500 dark:text-[#94A3B8]">{op.jobCode}</span>
              <Badge variant={getStatusBadgeVariant(op.status)} size="sm" className="text-xs font-semibold">
                {op.status}
              </Badge>
            </div>

            <div>
              <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-[#F8FAFC] leading-snug">{op.documentName}</h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-[#94A3B8] mt-0.5">{op.kioskName} • {op.pages} pages</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm pt-2 border-t border-slate-100 dark:border-[#1E314B]">
              <div>
                <span className="text-slate-400 dark:text-[#8495AA] block text-[11px] uppercase font-semibold">Stage</span>
                <span className="font-medium text-slate-700 dark:text-[#CBD5E1]">{op.stage}</span>
              </div>
              <div>
                <span className="text-slate-400 dark:text-[#8495AA] block text-[11px] uppercase font-semibold">Duration</span>
                <span className="font-medium text-slate-700 dark:text-[#CBD5E1]">{op.durationSeconds}s</span>
              </div>
            </div>

            {op.stage === 'Failed' && (
              <div className="pt-1.5">
                <button
                  type="button"
                  onClick={() => retryOperation(op.id)}
                  className="w-full flex items-center justify-center gap-1.5 h-10 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/80 text-amber-800 dark:text-amber-300 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  <RotateCcw size={14} />
                  <span>Reprint Dispatch</span>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
