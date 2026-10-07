import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { MimoHeader } from "../components/mimo-header";
import {
  ArrowLeft,
  Camera,
  Upload,
  Trash2,
  AlertCircle,
  RefreshCw,
  Eye,
  FileText,
  Sparkles,
  Layers,
  X,
  RotateCw,
  RotateCcw,
  Check,
  Undo,
  Sliders,
  Sun,
  Contrast,
  Image as ImageIcon,
  ArrowRight,
  Printer,
  Loader2,
  CheckCircle2,
  Maximize2,
  Scan,
} from "lucide-react";
import { toast } from "sonner";
import api from "../api";
import { ScannerAutoCaptureEngine, AutoCaptureStatus } from "../utils/scanner-auto-capture";
import {
  loadOpenCV,
  isCVReady,
  detectDocumentCorners,
  smoothCorners,
  warpPerspective,
  enhanceDocumentImage,
  getDefaultCorners,
  orderCornerPoints,
  compressCanvasToOptimizedJpeg,
  getRecommendedPageBudget,
  DocumentCorners,
  Point2D,
  EnhancementMode,
} from "../utils/scanner-cv-engine";

export interface ScannedPageItem {
  id: string; // Local unique ID
  backendPageId?: string; // Backend pageId (e.g. "page-001")
  dataUrl: string; // Clean perspective-warped & enhanced document image
  originalDataUrl: string; // Full uncropped frame for manual re-adjustment
  corners: DocumentCorners; // 4 corners used for warp (normalized 0..1)
  filter: EnhancementMode;
  file?: File;
  name: string;
  createdAt: number;
  rotation: number; // 0, 90, 180, 270
  isUploading?: boolean;
}

type AspectRatioMode = "a4" | "free" | "1:1" | "4:3" | "16:9";

// Helper: Convert DataURL to Blob and MIME type
function dataUrlToBlob(dataUrl: string): { blob: Blob; mimeType: string } {
  const parts = dataUrl.split(",");
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const byteCharacters = atob(parts[1]);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return {
    blob: new Blob([byteArray], { type: mimeType }),
    mimeType,
  };
}

