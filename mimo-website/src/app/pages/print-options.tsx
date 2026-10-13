import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MimoHeader } from "../components/mimo-header";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Files,
  Palette,
  Minus,
  Plus,
  X,
  Wallet,
  Check,
} from "lucide-react";
import api from "../api";
import { useTour } from "../utils/tour-context";

interface UploadedFile {
  name: string;
  size: number;
  type?: string;
  url?: string;
  pageCount?: number;
}

interface SelectablePrinter {
  id: string;
  name: string;
  detail: string;
  supportsColor: boolean;
  supportsDuplex: boolean;
}

interface ApiMachine {
  machineId: string;
  displayName: string;
  capabilities: { colour?: boolean; duplex?: boolean };
  available: boolean;
}

const FALLBACK_PRINTERS: SelectablePrinter[] = [
  { id: "CV-001", name: "MIMO 1.0", detail: "Black & white", supportsColor: false, supportsDuplex: true },
  { id: "SV-002", name: "MIMO 2.0", detail: "Black & white or colour", supportsColor: true, supportsDuplex: true },
];

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

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

export function PrintOptions() {
  const navigate = useNavigate();
  const { start: startTour } = useTour();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [copies, setCopies] = useState(1);
  const [colorMode, setColorMode] = useState("bw");
  const [doubleSided, setDoubleSided] = useState("single");
  const [pageSelection, setPageSelection] = useState("all");
  const [orientation, setOrientation] = useState("portrait");
  const [photoLayout, setPhotoLayout] = useState("1");
  const [imageScaling, setImageScaling] = useState("fit");
  const [customScale, setCustomScale] = useState(100);
  const [selectedPreview, setSelectedPreview] = useState<number | null>(null);
  const [directKioskId, setDirectKioskId] = useState<string | null>(() => {
    return sessionStorage.getItem("directKioskId") || "CV-001";
  });
  const [printers, setPrinters] = useState<SelectablePrinter[]>(FALLBACK_PRINTERS);

  useEffect(() => {
    const fetchPrinters = async () => {
      try {
        const response = await api.get<{ machines: ApiMachine[] }>("/api/machines");
        const list = response.data?.machines?.filter((m) => m.available);
        if (!list || list.length === 0) return;
        setPrinters(
          list.map((m) => ({
            id: m.machineId,
            name: m.displayName,
            detail: m.capabilities?.colour ? "Black & white or colour" : "Black & white",
            supportsColor: Boolean(m.capabilities?.colour),
            supportsDuplex: m.capabilities?.duplex !== false,
          }))
        );
      } catch (error) {
        console.error("Failed to fetch printer list:", error);
      }
    };
    fetchPrinters();
  }, []);

  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [fileConfigs, setFileConfigs] = useState<Record<string, {
    pageSelection: "all" | "custom";
    pageRange: string;
    selectedPages: number[];
  }>>({});

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

    window.scrollTo(0, 0);
  }, [navigate]);

  const actualImages = files.filter(f => f.type && f.type.startsWith('image/')).map(f => ({
    name: f.name,
    mimetype: f.type,
    dataUrl: f.url
  }));
  const hasImages = actualImages.length > 0;

  const [totalPages, setTotalPages] = useState(0);
  const [baseTotalCost, setBaseTotalCost] = useState(0);
  const [priceBW, setPriceBW] = useState(2.80);
  const [priceBWDuplex, setPriceBWDuplex] = useState(3.30);
  const [priceColor, setPriceColor] = useState(10.00);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const response = await api.get('/api/settings');
        if (response.data) {
          if (response.data.pricePerPageBW) setPriceBW(response.data.pricePerPageBW);
          if (response.data.pricePerPageBWDuplex) setPriceBWDuplex(response.data.pricePerPageBWDuplex);
          if (response.data.pricePerPageColor) setPriceColor(response.data.pricePerPageColor);
        }
      } catch (error) {
        console.error("Failed to fetch prices:", error);
      }
    };
    fetchPrices();
  }, []);

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

  const handleQuickSelect = (fileName: string, type: "all" | "first-half" | "second-half" | "odds" | "evens") => {
    const file = files.find(f => f.name === fileName);
    if (!file) return;

    const maxPages = file.pageCount || 1;
    let selected: number[] = [];

    if (type === "all") {
      selected = Array.from({ length: maxPages }, (_, i) => i + 1);
    } else if (type === "first-half") {
      const half = Math.ceil(maxPages / 2);
      selected = Array.from({ length: half }, (_, i) => i + 1);
    } else if (type === "second-half") {
      const start = Math.ceil(maxPages / 2) + 1;
      selected = Array.from({ length: maxPages - start + 1 }, (_, i) => start + i);
    } else if (type === "odds") {
      for (let i = 1; i <= maxPages; i += 2) selected.push(i);
    } else if (type === "evens") {
      for (let i = 2; i <= maxPages; i += 2) selected.push(i);
    }

    setFileConfigs((prev) => ({
      ...prev,
      [fileName]: {
        ...prev[fileName],
        selectedPages: selected,
        pageRange: generatePageRange(selected, maxPages)
      }
    }));
  };

  const handleTextRangeChange = (fileName: string, rangeStr: string) => {
    const file = files.find(f => f.name === fileName);
    if (!file) return;

    const maxPages = file.pageCount || 1;
    const selected = parsePageRange(rangeStr, maxPages);

    setFileConfigs((prev) => ({
      ...prev,
      [fileName]: {
        ...prev[fileName],
        pageRange: rangeStr,
        selectedPages: selected
      }
    }));
  };

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
  const basePrice = colorMode === "bw" ? (doubleSided === "double" ? (priceBWDuplex || 3.30) : priceBW) : priceColor;
  const totalCost = actualPages * (Number(copies) || 1) * basePrice;

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
    const simplifiedConfigs: Record<string, { pageSelection: string; pageRange: string; pageCount: number }> = {};
    Object.keys(fileConfigs).forEach(fileName => {
      simplifiedConfigs[fileName] = {
        pageSelection: fileConfigs[fileName].pageSelection,
        pageRange: fileConfigs[fileName].pageRange,
        pageCount: files.find(f => f.name === fileName)?.pageCount || 1
      };
    });

    const cleanKioskId = directKioskId?.startsWith("SV-002") ? "SV-002" : directKioskId;

    sessionStorage.setItem("printOptions", JSON.stringify({
      copies: Number(copies) || 1,
      colorMode,
      doubleSided,
      orientation,
      pageSelection,
      imageScaling,
      customScale,
      photoLayout,
      pageRange: files.length > 0 ? (fileConfigs[files[0].name]?.pageRange || "") : "",
      fileConfigs: simplifiedConfigs,
      totalCost,
      totalPages: actualPages,
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

  const isSinglePageDocument = files.reduce((sum, f) => sum + (f.pageCount || 1), 0) <= 1;
  const selectedPrinter = printers.find((p) => p.id === directKioskId);
  const isDuplexSupported = (!directKioskId || selectedPrinter?.supportsDuplex !== false) && colorMode === "bw";

  useEffect(() => {
    if (!isDuplexSupported && doubleSided === "double") {
      setDoubleSided("single");
    }
    if (isSinglePageDocument && pageSelection === "custom") {
      setPageSelection("all");
    }
  }, [isSinglePageDocument, isDuplexSupported, doubleSided, pageSelection]);

  const selectPrinter = (id: string) => {
    setDirectKioskId(id);
    const printer = printers.find((p) => p.id === id);
    if (printer && !printer.supportsColor) {
      setColorMode("bw");
    } else if (colorMode === "color") {
      setDoubleSided("single");
    }
  };

  const handleColorChange = (mode: "bw" | "color") => {
    if (mode === "bw") {
      setColorMode("bw");
      return;
    }
    const current = printers.find((p) => p.id === directKioskId);
    if (current && !current.supportsColor) {
      const colorPrinter = printers.find((p) => p.supportsColor);
      if (colorPrinter) {
        toast.info(`Switched to ${colorPrinter.name} for Colour printing`);
        setDirectKioskId(colorPrinter.id);
      }
    }
    setColorMode("color");
    setDoubleSided("single");
  };

  return (
    <div className="min-h-[100dvh] bg-canvas px-4 pb-32">
      {/* ── Standard MIMO Header ── */}
      <MimoHeader />

      {/* ── Header Title + Mascot ── */}
      <div className="rise-in flex items-start justify-between pt-3 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/upload", { state: { returnFromOptions: true } })}
            aria-label="Back to upload"
            className="press flex size-10 items-center justify-center rounded-full bg-surface shadow-xs border border-hairline text-ink active:bg-surface-2"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div>
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink">
              Print settings
            </h1>
            <p className="mt-0.5 text-[14px] text-ink-3">Choose your preferences</p>
          </div>
        </div>

        {/* Decorative Mascot illustration */}
        <div className="flex size-[68px] shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-blue-500/10 via-sky-500/15 to-indigo-500/10 border border-blue-100 shadow-xs">
          <span className="text-[34px]" aria-hidden>🤖</span>
        </div>
      </div>

      {/* ── Choose a printer ── */}
      <section className="mb-5" aria-label="Choose a printer">
        <h2 className="mb-2 text-[15px] font-bold text-ink">Choose a printer</h2>
        <div className="grid grid-cols-2 gap-3" role="radiogroup">
          {printers.map((p) => {
            const isSelected = directKioskId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => selectPrinter(p.id)}
                className={`press relative flex items-center justify-between rounded-[20px] p-3.5 text-left transition-all ${
                  isSelected
                    ? "border-2 border-brand bg-blue-50/40 shadow-sm"
                    : "border border-hairline bg-surface shadow-xs hover:border-slate-300"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-[12px] ${isSelected ? "bg-blue-100 text-brand" : "bg-surface-2 text-ink-3"}`}>
                    <span className="text-[20px]">{p.supportsColor ? "🎨" : "🖨️"}</span>
                  </span>
                  <div>
                    <span className="block text-[14px] font-bold text-ink">{p.name}</span>
                    <span className="block text-[11px] text-ink-3">{p.detail}</span>
                  </div>
                </div>

                {/* Radio circle */}
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    isSelected ? "border-brand bg-brand" : "border-slate-300 bg-surface"
                  }`}
                >
                  {isSelected && <span className="size-2 rounded-full bg-white" />}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Print options ── */}
      <section className="mb-5" aria-label="Print options">
        <h2 className="mb-2 text-[15px] font-bold text-ink">Print options</h2>
        <div className="grid grid-cols-2 gap-3">
          {/* Card 1: Copies */}
          <div className="flex flex-col justify-between rounded-[20px] bg-surface p-3.5 border border-hairline shadow-xs">
            <div className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-blue-50 text-brand">
                <Files className="size-4" />
              </span>
              <span className="text-[14px] font-bold text-ink">Copies</span>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-full bg-surface-2 p-1 border border-hairline">
              <button
                type="button"
                onClick={decrementCopies}
                aria-label="Decrease copies"
                className="press flex size-7 items-center justify-center rounded-full bg-surface text-ink shadow-xs active:bg-surface-3"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="text-[15px] font-bold tabular-nums text-ink">{copies}</span>
              <button
                type="button"
                onClick={incrementCopies}
                aria-label="Increase copies"
                className="press flex size-7 items-center justify-center rounded-full bg-surface text-ink shadow-xs active:bg-surface-3"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Card 2: Colour */}
          <div className="flex flex-col justify-between rounded-[20px] bg-surface p-3.5 border border-hairline shadow-xs">
            <div className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-purple-50 text-purple-600">
                <Palette className="size-4" />
              </span>
              <span className="text-[14px] font-bold text-ink">Colour</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1 border border-hairline">
              <button
                type="button"
                onClick={() => handleColorChange("bw")}
                className={`press truncate rounded-full py-1 text-center text-[11px] font-semibold transition-all ${
                  colorMode === "bw"
                    ? "bg-brand text-white shadow-xs"
                    : "text-ink-3 hover:text-ink"
                }`}
              >
                Black & white
              </button>
              <button
                type="button"
                onClick={() => handleColorChange("color")}
                className={`press truncate rounded-full py-1 text-center text-[11px] font-semibold transition-all ${
                  colorMode === "color"
                    ? "bg-brand text-white shadow-xs"
                    : "text-ink-3 hover:text-ink"
                }`}
              >
                Colour
              </button>
            </div>
          </div>

          {/* Card 3: Sides */}
          <div className="flex flex-col justify-between rounded-[20px] bg-surface p-3.5 border border-hairline shadow-xs">
            <div className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-blue-50 text-brand">
                <FileText className="size-4" />
              </span>
              <span className="text-[14px] font-bold text-ink">Sides</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1 border border-hairline">
              <button
                type="button"
                onClick={() => setDoubleSided("single")}
                className={`press truncate rounded-full py-1 text-center text-[11px] font-semibold transition-all ${
                  doubleSided === "single"
                    ? "bg-brand text-white shadow-xs"
                    : "text-ink-3 hover:text-ink"
                }`}
              >
                One side
              </button>
              <button
                type="button"
                disabled={!isDuplexSupported}
                onClick={() => isDuplexSupported && setDoubleSided("double")}
                className={`press truncate rounded-full py-1 text-center text-[11px] font-semibold transition-all ${
                  !isDuplexSupported
                    ? "opacity-40 cursor-not-allowed text-ink-4"
                    : doubleSided === "double"
                    ? "bg-brand text-white shadow-xs"
                    : "text-ink-3 hover:text-ink"
                }`}
              >
                Both sides
              </button>
            </div>
          </div>

          {/* Card 4: Pages */}
          <div className="flex flex-col justify-between rounded-[20px] bg-surface p-3.5 border border-hairline shadow-xs">
            <div className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-blue-50 text-brand">
                <FileText className="size-4" />
              </span>
              <span className="text-[14px] font-bold text-ink">Pages</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1 border border-hairline">
              <button
                type="button"
                onClick={() => handlePageSelectionChange("all")}
                className={`press truncate rounded-full py-1 text-center text-[11px] font-semibold transition-all ${
                  pageSelection === "all"
                    ? "bg-brand text-white shadow-xs"
                    : "text-ink-3 hover:text-ink"
                }`}
              >
                All pages
              </button>
              <button
                type="button"
                disabled={isSinglePageDocument}
                onClick={() => !isSinglePageDocument && handlePageSelectionChange("custom")}
                className={`press truncate rounded-full py-1 text-center text-[11px] font-semibold transition-all ${
                  isSinglePageDocument
                    ? "opacity-40 cursor-not-allowed text-ink-4"
                    : pageSelection === "custom"
                    ? "bg-brand text-white shadow-xs"
                    : "text-ink-3 hover:text-ink"
                }`}
              >
                Choose pages
              </button>
            </div>
          </div>
        </div>

        {/* Custom page selector expandable */}
        {pageSelection === "custom" && files.length > 0 && (
          <div className="rise-in mt-3 rounded-[20px] bg-surface p-4 border border-hairline shadow-xs">
            {files.length > 1 && (
              <div className="mb-3 -mx-2 flex gap-2 overflow-x-auto px-2 pb-1 [scrollbar-width:none]">
                {files.map((file, idx) => {
                  const isActive = activeFileIndex === idx;
                  const config = fileConfigs[file.name];
                  const selectedCount = config ? config.selectedPages.length : 0;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveFileIndex(idx)}
                      className={`press flex h-8 shrink-0 items-center gap-2 rounded-full px-3 text-[13px] font-medium transition-colors ${
                        isActive ? "bg-brand text-white" : "bg-surface-2 text-ink-2"
                      }`}
                    >
                      <span className="max-w-[120px] truncate">{file.name}</span>
                      <span className="tabular-nums opacity-75">({selectedCount})</span>
                    </button>
                  );
                })}
              </div>
            )}

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

              return (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] text-ink-3">
                      <span className="font-semibold text-ink tabular-nums">{config.selectedPages.length} of {maxPages}</span> pages selected
                    </p>
                    {config.selectedPages.length === 0 && (
                      <span className="text-[12px] font-semibold text-rose-500">None selected</span>
                    )}
                  </div>

                  {/* Grid of numbers */}
                  <div className="grid max-h-48 grid-cols-6 gap-2 overflow-y-auto rounded-[14px] bg-surface-2 p-2.5">
                    {pageNumbers.map((num) => {
                      const isSelected = config.selectedPages.includes(num);
                      return (
                        <button
                          key={num}
                          type="button"
                          onClick={() => handleTogglePage(activeFile.name, num)}
                          className={`press flex aspect-square items-center justify-center rounded-[10px] text-[14px] font-semibold tabular-nums transition-colors ${
                            isSelected ? "bg-brand text-white shadow-xs" : "bg-surface text-ink hover:bg-slate-100"
                          }`}
                        >
                          {num}
                        </button>
                      );
                    })}
                  </div>

                  {/* Quick select chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      ["all", "All"],
                      ["first-half", "1st half"],
                      ["second-half", "2nd half"],
                      ["odds", "Odd"],
                      ["evens", "Even"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleQuickSelect(activeFile.name, key as any)}
                        className="press rounded-full bg-surface-2 px-3 py-1 text-[12px] font-medium text-ink-2 hover:bg-surface-3"
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Range input */}
                  <div className="mt-1">
                    <label htmlFor="custom-range" className="block text-[12px] text-ink-3">
                      Or type page range (e.g. 1-3, 5)
                    </label>
                    <input
                      id="custom-range"
                      type="text"
                      value={config.pageRange}
                      onChange={(e) => handleTextRangeChange(activeFile.name, e.target.value)}
                      className="mt-1 w-full rounded-[12px] border border-hairline bg-surface px-3 py-2 text-[14px] tabular-nums text-ink outline-none focus:border-brand"
                    />
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </section>

      {/* ── Selected file(s) ── */}
      <section className="mb-5" aria-label="Selected file">
        <h2 className="mb-2 text-[15px] font-bold text-ink">
          {files.length === 1 ? "Selected file" : "Selected files"}
        </h2>
        <div className="space-y-2">
          {files.map((file, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-[20px] bg-surface p-3.5 border border-hairline shadow-xs"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-surface-2 text-ink-3">
                  <FileText className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-ink">{file.name}</span>
                  <span className="mt-0.5 block text-[12px] text-ink-3">
                    {file.pageCount || 1} {(file.pageCount || 1) === 1 ? "page" : "pages"} · {formatFileSize(file.size)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedPreview(idx)}
                className="press ml-3 flex shrink-0 items-center gap-1.5 rounded-full bg-blue-50 px-3.5 py-1.5 text-[13px] font-semibold text-brand border border-blue-200/60 active:bg-blue-100"
              >
                <Eye className="size-4" /> Preview
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Price summary ── */}
      <section className="mb-6" aria-label="Price summary">
        <div className="rounded-[20px] bg-surface p-4 border border-hairline shadow-xs">
          <div className="mb-3.5 flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-[8px] bg-rose-50 text-rose-500">
              <FileText className="size-4" />
            </span>
            <h2 className="text-[15px] font-bold text-ink">Price summary</h2>
          </div>

          <div className="grid grid-cols-4 gap-2 pt-1 text-center">
            {/* Documents */}
            <div className="flex flex-col items-center">
              <span className="flex size-9 items-center justify-center rounded-full bg-blue-50 text-[18px]">
                📄
              </span>
              <span className="mt-1.5 text-[16px] font-bold tabular-nums leading-none text-ink">
                {files.length}
              </span>
              <span className="mt-0.5 text-[11px] text-ink-3">Document</span>
            </div>

            {/* Pages */}
            <div className="flex flex-col items-center">
              <span className="flex size-9 items-center justify-center rounded-full bg-emerald-50 text-[18px]">
                📋
              </span>
              <span className="mt-1.5 text-[16px] font-bold tabular-nums leading-none text-ink">
                {totalPages}
              </span>
              <span className="mt-0.5 text-[11px] text-ink-3">{totalPages === 1 ? "Page" : "Pages"}</span>
            </div>

            {/* Copies */}
            <div className="flex flex-col items-center">
              <span className="flex size-9 items-center justify-center rounded-full bg-purple-50 text-[18px]">
                📑
              </span>
              <span className="mt-1.5 text-[16px] font-bold tabular-nums leading-none text-ink">
                {copies}
              </span>
              <span className="mt-0.5 text-[11px] text-ink-3">{copies === 1 ? "Copy" : "Copies"}</span>
            </div>

            {/* Total */}
            <div className="flex flex-col items-center">
              <span className="flex size-9 items-center justify-center rounded-full bg-amber-50 text-[18px]">
                👛
              </span>
              <span className="mt-1.5 text-[16px] font-bold tabular-nums leading-none text-ink">
                ₹{totalCost.toFixed(2)}
              </span>
              <span className="mt-0.5 text-[11px] text-ink-3">Total</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Bottom Sticky Action Bar ── */}
      <div className="fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-hairline px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-[480px] items-center justify-between gap-4">
          <div>
            <span className="block text-[12px] font-medium text-ink-3 leading-none">Total</span>
            <span className="text-[26px] font-extrabold leading-tight tabular-nums text-brand">
              ₹{totalCost.toFixed(2)}
            </span>
          </div>

          <button
            type="button"
            disabled={files.length === 0 || hasSelectionError || !directKioskId}
            onClick={handleContinue}
            className="press flex items-center justify-center gap-2 rounded-full bg-brand hover:bg-brand-press px-7 py-3.5 text-[16px] font-bold text-white shadow-md shadow-brand/20 transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            Continue to pay
            <span className="flex size-6 items-center justify-center rounded-full bg-white/20 text-white">
              <ChevronRight className="size-4" strokeWidth={2.5} />
            </span>
          </button>
        </div>
      </div>

      {/* ── Preview Modal ── */}
      {selectedPreview !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex flex-col justify-end animate-in fade-in duration-200"
          onClick={() => setSelectedPreview(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Document preview"
            className="mx-auto flex h-[90dvh] w-full max-w-[480px] flex-col rounded-t-[28px] bg-surface animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
              <div className="min-w-0">
                <p className="text-[18px] font-bold text-ink">Preview</p>
                <p className="truncate text-[13px] text-ink-3">{files[selectedPreview]?.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPreview(null)}
                aria-label="Close preview"
                className="press flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-2"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center p-4">
              {(() => {
                const previewFile = files[selectedPreview];
                const previewDataUrl = previewFile?.url;
                const isPdf = previewFile?.name.toLowerCase().endsWith(".pdf") || previewFile?.type === "application/pdf";
                const isImage = previewFile?.type?.startsWith("image/");
                const filterStyle = colorMode === "bw" ? "grayscale(100%) contrast(1.1)" : "none";

                if (previewDataUrl) {
                  if (isPdf) {
                    return (
                      <object
                        data={previewDataUrl}
                        type="application/pdf"
                        className="h-full w-full rounded-[14px]"
                        style={{ filter: filterStyle }}
                      >
                        <p className="p-6 text-center text-[15px] text-ink-2">Preview not supported in this browser.</p>
                      </object>
                    );
                  } else if (isImage) {
                    return (
                      <img
                        src={previewDataUrl}
                        alt=""
                        className="max-h-full max-w-full rounded-[14px] object-contain shadow-sm"
                        style={{ filter: filterStyle }}
                      />
                    );
                  }
                }

                return (
                  <div className="text-center">
                    <FileText className="mx-auto mb-2 size-10 text-ink-3" />
                    <p className="text-[16px] font-semibold text-ink">No preview available</p>
                    <p className="text-[13px] text-ink-3">It will print clearly at the kiosk.</p>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
