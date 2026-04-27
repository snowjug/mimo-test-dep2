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
  const [printCode, setPrintCode] = useState("");
  const [files, setFiles] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const storedCode = sessionStorage.getItem("printCode");
    const storedFiles = sessionStorage.getItem("printFiles");

    if (!storedCode) {
      navigate("/");
      return;
    }

    setPrintCode(storedCode);
    if (storedFiles) {
      setFiles(JSON.parse(storedFiles));
    }
    
    setIsProcessing(false);
  }, [navigate]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(printCode);
    toast.success("Code copied to clipboard!");
  };

  const handleDone = () => {
    // Clear session storage
    sessionStorage.removeItem("printCode");
    sessionStorage.removeItem("printFiles");
    sessionStorage.removeItem("totalPages");
    navigate("/");
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
      <div className="min-h-[100dvh] w-full flex flex-col p-4 sm:p-6 bg-slate-50/50 relative">

        {/* Header */}
        <div className="w-full max-w-6xl mx-auto mb-4 sm:mb-8 z-10">
          <MimoHeader />
        </div>

        <Card className="max-w-2xl w-full mx-auto border-0 shadow-2xl bg-white/90 backdrop-blur-xl animate-in zoom-in-95 duration-500 z-10 my-auto">
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mt-8 mb-2">
              <div className="relative w-32 h-32 flex items-center justify-center">
                {/* Printer Base */}
                <div className="absolute bottom-4 w-28 h-16 bg-[#093765] rounded-xl flex items-center justify-center shadow-lg z-20">
                  <Printer className={`w-8 h-8 text-white/80 ${isProcessing ? 'animate-pulse' : ''}`} />
                </div>

                {/* Paper */}
                {isProcessing ? (
                  <div className="absolute bottom-16 w-16 h-20 bg-white border border-gray-200 shadow-sm rounded-t z-10 flex flex-col items-center justify-center animate-printing-motion overflow-hidden">
                    <div className="w-10 h-1 bg-gray-200 rounded-full mb-2"></div>
                    <div className="w-8 h-1 bg-gray-200 rounded-full mb-2"></div>
                    <div className="w-10 h-1 bg-gray-200 rounded-full"></div>
                    {/* Simulated print head moving */}
                    <div className="absolute top-1/2 left-0 w-full h-1 bg-blue-400/20 shadow-[0_0_8px_rgba(96,165,250,0.5)] animate-pulse" />
                  </div>
                ) : (
                  <div className="absolute bottom-16 w-16 h-20 bg-white border border-gray-200 shadow-sm rounded-t animate-slide-up-paper z-10 flex flex-col items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mb-1 animate-scale-check" style={{ animationDelay: '0.4s' }}>
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    </div>
                    <div className="w-10 h-1 bg-gray-100 rounded-full mb-1"></div>
                    <div className="w-8 h-1 bg-gray-100 rounded-full"></div>
                  </div>
                )}
              </div>
            </div>
            
            <CardTitle className="text-2xl sm:text-3xl font-bold mb-2 text-gray-900 transition-all">
              {isProcessing ? "Processing Print Job..." : "Payment Successful!"}
            </CardTitle>
            <CardDescription className="text-sm sm:text-base transition-all">
              {isProcessing 
                ? "Please wait while we securely prepare your documents..." 
                : "Your print job has been confirmed. Use the code below at the printer."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                {/* Print Code Display - Updated gradient */}
                <div className="bg-gradient-to-br from-blue-50 to-slate-50 border-2 border-blue-100 rounded-3xl p-8 sm:p-10 relative overflow-hidden group mb-6">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Printer className="w-32 h-32 rotate-[-15deg]" />
                  </div>
                  <p className="text-center text-xs sm:text-sm font-medium text-gray-600 mb-2 sm:mb-3">
                    Your Print Code
                  </p>
                  <div className="text-center">
                    <p className="text-5xl sm:text-7xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#093765] to-blue-600 font-mono mb-4 sm:mb-6 drop-shadow-sm">
                      {printCode}
                    </p>
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={handleCopyCode}
                      className="mx-auto rounded-full hover:bg-slate-50 text-indigo-700 hover:text-indigo-800 border-indigo-200 hover:border-indigo-300 transition-all shadow-sm font-bold tracking-wide"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      COPY CODE
                    </Button>
                  </div>
                </div>

                {/* Instructions */}
                <Card className="bg-blue-50/50 border-blue-100 shadow-none">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3 mb-4">
                      <Printer className="w-5 h-5 text-blue-600 mt-1 flex-shrink-0" />
                      <div>
                        <h3 className="font-semibold text-blue-900 mb-2">How to Print</h3>
                        <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
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
                <div className="pt-6">
                  <Button
                    className="w-full h-12 bg-gradient-to-r from-[#093765] to-blue-700 hover:from-[#052345] hover:to-blue-800 text-white shadow-lg hover:shadow-xl transition-all duration-200 text-sm sm:text-base px-2 rounded-xl"
                    onClick={handleDone}
                  >
                    <Home className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    Need more prints?
                  </Button>
                </div>
              </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
