import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Separator } from "../components/ui/separator";
import { Badge } from "../components/ui/badge";
import { MimoCoinsDisplay } from "../components/mimo-coins-display";
import { MimoHeader } from "../components/mimo-header";
import { ArrowLeft, FileText, Minus, Plus, Eye, Printer } from "lucide-react";

interface UploadedFile {
  name: string;
  size: number;
}

export function PrintOptions() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [copies, setCopies] = useState(1);
  const [colorMode, setColorMode] = useState("bw");
  const [doubleSided, setDoubleSided] = useState("single");
  const [pageSelection, setPageSelection] = useState("all");
  const [pageRange, setPageRange] = useState("");
  const [orientation, setOrientation] = useState("portrait");
  const [photoLayout, setPhotoLayout] = useState("1");
  const [selectedPreview, setSelectedPreview] = useState<number | null>(null);

  // Standard grid layouts
  const gridLayouts = [
    { id: "2", label: "2 per page", cols: 1, rows: 2, desc: "1×2 grid" },
    { id: "4", label: "4 per page", cols: 2, rows: 2, desc: "2×2 grid" },
    { id: "6", label: "6 per page", cols: 2, rows: 3, desc: "2×3 grid" },
    { id: "9", label: "9 per page", cols: 3, rows: 3, desc: "3×3 grid" },
  ];

  useEffect(() => {
    const storedFiles = sessionStorage.getItem("printFiles");
    const uploadAmount = sessionStorage.getItem("uploadAmount");
    const uploadTotalPages = sessionStorage.getItem("uploadTotalPages");

    if (!storedFiles) {
      navigate("/");
      return;
    }

    setFiles(JSON.parse(storedFiles));
    if (uploadTotalPages) setTotalPages(Number(uploadTotalPages));
    if (uploadAmount) setBaseTotalCost(Number(uploadAmount));
  }, [navigate]);

  const [totalPages, setTotalPages] = useState(0);
  const [baseTotalCost, setBaseTotalCost] = useState(0);

  const actualPages = doubleSided === "double" ? Math.ceil(totalPages / 2) : totalPages;

  // Pricing
  const pricePerPageBW = 2.30;
  const pricePerPageColor = 10.00;
  const basePrice = colorMode === "bw" ? pricePerPageBW : pricePerPageColor;
  
  // If we have the total cost from the backend, use it as a base, otherwise calculate
  const totalCost = baseTotalCost > 0 ? (baseTotalCost / totalPages) * actualPages * copies : actualPages * copies * basePrice;

  const handleContinue = () => {
    // Store print options for payment page
    sessionStorage.setItem("printOptions", JSON.stringify({
      copies,
      colorMode,
      doubleSided,
      pageSelection,
      pageRange,
      orientation,
      photoLayout,
      totalPages: actualPages * copies,
      totalCost
    }));
    navigate("/payment");
  };

  const incrementCopies = () => {
    if (copies < 99) setCopies(copies + 1);
  };

  const decrementCopies = () => {
    if (copies > 1) setCopies(copies - 1);
  };

  return (
    <div className="min-h-[100dvh] w-full bg-slate-50/50 px-3 py-2 sm:p-4">
      <div className="mx-auto max-w-6xl space-y-3 sm:space-y-5">

        {/* Header */}
        <MimoHeader />

        <div className="flex items-start gap-1 sm:gap-3 pb-2 sm:pb-3">
          <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-200/50 hover:text-[#093765] flex-shrink-0 h-9 w-9 sm:h-11 sm:w-11 mt-0 sm:mt-0.5 -ml-2" onClick={() => navigate("/upload")}>
            <ArrowLeft className="w-4 h-4 sm:w-6 sm:h-6" strokeWidth={2.5} />
          </Button>
          <div className="min-w-0 pt-1 sm:pt-1.5 flex flex-col">
            <h1 className="text-2xl sm:text-4xl font-extrabold bg-gradient-to-r from-[#093765] to-blue-700 bg-clip-text text-transparent tracking-tight leading-none mb-1.5">Print Configuration</h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">Customize how you want your documents to look</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          {/* Options Panel */}
          <div className="lg:col-span-2 space-y-3 sm:space-y-4">
            {/* Number of Copies - Compact */}
            <Card className="border-0 shadow-sm bg-white/80 backdrop-blur p-3 hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-slate-800">Number of Copies</p>
                  <p className="text-[10px] text-slate-500">Select quantity</p>
                </div>
                <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg border bg-white hover:text-blue-600 active:scale-95 transition-all"
                    onClick={decrementCopies}
                    disabled={copies <= 1}
                  >
                    <Minus className="w-3 h-3" />
                  </Button>
                  <span className="w-8 text-center text-sm font-black text-slate-800">{copies}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg border bg-white hover:text-blue-600 active:scale-95 transition-all"
                    onClick={incrementCopies}
                    disabled={copies >= 99}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </Card>

            {/* Color Mode - Compact Toggle */}
            <Card className="border-0 shadow-sm bg-white/80 backdrop-blur p-3 hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-slate-800">Color Mode</p>
                  <p className="text-[10px] text-slate-500">₹{pricePerPageBW}/page • B&W</p>
                </div>
                <div className="flex items-center bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                  <button
                    onClick={() => setColorMode("bw")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-300 ${colorMode === "bw" ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"}`}
                  >
                    B&W
                  </button>
                  <button
                    disabled
                    className="px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-300 text-slate-400 cursor-not-allowed flex items-center gap-1.5 opacity-50"
                  >
                    Color
                    <Badge variant="secondary" className="text-[7px] font-black uppercase tracking-wider bg-slate-200/50 text-slate-400 py-0 px-1.5 rounded-full border-0 leading-tight">Soon</Badge>
                  </button>
                </div>
              </div>
            </Card>

            {/* Print Layout - Compact Toggle */}
            <Card className="border-0 shadow-sm bg-white/80 backdrop-blur p-3 hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-800">Print Layout</p>
                    <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 px-1.5 py-0 text-[8px] sm:text-[9px] uppercase tracking-wider font-bold">
                      Eco
                    </Badge>
                  </div>
                  <p className="text-[10px] text-slate-500">Single or double-sided</p>
                </div>
                <div className="flex items-center bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                  <button
                    onClick={() => setDoubleSided("single")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-300 ${doubleSided === "single" ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"}`}
                  >
                    1-Sided
                  </button>
                  <button
                    onClick={() => setDoubleSided("double")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-300 ${doubleSided === "double" ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"}`}
                  >
                    2-Sided
                  </button>
                </div>
              </div>
            </Card>

            {/* Page Selection - Compact Toggle */}
            <Card className="border-0 shadow-sm bg-white/80 backdrop-blur p-3 hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-slate-800">Pages to Print</p>
                  <p className="text-[10px] text-slate-500">{pageSelection === "all" ? "All pages" : "Custom range"}</p>
                </div>
                <div className="flex items-center bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                  <button
                    onClick={() => setPageSelection("all")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-300 ${pageSelection === "all" ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setPageSelection("custom")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-300 ${pageSelection === "custom" ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"}`}
                  >
                    Custom
                  </button>
                </div>
              </div>
              {pageSelection === "custom" && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-1.5 animate-in slide-in-from-top-1 fade-in duration-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-1">Page Numbers</span>
                  <Input
                    type="text"
                    placeholder="e.g. 1-5, 8, 11-13"
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                    className="bg-slate-50 border-2 border-slate-200/80 shadow-inner h-10 w-full text-slate-800 placeholder:text-slate-400 focus-visible:ring-indigo-500 focus-visible:border-indigo-500 focus-visible:bg-white font-medium"
                  />
                </div>
              )}
            </Card>

            {/* Orientation & Layout */}
            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur hover:shadow-xl transition-all duration-300">
              <CardHeader className="pb-3">
                <CardTitle>Layout & Orientation</CardTitle>
                <CardDescription>Set page orientation and how content is arranged</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Orientation Toggle */}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-800">Orientation</p>
                    <p className="text-[10px] text-slate-500">Page direction</p>
                  </div>
                  <div className="flex items-center bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                    <button
                      onClick={() => setOrientation("portrait")}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-300 flex items-center gap-1.5 ${orientation === "portrait" ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"}`}
                    >
                      <div className={`w-3 h-4 rounded-[2px] border-2 ${orientation === "portrait" ? "border-blue-500" : "border-slate-400"}`} />
                      Portrait
                    </button>
                    <button
                      onClick={() => setOrientation("landscape")}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-300 flex items-center gap-1.5 ${orientation === "landscape" ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"}`}
                    >
                      <div className={`w-4 h-3 rounded-[2px] border-2 ${orientation === "landscape" ? "border-blue-500" : "border-slate-400"}`} />
                      Landscape
                    </button>
                  </div>
                </div>

                <Separator className="opacity-50" />

                {/* Grid Layout */}
                <div>
                  <p className="text-sm font-bold text-slate-800 mb-1">Layout</p>
                  <p className="text-[10px] text-slate-500 mb-3">Arrange multiple pages or images on a single sheet</p>

                  <div className="flex gap-2">
                    {gridLayouts.map((layout) => {
                      const isSelected = photoLayout === layout.id;
                      return (
                        <button
                          key={layout.id}
                          onClick={() => setPhotoLayout(layout.id)}
                          className={`flex-1 flex flex-col items-center gap-2 p-2.5 sm:p-3 rounded-xl border-2 transition-all duration-300 cursor-pointer ${isSelected
                              ? "border-blue-500 bg-blue-50/70 shadow-md scale-[1.03]"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                            }`}
                        >
                          {/* Mini page with grid */}
                          <div
                            className={`w-8 h-10 sm:w-10 sm:h-13 rounded border-2 p-[3px] grid transition-all duration-300 ${isSelected
                                ? "border-blue-400 bg-blue-50"
                                : "border-slate-300 bg-slate-50"
                              }`}
                            style={{
                              gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
                              gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
                              gap: "2px",
                            }}
                          >
                            {Array.from({ length: layout.cols * layout.rows }).map((_, i) => (
                              <div
                                key={i}
                                className={`rounded-[2px] transition-colors duration-300 ${isSelected ? "bg-blue-400" : "bg-slate-300"
                                  }`}
                              />
                            ))}
                          </div>
                          <div className="text-center">
                            <p className={`text-[11px] sm:text-xs font-bold transition-colors ${isSelected ? "text-blue-700" : "text-slate-700"
                              }`}>
                              {layout.label}
                            </p>
                            <p className="text-[8px] sm:text-[9px] text-slate-400">{layout.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* File Preview */}
            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur hover:shadow-xl transition-all duration-300">
              <CardHeader>
                <CardTitle>Document Preview</CardTitle>
                <CardDescription>Files ready to print</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border border-gray-100 rounded-xl hover:bg-slate-50 transition-all duration-200"
                    >
                      <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-gray-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-gray-500">Document {index + 1}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm" className="hover:text-indigo-600 transition-colors"
                        onClick={() => setSelectedPreview(index)}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Preview
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cost Summary - Premium Dark Style */}
          <div className="lg:col-span-1 sticky top-6">
            <Card className="border-0 bg-gradient-to-br from-[#093765] to-blue-600 text-white overflow-hidden animate-in fade-in duration-500 rounded-2xl sm:rounded-[2rem] shadow-2xl relative group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                <Printer className="w-32 h-32 rotate-12" />
              </div>
              <CardHeader className="border-b border-white/5 pb-4 sm:pb-6 bg-white/[0.02] px-4 sm:px-6 pt-4 sm:pt-6 relative z-10">
                <CardTitle className="text-lg sm:text-xl font-bold tracking-tight">Cost Summary</CardTitle>
                <CardDescription className="text-blue-100/70 text-xs">Final printing breakdown</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 sm:space-y-5 p-4 sm:p-6 relative z-10">
                <div className="space-y-3 sm:space-y-4 font-medium text-xs">
                  <div className="flex justify-between items-center text-blue-100/90">
                    <span>Documents</span>
                    <span className="text-white font-bold">{files.length}</span>
                  </div>
                  <div className="flex justify-between items-center text-blue-100/90">
                    <span>Total Pages</span>
                    <span className="text-white font-bold">{totalPages}</span>
                  </div>
                  <div className="flex justify-between items-center text-blue-100/90">
                    <span>Copies</span>
                    <span className="text-blue-400 font-bold">{copies}x</span>
                  </div>
                </div>

                <div className="border-t border-dashed border-white/20 w-full my-3 sm:my-4" />

                <div className="space-y-3 sm:space-y-4 font-medium text-xs">
                  <div className="flex justify-between items-center text-blue-100/90">
                    <span>Price / Page</span>
                    <span className="text-emerald-400 font-bold">₹{basePrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-blue-100/90">
                    <span>Total Sheets</span>
                    <span className="text-white font-bold">{actualPages * copies}</span>
                  </div>
                </div>

                <div className="border-t border-dashed border-white/20 w-full my-3 sm:my-4" />

                <div className="flex justify-between items-center py-1 sm:py-2">
                  <span className="font-bold text-base sm:text-lg">Total Payable</span>
                  <div className="text-right">
                    <span className="text-2xl sm:text-3xl font-black text-white tracking-tighter block">
                      ₹{totalCost.toFixed(2)}
                    </span>
                  </div>
                </div>

                <Button
                  className="w-full h-12 sm:h-14 bg-[#093765] hover:bg-[#052345] border border-white/10 text-white font-bold text-sm sm:text-base rounded-xl sm:rounded-2xl shadow-xl shadow-black/20 hover:shadow-2xl hover:shadow-black/30 transition-all duration-300 active:scale-95 flex items-center justify-center gap-3"
                  onClick={handleContinue}
                >
                  Continue to Pay
                </Button>

                {doubleSided === "double" && (
                  <div className="flex items-center justify-center gap-2 pt-1 opacity-80">
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20 py-1 px-3">
                      🌱 Saving {totalPages - actualPages} sheets
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Preview Modal (placeholder) */}
        {selectedPreview !== null && (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedPreview(null)}
          >
            <Card className="max-w-2xl w-full animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
              <CardHeader>
                <CardTitle>Document Preview</CardTitle>
                <CardDescription>{files[selectedPreview]?.name}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-100 rounded-lg p-8 text-center min-h-96 flex items-center justify-center">
                  <div>
                    <FileText className="w-24 h-24 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600 font-bold">Preview not available</p>
                    <p className="text-sm text-gray-500 mt-2">
                      Document will be printed as uploaded
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setSelectedPreview(null)}>
                    Close
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
