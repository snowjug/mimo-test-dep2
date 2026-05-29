import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { CheckCircle, Printer, MapPin, ArrowRight } from "lucide-react";
import { Button } from "../components/ui/button";

export function DirectSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const kioskId = searchParams.get("kioskId") || "Kiosk";

  useEffect(() => {
    // Scroll to top
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center p-4 bg-slate-50 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-blue-600 to-transparent opacity-10" />
      
      <Card className="w-full max-w-md border-0 shadow-2xl bg-white/90 backdrop-blur-xl relative z-10 animate-in slide-in-from-bottom-10 fade-in duration-500">
        <CardHeader className="text-center pb-2">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
            <CheckCircle className="w-14 h-14 text-green-600" />
          </div>
          <CardTitle className="text-3xl font-black tracking-tight text-slate-900">Print Sent!</CardTitle>
          <CardDescription className="text-base text-slate-500">
            Your document bypassed the queue and was sent directly to the printer.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="flex flex-col items-center py-6 space-y-8">
          
          <div className="w-full bg-blue-50 border-2 border-blue-100 rounded-2xl p-6 flex flex-col items-center space-y-4">
            <div className="flex items-center gap-4 text-blue-900">
              <Printer className="w-8 h-8 animate-pulse text-blue-600" />
              <ArrowRight className="w-6 h-6 text-blue-300" />
              <MapPin className="w-8 h-8 text-blue-600" />
            </div>
            <div className="text-center">
              <p className="text-sm text-blue-600/80 font-bold uppercase tracking-wider mb-1">Destination</p>
              <h3 className="text-xl font-bold text-blue-900">
                {kioskId === 'CV-001' ? 'Kiosk 001 - Reva Boys Hostel' : 
                 kioskId === 'SV-002' ? 'Kiosk 002 - Reva Girls Hostel' : 
                 kioskId}
              </h3>
            </div>
          </div>

          <div className="text-center space-y-2 px-4">
            <p className="text-slate-600 font-medium">
              You do <span className="font-bold underline decoration-red-400">not</span> need a 4-digit code.
            </p>
            <p className="text-sm text-slate-500">
              Your document is already printing at the kiosk. Please collect it from the tray.
            </p>
          </div>

          <Button 
            className="w-full h-14 bg-[#093765] hover:bg-[#052345] text-white font-bold text-lg rounded-xl shadow-xl transition-all duration-300 active:scale-95 mt-4"
            onClick={() => navigate("/")}
          >
            Print Another File
          </Button>
          
        </CardContent>
      </Card>
    </div>
  );
}
