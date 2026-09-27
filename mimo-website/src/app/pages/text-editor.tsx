import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AlignLeft, AlignCenter, AlignRight, AlignJustify } from "lucide-react";
import { ActionBar, ActionBarSpacer, AppBar, ChoiceRow, Group, PrimaryButton, Row, Segmented, Stepper } from "../components/mimo/ui";
import api from "../api";
import { toast } from "sonner";

export function TextEditor() {
  const navigate = useNavigate();
  const [textContent, setTextContent] = useState("");
  const [fontFamily, setFontFamily] = useState("Helvetica");
  const [fontSize, setFontSize] = useState(12);
  const [lineSpacing, setLineSpacing] = useState(1.15);
  const [alignment, setAlignment] = useState("left");
  const [pageSize, setPageSize] = useState("A4");
  const [margins, setMargins] = useState("medium");
  const [directKioskId, setDirectKioskId] = useState<string | null>(null);
  const [copies, setCopies] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);

  const [pricePerPage, setPricePerPage] = useState(2.80); // Dynamic from settings

  useEffect(() => {
    api.get('/api/settings')
      .then(res => {
        if (res.data?.pricePerPageBW) {
          setPricePerPage(res.data.pricePerPageBW);
        }
      })
      .catch(console.error);
  }, []);
  
  // Calculate dynamic page estimation
  // Average A4 page holds ~2500 characters at 12pt single spacing.
  const charLimitPerPage = Math.max(500, Math.floor(2500 * (12 / fontSize) / lineSpacing));
  const estimatedPages = textContent.trim().length === 0 ? 1 : Math.max(1, Math.ceil(textContent.length / charLimitPerPage));
  const totalCost = estimatedPages * copies * pricePerPage;

  const handleContinue = async () => {
    if (!textContent.trim()) {
      toast.error("Please enter some text before printing.");
      return;
    }
    
    setIsProcessing(true);
    try {
      // 1. Generate PDF on the server
      const response = await api.post("/generate-text-pdf", {
        textContent,
        fontFamily,
        fontSize,
        lineSpacing,
        alignment,
        pageSize,
        margins
      });

      const fileData = response.data; // { name, url, type, size, pageCount }

      // 2. Finalize upload (creates print_jobs records in firestore with pending status)
      const finalizeRes = await api.post("/finalize-upload", {
        files: [fileData]
      });
      const finalizedJob = finalizeRes.data?.files?.[0];

      // 3. Save options and file details to sessionStorage for payment flow
      sessionStorage.setItem(
        "printOptions",
        JSON.stringify({
          copies,
          colorMode: "bw",
          doubleSided: "single",
          pageSelection: "all",
          pageRange: "",
          orientation: "portrait",
          totalPages: fileData.pageCount,
          totalCost: fileData.pageCount * copies * pricePerPage,
          isBlankSheet: false,
          directKioskId: directKioskId?.startsWith("SV-002") ? "SV-002" : directKioskId,
        })
      );

      sessionStorage.setItem(
        "printFiles",
        JSON.stringify([
          {
            jobId: finalizedJob?.jobId,
            name: fileData.name,
            size: fileData.size,
            type: fileData.type,
            url: fileData.url,
            pageCount: fileData.pageCount
          }
        ])
      );

      toast.success("Document compiled successfully!");
      navigate("/payment");
    } catch (err: any) {
      console.error("Failed to generate custom document:", err);
      toast.error(err.response?.data?.error || "Failed to proceed to checkout. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Maps UI margin setting to CSS padding
  const getMarginPadding = () => {
    if (margins === "small") return "16px";
    if (margins === "large") return "36px";
    return "24px"; // medium
  };

  // Maps UI font to actual browser preview fonts
  const getPreviewFont = () => {
    if (fontFamily === "Times-Roman" || fontFamily === "Times New Roman") {
      return "'Times New Roman', Times, serif";
    }
    if (fontFamily === "Courier") {
      return "'Courier New', Courier, monospace";
    }
    return "Helvetica, Arial, sans-serif";
  };

  return <TextEditorView {...{
    textContent, setTextContent, fontFamily, setFontFamily, fontSize, setFontSize, lineSpacing, setLineSpacing,
    alignment, setAlignment, pageSize, setPageSize, margins, setMargins, directKioskId, setDirectKioskId,
    copies, setCopies, isProcessing, estimatedPages, totalCost, handleContinue, getMarginPadding, getPreviewFont,
  }} />;
}

const selectClass =
  "h-10 appearance-none rounded-[12px] bg-surface-2 pl-3 pr-8 text-[15px] text-ink outline-none focus-visible:ring-4 focus-visible:ring-brand-soft bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236b7079%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_10px_center] bg-no-repeat";

function TextEditorView(p: {
  textContent: string; setTextContent: (v: string) => void;
  fontFamily: string; setFontFamily: (v: string) => void;
  fontSize: number; setFontSize: (fn: (prev: number) => number) => void;
  lineSpacing: number; setLineSpacing: (v: number) => void;
  alignment: string; setAlignment: (v: string) => void;
  pageSize: string; setPageSize: (v: string) => void;
  margins: string; setMargins: (v: string) => void;
  directKioskId: string | null; setDirectKioskId: (v: string) => void;
  copies: number; setCopies: (fn: (prev: number) => number) => void;
  isProcessing: boolean; estimatedPages: number; totalCost: number;
  handleContinue: () => void; getMarginPadding: () => string; getPreviewFont: () => string;
}) {
  const [mode, setMode] = useState<"write" | "preview">("write");
  const canContinue = !!p.textContent.trim() && !!p.directKioskId;

  return (
    <div className="min-h-[100dvh]">
      <AppBar title="New document" backTo="/upload" />

      <main className="px-4">
        <Segmented<"write" | "preview">
          label="Editor view"
          value={mode}
          onChange={setMode}
          options={[
            { value: "write", label: "Write" },
            { value: "preview", label: "Preview" },
          ]}
        />

        {mode === "write" ? (
          <div className="mt-4">
            <label htmlFor="doc-text" className="sr-only">Document text</label>
            <textarea
              id="doc-text"
              value={p.textContent}
              onChange={(e) => p.setTextContent(e.target.value)}
              placeholder="Type or paste your text here"
              className="h-[46dvh] min-h-[260px] w-full resize-none rounded-[20px] bg-surface p-4 text-[16px] leading-relaxed text-ink outline-none placeholder:text-ink-3 focus-visible:ring-4 focus-visible:ring-brand-soft"
            />
            <p className="mt-2 px-1 text-[13px] tabular-nums text-ink-3">
              {p.textContent.length} characters, about {p.estimatedPages} {p.estimatedPages === 1 ? "page" : "pages"}
            </p>
          </div>
        ) : (
          <div className="mt-4 flex justify-center rounded-[20px] bg-surface-2 p-5">
            <div className="aspect-[1/1.414] w-full max-w-[300px] overflow-hidden rounded-[4px] bg-white shadow-float ring-1 ring-black/5">
              <div
                className="h-full w-full overflow-y-auto whitespace-pre-wrap break-words text-[#111318]"
                style={{
                  padding: p.getMarginPadding(),
                  fontFamily: p.getPreviewFont(),
                  fontSize: `${p.fontSize * 0.7}px`,
                  lineHeight: p.lineSpacing,
                  textAlign: p.alignment as any,
                }}
              >
                {p.textContent || <span className="italic text-[#8d929b]">Your text will appear here.</span>}
              </div>
            </div>
          </div>
        )}

        <Group title="Format">
          <Row
            label="Font"
            trailing={
              <select aria-label="Font" value={p.fontFamily} onChange={(e) => p.setFontFamily(e.target.value)} className={selectClass}>
                <option value="Helvetica">Sans serif</option>
                <option value="Times-Roman">Serif</option>
                <option value="Courier">Monospace</option>
              </select>
            }
          />
          <Row
            label="Size"
            trailing={
              <Stepper
                value={p.fontSize}
                min={8}
                max={24}
                onDecrement={() => p.setFontSize((prev) => Math.max(8, prev - 1))}
                onIncrement={() => p.setFontSize((prev) => Math.min(24, prev + 1))}
              >
                <span className="w-11 text-center text-[15px] font-semibold tabular-nums">{p.fontSize}pt</span>
              </Stepper>
            }
          />
          <Row
            label="Line spacing"
            trailing={
              <select aria-label="Line spacing" value={p.lineSpacing} onChange={(e) => p.setLineSpacing(parseFloat(e.target.value))} className={selectClass}>
                <option value="1.0">Single</option>
                <option value="1.15">1.15</option>
                <option value="1.5">1.5</option>
                <option value="2.0">Double</option>
              </select>
            }
          />
          <div className="border-t border-hairline px-4 py-3">
            <p className="mb-2 text-[16px] text-ink">Alignment</p>
            <Segmented
              label="Alignment"
              value={p.alignment}
              onChange={p.setAlignment}
              options={[
                { value: "left", label: <><AlignLeft className="size-4" /><span className="sr-only">Left</span></> },
                { value: "center", label: <><AlignCenter className="size-4" /><span className="sr-only">Centre</span></> },
                { value: "right", label: <><AlignRight className="size-4" /><span className="sr-only">Right</span></> },
                { value: "justify", label: <><AlignJustify className="size-4" /><span className="sr-only">Justify</span></> },
              ]}
            />
          </div>
          <div className="border-t border-hairline px-4 py-3">
            <p className="mb-2 text-[16px] text-ink">Margins</p>
            <Segmented
              label="Margins"
              value={p.margins}
              onChange={p.setMargins}
              options={[
                { value: "small", label: "Narrow" },
                { value: "medium", label: "Normal" },
                { value: "large", label: "Wide" },
              ]}
            />
          </div>
          <div className="border-t border-hairline px-4 py-3">
            <p className="mb-2 text-[16px] text-ink">Paper</p>
            <Segmented
              label="Paper size"
              value={p.pageSize}
              onChange={p.setPageSize}
              options={[
                { value: "A4", label: "A4" },
                { value: "Letter", label: "Letter" },
              ]}
            />
          </div>
        </Group>

        <Group title="Printer">
          <div role="radiogroup" aria-label="Printer">
            <ChoiceRow label="MIMO 1.0" detail="Black and white" selected={p.directKioskId === "CV-001"} onSelect={() => p.setDirectKioskId("CV-001")} />
            <ChoiceRow label="MIMO 2.0" detail="Black and white or colour" selected={p.directKioskId === "SV-002"} onSelect={() => p.setDirectKioskId("SV-002")} />
          </div>
        </Group>

        <Group title="Copies">
          <Row
            label="Copies"
            trailing={
              <Stepper
                value={p.copies}
                onDecrement={() => p.setCopies((prev) => Math.max(1, prev - 1))}
                onIncrement={() => p.setCopies((prev) => Math.min(99, prev + 1))}
              />
            }
          />
        </Group>
      </main>

      <ActionBarSpacer size={canContinue ? 124 : 150} />
      <ActionBar>
        {!canContinue && (
          <p className="mb-2 text-center text-[13px] text-ink-2">
            {!p.textContent.trim() ? "Type something to print." : "Choose a printer to continue."}
          </p>
        )}
        <div className="flex items-center gap-4">
          <div className="shrink-0">
            <p className="text-[13px] tabular-nums text-ink-3">
              About {p.estimatedPages} × {p.copies}
            </p>
            <p className="text-[24px] font-semibold leading-none tabular-nums tracking-tight text-ink">₹{p.totalCost.toFixed(2)}</p>
          </div>
          <PrimaryButton onClick={p.handleContinue} loading={p.isProcessing} disabled={!canContinue}>
            Continue to pay
          </PrimaryButton>
        </div>
      </ActionBar>
    </div>
  );
}
