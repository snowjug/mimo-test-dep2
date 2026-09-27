import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Check, X } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "../components/mimo/ui";
import { toast } from "sonner";
import api from "../api";

export function PaymentVerify() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"verifying" | "success" | "failed">("verifying");
  const orderId = searchParams.get("order_id");

  const isVerifying = useRef(false);

  useEffect(() => {
    if (!orderId || isVerifying.current) return;
    isVerifying.current = true;
    let pollCount = 0;
    const maxPolls = 15;

    const verify = async () => {
      try {
        const response = await api.get(`/verify-payment/${orderId}`);
        const { order_status, printCode, directKioskId } = response.data;

        if (order_status === "PAID" || order_status === "SUCCESS") {
          setStatus("success");

          if (printCode) {
            // Store in BOTH sessionStorage and localStorage.
            // On mobile, Cashfree UPI redirect causes a full page reload which
            // wipes sessionStorage. localStorage survives the reload so the
            // print-code page can always find the code.
            sessionStorage.setItem("printCode", printCode);
            localStorage.setItem("mimo_printCode", printCode);
            localStorage.setItem("mimo_printCode_ts", Date.now().toString());
            if (directKioskId) {
              sessionStorage.setItem("directKioskId", directKioskId);
              localStorage.setItem("mimo_directKioskId", directKioskId);
            }
            toast.success("Payment confirmed!");
            setTimeout(() => {
              navigate("/print-code");
            }, 2000);
          } else if (directKioskId) {
            // Legacy fallback: no code but direct kiosk set (should no longer happen)
            toast.success("Payment confirmed! Sending to Kiosk...");
            setTimeout(() => {
              navigate(`/direct-success?kioskId=${directKioskId}`);
            }, 2000);
          } else {
            // Edge case: Webhook hasn't finished and internal generation failed
            toast.success("Payment confirmed! Generating print code...");
            setTimeout(() => {
              navigate("/print-code"); // print-code page can try to fetch the code itself if needed
            }, 3000);
          }
        } else if (order_status === "ACTIVE" || order_status === "PENDING") {
          pollCount++;
          if (pollCount < maxPolls) {
            setTimeout(verify, 2000); // Poll again after 2 seconds
          } else {
            setStatus("failed");
            toast.error("Payment verification timed out.");
            isVerifying.current = false;
          }
        } else {
          setStatus("failed");
          toast.error(`Payment status: ${order_status}`);
          isVerifying.current = false; // Allow retry if it failed but wasn't paid yet
        }
      } catch (err) {
        console.error(err);
        pollCount++;
        if (pollCount < maxPolls) {
          setTimeout(verify, 2000); // Retry on error too (network blip)
        } else {
          setStatus("failed");
          toast.error("Failed to verify payment");
          isVerifying.current = false;
        }
      }
    };

    verify();
  }, [orderId, navigate]);

  return (
    <div className="flex min-h-[100dvh] flex-col px-6 pb-[max(24px,env(safe-area-inset-bottom))]">
      <div className="flex flex-1 flex-col items-center justify-center text-center" role="status" aria-live="polite">
        {status === "verifying" && (
          <>
            <Loader2 className="size-10 animate-spin text-ink-3" strokeWidth={1.75} />
            <h1 className="mt-6 text-[24px] font-semibold tracking-tight text-ink">Confirming payment</h1>
            <p className="mt-2 max-w-[30ch] text-[15px] text-ink-2">This usually takes a few seconds. Please keep this screen open.</p>
          </>
        )}

        {status === "success" && (
          <>
            <span className="rise-in flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
              <Check className="size-8" strokeWidth={2.5} />
            </span>
            <h1 className="mt-6 text-[24px] font-semibold tracking-tight text-ink">Payment received</h1>
            <p className="mt-2 max-w-[30ch] text-[15px] text-ink-2">Getting your print code ready.</p>
          </>
        )}

        {status === "failed" && (
          <>
            <span className="rise-in flex size-16 items-center justify-center rounded-full bg-danger-soft text-danger">
              <X className="size-8" strokeWidth={2.5} />
            </span>
            <h1 className="mt-6 text-[24px] font-semibold tracking-tight text-ink">We could not confirm this payment</h1>
            <p className="mt-2 max-w-[32ch] text-[15px] text-ink-2">
              If money left your account, call support on +91 81230 28797 and share this order ID.
            </p>
            {orderId && (
              <p className="mt-3 select-all rounded-[10px] bg-surface-2 px-3 py-1.5 text-[13px] tabular-nums text-ink-2">{orderId}</p>
            )}
          </>
        )}
      </div>

      {status === "failed" && (
        <div className="flex flex-col gap-2">
          <PrimaryButton onClick={() => navigate("/payment")}>Try again</PrimaryButton>
          <SecondaryButton onClick={() => navigate("/upload")}>Back to home</SecondaryButton>
        </div>
      )}
    </div>
  );
}
