import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Cpu,
  ExternalLink,
  FileText,
  FileWarning,
  Mail,
  MapPin,
  PackageOpen,
  Phone,
  RotateCcw,
  ShieldAlert,
  User,
  WifiOff,
  X,
} from 'lucide-react';
import api from '../../api';
import { dateTime, inr, timeAgo } from '../../lib/format';
import type { Incident } from '../../types/insights.types';

interface IncidentDetailsModalProps {
  incident: Incident | null;
  onClose: () => void;
  onNavigate?: (tab: string) => void;
}

const TYPE_CONFIG: Record<
  Incident['type'],
  { label: string; icon: React.ReactNode; color: string }
> = {
  print_failed: {
    label: 'Print Job Failure',
    icon: <FileWarning className="w-5 h-5 text-rose-500" />,
    color: 'rose',
  },
  kiosk_offline: {
    label: 'Kiosk Offline Alert',
    icon: <WifiOff className="w-5 h-5 text-rose-500" />,
    color: 'rose',
  },
  paper_low: {
    label: 'Paper Low Alert',
    icon: <PackageOpen className="w-5 h-5 text-amber-500" />,
    color: 'amber',
  },
  supply_low: {
    label: 'Toner/Ink Low Alert',
    icon: <PackageOpen className="w-5 h-5 text-amber-500" />,
    color: 'amber',
  },
  refund_request: {
    label: 'Refund Request',
    icon: <RotateCcw className="w-5 h-5 text-indigo-500" />,
    color: 'indigo',
  },
};

/**
 * Extracts a name fallback if userName is not explicitly set,
 * e.g. from filename pattern "1791961291_5x3daq3o_Document from Utkarsh Viji"
 */
function extractNameFallback(incident: Incident): string | null {
  if (incident.userName && incident.userName.trim()) return incident.userName.trim();
  const text = `${incident.fileName || ''} ${incident.detail || ''}`;
  const match = text.match(/(?:Document from|Doc from)\s+([A-Za-z0-9 _-]+?)(?:\.pdf|\.png|\.jpg|$)/i);
  if (match && match[1]) {
    const raw = match[1].trim();
    if (raw.length > 1 && !raw.includes('%%EOF')) {
      return raw;
    }
  }
  return null;
}

