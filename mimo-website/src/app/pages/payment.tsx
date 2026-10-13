import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Lock,
  Pencil,
  Percent,
  Printer,
  Palette,
  Files,
  X,
  Ticket,
  Coins,
  Loader2,
} from "lucide-react";
import { Switch } from "../components/ui/switch";
import { MimoHeader } from "../components/mimo-header";
import { toast } from "sonner";
import api from "../api";

export function Payment() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<any[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [printOptions, setPrintOptions] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mimoCoinsBalance, setMimoCoinsBalance] = useState(0);
  const [applyCoins, setApplyCoins] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoError, setPromoError] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [selectedPreview, setSelectedPreview] = useState<number | null>(null);

  useEffect(() => {
    const storedFiles = sessionStorage.getItem("printFiles");
    const storedOptions = sessionStorage.getItem("printOptions");

    if (!storedFiles || !storedOptions) {
      navigate("/");
      return;
    }

    const options = JSON.parse(storedOptions);
    setFiles(JSON.parse(storedFiles));
    setTotalPages(options.totalPages);
    setTotalCost(options.totalCost);
    setPrintOptions(options);

    const fetchData = async () => {
      try {
        const response = await api.get("/mimo/coins");
        setMimoCoinsBalance(response.data.balance || 0);
      } catch (err) {
        console.error("Error fetching coins", err);
      }
      try {
        const profile = await api.get("/profile");
        if (profile.data.username) {
          localStorage.setItem("mimo_user_name", profile.data.username);
        }
        if (profile.data.email) {
          localStorage.setItem("mimo_user_email", profile.data.email);
        }
      } catch (err) {
        console.error("Error fetching profile", err);
      }
    };
    fetchData();
  }, [navigate]);

  const getSelectedPageCount = (file: any) => {
    const config = printOptions?.fileConfigs?.[file.name];
    if (!config) return file.pageCount || 1;
    if (config.pageSelection === "all") return file.pageCount || 1;

    const range = config.pageRange;
    if (!range) return 0;
    let count = 0;
    const parts = range.split(",");
    for (const part of parts) {
      if (part.includes("-")) {
        const [start, end] = part.split("-").map(Number);
        if (!isNaN(start) && !isNaN(end)) {
          count += end - start + 1;
        }
      } else {
        const p = Number(part);
        if (!isNaN(p)) {
          count += 1;
        }
      }
    }
    return count;
  };

  const getFormattedDateTime = () => {
    const d = new Date();
    const day = d.getDate();
    const month = d.toLocaleString("en-US", { month: "short" });
    const year = d.getFullYear();
    const time = d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    return `${day} ${month} ${year}, ${time}`;
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return "0 KB";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const fileCosts = useMemo(() => {
    if (!printOptions || files.length === 0) return [];

    const hasImages = files.some((f) => f.type && f.type.startsWith("image/"));
    const photoLayout = printOptions.photoLayout || "1";

    const fileSheetsList = files.map((file) => {
      const filePages = getSelectedPageCount(file);
      let fileSheets = filePages;
      if (hasImages && photoLayout !== "1") {
        fileSheets = Math.ceil(filePages / Number(photoLayout));
      }
      return fileSheets;
    });

    const totalSheets = fileSheetsList.reduce((sum, s) => sum + s, 0);

    return files.map((file, idx) => {
      const sheets = fileSheetsList[idx];
      return totalSheets > 0 ? (sheets / totalSheets) * totalCost : 0;
    });
  }, [files, printOptions, totalCost]);

  const handleApplyPromo = async () => {
    if (promoCode.trim() === "") {
      toast.error("Please enter a promo code");
      return;
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    try {
      const response = await api.get(`/validate-coupon/${promoCode.trim()}`);
      const discountPercentage = response.data.discountPercentage;
      const discountAmount = totalCost * (discountPercentage / 100);
      setPromoDiscount(discountAmount);
      setAppliedPromo(promoCode.trim().toUpperCase());
      toast.success(`Promo code applied: ${discountPercentage}% discount!`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Invalid promo code");
      setPromoError(true);
    }
  };

  const removePromo = () => {
    setAppliedPromo(null);
    setPromoDiscount(0);
    setPromoCode("");
  };

  const maxDiscountAllowed = totalCost * 0.5;
  const coinsNeededForMax = Math.ceil(maxDiscountAllowed * 2);
  const coinsToUse = applyCoins ? Math.min(mimoCoinsBalance, coinsNeededForMax) : 0;
  const discountAmount = coinsToUse * 0.5;

  const finalPrintCost = Math.max(0, totalCost - discountAmount - promoDiscount);
  const totalAmount = finalPrintCost;

  const handlePayment = async () => {
    setIsProcessing(true);

    try {
      const storedOptions = sessionStorage.getItem("printOptions");
      const printOptionsObj = storedOptions ? JSON.parse(storedOptions) : {};

      const storedFiles = sessionStorage.getItem("printFiles");
      const parsedFiles = storedFiles ? JSON.parse(storedFiles) : [];
      const jobIds = parsedFiles.map((f: any) => f.jobId).filter(Boolean);

      if (!jobIds || jobIds.length === 0) {
        toast.error("No valid print jobs selected. Please return to upload.");
        setIsProcessing(false);
        return;
      }

      const payload: any = { jobIds, printOptions: printOptionsObj };
      if (appliedPromo) {
        payload.couponCode = appliedPromo;
      }
      if (applyCoins && coinsToUse > 0) {
        payload.coinsToUse = coinsToUse;
      }

      const orderResponse = await api.post("/create-order", payload);
      const { orderId, paymentSessionId, free, printCode } = orderResponse.data;

      if (free && printCode) {
        sessionStorage.setItem("printCode", printCode);
        toast.success("Free Order Confirmed!");
        navigate("/print-code");
        return;
      }

      const cashfreeMode = import.meta.env.VITE_CASHFREE_MODE || "production";
      const cashfree = (window as any).Cashfree({
        mode: cashfreeMode,
      });

      const checkoutOptions = {
        paymentSessionId: paymentSessionId,
        redirectTarget: "_self",
      };

      await cashfree.checkout(checkoutOptions);
    } catch (err: any) {
      console.error("Cashfree Error:", err);
      const errorMsg =
        typeof err.response?.data === "string"
          ? err.response.data
          : err.response?.data?.error || err.message || "Payment initiation failed";
      toast.error(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!printOptions) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-canvas">
        <Loader2 className="size-6 animate-spin text-brand" />
      </div>
    );
  }

  const printerName =
    printOptions.directKioskId === "SV-002" || printOptions.directKioskId?.startsWith("SV-002")
      ? "MIMO 2.0"
      : "MIMO 1.0";
  const itemCopies = printOptions?.copies || 1;

  return (
    <div className="min-h-[100dvh] bg-canvas px-4 pb-36">
      {/* ── Standard MIMO Header ── */}
      <MimoHeader />

      {/* ── Checkout Hero Heading + Mascot ── */}
      <div className="rise-in flex items-start justify-between pt-3 pb-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate("/print-options")}
            aria-label="Back to print options"
            className="press mt-1 flex size-10 items-center justify-center rounded-full bg-surface shadow-xs border border-hairline text-ink active:bg-surface-2"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div>
            <span className="text-[13px] font-medium text-ink-3">Checkout</span>
            <h1 className="text-[30px] font-extrabold leading-tight tracking-tight text-ink">
              Pay <span className="text-brand">₹{totalAmount.toFixed(2)}</span>
            </h1>
            <p className="mt-0.5 text-[12px] text-ink-3 tabular-nums">{getFormattedDateTime()}</p>
          </div>
        </div>

        {/* Decorative Mascot */}
        <div className="relative size-[76px] sm:size-[84px] shrink-0">
          <img
            src="/images/mimo-mascot.png"
            alt="MIMO"
            className="size-full object-contain drop-shadow-md select-none pointer-events-none"
            draggable={false}
          />
        </div>
      </div>

      {/* ── Card 1: Document ── */}
      <section className="mb-4" aria-label="Document">
        <div className="rounded-[20px] bg-surface p-4 border border-hairline shadow-xs">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-[8px] bg-blue-50 text-brand">
                <FileText className="size-4" />
              </span>
              <h2 className="text-[15px] font-bold text-ink">Document</h2>
            </div>
            {files.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedPreview(0)}
                className="press flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[12px] font-semibold text-brand border border-blue-200/60 active:bg-blue-100"
              >
                <Eye className="size-3.5" /> Preview
              </button>
            )}
          </div>

          <div className="space-y-2.5">
            {files.map((file, i) => {
              const filePages = getSelectedPageCount(file);
              const fileCost = fileCosts[i] || 0;
              return (
                <div key={i} className="flex items-center justify-between gap-3 border-t border-hairline pt-2.5 first:border-t-0 first:pt-0">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-ink-3">
                      <FileText className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink">{file.name}</span>
                      <span className="text-[12px] text-ink-3">
                        {filePages} {filePages === 1 ? "page" : "pages"} · {formatFileSize(file.size)}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 text-[15px] font-bold tabular-nums text-ink">
                    ₹{fileCost.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Card 2: Print settings ── */}
      <section className="mb-4" aria-label="Print settings">
        <div className="rounded-[20px] bg-surface p-4 border border-hairline shadow-xs">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-[8px] bg-purple-50 text-purple-600">
                <Printer className="size-4" />
              </span>
              <h2 className="text-[15px] font-bold text-ink">Print settings</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate("/print-options")}
              className="press flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[12px] font-semibold text-brand border border-blue-200/60 active:bg-blue-100"
            >
              <Pencil className="size-3.5" /> Edit
            </button>
          </div>

          <div className="space-y-2.5 text-[14px]">
            {/* Printer */}
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2 text-ink-2">
                <span className="flex size-7 items-center justify-center rounded-[8px] bg-blue-50 text-brand">
                  <Printer className="size-3.5" />
                </span>
                <span>Printer</span>
              </div>
              <span className="font-semibold text-ink">{printerName}</span>
            </div>

            {/* Colour */}
            <div className="flex items-center justify-between border-t border-hairline pt-2.5">
              <div className="flex items-center gap-2 text-ink-2">
                <span className="flex size-7 items-center justify-center rounded-[8px] bg-purple-50 text-purple-600">
                  <Palette className="size-3.5" />
                </span>
                <span>Colour</span>
              </div>
              <span className="font-semibold text-ink">
                {printOptions.colorMode === "bw" ? "Black & white" : "Colour"}
              </span>
            </div>

            {/* Sides */}
            <div className="flex items-center justify-between border-t border-hairline pt-2.5">
              <div className="flex items-center gap-2 text-ink-2">
                <span className="flex size-7 items-center justify-center rounded-[8px] bg-emerald-50 text-emerald-600">
                  <FileText className="size-3.5" />
                </span>
                <span>Sides</span>
              </div>
              <span className="font-semibold text-ink">
                {printOptions.doubleSided === "double" ? "Both sides" : "One side"}
              </span>
            </div>

            {/* Copies */}
            <div className="flex items-center justify-between border-t border-hairline pt-2.5">
              <div className="flex items-center gap-2 text-ink-2">
                <span className="flex size-7 items-center justify-center rounded-[8px] bg-amber-50 text-amber-600">
                  <Files className="size-3.5" />
                </span>
                <span>Copies</span>
              </div>
              <span className="font-semibold tabular-nums text-ink">{printOptions.copies}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Card 3: Discounts ── */}
      <section className="mb-4" aria-label="Discounts">
        <div className="rounded-[20px] bg-surface p-4 border border-hairline shadow-xs">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-[8px] bg-rose-50 text-rose-500">
              <Percent className="size-4" />
            </span>
            <h2 className="text-[15px] font-bold text-ink">Discounts</h2>
          </div>

          {/* Promo code form */}
          {!appliedPromo ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleApplyPromo();
              }}
            >
              <div className="relative flex-1">
                <Ticket className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
                <input
                  type="text"
                  placeholder="Promo code"
                  autoCapitalize="characters"
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value);
                    setPromoError(false);
                  }}
                  className={`w-full rounded-[14px] border border-hairline bg-surface-2 pl-10 pr-3 py-2.5 text-[14px] uppercase text-ink placeholder:normal-case placeholder:text-ink-4 outline-none focus:border-brand ${
                    promoError ? "border-rose-400 bg-rose-50/30" : ""
                  }`}
                />
              </div>
              <button
                type="submit"
                className="press rounded-full bg-blue-50 hover:bg-blue-100 px-5 py-2.5 text-[13px] font-bold text-brand border border-blue-200/60"
              >
                Apply
              </button>
            </form>
          ) : (
            <div className="flex items-center justify-between rounded-[14px] bg-emerald-50/60 p-3 border border-emerald-200/60">
              <div className="flex items-center gap-2">
                <Ticket className="size-4 text-emerald-600" />
                <div>
                  <span className="text-[14px] font-bold text-emerald-900">{appliedPromo}</span>
                  <span className="block text-[12px] text-emerald-700">Promo code applied</span>
                </div>
              </div>
              <button
                type="button"
                onClick={removePromo}
                aria-label="Remove promo code"
                className="press flex size-7 items-center justify-center rounded-full bg-white text-emerald-700 shadow-xs"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {/* MIMO Coins toggle */}
          {mimoCoinsBalance > 0 && (
            <div className="mt-3.5 flex items-center justify-between border-t border-hairline pt-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-full bg-amber-50 text-[18px]">
                  🪙
                </span>
                <div>
                  <span className="block text-[14px] font-semibold text-ink">Use MIMO coins</span>
                  <span className="text-[12px] text-ink-3 tabular-nums">
                    {mimoCoinsBalance} available · Up to {Math.min(mimoCoinsBalance, coinsNeededForMax)} can be used
                  </span>
                </div>
              </div>
              <Switch id="apply-coins" checked={applyCoins} onCheckedChange={setApplyCoins} />
            </div>
          )}
        </div>
      </section>

      {/* ── Card 4: Payment summary ── */}
      <section className="mb-6" aria-label="Payment summary">
        <div className="rounded-[20px] bg-surface p-4 border border-hairline shadow-xs">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-[8px] bg-blue-50 text-brand">
              <FileText className="size-4" />
            </span>
            <h2 className="text-[15px] font-bold text-ink">Payment summary</h2>
          </div>

          <div className="space-y-2 text-[14px]">
            <div className="flex items-center justify-between text-ink-2">
              <span>Subtotal</span>
              <span className="font-semibold tabular-nums text-ink">₹{totalCost.toFixed(2)}</span>
            </div>

            {discountAmount > 0 && (
              <div className="flex items-center justify-between text-emerald-600">
                <span>Coins discount</span>
                <span className="font-semibold tabular-nums">−₹{discountAmount.toFixed(2)}</span>
              </div>
            )}

            {promoDiscount > 0 && (
              <div className="flex items-center justify-between text-emerald-600">
                <span>Promo discount</span>
                <span className="font-semibold tabular-nums">−₹{promoDiscount.toFixed(2)}</span>
              </div>
            )}

            {/* Total highlight box */}
            <div className="mt-3 flex items-center justify-between rounded-[14px] bg-blue-50/70 px-3.5 py-3 border border-blue-100">
              <span className="text-[15px] font-bold text-ink">Total amount</span>
              <span className="text-[22px] font-extrabold tabular-nums text-brand">
                ₹{totalAmount.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Sticky Bottom Action Bar ── */}
      <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none">
        <div className="pointer-events-auto mx-auto w-full max-w-[440px] border-t border-hairline bg-white/95 backdrop-blur-md px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-lg">
          <button
            type="button"
            data-tour="payment-pay-button"
            disabled={isProcessing}
            onClick={handlePayment}
            className="press flex w-full items-center justify-center gap-2.5 rounded-full bg-brand hover:bg-brand-press py-4 text-[16px] font-bold text-white shadow-lg shadow-brand/20 transition-all disabled:opacity-60"
          >
            {isProcessing ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                <Lock className="size-4" strokeWidth={2.5} />
                <span>{totalAmount > 0 ? `Pay ₹${totalAmount.toFixed(2)}` : "Get print code"}</span>
                <span className="flex size-6 items-center justify-center rounded-full bg-white/20 text-white ml-1">
                  <ChevronRight className="size-4" strokeWidth={2.5} />
                </span>
              </>
            )}
          </button>
          <p className="mt-2 text-center text-[11px] font-medium text-ink-3">
            Payments handled by Cashfree
          </p>
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
                const isPdf = previewFile?.name?.toLowerCase().endsWith(".pdf") || previewFile?.type === "application/pdf";
                const isImage = previewFile?.type?.startsWith("image/");
                const filterStyle = printOptions?.colorMode === "bw" ? "grayscale(100%) contrast(1.1)" : "none";

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
