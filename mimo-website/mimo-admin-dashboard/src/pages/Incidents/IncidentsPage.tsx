import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Cpu, FileWarning, PackageOpen, RotateCcw, ShieldAlert, WifiOff } from 'lucide-react';
import api from '../../api';
import { useRange } from '../../context/RangeContext';
import { useLiveQuery, errorMessage } from '../../hooks/useLiveQuery';
import { insights } from '../../services/insights.service';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { LiveIndicator } from '../../components/ui/LiveIndicator';
import { ErrorBanner } from '../../components/insights/InsightBits';
import { ConfirmDialog, EmptyState } from '../../components/ui/shared';
import { describeRange } from '../../lib/dateRange';
import { dateTime, inr, timeAgo, tsToIso } from '../../lib/format';
import type { Incident, IssueBasis, IssueRow, IssueSource } from '../../types/insights.types';
import { IncidentDetailsModal } from './IncidentDetailsModal';

interface RefundRequest {
  id: string;
  orderId: string;
  amount?: number;
  reason?: string;
  status?: string;
  requestedAt?: unknown;
  autoRefundFailed?: boolean;
}

const ICONS: Record<Incident['type'], React.ReactNode> = {
  kiosk_offline: <WifiOff size={16} />,
  paper_low: <PackageOpen size={16} />,
  supply_low: <PackageOpen size={16} />,
  print_failed: <FileWarning size={16} />,
  refund_request: <RotateCcw size={16} />,
};
const SEV = {
  high: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
  medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  low: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
} as const;

