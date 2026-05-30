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
      <div className="min-h-[100dvh] w-full flex flex-col p-2 sm:p-4 bg-slate-50/50 relative">

        {/* Header */}
        <div className="w-full max-w-6xl mx-auto mb-1 sm:mb-3 z-10">
          <MimoHeader />
        </div>

        <div className="flex-1 flex items-center justify-center w-full z-10 py-2 sm:py-4">
          <Card className="max-w-2xl w-full border-0 shadow-2xl bg-white/90 backdrop-blur-xl animate-in zoom-in-95 duration-500">
          <CardHeader className="text-center pt-2 pb-1 px-4">
            <div className="flex justify-center mt-2 mb-1">
              <div className="relative w-20 h-20 flex items-center justify-center">
                {/* Printer Base */}
                <div className="absolute bottom-2 w-20 h-11 bg-[#093765] rounded-lg flex items-center justify-center shadow-md z-20">
                  <Printer className={`w-6 h-6 text-white/80 ${isProcessing ? 'animate-pulse' : ''}`} />
                </div>

                {/* Paper Animation Logic */}
                {isProcessing || printStatus === "printing" ? (
                  <div className="absolute bottom-10 w-12 h-14 bg-white border border-gray-200 shadow-sm rounded-t z-10 flex flex-col items-center justify-center animate-printing-motion overflow-hidden">
                    <div className="w-8 h-1 bg-gray-200 rounded-full mb-1"></div>
                    <div className="w-6 h-1 bg-gray-200 rounded-full mb-1"></div>
                    <div className="w-8 h-1 bg-gray-200 rounded-full"></div>
                    {/* Simulated print head moving */}
                    <div className="absolute top-1/2 left-0 w-full h-1 bg-blue-400/20 shadow-[0_0_8px_rgba(96,165,250,0.5)] animate-pulse" />
                  </div>
                ) : printStatus === "completed" ? (
                  <div className="absolute bottom-10 w-12 h-14 bg-white border border-gray-200 shadow-sm rounded-t animate-slide-up-paper z-10 flex flex-col items-center justify-center">
                    <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center mb-1 animate-scale-check" style={{ animationDelay: '0.4s' }}>
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="w-8 h-1 bg-gray-100 rounded-full mb-1"></div>
                    <div className="w-6 h-1 bg-gray-100 rounded-full"></div>
                  </div>
                ) : null}
              </div>
            </div>
            
            <CardTitle className="text-xl sm:text-2xl font-extrabold mb-1 text-gray-900 transition-all">
              {isProcessing 
                ? "Processing Print Job..." 
                : printStatus === "printing" 
                  ? "Printing Document..." 
                  : printStatus === "completed"
                    ? "Printed Successfully!"
                    : "Payment Successful!"}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm transition-all max-w-md mx-auto">
              {isProcessing 
                ? "Please wait while we securely prepare your documents..." 
                : printStatus === "printing"
                  ? "Your document is currently printing at the kiosk. Please wait..."
                  : printStatus === "completed"
                    ? "Your document has been printed. Thank you for using MIMO."
                    : "Your print job has been confirmed. Use the code below at the printer."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3 p-4 pt-1 sm:p-6 sm:pt-2">
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                {/* Print Code Display - Updated gradient */}
                <div className="bg-gradient-to-br from-blue-50 to-slate-50 border-2 border-blue-100 rounded-2xl p-4 sm:p-6 relative overflow-hidden group mb-3">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Printer className="w-32 h-32 rotate-[-15deg]" />
                  </div>
                  <p className="text-center text-xs font-semibold text-gray-600 mb-1">
                    Your Print Code
                  </p>
                  <div className="text-center">
                    <p className="text-4xl sm:text-5xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#093765] to-blue-600 font-mono mb-2 sm:mb-3 drop-shadow-xs">
                      {printCode}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyCode}
                      className="mx-auto rounded-full hover:bg-slate-50 text-indigo-700 hover:text-indigo-800 border-indigo-200 hover:border-indigo-300 transition-all shadow-sm font-bold tracking-wide cursor-pointer px-4 h-8 text-xs"
                    >
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                      COPY CODE
                    </Button>
                  </div>
                </div>

                {/* Instructions */}
                <Card className="bg-blue-50/40 border-blue-100/70 shadow-none">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2.5">
                      <Printer className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <h3 className="font-bold text-xs text-blue-900 mb-1">How to Print</h3>
                        <ol className="text-xs text-blue-800 space-y-1 list-decimal list-outside pl-4 font-semibold">
                          <li>Go to the MIMO vending printer</li>
                          <li>Enter the 4-digit code on the printer's keypad</li>
                          <li>Press the "Print" button to start printing</li>
                          <li>Collect your documents from the output tray</li>
                        </ol>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Action Buttons */}
                <div className="pt-2">
                  <Button
                    className="w-full h-11 bg-gradient-to-r from-[#093765] to-blue-700 hover:from-[#052345] hover:to-blue-800 text-white shadow-lg hover:shadow-xl transition-all duration-200 text-xs sm:text-sm px-2 rounded-xl cursor-pointer font-bold uppercase tracking-wider"
                    onClick={handleDone}
                  >
                    <Home className="w-4 h-4 mr-2" />
                    Need more prints?
                  </Button>
                </div>
              </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </>
  );
}
