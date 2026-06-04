import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Copy, CheckCircle2, CheckCircle, Home, Printer, QrCode, Download, Share2, Mail, Loader2 } from "lucide-react";
import { MimoCoinsDisplay } from "../components/mimo-coins-display";
import { MimoHeader } from "../components/mimo-header";
import { toast } from "sonner";

export function PrintCode() {
  const navigate = useNavigate();
  const [printCode, setPrintCode] = useState(() => sessionStorage.getItem("printCode") || "");
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

  useEffect(() => {
    if (!printCode) {
      navigate("/");
    }
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
        `}
      </style>
      <div className="min-h-[100dvh] w-full flex flex-col px-2 pt-0 pb-2 sm:px-4 sm:pt-0 sm:pb-4 bg-slate-50/50 relative">

        {/* Header */}
        <div className="w-full max-w-6xl mx-auto z-10">
          <MimoHeader />
        </div>

        <div className="flex-1 flex flex-col items-center justify-start w-full max-w-xl mx-auto z-10 pt-1 sm:pt-2 pb-2 px-4 space-y-2 sm:space-y-3">
          
          {/* Status Card */}
          <div className="w-full bg-white/95 backdrop-blur-xl rounded-2xl shadow-sm border border-slate-100 p-3 flex flex-col items-center text-center animate-in zoom-in-95 duration-500">
            <div className="flex justify-center mb-1">
              <div className="relative w-12 h-12 flex items-center justify-center scale-75">
                {/* Printer Base */}
                <div className="absolute bottom-2 w-16 h-9 bg-[#093765] rounded-lg flex items-center justify-center shadow-md z-20">
                  <Printer className={`w-5 h-5 text-white/80 ${isProcessing ? 'animate-pulse' : ''}`} />
                </div>

                {/* Paper Animation Logic */}
                {isProcessing || printStatus === "printing" ? (
                  <div className="absolute bottom-8 w-10 h-12 bg-white border border-gray-200 shadow-sm rounded-t z-10 flex flex-col items-center justify-center animate-printing-motion overflow-hidden">
                    <div className="w-6 h-0.5 bg-gray-200 rounded-full mb-1"></div>
                    <div className="w-4 h-0.5 bg-gray-200 rounded-full mb-1"></div>
                    <div className="w-6 h-0.5 bg-gray-200 rounded-full"></div>
                    {/* Simulated print head moving */}
                    <div className="absolute top-1/2 left-0 w-full h-0.5 bg-blue-400/20 shadow-[0_0_8px_rgba(96,165,250,0.5)] animate-pulse" />
                  </div>
                ) : printStatus === "completed" ? (
                  <div className="absolute bottom-8 w-10 h-12 bg-white border border-gray-200 shadow-sm rounded-t animate-slide-up-paper z-10 flex flex-col items-center justify-center">
                    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center mb-1 animate-scale-check" style={{ animationDelay: '0.4s' }}>
                      <CheckCircle className="w-3 h-3 text-green-600" />
                    </div>
                    <div className="w-6 h-0.5 bg-gray-100 rounded-full mb-1"></div>
                    <div className="w-4 h-0.5 bg-gray-100 rounded-full"></div>
                  </div>
                ) : null}
              </div>
            </div>
            
            <h2 className="text-lg sm:text-xl font-extrabold mb-0.5 text-gray-900 transition-all">
              {isProcessing 
                ? "Processing Print Job..." 
                : printStatus === "printing" 
                  ? "Printing Document..." 
                  : printStatus === "completed"
                    ? "Printed Successfully!"
                    : "Payment Successful!"}
            </h2>
            <p className="text-[10px] sm:text-xs text-gray-500 transition-all max-w-md mx-auto mb-2">
              {isProcessing 
                ? "Securely preparing your documents..." 
                : printStatus === "printing"
                  ? "Currently printing at the kiosk..."
                  : printStatus === "completed"
                    ? "Your document has been printed."
                    : "Your print job has been confirmed."}
            </p>

            {/* Status Progress Bar */}
            <div className="flex items-center justify-between w-full max-w-[240px] mx-auto mt-1 mb-0.5">
              {/* Step 1: Paid */}
              <div className="flex flex-col items-center">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${printStatus !== 'failed' ? 'bg-[#093765] text-white shadow-sm' : 'bg-gray-200 text-gray-500'}`}>
                  <CheckCircle2 className="w-3 h-3" />
                </div>
                <span className="text-[9px] font-bold text-gray-700 mt-1">Paid</span>
              </div>
              
              {/* Line 1 */}
              <div className={`flex-1 h-0.5 mx-1.5 rounded-full transition-colors duration-500 ${printStatus === 'printing' || printStatus === 'completed' ? 'bg-[#093765]' : 'bg-gray-200'}`} />

              {/* Step 2: Printing */}
              <div className="flex flex-col items-center">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${(printStatus === 'printing' || printStatus === 'completed') ? 'bg-[#093765] text-white shadow-sm' : 'bg-gray-200 text-gray-400'} ${printStatus === 'printing' ? 'animate-pulse shadow-[0_0_8px_rgba(9,55,101,0.5)] ring-2 ring-[#093765]/20 ring-offset-1' : ''}`}>
                  {printStatus === 'completed' ? <CheckCircle2 className="w-3 h-3" /> : <Printer className="w-3 h-3" />}
                </div>
                <span className={`text-[9px] font-bold mt-1 transition-colors duration-500 ${(printStatus === 'printing' || printStatus === 'completed') ? 'text-gray-700' : 'text-gray-400'}`}>Printing</span>
              </div>
              
              {/* Line 2 */}
              <div className={`flex-1 h-0.5 mx-1.5 rounded-full transition-colors duration-500 ${printStatus === 'completed' ? 'bg-green-500' : 'bg-gray-200'}`} />

              {/* Step 3: Done */}
              <div className="flex flex-col items-center">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${printStatus === 'completed' ? 'bg-green-500 text-white shadow-sm ring-2 ring-green-500/20 ring-offset-1' : 'bg-gray-200 text-gray-400'}`}>
                  <CheckCircle className="w-3 h-3" />
                </div>
                <span className={`text-[9px] font-bold mt-1 transition-colors duration-500 ${printStatus === 'completed' ? 'text-green-600' : 'text-gray-400'}`}>Done</span>
              </div>
            </div>
          </div>

          {/* Print Code Card */}
          <div className="w-full bg-white/95 backdrop-blur-xl rounded-2xl shadow-sm border border-slate-100 p-2 sm:p-2.5 animate-in slide-in-from-bottom-4 duration-700 delay-100">
            <div className="bg-gradient-to-br from-blue-50 to-slate-50 border-2 border-blue-100 rounded-xl p-3 sm:p-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-2 opacity-5 pointer-events-none">
                <Printer className="w-20 h-20 rotate-[-15deg]" />
              </div>
              <p className="text-center text-[9px] sm:text-[10px] font-semibold text-gray-600 mb-0.5">
                Your Print Code
              </p>
              <div className="text-center">
                <p className="text-3xl sm:text-4xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#093765] to-blue-600 font-mono mb-1.5 drop-shadow-xs">
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

          {/* Watermark on background */}
          <div className="w-full mt-1 flex flex-col select-none pointer-events-none opacity-40 animate-in fade-in duration-700 delay-200 px-1">
            <h2 className="text-3xl sm:text-4xl font-black text-slate-400/90 leading-[1.05] tracking-tight mb-2.5 text-left w-full">
              Your friendly campus<br />printer ❤️
            </h2>
            <div className="w-full h-[1px] bg-slate-300 mb-2"></div>
            <h1 className="text-base sm:text-lg font-black text-slate-300 tracking-wider text-left w-full" style={{ fontFamily: "'Lovelo', sans-serif" }}>
              MIMO
            </h1>
          </div>

          {/* Action Buttons */}
          <div className="w-full mt-auto animate-in slide-in-from-bottom-4 duration-700 delay-300">
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
