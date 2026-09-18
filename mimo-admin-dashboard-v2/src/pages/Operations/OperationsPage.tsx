import React, { useEffect, useState } from 'react';
import {
  Printer,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertOctagon,
  FileText,
  HardDrive,
} from 'lucide-react';
import { operationsService } from '../../services/operations.service';
import type { OperationsPageData, OperationJobItem } from '../../types/operations.types';
import { MetricCard } from '../../components/ui/MetricCard';
import { Badge } from '../../components/ui/Badge';

interface OperationsPageProps {
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export const OperationsPage: React.FC<OperationsPageProps> = ({
  searchQuery = '',
  onSearchChange,
}) => {
  const [data, setData] = useState<OperationsPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stageFilter, setStageFilter] = useState<'All' | 'Printing' | 'Completed' | 'Failed'>('All');
  const [kioskFilter, setKioskFilter] = useState<string>('All');
  const [localSearch, setLocalSearch] = useState(searchQuery);

  const loadData = async () => {
    try {
      const res = await operationsService.getOperations();
      setData(res);
    } catch (err) {
      console.error('Failed to load operations data', err);
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
          <span className="text-sm font-semibold text-[#8EA6BF]">Loading Live Operations Queue...</span>
        </div>
      </div>
    );
  }

  // Filter jobs based on stage, kiosk, and search query
  const filteredJobs = data.jobs.filter((job) => {
    const matchesStage = stageFilter === 'All' || job.stage.toLowerCase() === stageFilter.toLowerCase();
    const matchesKiosk = kioskFilter === 'All' || job.kioskCode === kioskFilter;
    const matchesSearch =
      !effectiveSearch ||
      job.jobCode.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      job.fileName.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      job.userEmail.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      job.kioskName.toLowerCase().includes(effectiveSearch.toLowerCase());

    return matchesStage && matchesKiosk && matchesSearch;
  });