export function DocumentScanner() {
  const navigate = useNavigate();

  // Backend session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [, setIsCreatingSession] = useState<boolean>(false);
  const [isFinalizing, setIsFinalizing] = useState<boolean>(false);

  // Page state
  const [pages, setPages] = useState<ScannedPageItem[]>([]);
  const [selectedPreview, setSelectedPreview] = useState<ScannedPageItem | null>(null);

  // Computer Vision & Corner Detection state
  const [isOpenCvReady, setIsOpenCvReady] = useState<boolean>(false);
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

  // 1. Lazy load OpenCV.js WebAssembly on component mount
  useEffect(() => {
    loadOpenCV().then((cv) => {
      if (cv) {
        setIsOpenCvReady(true);
      }
    });
  }, []);

  // Trigger brief visual shutter flash animation
  const triggerShutterFlash = useCallback(() => {
    setIsShutterFlashing(true);
    setTimeout(() => {
      setIsShutterFlashing(false);
    }, 250);
  }, []);

  // Initialize or get backend scanner session
  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionId) return sessionId;

    setIsCreatingSession(true);
    try {
      const res = await api.post("/scanner/sessions");
      const newSid = res.data.sessionId;
      setSessionId(newSid);
      return newSid;
    } catch (err: any) {
      console.error("[SCANNER] Failed to create scanner session:", err);
      toast.error(err.response?.data?.error || "Failed to initialize document scanning session");
      throw err;
    } finally {
      setIsCreatingSession(false);
    }
  }, [sessionId]);

  // Upload a page to backend session
  const uploadPageToBackend = async (
    targetSessionId: string,
    pageItem: ScannedPageItem,
    pageNumber: number
  ) => {
    try {
      const { blob, mimeType } = dataUrlToBlob(pageItem.dataUrl);
      const extension = mimeType === "image/png" ? "png" : "jpg";
      const filename = pageItem.name || `page_${pageNumber}.${extension}`;

      const formData = new FormData();
      formData.append("page", blob, filename);
      formData.append("pageNumber", String(pageNumber));

      const res = await api.post(`/scanner/sessions/${targetSessionId}/pages`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const backendPageId = res.data.pageId;

      // If page had rotation, patch it to backend
      if (pageItem.rotation && [90, 180, 270].includes(pageItem.rotation)) {
        await api.patch(`/scanner/sessions/${targetSessionId}/pages/${backendPageId}`, {
          rotation: pageItem.rotation,
        }).catch(() => {});
      }

      setPages((prev) =>
        prev.map((p) =>
          p.id === pageItem.id
            ? { ...p, backendPageId, isUploading: false }
            : p
        )
      );
    } catch (err: any) {
      console.error(`[SCANNER] Failed to upload page ${pageNumber}:`, err);
      setPages((prev) =>
        prev.map((p) => (p.id === pageItem.id ? { ...p, isUploading: false } : p))
      );
      toast.error(`Page ${pageNumber} upload failed: ${err.response?.data?.error || err.message}`);
    }
  };

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

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsCameraActive(true);
    } catch (err: any) {
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
      setIsCameraLoading(false);
    }
  }, [stopCamera]);

  // Lifecycle: start camera on mount, stop on unmount
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // ================= STAGE 2: CAPTURE & PERSPECTIVE WARP =================
  const handleAddNewPage = useCallback(() => {
    autoEngineRef.current?.reArm();
    setIsCaptureLocked(false);
    toast.info(`Ready for Page ${pages.length + 1} — align document inside frame`);
  }, [pages.length]);

  const handleRetakeCurrentPage = useCallback(async () => {
    if (pages.length === 0) return;
    const lastPage = pages[pages.length - 1];
    setPages((prev) => prev.slice(0, -1));
    if (sessionId && lastPage.backendPageId) {
      api.delete(`/scanner/sessions/${sessionId}/pages/${lastPage.backendPageId}`).catch(() => {});
    }
    autoEngineRef.current?.reArm();
    setIsCaptureLocked(false);
    toast.info("Retaking page — align document inside frame");
  }, [pages, sessionId]);

  const handleCapture = useCallback(async (options?: { isAuto?: boolean }) => {
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
      triggerShutterFlash();

      // Full frame Data URL for manual adjustment in edit modal
      const originalDataUrl = canvas.toDataURL("image/jpeg", 0.95);

      // 2. Perform 4-Corner Perspective Warp & Document Rectification
      let targetCorners: DocumentCorners;
      let usedFallback = false;
      if (isDocDetected) {
        targetCorners = smoothedCornersRef.current;
      } else {
        // Run detection on the captured full-resolution canvas with high resolution analysis (640px)
        const captureResult = detectDocumentCorners(canvas, {
          downscaleWidth: 640,
          minAreaPercent: 0.08,
        });
        if (captureResult.hasDocument && !captureResult.isFallback) {
          targetCorners = captureResult.corners;
        } else {
          targetCorners = getDefaultCorners();
          usedFallback = true;
        }
      }

      // Warp perspective to clean A4 document canvas
      const warpedCanvas = warpPerspective(canvas, targetCorners, {
        aspectRatio: "a4",
        enhancement: "enhanced",
      });

      // Compress JPEG adaptively according to per-page budget for 500 KB limit
      let assignedPageNumber = 1;
      setPages((prev) => {
        assignedPageNumber = prev.length + 1;
        return prev;
      });

      const pageBudget = getRecommendedPageBudget(assignedPageNumber);
      const { dataUrl: finalDataUrl } = compressCanvasToOptimizedJpeg(warpedCanvas, {
        maxBytesPerPage: pageBudget,
      });

      let newPage: ScannedPageItem;

      setPages((prev) => {
        assignedPageNumber = prev.length + 1;
        newPage = {
          id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          dataUrl: finalDataUrl,
          originalDataUrl,
          corners: targetCorners,
          filter: "enhanced",
          name: `Page ${assignedPageNumber}.jpg`,
          createdAt: Date.now(),
          rotation: 0,
          isUploading: true,
        };
        return [...prev, newPage];
      });

      // Lock auto-capture on this physical document
      if (autoEngineRef.current) {
        autoEngineRef.current.lockCapture(targetCorners);
      }
      setIsCaptureLocked(true);

      if (usedFallback) {
        toast.info(`Page ${assignedPageNumber} captured with standard frame. Tap Edit to adjust corners.`);
      } else {
        toast.success(
          options?.isAuto
            ? `Page ${assignedPageNumber} scanned & straightened!`
            : `Page ${assignedPageNumber} captured & rectified!`
        );
      }

      // Upload clean scanned page to backend session
      try {
        const sid = await ensureSession();
        setTimeout(() => {
          if (newPage) {
            uploadPageToBackend(sid, newPage, assignedPageNumber);
          }
        }, 0);
      } catch (err) {
        console.warn("Deferred backend upload:", err);
      }
    } finally {
      isCapturingRef.current = false;
    }
  }, [ensureSession, isDocDetected, triggerShutterFlash]);

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
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const validMimes = new Set(["image/jpeg", "image/jpg", "image/png"]);
    let currentCount = pages.length;

    let targetSid: string | null = null;
    try {
      targetSid = await ensureSession();
    } catch (_) {}

    Array.from(files).forEach((file) => {
      const mime = (file.type || "").toLowerCase();
      if (!validMimes.has(mime) && !file.name.match(/\.(jpe?g|png)$/i)) {
        toast.error(`"${file.name}" is not a JPEG or PNG image.`);
        return;
      }

      currentCount++;
      const assignedPageNumber = currentCount;

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) {
          // Detect corners on imported image
          const tempImg = new Image();
          tempImg.onload = () => {
            const detected = detectDocumentCorners(tempImg, { downscaleWidth: 640 });
            const cornersToUse = detected.hasDocument && !detected.isFallback ? detected.corners : getDefaultCorners();

            const warpedCanvas = warpPerspective(tempImg, cornersToUse, {
              aspectRatio: "a4",
              enhancement: "enhanced",
            });
            const pageBudget = getRecommendedPageBudget(assignedPageNumber);
            const { dataUrl: finalWarpedDataUrl } = compressCanvasToOptimizedJpeg(warpedCanvas, {
              maxBytesPerPage: pageBudget,
            });

            const item: ScannedPageItem = {
              id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
              dataUrl: finalWarpedDataUrl,
              originalDataUrl: dataUrl,
              corners: cornersToUse,
              filter: "enhanced",
              file,
              name: file.name,
              createdAt: Date.now(),
              rotation: 0,
              isUploading: !!targetSid,
            };

            setPages((prev) => [...prev, item]);
            toast.success(`Imported & rectified "${file.name}"`);

            if (targetSid) {
              uploadPageToBackend(targetSid, item, assignedPageNumber);
            }
          };
          tempImg.src = dataUrl;
        }
      };
      reader.readAsDataURL(file);
    });

    e.target.value = "";
  };

  // Remove a page by ID
  const handleRemovePage = async (pageId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    const targetPage = pages.find((p) => p.id === pageId);
    setPages((prev) => prev.filter((p) => p.id !== pageId));
    toast.info("Page removed");

    if (sessionId && targetPage?.backendPageId) {
      try {
        await api.delete(`/scanner/sessions/${sessionId}/pages/${targetPage.backendPageId}`);
      } catch (err: any) {
        console.warn(`[SCANNER] Backend delete error for ${targetPage.backendPageId}:`, err);
      }
    }
  };

  // Reorder page move left/right
  const handleMovePage = async (index: number, direction: "left" | "right", e: React.MouseEvent) => {
    e.stopPropagation();
    const newIndex = direction === "left" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= pages.length) return;

    const newPages = [...pages];
    const [moved] = newPages.splice(index, 1);
    newPages.splice(newIndex, 0, moved);
    setPages(newPages);

    if (sessionId && newPages.every((p) => p.backendPageId)) {
      try {
        const order = newPages.map((p) => p.backendPageId!);
        await api.post(`/scanner/sessions/${sessionId}/reorder`, { order });
      } catch (err: any) {
        console.warn("[SCANNER] Backend reorder error:", err);
      }
    }
  };

  // Clear all pages
  const handleClearAll = async () => {
    if (sessionId && pages.length > 0) {
      pages.forEach((p) => {
        if (p.backendPageId) {
          api.delete(`/scanner/sessions/${sessionId}/pages/${p.backendPageId}`).catch(() => {});
        }
      });
    }
    setPages([]);
    setSessionId(null);
    toast.info("All scanned pages cleared");
  };

  // ================= EDIT MODE: 4-CORNER PIN ADJUSTMENT & ENHANCEMENT =================
  const handleStartEdit = (page: ScannedPageItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingPage(page);
    setEditCorners(page.corners || getDefaultCorners());
    setEditRotation(page.rotation || 0);
    setEditFilter(page.filter || "enhanced");
    setEditAspectRatio("a4");
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

  // Rotate 90 degrees counter-clockwise
  const handleRotateCCW = () => {
    setEditRotation((prev) => (prev - 90 + 360) % 360);
  };

  // Reset corners to default A4 frame
  const handleResetCorners = () => {
    setEditCorners(getDefaultCorners());
    toast.info("Corners reset to full frame");
  };

  // Re-run Auto Corner Detection on the original image
  const handleAutoDetectCorners = () => {
    if (!editingPage) return;
    const img = new Image();
    img.onload = () => {
      const res = detectDocumentCorners(img, { downscaleWidth: 640 });
      if (res.hasDocument && !res.isFallback) {
        setEditCorners(res.corners);
        toast.success("Document corners detected!");
      } else {
        setEditCorners(getDefaultCorners());
        toast.info("No clear paper boundary detected. Set to standard A4 frame.");
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

      // 2. Apply optional 90/180/270 degree rotation if requested
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

      const pageBudget = getRecommendedPageBudget(pages.length);
      const { dataUrl: finalDataUrl } = compressCanvasToOptimizedJpeg(finalCanvas, {
        maxBytesPerPage: pageBudget,
      });

      const updatedPage: ScannedPageItem = {
        ...editingPage,
        dataUrl: finalDataUrl,
        corners: editCorners,
        filter: editFilter,
        rotation: editRotation,
      };

      setPages((prev) =>
        prev.map((p) => (p.id === editingPage.id ? updatedPage : p))
      );

      // Synchronize update with backend if session exists
      if (sessionId && editingPage.backendPageId) {
        api.patch(`/scanner/sessions/${sessionId}/pages/${editingPage.backendPageId}`, {
          rotation: editRotation,
        }).catch((err) => console.warn("[SCANNER] Failed to patch rotation:", err));
      }

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
      let targetSid = sessionId;
      if (!targetSid) {
        targetSid = await ensureSession();
      }

      // Upload any un-uploaded pages
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        if (!page.backendPageId) {
          const { blob, mimeType } = dataUrlToBlob(page.dataUrl);
          const extension = mimeType === "image/png" ? "png" : "jpg";
          const formData = new FormData();
          formData.append("page", blob, page.name || `page_${i + 1}.${extension}`);
          formData.append("pageNumber", String(i + 1));

          const res = await api.post(`/scanner/sessions/${targetSid}/pages`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });

          page.backendPageId = res.data.pageId;

          if (page.rotation && [90, 180, 270].includes(page.rotation)) {
            await api.patch(`/scanner/sessions/${targetSid}/pages/${res.data.pageId}`, {
              rotation: page.rotation,
            }).catch(() => {});
          }
        }
      }

      // Reorder pages in backend
      if (pages.every((p) => p.backendPageId)) {
        await api.post(`/scanner/sessions/${targetSid}/reorder`, {
          order: pages.map((p) => p.backendPageId!),
        }).catch(() => {});
      }

      // Finalize session into PDF
      const finalizeRes = await api.post(`/scanner/sessions/${targetSid}/finalize`);
      const { jobId, pageCount, fileName } = finalizeRes.data;

      // Store in sessionStorage for print options flow
      sessionStorage.setItem(
        "printFiles",
        JSON.stringify([
          {
            jobId,
            name: fileName || "scanned_document.pdf",
            size: 0,
            type: "application/pdf",
            pageCount: pageCount || pages.length,
          },
        ])
      );
      sessionStorage.setItem("uploadTotalPages", String(pageCount || pages.length));

      toast.success("Document compiled into ready-to-print PDF!");
      navigate("/print-options");
    } catch (err: any) {
      console.error("[SCANNER] Finalization error:", err);
      toast.error(
        err.response?.data?.error || err.message || "Failed to compile document into PDF"
      );
    } finally {
      setIsFinalizing(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-slate-50/50 px-2 pt-0 pb-4 sm:px-4 sm:pt-0 sm:pb-6">
      <div className="mx-auto max-w-5xl space-y-3 sm:space-y-4">
        {/* Global font import */}
        <style>
          {`
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');
          `}
        </style>

        {/* MIMO Global Header */}
        <MimoHeader />

        {/* Header Bar */}
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/")}
              className="text-[#093765] hover:text-blue-600 transition-colors cursor-pointer flex items-center justify-center p-1.5 rounded-xl hover:bg-slate-200/50 -ml-1"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="w-6 h-6" strokeWidth={2.5} />
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-[#093765] to-blue-600 bg-clip-text text-transparent tracking-tight leading-tight flex items-center gap-2">
                Document Scanner
                {isOpenCvReady && (
                  <span className="hidden sm:inline-flex text-[10px] uppercase tracking-wider font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md border border-emerald-300">
                    AI Auto-Crop
                  </span>
                )}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">
                Auto-detects paper, rectifies perspective &amp; enhances text for printing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="px-3 py-1 bg-white border-blue-200 text-[#093765] font-bold text-xs sm:text-sm shadow-2xs flex items-center gap-1.5"
            >
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              {pages.length} {pages.length === 1 ? "Page" : "Pages"}
            </Badge>

            {pages.length > 0 && (
              <Button
                type="button"
                onClick={handleFinalizeAndProceed}
                disabled={isFinalizing}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs sm:text-sm h-8 sm:h-9 px-3 sm:px-4 rounded-xl shadow-md cursor-pointer transition-all active:scale-95"
              >
                {isFinalizing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Compiling...
                  </>
                ) : (
                  <>
                    <Printer className="w-4 h-4 mr-1.5" />
                    Compile &amp; Print
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Main Scanner Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Column: Camera Viewport with Live Corner Detection Overlay */}
          <div className="lg:col-span-7 space-y-3">
            <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-xl overflow-hidden">
              <CardContent className="p-3 sm:p-4 space-y-3">
                {/* Camera Viewport Box */}
                <div className="relative aspect-[4/3] w-full bg-slate-950 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center border border-slate-800">
                  {/* Active Video Stream */}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover transition-opacity duration-300 ${
                      cameraError || isCameraLoading ? "opacity-0" : "opacity-100"
                    }`}
                  />

                  {/* Hidden Canvas for Full Frame Capture */}
                  <canvas ref={canvasRef} className="hidden" />

                  {/* Shutter Flash Animation */}
                  <div
                    className={`absolute inset-0 bg-white pointer-events-none z-30 transition-opacity duration-200 ${
                      isShutterFlashing ? "opacity-90" : "opacity-0"
                    }`}
                  />

                  {/* Dynamic SVG Live Corner Detection Overlay */}
                  {!cameraError && !isCameraLoading && (
                    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
                      <svg
                        className="w-full h-full"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                      >
                        {/* 4-Corner Polygon */}
                        <polygon
                          points={`${detectedCorners.topLeft.x * 100},${detectedCorners.topLeft.y * 100} ${detectedCorners.topRight.x * 100},${detectedCorners.topRight.y * 100} ${detectedCorners.bottomRight.x * 100},${detectedCorners.bottomRight.y * 100} ${detectedCorners.bottomLeft.x * 100},${detectedCorners.bottomLeft.y * 100}`}
                          className={`transition-all duration-100 ${
                            isDocDetected
                              ? "fill-emerald-500/20 stroke-emerald-400 stroke-[1.2]"
                              : "fill-blue-500/10 stroke-white/60 stroke-[1] stroke-dasharray-[2,2]"
                          }`}
                        />

                        {/* 4 Corner Pins */}
                        {isDocDetected && (
                          <>
                            <circle
                              cx={detectedCorners.topLeft.x * 100}
                              cy={detectedCorners.topLeft.y * 100}
                              r="2.2"
                              className="fill-white stroke-emerald-500 stroke-[0.8]"
                            />
                            <circle
                              cx={detectedCorners.topRight.x * 100}
                              cy={detectedCorners.topRight.y * 100}
                              r="2.2"
                              className="fill-white stroke-emerald-500 stroke-[0.8]"
                            />
                            <circle
                              cx={detectedCorners.bottomRight.x * 100}
                              cy={detectedCorners.bottomRight.y * 100}
                              r="2.2"
                              className="fill-white stroke-emerald-500 stroke-[0.8]"
                            />
                            <circle
                              cx={detectedCorners.bottomLeft.x * 100}
                              cy={detectedCorners.bottomLeft.y * 100}
                              r="2.2"
                              className="fill-white stroke-emerald-500 stroke-[0.8]"
                            />
                          </>
                        )}
                      </svg>

                      {/* Header Badge Overlay */}
                      <div className="absolute top-3 inset-x-3 flex justify-between items-center z-30">
                        <div
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] sm:text-xs font-bold backdrop-blur-md transition-all shadow-md ${
                            !isAutoCaptureEnabled
                              ? "bg-slate-900/80 text-slate-200 border border-slate-700"
                              : autoCaptureStatus === "steady"
                              ? "bg-emerald-600/90 text-white border border-emerald-400 shadow-emerald-500/30 scale-105"
                              : autoCaptureStatus === "detected"
                              ? "bg-amber-600/90 text-white border border-amber-400 shadow-amber-500/30"
                              : autoCaptureStatus === "cooldown"
                              ? "bg-blue-600/80 text-white border border-blue-400"
                              : "bg-black/60 text-white/90 border border-white/20"
                          }`}
                        >
                          {isAutoCaptureEnabled ? (
                            <>
                              <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                              <span>{autoCaptureMessage}</span>
                            </>
                          ) : (
                            <>
                              <Camera className="w-3.5 h-3.5 text-blue-400" />
                              <span>Manual Mode: Tap Capture</span>
                            </>
                          )}
                        </div>

                        {/* Progress Indicator */}
                        {isAutoCaptureEnabled && autoCaptureStatus === "steady" && (
                          <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full text-emerald-400 font-mono text-[10px] sm:text-xs font-bold border border-emerald-500/40">
                            <span>{Math.round(autoCaptureProgress * 100)}%</span>
                          </div>
                        )}
                      </div>

                      {/* Bottom Status Bar */}
                      <div className="absolute bottom-3 left-3 flex items-center gap-2">
                        <span className="text-[10px] sm:text-xs font-mono text-white/80 bg-black/60 px-2.5 py-1 rounded-lg backdrop-blur-xs">
                          {isDocDetected ? "Document Locked" : "Searching for Document..."}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Loading State */}
                  {isCameraLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-white gap-3 p-4">
                      <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
                      <p className="text-sm font-medium text-slate-200">Initializing camera &amp; CV engine...</p>
                    </div>
                  )}

                  {/* Error State */}
                  {cameraError && !isCameraLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center space-y-4">
                      <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                        <AlertCircle className="w-6 h-6" />
                      </div>
                      <div className="max-w-xs space-y-1">
                        <p className="font-bold text-sm sm:text-base text-slate-100">Camera Unavailable</p>
                        <p className="text-xs text-slate-400">{cameraError}</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={startCamera}
                          className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                          Retry Camera
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          className="bg-blue-600 hover:bg-blue-500 text-white text-xs cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5 mr-1.5" />
                          Choose Photos
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Mode Toggle & Shutter Actions */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAutoCaptureEnabled((v) => !v)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs ${
                        isAutoCaptureEnabled
                          ? "bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100"
                          : "bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200"
                      }`}
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${isAutoCaptureEnabled ? "text-amber-600" : "text-slate-400"}`} />
                      <span>Auto Capture: {isAutoCaptureEnabled ? "ON" : "OFF"}</span>
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {isDocDetected ? "Document in focus" : "Point camera at document"}
                  </span>
                </div>

                {/* Shutter Bar & WhatsApp-Style Controls */}
                {pages.length > 0 && isCaptureLocked ? (
                  <div className="space-y-2 pt-1 px-1">
                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-emerald-50 border border-emerald-200">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-10 bg-slate-900 rounded-md overflow-hidden border border-emerald-400 shrink-0 shadow-2xs">
                          <img src={pages[pages.length - 1].dataUrl} alt="Last scan" className="w-full h-full object-cover" />
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-bold text-emerald-900">Page {pages.length} Captured</p>
                          <p className="text-[10px] text-emerald-700">Auto-capture locked for this page</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleRetakeCurrentPage}
                          className="h-8 text-xs font-bold border-amber-300 text-amber-800 hover:bg-amber-100 bg-white cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5 mr-1" />
                          Retake
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleStartEdit(pages[pages.length - 1])}
                          className="h-8 text-xs font-bold border-blue-300 text-blue-800 hover:bg-blue-100 bg-white cursor-pointer"
                        >
                          <Sliders className="w-3.5 h-3.5 mr-1" />
                          Pins
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 rounded-xl border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm h-11 cursor-pointer"
                      >
                        <Upload className="w-4 h-4 mr-1.5 text-blue-600" />
                        Import
                      </Button>
                      <Button
                        type="button"
                        onClick={handleAddNewPage}
                        className="flex-[2] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs sm:text-sm h-11 shadow-md cursor-pointer active:scale-[0.98]"
                      >
                        <Sparkles className="w-4 h-4 mr-1.5" />
                        + Add Next Page (Page {pages.length + 1})
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3 pt-1 px-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 rounded-xl border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm h-11 cursor-pointer transition-all shadow-2xs"
                    >
                      <Upload className="w-4 h-4 mr-1.5 text-blue-600" />
                      Import Photo
                    </Button>

                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                      onChange={handleFileSelect}
                      className="hidden"
                    />

                    <Button
                      type="button"
                      disabled={!!cameraError || isCameraLoading}
                      onClick={() => handleCapture({ isAuto: false })}
                      className="flex-[1.5] rounded-xl bg-gradient-to-r from-[#093765] via-blue-700 to-blue-600 hover:from-[#072d54] hover:to-blue-700 text-white font-extrabold text-sm sm:text-base h-11 cursor-pointer transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
                    >
                      <Camera className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                      {pages.length > 0 ? `Scan Page ${pages.length + 1}` : "Scan Document"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Scanned Pages Gallery & Order Controls */}
          <div className="lg:col-span-5 space-y-3">
            <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-xl">
              <CardContent className="p-3 sm:p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-[#093765]" />
                    <h2 className="font-extrabold text-sm sm:text-base text-slate-800">
                      Scanned Pages ({pages.length})
                    </h2>
                  </div>

                  {pages.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="text-xs text-red-500 hover:text-red-700 font-bold flex items-center gap-1 cursor-pointer p-1 rounded-md hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear All
                    </button>
                  )}
                </div>

                {/* Empty State */}
                {pages.length === 0 ? (
                  <div className="py-12 px-4 text-center space-y-3 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                      <Scan className="w-6 h-6" />
                    </div>
                    <div className="space-y-1 max-w-xs mx-auto">
                      <p className="font-bold text-xs sm:text-sm text-slate-700">No pages scanned yet</p>
                      <p className="text-[11px] sm:text-xs text-slate-400">
                        Point camera at physical paper to auto-capture, or import photos from your device
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Pages Thumbnails List */
                  <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                    {pages.map((page, index) => (
                      <div
                        key={page.id}
                        className="group relative flex items-center justify-between p-2 sm:p-2.5 bg-slate-50/80 hover:bg-blue-50/50 border border-slate-200/80 rounded-xl transition-all shadow-2xs"
                      >
                        <div
                          className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                          onClick={() => setSelectedPreview(page)}
                        >
                          <div className="relative w-12 h-16 sm:w-14 sm:h-18 bg-slate-900 rounded-lg overflow-hidden border border-slate-200 shrink-0 shadow-2xs">
                            <img
                              src={page.dataUrl}
                              alt={`Page ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute top-1 left-1 bg-black/70 text-white font-mono text-[9px] px-1.5 py-0.5 rounded-sm font-bold">
                              {index + 1}
                            </div>
                            {page.isUploading && (
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                <Loader2 className="w-4 h-4 text-white animate-spin" />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="text-xs sm:text-sm font-bold text-slate-800 truncate">
                              Page {index + 1}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {page.filter === "bw"
                                ? "B&W Document"
                                : page.filter === "enhanced"
                                ? "Enhanced Magic"
                                : page.filter === "grayscale"
                                ? "Grayscale"
                                : "Original Color"}
                            </p>
                            <span className="inline-block mt-0.5 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                              Rectified A4
                            </span>
                          </div>
                        </div>

                        {/* Page Actions: Reorder, Edit, Delete */}
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Reorder Up/Left */}
                          {index > 0 && (
                            <button
                              type="button"
                              onClick={(e) => handleMovePage(index, "left", e)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-white transition-colors cursor-pointer"
                              title="Move up"
                            >
                              <ArrowLeft className="w-3.5 h-3.5 rotate-90" />
                            </button>
                          )}

                          {/* Reorder Down/Right */}
                          {index < pages.length - 1 && (
                            <button
                              type="button"
                              onClick={(e) => handleMovePage(index, "right", e)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-white transition-colors cursor-pointer"
                              title="Move down"
                            >
                              <ArrowLeft className="w-3.5 h-3.5 -rotate-90" />
                            </button>
                          )}

                          {/* Edit 4-Corners & Filters */}
                          <button
                            type="button"
                            onClick={(e) => handleStartEdit(page, e)}
                            className="p-1.5 text-blue-600 hover:text-blue-700 bg-blue-50/80 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                            title="Edit corners & filters"
                          >
                            <Sliders className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={(e) => handleRemovePage(page.id, e)}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete page"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Finalize Button */}
                {pages.length > 0 && (
                  <Button
                    type="button"
                    onClick={handleFinalizeAndProceed}
                    disabled={isFinalizing}
                    className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm h-11 rounded-xl shadow-lg cursor-pointer transition-all active:scale-[0.99]"
                  >
                    {isFinalizing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Compiling Document into PDF...
                      </>
                    ) : (
                      <>
                        <Printer className="w-4 h-4 mr-2" />
                        Compile {pages.length} {pages.length === 1 ? "Page" : "Pages"} &amp; Print
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ================= MODAL 1: PREVIEW FULL IMAGE ================= */}
        {selectedPreview && (
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
            onClick={() => setSelectedPreview(null)}
          >
            <div
              className="relative max-w-2xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl space-y-3 p-4 animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="font-extrabold text-sm sm:text-base text-slate-800">
                  {selectedPreview.name || "Scanned Document Preview"}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedPreview(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="max-h-[70vh] overflow-auto flex items-center justify-center bg-slate-900 rounded-xl p-2">
                <img
                  src={selectedPreview.dataUrl}
                  alt="Scanned page full view"
                  className="max-h-[65vh] object-contain rounded shadow-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const target = selectedPreview;
                    setSelectedPreview(null);
                    handleStartEdit(target);
                  }}
                  className="text-xs font-bold cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 mr-1.5" />
                  Adjust Corners &amp; Filters
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setSelectedPreview(null)}
                  className="bg-[#093765] hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ================= MODAL 2: INTERACTIVE 4-CORNER PIN & ENHANCEMENT EDIT MODAL ================= */}
        {editingPage && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
            <div className="relative max-w-3xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl p-3 sm:p-5 space-y-3 my-auto animate-in fade-in zoom-in-95 duration-200">
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-blue-600" />
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-800">
                    Adjust 4 Document Corners &amp; Filters
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingPage(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Instruction banner */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-2 sm:p-2.5 flex items-center justify-between text-xs text-blue-800">
                <span className="font-medium">
                  Drag the 4 corner circles to align precisely with the paper edges.
                </span>
                <button
                  type="button"
                  onClick={handleAutoDetectCorners}
                  className="px-2.5 py-1 bg-white border border-blue-300 rounded-lg text-blue-700 font-bold hover:bg-blue-100 text-[11px] cursor-pointer shrink-0 ml-2"
                >
                  <Sparkles className="w-3 h-3 inline mr-1 text-amber-500" />
                  Auto-Detect
                </button>
              </div>

              {/* Interactive 4-Corner Viewport */}
              <div
                ref={editContainerRef}
                className="relative aspect-[4/3] w-full max-h-[50vh] bg-slate-950 rounded-xl overflow-hidden shadow-inner flex items-center justify-center select-none"
              >
                {/* Full Uncropped Source Frame */}
                <img
                  src={editingPage.originalDataUrl || editingPage.dataUrl}
                  alt="Original Capture Frame"
                  className="w-full h-full object-contain pointer-events-none"
                />

                {/* SVG Polygon & Corner Handles Overlay */}
                <svg
                  className="absolute inset-0 w-full h-full"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  {/* Connecting Quadrilateral Polygon */}
                  <polygon
                    points={`${editCorners.topLeft.x * 100},${editCorners.topLeft.y * 100} ${editCorners.topRight.x * 100},${editCorners.topRight.y * 100} ${editCorners.bottomRight.x * 100},${editCorners.bottomRight.y * 100} ${editCorners.bottomLeft.x * 100},${editCorners.bottomLeft.y * 100}`}
                    className="fill-blue-500/25 stroke-blue-400 stroke-[1.2]"
                  />
                </svg>

                {/* Top-Left Corner Pin */}
                <div
                  onMouseDown={(e) => handleCornerPointerDown("topLeft", e)}
                  onTouchStart={(e) => handleCornerPointerDown("topLeft", e)}
                  style={{
                    left: `${editCorners.topLeft.x * 100}%`,
                    top: `${editCorners.topLeft.y * 100}%`,
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 bg-white border-3 border-blue-600 rounded-full shadow-xl cursor-grab active:cursor-grabbing flex items-center justify-center z-30 hover:scale-125 transition-transform"
                >
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
                </div>

                {/* Top-Right Corner Pin */}
                <div
                  onMouseDown={(e) => handleCornerPointerDown("topRight", e)}
                  onTouchStart={(e) => handleCornerPointerDown("topRight", e)}
                  style={{
                    left: `${editCorners.topRight.x * 100}%`,
                    top: `${editCorners.topRight.y * 100}%`,
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 bg-white border-3 border-blue-600 rounded-full shadow-xl cursor-grab active:cursor-grabbing flex items-center justify-center z-30 hover:scale-125 transition-transform"
                >
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
                </div>

                {/* Bottom-Right Corner Pin */}
                <div
                  onMouseDown={(e) => handleCornerPointerDown("bottomRight", e)}
                  onTouchStart={(e) => handleCornerPointerDown("bottomRight", e)}
                  style={{
                    left: `${editCorners.bottomRight.x * 100}%`,
                    top: `${editCorners.bottomRight.y * 100}%`,
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 bg-white border-3 border-blue-600 rounded-full shadow-xl cursor-grab active:cursor-grabbing flex items-center justify-center z-30 hover:scale-125 transition-transform"
                >
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
                </div>

                {/* Bottom-Left Corner Pin */}
                <div
                  onMouseDown={(e) => handleCornerPointerDown("bottomLeft", e)}
                  onTouchStart={(e) => handleCornerPointerDown("bottomLeft", e)}
                  style={{
                    left: `${editCorners.bottomLeft.x * 100}%`,
                    top: `${editCorners.bottomLeft.y * 100}%`,
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 bg-white border-3 border-blue-600 rounded-full shadow-xl cursor-grab active:cursor-grabbing flex items-center justify-center z-30 hover:scale-125 transition-transform"
                >
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
                </div>
              </div>

              {/* Controls Toolbar: Filters & Rotation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {/* Enhancement Filters */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    Document Filter
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { id: "enhanced", label: "Magic", icon: Sparkles },
                      { id: "bw", label: "B&W", icon: Contrast },
                      { id: "original", label: "Color", icon: ImageIcon },
                      { id: "grayscale", label: "Gray", icon: Sun },
                    ].map((f) => {
                      const Icon = f.icon;
                      const isActive = editFilter === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setEditFilter(f.id as EnhancementMode)}
                          className={`py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                            isActive
                              ? "bg-blue-600 text-white shadow-md"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>{f.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Aspect Ratio & Rotation */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    Layout &amp; Orientation
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditAspectRatio("a4")}
                      className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        editAspectRatio === "a4"
                          ? "bg-[#093765] text-white shadow-md"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      A4 Standard
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditAspectRatio("free")}
                      className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        editAspectRatio === "free"
                          ? "bg-[#093765] text-white shadow-md"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      Free Ratio
                    </button>
                    <button
                      type="button"
                      onClick={handleRotateCW}
                      className="p-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl cursor-pointer"
                      title="Rotate 90° Clockwise"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleResetCorners}
                      className="p-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl cursor-pointer"
                      title="Reset Corners"
                    >
                      <Undo className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingPage(null)}
                  className="text-xs font-bold cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isProcessingEdit}
                  onClick={handleSaveEdits}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-4 h-9 rounded-xl shadow-md cursor-pointer transition-all"
                >
                  {isProcessingEdit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Straightening...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                      Save &amp; Straighten
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
