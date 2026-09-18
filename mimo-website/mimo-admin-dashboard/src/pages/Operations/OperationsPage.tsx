import React, { useState, useEffect } from 'react';
import {
  Printer,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  RotateCcw,
} from 'lucide-react';
import { operationsService } from '../../services/operations.service';
import { OperationsPageData } from '../../types/operations.types';
import { OperationStage } from '../../types/dashboard.types';
import { Badge } from '../../components/ui/Badge';
import { MetricCard } from '../../components/ui/MetricCard';

export const OperationsPage: React.FC = () => {
  const [data, setData] = useState<OperationsPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStage, setSelectedStage] = useState<OperationStage | 'All'>('All');
  const [selectedKiosk, setSelectedKiosk] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const res = await operationsService.getOperations({
        searchQuery: searchQuery || undefined,
        stage: selectedStage !== 'All' ? selectedStage : undefined,
        kioskId: selectedKiosk !== 'all' ? selectedKiosk : undefined,
      });
      setData(res);
    } catch (e) {
      console.error('Error fetching operations data', e);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedStage, selectedKiosk]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };

  const jobs = data?.jobs || [];
  const kpis = data?.kpis;

  return (
    <div className="space-y-8 sm:space-y-10 select-none font-sans text-[#F5F7FA]">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="pl-6 sm:pl-8">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[#F5F7FA]">
            Print Operations & Queue
          </h1>
          <p className="text-base sm:text-lg font-medium mt-1.5 text-[#8EA6BF] leading-relaxed">
            Real-time tracking of dispatch pipeline, queue processing, reprint requests and refund decisions.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 bg-[#10223A] border border-[#1D3A59] rounded-xl text-sm font-bold text-[#8EA6BF] hover:text-[#F5F7FA] hover:border-[#20D3A2]/50 transition-all shadow-xs cursor-pointer"
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin text-[#20D3A2]' : 'text-[#8EA6BF]'} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh Jobs'}</span>
          </button>
        </div>
      </div>

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="TOTAL PRINT JOBS"
          value={kpis?.totalJobs ?? 1420}
          subtext="All active records"
          icon={<Printer size={18} className="text-[#20D3A2]" />}
        />
        <MetricCard
          title="IN QUEUE"
          value={kpis?.processing ?? 2}
          subtext="Active print passes"
          icon={<Clock size={18} className="text-blue-400" />}
          isLive={true}
        />
        <MetricCard
          title="COMPLETED"
          value={kpis?.completed ?? 7}
          subtext="98.6% success"
          icon={<CheckCircle2 size={18} className="text-[#20D3A2]" />}
          trendBadge={{ text: '98.6% SLA', positive: true }}
        />
        <MetricCard
          title="ACTION NEEDED"
          value={kpis?.failed ?? 1}
          subtext="Refunds eligible"
          icon={<AlertTriangle size={18} className="text-amber-400" />}
          trendBadge={{ text: '2 Pending', positive: false }}
        />
      </div>

      {/* Filter and Search Bar Card */}
      <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Stage Filter Pills matching Image 1 */}
        <div className="flex items-center gap-2 p-1.5 rounded-xl bg-[#0A1728] border border-[#1D3A59] overflow-x-auto max-w-full">
          {[
            { id: 'All', label: 'All Jobs' },
            { id: 'Processing', label: 'Processing' },
            { id: 'Completed', label: 'Completed' },
            { id: 'Failed', label: 'Failed' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedStage(tab.id as any)}
              className={`min-h-[40px] px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                selectedStage === tab.id
                  ? 'bg-[#20D3A2]/20 text-[#20D3A2] border border-[#20D3A2]/40 shadow-xs'
                  : 'text-[#8EA6BF] hover:text-[#F5F7FA]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input & Kiosk Select */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 md:w-72">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6F89A3]" />
            <input
              type="text"
              placeholder="Search file, user, kiosk..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-h-[44px] pl-10 pr-4 py-2 text-sm rounded-xl bg-[#0A1728] border border-[#1D3A59] text-[#F5F7FA] placeholder-[#6F89A3] focus:outline-none focus:border-[#20D3A2] focus:ring-2 focus:ring-[#20D3A2]/20"
            />
          </form>

          {data?.kiosksList && (
            <select
              value={selectedKiosk}
              onChange={(e) => setSelectedKiosk(e.target.value)}
              aria-label="Filter operations by Kiosk Node"
              className="min-h-[44px] px-4 py-2 text-sm rounded-xl bg-[#0A1728] border border-[#1D3A59] text-[#8EA6BF] focus:outline-none focus:border-[#20D3A2] cursor-pointer font-semibold"
            >
              <option value="all">All Kiosks</option>
              {data.kiosksList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Main Operations List / Table */}
      <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 sm:p-7 shadow-xl space-y-5">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#1D3A59] text-xs uppercase font-black tracking-wider text-[#8EA6BF]">
                <th className="pb-4 pl-3">Job ID</th>
                <th className="pb-4">Document Name</th>
                <th className="pb-4">Kiosk Node</th>
                <th className="pb-4">Files / Pages</th>
                <th className="pb-4">Stage</th>
                <th className="pb-4">Duration</th>
                <th className="pb-4">Status</th>
                <th className="pb-4 pr-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1D3A59] font-medium">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-[#132943]/80 transition-colors">
                  <td className="py-4 pl-3 font-mono font-bold text-[#20D3A2]">
                    {job.jobCode}
                  </td>
                  <td className="py-4 max-w-[240px] truncate font-bold text-[#F5F7FA]">
                    {job.fileName}
                  </td>
                  <td className="py-4 whitespace-nowrap">
                    <span className="font-semibold text-[#F5F7FA]">{job.kioskName}</span>
                    <span className="ml-1.5 font-mono text-xs text-[#8EA6BF]">({job.kioskCode})</span>
                  </td>
                  <td className="py-4 whitespace-nowrap">
                    <span className="font-bold text-[#F5F7FA]">{job.pageCount} pgs</span>
                    <span className="ml-2 px-2 py-0.5 rounded text-xs font-bold bg-[#132943] text-[#8EA6BF] border border-[#1D3A59]">
                      {job.fileCount} file{job.fileCount > 1 ? 's' : ''}
                    </span>
                  </td>
                  <td className="py-4 whitespace-nowrap">
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#132943] text-[#8EA6BF] border border-[#1D3A59]">
                      {job.stage}
                    </span>
                  </td>
                  <td className="py-4 whitespace-nowrap text-[#8EA6BF] text-xs font-semibold">
                    {job.duration} ({job.timestamp || 'Just now'})
                  </td>
                  <td className="py-4 whitespace-nowrap">
                    <Badge status={job.status} />
                  </td>
                  <td className="py-4 pr-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => alert(`Initiating reprint dispatch for Job #${job.jobCode}`)}
                      className="inline-flex items-center gap-1.5 min-h-[36px] px-3.5 py-1.5 rounded-xl border border-[#1D3A59] bg-[#0A1728] text-[#8EA6BF] hover:text-[#F5F7FA] hover:border-[#20D3A2]/50 hover:bg-[#132943] transition-colors cursor-pointer text-xs font-bold shadow-xs"
                    >
                      <RotateCcw size={13} />
                      <span>Reprint</span>
                    </button>
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-[#8EA6BF] font-semibold text-sm">
                    No active operations found matching this criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Stacked Card View matching Image 1 */}
        <div className="md:hidden space-y-3.5">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="p-5 rounded-2xl border border-[#1D3A59] bg-[#0A1728] space-y-3 shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-2.5 rounded-xl bg-[#132943] text-[#8EA6BF] shrink-0 border border-[#1D3A59]">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm text-[#F5F7FA] truncate max-w-[200px]">
                      {job.fileName}
                    </h4>
                    <p className="text-xs text-[#8EA6BF] mt-0.5">
                      {job.kioskName} · {job.pageCount} pages · {job.duration}
                    </p>
                  </div>
                </div>
                <Badge status={job.status} />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[#1D3A59] text-xs">
                <span className="font-mono text-[#20D3A2] font-black text-sm">{job.jobCode}</span>
                <button
                  type="button"
                  onClick={() => alert(`Initiating reprint dispatch for Job #${job.jobCode}`)}
                  className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[#1D3A59] bg-[#132943] text-xs font-bold text-[#F5F7FA] hover:border-[#20D3A2]"
                >
                  <RotateCcw size={13} />
                  <span>Reprint</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