  const getStatusBadge = (status: OperationJobItem['status']) => {
    switch (status) {
      case 'printing':
      case 'active':
        return <Badge variant="printing" size="sm">PRINTING</Badge>;
      case 'completed':
        return <Badge variant="completed" size="sm">COMPLETED</Badge>;
      case 'failed':
        return <Badge variant="failed" size="sm">FAILED</Badge>;
      default:
        return <Badge variant="default" size="sm">{status.toUpperCase()}</Badge>;
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black text-[#F5F7FA] tracking-tight">
              Operations & Print Queue
            </h1>
            <Badge variant="active" size="sm">
              LIVE QUEUE
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-[#8EA6BF] font-medium mt-1">
            Monitor real-time document rasterization, spooling, and hardware execution across the campus fleet.
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
            <span>{refreshing ? 'Syncing...' : 'Refresh Queue'}</span>
          </button>
        </div>
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
        <MetricCard
          title="Total Processed"
          value={data.kpis.totalJobs.toLocaleString()}
          subtext="Jobs logged today"
          icon={<FileText size={20} />}
        />
        <MetricCard
          title="In Progress / Printing"
          value={data.kpis.processing.toString()}
          subtext="Active hardware spooling"
          icon={<Printer size={20} />}
          trendText="Active"
          trendPositive={true}
        />
        <MetricCard
          title="Completed Successfully"
          value={data.kpis.completed.toLocaleString()}
          subtext="Fulfilled without error"
          icon={<CheckCircle2 size={20} />}
          trendText="99.4%"
          trendPositive={true}
        />
        <MetricCard
          title="Failed / Needs Attention"
          value={data.kpis.failed.toString()}
          subtext="Raster or timeout errors"
          icon={<AlertOctagon size={20} />}
          trendText="Investigating"
          trendPositive={false}
        />
      </div>

      {/* Row 2: Filter Toolbar */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        {/* Stage Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {(['All', 'Printing', 'Completed', 'Failed'] as const).map((stage) => (
            <button
              key={stage}
              type="button"
              onClick={() => setStageFilter(stage)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                stageFilter === stage
                  ? 'bg-[#20D3A2] text-[#07111F] shadow-md shadow-[#20D3A2]/20 font-black'
                  : 'bg-[#07111F]/70 text-[#8EA6BF] hover:text-[#F5F7FA] hover:bg-[#132943] border border-[#1D3A59]'
              }`}
            >
              {stage}
            </button>
          ))}
        </div>

        {/* Search & Kiosk Dropdown */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Kiosk Filter Dropdown */}
          <div className="flex items-center gap-2 bg-[#07111F]/70 border border-[#1D3A59] rounded-xl px-3 py-2">
            <HardDrive size={15} className="text-[#8EA6BF] shrink-0" />
            <select
              value={kioskFilter}
              onChange={(e) => setKioskFilter(e.target.value)}
              aria-label="Filter by kiosk"
              className="bg-transparent text-xs font-semibold text-[#F5F7FA] outline-hidden cursor-pointer w-full"
            >
              <option value="All" className="bg-[#0A1728] text-[#F5F7FA]">
                All Kiosks ({data.kiosksList.length})
              </option>
              {data.kiosksList.map((k) => (
                <option key={k.code} value={k.code} className="bg-[#0A1728] text-[#F5F7FA]">
                  {k.code} - {k.name}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Search */}
          <div className="relative min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8EA6BF]" />
            <input
              type="text"
              placeholder="Search job, file, user..."
              value={effectiveSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#07111F]/70 border border-[#1D3A59] rounded-xl text-xs text-[#F5F7FA] placeholder-[#6F89A3] focus:border-[#20D3A2] focus:outline-hidden transition-all"
            />
          </div>
        </div>
      </div>

      {/* Row 3: Desktop Table & Mobile Stacked Cards */}
      <div className="rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg overflow-hidden">
        {/* Table Title Bar */}
        <div className="p-4 sm:p-5 border-b border-[#1D3A59] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-bold text-[#F5F7FA]">Live Print Queue Items</h3>
            <span className="text-xs font-semibold text-[#8EA6BF]">
              ({filteredJobs.length} {filteredJobs.length === 1 ? 'job' : 'jobs'} found)
            </span>
          </div>
        </div>

        {filteredJobs.length === 0 ? (
          <div className="p-12 text-center">
            <Printer size={36} className="mx-auto text-[#6F89A3] opacity-50 mb-3" />
            <p className="text-sm font-bold text-[#F5F7FA]">No print jobs matched your filters</p>
            <p className="text-xs text-[#8EA6BF] mt-1">Try resetting the stage or search query.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1D3A59] bg-[#07111F]/40 text-[11px] font-black uppercase text-[#6F89A3] tracking-wider">
                    <th className="py-3.5 px-5">Job ID</th>
                    <th className="py-3.5 px-5">Document</th>
                    <th className="py-3.5 px-5">Target Kiosk</th>
                    <th className="py-3.5 px-5">User</th>
                    <th className="py-3.5 px-5 text-center">Pages</th>
                    <th className="py-3.5 px-5 text-right">Cost</th>
                    <th className="py-3.5 px-5 text-center">Status</th>
                    <th className="py-3.5 px-5 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1D3A59]/60 text-xs">
                  {filteredJobs.map((job) => (
                    <tr
                      key={job.id}
                      className="hover:bg-[#132943]/40 transition-colors group text-[#CAD7E6]"
                    >
                      <td className="py-4 px-5 font-mono font-bold text-[#20D3A2]">
                        {job.jobCode}
                      </td>
                      <td className="py-4 px-5 font-medium text-[#F5F7FA] max-w-[280px]">
                        <div className="flex items-center gap-2 truncate">
                          <FileText size={15} className="text-[#8EA6BF] shrink-0" />
                          <span className="truncate">{job.fileName}</span>
                        </div>
                      </td>
                      <td className="py-4 px-5">
                        <span className="font-semibold text-[#F5F7FA]">{job.kioskName}</span>
                      </td>
                      <td className="py-4 px-5 text-[#8EA6BF] truncate max-w-[180px]">
                        {job.userEmail}
                      </td>
                      <td className="py-4 px-5 text-center font-bold text-[#F5F7FA]">
                        {job.pageCount}
                      </td>
                      <td className="py-4 px-5 text-right font-bold text-[#F5F7FA]">
                        ₹{job.cost.toFixed(2)}
                      </td>
                      <td className="py-4 px-5 text-center">
                        {getStatusBadge(job.status)}
                      </td>
                      <td className="py-4 px-5 text-right text-[11px] text-[#8EA6BF]">
                        {job.duration}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Card View */}
            <div className="md:hidden divide-y divide-[#1D3A59]/60">
              {filteredJobs.map((job) => (
                <div key={job.id} className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-[#20D3A2]">
                        {job.jobCode}
                      </span>
                      {getStatusBadge(job.status)}
                    </div>
                    <span className="text-[11px] text-[#8EA6BF]">{job.duration}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <FileText size={15} className="text-[#8EA6BF] shrink-0" />
                    <p className="text-xs font-bold text-[#F5F7FA] truncate">{job.fileName}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-[#8EA6BF] pt-1">
                    <div>
                      <span className="text-[#6F89A3]">Kiosk: </span>
                      <span className="text-[#F5F7FA] font-medium">{job.kioskCode}</span>
                    </div>
                    <div>
                      <span className="text-[#6F89A3]">User: </span>
                      <span className="text-[#F5F7FA] font-medium truncate">{job.userEmail.split('@')[0]}</span>
                    </div>
                    <div>
                      <span className="text-[#6F89A3]">Pages: </span>
                      <span className="text-[#F5F7FA] font-bold">{job.pageCount}</span>
                    </div>
                    <div>
                      <span className="text-[#6F89A3]">Total: </span>
                      <span className="text-[#20D3A2] font-bold">₹{job.cost.toFixed(2)}</span>
                    </div>
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
