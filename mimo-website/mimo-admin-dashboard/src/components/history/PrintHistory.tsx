import React, { useState } from 'react';
import { Check, X, IndianRupee, Loader2, Clock, ChevronDown, MessageSquareWarning, RotateCcw, FileText, UserX } from 'lucide-react';
import type { JobOutcome, JobRow } from '../../types/insights.types';
import { clockTime, duration, inr } from '../../lib/format';

/* ── Machine badge: M1 / M2 in a grey circle; a colour print on M2 is blue ── */
const MACHINE_SHORT: Record<string, string> = { 'CV-001': 'M1', 'SV-002': 'M2' };

export const MachineBadge: React.FC<{ kioskId: string; color?: boolean }> = ({ kioskId, color }) => {
  const label = MACHINE_SHORT[kioskId] ?? (kioskId === 'Unassigned' ? '–' : kioskId.slice(0, 2));
  return (
    <span
      title={`${kioskId}${color ? ' · colour' : ' · black & white'}`}
      className={`inline-flex size-[26px] sm:size-7 shrink-0 items-center justify-center rounded-full text-[10px] sm:text-[11px] font-bold ${
        color ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
      }`}
    >
      {label}
      <span className="sr-only">{color ? ' colour' : ' black and white'}</span>
    </span>
  );
};

