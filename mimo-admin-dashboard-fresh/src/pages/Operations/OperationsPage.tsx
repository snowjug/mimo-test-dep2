import React, { useEffect, useState } from 'react';
import {
  Printer,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCcw,
  Ban,
  FileText,
} from 'lucide-react';
import { operationsService } from '../../services/operations.service';
import type { OperationsPageData, OperationJobItem } from '../../types/operations.types';
import { MetricCard } from '../../components/cards/MetricCard';
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
  const [activeFilter, setActiveFilter] = useState<'All Jobs' | 'Processing' | 'Completed' | 'Failed'>('All Jobs');
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
          <span className="text-sm font-semibold text-[#8EA6BF]">Loading Print Operations & Queue...</span>
        </div>
      </div>
    );
  }

  // Filter jobs
  const filteredJobs = data.jobs.filter((job) => {
    let matchesFilter = true;
    if (activeFilter === 'Processing') {
      matchesFilter = ['active', 'printing', 'queued', 'warning'].includes(job.status);
    } else if (activeFilter === 'Completed') {
      matchesFilter = job.status === 'completed';
    } else if (activeFilter === 'Failed') {
      matchesFilter = job.status === 'failed';
    }

    const matchesSearch =
      !effectiveSearch ||
      job.jobCode.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      job.fileName.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      job.userEmail.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      job.kioskName.toLowerCase().includes(effectiveSearch.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const getStatusBadge = (status: OperationJobItem['status']) => {
    switch (status) {
      case 'active':
        return <Badge variant="active" size="sm">ACTIVE</Badge>;
      case 'printing':
        return <Badge variant="printing" size="sm">PRINTING</Badge>;
      case 'warning':
        return <Badge variant="warning" size="sm">WARNING</Badge>;
      case 'queued':
        return <Badge variant="queued" size="sm">QUEUED</Badge>;
      case 'completed':
        return <Badge variant="completed" size="sm">COMPLETED</Badge>;
      case 'failed':
        return <Badge variant="critical" size="sm">FAILED</Badge>;
      default:
        return <Badge variant="default" size="sm">{status}</Badge>;
    }
  };

  const filterTabs: Array<'All Jobs' | 'Processing' | 'Completed' | 'Failed'> = [
    'All Jobs',
    'Processing',
    'Completed',
    'Failed',
  ];

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-200 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div className="pl-6 sm:pl-8">
          <h1 className="text-2xl sm:text-3xl font-black text-[#F5F7FA] tracking-tight">
            Print Operations & Queue
          </h1>
          <p className="text-xs sm:text-sm text-[#8EA6BF] font-medium mt-1">
            Real-time tracking of dispatch pipeline, queue processing, reprint requests and refund decisions.
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
            <span>{refreshing ? 'Refreshing...' : 'Refresh Jobs'}</span>
          </button>
        </div>
      </div>

      {/* Row 1: 4 Top KPI Cards (2x2 Grid on Mobile, 4 Cols on Desktop — Screenshot 1) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {/* Card 1: TOTAL PRINT JOBS */}
        <MetricCard
          title="TOTAL PRINT JOBS"
          value="1420"
          subtitle="All active records"
          icon={<Printer size={15} className="text-[#8EA6BF]" />}
        />

        {/* Card 2: IN QUEUE */}
        <MetricCard
          title="IN QUEUE"
          value="2"
          subtitle="Active print passes"
          icon={<Clock size={15} className="text-[#20D3A2]" />}
          iconBg="bg-[#20D3A2]/15 text-[#20D3A2]"
          highlightColor="emerald"
        />

        {/* Card 3: COMPLETED */}
        <MetricCard
          title="COMPLETED"
          value="7"
          subtitle="98.6% success"
          icon={<CheckCircle2 size={15} className="text-[#20D3A2]" />}
          iconBg="bg-[#20D3A2]/15 text-[#20D3A2]"
        />

        {/* Card 4: ACTION NEEDED */}
        <MetricCard
          title="ACTION NEEDED"
          value="1"
          subtitle="Refunds eligible"
          topBadge={
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/30">
              2 Pending
            </span>
          }
          icon={<AlertTriangle size={15} className="text-amber-400" />}
          iconBg="bg-amber-500/15 text-amber-400"
        />
      </div>

      {/* Row 2: Segmented Filter Tabs + Search Bar (Screenshot 1) */}
      <div className="space-y-3">
        {/* Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {filterTabs.map((tab) => {
            const isActive = activeFilter === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveFilter(tab)}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-[#20D3A2]/20 border border-[#20D3A2]/50 text-[#20D3A2] shadow-sm shadow-[#20D3A2]/20'
                    : 'bg-[#10223A] border border-[#1D3A59] text-[#8EA6BF] hover:text-[#F5F7FA] hover:bg-[#132943]'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6F89A3]" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search file, user, kiosk..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#07111F] border border-[#1D3A59] rounded-xl text-xs sm:text-sm text-[#F5F7FA] placeholder-[#6F89A3] focus:outline-none focus:border-[#20D3A2] focus:ring-1 focus:ring-[#20D3A2]/30 transition-all shadow-inner"
          />
        </div>
      </div>

      {/* Row 3: Jobs Queue Feed / Table */}
      <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] overflow-hidden shadow-xl">
        <div className="p-4 sm:p-5 border-b border-[#1D3A59] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-bold text-[#F5F7FA]">Dispatch Pipeline</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#20D3A2]/15 text-[#20D3A2] border border-[#20D3A2]/30">
              {filteredJobs.length} records
            </span>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#07111F]/70 text-[#8EA6BF] text-[11px] font-bold uppercase tracking-wider border-b border-[#1D3A59]">
              <tr>
                <th className="py-3 px-4">Job Code</th>
                <th className="py-3 px-4">Document</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Kiosk</th>
                <th className="py-3 px-4">Pages</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Cost</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1D3A59]/60">
              {filteredJobs.map((job) => (
                <tr key={job.id} className="hover:bg-[#132943]/40 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-[#20D3A2]">
                    {job.jobCode}
                  </td>
                  <td className="py-3 px-4 font-bold text-[#F5F7FA] max-w-[200px] truncate">
                    <div className="flex items-center gap-2">
                      <FileText size={15} className="text-sky-400 shrink-0" />
                      <span className="truncate">{job.fileName}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-[#8EA6BF]">{job.userEmail}</td>
                  <td className="py-3 px-4 text-[#CAD7E6]">
                    <span className="font-semibold">{job.kioskName}</span>
                    <span className="text-[10px] text-[#6F89A3] block font-mono">{job.kioskCode}</span>
                  </td>
                  <td className="py-3 px-4 text-[#F5F7FA] font-bold">{job.pageCount} pgs</td>
                  <td className="py-3 px-4">{getStatusBadge(job.status)}</td>
                  <td className="py-3 px-4 font-bold text-[#20D3A2]">₹{job.cost.toFixed(2)}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => alert(`Reprint initiated for job ${job.jobCode}`)}
                        className="px-2.5 py-1 rounded-lg bg-[#07111F] hover:bg-[#20D3A2]/20 border border-[#1D3A59] hover:border-[#20D3A2]/40 text-[11px] font-bold text-[#20D3A2] transition-all cursor-pointer"
                      >
                        <RotateCcw size={12} className="inline mr-1" />
                        Reprint
                      </button>
                      <button
                        type="button"
                        onClick={() => alert(`Cancelled job ${job.jobCode}`)}
                        className="px-2 py-1 rounded-lg bg-[#07111F] hover:bg-rose-500/20 border border-[#1D3A59] hover:border-rose-500/40 text-[11px] font-bold text-rose-400 transition-all cursor-pointer"
                      >
                        <Ban size={12} className="inline mr-1" />
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Stacked Cards */}
        <div className="md:hidden divide-y divide-[#1D3A59]/60">
          {filteredJobs.map((job) => (
            <div key={job.id} className="p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#20D3A2]">{job.jobCode}</span>
                  <span className="text-xs text-[#8EA6BF]">• {job.duration}</span>
                </div>
                {getStatusBadge(job.status)}
              </div>

              <div className="font-bold text-sm text-[#F5F7FA] truncate">
                {job.fileName}
              </div>

              <div className="flex items-center justify-between text-xs text-[#8EA6BF]">
                <span>{job.kioskName} ({job.pageCount} pgs)</span>
                <span className="font-bold text-[#20D3A2]">₹{job.cost.toFixed(2)}</span>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => alert(`Reprint initiated for job ${job.jobCode}`)}
                  className="flex-1 py-1.5 rounded-lg bg-[#07111F] border border-[#1D3A59] text-xs font-bold text-[#20D3A2]"
                >
                  Reprint
                </button>
                <button
                  type="button"
                  onClick={() => alert(`Cancelled job ${job.jobCode}`)}
                  className="flex-1 py-1.5 rounded-lg bg-[#07111F] border border-[#1D3A59] text-xs font-bold text-rose-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
