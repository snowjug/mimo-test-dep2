import React, { useState } from 'react';
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
import { useTheme } from '../../context/ThemeContext';

interface PrintJob {
  id: string;
  fileName: string;
  user: string;
  kiosk: string;
  kioskCode: string;
  pageCount: number;
  type: 'B&W' | 'Color';
  amount: number;
  stage: 'Queued' | 'Merging' | 'Printing' | 'Completed' | 'Failed';
  status: 'ACTIVE' | 'PRINTING' | 'DONE' | 'FAILED' | 'WARNING';
  timestamp: string;
  duration: string;
}

const INITIAL_JOBS: PrintJob[] = [
  {
    id: 'JB-9041',
    fileName: 'Application_Form_Final.pdf',
    user: 'rahul.s@campus.edu',
    kiosk: 'MIMO 1 (Main Library)',
    kioskCode: 'CV-001',
    pageCount: 7,
    type: 'B&W',
    amount: 16.10,
    stage: 'Printing',
    status: 'PRINTING',
    timestamp: 'Just now',
    duration: '12s',
  },
  {
    id: 'JB-9040',
    fileName: 'Hall_Ticket_Exam_2026.pdf',
    user: 'priya.k@campus.edu',
    kiosk: 'MIMO 2 (Admin Block)',
    kioskCode: 'SV-002',
    pageCount: 2,
    type: 'Color',
    amount: 20.00,
    stage: 'Merging',
    status: 'ACTIVE',
    timestamp: '1m ago',
    duration: '4s',
  },
  {
    id: 'JB-9039',
    fileName: 'Project_Assignment_Draft.pdf',
    user: 'arjun.v@campus.edu',
    kiosk: 'MIMO 2 (Admin Block)',
    kioskCode: 'SV-002',
    pageCount: 14,
    type: 'B&W',
    amount: 32.20,
    stage: 'Queued',
    status: 'WARNING',
    timestamp: '3m ago',
    duration: '45s',
  },
  {
    id: 'JB-9038',
    fileName: 'Campus_ID_Card.pdf',
    user: 'sneha.m@campus.edu',
    kiosk: 'MIMO 1 (Main Library)',
    kioskCode: 'CV-001',
    pageCount: 1,
    type: 'Color',
    amount: 10.00,
    stage: 'Completed',
    status: 'DONE',
    timestamp: '6m ago',
    duration: '8s',
  },
  {
    id: 'JB-9037',
    fileName: 'Lecture_Notes_Module4.pdf',
    user: 'vikram.r@campus.edu',
    kiosk: 'MIMO 3 (Cafeteria)',
    kioskCode: 'SV-003',
    pageCount: 22,
    type: 'B&W',
    amount: 50.60,
    stage: 'Completed',
    status: 'DONE',
    timestamp: '14m ago',
    duration: '26s',
  },
  {
    id: 'JB-9036',
    fileName: 'Research_Paper_IEEE.pdf',
    user: 'ananya.d@campus.edu',
    kiosk: 'MIMO 4 (Hostel Block)',
    kioskCode: 'SV-004',
    pageCount: 8,
    type: 'B&W',
    amount: 18.40,
    stage: 'Failed',
    status: 'FAILED',
    timestamp: '22m ago',
    duration: '1m 10s',
  },
];

