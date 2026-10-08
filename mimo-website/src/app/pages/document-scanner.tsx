import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ActionBar,
  ActionBarSpacer,
  AppBar,
  EmptyState,
  Group,
  PrimaryButton,
  Row,
  Screen,
  SecondaryButton,
  Segmented,
  StatusPill,
  TextButton,
} from "../components/mimo/ui";
import {
  Camera,
  Upload,
  Trash2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  X,
  RotateCw,
  RotateCcw,
  Check,
  Undo,
  Sliders,
  Printer,
  Loader2,
  Scan,
  Plus,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import api from "../api";
import { ScannerAutoCaptureEngine, AutoCaptureStatus } from "../utils/scanner-auto-capture";
import {
  loadOpenCV,
  isCVReady,
  getCvLoadStatus,
  CvLoadStatus,
  detectDocumentCorners,
  smoothCorners,
  warpPerspective,
  getDefaultCorners,
  getFullFrameCorners,
  DocumentCorners,
  EnhancementMode,
} from "../utils/scanner-cv-engine";
import { fitPagesToPdfLimit } from "../utils/scanner-pdf-budget";

export interface ScannedPageItem {
  id: string; // Local unique ID
  dataUrl: string; // Clean perspective-warped & enhanced document image
  originalDataUrl: string; // Full uncropped frame for manual re-adjustment
  corners: DocumentCorners; // 4 corners used for warp (normalized 0..1)
  filter: EnhancementMode;
  file?: File;
  name: string;
  createdAt: number;
  rotation: number; // 0, 90, 180, 270 (already applied to dataUrl)
}

type AspectRatioMode = "a4" | "free" | "1:1" | "4:3" | "16:9";

// Read a picked file as a data URL
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Could not read "${file.name}"`));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not open the image"));
    img.src = src;
  });
}

// Pages are kept at high quality while scanning; the final size is decided once, at Continue, for the real
// page count (see fitPagesToPdfLimit).
const PAGE_JPEG_QUALITY = 0.92;

export function DocumentScanner() {
  const navigate = useNavigate();

  const [isFinalizing, setIsFinalizing] = useState<boolean>(false);

  // Page state
  const [pages, setPages] = useState<ScannedPageItem[]>([]);
  const pagesRef = useRef<ScannedPageItem[]>(pages);
  pagesRef.current = pages;
  const [selectedPreview, setSelectedPreview] = useState<ScannedPageItem | null>(null);

  // Computer Vision & Corner Detection state
  const [cvStatus, setCvStatus] = useState<CvLoadStatus>(getCvLoadStatus());
  const [detectedCorners, setDetectedCorners] = useState<DocumentCorners>(getDefaultCorners());
  const [isDocDetected, setIsDocDetected] = useState<boolean>(false);
  const smoothedCornersRef = useRef<DocumentCorners>(getDefaultCorners());

  // Edit Mode state (Interactive 4-Corner Pin Adjustment & Enhancement)
  const [editingPage, setEditingPage] = useState<ScannedPageItem | null>(null);
  const [editCorners, setEditCorners] = useState<DocumentCorners>(getDefaultCorners());
  const [activeCornerKey, setActiveCornerKey] = useState<keyof DocumentCorners | null>(null);
  const [editRotation, setEditRotation] = useState<number>(0);
  const [editFilter, setEditFilter] = useState<EnhancementMode>("enhanced");
  const [editAspectRatio, setEditAspectRatio] = useState<AspectRatioMode>("a4");
  const [isProcessingEdit, setIsProcessingEdit] = useState<boolean>(false);

  // Dragging corner handles state in Edit Modal
  const editContainerRef = useRef<HTMLDivElement | null>(null);

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Each camera start gets a number; a start that has been superseded (React StrictMode mounts effects twice
  // in development, or a quick "Try again") stops its own stream and never reports an error.
  const cameraAttemptRef = useRef<number>(0);

  const [isCameraActive, setIsCameraActive] = useState<boolean>(true);
  const [isCameraLoading, setIsCameraLoading] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Auto Capture state
  const autoEngineRef = useRef<ScannerAutoCaptureEngine | null>(null);
  if (!autoEngineRef.current) {
    autoEngineRef.current = new ScannerAutoCaptureEngine();
  }
  const isCapturingRef = useRef<boolean>(false);
  const [isCaptureLocked, setIsCaptureLocked] = useState<boolean>(false);
  const [isAutoCaptureEnabled, setIsAutoCaptureEnabled] = useState<boolean>(true);
  const [autoCaptureStatus, setAutoCaptureStatus] = useState<AutoCaptureStatus>("searching");
  const [autoCaptureProgress, setAutoCaptureProgress] = useState<number>(0);
  const [autoCaptureMessage, setAutoCaptureMessage] = useState<string>("Align document inside frame");
  const [isShutterFlashing, setIsShutterFlashing] = useState<boolean>(false);

  // 1. Load OpenCV.js (bundled with the site) on mount
  useEffect(() => {
    let cancelled = false;
    loadOpenCV().then((ok) => {
      if (!cancelled) setCvStatus(ok ? "ready" : "unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Trigger brief visual shutter flash animation
  const triggerShutterFlash = useCallback(() => {
    setIsShutterFlashing(true);
    setTimeout(() => {
      setIsShutterFlashing(false);
    }, 250);
  }, []);

  // Stop camera tracks cleanly
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraLoading(false);
  }, []);

  // Start camera
  const startCamera = useCallback(async () => {
    const attempt = ++cameraAttemptRef.current;
    stopCamera();
    setCameraError(null);
    setIsCameraLoading(true);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Camera is not supported on this browser or device.");
      setIsCameraLoading(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment", // Prefer rear camera on mobile
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      if (attempt !== cameraAttemptRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if (attempt === cameraAttemptRef.current) setIsCameraActive(true);
    } catch (err: any) {
      // Superseded start, or play() interrupted by a newer source: not a camera failure.
      if (attempt !== cameraAttemptRef.current || err?.name === "AbortError") return;
      console.warn("Camera access error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCameraError("Camera permission was denied. Please allow camera access in your browser settings, or upload an image file directly.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setCameraError("No camera device was found on this system. You can upload an image file instead.");
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        setCameraError("Camera is already in use by another application. Please close other camera apps and retry.");
      } else {
        setCameraError(err.message || "Failed to start camera. You can upload image files directly.");
      }
    } finally {
      if (attempt === cameraAttemptRef.current) setIsCameraLoading(false);
    }
  }, [stopCamera]);

  // Lifecycle: start camera on mount, stop on unmount
  useEffect(() => {
    startCamera();
    return () => {
      cameraAttemptRef.current++;
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  const openEditor = (page: ScannedPageItem) => {
    setEditingPage(page);
    setEditCorners(page.corners || getFullFrameCorners());
    setEditRotation(page.rotation || 0);
    setEditFilter(page.filter || "enhanced");
    setEditAspectRatio("a4");
  };

  // ================= STAGE 2: CAPTURE & PERSPECTIVE WARP =================
  const handleAddNewPage = useCallback(() => {
    // The page just captured may still be in view; auto capture waits until it is moved or replaced.
    autoEngineRef.current?.reArm({ requireNewDocument: true });
    setIsCaptureLocked(false);
    toast.info(`Ready for page ${pagesRef.current.length + 1} — place the next page in view`);
  }, []);

  const handleRetakeCurrentPage = useCallback(() => {
    if (pagesRef.current.length === 0) return;
    setPages((prev) => prev.slice(0, -1));
    autoEngineRef.current?.reArm();
    setIsCaptureLocked(false);
    toast.info("Retaking page — align document inside frame");
  }, []);

  const handleCapture = useCallback((options?: { isAuto?: boolean }) => {
    if (isCapturingRef.current) return;
    if (!videoRef.current || !canvasRef.current) {
      if (!options?.isAuto) toast.error("Camera view is not available");
      return;
    }

    isCapturingRef.current = true;

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const videoWidth = video.videoWidth || 1920;
      const videoHeight = video.videoHeight || 1080;

      canvas.width = videoWidth;
      canvas.height = videoHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        if (!options?.isAuto) toast.error("Failed to capture image context");
        return;
      }

      // 1. Capture raw full-resolution camera frame
      ctx.drawImage(video, 0, 0, videoWidth, videoHeight);

      // 2. Find the paper on the full-resolution frame; the live overlay's corners are the fallback.
      let corners: DocumentCorners | null = null;
      const captureResult = detectDocumentCorners(canvas, { downscaleWidth: 640, minAreaPercent: 0.08 });
      if (captureResult.hasDocument && !captureResult.isFallback) {
        corners = captureResult.corners;
      } else if (isDocDetected) {
        corners = smoothedCornersRef.current;
      }
      const detected = corners !== null;
      if (!detected && options?.isAuto) return; // auto capture only ever fires on a real paper boundary

      triggerShutterFlash();
      const originalDataUrl = canvas.toDataURL("image/jpeg", PAGE_JPEG_QUALITY);
      const targetCorners = corners ?? getFullFrameCorners();

      // 3. Perspective-correct and crop to the paper (A4, portrait or landscape from the paper's shape)
      const warpedCanvas = warpPerspective(canvas, targetCorners, {
        aspectRatio: detected ? "a4" : "free",
        enhancement: "enhanced",
      });

      const pageNumber = pagesRef.current.length + 1;
      const newPage: ScannedPageItem = {
        id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        dataUrl: warpedCanvas.toDataURL("image/jpeg", PAGE_JPEG_QUALITY),
        originalDataUrl,
        corners: targetCorners,
        filter: "enhanced",
        name: `Page ${pageNumber}.jpg`,
        createdAt: Date.now(),
        rotation: 0,
      };
      setPages((prev) => [...prev, newPage]);

      // Lock auto-capture on this physical document
      autoEngineRef.current?.lockCapture(targetCorners);
      setIsCaptureLocked(true);

      if (detected) {
        toast.success(
          options?.isAuto ? `Page ${pageNumber} scanned & straightened!` : `Page ${pageNumber} captured & straightened!`
        );
      } else {
        toast.info(`No paper edge found on page ${pageNumber}. Drag the four corners onto the page.`);
        openEditor(newPage);
      }
    } finally {
      isCapturingRef.current = false;
    }
  }, [isDocDetected, triggerShutterFlash]);

  // ================= STAGE 1: REAL-TIME CORNER DETECTION LOOP =================
  useEffect(() => {
    if (!isCameraActive || cameraError || isCameraLoading || editingPage !== null || isFinalizing) {
      setAutoCaptureStatus("searching");
      setAutoCaptureProgress(0);
      setAutoCaptureMessage("Align document inside frame");
      return;
    }

    let animationFrameId: number;
    let lastAnalysisTime = 0;
    const intervalMs = 80; // ~12 FPS sampling rate for optimal balance of speed and battery

    const loop = (timestamp: number) => {
      if (timestamp - lastAnalysisTime >= intervalMs) {
        lastAnalysisTime = timestamp;
        if (videoRef.current && videoRef.current.readyState >= 2) {
          try {
            // 1. Detect 4 Corners in Real-Time
            const cvResult = detectDocumentCorners(videoRef.current, {
              downscaleWidth: 480,
            });

            if (cvResult.hasDocument && !cvResult.isFallback) {
              const smoothed = smoothCorners(cvResult.corners, smoothedCornersRef.current, 0.45);
              smoothedCornersRef.current = smoothed;
              setDetectedCorners(smoothed);
              setIsDocDetected(true);
            } else {
              setIsDocDetected(false);
              setDetectedCorners(getDefaultCorners());
            }

            // 2. Feed into Auto Capture Stability Engine (only when not currently capturing)
            if (isAutoCaptureEnabled && autoEngineRef.current && !isCapturingRef.current) {
              const autoAnalysis = autoEngineRef.current.analyzeFrame(videoRef.current, cvResult);
              setAutoCaptureStatus(autoAnalysis.status);
              setAutoCaptureProgress(autoAnalysis.stabilityProgress);
              setAutoCaptureMessage(autoAnalysis.message);

              if (autoAnalysis.status === "capturing") {
                handleCapture({ isAuto: true });
              }
            }
          } catch (loopErr) {
            console.warn("[SCANNER] Detection loop error:", loopErr);
          }
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isCameraActive, cameraError, isCameraLoading, editingPage, isFinalizing, isAutoCaptureEnabled, handleCapture]);

  // Handle file import from disk / gallery
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    const validMimes = new Set(["image/jpeg", "image/jpg", "image/png"]);
    const imported: ScannedPageItem[] = [];
    let withoutEdges = 0;

    // One at a time so the pages keep the order the files were picked in
    for (const file of files) {
      const mime = (file.type || "").toLowerCase();
      if (!validMimes.has(mime) && !file.name.match(/\.(jpe?g|png)$/i)) {
        toast.error(`"${file.name}" is not a JPEG or PNG image.`);
        continue;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const img = await loadImageElement(dataUrl);
        const detected = detectDocumentCorners(img, { downscaleWidth: 640 });
        const found = detected.hasDocument && !detected.isFallback;
        if (!found) withoutEdges++;
        const corners = found ? detected.corners : getFullFrameCorners();

        const warpedCanvas = warpPerspective(img, corners, {
          aspectRatio: found ? "a4" : "free",
          enhancement: "enhanced",
        });

        imported.push({
          id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          dataUrl: warpedCanvas.toDataURL("image/jpeg", PAGE_JPEG_QUALITY),
          originalDataUrl: dataUrl,
          corners,
          filter: "enhanced",
          file,
          name: file.name,
          createdAt: Date.now(),
          rotation: 0,
        });
      } catch (err: any) {
        toast.error(err.message || `Could not import "${file.name}"`);
      }
    }

    if (imported.length === 0) return;
    setPages((prev) => [...prev, ...imported]);
    if (withoutEdges > 0) {
      toast.info(
        `${imported.length} page${imported.length === 1 ? "" : "s"} imported. No paper edge was found on ${withoutEdges}; tap Adjust on ${withoutEdges === 1 ? "it" : "them"} to set the corners.`
      );
    } else {
      toast.success(`${imported.length} page${imported.length === 1 ? "" : "s"} imported & straightened`);
    }
  };

  // Remove a page by ID
  const handleRemovePage = (pageId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPages((prev) => prev.filter((p) => p.id !== pageId));
    toast.info("Page removed");
  };

  // Reorder page move left/right
  const handleMovePage = (index: number, direction: "left" | "right", e: React.MouseEvent) => {
    e.stopPropagation();
    const newIndex = direction === "left" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= pages.length) return;

    const newPages = [...pages];
    const [moved] = newPages.splice(index, 1);
    newPages.splice(newIndex, 0, moved);
    setPages(newPages);
  };

  // Clear all pages
  const handleClearAll = () => {
    setPages([]);
    autoEngineRef.current?.reArm();
    setIsCaptureLocked(false);
    toast.info("All scanned pages cleared");
  };

  // ================= EDIT MODE: 4-CORNER PIN ADJUSTMENT & ENHANCEMENT =================
  const handleStartEdit = (page: ScannedPageItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    openEditor(page);
  };

  // Corner pointer drag handler in edit modal
  const handleCornerPointerDown = (cornerKey: keyof DocumentCorners, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveCornerKey(cornerKey);
  };

  // Mouse/Touch move handler for dragging 4 corner handles in Edit Modal
  useEffect(() => {
    if (!activeCornerKey) return;

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if (!activeCornerKey || !editContainerRef.current) return;

      const rect = editContainerRef.current.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

      const normX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const normY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

      setEditCorners((prev) => ({
        ...prev,
        [activeCornerKey]: { x: normX, y: normY },
      }));
    };

    const handlePointerUp = () => {
      setActiveCornerKey(null);
    };

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
    window.addEventListener("touchmove", handlePointerMove);
    window.addEventListener("touchend", handlePointerUp);

    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
      window.removeEventListener("touchmove", handlePointerMove);
      window.removeEventListener("touchend", handlePointerUp);
    };
  }, [activeCornerKey]);

  // Rotate 90 degrees clockwise in Edit modal
  const handleRotateCW = () => {
    setEditRotation((prev) => (prev + 90) % 360);
  };

  // Reset corners to the whole photo
  const handleResetCorners = () => {
    setEditCorners(getFullFrameCorners());
    toast.info("Corners reset to the full photo");
  };

  // Re-run Auto Corner Detection on the original image
  const handleAutoDetectCorners = () => {
    if (!editingPage) return;
    if (!isCVReady()) {
      toast.error("Edge detection is not available right now. Drag the corners onto the page.");
      return;
    }
    const img = new Image();
    img.onload = () => {
      const res = detectDocumentCorners(img, { downscaleWidth: 640 });
      if (res.hasDocument && !res.isFallback) {
        setEditCorners(res.corners);
        toast.success("Document corners detected!");
      } else {
        toast.info("No clear paper edge found. Drag the corners onto the page.");
      }
    };
    img.src = editingPage.originalDataUrl || editingPage.dataUrl;
  };

  // Apply 4-corner perspective warp & enhancement in Edit modal
  const handleSaveEdits = async () => {
    if (!editingPage) return;
    setIsProcessingEdit(true);

    try {
      const sourceImage = new Image();
      sourceImage.crossOrigin = "anonymous";

      await new Promise<void>((resolve, reject) => {
        sourceImage.onload = () => resolve();
        sourceImage.onerror = () => reject(new Error("Failed to load source image for editing"));
        sourceImage.src = editingPage.originalDataUrl || editingPage.dataUrl;
      });

      // 1. Apply 4-corner perspective warp with selected aspect ratio
      const warpedCanvas = warpPerspective(sourceImage, editCorners, {
        aspectRatio: editAspectRatio,
        enhancement: editFilter,
      });

      // 2. Rotation is applied to the image itself here (it is not sent to the backend as well, so the PDF
      // page is never rotated twice).
      let finalCanvas = warpedCanvas;
      if (editRotation !== 0) {
        const is90or270 = editRotation % 180 !== 0;
        const rotCanvas = document.createElement("canvas");
        rotCanvas.width = is90or270 ? warpedCanvas.height : warpedCanvas.width;
        rotCanvas.height = is90or270 ? warpedCanvas.width : warpedCanvas.height;
        const rotCtx = rotCanvas.getContext("2d");
        if (rotCtx) {
          rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
          rotCtx.rotate((editRotation * Math.PI) / 180);
          rotCtx.drawImage(warpedCanvas, -warpedCanvas.width / 2, -warpedCanvas.height / 2);
          finalCanvas = rotCanvas;
        }
      }

      const updatedPage: ScannedPageItem = {
        ...editingPage,
        dataUrl: finalCanvas.toDataURL("image/jpeg", PAGE_JPEG_QUALITY),
        corners: editCorners,
        filter: editFilter,
        rotation: editRotation,
      };

      setPages((prev) =>
        prev.map((p) => (p.id === editingPage.id ? updatedPage : p))
      );

      if (selectedPreview && selectedPreview.id === editingPage.id) {
        setSelectedPreview(updatedPage);
      }

      setEditingPage(null);
      toast.success("Scanned document updated & enhanced!");
    } catch (err: any) {
      console.error("Save edits error:", err);
      toast.error(err.message || "Failed to process document edits");
    } finally {
      setIsProcessingEdit(false);
    }
  };

  // ================= STAGE 3: FINALIZE PDF & PRINT OPTIONS FLOW =================
  const handleFinalizeAndProceed = async () => {
    if (pages.length === 0) {
      toast.error("Please scan or add at least one page before printing.");
      return;
    }

    setIsFinalizing(true);
    try {
      let fromStep = 0;
      // Fit, upload, finalize. If the backend's own measurement of the PDF is still over 500 KB, go one step
      // smaller and try again with a fresh session.
      for (let attempt = 0; attempt < 4; attempt++) {
        const fitted = await fitPagesToPdfLimit(pages.map((p) => p.dataUrl), fromStep);
        if (!fitted) {
          toast.error("This document can't be made smaller than 500 KB and stay readable. Remove a page and try again.");
          return;
        }

        const sessionRes = await api.post("/scanner/sessions");
        const sid: string = sessionRes.data.sessionId;

        for (let i = 0; i < fitted.jpegs.length; i++) {
          const formData = new FormData();
          formData.append("page", fitted.jpegs[i], `page_${i + 1}.jpg`);
          formData.append("pageNumber", String(i + 1));
          await api.post(`/scanner/sessions/${sid}/pages`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        }

        let finalizeRes;
        try {
          finalizeRes = await api.post(`/scanner/sessions/${sid}/finalize`);
        } catch (err: any) {
          const msg: string = err.response?.data?.error || "";
          if (err.response?.status === 400 && /500 KB|maximum allowed size/i.test(msg)) {
            fromStep = fitted.step + 1;
            continue;
          }
          throw err;
        }

        const { jobId, pageCount, fileName } = finalizeRes.data;

        // Start a fresh checkout, same hand-off as the upload screen
        ["printCode", "printOptions", "printStatus", "uploadedImages", "totalPages"].forEach((k) =>
          sessionStorage.removeItem(k)
        );
        sessionStorage.setItem(
          "printFiles",
          JSON.stringify([
            {
              jobId,
              name: fileName || "scanned_document.pdf",
              size: fitted.pdfBytes,
              type: "application/pdf",
              pageCount: pageCount || pages.length,
            },
          ])
        );
        sessionStorage.setItem("uploadTotalPages", String(pageCount || pages.length));
        sessionStorage.setItem("uploadAmount", String((pageCount || pages.length) * 2));

        toast.success("Document compiled into ready-to-print PDF!");
        navigate("/print-options");
        return;
      }
      toast.error("This document can't be made smaller than 500 KB. Remove a page and try again.");
    } catch (err: any) {
      console.error("[SCANNER] Finalization error:", err);
      toast.error(
        err.response?.data?.error || err.message || "Failed to compile document into PDF"
      );
    } finally {
      setIsFinalizing(false);
    }
  };

  const filterLabel = (f: EnhancementMode) =>
    f === "bw" ? "Black & white" : f === "enhanced" ? "Enhanced" : f === "grayscale" ? "Grayscale" : "Original colour";

  const iconBtn =
    "press flex size-9 items-center justify-center rounded-full text-ink-2 transition-colors active:bg-surface-3 disabled:opacity-30";

  const cornerKeys: (keyof DocumentCorners)[] = ["topLeft", "topRight", "bottomRight", "bottomLeft"];

  return (
    <>
      <AppBar
        title="Scan a document"
        backTo="/upload"
        trailing={
          pages.length > 0 ? (
            <StatusPill tone="brand">
              {pages.length} {pages.length === 1 ? "page" : "pages"}
            </StatusPill>
          ) : undefined
        }
      />

      <Screen>
        {/* Camera viewport with live corner detection */}
        <div className="relative mt-2 aspect-[4/3] w-full overflow-hidden rounded-[20px] bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-cover transition-opacity duration-300 ${
              cameraError || isCameraLoading ? "opacity-0" : "opacity-100"
            }`}
          />

          {/* Hidden canvas for full-frame capture */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Shutter flash */}
          <div
            className={`pointer-events-none absolute inset-0 z-30 bg-white transition-opacity duration-200 ${
              isShutterFlashing ? "opacity-90" : "opacity-0"
            }`}
          />

          {!cameraError && !isCameraLoading && (
            <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
              <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon
                  points={cornerKeys.map((k) => `${detectedCorners[k].x * 100},${detectedCorners[k].y * 100}`).join(" ")}
                  className={`transition-all duration-100 ${
                    isDocDetected
                      ? "fill-emerald-500/20 stroke-emerald-400 stroke-[1.2]"
                      : "fill-white/5 stroke-white/60 stroke-[1]"
                  }`}
                />
                {isDocDetected &&
                  cornerKeys.map((k) => (
                    <circle
                      key={k}
                      cx={detectedCorners[k].x * 100}
                      cy={detectedCorners[k].y * 100}
                      r="2.2"
                      className="fill-white stroke-emerald-500 stroke-[0.8]"
                    />
                  ))}
              </svg>

              {/* Status pill */}
              <div className="absolute inset-x-3 top-3 z-30 flex items-center justify-between">
                <div
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold text-white backdrop-blur-md transition-colors ${
                    cvStatus === "unavailable"
                      ? "bg-amber-700/90"
                      : !isAutoCaptureEnabled || cvStatus === "loading"
                      ? "bg-black/60"
                      : autoCaptureStatus === "steady"
                      ? "bg-emerald-600/90"
                      : autoCaptureStatus === "detected"
                      ? "bg-amber-600/90"
                      : "bg-black/60"
                  }`}
                >
                  {cvStatus === "loading" ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>Loading edge detection…</span>
                    </>
                  ) : cvStatus === "unavailable" ? (
                    <>
                      <AlertCircle className="size-3.5" />
                      <span>Edge detection unavailable: tap Capture, then set the corners</span>
                    </>
                  ) : isAutoCaptureEnabled ? (
                    <>
                      <Sparkles className="size-3.5" />
                      <span>{autoCaptureMessage}</span>
                    </>
                  ) : (
                    <>
                      <Camera className="size-3.5" />
                      <span>{isDocDetected ? "Paper detected: tap Capture" : "Manual: tap Capture"}</span>
                    </>
                  )}
                </div>
                {isAutoCaptureEnabled && autoCaptureStatus === "steady" && (
                  <span className="rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-semibold tabular-nums text-emerald-300 backdrop-blur-md">
                    {Math.round(autoCaptureProgress * 100)}%
                  </span>
                )}
              </div>
            </div>
          )}

          {isCameraLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/90 p-4 text-white">
              <Loader2 className="size-7 animate-spin" />
              <p className="text-[14px] text-white/80">Starting camera…</p>
            </div>
          )}

          {cameraError && !isCameraLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black p-6 text-center text-white">
              <AlertCircle className="size-8 text-amber-400" />
              <div className="max-w-xs space-y-1">
                <p className="text-[16px] font-semibold">Camera unavailable</p>
                <p className="text-[13px] text-white/70">{cameraError}</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={startCamera}
                  className="press inline-flex h-10 items-center gap-1.5 rounded-full bg-white/15 px-4 text-[14px] font-medium"
                >
                  <RefreshCw className="size-4" />
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="press inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-[14px] font-semibold text-black"
                >
                  <Upload className="size-4" />
                  Choose photos
                </button>
              </div>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Capture mode */}
        <Segmented
          className="mt-4"
          label="Capture mode"
          value={isAutoCaptureEnabled ? "auto" : "manual"}
          onChange={(v) => setIsAutoCaptureEnabled(v === "auto")}
          options={[
            { value: "auto", label: "Auto capture" },
            { value: "manual", label: "Manual" },
          ]}
        />

        {/* Capture controls */}
        {pages.length > 0 && isCaptureLocked ? (
          <Group className="mt-4">
            <Row
              icon={
                <span className="block h-10 w-8 overflow-hidden rounded-md bg-black">
                  <img src={pages[pages.length - 1].dataUrl} alt="Last scan" className="h-full w-full object-cover" />
                </span>
              }
              label={`Page ${pages.length} captured`}
              detail="Auto capture paused for this page"
              trailing={
                <div className="flex items-center gap-1">
                  <button type="button" onClick={handleRetakeCurrentPage} className={iconBtn} aria-label="Retake page">
                    <RotateCcw className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartEdit(pages[pages.length - 1])}
                    className={iconBtn}
                    aria-label="Adjust corners"
                  >
                    <Sliders className="size-4" />
                  </button>
                </div>
              }
            />
          </Group>
        ) : null}

        <div className="mt-3 grid grid-cols-[1fr_1.5fr] gap-2">
          <SecondaryButton type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload className="size-4" />
            Import
          </SecondaryButton>
          {pages.length > 0 && isCaptureLocked ? (
            <PrimaryButton type="button" onClick={handleAddNewPage}>
              <Plus className="size-5" />
              Next page
            </PrimaryButton>
          ) : (
            <PrimaryButton
              type="button"
              disabled={!!cameraError || isCameraLoading}
              onClick={() => handleCapture({ isAuto: false })}
            >
              <Camera className="size-5" />
              {pages.length > 0 ? `Capture page ${pages.length + 1}` : "Capture"}
            </PrimaryButton>
          )}
        </div>

        {/* Scanned pages */}
        <Group
          title={pages.length > 0 ? `Scanned pages (${pages.length})` : "Scanned pages"}
          footer={pages.length > 0 ? "Tap a page to preview it. Pages print in this order." : undefined}
        >
          {pages.length === 0 ? (
            <EmptyState
              icon={<Scan className="size-8" strokeWidth={1.5} />}
              title="No pages yet"
              body="Point your camera at a page, or import photos from your phone."
            />
          ) : (
            pages.map((page, index) => (
              <div
                key={page.id}
                className="flex min-h-[72px] items-center gap-3 border-t border-hairline px-4 py-2.5 first:border-t-0"
              >
                <button
                  type="button"
                  onClick={() => setSelectedPreview(page)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="relative block h-14 w-10 shrink-0 overflow-hidden rounded-md bg-black">
                    <img src={page.dataUrl} alt={`Page ${index + 1}`} className="h-full w-full object-cover" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[16px] text-ink">Page {index + 1}</span>
                    <span className="mt-0.5 block text-[13px] text-ink-3">{filterLabel(page.filter)}</span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={(e) => handleMovePage(index, "left", e)}
                    disabled={index === 0}
                    className={iconBtn}
                    aria-label="Move up"
                  >
                    <ChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleMovePage(index, "right", e)}
                    disabled={index === pages.length - 1}
                    className={iconBtn}
                    aria-label="Move down"
                  >
                    <ChevronDown className="size-4" />
                  </button>
                  <button type="button" onClick={(e) => handleStartEdit(page, e)} className={iconBtn} aria-label="Adjust corners and filter">
                    <Sliders className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleRemovePage(page.id, e)}
                    className={`${iconBtn} text-danger`}
                    aria-label="Delete page"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </Group>

        {pages.length > 0 && (
          <div className="mt-2 flex justify-center">
            <TextButton onClick={handleClearAll} className="text-danger">
              <Trash2 className="size-4" />
              Clear all pages
            </TextButton>
          </div>
        )}

        {pages.length > 0 && <ActionBarSpacer size={110} />}
      </Screen>

      {pages.length > 0 && (
        <ActionBar>
          <PrimaryButton type="button" onClick={handleFinalizeAndProceed} loading={isFinalizing}>
            <Printer className="size-5" />
            Continue with {pages.length} {pages.length === 1 ? "page" : "pages"}
          </PrimaryButton>
        </ActionBar>
      )}

      {/* ================= PREVIEW MODAL ================= */}
      {selectedPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm"
          onClick={() => setSelectedPreview(null)}
        >
          <div
            className="w-full max-w-[440px] space-y-3 rounded-[20px] bg-surface p-4 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="truncate text-[17px] font-semibold text-ink">{selectedPreview.name || "Preview"}</h3>
              <button type="button" onClick={() => setSelectedPreview(null)} className={iconBtn} aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex max-h-[65vh] items-center justify-center overflow-auto rounded-[14px] bg-black p-2">
              <img src={selectedPreview.dataUrl} alt="Scanned page" className="max-h-[60vh] object-contain" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SecondaryButton
                type="button"
                onClick={() => {
                  const target = selectedPreview;
                  setSelectedPreview(null);
                  handleStartEdit(target);
                }}
              >
                <Sliders className="size-4" />
                Adjust
              </SecondaryButton>
              <PrimaryButton type="button" onClick={() => setSelectedPreview(null)}>
                Done
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {/* ================= CORNER & FILTER EDIT MODAL ================= */}
      {editingPage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/85 p-2 backdrop-blur-md">
          <div className="my-auto w-full max-w-[440px] space-y-4 rounded-[20px] bg-surface p-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-[17px] font-semibold text-ink">Adjust page</h3>
              <button type="button" onClick={() => setEditingPage(null)} className={iconBtn} aria-label="Close">
                <X className="size-5" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] text-ink-3">Drag the four corners to the edges of the paper.</p>
              <TextButton onClick={handleAutoDetectCorners} className="shrink-0 text-[14px]">
                <Sparkles className="size-4" />
                Auto-detect
              </TextButton>
            </div>

            <div
              ref={editContainerRef}
              className="relative flex aspect-[4/3] max-h-[50vh] w-full select-none items-center justify-center overflow-hidden rounded-[14px] bg-black"
            >
              <img
                src={editingPage.originalDataUrl || editingPage.dataUrl}
                alt="Original capture"
                className="pointer-events-none h-full w-full object-contain"
              />
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon
                  points={cornerKeys.map((k) => `${editCorners[k].x * 100},${editCorners[k].y * 100}`).join(" ")}
                  className="fill-sky-400/25 stroke-sky-300 stroke-[1.2]"
                />
              </svg>
              {cornerKeys.map((k) => (
                <div
                  key={k}
                  onMouseDown={(e) => handleCornerPointerDown(k, e)}
                  onTouchStart={(e) => handleCornerPointerDown(k, e)}
                  style={{ left: `${editCorners[k].x * 100}%`, top: `${editCorners[k].y * 100}%` }}
                  className={`absolute z-30 flex size-8 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-[3px] border-sky-500 bg-white shadow-xl transition-transform active:cursor-grabbing ${
                    activeCornerKey === k ? "scale-125" : ""
                  }`}
                >
                  <div className="size-1.5 rounded-full bg-sky-600" />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="px-1 text-[13px] font-medium text-ink-3">Filter</p>
              <Segmented
                label="Filter"
                value={editFilter}
                onChange={(v) => setEditFilter(v)}
                options={[
                  { value: "enhanced" as EnhancementMode, label: "Enhanced" },
                  { value: "bw" as EnhancementMode, label: "B&W" },
                  { value: "grayscale" as EnhancementMode, label: "Gray" },
                  { value: "original" as EnhancementMode, label: "Colour" },
                ]}
              />
            </div>

            <div className="space-y-2">
              <p className="px-1 text-[13px] font-medium text-ink-3">Shape</p>
              <div className="flex items-center gap-2">
                <Segmented
                  className="flex-1"
                  label="Shape"
                  value={editAspectRatio === "a4" ? "a4" : "free"}
                  onChange={(v) => setEditAspectRatio(v)}
                  options={[
                    { value: "a4" as AspectRatioMode, label: "A4" },
                    { value: "free" as AspectRatioMode, label: "Free" },
                  ]}
                />
                <button type="button" onClick={handleRotateCW} className={`${iconBtn} bg-surface-2`} aria-label="Rotate 90° clockwise">
                  <RotateCw className="size-4" />
                </button>
                <button type="button" onClick={handleResetCorners} className={`${iconBtn} bg-surface-2`} aria-label="Reset corners">
                  <Undo className="size-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <SecondaryButton type="button" onClick={() => setEditingPage(null)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton type="button" onClick={handleSaveEdits} loading={isProcessingEdit}>
                <Check className="size-5" />
                Save
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
