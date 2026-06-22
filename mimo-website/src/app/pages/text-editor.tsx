import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { MimoHeader } from "../components/mimo-header";
import { ArrowLeft, Loader2, AlignLeft, AlignCenter, AlignRight, AlignJustify, Plus, Minus, FileText, Check } from "lucide-react";
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
  const [colorMode, setColorMode] = useState("bw"); // "bw" or "color"
  const [copies, setCopies] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);

  // Constants
  const pricePerPage = colorMode === "color" ? 10.00 : 2.30;
  
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
      await api.post("/finalize-upload", {
        files: [fileData]
      });

      // 3. Save options and file details to sessionStorage for payment flow
      sessionStorage.setItem(
        "printOptions",
        JSON.stringify({
          copies,
          colorMode,
          doubleSided: "single",
          pageSelection: "all",
          pageRange: "",
          orientation: "portrait",
          totalPages: fileData.pageCount,
          totalCost: fileData.pageCount * copies * pricePerPage,
          isBlankSheet: false
        })
      );

      sessionStorage.setItem(
        "printFiles",
        JSON.stringify([
          {
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
    return "'Outfit', 'Inter', Helvetica, sans-serif";
  };

  return (
    <div className="min-h-[100dvh] w-full bg-slate-50/50 px-2 pt-0 pb-2 sm:px-4 sm:pt-0 sm:pb-4">
      <div className="mx-auto max-w-5xl space-y-3 sm:space-y-4">
        {/* Global Styles */}
        <style>
          {`
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');
            .editor-textarea::placeholder {
              color: #cbd5e1;
            }
          `}
        </style>

        {/* Header */}
        <MimoHeader />

        {/* Page Title */}
        <div className="flex items-center gap-2 py-2">
          <button
            onClick={() => navigate("/")}
            className="text-[#093765] hover:text-blue-600 transition-colors cursor-pointer flex items-center justify-center p-1 rounded-lg hover:bg-slate-200/40 -ml-1"
            aria-label="Back"
          >
            <ArrowLeft className="w-6 h-6" strokeWidth={2.5} />
          </button>
          <h1 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-[#093765] to-blue-600 bg-clip-text text-transparent tracking-tight leading-tight py-1">
            Custom Document Editor
          </h1>
        </div>

        {/* Editor Workspace */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          
          {/* Controls Panel & Input (Left) */}
          <div className="md:col-span-7 space-y-4">
            <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Compose Document</CardTitle>
                <CardDescription>Type or paste your text content below</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                
                {/* Textarea */}
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Start typing your document here..."
                  className="editor-textarea w-full h-[320px] p-4 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-sans text-sm resize-none"
                  style={{ fontFamily: getPreviewFont() }}
                />

                {/* Typography Settings */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  
                  {/* Font Family */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Font Family</label>
                    <select
                      value={fontFamily}
                      onChange={(e) => setFontFamily(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                      <option value="Helvetica">Sans-Serif (Helvetica)</option>
                      <option value="Times-Roman">Serif (Times)</option>
                      <option value="Courier">Monospace (Courier)</option>
                    </select>
                  </div>

                  {/* Font Size */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Font Size</label>
                    <div className="flex items-center border border-slate-200 rounded-lg bg-white h-10 overflow-hidden">
                      <button
                        onClick={() => setFontSize(prev => Math.max(8, prev - 1))}
                        className="flex-1 h-full flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-12 text-center text-sm font-bold text-slate-700">{fontSize}pt</span>
                      <button
                        onClick={() => setFontSize(prev => Math.min(24, prev + 1))}
                        className="flex-1 h-full flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Line Spacing */}
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Line Spacing</label>
                    <select
                      value={lineSpacing}
                      onChange={(e) => setLineSpacing(parseFloat(e.target.value))}
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                      <option value="1.0">Single (1.0)</option>
                      <option value="1.15">Default (1.15)</option>
                      <option value="1.5">1.5 Lines</option>
                      <option value="2.0">Double (2.0)</option>
                    </select>
                  </div>

                </div>

                {/* Document Options */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                  
                  {/* Alignment */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Alignment</label>
                    <div className="flex border border-slate-200 rounded-lg overflow-hidden h-10 bg-white">
                      {[
                        { name: "left", icon: AlignLeft },
                        { name: "center", icon: AlignCenter },
                        { name: "right", icon: AlignRight },
                        { name: "justify", icon: AlignJustify }
                      ].map((alignOpt) => {
                        const Icon = alignOpt.icon;
                        return (
                          <button
                            key={alignOpt.name}
                            onClick={() => setAlignment(alignOpt.name)}
                            className={`flex-1 h-full flex items-center justify-center transition-all ${
                              alignment === alignOpt.name
                                ? "bg-blue-50 text-blue-600 font-bold"
                                : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                            }`}
                            title={`Align ${alignOpt.name}`}
                          >
                            <Icon className="w-4 h-4" />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Margins */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Margins</label>
                    <select
                      value={margins}
                      onChange={(e) => setMargins(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                      <option value="small">Small (0.5")</option>
                      <option value="medium">Medium (0.75")</option>
                      <option value="large">Large (1.0")</option>
                    </select>
                  </div>

                  {/* Page Size */}
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Page Size</label>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                      <option value="A4">A4 (Standard)</option>
                      <option value="Letter">Letter</option>
                    </select>
                  </div>

                </div>

              </CardContent>
            </Card>
          </div>

          {/* Preview Panel (Right) */}
          <div className="md:col-span-5 space-y-4">
            <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-xl h-full flex flex-col justify-between">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>Live Preview</span>
                  <Badge variant="secondary" className="bg-slate-100 text-slate-700 text-xs">
                    Estimated {estimatedPages} {estimatedPages === 1 ? "Page" : "Pages"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col items-center justify-center p-4">
                
                {/* Visual A4 Page Container */}
                <div className="w-full max-w-[280px] sm:max-w-[320px] aspect-[1/1.414] bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden relative">
                  <div
                    className="w-full h-full text-slate-800 text-[8px] sm:text-[9.5px] leading-relaxed break-words overflow-y-auto whitespace-pre-wrap selection:bg-blue-100"
                    style={{
                      padding: getMarginPadding(),
                      fontFamily: getPreviewFont(),
                      fontSize: `${fontSize * 0.7}px`, // scale down font size slightly for miniature preview
                      lineHeight: lineSpacing,
                      textAlign: alignment as any
                    }}
                  >
                    {textContent || <span className="text-slate-300 italic">Preview of your typed text will appear here...</span>}
                  </div>
                </div>

                {/* Print Options Quick Config */}
                <div className="w-full grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-slate-100">
                  
                  {/* Color Mode */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Color Mode</label>
                    <div className="flex border border-slate-200 rounded-lg overflow-hidden h-10 bg-white">
                      <button
                        onClick={() => setColorMode("bw")}
                        className={`flex-1 h-full text-xs font-bold uppercase transition-all ${
                          colorMode === "bw"
                            ? "bg-slate-900 text-white"
                            : "text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        B&W (₹2.30)
                      </button>
                      <button
                        onClick={() => setColorMode("color")}
                        className={`flex-1 h-full text-xs font-bold uppercase transition-all ${
                          colorMode === "color"
                            ? "bg-gradient-to-tr from-blue-600 to-purple-600 text-white"
                            : "text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        Color (₹10)
                      </button>
                    </div>
                  </div>

                  {/* Copies */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Copies</label>
                    <div className="flex items-center border border-slate-200 rounded-lg bg-white h-10 overflow-hidden">
                      <button
                        onClick={() => setCopies(prev => Math.max(1, prev - 1))}
                        className="flex-1 h-full flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-10 text-center text-sm font-bold text-slate-700">{copies}</span>
                      <button
                        onClick={() => setCopies(prev => Math.min(99, prev + 1))}
                        className="flex-1 h-full flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                </div>

                {/* Final Cost Summary Card */}
                <div className="w-full bg-slate-50/80 rounded-xl p-4 mt-4 border border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Est. Cost</p>
                    <p className="text-xs text-slate-400 font-semibold">{estimatedPages} pgs x {copies} copies</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-[#093765]">₹{totalCost.toFixed(2)}</span>
                  </div>
                </div>

                {/* Continue button */}
                <Button
                  className="w-full h-12 text-sm font-black uppercase tracking-widest bg-gradient-to-r from-[#093765] to-blue-600 hover:from-[#052345] hover:to-blue-700 text-white shadow-lg shadow-blue-900/20 hover:shadow-xl hover:shadow-blue-900/30 active:scale-[0.98] transition-all duration-300 rounded-xl mt-4 cursor-pointer"
                  disabled={isProcessing || !textContent.trim()}
                  onClick={handleContinue}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Compiling PDF...
                    </>
                  ) : (
                    "Pay & Print"
                  )}
                </Button>

              </CardContent>
            </Card>
          </div>

        </div>

      </div>
    </div>
  );
}
