import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Check, MessageCircle, ShieldCheck, Printer, FileText, ChevronRight, Loader2, ArrowRight } from "lucide-react";
import { MimoHeader } from "../components/mimo-header";
import { AdBanner } from "../components/AdBanner";
import { toast } from "sonner";

export function PrintCode() {
  const navigate = useNavigate();
  const [printCode, setPrintCode] = useState(() => {
    let code = sessionStorage.getItem("printCode") || "";
    if (!code) {
      const ts = parseInt(localStorage.getItem("mimo_printCode_ts") || "0", 10);
      const age = Date.now() - ts;
      if (age < 30 * 60 * 1000) {
        code = localStorage.getItem("mimo_printCode") || "";
        if (code) {
          sessionStorage.setItem("printCode", code);
          const kioskId = localStorage.getItem("mimo_directKioskId") || "";
          if (kioskId) sessionStorage.setItem("directKioskId", kioskId);
        }
      }
      localStorage.removeItem("mimo_printCode");
      localStorage.removeItem("mimo_printCode_ts");
      localStorage.removeItem("mimo_directKioskId");
    }
    return code;
  });

  const [isProcessing, setIsProcessing] = useState(() => {
    const storedCode = sessionStorage.getItem("printCode");
    return !storedCode;
  });
  const [printStatus, setPrintStatus] = useState<"paid" | "printing" | "completed" | "failed">(
    () => (sessionStorage.getItem("printStatus") as any) || "paid"
  );
  const [sheetsInfo, setSheetsInfo] = useState<{ completed: number; total: number } | null>(null);
  const [isPrinted, setIsPrinted] = useState(false);
  const [printProgress, setPrintProgress] = useState(8);
  const [refundRequested, setRefundRequested] = useState(false);
  const [refundLoading, setRefundLoading] = useState(false);

  useEffect(() => {
    if (!printCode) {
      navigate("/");
      return;
    }

    window.history.pushState({ isPrintCodePage: true }, "", window.location.href);

    const handlePopState = () => {
      toast.success("Your code has been sent to your mail.");
      sessionStorage.removeItem("printCode");
      sessionStorage.removeItem("printFiles");
      sessionStorage.removeItem("printOptions");
      sessionStorage.removeItem("uploadedImages");
      sessionStorage.removeItem("uploadAmount");
      sessionStorage.removeItem("uploadTotalPages");
      sessionStorage.removeItem("totalPages");
      sessionStorage.removeItem("printStatus");

      setTimeout(() => {
        navigate("/upload", { replace: true });
      }, 100);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [printCode, navigate]);

  useEffect(() => {
    if (!printCode || printStatus === "completed" || printStatus === "failed") return;

    const checkStatus = async () => {
      try {
        const apiUrl = "https://api-upqxuj7evq-uc.a.run.app";
        const res = await fetch(`${apiUrl}/kiosk/job-status?printCode=${printCode}`);
        const data = await res.json();

        if (data.status) {
          const rawStatus = (data.status || "").toLowerCase();
          const pStatus = (data.printerStatus || "").toLowerCase();

          if (rawStatus === "failed" || pStatus.includes("error") || pStatus.includes("jam")) {
            setPrintStatus("failed");
            sessionStorage.setItem("printStatus", "failed");
            return;
          }

          if (data.isPrinted === true || rawStatus === "printed" || rawStatus === "completed") {
            setIsPrinted(true);
            setPrintStatus("completed");
            setPrintProgress(100);
            sessionStorage.setItem("printStatus", "completed");
            return;
          }

          if (rawStatus === "printing" || pStatus.includes("printing")) {
            setPrintStatus("printing");
            sessionStorage.setItem("printStatus", "printing");
            setIsProcessing(false);
          } else if (rawStatus === "paid" || rawStatus === "ready") {
            setPrintStatus("paid");
            setIsProcessing(false);
          }

          if (data.sheetsPrinted !== undefined && data.totalPages !== undefined) {
            setSheetsInfo({ completed: data.sheetsPrinted, total: data.totalPages });
          }
        }
      } catch (err) {
        console.error("Telemetry poll failed", err);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, [printCode, printStatus]);

  useEffect(() => {
    if (printStatus === "completed" || isPrinted) {
      setPrintProgress(100);
      return;
    }
    if (printStatus === "paid") {
      setPrintProgress((prev) => Math.max(prev, 8));
      return;
    }
    if (printStatus === "failed") {
      return;
    }
    if (printStatus === "printing") {
      if (sheetsInfo && sheetsInfo.total > 0) {
        const frac = sheetsInfo.completed / sheetsInfo.total;
        const computed = Math.min(98, Math.max(15, Math.round(frac * 100)));
        setPrintProgress((prev) => Math.max(prev, computed));
      } else {
        setPrintProgress((prev) => Math.max(prev, 25));
      }
    }
  }, [printStatus, isProcessing, sheetsInfo, isPrinted]);

  const handleRequestRefund = async () => {
    const orderId = sessionStorage.getItem("orderId");
    if (!orderId) {
      toast.error("Order ID not found. Please contact support.");
      return;
    }
    setRefundLoading(true);
    try {
      const apiUrl = "https://api-upqxuj7evq-uc.a.run.app";
      const token = localStorage.getItem("jwtToken");
      const res = await fetch(`${apiUrl}/request-refund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ orderId, reason: "Print failed at kiosk" }),
      });
      const data = await res.json();
      if (res.ok) {
        setRefundRequested(true);
        toast.success("Refund request submitted! We'll process it within 24–48 hours.");
      } else {
        toast.error(data.error || "Failed to submit refund request.");
      }
    } catch {
      toast.error("Network error. Please try again or contact support.");
    } finally {
      setRefundLoading(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(printCode);
    toast.success("Code copied to clipboard!");
  };

  const handleDone = () => {
    sessionStorage.removeItem("printCode");
    sessionStorage.removeItem("printFiles");
    sessionStorage.removeItem("printOptions");
    sessionStorage.removeItem("uploadedImages");
    sessionStorage.removeItem("uploadAmount");
    sessionStorage.removeItem("uploadTotalPages");
    sessionStorage.removeItem("totalPages");
    sessionStorage.removeItem("printStatus");
    navigate("/upload");
  };

  const codeDigits = (printCode || "0000").slice(0, 4).padEnd(4, "-").split("");

  return (
    <div className="min-h-[100dvh] bg-canvas px-4 pb-36">
      {/* ── Standard MIMO Header ── */}
      <MimoHeader />

      {/* ── Hero Code Section + Mascot ── */}
      <div className="rise-in pt-3 pb-6">
        <div className="relative flex items-center justify-between">
          <div className="flex-1">
            <p className="text-[14px] font-semibold text-ink-3">You're all set!</p>

            {/* 4 large code digits */}
            <div className="mt-3 flex items-center gap-2.5" data-tour="print-code-display">
              {codeDigits.map((digit, i) => (
                <div
                  key={i}
                  className="flex size-14 sm:size-16 items-center justify-center rounded-[18px] bg-blue-50/80 border border-blue-200/70 shadow-xs"
                >
                  <span className="text-[34px] sm:text-[40px] font-extrabold tabular-nums leading-none text-brand">
                    {digit}
                  </span>
                </div>
              ))}
            </div>

            {/* Copy code button */}
            <div className="mt-4">
              <button
                type="button"
                onClick={handleCopyCode}
                className="press inline-flex items-center gap-2 rounded-full bg-brand hover:bg-brand-press px-6 py-2.5 text-[14px] font-bold text-white shadow-sm shadow-brand/20"
              >
                <Copy className="size-4" /> Copy code
              </button>
            </div>
            <p className="mt-2 text-[12px] text-ink-3">Enter this code on the MIMO keypad.</p>
          </div>

          {/* 3D MIMO Mascot */}
          <div className="relative size-[92px] sm:size-[104px] shrink-0 ml-2">
            <img
              src="/images/mimo-mascot.png?v=3"
              alt="MIMO Mascot"
              className="size-full object-contain drop-shadow-md select-none pointer-events-none"
              draggable={false}
            />
          </div>
        </div>
      </div>

      {/* ── Card 1: Printing your document ── */}
      <section className="mb-5" aria-label="Printing status">
        <div className="rounded-[20px] bg-surface p-4 border border-hairline shadow-xs">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-ink">
              {printStatus === "completed"
                ? "Document printed"
                : printStatus === "failed"
                ? "Print stopped"
                : "Printing your document"}
            </h2>
            <span className="text-[14px] font-extrabold tabular-nums text-brand">
              {Math.round(printProgress)}%
            </span>
          </div>

          {/* Stepper track */}
          <div className="relative mb-3 px-4">
            {/* Background line connecting center of Step 1 (34px) to Step 3 (parent width - 34px) */}
            <div className="absolute left-[34px] right-[34px] top-[18px] -translate-y-1/2 h-[3px] bg-surface-2 rounded-full overflow-hidden">
              {/* Progress line */}
              <div
                className="h-full bg-brand rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${Math.min(100, Math.max(0, printProgress))}%`,
                }}
              />
            </div>

            <div className="relative flex items-center justify-between">
              {/* Step 1: Paid */}
              <div className="flex flex-col items-center">
                <span className="relative z-10 flex size-9 items-center justify-center rounded-full bg-brand text-white shadow-xs">
                  <Check className="size-4" strokeWidth={3} />
                </span>
                <span className="mt-1.5 text-[12px] font-semibold text-ink">Paid</span>
              </div>

              {/* Step 2: Printing */}
              <div className="flex flex-col items-center">
                <span
                  className={`relative z-10 flex size-9 items-center justify-center rounded-full transition-all ${
                    printStatus === "completed"
                      ? "bg-brand text-white shadow-xs"
                      : printStatus === "printing"
                      ? "bg-brand text-white shadow-xs ring-4 ring-brand/20 animate-pulse"
                      : printProgress > 0
                      ? "bg-blue-50 text-brand border border-blue-200/80 shadow-xs"
                      : "bg-surface-2 text-ink-4 border border-hairline"
                  }`}
                >
                  {printStatus === "completed" ? (
                    <Check className="size-4" strokeWidth={3} />
                  ) : (
                    <Printer className="size-4" />
                  )}
                </span>
                <span
                  className={`mt-1.5 text-[12px] transition-colors ${
                    printStatus === "printing"
                      ? "font-bold text-brand"
                      : printStatus === "completed" || printProgress > 0
                      ? "font-semibold text-ink"
                      : "font-semibold text-ink-3"
                  }`}
                >
                  Printing
                </span>
              </div>

              {/* Step 3: Done */}
              <div className="flex flex-col items-center">
                <span
                  className={`relative z-10 flex size-9 items-center justify-center rounded-full transition-all ${
                    printStatus === "completed"
                      ? "bg-emerald-500 text-white shadow-xs ring-4 ring-emerald-100"
                      : "bg-surface-2 text-ink-4 border border-hairline"
                  }`}
                >
                  {printStatus === "completed" ? (
                    <Check className="size-4" strokeWidth={3} />
                  ) : (
                    <FileText className="size-4" />
                  )}
                </span>
                <span
                  className={`mt-1.5 text-[12px] transition-colors ${
                    printStatus === "completed"
                      ? "font-bold text-emerald-700"
                      : "font-semibold text-ink-3"
                  }`}
                >
                  Done
                </span>
              </div>
            </div>
          </div>

          {/* Real-time status caption */}
          <div className="pt-2 border-t border-hairline flex items-center justify-between text-[12px]">
            <div className="flex items-center gap-1.5 text-ink-3">
              {printStatus === "printing" ? (
                <>
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-brand" />
                  </span>
                  <span className="font-medium text-ink">
                    {sheetsInfo && sheetsInfo.total > 0
                      ? `Printing sheet ${sheetsInfo.completed} of ${sheetsInfo.total}…`
                      : "Printing in progress at kiosk…"}
                  </span>
                </>
              ) : printStatus === "completed" ? (
                <span className="font-semibold text-emerald-700">✓ All pages printed! Please collect from tray.</span>
              ) : printStatus === "failed" ? (
                <span className="font-semibold text-rose-600">Print stopped unexpectedly.</span>
              ) : (
                <>
                  <span className="size-2 rounded-full bg-brand/70" />
                  <span className="text-ink-2 font-medium">Ready. Waiting for MIMO kiosk to start…</span>
                </>
              )}
            </div>
            {sheetsInfo && sheetsInfo.total > 0 && (
              <span className="text-ink-4 tabular-nums">
                {sheetsInfo.completed}/{sheetsInfo.total} sheets
              </span>
            )}
          </div>

          {/* Refund CTA if failed */}
          {printStatus === "failed" && (
            <div className="mt-3 rounded-[14px] bg-rose-50 p-3.5 border border-rose-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-bold text-rose-900">Something went wrong at the kiosk</p>
                  <p className="text-[12px] text-rose-700">Refunds are processed in 24–48 hours.</p>
                </div>
                {refundRequested ? (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-[12px] font-semibold text-emerald-800">
                    Requested
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleRequestRefund}
                    disabled={refundLoading}
                    className="press rounded-full bg-rose-600 px-3.5 py-1.5 text-[12px] font-bold text-white shadow-xs"
                  >
                    {refundLoading ? "Submitting…" : "Request refund"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Announcement / Advertisement Banner (ABOVE Privacy) ── */}
      <section className="mb-5" aria-label="Announcements">
        <AdBanner />
      </section>

      {/* ── Privacy & WhatsApp Support ── */}
      <section className="mb-6" aria-label="Support and privacy">
        <div className="overflow-hidden rounded-[20px] bg-surface border border-hairline shadow-xs">
          {/* Privacy row */}
          <div className="flex items-center gap-3.5 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <ShieldCheck className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-ink">Your files stay private</span>
              <span className="text-[12px] text-ink-3">
                Deleted right after printing. Unprinted files are removed after 24 hours.
              </span>
            </div>
            <ChevronRight className="size-4 text-ink-4 shrink-0" />
          </div>

          {/* Contact support row */}
          <a
            href="https://wa.me/919364028349?text=Namastey%20MIMO%20%F0%9F%91%8B%0A%0AI%20need%20some%20assistance%20with%20my%20recent%20print%20order.%20Could%20you%20please%20help%20me%3F"
            target="_blank"
            rel="noopener noreferrer"
            className="press flex items-center gap-3.5 border-t border-hairline p-4 transition-colors active:bg-surface-2"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-purple-50 text-purple-600">
              <MessageCircle className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-ink">Contact support</span>
              <span className="text-[12px] text-ink-3">Chat with us on WhatsApp</span>
            </div>
            <ChevronRight className="size-4 text-ink-4 shrink-0" />
          </a>
        </div>
      </section>

      {/* ── Sticky Bottom Action Bar ── */}
      <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none">
        <div className="pointer-events-auto mx-auto w-full max-w-[440px] border-t border-hairline bg-white/95 backdrop-blur-md px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-lg">
          <button
            type="button"
            onClick={handleDone}
            className="press flex w-full items-center justify-center gap-2 rounded-full bg-brand hover:bg-brand-press py-4 text-[16px] font-bold text-white shadow-lg shadow-brand/20 transition-all"
          >
            <Printer className="size-5" />
            <span>Print something else</span>
            <span className="flex size-6 items-center justify-center rounded-full bg-white/20 text-white ml-1">
              <ChevronRight className="size-4" strokeWidth={2.5} />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
