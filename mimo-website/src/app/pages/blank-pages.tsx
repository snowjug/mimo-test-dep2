import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { MimoHeader } from "../components/mimo-header";
import { ArrowLeft, Minus, Plus, FileText, Grid3X3, Loader2, MapPin, Printer, Check } from "lucide-react";
import api from "../api";

export function BlankPages() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type") || "a4"; // "a4" or "graph"
  const [pageCount, setPageCount] = useState(1);
  const [directKioskId, setDirectKioskId] = useState<string | null>("CV-001");

  const isGraph = type === "graph";
  const label = isGraph ? "Mimo Graph Sheet" : "A4 Blank Sheet";
  const [pricePerPageA4, setPricePerPageA4] = useState(2.30);
  const [pricePerPageGraph, setPricePerPageGraph] = useState(2.00);

  useEffect(() => {
    api.get('/api/settings')
      .then(res => {
        if (res.data) {
          if (res.data.pricePerPageA4) setPricePerPageA4(res.data.pricePerPageA4);
          if (res.data.pricePerPageGraph) setPricePerPageGraph(res.data.pricePerPageGraph);
        }
      })
      .catch(console.error);
  }, []);

  const pricePerPage = isGraph ? pricePerPageGraph : pricePerPageA4;
  const totalCost = pageCount * pricePerPage;

  const increment = () => {
    if (pageCount < 200) setPageCount(pageCount + 1);
  };

  const decrement = () => {
    if (pageCount > 1) setPageCount(pageCount - 1);
  };

  const fileName = isGraph ? "mimo_graph.pdf" : "blank_a4.pdf";

  const [isProcessing, setIsProcessing] = useState(false);

  const handleContinue = async () => {
    setIsProcessing(true);
    try {
      await api.post("/create-blank-job", 
        { type, pageCount }
      );

      // Store print options for payment page
      sessionStorage.setItem(
        "printOptions",
        JSON.stringify({
          copies: pageCount,
          colorMode: "bw",
          doubleSided: "single",
          pageSelection: "all",
          pageRange: "",
          orientation: "portrait",
          totalPages: pageCount,
          totalCost,
          isBlankSheet: true,
          sheetType: type,
          directKioskId: directKioskId?.startsWith("SV-002") ? "SV-002" : directKioskId,
        })
      );

      sessionStorage.setItem(
        "printFiles",
        JSON.stringify([
          {
            name: fileName,
            size: isGraph ? 1172734 : 9198,
            type: "application/pdf"
          }
        ])
      );

      navigate("/payment");
    } catch (err) {
      console.error("Failed to create blank job:", err);
      alert("Failed to proceed to checkout. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-slate-50/50 px-2 pt-0 pb-2 sm:px-4 sm:pt-0 sm:pb-4">
      <div className="mx-auto max-w-5xl space-y-3 sm:space-y-4">
        {/* Global Styles */}
        <style>
          {`
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');
            @keyframes subtle-pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.85; }
            }
          `}
        </style>

        {/* Header */}
        <MimoHeader />

        {/* ── Page Header ── */}
        <div className="flex items-center gap-2 py-2">
          <button
            onClick={() => navigate("/upload")}
            className="text-[#093765] hover:text-blue-600 transition-colors cursor-pointer flex items-center justify-center p-1 rounded-lg hover:bg-slate-200/40 -ml-1"
            aria-label="Back"
          >
            <ArrowLeft className="w-6 h-6" strokeWidth={2.5} />
          </button>
          <h1 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-[#093765] to-blue-600 bg-clip-text text-transparent tracking-tight leading-tight py-1">
            {label}
          </h1>
        </div>

        <div className="max-w-md mx-auto w-full space-y-4 sm:space-y-6">
          {/* Sheet Type Preview */}
          <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-xl overflow-hidden">
            <CardContent className="p-6 sm:p-8">
              <div className="flex flex-col items-center gap-4">
                {/* Visual preview */}
                <div
                  className={`w-32 h-44 sm:w-40 sm:h-56 rounded-lg border-2 flex items-center justify-center transition-all duration-500 shadow-lg ${
                    isGraph
                      ? "border-emerald-300 bg-white"
                      : "border-slate-300 bg-white"
                  }`}
                  style={{
                    backgroundImage: isGraph
                      ? "linear-gradient(rgba(16, 185, 129, 0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.15) 1px, transparent 1px)"
                      : "none",
                    backgroundSize: isGraph ? "8px 8px" : "auto",
                  }}
                >
                  {isGraph ? (
                    <Grid3X3 className="w-12 h-12 text-emerald-400/60" />
                  ) : (
                    <FileText className="w-12 h-12 text-slate-300" />
                  )}
                </div>

                <div className="text-center">
                  <h3
                    className="text-lg font-bold text-slate-800"
                    style={{ fontFamily: "'Outfit', sans-serif" }}
                  >
                    {label}
                  </h3>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Print Destination Selection */}
          <Card className="border-0 shadow-xl bg-white/80 backdrop-blur hover:shadow-xl transition-all duration-300 gap-0">
            <CardHeader className="px-4 pt-4 pb-2 flex flex-row items-start gap-3 space-y-0">
              <div className="p-2 bg-blue-50/80 rounded-xl shrink-0 -mt-0.5">
                <MapPin className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex flex-col gap-0.5">
                <CardTitle className="text-lg font-extrabold text-slate-900">
                  Where do you want to print this?
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div 
                onClick={() => setDirectKioskId("CV-001")}
                className={`group p-3 rounded-2xl border-2 cursor-pointer transition-all duration-300 flex items-center justify-between gap-4 ${
                  directKioskId === 'CV-001' 
                    ? 'border-[#093765] bg-gradient-to-r from-blue-50/30 to-slate-50/20 shadow-md hover:scale-[1.01] hover:-translate-y-[1px]' 
                    : 'border-slate-300 hover:border-slate-400 bg-white hover:scale-[1.01] hover:-translate-y-[1px] hover:shadow-sm'
                } active:scale-[0.99]`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl transition-all duration-300 ${
                    directKioskId === 'CV-001' ? 'bg-[#093765] text-white shadow-sm scale-105' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'
                  }`}>
                    <Printer className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <p className={`text-sm font-bold flex items-center gap-2 transition-colors ${
                      directKioskId === 'CV-001' ? 'text-[#093765]' : 'text-slate-700'
                    }`}>
                      MIMO 1.0
                      <Badge className="bg-slate-700 hover:bg-slate-800 text-[9px] py-0 px-1.5 h-4 leading-4 text-white font-black tracking-wide border-0 shadow-xs">
                        B&W
                      </Badge>
                    </p>
                    <p className="text-sm font-medium text-slate-500 leading-normal mt-0.5 pb-0.5">C. V. Raman Block</p>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 shrink-0 ${
                  directKioskId === 'CV-001' 
                    ? 'bg-[#093765] border-[#093765] text-white scale-110 shadow-xs' 
                    : 'border-slate-200 bg-transparent'
                }`}>
                  {directKioskId === 'CV-001' && <Check className="w-3 h-3" strokeWidth={3} />}
                </div>
              </div>

              <div 
                onClick={() => setDirectKioskId("SV-002")}
                className={`group p-3 rounded-2xl border-2 cursor-pointer transition-all duration-300 flex items-center justify-between gap-4 ${
                  directKioskId === 'SV-002' 
                    ? 'border-[#093765] bg-gradient-to-r from-blue-50/30 to-slate-50/20 shadow-md hover:scale-[1.01] hover:-translate-y-[1px]'
                    : 'border-slate-300 hover:border-slate-400 bg-white hover:scale-[1.01] hover:-translate-y-[1px] hover:shadow-sm'
                } active:scale-[0.99]`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl transition-all duration-300 ${
                    directKioskId === 'SV-002' 
                      ? 'bg-[#093765] text-white shadow-sm scale-105'
                      : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'
                  }`}>
                    <Printer className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <p className={`text-sm font-bold flex items-center gap-2 transition-colors ${
                      directKioskId === 'SV-002' 
                        ? 'text-[#093765]' 
                        : 'text-slate-700'
                    }`}>
                      MIMO 2.0
                      <span className="flex gap-1">
                        <Badge className="bg-slate-700 hover:bg-slate-800 text-[9px] py-0 px-1.5 h-4 leading-4 text-white font-black tracking-wide border-0 shadow-xs">
                          B&W
                        </Badge>
                      </span>
                    </p>
                    <p className="text-sm font-medium text-slate-500 leading-normal mt-0.5 pb-0.5">Swami Vivekananda Block</p>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 shrink-0 ${
                  directKioskId === 'SV-002' 
                    ? 'bg-[#093765] border-[#093765] text-white scale-110 shadow-xs' 
                    : 'border-slate-200 bg-transparent'
                }`}>
                  {directKioskId === 'SV-002' && <Check className="w-3 h-3" strokeWidth={3} />}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Page Count Selector */}
          <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-xl">
            <CardContent className="p-4 sm:p-5">
              <p className="text-sm font-bold text-slate-800 mb-2">
                How many {isGraph ? "graph" : "blank"} sheets do you need?
              </p>
              <div className="flex items-center justify-center gap-4 py-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 rounded-xl border-2 hover:border-blue-400 hover:text-blue-600 active:scale-95 transition-all"
                  onClick={decrement}
                  disabled={pageCount <= 1}
                >
                  <Minus className="w-5 h-5" />
                </Button>
                <div className="flex flex-col items-center min-w-[80px]">
                  <span
                    className="text-5xl font-black text-[#093765] tabular-nums"
                    style={{ fontFamily: "'Outfit', sans-serif" }}
                  >
                    {pageCount}
                  </span>
                  <span className="text-xs text-slate-500 font-medium mt-1">
                    {pageCount === 1 ? "page" : "pages"}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 rounded-xl border-2 hover:border-blue-400 hover:text-blue-600 active:scale-95 transition-all"
                  onClick={increment}
                  disabled={pageCount >= 200}
                >
                  <Plus className="w-5 h-5" />
                </Button>
              </div>

              {/* Quick select buttons */}
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                {[5, 10, 25, 50, 100].map((num) => (
                  <button
                    key={num}
                    onClick={() => setPageCount(num)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 border ${
                      pageCount === num
                        ? "bg-[#093765] text-white border-[#093765] shadow-md"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:border-blue-300 hover:bg-blue-50"
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="pt-4 pb-8">
            <Button
              className="w-full h-14 text-base bg-gradient-to-r from-[#093765] to-blue-700 hover:from-[#052345] hover:to-blue-800 text-white shadow-xl shadow-blue-900/20 transition-all duration-300 font-bold uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2"
              onClick={handleContinue}
              disabled={isProcessing}
            >
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : "Continue to Checkout"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
