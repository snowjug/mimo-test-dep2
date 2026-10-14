import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Cpu,
  ExternalLink,
  FileText,
  FileWarning,
  Layers,
  Mail,
  MapPin,
  PackageOpen,
  Phone,
  Printer,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  User,
  WifiOff,
} from 'lucide-react';
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

function extractNameFallback(i: Incident): string | null {
  if (i.userName && i.userName.trim()) return i.userName.trim();
  const text = `${i.fileName || ''} ${i.detail || ''}`;
  const match = text.match(/(?:Document from|Doc from)\s+([A-Za-z0-9 _-]+?)(?:\.pdf|\.png|\.jpg|$)/i);
  if (match && match[1]) {
    const raw = match[1].trim();
    if (raw.length > 1 && !raw.includes('%%EOF')) {
      return raw;
    }
  }
  return null;
}

export const IncidentsPage: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const { range, setRange, current } = useRange();
  const inc = useLiveQuery(() => insights.incidents(current()), [range], { live: true, intervalMs: 20000 });
  const refunds = useLiveQuery(() => api.get<{ requests: RefundRequest[] }>('/admin/refund-requests').then((r) => r.data.requests), [], { live: true, intervalMs: 30000 });
  const [confirm, setConfirm] = useState<RefundRequest | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inlineCopiedKey, setInlineCopiedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const copyInline = (text: string, key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setInlineCopiedKey(key);
    setTimeout(() => setInlineCopiedKey(null), 2000);
  };

  const copyIncidentSummary = (i: Incident, e: React.MouseEvent) => {
    e.stopPropagation();
    const isColor = (i.colorMode || '').toLowerCase() === 'color';
    const lines = [
      `🚨 MIMO Incident Alert: ${i.title}`,
      `Severity: ${i.severity.toUpperCase()}`,
      `Kiosk: ${i.kioskId || 'Unassigned'}`,
      `Date & Time: ${i.at ? dateTime(i.at) : 'Not recorded'}`,
      `Reason: ${i.failureReason || i.detail}`,
      `Printer Mode: ${isColor ? 'Colour Printer' : 'Black & White (B&W)'}`,
      `Pages Uploaded: ${i.pageCount || 1}`,
      `Customer: ${i.userName || extractNameFallback(i) || (i.userId ? 'Registered Customer' : 'Guest Customer')}`,
      i.userEmail ? `Email: ${i.userEmail}` : '',
      i.userPhone ? `Phone: ${i.userPhone}` : '',
      i.jobId ? `Job ID: ${i.jobId}` : '',
      i.orderId ? `Order ID: ${i.orderId}` : '',
      i.fileName ? `File: ${i.fileName}` : '',
      i.amount !== null && i.amount !== undefined ? `Amount: ₹${i.amount}` : '',
      i.refundStatus ? `Refund: ${i.refundStatus}` : '',
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join('\n'));
    setInlineCopiedKey(`summary-${i.id}`);
    setTimeout(() => setInlineCopiedKey(null), 2000);
  };

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
          <p className="text-xs sm:text-sm text-[var(--text-2)] mt-1">Machine health is always current; failed prints are for {describeRange(range).toLowerCase()}. Click any incident to expand details inline, or open the pop-up.</p>
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
        <div className="px-5 pt-5 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--text-1)]">Open incidents</h2>
          <span className="text-[11px] text-[var(--text-3)] font-medium">Click any incident to expand details below</span>
        </div>
        {inc.loading ? <div className="p-5"><div className="skeleton h-32" /></div> : inc.data && inc.data.incidents.length === 0 ? (
          <EmptyState icon={<ShieldAlert size={20} />} title="No open incidents" description="Both machines are online with enough paper and toner, and no prints failed in this period." />
        ) : (
          <ul className="p-3 sm:p-5 space-y-3">
            {inc.data?.incidents.map((i) => {
              const isExpanded = expandedId === i.id;
              const customerName = i.userName || extractNameFallback(i) || (i.userId ? 'Registered Customer' : 'Guest Customer');
              const customerEmail = i.userEmail || (i.userId?.includes('@') ? i.userId : null) || 'Not provided';
              const isColor = (i.colorMode || '').toLowerCase() === 'color';
              const pageCount = i.pageCount || 1;

              return (
                <li
                  key={i.id}
                  className={`rounded-xl border transition-all overflow-hidden ${
                    isExpanded
                      ? 'border-indigo-500/40 bg-[var(--surface-2)]/60 shadow-md ring-1 ring-indigo-500/20'
                      : 'border-[var(--border)] bg-[var(--surface-2)]/40 hover:bg-[var(--surface-2)]/80 hover:border-indigo-500/30'
                  }`}
                >
                  {/* Collapsed / Header Row */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : i.id)}
                    className="flex items-start gap-3 p-3.5 cursor-pointer group"
                  >
                    <span className={`mt-0.5 w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${SEV[i.severity]}`}>{ICONS[i.type]}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-[var(--text-1)] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{i.title}</p>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase border ${SEV[i.severity]}`}>{i.severity}</span>
                        {i.kioskId && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            {i.kioskId}
                          </span>
                        )}
                        {/* Inline color & page count preview pills */}
                        {i.type === 'print_failed' && (
                          <>
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${isColor ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20' : 'bg-slate-500/10 text-[var(--text-2)] border border-[var(--border)]'}`}>
                              {isColor ? '🎨 Colour' : '🖨️ B&W'}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                              {pageCount}p
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-2)] mt-0.5 break-words line-clamp-1">{i.detail}</p>
                      {i.at && <p className="text-[11px] text-[var(--text-3)] mt-1">{dateTime(i.at)} · {timeAgo(i.at)}</p>}
                    </div>

                    {/* Action & Toggle Buttons */}
                    <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedIncident(i);
                        }}
                        className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 cursor-pointer flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-all"
                        title="Open pop-up window"
                      >
                        <ExternalLink size={12} />
                        <span>Pop-up</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedId(isExpanded ? null : i.id);
                        }}
                        className="p-1 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* EXTENDED DOWN ACCORDION: Shows all failure details directly inline! */}
                  {isExpanded && (
                    <div className="px-3.5 pb-4 pt-1 border-t border-[var(--border)] bg-[var(--surface)]/90 space-y-3.5 animate-fadeIn">
                      {/* Diagnostic Failure Banner */}
                      <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/5 dark:bg-rose-950/20 flex items-start gap-2.5">
                        <div className="mt-0.5 p-1 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 flex-shrink-0">
                          <ShieldAlert size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 block">
                            Failure Reason &amp; Machine Diagnostic Log
                          </span>
                          <p className="text-xs sm:text-sm font-semibold text-[var(--text-1)] mt-0.5 break-words select-text">
                            {i.failureReason || i.detail}
                          </p>
                        </div>
                      </div>

                      {/* Details Grid: Customer, Kiosk & Time, Printer Specs & Pages */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* 1. Customer Details */}
                        <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-1)] pb-1 border-b border-[var(--border)]/50">
                            <User size={13} className="text-indigo-500" />
                            <span>Customer Profile</span>
                          </div>
                          <div className="space-y-1.5 text-xs">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-[var(--text-3)] block">Name</span>
                              <p className="font-semibold text-[var(--text-1)] truncate select-text">
                                {customerName}
                              </p>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-[var(--text-3)] block">Email ID</span>
                              <div className="flex items-center gap-1 min-w-0 mt-0.5">
                                <Mail size={11} className="text-[var(--text-3)] flex-shrink-0" />
                                <p className="font-medium text-[var(--text-2)] text-[11px] truncate select-text">
                                  {customerEmail}
                                </p>
                                {customerEmail !== 'Not provided' && (
                                  <button
                                    type="button"
                                    onClick={(e) => copyInline(customerEmail, `email-${i.id}`, e)}
                                    className="text-[var(--text-3)] hover:text-indigo-500 cursor-pointer ml-auto flex-shrink-0 p-0.5"
                                    title="Copy email"
                                  >
                                    {inlineCopiedKey === `email-${i.id}` ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                                  </button>
                                )}
                              </div>
                            </div>
                            {i.userPhone && (
                              <div>
                                <span className="text-[10px] uppercase font-bold text-[var(--text-3)] block">Phone</span>
                                <div className="flex items-center gap-1 text-[var(--text-2)] font-medium text-[11px] mt-0.5">
                                  <Phone size={11} className="text-[var(--text-3)] flex-shrink-0" />
                                  <span className="select-text">{i.userPhone}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 2. Kiosk & Failure Time */}
                        <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-1)] pb-1 border-b border-[var(--border)]/50">
                            <MapPin size={13} className="text-emerald-500" />
                            <span>Kiosk &amp; Time</span>
                          </div>
                          <div className="space-y-1.5 text-xs">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-[var(--text-3)] block">Which Kiosk Failed</span>
                              <span className="px-2 py-0.5 rounded-lg text-xs font-bold font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 inline-block mt-0.5">
                                {i.kioskId || 'Unassigned'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-[var(--text-3)] block">Date &amp; Time of Failure</span>
                              <div className="flex items-center gap-1 text-[var(--text-2)] font-medium text-[11px] mt-0.5">
                                <Clock size={11} className="text-[var(--text-3)] flex-shrink-0" />
                                <span className="select-text">{i.at ? dateTime(i.at) : 'Not recorded'}</span>
                              </div>
                              {i.at && (
                                <span className="text-[10px] text-[var(--text-3)] block">
                                  {timeAgo(i.at)}
                                </span>
                              )}
                            </div>
                            {i.fileName && (
                              <div>
                                <span className="text-[10px] uppercase font-bold text-[var(--text-3)] block">File Name</span>
                                <p className="font-mono text-[11px] text-[var(--text-2)] truncate mt-0.5 select-text" title={i.fileName}>
                                  {i.fileName}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 3. Printer Mode (B&W or Colour) & Pages Uploaded */}
                        <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-1)] pb-1 border-b border-[var(--border)]/50">
                            <Printer size={13} className="text-blue-500" />
                            <span>Print Specs &amp; Type</span>
                          </div>
                          <div className="space-y-2 text-xs">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-[var(--text-3)] block mb-1">
                                Printer Mode
                              </span>
                              {isColor ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-gradient-to-r from-pink-500/15 via-purple-500/15 to-indigo-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                                  <Sparkles size={12} className="text-purple-500" />
                                  Colour Printer
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-500/15 text-[var(--text-1)] border border-[var(--border)]">
                                  <Printer size={12} className="text-[var(--text-2)]" />
                                  Black &amp; White (B&amp;W)
                                </span>
                              )}
                            </div>

                            <div>
                              <span className="text-[10px] uppercase font-bold text-[var(--text-3)] block mb-1">
                                Pages Uploaded by Customer
                              </span>
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25">
                                <Layers size={12} />
                                {pageCount} {pageCount === 1 ? 'Page' : 'Pages'} Uploaded
                              </span>
                            </div>

                            {(i.amount !== null && i.amount !== undefined || i.refundStatus) && (
                              <div className="flex items-center gap-2 pt-0.5">
                                {i.amount !== null && i.amount !== undefined && (
                                  <span className="text-xs font-bold text-[var(--text-1)]">
                                    {inr(i.amount)}
                                  </span>
                                )}
                                {i.refundStatus && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                    {i.refundStatus}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Job & Order Identifiers */}
                      <div className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/20 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-3">
                          {i.jobId && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] uppercase font-bold text-[var(--text-3)]">Job ID:</span>
                              <code className="px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] font-mono text-[11px] text-[var(--text-1)] select-text">
                                {i.jobId}
                              </code>
                              <button
                                type="button"
                                onClick={(e) => copyInline(i.jobId!, `job-${i.id}`, e)}
                                className="p-0.5 rounded text-[var(--text-3)] hover:text-indigo-500 cursor-pointer"
                                title="Copy Job ID"
                              >
                                {inlineCopiedKey === `job-${i.id}` ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                              </button>
                            </div>
                          )}
                          {i.orderId && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] uppercase font-bold text-[var(--text-3)]">Order ID:</span>
                              <code className="px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] font-mono text-[11px] text-[var(--text-1)] select-text">
                                {i.orderId}
                              </code>
                              <button
                                type="button"
                                onClick={(e) => copyInline(i.orderId!, `order-${i.id}`, e)}
                                className="p-0.5 rounded text-[var(--text-3)] hover:text-indigo-500 cursor-pointer"
                                title="Copy Order ID"
                              >
                                {inlineCopiedKey === `order-${i.id}` ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Extended Action Buttons */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => copyIncidentSummary(i, e)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-[var(--border)] bg-[var(--surface)] text-[var(--text-1)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
                          >
                            {inlineCopiedKey === `summary-${i.id}` ? (
                              <>
                                <Check size={12} className="text-emerald-500" />
                                <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy size={12} />
                                <span>Copy Details</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedIncident(i);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-colors cursor-pointer"
                          >
                            <ExternalLink size={12} />
                            <span>Pop-up View</span>
                          </button>

                          {onNavigate && i.tab && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onNavigate(i.tab);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors cursor-pointer"
                            >
                              <Cpu size={12} />
                              <span>Operations</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
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
