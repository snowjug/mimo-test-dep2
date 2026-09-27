import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Check, MessageCircle, ShieldCheck } from "lucide-react";
import { MimoHeader } from "../components/mimo-header";
import { Group, PrimaryButton, Row, SecondaryButton, StatusPill } from "../components/mimo/ui";
import { toast } from "sonner";
import { AdSenseBlock } from "../components/AdSenseBlock";

export function PrintCode() {
  const navigate = useNavigate();
  const [printCode, setPrintCode] = useState(() => {
    // Primary: sessionStorage (set within the same browser tab session)
    let code = sessionStorage.getItem("printCode") || "";
    if (!code) {
      // Fallback: localStorage — survives Cashfree UPI redirect on mobile.
      // Only use it if it was stored within the last 30 minutes.
      const ts = parseInt(localStorage.getItem("mimo_printCode_ts") || "0", 10);
      const age = Date.now() - ts;
      if (age < 30 * 60 * 1000) {
        code = localStorage.getItem("mimo_printCode") || "";
        if (code) {
          // Re-populate sessionStorage so the rest of the page works normally
          sessionStorage.setItem("printCode", code);
          const kioskId = localStorage.getItem("mimo_directKioskId") || "";
          if (kioskId) sessionStorage.setItem("directKioskId", kioskId);
        }
      }
      // Always clean up localStorage entry regardless — one-time use
      localStorage.removeItem("mimo_printCode");
      localStorage.removeItem("mimo_printCode_ts");
      localStorage.removeItem("mimo_directKioskId");
    }
    return code;
  });
  const [files, setFiles] = useState<any[]>(() => {
    const storedFiles = sessionStorage.getItem("printFiles");
    if (storedFiles && storedFiles !== "undefined") {
      try {
        return JSON.parse(storedFiles);
      } catch (err) {
        console.error("Failed to parse stored files", err);
      }
    }
    return [];
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
  const [printProgress, setPrintProgress] = useState(0);
  const [refundRequested, setRefundRequested] = useState(false);
  const [refundLoading, setRefundLoading] = useState(false);

  useEffect(() => {
    if (!printCode) {
      navigate("/");
      return;
    }

    // Push a state so that we have an extra entry to "pop" when they press back
    window.history.pushState({ isPrintCodePage: true }, "", window.location.href);

    const handlePopState = (e: PopStateEvent) => {
      // User pressed back button
      toast.success("Your code has been sent to your mail.");
      
      // Clear session storage just like handleDone
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
        
        if (data.totalSheets !== undefined && data.sheetsCompleted !== undefined) {
          const total = Number(data.totalSheets);
          const completed = Number(data.sheetsCompleted);
          if (total > 0) {
            setSheetsInfo({ total, completed });
          }
        }

        if (data.isPrinted) {
          setIsPrinted(true);
        }

        if (data.status && data.status !== printStatus) {
          // If the job is in 'paid' state waiting for the user to enter their code at the kiosk,
          // ignore transient heartbeat/offline warnings so the user can still walk over and print.
          if (printStatus === "paid" && data.status === "failed") {
            console.warn("Ignoring transient failure before print has started:", data.printerStatus);
            return;
          }
          setPrintStatus(data.status);
          sessionStorage.setItem("printStatus", data.status);
          if (data.status === "completed") {
            toast.success("Your document has been printed!");
          } else if (data.status === "failed") {
            toast.error(data.printerStatus || "Print failed. Please contact support.");
          }
        }
      } catch (err) {
        console.error("Failed to check status", err);
      }
    };

    // Run status check immediately on mount to avoid the initial 3-second delay
    checkStatus();

    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, [printCode, printStatus]);

  // Synchronized progress tracking physical sheet cadence
  useEffect(() => {
    if (printStatus === "paid" || isProcessing) {
      setPrintProgress((prev) => Math.max(prev, 8));
      return;
    }
    if (printStatus === "completed" || isPrinted) {
      setPrintProgress(100);
      return;
    }
    if (printStatus === "failed") {
      // Freeze wherever we are
      return;
    }
    if (printStatus === "printing") {
      if (sheetsInfo && sheetsInfo.total > 0) {
        const frac = sheetsInfo.completed / sheetsInfo.total;
        // Strictly capped at 98% while printing; only reaches 100% upon completed status
        const computed = Math.min(98, Math.max(15, Math.round(frac * 100)));
        setPrintProgress((prev) => Math.max(prev, computed));
      } else {
        // Safe non-completing fallback while awaiting first telemetry event
        setPrintProgress((prev) => Math.max(prev, 18));
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
    // Clear ALL session storage to ensure a completely fresh start for next job
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

  const title = isProcessing
    ? "Preparing your print"
    : printStatus === "printing"
    ? "Printing now"
    : printStatus === "completed"
    ? "Printed"
    : printStatus === "failed"
    ? "Print failed"
    : "You're all set";

  const subtitle = isProcessing
    ? "Securing your documents."
    : printStatus === "printing"
    ? sheetsInfo
      ? `Sheet ${sheetsInfo.completed} of ${sheetsInfo.total}. Stay near the kiosk.`
      : "Your pages are coming out at the kiosk."
    : printStatus === "completed"
    ? "Collect your pages from the tray."
    : printStatus === "failed"
    ? "Something went wrong at the kiosk."
    : "Enter this code on the MIMO keypad.";

  const steps = [
    { label: "Paid", done: true },
    { label: "Printing", done: printStatus === "printing" || printStatus === "completed" },
    { label: "Done", done: printStatus === "completed" },
  ];

  const barTone =
    printStatus === "completed" ? "bg-success" : printStatus === "failed" ? "bg-danger" : "bg-brand";

  return (
    <div className="px-4 pb-[max(24px,env(safe-area-inset-bottom))]">
      <MimoHeader />

      <section className="rise-in pt-4 text-center" aria-live="polite">
        <p className="text-[15px] font-medium text-ink-2">{title}</p>
        <button
          type="button"
          onClick={handleCopyCode}
          aria-label={`Print code ${printCode.split("").join(" ")}. Tap to copy.`}
          className="press mx-auto mt-3 block rounded-[24px] px-4"
        >
          <span className="block text-[76px] font-semibold leading-none tracking-[0.12em] tabular-nums text-ink [padding-left:0.12em]">
            {printCode}
          </span>
        </button>
        <button
          type="button"
          onClick={handleCopyCode}
          className="press mx-auto mt-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-[14px] font-medium text-ink"
        >
          <Copy className="size-4" /> Copy code
        </button>
        <p className="mx-auto mt-4 max-w-[30ch] text-[15px] text-ink-2">{subtitle}</p>
      </section>

      <Group className="mt-8" bodyClassName="px-4 py-4">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-medium text-ink">
            {printStatus === "completed" ? "Complete" : printStatus === "failed" ? "Stopped" : printStatus === "printing" ? "Printing" : "Waiting for you at the kiosk"}
          </span>
          <span className="text-[15px] font-semibold tabular-nums text-ink-2">{Math.round(printProgress)}%</span>
        </div>
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuenow={Math.round(printProgress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Print progress"
        >
          <div className={`h-full rounded-full transition-[width] duration-500 ${barTone}`} style={{ width: `${printProgress}%` }} />
        </div>
        <ol className="mt-3 grid grid-cols-3 text-[13px]">
          {steps.map((s, i) => (
            <li
              key={s.label}
              className={`flex items-center gap-1 ${i === 1 ? "justify-center" : i === 2 ? "justify-end" : ""} ${
                s.done && printStatus !== "failed" ? "text-ink" : "text-ink-3"
              }`}
            >
              {s.done && printStatus !== "failed" && <Check className="size-3.5" strokeWidth={2.5} />}
              {s.label}
            </li>
          ))}
        </ol>
      </Group>

      {printStatus === "failed" && (
        <Group className="mt-4" bodyClassName="px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[16px] font-medium text-ink">Get your money back</p>
              <p className="mt-0.5 text-[13px] text-ink-3">Refunds are processed within 24 to 48 hours.</p>
            </div>
            {refundRequested && <StatusPill tone="success">Requested</StatusPill>}
          </div>
          {!refundRequested && (
            <SecondaryButton className="mt-3 text-danger" onClick={handleRequestRefund} loading={refundLoading}>
              Request refund
            </SecondaryButton>
          )}
        </Group>
      )}

      <Group className="mt-6">
        <Row
          icon={<ShieldCheck className="size-5" strokeWidth={1.75} />}
          label="Your files stay private"
          detail="Deleted right after printing. Unprinted files are removed after 24 hours."
        />
        <Row
          icon={<MessageCircle className="size-5" strokeWidth={1.75} />}
          label="Contact support"
          detail="Chat with us on WhatsApp"
          chevron
          onClick={() => window.open("https://wa.me/919364028349?text=Namastey%20MIMO%20%F0%9F%91%8B%0A%0AI%20need%20some%20assistance%20with%20my%20recent%20print%20order.%20Could%20you%20please%20help%20me%3F", "_blank")}
        />
      </Group>

      <section className="mt-8" aria-label="Sponsored">
        <h2 className="mb-2 px-1 text-[13px] font-medium text-ink-3">Sponsored</h2>
        <div className="flex min-h-[100px] items-center justify-center overflow-hidden rounded-[20px] bg-surface p-2">
          <AdSenseBlock className="min-h-[100px] w-full overflow-hidden rounded-[14px]" />
        </div>
      </section>

      <div className="mt-8">
        <PrimaryButton onClick={handleDone}>Print something else</PrimaryButton>
      </div>
    </div>
  );
}
