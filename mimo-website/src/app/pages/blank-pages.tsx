import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { MimoHeader } from "../components/mimo-header";
import { ArrowLeft, Minus, Plus, FileText, Grid3X3 } from "lucide-react";

export function BlankPages() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type") || "a4"; // "a4" or "graph"
  const [pageCount, setPageCount] = useState(1);

  const isGraph = type === "graph";
  const label = isGraph ? "Mimo Graph Sheet" : "A4 Blank Sheet";
  const pricePerPage = isGraph ? 3.00 : 2.00;
  const totalCost = pageCount * pricePerPage;

  const increment = () => {
    if (pageCount < 200) setPageCount(pageCount + 1);
  };

  const decrement = () => {
    if (pageCount > 1) setPageCount(pageCount - 1);
  };

  const fileName = isGraph ? "mimo_graph.pdf" : "blank_a4.pdf";

  const handleContinue = () => {
    // Store as printFiles (as a virtual file entry for consistency)
    sessionStorage.setItem(
      "printFiles",
      JSON.stringify([
        {
          name: fileName,
          size: 1024 * 50, // 50KB mock size
          status: "completed",
          progress: 100,
        },
      ])
    );

    // Store print options for payment page
    sessionStorage.setItem(
      "printOptions",
      JSON.stringify({
        copies: 1,
        colorMode: "bw",
        doubleSided: "single",
        pageSelection: "all",
        pageRange: "",
        orientation: "portrait",
        totalPages: pageCount,
        totalCost,
        isBlankSheet: true,
        sheetType: type,
      })
    );

    navigate("/payment");
  };

  return (
    <div className="min-h-[100dvh] w-full bg-slate-50/50 p-2 sm:p-4">
      <div className="mx-auto max-w-5xl space-y-3 sm:space-y-5">
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

        <div className="flex items-center gap-4 pb-2">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full hover:bg-white hover:shadow-sm"
            onClick={() => navigate("/upload")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-[#093765] to-blue-600 bg-clip-text text-transparent">
              {label}
            </h1>
            <p className="text-slate-500">
              {isGraph
                ? "Get graph paper sheets printed for your needs"
                : "Get blank A4 sheets printed"}
            </p>
          </div>
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
                  <p className="text-sm text-slate-500 mt-1">
                    {isGraph
                      ? "Standard graph paper with grid lines"
                      : "Plain white A4 sheet"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Page Count Selector */}
          <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Number of Pages</CardTitle>
              <CardDescription>
                Select how many {isGraph ? "graph" : "blank"} sheets you need
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center gap-4 py-4">
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
              className="w-full h-14 text-base bg-gradient-to-r from-[#093765] to-blue-700 hover:from-[#052345] hover:to-blue-800 text-white shadow-xl shadow-blue-900/20 transition-all duration-300 font-bold uppercase tracking-wider rounded-2xl"
              onClick={handleContinue}
            >
              Continue to Checkout
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
