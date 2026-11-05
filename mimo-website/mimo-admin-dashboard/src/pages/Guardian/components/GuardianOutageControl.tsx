import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  BellRing,
  Loader2,
  Printer,
  Sparkles,
  Info,
  Radio,
  Mail,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { guardian } from '../../../services/guardian.service';
import type { KioskOutageStatus, KioskOutageUpdate } from '../../../types/guardian.types';

interface Props {
  onStatusChange?: (status: KioskOutageStatus) => void;
}

export const GuardianOutageControl: React.FC<Props> = ({ onStatusChange }) => {
  const [data, setData] = useState<KioskOutageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const res = await guardian.getOutages();
      setData(res);
      if (onStatusChange) onStatusChange(res);
    } catch (err: any) {
      console.error('Failed to load outage status', err);
      setFeedback({ message: 'Failed to load outage settings', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleToggle = async (key: keyof KioskOutageUpdate, currentVal: boolean, label: string) => {
    const newVal = !currentVal;
    setSavingKey(key);
    setFeedback(null);

    try {
      const updatePayload: KioskOutageUpdate = { [key]: newVal };
      const updated = await guardian.updateOutages(updatePayload);
      setData(updated);
      if (onStatusChange) onStatusChange(updated);

      if (newVal) {
        setFeedback({
          message: `Alert enabled: Customer site now shows "${label} is not in working condition".`,
          type: 'success',
        });
      } else {
        const sentMsg = updated.pendingSubscribers !== undefined ? '' : '';
        setFeedback({
          message: `${label} marked operational! Waiting customers will receive an email notification.`,
          type: 'success',
        });
      }
    } catch (err: any) {
      console.error('Failed to toggle outage status', err);
      setFeedback({
        message: err.message || 'Failed to update outage status. Please retry.',
        type: 'error',
      });
    } finally {
      setSavingKey(null);
    }
  };

  const controls = [
    {
      key: 'mimo1Down' as const,
      label: 'MIMO 1.0 (CV-001)',
      description: 'Customer site shows popup that MIMO 1.0 is currently not working.',
      isDown: Boolean(data?.mimo1Down),
      colorTone: 'amber',
    },
    {
      key: 'mimo2BwDown' as const,
      label: 'MIMO 2.0 Black & White Printer',
      description: 'Customer site shows popup that MIMO 2.0 Black & White is not working.',
      isDown: Boolean(data?.mimo2BwDown),
      colorTone: 'amber',
    },
    {
      key: 'mimo2ColorDown' as const,
      label: 'MIMO 2.0 Colour Printer (Epson)',
      description: 'Customer site shows popup that MIMO 2.0 Colour printer is not working.',
      isDown: Boolean(data?.mimo2ColorDown),
      colorTone: 'purple',
    },
    {
      key: 'allDown' as const,
      label: 'Both Machines (All Kiosks Offline)',
      description: 'Customer site displays full maintenance popup: both machines are off, offering email notification upon return.',
      isDown: Boolean(data?.allDown),
      colorTone: 'rose',
    },
  ];

  const hasAnyOutage = Boolean(
    data?.allDown || data?.mimo1Down || data?.mimo2BwDown || data?.mimo2ColorDown
  );

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex size-10 items-center justify-center rounded-xl ${
              hasAnyOutage
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {hasAnyOutage ? <AlertTriangle className="size-5" /> : <Printer className="size-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[var(--text-1)]">
                Customer Website Outage &amp; Popup Control
              </h3>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  hasAnyOutage
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 animate-pulse'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                }`}
              >
                <span className={`size-1.5 rounded-full ${hasAnyOutage ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                {hasAnyOutage ? 'Popup Active on Customer Site' : 'Fleet Fully Operational'}
              </span>
            </div>
            <p className="text-xs text-[var(--text-3)] mt-0.5">
              Control the customer-facing warning popups on printmimo.tech. Toggling a machine back to operational automatically sends an email to waiting customers.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors cursor-pointer"
          >
            <Eye className="size-3.5" />
            <span>{showPreview ? 'Hide Customer Preview' : 'Preview Popup'}</span>
          </button>
          <button
            type="button"
            onClick={loadStatus}
            disabled={loading}
            className="p-1.5 rounded-xl text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            title="Refresh status"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`flex items-center justify-between p-3 rounded-xl text-xs font-semibold transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="opacity-70 hover:opacity-100 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* The 4 Outage Toggle Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {controls.map((c) => {
          const isSaving = savingKey === c.key;
          return (
            <div
              key={c.key}
              className={`p-3.5 sm:p-4 rounded-xl border transition-all flex flex-col justify-between ${
                c.isDown
                  ? 'border-amber-300 bg-amber-500/5 dark:border-amber-700/60 dark:bg-amber-950/20'
                  : 'border-[var(--border)] bg-[var(--surface-2)]/40 hover:bg-[var(--surface-2)]/70'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-[var(--text-1)]">{c.label}</span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                      c.isDown
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                    }`}
                  >
                    <span className={`size-1.5 rounded-full ${c.isDown ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'}`} />
                    {c.isDown ? 'Out of Service' : 'Working / Operational'}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-3)] mt-1.5 leading-relaxed">{c.description}</p>
              </div>

              {/* Action Button / Switch */}
              <div className="mt-3.5 pt-2.5 border-t border-[var(--border)] flex items-center justify-between">
                <span className="text-[11.5px] font-medium text-[var(--text-3)]">
                  {c.isDown ? 'Click to mark resolved & notify customers' : 'Click to enable customer warning popup'}
                </span>
                <button
                  type="button"
                  disabled={isSaving || loading}
                  onClick={() => handleToggle(c.key, c.isDown, c.label)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50 ${
                    c.isDown
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                      : 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                  }`}
                >
                  {isSaving && <Loader2 className="size-3.5 animate-spin" />}
                  <span>{c.isDown ? 'Turn Back ON (Operational)' : 'Turn OFF (Mark Not Working)'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Subscribed Customers info strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--border)] text-xs text-[var(--text-2)]">
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-brand text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span>
            <strong>{data?.pendingSubscribers ?? 0} customer(s)</strong> have requested an email notification when machines are back online.
          </span>
        </div>
        <span className="text-[11px] text-[var(--text-3)]">
          Last updated: {data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString() : 'Never'}
        </span>
      </div>

      {/* Live Preview Box */}
      {showPreview && (
        <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 dark:border-indigo-900/60 dark:bg-indigo-950/20 text-xs space-y-2">
          <div className="flex items-center justify-between font-bold text-indigo-900 dark:text-indigo-300">
            <span>Customer Website Live Preview (What users see on printmimo.tech):</span>
            <span className="text-[10px] uppercase tracking-wider text-indigo-600">Simulated View</span>
          </div>
          {hasAnyOutage ? (
            <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-200">
                <AlertTriangle className="size-4 text-amber-600" />
                <span>
                  {data?.allDown
                    ? 'Both MIMO Machines are Temporarily Offline'
                    : data?.mimo1Down
                    ? 'MIMO 1.0 is currently not working'
                    : data?.mimo2ColorDown
                    ? 'MIMO 2.0 Colour printer is currently not working'
                    : 'MIMO 2.0 Black & White is currently not working'}
                </span>
              </div>
              <p className="text-amber-800 dark:text-amber-300 text-[11.5px]">
                {data?.allDown
                  ? 'Both MIMO 1.0 and MIMO 2.0 machines are undergoing maintenance. Enter your email to be notified when available.'
                  : data?.mimo1Down
                  ? 'MIMO 1.0 is currently offline. MIMO 2.0 is operational and ready for your prints.'
                  : data?.mimo2ColorDown
                  ? 'MIMO 2.0 Colour printer is currently not working. Black & white is available on both MIMO 1.0 & 2.0.'
                  : 'MIMO 2.0 Black & White is currently not working. Colour printing on MIMO 2.0 is operational.'}
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/50 flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
              <CheckCircle2 className="size-4 text-emerald-600" />
              <span>No popups active. Customers see standard operational upload view.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