export const OperationsPage: React.FC = () => {
  const { isDark } = useTheme();
  const [jobs, setJobs] = useState<PrintJob[]>(INITIAL_JOBS);
  const [filterTab, setFilterTab] = useState<'all' | 'processing' | 'completed' | 'failed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  const handleReprint = (jobId: string) => {
    alert(`Initiating reprint dispatch for Job #${jobId}`);
  };

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      job.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.kiosk.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.id.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterTab === 'processing') return job.status === 'ACTIVE' || job.status === 'PRINTING' || job.status === 'WARNING';
    if (filterTab === 'completed') return job.status === 'DONE';
    if (filterTab === 'failed') return job.status === 'FAILED';
    return true;
  });

  const totalJobs = jobs.length;
  const inQueueCount = jobs.filter((j) => j.status === 'ACTIVE' || j.status === 'PRINTING').length;
  const completedCount = jobs.filter((j) => j.status === 'DONE').length;
  const actionNeededCount = jobs.filter((j) => j.status === 'FAILED' || j.status === 'WARNING').length;

  return (
    <div className="w-full space-y-6 pb-12 select-none font-sans">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className={`text-2xl sm:text-3xl font-black tracking-tight ${
            isDark ? 'text-white' : 'text-[#1e1b4b]'
          }`}>
            Print Operations & Queue
          </h1>
          <p className={`text-xs sm:text-sm font-medium mt-0.5 ${
            isDark ? 'text-slate-400' : 'text-gray-500'
          }`}>
            Real-time tracking of dispatch pipeline, queue processing, and reprint logs
          </p>
        </div>

        <button
          onClick={handleRefresh}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer self-start sm:self-auto border ${
            isDark
              ? 'bg-slate-800 border-slate-700 text-[#a78bfa] hover:bg-slate-700'
              : 'bg-white border-[#ede9fe] text-[#7c3aed] hover:bg-purple-50'
          }`}
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          Refresh Jobs
        </button>
      </div>

      {/* Summary KPI Row (4 equal cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className={`border rounded-2xl p-5 shadow-sm ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              TOTAL PRINT JOBS
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-500/15 text-[#a78bfa] flex items-center justify-center">
              <FileText size={15} />
            </div>
          </div>
          <div className="mt-3">
            <div className={`text-3xl font-black ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>{totalJobs}</div>
            <p className="text-xs text-gray-400 mt-0.5">All sessions today</p>
          </div>
        </div>

        {/* Card 2 */}
        <div className={`border rounded-2xl p-5 shadow-sm ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              IN DISPATCH QUEUE
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center">
              <Clock size={15} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-blue-500">{inQueueCount}</div>
            <p className="text-xs text-gray-400 mt-0.5">Active pipeline processing</p>
          </div>
        </div>

        {/* Card 3 */}
        <div className={`border rounded-2xl p-5 shadow-sm ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              SUCCESSFUL PRINTS
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 size={15} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-emerald-500">{completedCount}</div>
            <p className="text-xs text-gray-400 mt-0.5">Dispatched without error</p>
          </div>
        </div>

        {/* Card 4 */}
        <div className={`border rounded-2xl p-5 shadow-sm ${
          isDark ? 'bg-[#1e293b] border-amber-500/30' : 'bg-white border-amber-200/80'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              ACTION NEEDED
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <AlertTriangle size={15} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-amber-500">{actionNeededCount}</div>
            <p className="text-xs text-gray-400 mt-0.5">Warning or failed print</p>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className={`border rounded-2xl p-6 shadow-sm space-y-4 ${
        isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
      }`}>
        {/* Table Controls (Filter Tabs + Search) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
          {/* Filter Tabs */}
          <div className={`flex items-center gap-1.5 p-1 rounded-xl border self-start md:self-auto overflow-x-auto max-w-full ${
            isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-gray-50 border-gray-200'
          }`}>
            {[
              { id: 'all', label: 'All Jobs' },
              { id: 'processing', label: 'Processing' },
              { id: 'completed', label: 'Completed' },
              { id: 'failed', label: 'Failed' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id as any)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  filterTab === tab.id
                    ? isDark ? 'bg-purple-950/80 text-[#a78bfa]' : 'bg-white text-[#7c3aed] shadow-xs'
                    : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-72">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search file, user, kiosk..."
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

        {/* Desktop Operations Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className={`border-b text-[10px] uppercase font-extrabold tracking-wider ${
                isDark ? 'border-slate-700 text-slate-400' : 'border-gray-100 text-gray-400'
              }`}>
                <th className="pb-3 pl-2">Job ID</th>
                <th className="pb-3">Document</th>
                <th className="pb-3">User</th>
                <th className="pb-3">Kiosk Node</th>
                <th className="pb-3">Pages / Type</th>
                <th className="pb-3">Amount</th>
                <th className="pb-3">Stage / Duration</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 pr-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className={`divide-y font-medium ${
              isDark ? 'divide-slate-700/60' : 'divide-gray-100'
            }`}>
              {filteredJobs.map((job) => (
                <tr key={job.id} className="hover:bg-purple-500/10 transition-colors">
                  <td className="py-3.5 pl-2 font-mono font-bold text-[#a78bfa]">{job.id}</td>
                  <td className={`py-3.5 font-bold max-w-[180px] truncate ${
                    isDark ? 'text-white' : 'text-[#1e1b4b]'
                  }`}>
                    {job.fileName}
                  </td>
                  <td className="py-3.5 text-gray-400 text-[11px] max-w-[140px] truncate">
                    {job.user}
                  </td>
                  <td className={`py-3.5 whitespace-nowrap font-semibold ${
                    isDark ? 'text-slate-200' : 'text-gray-700'
                  }`}>
                    {job.kiosk}
                  </td>
                  <td className="py-3.5 whitespace-nowrap">
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>{job.pageCount} pgs</span>
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                      isDark ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {job.type}
                    </span>
                  </td>
                  <td className={`py-3.5 font-bold whitespace-nowrap ${
                    isDark ? 'text-white' : 'text-[#1e1b4b]'
                  }`}>
                    ₹{job.amount.toFixed(2)}
                  </td>
                  <td className="py-3.5 whitespace-nowrap">
                    <div className={`font-semibold ${isDark ? 'text-slate-200' : 'text-[#1e1b4b]'}`}>{job.stage}</div>
                    <div className="text-[10px] text-gray-400">{job.duration} ({job.timestamp})</div>
                  </td>
                  <td className="py-3.5 whitespace-nowrap">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                        job.status === 'DONE'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : job.status === 'PRINTING'
                          ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30 animate-pulse'
                          : job.status === 'ACTIVE'
                          ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                          : job.status === 'WARNING'
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : 'bg-red-500/15 text-red-400 border border-red-500/30'
                      }`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="py-3.5 pr-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => handleReprint(job.id)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                        isDark
                          ? 'border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                          : 'border-gray-200 text-gray-600 hover:bg-purple-50 hover:text-[#7c3aed]'
                      }`}
                    >
                      <RotateCcw size={12} />
                      Reprint
                    </button>
                  </td>
                </tr>
              ))}
              {filteredJobs.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-gray-400">
                    No print operations matched your filter.
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
