import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Separator } from "../components/ui/separator";
import { Badge } from "../components/ui/badge";
import { MimoCoinsDisplay } from "../components/mimo-coins-display";
import { MimoHeader } from "../components/mimo-header";
import { ArrowLeft, FileText, Minus, Plus, Eye, Printer, Palette, Contrast, File, Files, Copy, Sliders, MapPin, Grid3X3 } from "lucide-react";

interface UploadedFile {
  name: string;
  size: number;
}

// Parse range string (e.g. "1-3,5") to list of page numbers
const parsePageRange = (rangeStr: string, maxPages: number): number[] => {
  const selected: number[] = [];
  const cleaned = rangeStr.replace(/\s+/g, "");
  if (!cleaned) return [];
  
  const parts = cleaned.split(",");
  for (const part of parts) {
    if (!part) continue;
    if (part.includes("-")) {
      const rangeParts = part.split("-");
      if (rangeParts.length === 2) {
        const start = parseInt(rangeParts[0], 10);
        const end = parseInt(rangeParts[1], 10);
        if (!isNaN(start) && !isNaN(end) && start > 0 && end >= start) {
          for (let i = start; i <= Math.min(end, maxPages); i++) {
            selected.push(i);
          }
        }
      }
    } else {
      const val = parseInt(part, 10);
      if (!isNaN(val) && val > 0 && val <= maxPages) {
        selected.push(val);
      }
    }
  }
  return Array.from(new Set(selected)).sort((a, b) => a - b);
};