export const IncidentsPage: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const { range, setRange, current } = useRange();
  const inc = useLiveQuery(() => insights.incidents(current()), [range], { live: true, intervalMs: 20000 });
  const refunds = useLiveQuery(() => api.get<{ requests: RefundRequest[] }>('/admin/refund-requests').then((r) => r.data.requests), [], { live: true, intervalMs: 30000 });
  const [confirm, setConfirm] = useState<RefundRequest | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const approve = async () => {
    if (!confirm) return;
    setBusy(true);
    setActionError('');
    try {
      await api.post('/admin/refund', { orderId: confirm.orderId, refundAmount: confirm.amount, note: 'Approved from the admin Incident Center' });
      setConfirm(null);
      refunds.refresh();
      inc.refresh();
    } catch (err) {
      setActionError(errorMessage(err));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  const pending = (refunds.data || []).filter((r) => r.status === 'pending');
  const history = (refunds.data || []).filter((r) => r.status !== 'pending').slice(0, 10);

  return (
    <div className="space-y-6 animate-fadeIn font-sans select-none">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-1)]">Incident &amp; Alert Center</h1>
            {inc.data && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${inc.data.counts.open === 0 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/30'}`}>
                {inc.data.counts.open === 0 ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                {inc.data.counts.open === 0 ? 'All clear' : `${inc.data.counts.open} open · ${inc.data.counts.high} high`}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-2)] mt-1">Machine health is always current; failed prints are for {describeRange(range).toLowerCase()}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LiveIndicator updatedAt={inc.updatedAt} live fetching={inc.fetching} onRefresh={() => { inc.refresh(); refunds.refresh(); }} />
          <DateRangePicker value={range} onChange={setRange} tone="admin" />
        </div>
      </div>

      {inc.error && <ErrorBanner message={inc.error} onRetry={inc.refresh} />}
      {refunds.error && <ErrorBanner message={`Refund requests: ${refunds.error}`} onRetry={refunds.refresh} />}
      {actionError && <ErrorBanner message={actionError} />}

      <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
        <h2 className="px-5 pt-5 text-sm font-bold text-[var(--text-1)]">Open incidents</h2>
        {inc.loading ? <div className="p-5"><div className="skeleton h-32" /></div> : inc.data && inc.data.incidents.length === 0 ? (
          <EmptyState icon={<ShieldAlert size={20} />} title="No open incidents" description="Both machines are online with enough paper and toner, and no prints failed in this period." />
        ) : (
          <ul className="p-3 sm:p-5 space-y-2.5">
            {inc.data?.incidents.map((i) => (
              <li
                key={i.id}
                onClick={() => setSelectedIncident(i)}
                className="flex items-start gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 hover:bg-[var(--surface-2)]/80 hover:border-indigo-500/30 transition-all cursor-pointer group"
              >
                <span className={`mt-0.5 w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${SEV[i.severity]}`}>{ICONS[i.type]}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-[var(--text-1)] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{i.title}</p>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase border ${SEV[i.severity]}`}>{i.severity}</span>
                  </div>
                  <p className="text-xs text-[var(--text-2)] mt-0.5 break-words">{i.detail}</p>
                  {i.at && <p className="text-[11px] text-[var(--text-3)] mt-1">{dateTime(i.at)} · {timeAgo(i.at)}</p>}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedIncident(i);
                  }}
                  className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 cursor-pointer flex items-center gap-1.5 flex-shrink-0 px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-all"
                >
                  <Cpu size={12} /> Open
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <IssueHistory onSelectIncident={setSelectedIncident} />

      <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs p-5">
        <h2 className="text-sm font-bold text-[var(--text-1)]">Refund requests</h2>
        <p className="text-xs text-[var(--text-3)] mt-0.5 mb-4">Customers who reported a paid order that did not print, plus auto-refunds that failed.</p>
        {refunds.loading ? <div className="skeleton h-24" /> : pending.length === 0 ? (
          <p className="text-xs font-semibold text-[var(--text-3)] py-4">No refund requests are waiting for review.</p>
        ) : (
          <ul className="space-y-2.5">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 justify-between p-3 rounded-xl border border-[var(--border)]">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--text-1)]">Order <span className="font-mono">{r.orderId}</span> · {inr(r.amount)}</p>
                  <p className="text-xs text-[var(--text-2)] break-words">{r.reason || 'No reason given'}{r.autoRefundFailed ? ' · automatic refund failed' : ''}</p>
                  <p className="text-[11px] text-[var(--text-3)] mt-0.5">Requested {timeAgo(tsToIso(r.requestedAt))}</p>
                </div>
                <button type="button" onClick={() => setConfirm(r)} className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer">Approve refund</button>
              </li>
            ))}
          </ul>
        )}
        {history.length > 0 && (
          <details className="mt-4">
            <summary className="text-xs font-bold text-[var(--text-2)] cursor-pointer">Recently resolved ({history.length})</summary>
            <ul className="mt-2 space-y-1.5">
              {history.map((r) => (
                <li key={r.id} className="text-xs text-[var(--text-2)] flex justify-between gap-3"><span className="font-mono truncate">{r.orderId}</span><span>{inr(r.amount)} · {r.status}</span></li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <ConfirmDialog open={!!confirm} title="Approve this refund?" description={confirm ? `${inr(confirm.amount)} will be refunded to the customer through Cashfree for order ${confirm.orderId}. This cannot be undone.` : ''}
        confirmLabel="Refund now" loading={busy} onConfirm={approve} onCancel={() => setConfirm(null)} />

      <IncidentDetailsModal
        incident={selectedIncident}
        onClose={() => setSelectedIncident(null)}
        onNavigate={onNavigate}
      />
    </div>
  );
};

const BASIS_LABEL: Record<IssueBasis, string> = {
  exact: 'System message',
  inferred: 'Inferred from failure text',
  customer: 'Customer-raised',
  unknown: 'No usable reason',
};
const SOURCE_LABEL: Record<IssueSource, string> = {
  job_failure: 'Detected',
  customer_report: 'Customer report',
  refund_request: 'Refund request',
};
const HISTORY_LIMIT = 500;
const HISTORY_PAGE = 25;

/**
 * Dated, deduplicated issue history for the selected range (GET /admin/issues). Read-only: actions on refunds stay
 * in the Refund requests section. Live alerts are already listed under Open incidents, so they are not fetched here.
 */
const IssueHistory: React.FC<{ onSelectIncident?: (incident: Incident) => void }> = ({ onSelectIncident }) => {
  const { range, current, live } = useRange();
  const q = useLiveQuery(() => insights.issues(current(), { limit: HISTORY_LIMIT, current: 0 }), [range], { live, intervalMs: 60000 });
  const [category, setCategory] = useState<string>('ALL');
  const [machine, setMachine] = useState<string>('ALL');
  const [shown, setShown] = useState(HISTORY_PAGE);
  const all: IssueRow[] = q.data?.issues ?? [];

  const machines = [...new Map(all.filter((i) => i.kioskId).map((i) => [i.kioskId as string, i.machineName || (i.kioskId as string)])).entries()].sort(([a], [b]) => a.localeCompare(b));
  const rows = all.filter((i) => (category === 'ALL' || i.category === category) && (machine === 'ALL' || i.kioskId === machine));
  const chip = (on: boolean) => `shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${on ? 'bg-[var(--text-1)] text-[var(--bg)]' : 'bg-[var(--surface)] text-[var(--text-2)] border border-[var(--border)] hover:bg-[var(--surface-2)]'}`;

  return (
    <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
      <div className="px-5 pt-5">
        <h2 className="text-sm font-bold text-[var(--text-1)]">Issue history</h2>
        <p className="text-xs text-[var(--text-3)] mt-0.5">
          Every problem in {describeRange(range).toLowerCase()}, counted once. Detected issues come from the machine; customer reports and refund requests are not proven by it.
        </p>
      </div>
      {q.error && <div className="px-5 pt-3"><ErrorBanner message={q.error} onRetry={q.refresh} /></div>}
      {q.data && (q.data.truncated || q.data.partial) && (
        <p className="px-5 pt-2 text-[11px] text-amber-600">
          {q.data.truncated ? `Showing the newest ${all.length} of ${q.data.total} issues. Narrow the dates to see the rest. ` : ''}
          {q.data.partial ? 'Refund requests could not be fully loaded.' : ''}
        </p>
      )}
      <div className="flex flex-wrap gap-2 px-5 pt-3">
        <button type="button" className={chip(category === 'ALL')} onClick={() => { setCategory('ALL'); setShown(HISTORY_PAGE); }}>All ({q.data?.counts.total ?? 0})</button>
        {(q.data?.counts.byCategory ?? []).filter((c) => c.count > 0).map((c) => (
          <button key={c.category} type="button" className={chip(category === c.category)} onClick={() => { setCategory(c.category); setShown(HISTORY_PAGE); }}>{c.label} ({c.count})</button>
        ))}
        {machines.length > 1 && <span className="hidden w-px self-stretch bg-[var(--border)] sm:block" />}
        {machines.length > 1 && [['ALL', 'All machines'] as [string, string], ...machines].map(([id, name]) => (
          <button key={id} type="button" title={id === 'ALL' ? undefined : id} className={chip(machine === id)} onClick={() => { setMachine(id); setShown(HISTORY_PAGE); }}>{name}</button>
        ))}
      </div>
      {q.loading ? <div className="p-5"><div className="skeleton h-32" /></div> : rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-xs font-semibold text-[var(--text-3)]">No issues match in this period.</p>
      ) : (
        <ul className="p-3 sm:p-5 space-y-2">
          {rows.slice(0, shown).map((i) => {
            const evidence = i.evidence.printerStatus || i.evidence.note || i.evidence.reason || null;
            return (
              <li
                key={i.id}
                onClick={() => {
                  if (onSelectIncident) {
                    onSelectIncident({
                      id: i.id,
                      type: i.source === 'refund_request' ? 'refund_request' : 'print_failed',
                      severity: i.severity,
                      kioskId: i.kioskId,
                      title: i.title,
                      detail: evidence || i.title,
                      at: i.at,
                      tab: 'operations',
                      jobId: i.jobId || (i.jobIds.length > 0 ? i.jobIds[0] : undefined),
                      orderId: i.orderId,
                      failureReason: evidence || 'Issue logged in history',
                    });
                  }
                }}
                className={`p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 ${
                  onSelectIncident ? 'hover:bg-[var(--surface-2)]/80 hover:border-indigo-500/30 transition-all cursor-pointer' : ''
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase border ${SEV[i.severity]}`}>{i.severity}</span>
                  <p className="text-sm font-bold text-[var(--text-1)] min-w-0 break-words">{i.title}</p>
                </div>
                <p className="mt-1 text-[11px] text-[var(--text-3)]">
                  {i.at ? `${dateTime(i.at)} · ` : ''}{SOURCE_LABEL[i.source]} · {BASIS_LABEL[i.basis]}{i.kioskId ? ` · ${i.machineName || i.kioskId}` : ''}
                </p>
                {evidence && <p className="mt-1 text-xs text-[var(--text-2)] break-words">“{evidence}”</p>}
                {i.evidence.verdict && <p className="mt-0.5 text-[11px] text-[var(--text-3)]">Machine verdict: {i.evidence.verdict.replace(/_/g, ' ')}</p>}
                {i.source === 'job_failure' && i.evidence.printVerified && <p className="mt-0.5 text-[11px] text-[var(--text-3)]">Printer counted {i.evidence.sheetsVerified ?? 0} sheet(s)</p>}
                {(i.jobId || i.orderId) && (
                  <p className="mt-0.5 text-[11px] text-[var(--text-3)] font-mono break-all">
                    {i.jobIds.length > 1 ? `Jobs ${i.jobIds.join(', ')}` : i.jobId ? `Job ${i.jobId}` : ''}{i.orderId ? `${i.jobId ? ' · ' : ''}Order ${i.orderId}` : ''}
                  </p>
                )}
                {i.related.length > 0 && (
                  <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
                    Also: {i.related.map((r) => (r.type === 'customer_report' ? `customer report${r.label ? ` (${r.label})` : ''}` : `refund request${r.status ? ` (${r.status})` : ''}`)).join(' · ')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + HISTORY_PAGE)} className="w-full border-t border-[var(--border)] py-3 text-sm font-semibold text-[var(--primary)] hover:bg-[var(--surface-2)]">
          Show more ({rows.length - shown} left)
        </button>
      )}
    </section>
  );
};
