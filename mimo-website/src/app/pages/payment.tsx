import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { ArrowLeft, FileText, CheckCircle, Printer, Gift, X } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { MimoCoinsDisplay } from "../components/mimo-coins-display";
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

  const [mimoCoinsBalance, setMimoCoinsBalance] = useState(0);
  const [userName, setUserName] = useState(() => localStorage.getItem("mimo_user_name") || null);
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem("mimo_user_email") || null);
  const [applyCoins, setApplyCoins] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoError, setPromoError] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoDiscount, setPromoDiscount] = useState(0);



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
      
      const payload: any = { printOptions };
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
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-[100dvh] w-full bg-slate-50/50 px-2 pt-0 pb-2 sm:px-4 sm:pt-0 sm:pb-4">
      <style>{`
        .receipt-card, .receipt-card *:not(.keep-color):not(.keep-color *) {
          color: #000000 !important;
        }
        .receipt-card *::placeholder {
          color: #a1a1aa !important;
        }
      `}</style>
      <div className="mx-auto max-w-5xl space-y-1 sm:space-y-2">

        {/* Header */}
        <MimoHeader />

        {/* ── Page Header ── */}
        <div className="flex items-center gap-2 py-2">
          <button
            onClick={() => navigate(-1)}
            className="text-[#093765] hover:text-blue-600 transition-colors cursor-pointer flex items-center justify-center p-1 rounded-lg hover:bg-slate-200/40 -ml-1"
            aria-label="Back"
          >
            <ArrowLeft className="w-6 h-6" strokeWidth={2.5} />
          </button>
          <h1 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-[#093765] to-blue-600 bg-clip-text text-transparent tracking-tight leading-tight py-1">
            Secure Checkout
          </h1>
        </div>

        <div className="max-w-md mx-auto w-full group">
          <div className="relative mb-2.5" style={{ filter: 'drop-shadow(0 15px 25px rgba(0, 0, 0, 0.08))' }}>
            {/* Order Summary - Torn Receipt Style */}
            <Card 
              className="receipt-card border-0 bg-[#fefdfb] text-slate-900 overflow-hidden animate-in fade-in duration-500 rounded-none pt-5 pb-3 px-3 sm:pt-8 sm:pb-5 sm:px-4 font-mono relative border-x border-slate-200/40"
              style={{
                clipPath: 'polygon(0% 12px, 2.5% 0px, 5% 12px, 7.5% 0px, 10% 12px, 12.5% 0px, 15% 12px, 17.5% 0px, 20% 12px, 22.5% 0px, 25% 12px, 27.5% 0px, 30% 12px, 32.5% 0px, 35% 12px, 37.5% 0px, 40% 12px, 42.5% 0px, 45% 12px, 47.5% 0px, 50% 12px, 52.5% 0px, 55% 12px, 57.5% 0px, 60% 12px, 62.5% 0px, 65% 12px, 67.5% 0px, 70% 12px, 72.5% 0px, 75% 12px, 77.5% 0px, 80% 12px, 82.5% 0px, 85% 12px, 87.5% 0px, 90% 12px, 92.5% 0px, 95% 12px, 97.5% 0px, 100% 12px, 100% calc(100% - 12px), 97.5% 100%, 95% calc(100% - 12px), 92.5% 100%, 90% calc(100% - 12px), 87.5% 100%, 85% calc(100% - 12px), 82.5% 100%, 80% calc(100% - 12px), 77.5% 100%, 75% calc(100% - 12px), 72.5% 100%, 70% calc(100% - 12px), 67.5% 100%, 65% calc(100% - 12px), 62.5% 100%, 60% calc(100% - 12px), 57.5% 100%, 55% calc(100% - 12px), 52.5% 100%, 50% calc(100% - 12px), 47.5% 100%, 45% calc(100% - 12px), 42.5% 100%, 40% calc(100% - 12px), 37.5% 100%, 35% calc(100% - 12px), 32.5% 100%, 30% calc(100% - 12px), 27.5% 100%, 25% calc(100% - 12px), 22.5% 100%, 20% calc(100% - 12px), 17.5% 100%, 15% calc(100% - 12px), 12.5% 100%, 10% calc(100% - 12px), 7.5% 100%, 5% calc(100% - 12px), 2.5% 100%, 0% calc(100% - 12px))',
                fontFamily: "'Courier New', Courier, monospace"
              }}
            >
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] opacity-25 pointer-events-none"></div>
              
              {/* Brand Header */}
              <div className="text-center mb-0 mt-0 sm:-mt-2 relative z-10">
                <p className="font-extrabold text-base sm:text-2xl uppercase tracking-[0.2em] text-slate-800 mb-0.5">
                  <span className="font-black text-black text-xl sm:text-4xl align-middle" style={{ fontFamily: "'Lovelo', sans-serif" }}>MIMO</span> <span className="align-middle">RECEIPT</span>
                </p>
                <p 
                  className="font-black text-[13px] sm:text-[17px] text-slate-800 uppercase tracking-widest mb-1"
                  style={{ fontFamily: "'Lovelo', sans-serif" }}
                >
                  REVA UNIVERSITY
                </p>
                <div className="text-[10px] sm:text-xs text-slate-500 mt-1 uppercase leading-relaxed font-bold mb-2">
                  <p>ADD: Yelahanka, Bangalore, Karnataka, 560064</p>
                </div>
              </div>

              {/* Date, Time, and Identifiers */}
              <div className="space-y-1 text-xs sm:text-sm text-slate-700 font-bold px-1 relative z-10">
                <div className="flex justify-between items-center">
                  <span>Date: {getFormattedDate()}</span>
                  <span>Time: {getFormattedTime()}</span>
                </div>
                {userName && (
                  <div className="flex justify-between items-center">
                    <span>Name:</span>
                    <span className="truncate max-w-[200px] text-right">{userName}</span>
                  </div>
                )}
                {userEmail && (
                  <div className="flex justify-between items-center">
                    <span>Email:</span>
                    <span className="truncate max-w-[200px] text-right">{userEmail}</span>
                  </div>
                )}
              </div>

              {/* Separator 2 */}
              <div className="border-t border-dashed border-slate-400/80 w-full my-0.5 relative z-10" />

              {/* Items List (Uploaded Files) */}
              <div className="space-y-1 px-1 relative z-10">
                {files.map((file, i) => {
                  const filePages = getSelectedPageCount(file);
                  const fileCost = fileCosts[i] || 0;
                  const itemCopies = printOptions?.copies || 1;
                  return (
                    <div key={i} className="flex flex-col text-xs sm:text-sm text-slate-800 font-bold leading-tight">
                      <div className="flex justify-between items-start">
                        <span className="truncate max-w-[240px]">{file.name}</span>
                        <span className="shrink-0 pl-2">₹{fileCost.toFixed(2)}</span>
                      </div>
                      <span className="text-xs text-slate-500 font-medium pl-2 mt-1">
                        {filePages} pgs x {itemCopies} {itemCopies > 1 ? "copies" : "copy"}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Separator 3 */}
              <div className="border-t border-dashed border-slate-400/80 w-full my-0.5 relative z-10" />

              {/* Print Configuration Metadata */}
              {printOptions && (
                <div className="space-y-1 sm:space-y-2 px-1 text-[10px] sm:text-xs font-bold text-slate-500 relative z-10">
                  <div className="flex justify-between">
                    <span>Printer:</span>
                    <span className="text-slate-900">
                      {printOptions.directKioskId === "SV-002" || printOptions.directKioskId?.startsWith("SV-002") ? "MIMO 2.0" : "MIMO 1.0"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Color Mode:</span>
                    <span className="text-slate-900">{printOptions.colorMode === "bw" ? "B&W" : "COLOR"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sides:</span>
                    <span className="text-slate-900">{printOptions.doubleSided === "double" ? "DOUBLE" : "SINGLE"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Copies:</span>
                    <span className="text-slate-900">{printOptions.copies}x</span>
                  </div>
                </div>
              )}

              {/* Separator 4 */}
              <div className="border-t border-dashed border-slate-400/80 w-full my-0.5 relative z-10" />

              {/* Pricing Details */}
              <div className="space-y-1 sm:space-y-1.5 px-1 text-xs sm:text-sm font-bold text-slate-800 relative z-10">
                <div className="flex justify-between text-sm sm:text-base font-black text-slate-900">
                  <span>Total</span>
                  <span>₹{totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pl-3 mt-2 text-xs text-slate-500 font-medium">
                  <span>Sub-total</span>
                  <span>₹{totalCost.toFixed(2)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="keep-color flex justify-between pl-3 text-xs text-blue-700 font-medium">
                    <span>Coins Offset</span>
                    <span>-₹{discountAmount.toFixed(2)}</span>
                  </div>
                )}
                {promoDiscount > 0 && (
                  <div className="keep-color flex justify-between pl-3 text-xs text-green-700 font-medium">
                    <span>Promo Discount ({appliedPromo})</span>
                    <span>-₹{promoDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between pl-3 border-t border-dotted border-slate-300 pt-2 mt-2 text-sm text-slate-800 font-bold">
                  <span>Balance</span>
                  <span>₹{totalAmount.toFixed(2)}</span>
                </div>
              </div>

              {/* Promo Section (Integrated inside receipt) */}
              <div className="mt-2 mb-1 relative z-10">
                {!appliedPromo ? (
                  <div className="relative mx-1">
                    <Input
                      id="promo"
                      placeholder="ENTER PROMO CODE"
                      value={promoCode}
                      onChange={(e) => {
                        setPromoCode(e.target.value);
                        setPromoError(false);
                      }}
                      className={`h-10 pl-3 pr-20 bg-slate-100/50 border border-dashed transition-all rounded font-mono text-[16px] uppercase font-bold shadow-none ${
                        promoError
                          ? "border-red-500 text-red-600 focus:border-red-600 focus:bg-red-50/50 placeholder:text-red-300"
                          : "border-slate-400 focus:border-slate-600 focus:bg-white text-slate-900 placeholder:text-slate-400"
                      }`}
                    />
                    <Button
                      type="button"
                      onClick={handleApplyPromo}
                      variant="ghost"
                      className="absolute right-1 top-1 h-8 px-4 text-slate-700 hover:text-slate-900 hover:bg-slate-200 font-bold text-xs tracking-wider rounded transition-all active:scale-95 font-mono"
                    >
                      APPLY
                    </Button>
                  </div>
                ) : (
                  <div className="keep-color flex items-center justify-between p-2 mx-1 bg-green-50/60 rounded border border-dashed border-green-400/60">
                    <div className="flex flex-col">
                      <span className="text-xs text-green-600 uppercase font-bold tracking-wider mb-0.5">Promo Applied</span>
                      <span className="text-sm font-black text-green-900 tracking-wide">{appliedPromo}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-green-700 hover:text-red-600 hover:bg-red-50 rounded-full"
                      onClick={removePromo}
                    >
                      <X className="w-2.5 h-2.5" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Mimo Coins Toggle */}
              {mimoCoinsBalance > 0 && (
                <>
                  <div className="border-t border-dotted border-slate-200 w-full my-1.5 relative z-10" />
                  <div className="keep-color flex flex-col gap-1.5 p-3 bg-purple-50/30 rounded border border-dashed border-purple-300/60 relative z-10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Gift className="w-4 h-4 text-purple-600" />
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">Apply Mimo Coins</span>
                      </div>
                      <Switch
                        checked={applyCoins}
                        onCheckedChange={setApplyCoins}
                        className="scale-90 data-[state=checked]:bg-purple-600"
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                      Available: {mimoCoinsBalance} (Max: {Math.min(mimoCoinsBalance, coinsNeededForMax)} coins)
                    </p>
                  </div>
                </>
              )}

              {/* Separator 5 */}
              <div className="border-t-[1.5px] border-dashed border-slate-400 w-full my-0.5 relative z-10" />

              {/* Cashier Footer */}
              <div className="text-center mt-0 mb-1 relative z-10 font-bold uppercase">
                <p className="text-base tracking-widest text-slate-800 font-black">THANK YOU</p>
                <p className="text-[10px] text-slate-500 font-medium tracking-wider mt-2 leading-relaxed">
                  Collect your print at the kiosk using the code
                </p>
              </div>
            </Card>
          </div>

          <div className="px-1 mb-2 animate-in fade-in duration-500 delay-150">
            <Button
              className="w-full h-12 text-sm bg-gradient-to-r from-[#093765] to-blue-700 hover:from-[#052345] hover:to-blue-800 text-white shadow-lg shadow-blue-900/20 transition-all duration-200 font-black uppercase tracking-widest rounded-xl"
              onClick={handlePayment}
              disabled={isProcessing}
            >
              {isProcessing ? "Processing..." : "Confirm & Pay"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}