// Generate compact range string (e.g. [1,2,3,5] -> "1-3,5")
const generatePageRange = (selectedPages: number[], maxPages: number): string => {
  if (selectedPages.length === 0) return "";
  if (selectedPages.length === maxPages) return `1-${maxPages}`;
  
  const sorted = [...selectedPages].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];
  
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      if (start === end) {
        ranges.push(`${start}`);
      } else {
        ranges.push(`${start}-${end}`);
      }
      start = sorted[i];
      end = sorted[i];
    }
  }
  if (start === end) {
    ranges.push(`${start}`);
  } else {
    ranges.push(`${start}-${end}`);
  }
  return ranges.join(",");
};

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
  const [directKioskId, setDirectKioskId] = useState<string | null>(null);

  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [fileConfigs, setFileConfigs] = useState<Record<string, {
    pageSelection: "all" | "custom";
    pageRange: string;
    selectedPages: number[];
  }>>({});

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

    const parsedFiles = JSON.parse(storedFiles);
    setFiles(parsedFiles);
    
    // Initialize configs
    const initialConfigs: Record<string, {
      pageSelection: "all" | "custom";
      pageRange: string;
      selectedPages: number[];
    }> = {};
    parsedFiles.forEach((file: any) => {
      const pCount = file.pageCount || 1;
      initialConfigs[file.name] = {
        pageSelection: "all",
        pageRange: `1-${pCount}`,
        selectedPages: Array.from({ length: pCount }, (_, i) => i + 1)
      };
    });
    setFileConfigs(initialConfigs);

    if (uploadTotalPages) setTotalPages(Number(uploadTotalPages));
    if (uploadAmount) setBaseTotalCost(Number(uploadAmount));


    // Scroll to top when page loads
    window.scrollTo(0, 0);
  }, [navigate]);

  // Only true if there are actual images (not PDFs)
  const actualImages = files.filter(f => f.type && f.type.startsWith('image/')).map(f => ({
    name: f.name,
    mimetype: f.type,
    dataUrl: (f as any).url
  }));
  const hasImages = actualImages.length > 0;

  const [totalPages, setTotalPages] = useState(0);
  const [baseTotalCost, setBaseTotalCost] = useState(0);

  // Recalculate totalPages when fileConfigs or pageSelection changes
  useEffect(() => {
    if (files.length === 0 || Object.keys(fileConfigs).length === 0) return;
    
    let totalPrintedPages = 0;
    files.forEach((file) => {
      const config = fileConfigs[file.name];
      if (config) {
        if (pageSelection === "all") {
          totalPrintedPages += (file.pageCount || 1);
        } else {
          totalPrintedPages += config.selectedPages.length;
        }
      } else {
        totalPrintedPages += (file.pageCount || 1);
      }
    });
    
    setTotalPages(totalPrintedPages);
  }, [fileConfigs, pageSelection, files]);

  // Handler to toggle a single page
  const handleTogglePage = (fileName: string, pageNum: number) => {
    setFileConfigs((prev) => {
      const config = prev[fileName];
      if (!config) return prev;
      
      const maxPages = files.find(f => f.name === fileName)?.pageCount || 1;
      let newSelected = [...config.selectedPages];
      if (newSelected.includes(pageNum)) {
        newSelected = newSelected.filter(p => p !== pageNum);
      } else {
        newSelected.push(pageNum);
      }
      newSelected.sort((a, b) => a - b);
      
      return {
        ...prev,
        [fileName]: {
          ...config,
          selectedPages: newSelected,
          pageRange: generatePageRange(newSelected, maxPages)
        }
      };
    });
  };

  // Handler for quick actions
  const handleQuickSelect = (fileName: string, type: "first-half" | "second-half" | "odds" | "evens") => {
    setFileConfigs((prev) => {
      const config = prev[fileName];
      if (!config) return prev;
      
      const maxPages = files.find(f => f.name === fileName)?.pageCount || 1;
      let newSelected: number[] = [];
      if (type === "first-half") {
        const mid = Math.ceil(maxPages / 2);
        for (let i = 1; i <= mid; i++) newSelected.push(i);
      } else if (type === "second-half") {
        const mid = Math.ceil(maxPages / 2);
        for (let i = mid + 1; i <= maxPages; i++) newSelected.push(i);
      } else if (type === "odds") {
        for (let i = 1; i <= maxPages; i += 2) newSelected.push(i);
      } else if (type === "evens") {
        for (let i = 2; i <= maxPages; i += 2) newSelected.push(i);
      }
      
      return {
        ...prev,
        [fileName]: {
          ...config,
          selectedPages: newSelected,
          pageRange: generatePageRange(newSelected, maxPages)
        }
      };
    });
  };

  // Handler for manual text input change
  const handleTextRangeChange = (fileName: string, text: string) => {
    setFileConfigs((prev) => {
      const config = prev[fileName];
      if (!config) return prev;
      
      const maxPages = files.find(f => f.name === fileName)?.pageCount || 1;
      const newSelected = parsePageRange(text, maxPages);
      
      return {
        ...prev,
        [fileName]: {
          ...config,
          pageRange: text,
          selectedPages: newSelected
        }
      };
    });
  };

  // Handler to update page count manually (e.g. for non-PDFs)
  const handleUpdatePageCount = (fileName: string, newCount: number) => {
    // 1. Update files state
    const updatedFiles = files.map(f => {
      if (f.name === fileName) {
        return { ...f, pageCount: newCount };
      }
      return f;
    });
    setFiles(updatedFiles);
    sessionStorage.setItem("printFiles", JSON.stringify(updatedFiles));

    // 2. Update fileConfigs
    setFileConfigs(prev => {
      const config = prev[fileName];
      if (!config) return prev;
      return {
        ...prev,
        [fileName]: {
          ...config,
          pageRange: `1-${newCount}`,
          selectedPages: Array.from({ length: newCount }, (_, i) => i + 1)
        }
      };
    });
  };

  // Handler to toggle page selection globally (All vs Custom)
  const handlePageSelectionChange = (val: "all" | "custom") => {
    setPageSelection(val);
    setFileConfigs((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach(fileName => {
        updated[fileName] = {
          ...updated[fileName],
          pageSelection: val
        };
      });
      return updated;
    });
  };

  let sheetsNeeded = totalPages;
  if (hasImages && photoLayout !== "1") {
    sheetsNeeded = Math.ceil(totalPages / Number(photoLayout));
  }
  const actualPages = doubleSided === "double" ? Math.ceil(sheetsNeeded / 2) : sheetsNeeded;

  // Pricing
  const pricePerPageBW = 2.30;
  const pricePerPageColor = 10.00; // Updated as per requirements
  const basePrice = colorMode === "bw" ? pricePerPageBW : pricePerPageColor;
  
  const totalCost = actualPages * copies * basePrice;

  // Check if any file configured for "custom" has 0 pages selected
  let hasSelectionError = false;
  if (pageSelection === "custom") {
    files.forEach((file) => {
      const config = fileConfigs[file.name];
      if (!config || config.selectedPages.length === 0) {
        hasSelectionError = true;
      }
    });
  }

  const handleContinue = () => {
    // Prepare simplified fileConfigs to save in sessionStorage
    const simplifiedConfigs: Record<string, { pageSelection: string; pageRange: string; pageCount: number }> = {};
    Object.keys(fileConfigs).forEach(fileName => {
      simplifiedConfigs[fileName] = {
        pageSelection: fileConfigs[fileName].pageSelection,
        pageRange: fileConfigs[fileName].pageRange,
        pageCount: files.find(f => f.name === fileName)?.pageCount || 1
      };
    });

    // Clean the Kiosk ID for the backend (SV-002-COLOR -> SV-002)
    const cleanKioskId = directKioskId?.startsWith("SV-002") ? "SV-002" : directKioskId;

    // Store print options for payment page
    sessionStorage.setItem("printOptions", JSON.stringify({
      copies,
      colorMode,
      doubleSided,
      pageSelection,
      pageRange: files.length > 0 ? (fileConfigs[files[0].name]?.pageRange || "") : "", // fallback
      fileConfigs: simplifiedConfigs,
      totalCost,
      totalPages: actualPages, // Store actual printable pages per set
      directKioskId: cleanKioskId
    }));

    navigate("/payment");
  };

  const incrementCopies = () => {
    if (copies < 99) setCopies(copies + 1);
  };

  const decrementCopies = () => {
    if (copies > 1) setCopies(copies - 1);
  };

  const printDestinationCard = (
    <Card className="border-0 shadow-lg bg-white/80 backdrop-blur hover:shadow-xl transition-all duration-300">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="w-5 h-5 text-blue-600" /> Print Destination
        </CardTitle>
        <CardDescription>Where do you want to print this?</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div 
          onClick={() => { setDirectKioskId(null); }}
          className={`p-3 rounded-xl border-2 cursor-pointer transition-all duration-300 ${directKioskId === null ? 'border-blue-500 bg-blue-50/50 shadow-md' : 'border-slate-200 hover:border-slate-300'}`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${directKioskId === null ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
              <MonitorSmartphone className="w-5 h-5" />
            </div>
            <div>
              <p className={`text-sm font-bold ${directKioskId === null ? 'text-blue-900' : 'text-slate-700'}`}>Any Kiosk (Use Print Code)</p>
              <p className="text-[10px] text-slate-500 leading-tight">Pay now, then enter the 4-digit code at any tablet.</p>
            </div>
          </div>
        </div>

        <div 
          onClick={() => { setDirectKioskId("CV-001"); setColorMode("bw"); }}
          className={`p-3 rounded-xl border-2 cursor-pointer transition-all duration-300 ${directKioskId === 'CV-001' ? 'border-slate-600 bg-slate-50/50 shadow-md' : 'border-slate-200 hover:border-slate-300'}`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${directKioskId === 'CV-001' ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-500'}`}>
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <p className={`text-sm font-bold flex items-center gap-2 ${directKioskId === 'CV-001' ? 'text-slate-900' : 'text-slate-700'}`}>
                KIOSK-001-CV <Badge className="bg-slate-700 hover:bg-slate-800 text-[9px] py-0 px-1.5 h-4 leading-4 text-white">B&W</Badge>
              </p>
              <p className="text-[10px] text-slate-500 leading-tight">Directly print to Reva Boys Hostel in Black & White.</p>
            </div>
          </div>
        </div>

        <div 
          onClick={() => { setDirectKioskId("SV-002-BW"); setColorMode("bw"); }}
          className={`p-3 rounded-xl border-2 cursor-pointer transition-all duration-300 ${directKioskId === 'SV-002-BW' ? 'border-slate-600 bg-slate-50/50 shadow-md' : 'border-slate-200 hover:border-slate-300'}`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${directKioskId === 'SV-002-BW' ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-500'}`}>
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <p className={`text-sm font-bold flex items-center gap-2 ${directKioskId === 'SV-002-BW' ? 'text-slate-900' : 'text-slate-700'}`}>
                KIOSK-002-SV <Badge className="bg-slate-700 hover:bg-slate-800 text-[9px] py-0 px-1.5 h-4 leading-4 text-white">B&W</Badge>
              </p>
              <p className="text-[10px] text-slate-500 leading-tight">Directly print to Reva Girls Hostel in Black & White.</p>
            </div>
          </div>
        </div>

        <div 
          onClick={() => { setDirectKioskId("SV-002-COLOR"); setColorMode("color"); }}
          className={`p-3 rounded-xl border-2 cursor-pointer transition-all duration-300 ${directKioskId === 'SV-002-COLOR' ? 'border-pink-500 bg-gradient-to-r from-pink-50/50 to-blue-50/50 shadow-md' : 'border-slate-200 hover:border-slate-300'}`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${directKioskId === 'SV-002-COLOR' ? 'bg-[conic-gradient(at_top_right,_var(--tw-gradient-stops))] from-yellow-100 via-pink-200 to-blue-200 text-pink-700' : 'bg-slate-100 text-slate-500'}`}>
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <p className={`text-sm font-bold flex items-center gap-2 ${directKioskId === 'SV-002-COLOR' ? 'text-pink-900' : 'text-slate-700'}`}>
                KIOSK-002-SV <Badge className="bg-gradient-to-r from-yellow-400 via-pink-500 to-blue-500 border-0 hover:opacity-90 text-[9px] py-0 px-1.5 h-4 leading-4 text-white">COLOR</Badge>
              </p>
              <p className="text-[10px] text-slate-500 leading-tight">Directly print to Reva Girls Hostel in vibrant Color.</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-[100dvh] w-full bg-slate-50/50 px-3 py-2 sm:p-4" style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* Global Styles for Custom Fonts */}
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');
        `}
      </style>
      <div className="mx-auto max-w-6xl space-y-3 sm:space-y-5">

        {/* Header */}
        <MimoHeader />

        <div className="flex items-start gap-1 sm:gap-3 pb-2 sm:pb-3">
          <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-200/50 hover:text-[#093765] flex-shrink-0 h-9 w-9 sm:h-11 sm:w-11 mt-0 sm:mt-0.5 -ml-2" onClick={() => navigate("/upload")}>
            <ArrowLeft className="w-4 h-4 sm:w-6 sm:h-6" strokeWidth={2.5} />
          </Button>
          <div className="min-w-0 pt-1 sm:pt-1.5 flex flex-col">
            <h1 className="text-2xl sm:text-4xl font-extrabold bg-gradient-to-r from-[#093765] to-blue-700 bg-clip-text text-transparent tracking-tight leading-tight pb-1 mb-0.5">Print Configuration</h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">Customize how you want your documents to look</p>
          </div>
        </div>

        {/* Mobile Print Destination (Visible only on mobile) */}
        <div className="block lg:hidden">
          {printDestinationCard}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          {/* Options Panel */}
          <div className="lg:col-span-2 space-y-3 sm:space-y-4">
            {/* Number of Copies - Responsive & Interactive */}
            <Card className="border-0 shadow-sm bg-white/80 backdrop-blur p-3 hover:shadow-md transition-all duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <div>
                  <p className="text-sm font-bold text-slate-800">Number of Copies</p>
                  <p className="text-[10px] text-slate-500 font-medium">Select print quantity</p>
                </div>
                <div className="flex items-center justify-between sm:justify-start gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100 w-full sm:w-auto">
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="h-8 w-8 rounded-lg border bg-white hover:text-[#093765] active:scale-95 transition-all cursor-pointer"
                    onClick={decrementCopies}
                    disabled={copies <= 1}
                  >
                    <Minus className="w-3 h-3" />
                  </Button>
                  <span key={copies} className="w-12 text-center text-sm font-black text-slate-800 animate-pop-in">{copies}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="h-8 w-8 rounded-lg border bg-white hover:text-[#093765] active:scale-95 transition-all cursor-pointer"
                    onClick={incrementCopies}
                    disabled={copies >= 99}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </Card>

            {/* Color Mode - Coming Soon for Color only */}
            <Card className="border-0 shadow-sm bg-white/80 backdrop-blur p-3 hover:shadow-md transition-all duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <div>
                  <p className="text-sm font-bold text-slate-800">Color Mode</p>
                  <p className="text-[10px] text-slate-500 font-medium">₹{pricePerPageBW}/page • B&W Only</p>
                </div>
                <div className="relative flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/50 w-full sm:w-56 h-10 select-none">
                  <button
                    onClick={() => setColorMode("bw")}
                    type="button"
                    className={`control-btn group relative z-10 flex-1 text-center py-1.5 text-xs font-bold rounded-lg transition-all duration-300 flex items-center justify-center gap-2 ${
                      colorMode === "bw"
                        ? "text-[#093765]"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full border overflow-hidden flex shrink-0 transition-all duration-300 group-hover:scale-110 ${
                      colorMode === "bw" ? "scale-110 border-slate-600 rotate-180" : "scale-100 border-slate-400"
                    }`}>
                      <div className="w-1/2 h-full bg-slate-800" />
                      <div className="w-1/2 h-full bg-white" />
                    </div>
                    <span>B&W</span>
                  </button>
                  
                  {/* Fully Enabled Color Button */}
                  <div className="relative flex-1 h-full group">
                    <button
                      type="button"
                      onClick={() => {
                        setColorMode("color");
                        if (directKioskId === "SV-002-BW" || directKioskId === "CV-001") {
                          setDirectKioskId("SV-002-COLOR");
                        }
                      }}
                      className={`control-btn w-full h-full relative z-10 text-center py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all duration-300 ${
                        colorMode === "color" ? "text-[#093765]" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-full shrink-0 transition-all duration-300 ${
                        colorMode === "color" 
                          ? "bg-[conic-gradient(at_top_right,_var(--tw-gradient-stops))] from-yellow-300 via-pink-400 to-blue-500 scale-110 shadow-sm" 
                          : "bg-slate-300 scale-100"
                      }`} />
                      <span>Color</span>
                    </button>
                  </div>

                  {/* Sliding Background Pill */}
                  <div
                    className={`sliding-pill absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-sm border border-slate-200/50 transition-all duration-300 ${
                      colorMode === "bw" ? "translate-x-0" : "translate-x-[calc(100%+4px)]"
                    }`}
                  />
                </div>
              </div>
            </Card>

            {/* Print Layout - Responsive & Interactive Segmented Control */}
            <Card className="border-0 shadow-sm bg-white/80 backdrop-blur p-3 hover:shadow-md transition-all duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-800">Print Layout</p>
                    <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 px-1.5 py-0 text-[8px] sm:text-[9px] uppercase tracking-wider font-bold">
                      Eco
                    </Badge>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium">Single or double-sided</p>
                </div>
                <div className="relative flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/50 w-full sm:w-56 h-10 select-none">
                  <button
                    onClick={() => setDoubleSided("single")}
                    type="button"
                    className={`control-btn group relative z-10 flex-1 text-center py-1.5 text-xs font-bold rounded-lg transition-all duration-300 cursor-pointer active:scale-95 flex items-center justify-center gap-2 ${
                      doubleSided === "single"
                        ? "text-[#093765]"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <File className={`w-3.5 h-3.5 shrink-0 transition-all duration-300 group-hover:scale-110 ${
                      doubleSided === "single" ? "scale-110 text-[#093765]" : "scale-100 text-slate-400"
                    }`} />
                    <span>1-Sided</span>
                  </button>
                  <button
                    onClick={() => setDoubleSided("double")}
                    type="button"
                    className={`control-btn group relative z-10 flex-1 text-center py-1.5 text-xs font-bold rounded-lg transition-all duration-300 cursor-pointer active:scale-95 flex items-center justify-center gap-2 ${
                      doubleSided === "double"
                        ? "text-[#093765]"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Files className={`w-3.5 h-3.5 shrink-0 transition-all duration-300 group-hover:scale-110 ${
                      doubleSided === "double" ? "scale-110 text-[#093765]" : "scale-100 text-slate-400"
                    }`} />
                    <span>2-Sided</span>
                  </button>
                  {/* Sliding Background Pill */}
                  <div
                    className={`sliding-pill absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-sm border border-slate-200/50 transition-all duration-300 ${
                      doubleSided === "single" ? "translate-x-0" : "translate-x-[calc(100%+4px)]"
                    }`}
                  />
                </div>
              </div>
            </Card>

            {/* Page Selection - Responsive & Interactive Segmented Control */}
            <Card className="border-0 shadow-sm bg-white/80 backdrop-blur p-3 hover:shadow-md transition-all duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <div>
                  <p className="text-sm font-bold text-slate-800">Pages to Print</p>
                  <p className="text-[10px] text-slate-500 font-medium">{pageSelection === "all" ? "All pages" : "Custom range"}</p>
                </div>
                <div className="relative flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/50 w-full sm:w-56 h-10 select-none">
                  <button
                    onClick={() => handlePageSelectionChange("all")}
                    type="button"
                    className={`control-btn group relative z-10 flex-1 text-center py-1.5 text-xs font-bold rounded-lg transition-all duration-300 cursor-pointer active:scale-95 flex items-center justify-center gap-2 ${
                      pageSelection === "all"
                        ? "text-[#093765]"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Copy className={`w-3.5 h-3.5 shrink-0 transition-all duration-300 group-hover:scale-110 ${
                      pageSelection === "all" ? "scale-110 text-[#093765]" : "scale-100 text-slate-400"
                    }`} />
                    <span>All Pages</span>
                  </button>
                  <button
                    onClick={() => handlePageSelectionChange("custom")}
                    type="button"
                    className={`control-btn group relative z-10 flex-1 text-center py-1.5 text-xs font-bold rounded-lg transition-all duration-300 cursor-pointer active:scale-95 flex items-center justify-center gap-2 ${
                      pageSelection === "custom"
                        ? "text-[#093765]"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Sliders className={`w-3.5 h-3.5 shrink-0 transition-all duration-300 group-hover:scale-110 ${
                      pageSelection === "custom" ? "scale-110 text-[#093765] rotate-90" : "scale-100 text-slate-400"
                    }`} />
                    <span>Custom</span>
                  </button>
                  {/* Sliding Background Pill */}
                  <div
                    className={`sliding-pill absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-sm border border-slate-200/50 transition-all duration-300 ${
                      pageSelection === "all" ? "translate-x-0" : "translate-x-[calc(100%+4px)]"
                    }`}
                  />
                </div>
              </div>
              
              {pageSelection === "custom" && files.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-3 animate-in slide-in-from-top-1 fade-in duration-200">
                  {/* File Selector Tabs (if multiple files exist) */}
                  {files.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200/40">
                      {files.map((file, idx) => {
                        const isActive = activeFileIndex === idx;
                        const config = fileConfigs[file.name];
                        const selectedCount = config ? config.selectedPages.length : 0;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setActiveFileIndex(idx)}
                            className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                              isActive
                                ? "bg-white text-[#093765] shadow-xs border border-slate-200/50"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            <span className="truncate max-w-[100px]">{file.name}</span>
                            <Badge className="px-1 py-0 text-[9px] bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold border-0">
                              {selectedCount} pgs
                            </Badge>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Active File Config */}
                  {(() => {
                    const activeFile = files[activeFileIndex];
                    if (!activeFile) return null;
                    const config = fileConfigs[activeFile.name] || {
                      pageSelection: "custom",
                      pageRange: "",
                      selectedPages: []
                    };
                    const maxPages = activeFile.pageCount || 1;
                    const pageNumbers = Array.from({ length: maxPages }, (_, i) => i + 1);
                    const isPdf = activeFile.name.toLowerCase().endsWith(".pdf") || (activeFile as any).type === "application/pdf";

                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between pl-1">
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-800 truncate pr-2" title={activeFile.name}>
                              {activeFile.name}
                            </p>
                            <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                              Select pages to print ({maxPages} total pages)
                              {!isPdf && (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const val = prompt(`Enter actual total pages for ${activeFile.name}:`, String(maxPages));
                                    if (val) {
                                      const num = parseInt(val);
                                      if (!isNaN(num) && num > 0) {
                                        handleUpdatePageCount(activeFile.name, num);
                                      }
                                    }
                                  }}
                                  className="ml-2 text-blue-600 underline font-bold hover:text-blue-800 cursor-pointer"
                                >
                                  Change
                                </button>
                              )}
                            </p>
                          </div>
                          {config.selectedPages.length === 0 && (
                            <Badge className="bg-red-100 text-red-700 border-red-200 text-[9px] uppercase font-bold shrink-0">
                              No Pages Selected
                            </Badge>
                          )}
                        </div>

                        {/* Interactive Page Grid */}
                        <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5 p-2 bg-slate-50 rounded-xl border border-slate-100 max-h-48 overflow-y-auto">
                          {pageNumbers.map((num) => {
                            const isSelected = config.selectedPages.includes(num);
                            return (
                              <button
                                key={num}
                                type="button"
                                onClick={() => handleTogglePage(activeFile.name, num)}
                                className={`h-8 w-8 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
                                  isSelected
                                    ? "bg-[#093765] text-white border-[#093765] shadow-xs active:scale-95"
                                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 active:scale-95"
                                }`}
                              >
                                {num}
                              </button>
                            );
                          })}
                        </div>

                        {/* Quick Action Selection Buttons */}
                        <div className="flex flex-wrap gap-1.5 pl-1">
                          <button
                            type="button"
                            onClick={() => handleQuickSelect(activeFile.name, "first-half")}
                            className="px-2.5 py-1 text-[10px] font-bold rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 cursor-pointer transition-all active:scale-95"
                          >
                            First Half
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickSelect(activeFile.name, "second-half")}
                            className="px-2.5 py-1 text-[10px] font-bold rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 cursor-pointer transition-all active:scale-95"
                          >
                            Second Half
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickSelect(activeFile.name, "odds")}
                            className="px-2.5 py-1 text-[10px] font-bold rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 cursor-pointer transition-all active:scale-95"
                          >
                            Odd Pages
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickSelect(activeFile.name, "evens")}
                            className="px-2.5 py-1 text-[10px] font-bold rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 cursor-pointer transition-all active:scale-95"
                          >
                            Even Pages
                          </button>
                        </div>

                        {/* Synced Text Input */}
                        <div className="flex flex-col gap-1 mt-1 pl-1">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                            Or enter page range (e.g., 1-3,5,7-9)
                          </span>
                          <Input
                            type="text"
                            placeholder="e.g. 1-5, 8, 11-13"
                            value={config.pageRange}
                            onChange={(e) => handleTextRangeChange(activeFile.name, e.target.value)}
                            className="bg-slate-50 border-2 border-slate-200/80 shadow-inner h-9 w-full text-slate-800 placeholder:text-slate-400 focus-visible:ring-[#093765] focus-visible:border-[#093765] focus-visible:bg-white font-semibold text-xs rounded-lg"
                          />
                        </div>
                      </div>
                    );
                  })()}
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
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-800">Orientation</p>
                    <p className="text-[10px] text-slate-500 font-medium">Page direction</p>
                  </div>
                  <div className="relative flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/50 w-full sm:w-60 h-10 select-none">
                    <button
                      onClick={() => setOrientation("portrait")}
                      type="button"
                      className={`control-btn group relative z-10 flex-1 text-center py-1.5 text-xs font-bold rounded-lg transition-all duration-300 cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 ${
                        orientation === "portrait"
                          ? "text-[#093765]"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      <div className={`w-3 h-4 rounded-[2px] border-2 transition-all duration-300 group-hover:scale-110 ${
                        orientation === "portrait" ? "scale-110 border-[#093765] bg-[#093765]/10" : "scale-100 border-slate-400"
                      }`} />
                      Portrait
                    </button>
                    <button
                      onClick={() => setOrientation("landscape")}
                      type="button"
                      className={`control-btn group relative z-10 flex-1 text-center py-1.5 text-xs font-bold rounded-lg transition-all duration-300 cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 ${
                        orientation === "landscape"
                          ? "text-[#093765]"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      <div className={`w-4 h-3 rounded-[2px] border-2 transition-all duration-300 group-hover:scale-110 ${
                        orientation === "landscape" ? "scale-110 border-[#093765] bg-[#093765]/10" : "scale-100 border-slate-400"
                      }`} />
                      Landscape
                    </button>
                    {/* Sliding Background Pill */}
                    <div
                      className={`sliding-pill absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-sm border border-slate-200/50 transition-all duration-300 ${
                        orientation === "portrait" ? "translate-x-0" : "translate-x-[calc(100%+4px)]"
                      }`}
                    />
                  </div>
                </div>

                <Separator className="opacity-50" />

                {/* Grid Layout - Image preview for images, placeholder grid for docs */}
                <div className={!hasImages ? "opacity-30 pointer-events-none grayscale blur-[1px] relative select-none" : "relative"}>
                  {!hasImages && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center">
                      <Badge variant="secondary" className="bg-slate-800 text-white shadow-xl px-4 py-1 text-sm rounded-full pointer-events-auto">Layout only available for Images</Badge>
                    </div>
                  )}
                  <p className="text-sm font-bold text-slate-800 mb-1">Layout</p>
                  <p className="text-[10px] text-slate-500 mb-3 font-medium">
                    {hasImages ? "Arrange your photos on a single sheet" : "Photo layout only available for images"}
                  </p>

                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {[
                      { id: "1", label: "1 per page", cols: 1, rows: 1, desc: "Full page" },
                      ...gridLayouts,
                    ].map((layout) => {
                      const isSelected = photoLayout === layout.id;
                      const cellCount = layout.cols * layout.rows;
                      return (
                        <button
                          key={layout.id}
                          onClick={() => setPhotoLayout(layout.id)}
                          className={`flex-1 flex flex-col items-center gap-2 p-2 rounded-xl border-2 transition-all duration-300 cursor-pointer ${
                            isSelected
                              ? "border-blue-500 bg-blue-50/70 shadow-md scale-[1.03]"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                          }`}
                        >
                          <div
                            className={`w-8 h-10 rounded border-2 p-[3px] overflow-hidden ${
                              isSelected ? "border-blue-400" : "border-slate-300"
                            }`}
                            style={{
                              display: "grid",
                              gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
                              gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
                              gap: "2px",
                            }}
                          >
                            {Array.from({ length: cellCount }).map((_, i) =>
                              hasImages ? (
                                <div key={i} className="overflow-hidden rounded-[1px]">
                                  <img
                                    src={actualImages[i % actualImages.length]?.dataUrl}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div
                                  key={i}
                                  className={`rounded-[2px] ${isSelected ? "bg-blue-400" : "bg-slate-300"}`}
                                />
                              )
                            )}
                          </div>
                          <div className="text-center">
                            <p className={`text-[10px] font-bold ${isSelected ? "text-blue-700" : "text-slate-700"}`}>
                              {layout.label}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Live image layout preview */}
                  {hasImages && photoLayout !== "1" && (
                    <div
                      className="mt-4 rounded-xl border-2 border-slate-200 bg-white overflow-hidden shadow-sm"
                      style={{ aspectRatio: "3/4" }}
                    >
                      <div
                        className="w-full h-full p-2"
                        style={{
                          display: "grid",
                          gridTemplateColumns: `repeat(${
                            photoLayout === "1" ? 1 : gridLayouts.find((l) => l.id === photoLayout)?.cols ?? 1
                          }, 1fr)`,
                          gridTemplateRows: `repeat(${
                            photoLayout === "1" ? 1 : gridLayouts.find((l) => l.id === photoLayout)?.rows ?? 1
                          }, 1fr)`,
                          gap: "4px",
                        }}
                      >
                        {Array.from({
                          length:
                            photoLayout === "1"
                              ? 1
                              : (gridLayouts.find((l) => l.id === photoLayout)?.cols ?? 1) *
                                (gridLayouts.find((l) => l.id === photoLayout)?.rows ?? 1),
                        }).map((_, i) => (
                          <div key={i} className="overflow-hidden rounded-md bg-slate-100">
                            <img
                              src={actualImages[i % actualImages.length]?.dataUrl}
                              alt="preview"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
                      className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border border-slate-100 rounded-xl hover:bg-slate-50/50 hover:border-blue-200 hover:shadow-md hover:shadow-blue-500/5 hover:-translate-y-0.5 active:scale-[0.98] active:bg-blue-50/40 active:border-blue-200/60 transition-all duration-300 cursor-pointer group/row"
                      onClick={() => setSelectedPreview(index)}
                    >
                      <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors group-hover/row:bg-blue-100">
                        <FileText className="w-5 h-5 text-indigo-600 group-hover/row:text-blue-700 transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate group-hover/row:text-[#093765] transition-colors">{file.name}</p>
                        <p className="text-xs text-gray-500">Document {index + 1}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-blue-50/50 border-blue-200 hover:bg-blue-100 hover:border-blue-300 text-blue-700 hover:text-[#093765] shadow-xs transition-all duration-200 rounded-lg cursor-pointer active:scale-95"
                      >
                        <Eye className="w-4 h-4 mr-2 text-blue-600 transition-colors animate-eye-blink" />
                        Preview
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar (Destination & Cost Summary) */}
          <div className="lg:col-span-1 sticky top-6 space-y-4">
            {/* Desktop Print Destination Selection */}
            <div className="hidden lg:block">
              {printDestinationCard}
            </div>

            {/* Cost Summary - Premium Dark Style */}
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
                    <span key={totalCost.toFixed(2)} className="text-2xl sm:text-3xl font-black text-white tracking-tighter block animate-pop-in">
                      ₹{totalCost.toFixed(2)}
                    </span>
                  </div>
                </div>

                 <Button
                  className="w-full h-12 sm:h-14 bg-[#093765] hover:bg-[#052345] border border-white/10 text-white font-bold text-sm sm:text-base rounded-xl sm:rounded-2xl shadow-xl shadow-black/20 hover:shadow-2xl hover:shadow-black/30 hover:-translate-y-0.5 transition-all duration-300 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleContinue}
                  disabled={files.length === 0 || hasSelectionError}
                >
                  Continue to Pay
                </Button>

                {hasSelectionError && (
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <span className="text-[10px] text-red-300 font-bold bg-red-500/10 px-2 py-1 rounded border border-red-500/20">
                      ⚠️ Select at least 1 page for each file
                    </span>
                  </div>
                )}

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

        {/* Preview Modal */}
        {selectedPreview !== null && (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-2 sm:p-4 pt-10 sm:pt-6 overflow-y-auto"
            onClick={() => setSelectedPreview(null)}
          >
            <Card className="max-w-4xl w-full h-[90vh] flex flex-col animate-in slide-in-from-top-10 duration-300" onClick={(e) => e.stopPropagation()}>
              <CardHeader className="flex-shrink-0">
                <CardTitle>Document Preview</CardTitle>
                <CardDescription>{files[selectedPreview]?.name}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col min-h-0">
                <div className="bg-gray-100 rounded-lg p-2 flex-1 flex items-center justify-center overflow-hidden">
                  {(() => {
                    const previewFile = files[selectedPreview];
                    const previewDataUrl = (previewFile as any)?.url;
                    const isPdf = previewFile?.name.toLowerCase().endsWith(".pdf") || previewFile?.type === "application/pdf";
                    const isImage = previewFile?.type?.startsWith("image/");
                    
                    if (previewDataUrl) {
                      const filterStyle = colorMode === "bw" ? "grayscale(100%) contrast(1.1)" : "none";
                      const transformStyle = orientation === "landscape" ? "rotate(-90deg) scale(0.7)" : "none";
                      
                      if (isPdf) {
                        return (
                          <div className="w-full h-full flex items-center justify-center overflow-hidden bg-slate-200/50 rounded-md">
                            <object 
                              data={previewDataUrl} 
                              type="application/pdf" 
                              className="w-full h-full min-h-[400px] transition-all duration-300"
                              style={{ 
                                filter: filterStyle,
                                transform: transformStyle,
                                transformOrigin: "center center"
                              }}
                            >
                              <p>Preview not supported in this browser.</p>
                            </object>
                          </div>
                        );
                      } else if (isImage) {
                        return (
                          <div className="w-full h-full flex items-center justify-center overflow-hidden bg-slate-200/50 rounded-md">
                            <img 
                              src={previewDataUrl} 
                              alt="Preview" 
                              className="max-w-full max-h-full object-contain transition-all duration-300"
                              style={{ 
                                filter: filterStyle,
                                transform: transformStyle,
                                transformOrigin: "center center"
                              }}
                            />
                          </div>
                        );
                      }
                    }
                    
                    return (
                      <div className="text-center">
                        <FileText className="w-24 h-24 mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-600 font-bold">Preview not available</p>
                        <p className="text-sm text-gray-500 mt-2">
                          Document will be printed as uploaded
                        </p>
                      </div>
                    );
                  })()}
                </div>
                <div className="flex gap-2 mt-4 flex-shrink-0">
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
