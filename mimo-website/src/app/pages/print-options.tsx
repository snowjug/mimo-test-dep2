import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ActionBar, ActionBarSpacer, AppBar, ChoiceRow, Group, PrimaryButton, Row, Segmented, StatusPill, Stepper, inputClass } from "../components/mimo/ui";
import { FileText, X } from "lucide-react";
import api from "../api";

interface UploadedFile {
  name: string;
  size: number;
  type?: string;
  url?: string;
  pageCount?: number;
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
  const [imageScaling, setImageScaling] = useState("fit");
  const [customScale, setCustomScale] = useState(100);
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
    dataUrl: f.url
  }));
  const hasImages = actualImages.length > 0;

  const [totalPages, setTotalPages] = useState(0);
  const [baseTotalCost, setBaseTotalCost] = useState(0);
  const [priceBW, setPriceBW] = useState(2.80);
  const [priceBWDuplex, setPriceBWDuplex] = useState(3.30);
  const [priceColor, setPriceColor] = useState(10.00);
  const [pricesLoaded, setPricesLoaded] = useState(false);

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
      } finally {
        setPricesLoaded(true);
      }
    };
    fetchPrices();
  }, []);

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

  // Pricing: 3.30 Rs per double-sided sheet in B&W, otherwise standard price per sheet
  const basePrice = colorMode === "bw" ? (doubleSided === "double" ? (priceBWDuplex || 3.30) : priceBW) : priceColor;

  const totalCost = actualPages * (Number(copies) || 1) * basePrice;

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
      copies: Number(copies) || 1,
      colorMode,
      doubleSided,
      orientation,
      pageSelection,
      imageScaling,
      customScale,
      photoLayout,
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

  const isSinglePageDocument = files.reduce((sum, f) => sum + (f.pageCount || 1), 0) <= 1;
  const isDuplexSupported = (!directKioskId || directKioskId === "SV-002" || directKioskId === "CV-001") && colorMode === "bw";

  useEffect(() => {
    if (!isDuplexSupported) {
      if (doubleSided === "double") setDoubleSided("single");
    }
    if (isSinglePageDocument) {
      if (pageSelection === "custom") setPageSelection("all");
    }
  }, [isSinglePageDocument, isDuplexSupported, doubleSided, pageSelection]);

  const selectPrinter = (id: "CV-001" | "SV-002") => {
    if (id === "CV-001") {
      setDirectKioskId("CV-001");
      setColorMode("bw");
    } else {
      setDirectKioskId("SV-002");
      if (colorMode === "color") {
        setDoubleSided("single");
      }
    }
  };

  const handleColorChange = (mode: "bw" | "color") => {
    if (mode === "bw") {
      setColorMode("bw");
      return;
    }
    if (directKioskId === "CV-001") {
      toast.info("Switched to KIOSK-002-SV for Color printing");
      setDirectKioskId("SV-002");
    }
    setColorMode("color");
    setDoubleSided("single");
  };

  const printers = [
    { id: "CV-001" as const, name: "MIMO 1.0", detail: "Black and white" },
    { id: "SV-002" as const, name: "MIMO 2.0", detail: "Black and white or colour" },
  ];

  const sheetsTotal = actualPages * (Number(copies) || 1);
  const blockingMessage = !directKioskId
    ? "Choose a printer to continue."
    : hasSelectionError
    ? "Select at least one page in each file."
    : null;

  return (
    <div className="min-h-[100dvh]">
      <AppBar title="Print settings" onBack={() => navigate("/upload", { state: { returnFromOptions: true } })} />

      <main className="px-4">
        <Group title="Printer">
          <div role="radiogroup" aria-label="Printer">
            {printers.map((p) => (
              <ChoiceRow key={p.id} label={p.name} detail={p.detail} selected={directKioskId === p.id} onSelect={() => selectPrinter(p.id)} />
            ))}
          </div>
        </Group>

        <div
          className={`transition-opacity duration-300 ${!directKioskId ? "pointer-events-none select-none opacity-40" : ""}`}
          aria-disabled={!directKioskId}
        >
          <Group title="Options" footer={!directKioskId ? "Choose a printer first. MIMO 2.0 is the one that prints in colour." : undefined}>
            <Row
              label="Copies"
              trailing={
                <Stepper value={copies} onDecrement={decrementCopies} onIncrement={incrementCopies}>
                  <input
                    type="number"
                    inputMode="numeric"
                    aria-label="Number of copies"
                    value={copies}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 1 && val <= 99) {
                        setCopies(val);
                      } else if (e.target.value === "") {
                        setCopies("" as any);
                      }
                    }}
                    onBlur={() => {
                      if (String(copies) === "" || isNaN(Number(copies)) || Number(copies) < 1) {
                        setCopies(1);
                      } else if (copies > 99) {
                        setCopies(99);
                      }
                    }}
                    className="w-9 bg-transparent p-0 text-center text-[16px] font-semibold tabular-nums text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </Stepper>
              }
            />
            <div className="border-t border-hairline px-4 py-3">
              <p className="mb-2 text-[16px] text-ink">Colour</p>
              <Segmented
                label="Colour"
                value={colorMode as "bw" | "color"}
                onChange={handleColorChange}
                options={[
                  { value: "bw", label: "Black and white" },
                  { value: "color", label: "Colour" },
                ]}
              />
            </div>
            <div className="border-t border-hairline px-4 py-3">
              <p className="mb-2 text-[16px] text-ink">Sides</p>
              <Segmented
                label="Sides"
                value={doubleSided as "single" | "double"}
                onChange={(v) => {
                  if (v === "double" && !isDuplexSupported) return;
                  setDoubleSided(v);
                }}
                options={[
                  { value: "single", label: "One side" },
                  { value: "double", label: "Both sides", disabled: !isDuplexSupported },
                ]}
              />
              {!isDuplexSupported && <p className="mt-2 text-[13px] text-ink-3">Colour prints on one side only.</p>}
            </div>
            <div className="border-t border-hairline px-4 py-3">
              <p className="mb-2 text-[16px] text-ink">Pages</p>
              <Segmented
                label="Pages"
                value={pageSelection as "all" | "custom"}
                onChange={(v) => {
                  if (v === "custom" && isSinglePageDocument) return;
                  handlePageSelectionChange(v);
                }}
                options={[
                  { value: "all", label: "All pages" },
                  { value: "custom", label: "Choose pages", disabled: isSinglePageDocument },
                ]}
              />

              {pageSelection === "custom" && files.length > 0 && (
                <div className="rise-in mt-4 flex flex-col gap-3">
                  {files.length > 1 && (
                    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                      {files.map((file, idx) => {
                        const isActive = activeFileIndex === idx;
                        const config = fileConfigs[file.name];
                        const selectedCount = config ? config.selectedPages.length : 0;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setActiveFileIndex(idx)}
                            aria-pressed={isActive}
                            className={`press flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-[14px] font-medium transition-colors ${
                              isActive ? "bg-ink text-canvas" : "bg-surface-2 text-ink-2"
                            }`}
                          >
                            <span className="max-w-[120px] truncate">{file.name}</span>
                            <span className="tabular-nums opacity-70">{selectedCount}</span>
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
                    const isPdf = activeFile.name.toLowerCase().endsWith(".pdf") || activeFile.type === "application/pdf";

                    return (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 text-[13px] text-ink-3">
                            <span className="tabular-nums">{config.selectedPages.length} of {maxPages}</span> pages selected
                            {!isPdf && (
                              <button
                                type="button"
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
                                className="ml-2 font-medium text-brand-text"
                              >
                                Wrong page count?
                              </button>
                            )}
                          </p>
                          {config.selectedPages.length === 0 && <StatusPill tone="danger">None selected</StatusPill>}
                        </div>

                        <div className="grid max-h-56 grid-cols-6 gap-2 overflow-y-auto rounded-[14px] bg-surface-2 p-2">
                          {pageNumbers.map((num) => {
                            const isSelected = config.selectedPages.includes(num);
                            return (
                              <button
                                key={num}
                                type="button"
                                aria-pressed={isSelected}
                                aria-label={`Page ${num}`}
                                onClick={() => handleTogglePage(activeFile.name, num)}
                                className={`press flex aspect-square items-center justify-center rounded-[10px] text-[15px] font-medium tabular-nums transition-colors ${
                                  isSelected ? "bg-brand text-on-brand" : "bg-surface text-ink-2"
                                }`}
                              >
                                {num}
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {([
                            ["first-half", "First half"],
                            ["second-half", "Second half"],
                            ["odds", "Odd"],
                            ["evens", "Even"],
                          ] as const).map(([key, label]) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => handleQuickSelect(activeFile.name, key)}
                              className="press h-9 rounded-full bg-surface-2 px-3.5 text-[14px] font-medium text-ink-2 active:bg-surface-3"
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        <div className="flex flex-col gap-2">
                          <label htmlFor="page-range" className="px-1 text-[13px] text-ink-3">
                            Or type a range, for example 1-3, 5, 8-10
                          </label>
                          <input
                            id="page-range"
                            type="text"
                            inputMode="numeric"
                            value={config.pageRange}
                            onChange={(e) => handleTextRangeChange(activeFile.name, e.target.value)}
                            className={`${inputClass} h-12 tabular-nums`}
                          />
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </Group>

          <Group title="Files" footer="Preview shows how colour mode will look.">
            {files.map((file, index) => (
              <Row
                key={index}
                icon={<FileText className="size-5" strokeWidth={1.75} />}
                label={file.name}
                detail={`${file.pageCount || 1} ${(file.pageCount || 1) === 1 ? "page" : "pages"}`}
                trailing={<span className="text-[15px] font-medium text-brand-text">Preview</span>}
                onClick={() => setSelectedPreview(index)}
              />
            ))}
          </Group>

          <Group title="Summary">
            <Row label="Documents" value={files.length} />
            <Row label="Pages" value={totalPages} />
            <Row label="Copies" value={Number(copies) || 1} />
            <Row label="Price per page" value={`₹${basePrice.toFixed(2)}`} />
            <Row label="Sheets" value={sheetsTotal} />
            {doubleSided === "double" && totalPages - actualPages > 0 && (
              <Row label="Paper saved" value={<span className="text-success">{totalPages - actualPages} sheets</span>} />
            )}
          </Group>
        </div>
      </main>

      <ActionBarSpacer size={blockingMessage ? 150 : 124} />
      <ActionBar>
        {blockingMessage && <p className="mb-2 text-center text-[13px] text-ink-2">{blockingMessage}</p>}
        <div className="flex items-center gap-4">
          <div className="shrink-0">
            <p className="text-[13px] text-ink-3">Total</p>
            <p key={totalCost.toFixed(2)} className="animate-pop-in text-[24px] font-semibold leading-none tabular-nums tracking-tight text-ink">
              ₹{totalCost.toFixed(2)}
            </p>
          </div>
          <PrimaryButton onClick={handleContinue} disabled={files.length === 0 || hasSelectionError || !directKioskId}>
            Continue to pay
          </PrimaryButton>
        </div>
      </ActionBar>

      {/* Preview */}
      {selectedPreview !== null && (
        <div
          className="fixed inset-0 z-50 bg-[rgba(12,13,16,0.4)] animate-in fade-in duration-200"
          onClick={() => setSelectedPreview(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Document preview"
            className="absolute inset-x-0 bottom-0 mx-auto flex h-[92dvh] w-full max-w-[440px] flex-col rounded-t-[28px] bg-surface animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
              <div className="min-w-0">
                <p className="text-[20px] font-semibold tracking-tight text-ink">Preview</p>
                <p className="truncate text-[14px] text-ink-3">{files[selectedPreview]?.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPreview(null)}
                aria-label="Close preview"
                className="press flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2"
              >
                <X className="size-[18px]" />
              </button>
            </div>
            <div className="mx-4 mb-[max(16px,env(safe-area-inset-bottom))] flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[16px] bg-surface-2">
              {(() => {
                const previewFile = files[selectedPreview];
                const previewDataUrl = previewFile?.url;
                const isPdf = previewFile?.name.toLowerCase().endsWith(".pdf") || previewFile?.type === "application/pdf";
                const isImage = previewFile?.type?.startsWith("image/");

                if (previewDataUrl) {
                  const filterStyle = colorMode === "bw" ? "grayscale(100%) contrast(1.1)" : "none";
                  const transformStyle = orientation === "landscape" ? "rotate(-90deg) scale(0.7)" : "none";

                  if (isPdf) {
                    return (
                      <object
                        data={previewDataUrl}
                        type="application/pdf"
                        className="h-full min-h-[400px] w-full"
                        style={{
                          filter: filterStyle,
                          transform: transformStyle,
                          transformOrigin: "center center"
                        }}
                      >
                        <p className="p-6 text-center text-[15px] text-ink-2">Preview is not supported in this browser.</p>
                      </object>
                    );
                  } else if (isImage) {
                    const layoutId = photoLayout;
                    const cols = layoutId === "1" ? 1 : (orientation === "landscape" ? (gridLayouts.find((l) => l.id === layoutId)?.rows ?? 1) : (gridLayouts.find((l) => l.id === layoutId)?.cols ?? 1));
                    const rows = layoutId === "1" ? 1 : (orientation === "landscape" ? (gridLayouts.find((l) => l.id === layoutId)?.cols ?? 1) : (gridLayouts.find((l) => l.id === layoutId)?.rows ?? 1));
                    const totalCells = layoutId === "1" ? 1 : (gridLayouts.find((l) => l.id === layoutId)?.cols ?? 1) * (gridLayouts.find((l) => l.id === layoutId)?.rows ?? 1);

                    return (
                      <div
                        className="flex items-center justify-center overflow-hidden bg-white p-3 shadow-float"
                        style={{
                          aspectRatio: orientation === "landscape" ? "1.414 / 1" : "1 / 1.414",
                          maxHeight: "100%",
                          maxWidth: "100%"
                        }}
                      >
                        <div
                          className="h-full w-full"
                          style={{
                            display: "grid",
                            gridTemplateColumns: `repeat(${cols}, 1fr)`,
                            gridTemplateRows: `repeat(${rows}, 1fr)`,
                            gap: "6px",
                          }}
                        >
                          {Array.from({ length: totalCells }).map((_, i) => (
                            <div key={i} className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-sm bg-slate-50">
                              <img
                                src={previewDataUrl}
                                alt=""
                                className={`h-full w-full ${imageScaling === "fill" ? "object-cover" : "object-contain"}`}
                                style={{
                                  filter: filterStyle,
                                  ...(imageScaling === "custom" ? { transform: `scale(${customScale / 100})`, transformOrigin: "center center" } : {})
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                }

                return (
                  <div className="px-6 text-center">
                    <FileText className="mx-auto mb-3 size-10 text-ink-3" strokeWidth={1.5} />
                    <p className="text-[17px] font-semibold text-ink">No preview for this file</p>
                    <p className="mt-1 text-[15px] text-ink-2">It prints exactly as uploaded.</p>
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
