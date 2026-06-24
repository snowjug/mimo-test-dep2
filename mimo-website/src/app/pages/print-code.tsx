import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Copy, CheckCircle2, CheckCircle, Home, Printer, QrCode, Download, Share2, Mail, Loader2, X, FileText, AlertCircle } from "lucide-react";
import { MimoCoinsDisplay } from "../components/mimo-coins-display";
import { MimoHeader } from "../components/mimo-header";
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
        const apiUrl = import.meta.env.VITE_API_URL || "https://api-upqxuj7evq-uc.a.run.app";
        const res = await fetch(`${apiUrl}/kiosk/job-status?printCode=${printCode}`);
        const data = await res.json();
        
        if (data.status && data.status !== printStatus) {
          setPrintStatus(data.status);
          sessionStorage.setItem("printStatus", data.status);
          if (data.status === "completed") {
            toast.success("Your document has been printed!");
          } else if (data.status === "failed") {
            toast.error("Print failed. Please contact support.");
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

  // Animated progress during printing
  useEffect(() => {
    if (printStatus === "paid" || isProcessing) {
      setPrintProgress(8);
      return;
    }
    if (printStatus === "completed") {
      setPrintProgress(100);
      return;
    }
    if (printStatus === "failed") {
      // Freeze wherever we are
      return;
    }
    // printStatus === "printing" — animate 20% → 90% over ~90 s
    if (printStatus === "printing") {
      setPrintProgress(20);
      const start = Date.now();
      const DURATION_MS = 90_000; // 90 s max estimate
      const tick = setInterval(() => {
        const elapsed = Date.now() - start;
        const frac = Math.min(elapsed / DURATION_MS, 1);
        // Ease-out curve: grows fast at first then slows near 90%
        const eased = 1 - Math.pow(1 - frac, 2.5);
        const next = 20 + eased * 70; // 20% → 90%
        setPrintProgress(Math.min(next, 90));
      }, 500);
      return () => clearInterval(tick);
    }
  }, [printStatus, isProcessing]);

  const handleRequestRefund = async () => {
    const orderId = sessionStorage.getItem("orderId");
    if (!orderId) {
      toast.error("Order ID not found. Please contact support.");
      return;
    }
    setRefundLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "https://api-upqxuj7evq-uc.a.run.app";
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

  return (
    <>
      <style>
        {`
          @font-face {
            font-family: 'Lovelo';
            src: url('/fonts/Lovelo-Black.otf') format('opentype');
          }
          @keyframes paperOut {
            0%   { height: 0px; opacity: 0; }
            15%  { opacity: 1; }
            60%  { height: 52px; }
            80%  { height: 48px; }
            100% { height: 52px; }
          }
          @keyframes paperPulse {
            0%, 100% { height: 44px; }
            50%       { height: 52px; }
          }
          @keyframes printerBob {
            0%, 100% { transform: translateY(0px); }
            50%       { transform: translateY(-3px); }
          }
          @keyframes printerShake {
            0%,100% { transform: translateX(0); }
            20%      { transform: translateX(-2px); }
            40%      { transform: translateX(2px); }
            60%      { transform: translateX(-1px); }
            80%      { transform: translateX(1px); }
          }
          @keyframes checkPop {
            0%   { transform: scale(0) rotate(-20deg); opacity: 0; }
            70%  { transform: scale(1.2) rotate(5deg); opacity: 1; }
            100% { transform: scale(1) rotate(0deg); opacity: 1; }
          }
          @keyframes glowPulse {
            0%, 100% { box-shadow: 0 0 0px 0px rgba(9,55,101,0.2); }
            50%       { box-shadow: 0 0 18px 6px rgba(9,55,101,0.15); }
          }
          @keyframes lineSlide {
            0%   { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
          @keyframes feedIn {
            0% { transform: translateY(-12px); opacity: 0; }
            30% { transform: translateY(-2px); opacity: 1; }
            70% { transform: translateY(8px); opacity: 0; }
            100% { transform: translateY(18px); opacity: 0; }
          }
          @keyframes feedOut {
            0% { transform: translateY(-18px); opacity: 0; }
            30% { transform: translateY(-8px); opacity: 0; }
            70% { transform: translateY(2px); opacity: 1; }
            100% { transform: translateY(12px); opacity: 0; }
          }
          @keyframes slideUpPaper {
            0% { transform: translateY(50px); opacity: 0; }
            10% { opacity: 1; }
            100% { transform: translateY(0); opacity: 1; }
          }
          @keyframes scaleCheck {
            0% { transform: scale(0); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes printingMotion {
            0% { transform: translateY(50px); opacity: 0; }
            20% { transform: translateY(30px); opacity: 1; }
            50% { transform: translateY(35px); opacity: 1; }
            80% { transform: translateY(20px); opacity: 1; }
            100% { transform: translateY(25px); opacity: 1; }
          }
          .animate-slide-up-paper {
            animation: slideUpPaper 0.8s ease-out forwards;
          }
          .animate-scale-check {
            animation: scaleCheck 0.4s ease-out cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
          }
          .animate-printing-motion {
            animation: printingMotion 2s ease-in-out infinite alternate;
          }
          .printer-bob { animation: printerBob 2s ease-in-out infinite; }
          .printer-shake { animation: printerShake 0.4s ease-in-out infinite; }
          .printer-glow { animation: glowPulse 2s ease-in-out infinite; }
          .paper-out { animation: paperOut 0.7s ease-out forwards; }
          .paper-pulse { animation: paperPulse 1.2s ease-in-out infinite; }
          .check-pop { animation: checkPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
          .line-slide { animation: lineSlide 1.2s linear infinite; }
        `}
      </style>
      <div className="min-h-[100dvh] w-full flex flex-col px-2 pt-0 pb-2 sm:px-4 sm:pt-0 sm:pb-4 bg-slate-50/50 relative">

        {/* Header */}
        <div className="w-full max-w-6xl mx-auto z-10">
          <MimoHeader />
        </div>

        <div className="flex-1 flex flex-col items-center justify-start w-full max-w-xl mx-auto z-10 pt-1 sm:pt-2 pb-2 px-4 space-y-2 sm:space-y-3">
          
          {/* Status Container (Overlapped Badge + Card) */}
          <div className="w-full relative pt-10 mt-2 z-10 animate-in zoom-in-95 duration-500">
            
            {/* Elegant Printer Animation - OVERLAPPING STATUS CARD */}
            <div className="absolute top-0 left-0 right-0 flex justify-center z-20">
              <div className={`relative w-20 h-20 flex items-center justify-center rounded-full shadow-md transition-all duration-700 border-4 border-white ${
                printStatus === 'completed' ? 'bg-green-500' :
                printStatus === 'failed' ? 'bg-red-500' :
                'bg-[#093765]'
              }`}>
                
                {/* Pulse effect in background */}
                {(isProcessing || printStatus === 'printing') && (
                  <>
                    <div className="absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-20" />
                    <div className="absolute inset-0 bg-blue-300 rounded-full animate-pulse opacity-30" />
                  </>
                )}

                {/* Paper feeding in (Top) */}
                {(isProcessing || printStatus === 'printing') && (
                  <div className="absolute top-1 animate-[feedIn_1.5s_ease-in-out_infinite] z-0">
                    <FileText className="w-5 h-5 text-white/50" strokeWidth={1.5} />
                  </div>
                )}

                {/* The Printer */}
                <div className="relative z-10 bg-inherit rounded-full p-1.5">
                  <Printer className="w-8 h-8 text-white" strokeWidth={1.5} />
                </div>

                {/* Paper coming out (Bottom) */}
                {(isProcessing || printStatus === 'printing') && (
                  <div className="absolute bottom-1 animate-[feedOut_1.5s_ease-in-out_infinite] z-0">
                    <FileText className="w-5 h-5 text-white/90" strokeWidth={1.5} />
                  </div>
                )}

                {/* Success Checkmark */}
                {printStatus === 'completed' && (
                  <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm animate-in zoom-in duration-300 border border-slate-100">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                )}

                {/* Failed X */}
                {printStatus === 'failed' && (
                  <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm animate-in zoom-in duration-300 border border-slate-100">
                    <X className="w-5 h-5 text-red-600" />
                  </div>
                )}
              </div>
            </div>
            
            {/* Status Card */}
            <div className="w-full bg-white/95 backdrop-blur-xl rounded-2xl shadow-sm border border-slate-200 p-4 pt-12 sm:p-5 sm:pt-14 flex flex-col items-center text-center">
            <h2 className="text-xl sm:text-2xl font-extrabold mb-1 text-gray-900 transition-all tracking-tight">
              {isProcessing 
                ? "Processing Print Job..." 
                : printStatus === "printing" 
                  ? "Printing Document..." 
                  : printStatus === "completed"
                    ? "Printed Successfully!"
                    : "Payment Successful!"}
            </h2>
            {(isProcessing || printStatus === "printing" || printStatus === "completed") && (
              <p className="text-[10px] sm:text-xs text-gray-500 transition-all max-w-md mx-auto mb-2">
                {isProcessing 
                  ? "Securely preparing your documents..." 
                  : printStatus === "printing"
                    ? "Currently printing at the kiosk..."
                    : "Your document has been printed."}
              </p>
            )}

            {/* Animated Physical Print Progress Bar */}
            <div className="w-full mt-3 mb-1 px-1">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  {printStatus === 'completed' ? 'Print Complete' :
                   printStatus === 'failed'    ? 'Print Failed' :
                   printStatus === 'printing'  ? 'Printing…' :
                   'Preparing…'}
                </span>
                <span className={`text-[10px] font-black tabular-nums ${
                  printStatus === 'completed' ? 'text-green-600' :
                  printStatus === 'failed'    ? 'text-red-500' :
                  'text-[#093765]'
                }`}>
                  {Math.round(printProgress)}%
                </span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    printStatus === 'completed' ? 'bg-green-500 duration-700' :
                    printStatus === 'failed'    ? 'bg-red-400 duration-300' :
                    'bg-gradient-to-r from-[#093765] to-blue-500 duration-500'
                  }`}
                  style={{ width: `${printProgress}%` }}
                />
              </div>
              {/* Step labels below bar */}
              <div className="flex justify-between mt-1">
                <span className={`text-[9px] font-bold ${
                  printStatus !== 'failed' ? 'text-[#093765]' : 'text-gray-400'
                }`}>Paid ✓</span>
                <span className={`text-[9px] font-bold ${
                  printStatus === 'printing' || printStatus === 'completed' ? 'text-[#093765]' : 'text-gray-400'
                }`}>Printing</span>
                <span className={`text-[9px] font-bold ${
                  printStatus === 'completed' ? 'text-green-600' : 'text-gray-400'
                }`}>Done ✓</span>
              </div>
            </div>
          </div>
        </div>

        {/* Print Code Card */}
          <div className="w-full bg-white/95 backdrop-blur-xl rounded-2xl shadow-sm border border-slate-100 p-2 sm:p-2.5 animate-in slide-in-from-bottom-4 duration-700 delay-100">
            <div className="bg-gradient-to-br from-blue-50 to-slate-50 border-2 border-blue-100 rounded-xl p-3 sm:p-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-2 opacity-5 pointer-events-none">
                <Printer className="w-20 h-20 rotate-[-15deg]" />
              </div>
              <p className="text-center text-xs sm:text-sm font-bold text-slate-700 uppercase tracking-widest mb-1">
                Your Print Code
              </p>
              <div className="text-center">
                <p className="text-5xl sm:text-6xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#093765] to-blue-600 font-mono mb-2 drop-shadow-sm">
                  {printCode}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyCode}
                  className="mx-auto rounded-full bg-white hover:bg-slate-50 text-indigo-700 hover:text-indigo-800 border-indigo-200 hover:border-indigo-300 transition-all shadow-sm font-bold tracking-wide cursor-pointer px-4 h-7 sm:h-8 text-[9px] sm:text-[10px]"
                >
                  <Copy className="w-3 h-3 mr-1.5" />
                  COPY CODE
                </Button>
              </div>
            </div>
          </div>

          {/* --- SWIGGY-STYLE "WHILE YOU WAIT" ADS SECTION --- */}
          <div className="w-full mt-2 relative z-10 animate-in slide-in-from-bottom-12 fade-in duration-700 delay-300">
            <div className="flex items-center justify-center space-x-4 mb-3">
              <div className="h-px bg-slate-300 flex-1"></div>
              <h3 className="text-xs font-black tracking-widest text-slate-500 uppercase">While You Wait</h3>
              <div className="h-px bg-slate-300 flex-1"></div>
            </div>
            
            {/* AdSense Block Container */}
            <div className="bg-white/60 backdrop-blur-md rounded-2xl shadow-sm border border-white/40 overflow-hidden p-2 min-h-[100px] flex items-center justify-center relative">
              <AdSenseBlock className="rounded-xl overflow-hidden min-h-[100px] z-10" />
              {/* Fallback visual while AdSense is loading */}
              <p className="absolute text-slate-400 text-xs font-medium text-center px-4 z-0">
                Advertisement Space
              </p>
            </div>
          </div>

          {/* Watermark on background */}
          <div className="w-full mt-1 flex flex-col select-none pointer-events-none opacity-60 animate-in fade-in duration-700 delay-200 px-1">
            <h2 className="text-3xl sm:text-4xl font-black text-slate-400/90 leading-[1.05] tracking-tight mb-2.5 text-left w-full">
              Your friendly campus<br />printer ❤️
            </h2>
            <div className="w-full h-[1px] bg-slate-300 mb-2"></div>
            <h1 className="text-base sm:text-lg font-black text-slate-400 tracking-wider text-left w-full" style={{ fontFamily: "'Lovelo', sans-serif" }}>
              MIMO
            </h1>
          </div>

          {/* Action Buttons */}
          <div className="w-full mt-auto animate-in slide-in-from-bottom-4 duration-700 delay-300 space-y-2">
            {/* Refund button — only shown when print failed */}
            {printStatus === 'failed' && (
              <div className="w-full bg-red-50 border border-red-200 rounded-xl p-3 flex flex-col items-center gap-2">
                <div className="flex items-center gap-1.5 text-red-700">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-xs font-bold">Print failed at kiosk</span>
                </div>
                {!refundRequested ? (
                  <Button
                    variant="outline"
                    className="w-full h-9 border-red-300 text-red-700 hover:bg-red-100 font-bold text-xs tracking-wide rounded-lg cursor-pointer"
                    onClick={handleRequestRefund}
                    disabled={refundLoading}
                  >
                    {refundLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {refundLoading ? "Submitting…" : "Request Refund"}
                  </Button>
                ) : (
                  <p className="text-xs text-green-700 font-bold">✓ Refund request submitted</p>
                )}
              </div>
            )}
            <Button
              className="w-full h-10 sm:h-11 bg-gradient-to-r from-[#093765] to-blue-700 hover:from-[#052345] hover:to-blue-800 text-white shadow-lg hover:shadow-xl transition-all duration-200 text-[11px] sm:text-xs px-2 rounded-xl cursor-pointer font-bold uppercase tracking-wider"
              onClick={handleDone}
            >
              <Home className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              Need more prints?
            </Button>
          </div>
        
        </div>
      </div>
    </>
  );
}
