import React, { useState } from "react";
import { AlertTriangle, Bell, Check, Loader2, Mail, PowerOff, X, Sparkles } from "lucide-react";
import { useKioskOutage } from "../../utils/useKioskOutage";

interface Props {
  className?: string;
  onColorOutageNotice?: (isColorDown: boolean) => void;
}

export const KioskOutageAlert: React.FC<Props> = ({ className = "", onColorOutageNotice }) => {
  const { outages, loading, subscribeEmail, subscribing, subscribedEmail } = useKioskOutage();
  const [emailInput, setEmailInput] = useState(() => localStorage.getItem("mimo_user_email") || "");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [dismissedScopes, setDismissedScopes] = useState<Record<string, boolean>>({});
  const [showNotifyForm, setShowNotifyForm] = useState(false);
  const [activeScope, setActiveScope] = useState<string>("all");

  React.useEffect(() => {
    if (onColorOutageNotice) {
      onColorOutageNotice(Boolean(outages.mimo2ColorDown || outages.allDown));
    }
  }, [outages.mimo2ColorDown, outages.allDown, onColorOutageNotice]);

  if (loading || !outages.hasActiveOutage) {
    return null;
  }

  const handleSubscribe = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setEmailError(null);
    setSuccessMsg(null);

    const clean = emailInput.trim();
    if (!clean || !clean.includes("@") || !clean.includes(".")) {
      setEmailError("Please enter a valid email address");
      return;
    }

    try {
      await subscribeEmail(clean, activeScope);
      setSuccessMsg(`We'll email you at ${clean} the moment the printer is back online!`);
      localStorage.setItem("mimo_user_email", clean);
      setShowNotifyForm(false);
    } catch (err: any) {
      setEmailError(err.message || "Failed to subscribe. Please try again.");
    }
  };

  /* ─────────────────────────────────────────────────────────────
   * CASE 1: BOTH MACHINES ARE DOWN (GLOBAL OUTAGE)
   * ───────────────────────────────────────────────────────────── */
  if (outages.allDown) {
    return (
      <div className={`my-3 overflow-hidden rounded-[20px] border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 p-4 shadow-sm ${className}`}>
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/60 dark:text-amber-400">
            <PowerOff className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[15px] sm:text-base text-amber-950 dark:text-amber-200">
                Both MIMO Machines are Temporarily Offline
              </span>
              <span className="inline-flex items-center rounded-full bg-amber-200/80 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-amber-900 dark:bg-amber-900 dark:text-amber-200 animate-pulse">
                Maintenance
              </span>
            </div>
            <p className="mt-1 text-[13px] text-amber-900/90 dark:text-amber-300 leading-relaxed">
              Both MIMO 1.0 and MIMO 2.0 are currently undergoing maintenance. We apologize for the inconvenience! We will notify you once the machines are back in working condition.
            </p>

            {outages.customNotice && (
              <p className="mt-2 text-xs font-semibold text-amber-900 dark:text-amber-200 bg-amber-200/40 dark:bg-amber-900/40 p-2 rounded-lg">
                📢 {outages.customNotice}
              </p>
            )}

            {/* Email notification subscribe box */}
            <div className="mt-3 pt-3 border-t border-amber-200/80 dark:border-amber-900/60">
              {successMsg || subscribedEmail ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800">
                  <Check className="size-4 shrink-0 text-emerald-600" />
                  <span>{successMsg || `You're subscribed! We'll email you at ${subscribedEmail} when online.`}</span>
                </div>
              ) : (
                <form onSubmit={handleSubscribe} className="space-y-2">
                  <span className="block text-xs font-semibold text-amber-950 dark:text-amber-200">
                    Get an instant email alert the moment the printers are available:
                  </span>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="Enter your email (e.g. name@reva.edu.in)"
                      className="flex-1 rounded-xl border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      type="submit"
                      disabled={subscribing}
                      className="press inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white px-4 py-2 text-xs font-bold transition-all disabled:opacity-50 shrink-0 cursor-pointer shadow-xs"
                    >
                      {subscribing ? <Loader2 className="size-3.5 animate-spin" /> : <Bell className="size-3.5" />}
                      <span>Notify Me When Available</span>
                    </button>
                  </div>
                  {emailError && <p className="text-[11px] font-semibold text-rose-600">{emailError}</p>}
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────
   * CASE 2: INDIVIDUAL MACHINE OR PRINTER OUTAGES
   * ───────────────────────────────────────────────────────────── */
  const activeAlerts: Array<{
    scope: string;
    title: string;
    description: string;
    tone: string;
  }> = [];

  if (outages.mimo1Down && !dismissedScopes.mimo1) {
    activeAlerts.push({
      scope: "mimo1",
      title: "MIMO 1.0 is currently not working",
      description: "MIMO 1.0 is currently undergoing maintenance. MIMO 2.0 is operational and ready for your prints.",
      tone: "amber",
    });
  }

  if (outages.mimo2ColorDown && !dismissedScopes.mimo2_color) {
    activeAlerts.push({
      scope: "mimo2_color",
      title: "MIMO 2.0 Colour printer is currently not working",
      description: "The colour printer on MIMO 2.0 is currently under maintenance. Black & white printing is available on both MIMO 1.0 and MIMO 2.0.",
      tone: "purple",
    });
  }

  if (outages.mimo2BwDown && !dismissedScopes.mimo2_bw) {
    activeAlerts.push({
      scope: "mimo2_bw",
      title: "MIMO 2.0 Black & White is currently not working",
      description: "Black & white printing on MIMO 2.0 is currently unavailable. Colour printing on MIMO 2.0 and B&W on MIMO 1.0 are operational.",
      tone: "amber",
    });
  }

  if (!activeAlerts.length) {
    return null;
  }

  return (
    <div className={`space-y-2.5 my-3 ${className}`}>
      {activeAlerts.map((alert) => (
        <div
          key={alert.scope}
          className="overflow-hidden rounded-[18px] border border-amber-300/80 bg-amber-50/90 dark:border-amber-900/60 dark:bg-amber-950/30 p-3 sm:p-3.5 shadow-xs transition-all"
        >
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-200/70 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 mt-0.5">
                <AlertTriangle className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-[13.5px] text-amber-950 dark:text-amber-200">
                    {alert.title}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-amber-200/60 dark:bg-amber-900/40 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                    Temporary Issue
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-amber-900/80 dark:text-amber-300/90 leading-normal">
                  {alert.description}
                </p>

                {/* Notify Me trigger */}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveScope(alert.scope);
                      setShowNotifyForm(showNotifyForm && activeScope === alert.scope ? false : true);
                    }}
                    className="press inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 dark:text-amber-300 hover:underline cursor-pointer"
                  >
                    <Bell className="size-3 text-amber-600" />
                    <span>Notify me when working</span>
                  </button>
                </div>

                {/* Inline notification subscribe form */}
                {showNotifyForm && activeScope === alert.scope && (
                  <form onSubmit={handleSubscribe} className="mt-2.5 pt-2 border-t border-amber-200/80 dark:border-amber-900/50 space-y-1.5 animate-fadeIn">
                    <span className="block text-[11px] font-semibold text-amber-900 dark:text-amber-200">
                      We'll send an email once {alert.title.toLowerCase().replace(" is currently not working", "")} is back:
                    </span>
                    <div className="flex gap-1.5">
                      <input
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="Enter your email"
                        className="flex-1 rounded-lg border border-amber-300 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs text-ink placeholder:text-ink-3 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={subscribing}
                        className="press inline-flex items-center gap-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {subscribing ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                        <span>Submit</span>
                      </button>
                    </div>
                    {emailError && <p className="text-[10.5px] font-semibold text-rose-600">{emailError}</p>}
                    {successMsg && <p className="text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-300">{successMsg}</p>}
                  </form>
                )}
              </div>
            </div>

            {/* Dismiss button */}
            <button
              type="button"
              aria-label="Dismiss alert"
              onClick={() => setDismissedScopes((prev) => ({ ...prev, [alert.scope]: true }))}
              className="press flex size-6 shrink-0 items-center justify-center rounded-full text-amber-700/60 hover:text-amber-900 hover:bg-amber-200/40 dark:text-amber-400 dark:hover:bg-amber-900/40 cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
