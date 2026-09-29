import React, { useMemo, useState, useEffect } from 'react';
import { RefreshCw, Search, RotateCcw, Loader2 } from 'lucide-react';
import api from '../../api';
import { useRange } from '../../context/RangeContext';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { insights } from '../../services/insights.service';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { LiveIndicator } from '../../components/ui/LiveIndicator';
import { ErrorBanner } from '../../components/insights/InsightBits';
import { describeRange } from '../../lib/dateRange';
import { inr } from '../../lib/format';
import { PrintHistoryList, displayName } from '../../components/history/PrintHistory';
import type { JobRow } from '../../types/insights.types';

const PAGE_SIZE = 25;
const STATUS_FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'printed', label: 'Printed' },
  { id: 'failed', label: 'Failed' },
  { id: 'refunded', label: 'Refunded' },
  { id: 'active', label: 'In progress' },
];
const MACHINE_FILTERS = [
  { id: 'ALL', label: 'All machines' },
  { id: 'CV-001', label: 'M1' },
  { id: 'SV-002', label: 'M2' },
];

export const OperationsPage: React.FC = () => {
  const { range, setRange, current, live } = useRange();
  // Every job created in the selected range (default: today), polled while the range includes today.
  const jobsQ = useLiveQuery(() => insights.jobs(current(), { limit: 1000 }), [range], { live });
  const jobs: JobRow[] = jobsQ.data?.jobs ?? [];
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [machineFilter, setMachineFilter] = useState('ALL');
  const [shown, setShown] = useState(PAGE_SIZE);

  // Refund modal
  const [refundJob, setRefundJob] = useState<JobRow | null>(null);
  const [refundNote, setRefundNote] = useState('Refund initiated by Admin');
  const [isRefunding, setIsRefunding] = useState(false);
  const [refundMessage, setRefundMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => { setShown(PAGE_SIZE); }, [range, search, statusFilter, machineFilter]);

  const handleRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundJob || !refundJob.orderId) return;
    setIsRefunding(true);
    setRefundMessage(null);
    try {
      const res = await api.post('/admin/refund', { orderId: refundJob.orderId, refundAmount: refundJob.cost, note: refundNote });
      setRefundMessage({ type: 'success', text: res.data.message || 'Refund processed successfully.' });
      setTimeout(() => { setRefundJob(null); setRefundMessage(null); jobsQ.refresh(); }, 1500);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setRefundMessage({ type: 'error', text: msg || 'Refund failed. Check gateway connection.' });
    } finally {
      setIsRefunding(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      if (machineFilter !== 'ALL' && j.destination !== machineFilter) return false;
      if (statusFilter === 'printed' && j.outcome !== 'printed') return false;
      if (statusFilter === 'failed' && j.outcome !== 'failed') return false;
      if (statusFilter === 'refunded' && j.outcome !== 'refunded' && j.outcome !== 'refund_pending') return false;
      if (statusFilter === 'active' && j.outcome !== 'printing' && j.outcome !== 'waiting') return false;
      if (!q) return true;
      return [displayName(j), j.userEmail, j.userPhone, j.file, j.orderId].some((v) => v && v.toLowerCase().includes(q));
    });
  }, [jobs, search, statusFilter, machineFilter]);

  const stats = useMemo(() => {
    const count = (o: string[]) => jobs.filter((j) => o.includes(j.outcome ?? '')).length;
    return {
      total: jobs.length,
      printed: count(['printed']),
      failed: count(['failed']),
      refunded: count(['refunded', 'refund_pending']),
      revenue: jobs.filter((j) => j.outcome !== 'refunded' && j.outcome !== 'failed').reduce((s, j) => s + (j.cost || 0), 0),
    };
  }, [jobs]);

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
      active ? 'bg-[var(--text-1)] text-[var(--bg)]' : 'bg-[var(--surface)] text-[var(--text-2)] border border-[var(--border)] hover:bg-[var(--surface-2)]'
    }`;

  return (
    <div className="space-y-5 animate-fadeIn font-sans">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="hidden text-2xl font-black tracking-tight text-[var(--text-1)] sm:text-3xl lg:block">Print Operations</h1>
          <p className="text-xs text-[var(--text-2)] sm:text-sm">Every print for {describeRange(range).toLowerCase()}. Tap a row for its timeline.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveIndicator updatedAt={jobsQ.updatedAt} live={live} fetching={jobsQ.fetching} onRefresh={jobsQ.refresh} />
          <DateRangePicker value={range} onChange={setRange} tone="admin" />
        </div>
      </div>

      {jobsQ.error && <ErrorBanner message={jobsQ.error} onRetry={jobsQ.refresh} />}
      {jobsQ.data?.truncated && <p className="text-[11px] text-amber-600">Showing the newest {jobs.length} of {jobsQ.data.total} jobs. Narrow the dates to see the rest.</p>}

      {/* Summary: one grouped card, like iOS */}
      <div className="grid grid-cols-4 divide-x divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        {[
          ['Prints', String(stats.total), 'text-[var(--text-1)]'],
          ['Printed', String(stats.printed), 'text-[var(--text-1)]'],
          ['Failed', String(stats.failed), stats.failed ? 'text-rose-600' : 'text-[var(--text-1)]'],
          ['Refunded', String(stats.refunded), stats.refunded ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--text-1)]'],
        ].map(([label, value, cls]) => (
          <div key={label} className="px-3 py-3 sm:px-5 sm:py-4">
            <p className="text-[11px] font-semibold text-[var(--text-3)]">{label}</p>
            <p className={`mt-0.5 text-xl font-bold tabular-nums sm:text-2xl ${cls}`}>{jobsQ.loading ? '–' : value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="space-y-3 border-b border-[var(--border)] p-3 sm:p-4">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              type="search"
              placeholder="Search name, phone or file"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] py-2 pl-9 pr-3 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:border-[var(--primary)] focus:outline-none"
            />
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
            {STATUS_FILTERS.map((f) => (
              <button key={f.id} type="button" onClick={() => setStatusFilter(f.id)} className={chip(statusFilter === f.id)}>{f.label}</button>
            ))}
            <span className="mx-1 w-px shrink-0 bg-[var(--border)]" />
            {MACHINE_FILTERS.map((f) => (
              <button key={f.id} type="button" onClick={() => setMachineFilter(f.id)} className={chip(machineFilter === f.id)}>{f.label}</button>
            ))}
          </div>
        </div>

        {jobsQ.loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--text-3)]"><RefreshCw size={15} className="animate-spin" /> Loading prints…</div>
        ) : (
          <PrintHistoryList jobs={filtered.slice(0, shown)} onRefund={setRefundJob} emptyText="No prints match" />
        )}

        {filtered.length > shown && (
          <button type="button" onClick={() => setShown((n) => n + PAGE_SIZE)}
            className="w-full border-t border-[var(--border)] py-3 text-sm font-semibold text-[var(--primary)] hover:bg-[var(--surface-2)]">
            Show more ({filtered.length - shown} left)
          </button>
        )}
        {!jobsQ.loading && filtered.length > 0 && (
          <p className="border-t border-[var(--border)] px-4 py-2.5 text-[11px] text-[var(--text-3)]">
            {filtered.length} print{filtered.length === 1 ? '' : 's'} · {inr(stats.revenue)} kept after failures and refunds
          </p>
        )}
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
                  {inr(refundJob.cost)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[var(--text-3)] mb-1">
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
