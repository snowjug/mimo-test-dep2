import React, { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw,
  Search,
  Filter,
  FileText,
  Printer,
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  IndianRupee,
  Layers,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Loader2,
  Download,
} from 'lucide-react';
import api from '../../api';
import { useTheme } from '../../context/ThemeContext';
import { useRange } from '../../context/RangeContext';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { insights } from '../../services/insights.service';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { LiveIndicator } from '../../components/ui/LiveIndicator';
import { ErrorBanner } from '../../components/insights/InsightBits';
import { describeRange } from '../../lib/dateRange';

interface PrintJobRecord {
  id: string;
  createdAt: string;
  userEmail: string;
  userPhone: string | null;
  file: string;
  status: string;
  cost: number;
  copies: number;
  pageCount: number;
  colorMode: string;
  destination: string;
  orderId: string | null;
  refundStatus: string | null;
  refundAmount?: number | null;
}

export const OperationsPage: React.FC = () => {
  const { isDark } = useTheme();
  const { range, setRange, current, live } = useRange();
  // Every job created in the selected range (default: today), polled while the range includes today.
  const jobsQ = useLiveQuery(() => insights.jobs(current(), { limit: 1000 }), [range], { live });
  const jobs: PrintJobRecord[] = (jobsQ.data?.jobs ?? []) as PrintJobRecord[];
  const loading = jobsQ.loading;
  const refreshing = jobsQ.fetching;
  const fetchJobs = (_silent?: boolean) => jobsQ.refresh();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [destinationFilter, setDestinationFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // Refund Modal State
  const [refundJob, setRefundJob] = useState<PrintJobRecord | null>(null);
  const [refundNote, setRefundNote] = useState('Refund initiated by Admin');
  const [isRefunding, setIsRefunding] = useState(false);
  const [refundMessage, setRefundMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => { setPage(1); }, [range]);

  const handleRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundJob || !refundJob.orderId) {
      alert('Cannot process refund: No Order ID attached to this job.');
      return;
    }
    setIsRefunding(true);
    setRefundMessage(null);
    try {
      const res = await api.post('/admin/refund', {
        orderId: refundJob.orderId,
        refundAmount: refundJob.cost,
        note: refundNote,
      });
      setRefundMessage({ type: 'success', text: res.data.message || 'Refund processed successfully.' });
      setTimeout(() => {
        setRefundJob(null);
        fetchJobs(true);
      }, 1500);
    } catch (err: any) {
      setRefundMessage({
        type: 'error',
        text: err.response?.data?.error || 'Refund failed. Check gateway connection.',
      });
    } finally {
      setIsRefunding(false);
    }
  };

  const destinations = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach(j => { if (j.destination) set.add(j.destination); });
    return Array.from(set);
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    let list = [...jobs];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        j =>
          j.file.toLowerCase().includes(q) ||
          j.userEmail.toLowerCase().includes(q) ||
          (j.orderId && j.orderId.toLowerCase().includes(q))
      );
    }

    if (statusFilter !== 'ALL') {
      list = list.filter(j => j.status?.toLowerCase() === statusFilter.toLowerCase());
    }

    if (destinationFilter !== 'ALL') {
      list = list.filter(j => j.destination === destinationFilter);
    }

    return list;
  }, [jobs, search, statusFilter, destinationFilter]);

  const totalPages = Math.ceil(filteredJobs.length / PAGE_SIZE) || 1;
  const paginatedJobs = filteredJobs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(() => {
    const total = jobs.length;
    const completed = jobs.filter(j => j.status === 'completed' || j.status === 'printed' || j.status === 'paid').length;
    const printing = jobs.filter(j => j.status === 'printing').length;
    const refunded = jobs.filter(j => j.status === 'refunded' || j.refundStatus).length;
    return { total, completed, printing, refunded };
  }, [jobs]);

  return (
    <div className="space-y-6 animate-fadeIn font-sans select-none">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className={`text-2xl sm:text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Print Operations
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Queue & Dispatch
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-2)] mt-1">
            Every print job for {describeRange(range).toLowerCase()}: documents, queue health, hardware output and refunds.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <LiveIndicator updatedAt={jobsQ.updatedAt} live={live} fetching={jobsQ.fetching} />
          <DateRangePicker value={range} onChange={setRange} tone="admin" />
          <button
            type="button"
            onClick={() => fetchJobs(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[var(--surface)] border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)] transition-all cursor-pointer shadow-xs disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Refresh Queue
          </button>
        </div>
      </div>

      {jobsQ.error && <ErrorBanner message={jobsQ.error} onRetry={jobsQ.refresh} />}
      {jobsQ.data?.truncated && <p className="text-[11px] text-amber-600">Showing the newest {jobs.length} of {jobsQ.data.total} jobs — narrow the dates to see the rest.</p>}

      {/* ── Quick KPI Stat Tiles ────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
          <span className="text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider">Total Stream</span>
          <p className="text-2xl sm:text-3xl font-black text-[var(--text-1)] mt-1">{stats.total}</p>
        </div>
        <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
          <span className="text-[11px] font-bold text-emerald-500 uppercase tracking-wider">Completed</span>
          <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{stats.completed}</p>
        </div>
        <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
          <span className="text-[11px] font-bold text-blue-500 uppercase tracking-wider">Printing Active</span>
          <p className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 mt-1">{stats.printing}</p>
        </div>
        <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
          <span className="text-[11px] font-bold text-purple-500 uppercase tracking-wider">Refunded</span>
          <p className="text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400 mt-1">{stats.refunded}</p>
        </div>
      </div>

      {/* ── Filter Toolbar & Table ─────────────────────────────────── */}
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs overflow-hidden">
        {/* Controls Toolbar */}
        <div className="p-4 sm:p-5 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--surface)]">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              type="text"
              placeholder="Search by file name, student email, or Order ID..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--primary)] transition-all"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 overflow-x-auto">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] cursor-pointer focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="printing">Printing</option>
              <option value="paid">Paid</option>
              <option value="refunded">Refunded</option>
              <option value="failed">Failed</option>
            </select>

            {/* Destination Filter */}
            {destinations.length > 0 && (
              <select
                value={destinationFilter}
                onChange={(e) => {
                  setDestinationFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 text-xs font-bold rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] cursor-pointer focus:outline-none"
              >
                <option value="ALL">All Kiosks</option>
                {destinations.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Real Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider">
                <th className="py-3 px-4 sm:px-6">Document</th>
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-4">Terminal</th>
                <th className="py-3 px-4">Pages / Copies</th>
                <th className="py-3 px-4">Mode</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 sm:px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-xs sm:text-sm">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[var(--text-3)]">
                    <RefreshCw className="animate-spin inline mr-2" size={16} />
                    Loading operations queue...
                  </td>
                </tr>
              ) : paginatedJobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[var(--text-3)]">
                    No print operations found
                  </td>
                </tr>
              ) : (
                paginatedJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-[var(--surface-2)]/50 transition-colors">
                    {/* File / Doc */}
                    <td className="py-3.5 px-4 sm:px-6">
                      <div className="flex items-center gap-2.5">
                        <FileText size={16} className="text-indigo-500 flex-shrink-0" />
                        <div>
                          <p className="font-bold text-[var(--text-1)] truncate max-w-[200px]">
                            {job.file}
                          </p>
                          <p className="text-[10px] text-[var(--text-3)] font-mono">
                            {job.orderId || job.id}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Student User */}
                    <td className="py-3.5 px-4 text-[var(--text-2)] font-medium">
                      <p className="truncate max-w-[160px]">{job.userEmail}</p>
                      {job.userPhone && <p className="text-[10px] text-[var(--text-3)]">{job.userPhone}</p>}
                    </td>

                    {/* Destination Terminal */}
                    <td className="py-3.5 px-4 font-mono text-[11px] text-[var(--text-2)] font-bold">
                      {job.destination}
                    </td>

                    {/* Pages */}
                    <td className="py-3.5 px-4 font-semibold text-[var(--text-1)]">
                      {job.pageCount} pgs {job.copies > 1 ? `(${job.copies} copies)` : ''}
                    </td>

                    {/* Color Mode */}
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                        job.colorMode === 'color'
                          ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}>
                        {job.colorMode}
                      </span>
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                      ₹{job.cost.toFixed(2)}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                        job.status === 'completed' || job.status === 'printed' || job.status === 'paid'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : job.status === 'printing'
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                          : job.status === 'refunded'
                          ? 'bg-purple-500/10 text-purple-600 border border-purple-500/20'
                          : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                      }`}>
                        {job.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 sm:px-6 text-right">
                      {job.status !== 'refunded' && job.cost > 0 && job.orderId && (
                        <button
                          type="button"
                          onClick={() => setRefundJob(job)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg transition-colors cursor-pointer"
                        >
                          <RotateCcw size={12} />
                          Refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--text-3)] bg-[var(--surface)]">
          <span>
            Showing {filteredJobs.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0} to{' '}
            {Math.min(page * PAGE_SIZE, filteredJobs.length)} of {filteredJobs.length} records
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-[var(--border)] disabled:opacity-30 hover:bg-[var(--surface-2)] cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="font-bold text-[var(--text-1)]">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-[var(--border)] disabled:opacity-30 hover:bg-[var(--surface-2)] cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Cashfree Refund Modal ────────────────────────────────────── */}
      {refundJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <form
            onSubmit={handleRefundSubmit}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <RotateCcw size={18} className="text-rose-500" />
                <h3 className="font-bold text-base text-[var(--text-1)]">Issue Cashfree Refund</h3>
              </div>
              <button
                type="button"
                onClick={() => setRefundJob(null)}
                className="p-1 rounded text-[var(--text-3)] hover:text-[var(--text-1)]"
              >
                ✕
              </button>
            </div>

            {refundMessage && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold ${
                  refundMessage.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                }`}
              >
                {refundMessage.text}
              </div>
            )}

            <div className="space-y-2 text-xs text-[var(--text-2)]">
              <div className="flex justify-between py-1 border-b border-[var(--border)]">
                <span className="text-[var(--text-3)]">Order ID</span>
                <span className="font-mono font-bold text-[var(--text-1)]">{refundJob.orderId}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--border)]">
                <span className="text-[var(--text-3)]">Customer</span>
                <span className="font-semibold">{refundJob.userEmail}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--border)]">
                <span className="text-[var(--text-3)]">Document</span>
                <span className="truncate max-w-[200px]">{refundJob.file}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--border)]">
                <span className="text-[var(--text-3)]">Refund Amount</span>
                <span className="font-black text-sm text-emerald-600 dark:text-emerald-400">
                  ₹{refundJob.cost.toFixed(2)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider mb-1">
                Refund Reason / Note
              </label>
              <input
                type="text"
                value={refundNote}
                onChange={(e) => setRefundNote(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)]"
              />
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setRefundJob(null)}
                className="px-4 py-2 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text-2)] hover:bg-[var(--surface-2)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isRefunding}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-rose-500/20 disabled:opacity-50"
              >
                {isRefunding ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                Confirm Refund
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
