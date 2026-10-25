import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Cpu,
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
    icon: <FileWarning className="w-4 h-4 text-rose-500" />,
    color: 'rose',
  },
  kiosk_offline: {
    label: 'Kiosk Offline Alert',
    icon: <WifiOff className="w-4 h-4 text-rose-500" />,
    color: 'rose',
  },
  paper_low: {
    label: 'Paper Low Alert',
    icon: <PackageOpen className="w-4 h-4 text-amber-500" />,
    color: 'amber',
  },
  supply_low: {
    label: 'Toner/Ink Low Alert',
    icon: <PackageOpen className="w-4 h-4 text-amber-500" />,
    color: 'amber',
  },
  refund_request: {
    label: 'Refund Request',
    icon: <RotateCcw className="w-4 h-4 text-indigo-500" />,
    color: 'indigo',
  },
};

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

  // Background enrichment if needed
  useEffect(() => {
    setEnrichment(null);
    if (!incident || !incident.jobId) return;
    if (incident.userEmail && incident.userEmail !== 'Guest' && incident.userName && incident.colorMode) return;

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
    icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
    color: 'amber',
  };

  const userName =
    incident.userName ||
    enrichment?.userName ||
    extractNameFallback(incident) ||
    (incident.userId ? 'Registered Customer' : 'Guest Customer');

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
  const pageCount = incident.pageCount ?? enrichment?.pageCount ?? 1;
  const rawColor = incident.colorMode || enrichment?.colorMode || 'bw';
  const isColor = rawColor.toLowerCase() === 'color' || rawColor.toLowerCase() === 'colour';

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
      `Printer Mode: ${isColor ? 'Colour Printer' : 'Black & White (B&W)'}`,
      `Pages Uploaded: ${pageCount}`,
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-3xl bg-[var(--surface)] text-[var(--text-1)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-5 sm:py-3.5 border-b border-[var(--border)] bg-[var(--surface-2)]/30">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center flex-shrink-0 shadow-xs">
              {typeMeta.icon}
            </div>
            <div className="min-w-0 flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold text-[var(--text-1)] truncate">
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
                {incident.severity}
              </span>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                {kioskName}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body - Designed to fit completely without scrolling */}
        <div className="p-3.5 sm:p-5 space-y-3 overflow-y-auto">
          {/* Diagnostic Failure Banner */}
          <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/5 dark:bg-rose-950/20 flex items-start gap-2.5">
            <div className="mt-0.5 p-1 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 flex-shrink-0">
              <ShieldAlert size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 block">
                Failure Reason &amp; Diagnostic Log
              </span>
              <p className="text-xs sm:text-sm font-semibold text-[var(--text-1)] mt-0.5 break-words select-text leading-snug">
                {failureReason}
              </p>
            </div>
          </div>

          {/* 3-Column Balanced Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Column 1: Customer Details */}
            <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-1)] pb-1 border-b border-[var(--border)]/50">
                <User size={13} className="text-indigo-500" />
                <span>Customer Profile</span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--text-3)] block">Name</span>
                  <p className="font-semibold text-[var(--text-1)] truncate select-text">
                    {userName}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--text-3)] block">Email</span>
                  <div className="flex items-center gap-1 min-w-0 mt-0.5">
                    <Mail size={11} className="text-[var(--text-3)] flex-shrink-0" />
                    <p className="font-medium text-[var(--text-2)] text-[11px] truncate select-text">
                      {userEmail}
                    </p>
                    {userEmail !== 'Not provided' && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(userEmail, 'email')}
                        className="text-[var(--text-3)] hover:text-indigo-500 cursor-pointer ml-auto flex-shrink-0 p-0.5"
                        title="Copy email"
                      >
                        {copiedKey === 'email' ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                      </button>
                    )}
                  </div>
                </div>
                {userPhone && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[var(--text-3)] block">Phone</span>
                    <div className="flex items-center gap-1 text-[var(--text-2)] font-medium text-[11px] mt-0.5">
                      <Phone size={11} className="text-[var(--text-3)] flex-shrink-0" />
                      <span className="select-text">{userPhone}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Column 2: Kiosk & Failure Time */}
            <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-1)] pb-1 border-b border-[var(--border)]/50">
                <MapPin size={13} className="text-emerald-500" />
                <span>Kiosk &amp; Time</span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--text-3)] block">Failed Kiosk</span>
                  <p className="font-bold font-mono text-emerald-600 dark:text-emerald-400 text-sm mt-0.5">
                    {kioskName}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--text-3)] block">Date &amp; Time of Failure</span>
                  <div className="flex items-center gap-1 text-[var(--text-2)] font-medium text-[11px] mt-0.5">
                    <Clock size={11} className="text-[var(--text-3)] flex-shrink-0" />
                    <span className="select-text">{dateFormatted}</span>
                  </div>
                  {agoFormatted && (
                    <span className="text-[10px] text-[var(--text-3)] block">
                      {agoFormatted}
                    </span>
                  )}
                </div>
                {fileName && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[var(--text-3)] block">File Name</span>
                    <p className="font-mono text-[11px] text-[var(--text-2)] truncate mt-0.5 select-text" title={fileName}>
                      {fileName}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Column 3: Print Mode & Pages Uploaded (Requested Focus!) */}
            <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-1)] pb-1 border-b border-[var(--border)]/50">
                <Printer size={13} className="text-blue-500" />
                <span>Print Specs &amp; Type</span>
              </div>
              <div className="space-y-2 text-xs">
                {/* Black & White vs Colour Badge */}
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

                {/* Number of Pages Uploaded */}
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--text-3)] block mb-1">
                    Pages Uploaded
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25">
                    <Layers size={12} />
                    {pageCount} {pageCount === 1 ? 'Page' : 'Pages'} Uploaded
                  </span>
                </div>

                {/* Cost & Refund Status */}
                {(cost !== null || incident.refundStatus) && (
                  <div className="flex items-center gap-2 pt-1">
                    {cost !== null && (
                      <span className="text-xs font-bold text-[var(--text-1)]">
                        {inr(cost)}
                      </span>
                    )}
                    {incident.refundStatus && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        {incident.refundStatus}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Identifiers Strip */}
          <div className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/20 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {incident.jobId && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-3)]">Job ID:</span>
                  <code className="px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] font-mono text-[11px] text-[var(--text-1)] select-text">
                    {incident.jobId}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(incident.jobId!, 'jobId')}
                    className="p-0.5 rounded text-[var(--text-3)] hover:text-indigo-500 cursor-pointer"
                    title="Copy Job ID"
                  >
                    {copiedKey === 'jobId' ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                  </button>
                </div>
              )}
              {incident.orderId && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-3)]">Order ID:</span>
                  <code className="px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] font-mono text-[11px] text-[var(--text-1)] select-text">
                    {incident.orderId}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(incident.orderId!, 'orderId')}
                    className="p-0.5 rounded text-[var(--text-3)] hover:text-indigo-500 cursor-pointer"
                    title="Copy Order ID"
                  >
                    {copiedKey === 'orderId' ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Compact Footer */}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 sm:px-5 sm:py-3 border-t border-[var(--border)] bg-[var(--surface-2)]/40">
          <button
            type="button"
            onClick={copySummaryReport}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--border)] bg-[var(--surface)] text-[var(--text-1)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
          >
            {copiedKey === 'summary' ? (
              <>
                <Check size={13} className="text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy size={13} />
                <span>Copy Summary</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            {onNavigate && incident.tab && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigate(incident.tab);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                <Cpu size={13} />
                <span>View Operations</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
