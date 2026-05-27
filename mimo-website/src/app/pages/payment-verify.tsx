import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
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

    const verify = async () => {
      try {
        const response = await api.get(`/verify-payment/${orderId}`);
        const { order_status } = response.data;

        if (order_status === "PAID" || order_status === "SUCCESS") {
          setStatus("success");
          
          // Trigger the job finalization (generate code, etc)
          const successResponse = await api.post("/payment-success");
          const { printCode } = successResponse.data;

          sessionStorage.setItem("printCode", printCode);
          toast.success("Payment confirmed!");
          
          setTimeout(() => {
            navigate("/print-code");
          }, 2000);
        } else {
          setStatus("failed");
          toast.error(`Payment status: ${order_status}`);
          isVerifying.current = false; // Allow retry if it failed but wasn't paid yet
        }
      } catch (err) {
        console.error(err);
        setStatus("failed");
        toast.error("Failed to verify payment");
        isVerifying.current = false;
      }
    };

    verify();
  }, [orderId, navigate]);

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center p-4 bg-slate-50">
      <Card className="w-full max-w-md border-0 shadow-2xl bg-white/90 backdrop-blur-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Verifying Payment</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-12 space-y-6">
          {status === "verifying" && (
            <>
              <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
              <p className="text-slate-500 animate-pulse font-medium">Please wait while we confirm your transaction...</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-12 h-12 text-green-600" />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-bold text-slate-900">Success!</h2>
                <p className="text-slate-500">Your payment has been confirmed. Redirecting...</p>
              </div>
            </>
          )}

          {status === "failed" && (
            <>
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
                <XCircle className="w-12 h-12 text-red-600" />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-bold text-slate-900">Payment Failed</h2>
                <p className="text-slate-500">We couldn't confirm your payment. Please try again or contact support.</p>
              </div>
              <button 
                onClick={() => navigate("/payment")}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors"
              >
                Back to Payment
              </button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
