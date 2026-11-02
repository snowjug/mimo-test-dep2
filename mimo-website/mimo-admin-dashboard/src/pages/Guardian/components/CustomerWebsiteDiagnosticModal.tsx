import React, { useState } from 'react';
import { X, Globe, AlertTriangle, CheckCircle2, Mail, RefreshCw, Send, Check, ShieldCheck, MapPin, Clock } from 'lucide-react';
import { guardian } from '../../../services/guardian.service';
import type { WebsiteHealthResponse } from '../../../types/guardian.types';

interface Props {
  health: WebsiteHealthResponse | null;
  onClose: () => void;
  onRefresh: () => void;
}

export const CustomerWebsiteDiagnosticModal: React.FC<Props> = ({ health, onClose, onRefresh }) => {
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailStatusMsg, setEmailStatusMsg] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const isGood = health?.isGood ?? true;
  const problem = health?.problem || 'No active disruptions detected on the customer website.';
  const location = health?.location || 'Customer Web Portal (printmimo.tech)';
  const details = health?.details || 'All frontend routes, Cloud Storage upload handlers, and serverless APIs are operating within normal parameters.';
  const checkedAtTime = health?.checkedAt ? new Date(health.checkedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Just now';

  const handleSendAlertEmail = async () => {
    try {
      setSendingEmail(true);
      setEmailStatusMsg(null);
      const res = await guardian.sendWebsiteAlert({
        problem: health?.problem || 'Manual Diagnostic Report Triggered from Edge Guardian',
        location: health?.location || 'Customer Web Portal (printmimo.tech)',
        details: health?.details || 'All diagnostic probes verified from admin command center.',
      });
      setEmailSent(true);
      setEmailStatusMsg(`Alert email successfully dispatched to ${res.recipient || 'visionprintt@gmail.com'}`);
    } catch (err: any) {
      setEmailStatusMsg(err?.message || 'Failed to send alert email. Please check internet connection.');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleResolve = async () => {
    try {
      setResolving(true);
      await guardian.resolveWebsiteIssues();
      onRefresh();
    } catch (err: any) {
      console.error('Failed to resolve incidents:', err);
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-xl rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[var(--border)] bg-[var(--surface-1)]">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${isGood ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'}`}>
              <Globe size={18} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-[var(--text-1)]">
                Customer Website Diagnostics
              </h2>
              <p className="text-xs text-[var(--text-3)]">
                Real-time condition, error isolation & alert management
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* Main Status Banner */}
          <div
            className={`p-4 rounded-xl border flex items-start gap-3.5 ${
              isGood
                ? 'bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/50'
                : 'bg-rose-50/70 border-rose-200 dark:bg-rose-950/25 dark:border-rose-800/60'
            }`}
          >
            <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {isGood ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span
                  className={`text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                    isGood
                      ? 'bg-emerald-200/60 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
                      : 'bg-rose-200/70 text-rose-800 dark:bg-rose-900/70 dark:text-rose-200'
                  }`}
                >
                  {isGood ? 'Status: Good / Operational' : 'Status: Issue Detected'}
                </span>
                <span className="text-[11px] text-[var(--text-3)] flex items-center gap-1">
                  <Clock size={11} /> Checked {checkedAtTime} IST
                </span>
              </div>

              {!isGood && (
                <div className="mt-3 space-y-2">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                      What is the problem:
                    </span>
                    <p className="text-sm font-semibold text-rose-950 dark:text-rose-100 mt-0.5">
                      {problem}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300 flex items-center gap-1">
                      <MapPin size={11} /> Where the problem occurs:
                    </span>
                    <p className="text-xs font-mono font-medium text-rose-900 dark:text-rose-200 mt-0.5 bg-rose-100/60 dark:bg-rose-900/40 px-2 py-1 rounded inline-block">
                      {location}
                    </p>
                  </div>
                </div>
              )}

              {isGood && (
                <p className="text-xs text-emerald-900 dark:text-emerald-200 mt-2 leading-relaxed">
                  The customer website (https://printmimo.tech) is responsive and operating normally. Customers can upload documents, configure print settings, and complete printing without issues.
                </p>
              )}
            </div>
          </div>

          {/* Technical Diagnostic Details */}
          <div className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface-1)]">
            <h3 className="text-xs font-bold text-[var(--text-1)] uppercase tracking-wider flex items-center gap-1.5 mb-3">
              <ShieldCheck size={14} className="text-[var(--primary)]" />
              Subsystem Diagnostic Breakdown
            </h3>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <span className="font-medium text-[var(--text-1)]">1. Web Host (https://printmimo.tech)</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${health?.checks?.frontend?.ok ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300' : 'text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300'}`}>
                  {health?.checks?.frontend?.message || 'Healthy'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <span className="font-medium text-[var(--text-1)]">2. Serverless Backend & Database</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${health?.checks?.database?.ok ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300' : 'text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300'}`}>
                  {health?.checks?.database?.message || 'Connected'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <span className="font-medium text-[var(--text-1)]">3. Cloud Storage Upload Service</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${health?.checks?.storage?.ok ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300' : 'text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300'}`}>
                  {health?.checks?.storage?.message || 'Available'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <span className="font-medium text-[var(--text-1)]">4. Customer Browser Sessions & Telemetry</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${health?.checks?.clientTelemetry?.ok ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300' : 'text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300'}`}>
                  {health?.checks?.clientTelemetry?.ok ? '0 Errors Reported' : `${health?.checks?.clientTelemetry?.activeIncidents || 1} Issue(s) Reported`}
                </span>
              </div>
            </div>

            {/* Additional Evidence or Details */}
            {details && (
              <div className="mt-3 pt-3 border-t border-[var(--border)]">
                <p className="text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider mb-1">
                  Evidence & Log Detail:
                </p>
                <p className="text-xs text-[var(--text-2)] font-mono whitespace-pre-wrap break-words bg-[var(--surface)] p-2.5 rounded-lg border border-[var(--border)]">
                  {details}
                </p>
              </div>
            )}
          </div>

          {/* Email Notification Card */}
          <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Mail size={15} className="text-[var(--primary)]" />
                <span className="text-xs font-bold text-[var(--text-1)]">
                  MIMO Operations Alert Email
                </span>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--border)]">
                visionprintt@gmail.com
              </span>
            </div>
            <p className="text-xs text-[var(--text-2)] leading-relaxed">
              When an issue occurs on the customer website, Edge Guardian automatically dispatches a diagnostic alert to the MIMO team containing what went wrong and where it occurred.
            </p>

            {emailStatusMsg && (
              <div className={`p-2.5 rounded-lg text-xs font-medium ${emailSent ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'}`}>
                {emailStatusMsg}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <button
                type="button"
                onClick={handleSendAlertEmail}
                disabled={sendingEmail}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground,white)] hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
              >
                {sendingEmail ? <RefreshCw size={13} className="animate-spin" /> : emailSent ? <Check size={13} /> : <Send size={13} />}
                <span>{sendingEmail ? 'Dispatching...' : emailSent ? 'Email Alert Dispatched' : 'Send Alert Email to MIMO'}</span>
              </button>

              {!isGood && (
                <button
                  type="button"
                  onClick={handleResolve}
                  disabled={resolving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {resolving ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  <span>{resolving ? 'Resolving...' : 'Mark as Resolved'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer ml-auto"
              >
                <RefreshCw size={12} /> Re-check Now
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end p-4 border-t border-[var(--border)] bg-[var(--surface-1)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-1)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
          >
            Close Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
};

