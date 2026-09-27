import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ActionBar, ActionBarSpacer, AppBar, ChoiceRow, Group, PrimaryButton, Row, Stepper } from "../components/mimo/ui";
import api from "../api";

export function BlankPages() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type") || "a4"; // "a4" or "graph"
  const [pageCount, setPageCount] = useState(1);
  const [directKioskId, setDirectKioskId] = useState<string | null>(null);

  const isGraph = type === "graph";
  const label = isGraph ? "Mimo Graph Sheet" : "A4 Blank Sheet";
  const [pricePerPageA4, setPricePerPageA4] = useState(2.80);
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
      const blankRes = await api.post("/create-blank-job",
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
            jobId: blankRes.data?.jobId,
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
    <div className="min-h-[100dvh]">
      <AppBar title={isGraph ? "Graph paper" : "Blank A4"} backTo="/upload" />

      <main className="px-4">
        {/* Sheet preview: the actual paper, drawn to A4 proportions */}
        <div className="flex justify-center py-4">
          <div
            aria-hidden
            className="aspect-[1/1.414] w-36 rounded-[4px] bg-white shadow-float ring-1 ring-black/5"
            style={
              isGraph
                ? {
                    backgroundImage:
                      "linear-gradient(rgba(9,55,101,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(9,55,101,0.14) 1px, transparent 1px)",
                    backgroundSize: "6px 6px",
                    backgroundPosition: "6px 6px",
                  }
                : undefined
            }
          />
        </div>
        <p className="text-center text-[15px] text-ink-2">
          {label}, <span className="tabular-nums">₹{pricePerPage.toFixed(2)}</span> per sheet
        </p>

        <Group title="Printer" className="mt-6">
          <div role="radiogroup" aria-label="Printer">
            <ChoiceRow label="MIMO 1.0" detail="Black and white" selected={directKioskId === "CV-001"} onSelect={() => setDirectKioskId("CV-001")} />
            <ChoiceRow label="MIMO 2.0" detail="Black and white or colour" selected={directKioskId === "SV-002"} onSelect={() => setDirectKioskId("SV-002")} />
          </div>
        </Group>

        <Group title="Sheets">
          <Row label="How many" trailing={<Stepper value={pageCount} min={1} max={200} onDecrement={decrement} onIncrement={increment} />} />
          <div className="flex gap-2 overflow-x-auto border-t border-hairline px-4 py-3 [scrollbar-width:none]">
            {[5, 10, 25, 50, 100].map((num) => (
              <button
                key={num}
                type="button"
                aria-pressed={pageCount === num}
                onClick={() => setPageCount(num)}
                className={`press h-9 shrink-0 rounded-full px-4 text-[14px] font-medium tabular-nums transition-colors ${
                  pageCount === num ? "bg-ink text-canvas" : "bg-surface-2 text-ink-2"
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </Group>
      </main>

      <ActionBarSpacer size={directKioskId ? 124 : 150} />
      <ActionBar>
        {!directKioskId && <p className="mb-2 text-center text-[13px] text-ink-2">Choose a printer to continue.</p>}
        <div className="flex items-center gap-4">
          <div className="shrink-0">
            <p className="text-[13px] text-ink-3">Total</p>
            <p key={totalCost.toFixed(2)} className="animate-pop-in text-[24px] font-semibold leading-none tabular-nums tracking-tight text-ink">
              ₹{totalCost.toFixed(2)}
            </p>
          </div>
          <PrimaryButton onClick={handleContinue} loading={isProcessing} disabled={!directKioskId}>
            Continue to pay
          </PrimaryButton>
        </div>
      </ActionBar>
    </div>
  );
}