/* ── Status: printed ✓ green · failed ✕ red · refunded ₹ blue ── */
const OUTCOME: Record<JobOutcome, { label: string; cls: string; icon: React.ReactNode }> = {
  printed: { label: 'Printed', cls: 'bg-emerald-500 text-white', icon: <Check size={14} strokeWidth={3} /> },
  failed: { label: 'Failed', cls: 'bg-rose-500 text-white', icon: <X size={14} strokeWidth={3} /> },
  refunded: { label: 'Refunded', cls: 'bg-blue-500 text-white', icon: <IndianRupee size={13} strokeWidth={2.75} /> },
  refund_pending: { label: 'Refund processing', cls: 'border-2 border-blue-500 text-blue-500', icon: <IndianRupee size={12} strokeWidth={2.75} /> },
  printing: { label: 'Printing', cls: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400', icon: <Loader2 size={14} className="animate-spin" /> },
  waiting: { label: 'Paid, not printed yet', cls: 'border border-slate-300 text-slate-400 dark:border-slate-600', icon: <Clock size={13} /> },
  abandoned: { label: 'Uploaded, never claimed', cls: 'border border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400', icon: <UserX size={13} /> },
};

export const StatusIcon: React.FC<{ outcome?: JobOutcome }> = ({ outcome = 'waiting' }) => {
  const o = OUTCOME[outcome] ?? OUTCOME.waiting;
  return (
    <span title={o.label} className={`inline-flex size-[26px] sm:size-7 shrink-0 items-center justify-center rounded-full ${o.cls}`}>
      {o.icon}
      <span className="sr-only">{o.label}</span>
    </span>
  );
};

export const displayName = (j: JobRow) =>
  j.userName?.trim() || (j.userEmail && j.userEmail !== 'Guest' ? j.userEmail.split('@')[0] : null) || j.userPhone || 'Guest';

/* ── Expanded details: document, timeline, printer evidence, customer report, refund ── */
const ms = (iso: string) => new Date(iso).getTime();
// Steps the system owns. A long gap before one of these points at the Pi, network or printer; the gap before
// "Code entered" is only the customer walking to the kiosk, so it is never flagged.
const SYSTEM_STEPS = new Set(['piReceived', 'sentToPrinter', 'printed', 'failed', 'autoResumed']);
const SLOW_GAP_MS = 60 * 1000;
const VERDICT_TEXT: Record<string, string> = {
  contradicted: 'Printer evidence contradicts the claim',
  unverified: 'Printer could not verify',
  needs_proof: 'Needs the pages or a photo',
  already_failed: 'Already refunded automatically',
};
const REFUND_SOURCE: Record<string, string> = { auto: 'automatically after a failed print', admin: 'from the admin panel', cashfree: 'in the Cashfree app' };

/** Code entered at the kiosk → printed or failed: how long the customer stood waiting. */
function printDuration(job: JobRow): number | null {
  const steps = job.timeline ?? [];
  const start = steps.find((st) => st.key === 'codeEntered') ?? steps.find((st) => st.key === 'piReceived');
  const end = steps.find((st) => st.key === 'printed' || st.key === 'failed');
  return start && end ? ms(end.at) - ms(start.at) : null;
}

const JobDetails: React.FC<{ job: JobRow; onRefund?: (job: JobRow) => void }> = ({ job, onRefund }) => {
  const steps = job.timeline ?? [];
  const canRefund = !!onRefund && job.outcome !== 'refunded' && job.outcome !== 'refund_pending' && job.cost > 0 && !!job.orderId;
  const rawPages = job.pageCount || 1;
  const totalPgs = job.totalPages || (rawPages * (job.copies || 1));
  const sheets = job.sheets ?? (job.duplex ? Math.ceil(rawPages / 2) * (job.copies || 1) : totalPgs);
  const gross = (job.originalCost && job.originalCost > job.cost)
    ? job.originalCost
    : ((job.discount && job.discount > 0)
      ? job.cost + job.discount
      : (job.couponCode && job.cost === 0
        ? (sheets * (job.colorMode === 'color' ? 10 : 2.8))
        : job.cost));
  const hasCoupon = !!job.couponCode || gross > job.cost || (job.discount && job.discount > 0);

  return (
    <div className="grid gap-5 bg-[var(--surface-2)]/50 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
      <div className="min-w-0 space-y-4">
        <div className="flex items-start gap-2.5">
          <FileText size={16} className="mt-0.5 shrink-0 text-[var(--text-3)]" />
          <div className="min-w-0 text-xs">
            <p className="break-words font-bold text-[var(--text-1)]">{job.file}</p>
            <p className="text-[var(--text-3)]">
              {totalPgs} page{totalPgs === 1 ? '' : 's'}{job.duplex ? ` (${sheets} sheet${sheets === 1 ? '' : 's'} paper)` : ''}{job.copies > 1 ? ` × ${job.copies} copies` : ''} · {job.colorMode === 'color' ? 'Colour' : 'B&W'}{job.duplex ? ' · double-sided' : ' · single-sided'}
            </p>
            <p className="mt-1 break-all text-[var(--text-2)]">
              {[job.userEmail !== 'Guest' ? job.userEmail : null, job.userPhone].filter(Boolean).join(' · ') || 'Guest'}
            </p>
            <p className="font-mono text-[10px] text-[var(--text-3)]">{job.orderId || job.id}</p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-bold text-[var(--text-3)]">Timeline</p>
          {steps.length === 0 ? (
            <p className="text-xs text-[var(--text-3)]">No timing was recorded for this job.</p>
          ) : (
            <ol className="relative ml-1.5 space-y-2.5 border-l border-[var(--border)]">
              {steps.map((st, i) => {
                const gap = i > 0 ? ms(st.at) - ms(steps[i - 1].at) : null;
                const slow = gap !== null && SYSTEM_STEPS.has(st.key) && gap > SLOW_GAP_MS;
                const bad = st.key === 'failed' || st.key === 'reported';
                return (
                  <li key={st.key} className="relative pl-4">
                    <span className={`absolute -left-[5px] top-1.5 size-2.5 rounded-full ${bad ? 'bg-rose-500' : st.key === 'printed' ? 'bg-emerald-500' : st.key === 'refunded' ? 'bg-blue-500' : 'bg-[var(--text-3)]'}`} />
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
                      <span className="font-mono tabular-nums text-[var(--text-2)]">{clockTime(st.at)}</span>
                      <span className={`font-bold ${bad ? 'text-rose-600' : 'text-[var(--text-1)]'}`}>{st.label}</span>
                      {gap !== null && (
                        <span className={`text-[11px] tabular-nums ${slow ? 'font-bold text-amber-600' : 'text-[var(--text-3)]'}`}>
                          +{duration(gap)}{slow ? ' · slow' : ''}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      <div className="space-y-3 text-xs">
        <div>
          <p className="text-[11px] font-bold text-[var(--text-3)]">Printer evidence</p>
          <p className="mt-1 text-[var(--text-1)]">
            {job.printVerified ? `Printer counted ${job.sheetsVerified ?? sheets} sheet(s) coming out.` : `Physical paper: ${sheets} sheet${sheets === 1 ? '' : 's'} (${totalPgs} doc pages).`}
          </p>
          {job.printerStatus && <p className="mt-0.5 break-words text-[var(--text-2)]">Status: {job.printerStatus}</p>}
        </div>

        {hasCoupon && (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-2.5">
            <p className="font-bold text-emerald-600 dark:text-emerald-400">Coupon applied: {job.couponCode || 'PROMO'}</p>
            <p className="mt-0.5 text-[var(--text-2)]">
              Original price: <span className="line-through">{inr(gross)}</span> · Discount: -{inr(Math.max(0, gross - job.cost))} · Paid: <strong className="font-bold text-slate-900 dark:text-white">{inr(job.cost)}</strong>
            </p>
          </div>
        )}

        {job.refund && (
          <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-2.5">
            <p className="font-bold text-blue-600 dark:text-blue-400">
              {job.refund.state === 'refunded' ? 'Refunded' : 'Refund processing'}{job.refund.amount ? ` ${inr(job.refund.amount)}` : ''}
            </p>
            <p className="mt-0.5 text-[var(--text-2)]">
              {REFUND_SOURCE[job.refund.source] ? `Done ${REFUND_SOURCE[job.refund.source]}` : ''}{job.refund.at ? ` · ${clockTime(job.refund.at)}` : ''}
            </p>
          </div>
        )}

        {job.customerIssue && (
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-2.5">
            <p className="font-bold text-rose-600">Customer reported: {job.customerIssue.label}</p>
            {job.customerIssue.verdict && <p className="mt-0.5 font-semibold text-[var(--text-1)]">{VERDICT_TEXT[job.customerIssue.verdict] ?? job.customerIssue.verdict}</p>}
            {job.customerIssue.evidence && <p className="mt-0.5 text-[var(--text-2)]">{job.customerIssue.evidence}</p>}
          </div>
        )}

        {canRefund && (
          <button
            type="button"
            onClick={() => onRefund!(job)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-600 transition-colors hover:bg-rose-500/20"
          >
            <RotateCcw size={13} /> Refund {inr(job.cost)}
          </button>
        )}
      </div>
    </div>
  );
};

/* ── The list itself: Time · Name · Machine · Pages · Price · Status ── */
const COLS = 'grid grid-cols-[46px_minmax(0,1fr)_26px_36px_60px_30px] sm:grid-cols-[88px_minmax(0,1fr)_64px_74px_90px_64px] items-center gap-1.5 sm:gap-4';
const isToday = (iso: string | null) => !!iso && new Date(iso).toDateString() === new Date().toDateString();
const shortTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—';

export const PrintHistoryList: React.FC<{
  jobs: JobRow[];
  onRefund?: (job: JobRow) => void;
  emptyText?: string;
}> = ({ jobs, onRefund, emptyText = 'No prints in this period' }) => {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="text-xs sm:text-sm">
      <div aria-hidden="true" className={`${COLS} border-b border-[var(--border)] px-2.5 py-2.5 text-[9.5px] font-bold uppercase tracking-normal text-[var(--text-3)] sm:px-5 sm:text-[11px] sm:tracking-wide`}>
        <span>Time</span>
        <span>Name</span>
        <span className="text-center"><span className="sm:hidden">M/c</span><span className="hidden sm:inline">Machine</span></span>
        <span className="text-right" title="Physical sheets / Document pages"><span className="sm:hidden">Pgs</span><span className="hidden sm:inline">Pages</span></span>
        <span className="text-right">Price</span>
        <span className="text-right sm:text-center">Status</span>
      </div>
      {jobs.length === 0 && <p className="px-5 py-10 text-center text-[var(--text-3)]">{emptyText}</p>}
      <ul className="divide-y divide-[var(--border)]">
        {jobs.map((j) => {
          const expanded = open === j.id;
          const took = printDuration(j);
          const rawPages = j.pageCount || 1;
          const totalPgs = j.totalPages || (rawPages * (j.copies || 1));
          const sheets = j.sheets ?? (j.duplex ? Math.ceil(rawPages / 2) * (j.copies || 1) : totalPgs);
          const gross = (j.originalCost && j.originalCost > j.cost)
            ? j.originalCost
            : ((j.discount && j.discount > 0)
              ? j.cost + j.discount
              : (j.couponCode && j.cost === 0
                ? (sheets * (j.colorMode === 'color' ? 10 : 2.8))
                : j.cost));
          const hasCoupon = !!j.couponCode || gross > j.cost || (j.discount && j.discount > 0);

          return (
            <li key={j.id}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : j.id)}
                className={`${COLS} w-full px-2.5 py-3 text-left transition-colors hover:bg-[var(--surface-2)]/60 active:bg-[var(--surface-2)] sm:px-5 ${expanded ? 'bg-[var(--surface-2)]/50' : ''}`}
              >
                <span className="min-w-0">
                  <span className="block text-[11.5px] font-semibold tabular-nums text-[var(--text-1)] sm:text-sm">{shortTime(j.createdAt)}</span>
                  {!isToday(j.createdAt) && j.createdAt && (
                    <span className="block text-[10px] text-[var(--text-3)]">{new Date(j.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                  )}
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="line-clamp-2 break-words font-semibold leading-tight text-[var(--text-1)] sm:line-clamp-1" title={j.userEmail}>{displayName(j)}</span>
                  {j.customerIssue && <MessageSquareWarning size={13} className="shrink-0 text-rose-500" aria-label="Customer reported a problem" />}
                  {took !== null && took > 3 * 60 * 1000 && <span className="hidden shrink-0 text-[10px] font-bold text-amber-600 sm:inline">slow {duration(took)}</span>}
                  <ChevronDown size={13} className={`ml-auto hidden shrink-0 text-[var(--text-3)] transition-transform sm:block ${expanded ? 'rotate-180' : ''}`} />
                </span>
                <span className="flex justify-center"><MachineBadge kioskId={j.destination} color={j.colorMode === 'color'} /></span>
                <span className="text-right font-semibold tabular-nums text-[var(--text-1)]">
                  {j.duplex ? (
                    <span title={`${totalPgs} document pages (${sheets} physical sheets double-sided)`} className="inline-flex items-baseline gap-0.5">
                      <span>{sheets}</span>
                      <span className="text-[10px] text-slate-400 font-normal">({totalPgs}p)</span>
                    </span>
                  ) : (
                    <span>{totalPgs}</span>
                  )}
                </span>
                <span className="text-right tabular-nums">
                  {hasCoupon ? (
                    <span className="inline-block text-right">
                      <span className="line-through text-slate-400 text-[10px] sm:text-[11px] block sm:inline sm:mr-1">{inr(gross)}</span>
                      <span className={`font-bold ${j.cost === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-1)]'}`}>{inr(j.cost)}</span>
                    </span>
                  ) : (
                    <span className={`font-semibold ${j.outcome === 'refunded' ? 'text-[var(--text-3)] line-through' : 'text-[var(--text-1)]'}`}>{inr(j.cost)}</span>
                  )}
                </span>
                <span className="flex justify-end sm:justify-center"><StatusIcon outcome={j.outcome} /></span>
              </button>
              {expanded && <JobDetails job={j} onRefund={onRefund} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
