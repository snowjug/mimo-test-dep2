import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { X, Instagram, ArrowUpRight, Lock } from "lucide-react";
import { Switch } from "../components/ui/switch";
import { ActionBar, ActionBarSpacer, AppBar, Group, PrimaryButton, Row, inputClass } from "../components/mimo/ui";
import { ScreenSkeleton } from "../components/mimo/screen-skeleton";
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
  const [userName, setUserName] = useState(() => localStorage.getItem("mimo_user_name") || null);
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem("mimo_user_email") || null);
  const [applyCoins, setApplyCoins] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoError, setPromoError] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoDiscount, setPromoDiscount] = useState(0);

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
          setUserName(profile.data.username);
          localStorage.setItem("mimo_user_name", profile.data.username);
        }
        if (profile.data.email) {
          setUserEmail(profile.data.email);
          localStorage.setItem("mimo_user_email", profile.data.email);
        }
      } catch (err) {
        console.error("Error fetching profile", err);
      }
    };
    fetchData();
  }, [navigate]);



  // Helper to parse page range and get page count
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
          count += (end - start + 1);
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

  // Helper for formatting date exactly like the cash receipt image (DD-MM-YYYY)
  const getFormattedDate = () => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };

  // Helper for formatting time (HH:MM)
  const getFormattedTime = () => {
    const d = new Date();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // Memoized file costs distributed proportionally to total sheets
  const fileCosts = useMemo(() => {
    if (!printOptions || files.length === 0) return [];
    
    const hasImages = files.some(f => f.type && f.type.startsWith('image/'));
    const photoLayout = printOptions.photoLayout || "1";
    
    const fileSheetsList = files.map(file => {
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
      const cost = totalSheets > 0 ? (sheets / totalSheets) * totalCost : 0;
      return cost;
    });
  }, [files, printOptions, totalCost]);

  const handleApplyPromo = async () => {
    if (promoCode.trim() === "") {
      toast.error("Please enter a promo code");
      return;
    }

    // Dismiss virtual keyboard and snap zoom back to 100% (reset zoom for iOS Safari)
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      const originalContent = viewport.getAttribute('content') || "width=device-width, initial-scale=1.0";
      viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0');
      setTimeout(() => {
        viewport.setAttribute('content', originalContent);
      }, 500);
    }

    try {
      const response = await api.get(`/validate-coupon/${promoCode}`);
      const discountPercentage = response.data.discountPercentage;
      const discountAmount = totalCost * (discountPercentage / 100);
      setPromoDiscount(discountAmount);
      setAppliedPromo(promoCode.toUpperCase());
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
  const coinsNeededForMax = maxDiscountAllowed * 2;
  const coinsToUse = applyCoins ? Math.min(mimoCoinsBalance, coinsNeededForMax) : 0;
  const discountAmount = coinsToUse * 0.5;

  const finalPrintCost = Math.max(0, totalCost - discountAmount - promoDiscount);
  const totalAmount = finalPrintCost;

  const handlePayment = async () => {
    setIsProcessing(true);

    try {
      const storedOptions = sessionStorage.getItem("printOptions");
      const printOptions = storedOptions ? JSON.parse(storedOptions) : {};
      
      const storedFiles = sessionStorage.getItem("printFiles");
      const parsedFiles = storedFiles ? JSON.parse(storedFiles) : [];
      const jobIds = parsedFiles.map((f: any) => f.jobId).filter(Boolean);

      if (!jobIds || jobIds.length === 0) {
        toast.error("No valid print jobs selected. Please return to upload.");
        setIsProcessing(false);
        return;
      }

      const payload: any = { jobIds, printOptions };
      if (appliedPromo) {
        payload.couponCode = appliedPromo;
      }
      // Send coins so backend deducts them from the Cashfree order amount too
      if (applyCoins && coinsToUse > 0) {
        payload.coinsToUse = coinsToUse;
      }

      // 1. ALWAYS create order in backend first, regardless of amount.
      // The backend securely verifies the coupon and 100% discount status.
      const orderResponse = await api.post("/create-order", payload);
      const { orderId, paymentSessionId, free, printCode } = orderResponse.data;

      // 2. If backend determines it's totally free, skip Cashfree
      if (free && printCode) {
        sessionStorage.setItem("printCode", printCode);
        toast.success("Free Order Confirmed!");
        navigate("/print-code");
        return;
      }

      // 3. Trigger Cashfree SDK for paid orders
      const cashfreeMode = import.meta.env.VITE_CASHFREE_MODE || "production";
      const cashfree = (window as any).Cashfree({
        mode: cashfreeMode,
      });

      const checkoutOptions = {
        paymentSessionId: paymentSessionId,
        redirectTarget: "_self", // Redirects to the return_url on completion
      };

      await cashfree.checkout(checkoutOptions);
      
    } catch (err: any) {
      console.error("Cashfree Error:", err);
      const errorMsg = typeof err.response?.data === 'string' 
        ? err.response.data 
        : err.response?.data?.error || err.message || "Payment initiation failed";
      toast.error(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!printOptions) {
    return <ScreenSkeleton />;
  }

  const printerName =
    printOptions.directKioskId === "SV-002" || printOptions.directKioskId?.startsWith("SV-002") ? "MIMO 2.0" : "MIMO 1.0";
  const itemCopies = printOptions?.copies || 1;

  return (
    <div className="min-h-[100dvh]">
      <AppBar title="Checkout" />

      <main className="px-4">
        <div className="rise-in pb-6 pt-2 text-center">
          <p className="text-[15px] text-ink-2">Amount to pay</p>
          <p key={totalAmount.toFixed(2)} className="animate-pop-in mt-1 text-[44px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-ink">
            ₹{totalAmount.toFixed(2)}
          </p>
          <p className="mt-2 text-[14px] tabular-nums text-ink-3">
            {getFormattedDate()}, {getFormattedTime()}
          </p>
        </div>

        <Group title="Items">
          {files.map((file, i) => {
            const filePages = getSelectedPageCount(file);
            const fileCost = fileCosts[i] || 0;
            return (
              <Row
                key={i}
                label={file.name}
                detail={`${filePages} ${filePages === 1 ? "page" : "pages"} × ${itemCopies} ${itemCopies > 1 ? "copies" : "copy"}`}
                value={`₹${fileCost.toFixed(2)}`}
              />
            );
          })}
        </Group>

        <Group title="Print">
          <Row label="Printer" value={printerName} />
          <Row label="Colour" value={printOptions.colorMode === "bw" ? "Black and white" : "Colour"} />
          <Row label="Sides" value={printOptions.doubleSided === "double" ? "Both sides" : "One side"} />
          <Row label="Copies" value={printOptions.copies} />
        </Group>

        <Group title="Discounts">
          {!appliedPromo ? (
            <form
              className="flex items-center gap-2 px-4 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleApplyPromo();
              }}
            >
              <label htmlFor="promo" className="sr-only">Promo code</label>
              <input
                id="promo"
                placeholder="Promo code"
                autoCapitalize="characters"
                autoCorrect="off"
                value={promoCode}
                onChange={(e) => {
                  setPromoCode(e.target.value);
                  setPromoError(false);
                }}
                aria-invalid={promoError}
                className={`${inputClass} h-11 flex-1 uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal ${
                  promoError ? "border-danger focus:border-danger focus:ring-danger-soft" : ""
                }`}
              />
              <button
                type="submit"
                className="press h-11 shrink-0 rounded-[12px] bg-surface-2 px-4 text-[15px] font-semibold text-ink active:bg-surface-3"
              >
                Apply
              </button>
            </form>
          ) : (
            <Row
              label={appliedPromo}
              detail="Promo code applied"
              trailing={
                <button
                  type="button"
                  aria-label="Remove promo code"
                  onClick={removePromo}
                  className="press flex size-9 items-center justify-center rounded-full text-ink-3 active:bg-surface-2"
                >
                  <X className="size-[18px]" />
                </button>
              }
            />
          )}

          {mimoCoinsBalance > 0 && (
            <div className="flex min-h-[60px] items-center gap-3 border-t border-hairline px-4 py-3">
              <label htmlFor="apply-coins" className="min-w-0 flex-1">
                <span className="block text-[16px] text-ink">Use MIMO coins</span>
                <span className="mt-0.5 block text-[13px] tabular-nums text-ink-3">
                  {mimoCoinsBalance} available, up to {Math.min(mimoCoinsBalance, coinsNeededForMax)} usable here
                </span>
              </label>
              <Switch id="apply-coins" checked={applyCoins} onCheckedChange={setApplyCoins} />
            </div>
          )}
        </Group>

        <Group title="Total">
          <Row label="Subtotal" value={`₹${totalCost.toFixed(2)}`} />
          {discountAmount > 0 && <Row label="Coins" value={<span className="text-success">−₹{discountAmount.toFixed(2)}</span>} />}
          {promoDiscount > 0 && (
            <Row label={`Promo ${appliedPromo}`} value={<span className="text-success">−₹{promoDiscount.toFixed(2)}</span>} />
          )}
          <Row label={<span className="font-semibold">To pay</span>} value={<span className="font-semibold text-ink">₹{totalAmount.toFixed(2)}</span>} />
        </Group>

        <p className="mt-6 text-center text-[13px] leading-relaxed text-ink-3">
          You get a 4-digit code after payment. Enter it at the kiosk to print.
        </p>
        <div className="mt-2 flex justify-center">
          <a
            href="https://www.instagram.com/printwithmimo?stkn=YzEyN3prc2VyOGh2"
            target="_blank"
            rel="noopener noreferrer"
            className="press inline-flex min-h-11 items-center gap-1.5 text-[14px] font-medium text-ink-2"
          >
            <Instagram className="size-4" /> Follow MIMO <ArrowUpRight className="size-3.5" />
          </a>
        </div>
      </main>

      <ActionBarSpacer size={116} />
      <ActionBar>
        <PrimaryButton onClick={handlePayment} loading={isProcessing}>
          {totalAmount > 0 ? (
            <>
              <Lock className="size-4" /> Pay ₹{totalAmount.toFixed(2)}
            </>
          ) : (
            "Get print code"
          )}
        </PrimaryButton>
        {totalAmount > 0 && <p className="mt-2 text-center text-[12px] text-ink-3">Payments handled by Cashfree</p>}
      </ActionBar>
    </div>
  );
}