export const IncidentDetailsModal: React.FC<IncidentDetailsModalProps> = ({
  incident,
  onClose,
  onNavigate,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [enrichment, setEnrichment] = useState<{
    userName?: string | null;
    userEmail?: string | null;
    userPhone?: string | null;
    fileName?: string | null;
    cost?: number | null;
    colorMode?: string | null;
    pageCount?: number | null;
  } | null>(null);

  // Close on Escape key
  useEffect(() => {
    if (!incident) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [incident, onClose]);

  // If incident is missing email/name and has a jobId, fetch job details from /admin/jobs in background
  useEffect(() => {
    setEnrichment(null);
    if (!incident || !incident.jobId) return;
    if (incident.userEmail && incident.userEmail !== 'Guest' && incident.userName) return;

    let cancelled = false;
    api
      .get('/admin/jobs', { params: { limit: 150 } })
      .then((res) => {
        if (cancelled) return;
        const job = res.data?.jobs?.find((j: any) => j.id === incident.jobId);
        if (job) {
          setEnrichment({
            userName: job.userName || (job.userEmail?.includes('@') ? job.userEmail.split('@')[0] : null),
            userEmail: job.userEmail,
            userPhone: job.userPhone,
            fileName: job.file,
            cost: job.cost,
            colorMode: job.colorMode,
            pageCount: job.pageCount,
          });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [incident]);

  if (!incident) return null;

  const typeMeta = TYPE_CONFIG[incident.type] || {
    label: 'Incident Alert',
    icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    color: 'amber',
  };

  const userName =
    incident.userName ||
    enrichment?.userName ||
    extractNameFallback(incident) ||
    (incident.userId ? 'Registered User' : 'Guest / Walk-in Customer');

  const userEmail =
    incident.userEmail ||
    enrichment?.userEmail ||
    (incident.userId?.includes('@') ? incident.userId : null) ||
    'Not provided';

  const userPhone = incident.userPhone || enrichment?.userPhone || null;
  const kioskName = incident.kioskId || 'Unassigned / Any';
  const failureReason = incident.failureReason || incident.detail || 'Print failure occurred during processing';
  const dateFormatted = incident.at ? dateTime(incident.at) : 'Time not recorded';
  const agoFormatted = incident.at ? timeAgo(incident.at) : null;
  const fileName = incident.fileName || enrichment?.fileName || null;
  const cost = incident.amount ?? enrichment?.cost ?? null;
  const pageCount = incident.pageCount ?? enrichment?.pageCount ?? null;
  const colorMode = incident.colorMode ?? enrichment?.colorMode ?? null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const copySummaryReport = () => {
    const lines = [
      `🚨 MIMO Incident Alert: ${typeMeta.label}`,
      `Severity: ${incident.severity.toUpperCase()}`,
      `Kiosk: ${kioskName}`,
      `Date & Time: ${dateFormatted} ${agoFormatted ? `(${agoFormatted})` : ''}`,
      `Reason: ${failureReason}`,
      userName ? `Customer: ${userName}` : '',
      userEmail !== 'Not provided' ? `Email: ${userEmail}` : '',
      userPhone ? `Phone: ${userPhone}` : '',
      incident.jobId ? `Job ID: ${incident.jobId}` : '',
      incident.orderId ? `Order ID: ${incident.orderId}` : '',
      fileName ? `File: ${fileName}` : '',
      cost !== null ? `Amount: ₹${cost}` : '',
      incident.refundStatus ? `Refund Status: ${incident.refundStatus}` : '',
    ].filter(Boolean);

    copyToClipboard(lines.join('\n'), 'summary');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-2xl bg-[var(--surface)] text-[var(--text-1)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[var(--border)] bg-[var(--surface-2)]/30">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center flex-shrink-0 shadow-xs">
              {typeMeta.icon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-[var(--text-1)] truncate">
                  {typeMeta.label}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                    incident.severity === 'high'
                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                      : incident.severity === 'medium'
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                      : 'bg-slate-500/15 text-slate-500 border-slate-500/20'
                  }`}
                >
                  {incident.severity} SEVERITY
                </span>
              </div>
              <p className="text-xs text-[var(--text-3)] truncate mt-0.5">
                Kiosk: <span className="font-semibold text-[var(--text-2)]">{kioskName}</span>
                {incident.jobId && ` · Job #${incident.jobId}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* Diagnostic Failure Banner */}
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 dark:bg-rose-950/20 flex items-start gap-3.5">
            <div className="mt-0.5 p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex-shrink-0">
              <ShieldAlert size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  Failure Reason &amp; Diagnostic Log
                </span>
                <span className="text-[10px] font-medium text-rose-500/80">
                  Automated Alert
                </span>
              </div>
              <p className="text-sm font-semibold text-[var(--text-1)] mt-1 break-words select-text leading-relaxed">
                {failureReason}
              </p>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* User / Customer Details */}
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-1)]">
                <User size={14} className="text-indigo-500" />
                <span>Customer Details</span>
              </div>
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-[11px] text-[var(--text-3)] block">Name</span>
                  <p className="font-semibold text-[var(--text-1)] truncate select-text">
                    {userName}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] text-[var(--text-3)] block">Email</span>
                  <div className="flex items-center gap-1.5 min-w-0 mt-0.5">
                    <Mail size={12} className="text-[var(--text-3)] flex-shrink-0" />
                    <p className="font-medium text-[var(--text-2)] truncate select-text">
                      {userEmail}
                    </p>
                    {userEmail !== 'Not provided' && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(userEmail, 'email')}
                        className="text-[var(--text-3)] hover:text-indigo-500 cursor-pointer ml-auto flex-shrink-0"
                        title="Copy email"
                      >
                        {copiedKey === 'email' ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      </button>
                    )}
                  </div>
                </div>
                {userPhone && (
                  <div>
                    <span className="text-[11px] text-[var(--text-3)] block">Phone</span>
                    <div className="flex items-center gap-1.5 text-[var(--text-2)] font-medium mt-0.5">
                      <Phone size={12} className="text-[var(--text-3)] flex-shrink-0" />
                      <span className="select-text">{userPhone}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Kiosk & Hardware Details */}
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-1)]">
                <MapPin size={14} className="text-emerald-500" />
                <span>Kiosk &amp; Machine</span>
              </div>
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-[11px] text-[var(--text-3)] block">Kiosk Identifier</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="px-2 py-0.5 rounded-lg text-xs font-bold font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      {kioskName}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-[var(--text-3)] block">Date &amp; Time of Failure</span>
                  <div className="flex items-center gap-1.5 text-[var(--text-2)] font-medium mt-0.5">
                    <Clock size={12} className="text-[var(--text-3)] flex-shrink-0" />
                    <span className="select-text">{dateFormatted}</span>
                  </div>
                  {agoFormatted && (
                    <span className="text-[11px] text-[var(--text-3)] block mt-0.5">
                      {agoFormatted}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Print Job & Document Details */}
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 space-y-3 sm:col-span-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-1)]">
                <FileText size={14} className="text-blue-500" />
                <span>Job &amp; Order Identifiers</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {incident.jobId && (
                  <div>
                    <span className="text-[11px] text-[var(--text-3)] block">Job ID</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <code className="px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] font-mono text-[11px] text-[var(--text-1)] select-text break-all">
                        {incident.jobId}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(incident.jobId!, 'jobId')}
                        className="p-1 rounded text-[var(--text-3)] hover:text-indigo-500 cursor-pointer flex-shrink-0"
                        title="Copy Job ID"
                      >
                        {copiedKey === 'jobId' ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                )}
                {incident.orderId && (
                  <div>
                    <span className="text-[11px] text-[var(--text-3)] block">Order ID</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <code className="px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] font-mono text-[11px] text-[var(--text-1)] select-text break-all">
                        {incident.orderId}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(incident.orderId!, 'orderId')}
                        className="p-1 rounded text-[var(--text-3)] hover:text-indigo-500 cursor-pointer flex-shrink-0"
                        title="Copy Order ID"
                      >
                        {copiedKey === 'orderId' ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                )}
                {fileName && (
                  <div className="sm:col-span-2">
                    <span className="text-[11px] text-[var(--text-3)] block">File Name</span>
                    <p className="font-mono text-[11px] text-[var(--text-2)] break-all mt-0.5 select-text">
                      {fileName}
                    </p>
                  </div>
                )}
                {(cost !== null || incident.refundStatus || pageCount !== null || colorMode) && (
                  <div className="sm:col-span-2 flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--border)]/60">
                    {cost !== null && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[var(--surface)] border border-[var(--border)] text-[var(--text-1)]">
                        Cost: {inr(cost)}
                      </span>
                    )}
                    {pageCount !== null && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[var(--surface)] border border-[var(--border)] text-[var(--text-2)]">
                        {pageCount} page{pageCount > 1 ? 's' : ''} {colorMode ? `· ${colorMode.toUpperCase()}` : ''}
                      </span>
                    )}
                    {incident.refundStatus && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        Refund: {incident.refundStatus}
                        {incident.refundAmount ? ` (${inr(incident.refundAmount)})` : ''}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 p-4 sm:p-5 border-t border-[var(--border)] bg-[var(--surface-2)]/40">
          <button
            type="button"
            onClick={copySummaryReport}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-[var(--border)] bg-[var(--surface)] text-[var(--text-1)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
          >
            {copiedKey === 'summary' ? (
              <>
                <Check size={14} className="text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400">Report Copied!</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                <span>Copy Summary</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {onNavigate && incident.tab && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigate(incident.tab);
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                <Cpu size={14} />
                <span>View in Print Operations</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
