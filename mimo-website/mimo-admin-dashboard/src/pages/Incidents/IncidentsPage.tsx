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
import type { Incident } from '../../types/insights.types';

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
              <li key={i.id} className="flex items-start gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40">
                <span className={`mt-0.5 w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${SEV[i.severity]}`}>{ICONS[i.type]}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-[var(--text-1)]">{i.title}</p>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase border ${SEV[i.severity]}`}>{i.severity}</span>
                  </div>
                  <p className="text-xs text-[var(--text-2)] mt-0.5 break-words">{i.detail}</p>
                  {i.at && <p className="text-[11px] text-[var(--text-3)] mt-1">{dateTime(i.at)} · {timeAgo(i.at)}</p>}
                </div>
                {onNavigate && i.type !== 'refund_request' && (
                  <button type="button" onClick={() => onNavigate(i.tab)} className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer flex items-center gap-1 flex-shrink-0">
                    <Cpu size={12} /> Open
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

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
    </div>
  );
};
