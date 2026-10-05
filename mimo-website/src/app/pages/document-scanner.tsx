import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { MimoHeader } from "../components/mimo-header";
import {
  ArrowLeft,
  Camera,
  Upload,
  Plus,
  Trash2,
  AlertCircle,
  RefreshCw,
  Eye,
  FileText,
  Sparkles,
  Layers,
  X,
  Crop as CropIcon,
  RotateCw,
  RotateCcw,
  Check,
  Undo,
  Maximize2,
  Sliders,
  Sun,
  Contrast,
  Image as ImageIcon,
  ArrowRight,
  ArrowLeft as ArrowLeftIcon,
  Printer,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import api from "../api";
import { ScannerAutoCaptureEngine, AutoCaptureStatus } from "../utils/scanner-auto-capture";

export interface ScannedPageItem {
  id: string; // Local unique ID
  backendPageId?: string; // Backend pageId (e.g. "page-001")
  dataUrl: string;
  originalDataUrl: string;
  file?: File;
  name: string;
  createdAt: number;
  rotation: number; // 0, 90, 180, 270
  isUploading?: boolean;
}

type FilterMode = "original" | "magic" | "bw" | "grayscale";
type AspectRatioMode = "free" | "a4" | "1:1" | "4:3" | "16:9";

interface CropRect {
  x: number; // 0..1
  y: number; // 0..1
  width: number; // 0..1
  height: number; // 0..1
}

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
  const [isCreatingSession, setIsCreatingSession] = useState<boolean>(false);
  const [isFinalizing, setIsFinalizing] = useState<boolean>(false);

  // Page state
  const [pages, setPages] = useState<ScannedPageItem[]>([]);
  const [selectedPreview, setSelectedPreview] = useState<ScannedPageItem | null>(null);

  // Edit / Crop state
  const [editingPage, setEditingPage] = useState<ScannedPageItem | null>(null);
  const [editRotation, setEditRotation] = useState<number>(0);
  const [editFilter, setEditFilter] = useState<FilterMode>("original");
  const [editAspectRatio, setEditAspectRatio] = useState<AspectRatioMode>("free");
  const [cropRect, setCropRect] = useState<CropRect>({ x: 0, y: 0, width: 1, height: 1 });
  const [isProcessingEdit, setIsProcessingEdit] = useState<boolean>(false);

  // Dragging crop box state
  const cropContainerRef = useRef<HTMLDivElement | null>(null);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const dragStartPos = useRef<{ x: number; y: number; rect: CropRect }>({
    x: 0,
    y: 0,
    rect: { x: 0, y: 0, width: 1, height: 1 },
  });

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
  const [isAutoCaptureEnabled, setIsAutoCaptureEnabled] = useState<boolean>(true);
  const [autoCaptureStatus, setAutoCaptureStatus] = useState<AutoCaptureStatus>("searching");
  const [autoCaptureProgress, setAutoCaptureProgress] = useState<number>(0);
  const [autoCaptureMessage, setAutoCaptureMessage] = useState<string>("Align document inside frame");
  const [isShutterFlashing, setIsShutterFlashing] = useState<boolean>(false);

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

  // Capture frame from video stream (supports both manual and automatic capture)
  const handleCapture = useCallback(async (options?: { isAuto?: boolean }) => {
    if (!videoRef.current || !canvasRef.current) {
      if (!options?.isAuto) toast.error("Camera view is not available");
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const videoWidth = video.videoWidth || 1280;
    const videoHeight = video.videoHeight || 720;

    canvas.width = videoWidth;
    canvas.height = videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      if (!options?.isAuto) toast.error("Failed to capture image context");
      return;
    }

    ctx.drawImage(video, 0, 0, videoWidth, videoHeight);

    triggerShutterFlash();

    // Trigger cooldown in auto-capture engine to prevent rapid consecutive captures
    if (autoEngineRef.current) {
      autoEngineRef.current.triggerCooldown();
    }

    // Export as high-quality JPEG data URL
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);

    let assignedPageNumber = 1;
    let newPage: ScannedPageItem;

    setPages((prev) => {
      assignedPageNumber = prev.length + 1;
      newPage = {
        id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        dataUrl,
        originalDataUrl: dataUrl,
        name: `Page ${assignedPageNumber}.jpg`,
        createdAt: Date.now(),
        rotation: 0,
        isUploading: true,
      };
      return [...prev, newPage];
    });

    toast.success(options?.isAuto ? `Page ${assignedPageNumber} auto-captured!` : `Page ${assignedPageNumber} captured!`);

    // Ensure session and upload page to backend
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
  }, [ensureSession, triggerShutterFlash]);

  // Auto-capture detection & stability monitoring loop
  useEffect(() => {
    if (!isAutoCaptureEnabled || !isCameraActive || cameraError || isCameraLoading || editingPage !== null || isFinalizing) {
      setAutoCaptureStatus("searching");
      setAutoCaptureProgress(0);
      setAutoCaptureMessage("Align document inside frame");
      return;
    }

    let animationFrameId: number;
    let lastAnalysisTime = 0;
    const intervalMs = 90; // ~11 FPS sampling rate for optimal performance and low battery impact

    const loop = (timestamp: number) => {
      if (timestamp - lastAnalysisTime >= intervalMs) {
        lastAnalysisTime = timestamp;
        if (videoRef.current && autoEngineRef.current && videoRef.current.readyState >= 2) {
          const result = autoEngineRef.current.analyzeFrame(videoRef.current);
          setAutoCaptureStatus(result.status);
          setAutoCaptureProgress(result.stabilityProgress);
          setAutoCaptureMessage(result.message);

          if (result.status === "capturing") {
            handleCapture({ isAuto: true });
          }
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isAutoCaptureEnabled, isCameraActive, cameraError, isCameraLoading, editingPage, isFinalizing, handleCapture]);

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
          const item: ScannedPageItem = {
            id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            dataUrl,
            originalDataUrl: dataUrl,
            file,
            name: file.name,
            createdAt: Date.now(),
            rotation: 0,
            isUploading: !!targetSid,
          };
          setPages((prev) => [...prev, item]);
          toast.success(`Imported "${file.name}"`);

          if (targetSid) {
            uploadPageToBackend(targetSid, item, assignedPageNumber);
          }
        }
      };
      reader.readAsDataURL(file);
    });

    // Reset input so the user can select the same file again if desired
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

    // If all pages have backend page IDs, sync reorder to backend
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
      // Delete pages in backend
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

  // Open Edit Mode for a page
  const handleStartEdit = (page: ScannedPageItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingPage(page);
    setEditRotation(page.rotation || 0);
    setEditFilter("original");
    setEditAspectRatio("free");
    setCropRect({ x: 0, y: 0, width: 1, height: 1 });
  };

  // Rotate 90 degrees clockwise
  const handleRotateCW = () => {
    setEditRotation((prev) => (prev + 90) % 360);
    setCropRect({ x: 0, y: 0, width: 1, height: 1 });
  };

  // Rotate 90 degrees counter-clockwise
  const handleRotateCCW = () => {
    setEditRotation((prev) => (prev - 90 + 360) % 360);
    setCropRect({ x: 0, y: 0, width: 1, height: 1 });
  };

  // Reset crop to full frame
  const handleResetCrop = () => {
    setCropRect({ x: 0, y: 0, width: 1, height: 1 });
    setEditAspectRatio("free");
    toast.info("Crop reset to full page");
  };

  // Reset all edits back to original image
  const handleResetAllEdits = () => {
    setEditRotation(0);
    setEditFilter("original");
    setEditAspectRatio("free");
    setCropRect({ x: 0, y: 0, width: 1, height: 1 });
    toast.info("All edits reset");
  };

  // Interactive Crop drag handle helpers
  const handlePointerDown = (handle: string, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveHandle(handle);

    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    dragStartPos.current = {
      x: clientX,
      y: clientY,
      rect: { ...cropRect },
    };
  };

  // Global mouse/touch move listener for crop handle dragging
  useEffect(() => {
    if (!activeHandle) return;

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if (!activeHandle || !cropContainerRef.current) return;

      const container = cropContainerRef.current.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

      const deltaX = (clientX - dragStartPos.current.x) / container.width;
      const deltaY = (clientY - dragStartPos.current.y) / container.height;
      const start = dragStartPos.current.rect;

      const MIN_SIZE = 0.1; // 10% min crop dimension

      let next = { ...start };

      if (activeHandle === "move") {
        next.x = Math.max(0, Math.min(1 - start.width, start.x + deltaX));
        next.y = Math.max(0, Math.min(1 - start.height, start.y + deltaY));
      } else if (activeHandle === "se") {
        next.width = Math.max(MIN_SIZE, Math.min(1 - start.x, start.width + deltaX));
        next.height = Math.max(MIN_SIZE, Math.min(1 - start.y, start.height + deltaY));
      } else if (activeHandle === "sw") {
        const newX = Math.max(0, Math.min(start.x + start.width - MIN_SIZE, start.x + deltaX));
        next.width = start.x + start.width - newX;
        next.x = newX;
        next.height = Math.max(MIN_SIZE, Math.min(1 - start.y, start.height + deltaY));
      } else if (activeHandle === "ne") {
        const newY = Math.max(0, Math.min(start.y + start.height - MIN_SIZE, start.y + deltaY));
        next.height = start.y + start.height - newY;
        next.y = newY;
        next.width = Math.max(MIN_SIZE, Math.min(1 - start.x, start.width + deltaX));
      } else if (activeHandle === "nw") {
        const newX = Math.max(0, Math.min(start.x + start.width - MIN_SIZE, start.x + deltaX));
        const newY = Math.max(0, Math.min(start.y + start.height - MIN_SIZE, start.y + deltaY));
        next.width = start.x + start.width - newX;
        next.height = start.y + start.height - newY;
        next.x = newX;
        next.y = newY;
      } else if (activeHandle === "n") {
        const newY = Math.max(0, Math.min(start.y + start.height - MIN_SIZE, start.y + deltaY));
        next.height = start.y + start.height - newY;
        next.y = newY;
      } else if (activeHandle === "s") {
        next.height = Math.max(MIN_SIZE, Math.min(1 - start.y, start.height + deltaY));
      } else if (activeHandle === "w") {
        const newX = Math.max(0, Math.min(start.x + start.width - MIN_SIZE, start.x + deltaX));
        next.width = start.x + start.width - newX;
        next.x = newX;
      } else if (activeHandle === "e") {
        next.width = Math.max(MIN_SIZE, Math.min(1 - start.x, start.width + deltaX));
      }

      setCropRect(next);
    };

    const handlePointerUp = () => {
      setActiveHandle(null);
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
  }, [activeHandle]);

  // Set preset aspect ratio
  const applyAspectRatioPreset = (preset: AspectRatioMode) => {
    setEditAspectRatio(preset);
    if (preset === "free") return;

    let targetRatio = 1;
    if (preset === "a4") targetRatio = 1 / 1.414;
    if (preset === "1:1") targetRatio = 1;
    if (preset === "4:3") targetRatio = 4 / 3;
    if (preset === "16:9") targetRatio = 16 / 9;

    let w = 0.8;
    let h = w / targetRatio;
    if (h > 0.9) {
      h = 0.9;
      w = h * targetRatio;
    }
    w = Math.min(1, Math.max(0.2, w));
    h = Math.min(1, Math.max(0.2, h));

    setCropRect({
      x: (1 - w) / 2,
      y: (1 - h) / 2,
      width: w,
      height: h,
    });
  };

  // Perform canvas-based Rotate, Crop, and Filter processing
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

      // 1. Rotation transformation
      const is90or270 = editRotation % 180 !== 0;
      const rotW = is90or270 ? sourceImage.height : sourceImage.width;
      const rotH = is90or270 ? sourceImage.width : sourceImage.height;

      const rotCanvas = document.createElement("canvas");
      rotCanvas.width = rotW;
      rotCanvas.height = rotH;
      const rotCtx = rotCanvas.getContext("2d", { willReadFrequently: true });
      if (!rotCtx) throw new Error("Could not initialize rotation canvas context");

      rotCtx.save();
      rotCtx.translate(rotW / 2, rotH / 2);
      rotCtx.rotate((editRotation * Math.PI) / 180);
      rotCtx.drawImage(sourceImage, -sourceImage.width / 2, -sourceImage.height / 2);
      rotCtx.restore();

      // 2. Crop transformation
      const cropX = Math.round(cropRect.x * rotW);
      const cropY = Math.round(cropRect.y * rotH);
      const cropW = Math.max(1, Math.round(cropRect.width * rotW));
      const cropH = Math.max(1, Math.round(cropRect.height * rotH));

      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = cropW;
      cropCanvas.height = cropH;
      const cropCtx = cropCanvas.getContext("2d", { willReadFrequently: true });
      if (!cropCtx) throw new Error("Could not initialize crop canvas context");

      cropCtx.drawImage(rotCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      // 3. Document Filter Enhancement
      if (editFilter !== "original") {
        const imgData = cropCtx.getImageData(0, 0, cropW, cropH);
        const d = imgData.data;

        for (let i = 0; i < d.length; i += 4) {
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;

          if (editFilter === "grayscale") {
            d[i] = lum;
            d[i + 1] = lum;
            d[i + 2] = lum;
          } else if (editFilter === "magic") {
            const enhance = (val: number) => {
              const n = val / 255;
              const boosted = Math.pow(n, 0.85);
              const contrasted = (boosted - 0.5) * 1.25 + 0.5;
              return Math.min(255, Math.max(0, contrasted * 255));
            };
            d[i] = enhance(r);
            d[i + 1] = enhance(g);
            d[i + 2] = enhance(b);
          } else if (editFilter === "bw") {
            const threshold = 140;
            const val = lum > threshold ? 255 : Math.max(0, lum * 0.4);
            d[i] = val;
            d[i + 1] = val;
            d[i + 2] = val;
          }
        }
        cropCtx.putImageData(imgData, 0, 0);
      }

      // Export high quality JPEG dataUrl
      const finalDataUrl = cropCanvas.toDataURL("image/jpeg", 0.95);

      // Update state
      const updatedPage: ScannedPageItem = {
        ...editingPage,
        dataUrl: finalDataUrl,
        rotation: editRotation,
      };

      setPages((prev) =>
        prev.map((p) => (p.id === editingPage.id ? updatedPage : p))
      );

      // Sync updated rotation / image to backend
      if (sessionId && editingPage.backendPageId) {
        // Patch rotation
        api.patch(`/scanner/sessions/${sessionId}/pages/${editingPage.backendPageId}`, {
          rotation: editRotation,
        }).catch((err) => console.warn("[SCANNER] Failed to patch rotation:", err));
      }

      // Also update preview modal if open
      if (selectedPreview && selectedPreview.id === editingPage.id) {
        setSelectedPreview((prev) => (prev ? { ...prev, dataUrl: finalDataUrl, rotation: editRotation } : null));
      }

      setEditingPage(null);
      toast.success("Page edits saved successfully!");
    } catch (err: any) {
      console.error("Save edits error:", err);
      toast.error(err.message || "Failed to process image edits");
    } finally {
      setIsProcessingEdit(false);
    }
  };

  // STAGE 3: Finalize Scanner Session into PDF and Proceed to Print Options
  const handleFinalizeAndProceed = async () => {
    if (pages.length === 0) {
      toast.error("Please scan or add at least one page before printing.");
      return;
    }

    setIsFinalizing(true);
    try {
      // 1. Ensure backend session exists
      let targetSid = sessionId;
      if (!targetSid) {
        targetSid = await ensureSession();
      }

      // 2. Upload any pages that are not yet uploaded
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

      // 3. Ensure pages order is synced
      if (pages.every((p) => p.backendPageId)) {
        await api.post(`/scanner/sessions/${targetSid}/reorder`, {
          order: pages.map((p) => p.backendPageId!),
        }).catch(() => {});
      }

      // 4. Finalize session (converts all scanned images to PDF & creates pending print_job)
      const finalizeRes = await api.post(`/scanner/sessions/${targetSid}/finalize`);
      const { jobId, pageCount, fileName } = finalizeRes.data;

      // 5. Store print job details in sessionStorage for the print options flow
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

      toast.success("Document compiled into PDF successfully!");

      // 6. Navigate to Print Options
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
        {/* Global font imports */}
        <style>
          {`
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');
          `}
        </style>

        {/* MIMO Global Header */}
        <MimoHeader />

        {/* Page Title & Navigation */}
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
              <h1 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-[#093765] to-blue-600 bg-clip-text text-transparent tracking-tight leading-tight">
                Document Scanner
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">
                Scan pages, crop &amp; rotate, and compile into a ready-to-print document
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
          {/* Left Column: Camera Viewport & Capture Controls */}
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

                  {/* Hidden Canvas for Frame Capture */}
                  <canvas ref={canvasRef} className="hidden" />

                  {/* Shutter Flash Animation */}
                  <div
                    className={`absolute inset-0 bg-white pointer-events-none z-30 transition-opacity duration-200 ${
                      isShutterFlashing ? "opacity-90" : "opacity-0"
                    }`}
                  />

                  {/* Document Alignment Frame Overlay with Auto-Capture Feedback */}
                  {!cameraError && !isCameraLoading && (
                    <div className="absolute inset-3 sm:inset-5 pointer-events-none flex flex-col justify-between p-2 sm:p-3 z-20">
                      {/* Top Header Badge inside Camera Box */}
                      <div className="flex justify-between items-center w-full">
                        {/* Auto/Manual Mode Pill & Status */}
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

                        {/* Live Stability Percentage Indicator when steady */}
                        {isAutoCaptureEnabled && autoCaptureStatus === "steady" && (
                          <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-emerald-400 font-mono text-[10px] sm:text-xs font-bold border border-emerald-500/40 animate-pulse">
                            <span>{Math.round(autoCaptureProgress * 100)}%</span>
                          </div>
                        )}
                      </div>

                      {/* Center Alignment Guide Box with dynamic border state */}
                      <div
                        className={`relative w-full h-[72%] sm:h-[75%] rounded-2xl transition-all duration-300 flex items-center justify-center ${
                          !isAutoCaptureEnabled
                            ? "border-2 border-dashed border-white/50"
                            : autoCaptureStatus === "steady"
                            ? "border-3 border-emerald-400 bg-emerald-500/10 shadow-[0_0_25px_rgba(52,211,153,0.5)]"
                            : autoCaptureStatus === "detected"
                            ? "border-2 border-amber-400 bg-amber-500/5 shadow-[0_0_15px_rgba(251,191,36,0.4)]"
                            : autoCaptureStatus === "cooldown"
                            ? "border-2 border-dashed border-blue-400/70"
                            : "border-2 border-dashed border-white/60"
                        }`}
                      >
                        {/* Corner Brackets */}
                        <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-white rounded-tl-lg" />
                        <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-white rounded-tr-lg" />
                        <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-white rounded-bl-lg" />
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-white rounded-br-lg" />

                        {/* Progress Bar when holding steady */}
                        {isAutoCaptureEnabled && autoCaptureProgress > 0 && autoCaptureProgress < 1 && (
                          <div className="absolute bottom-3 inset-x-6 h-1.5 bg-black/40 backdrop-blur-sm rounded-full overflow-hidden border border-white/20">
                            <div
                              className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-75 rounded-full"
                              style={{ width: `${autoCaptureProgress * 100}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Bottom Status / Counter */}
                      <div className="flex justify-between items-center text-[10px] sm:text-xs font-mono text-white/70 bg-black/40 px-2.5 py-1 rounded-lg backdrop-blur-xs w-fit">
                        <span>{pages.length} page{pages.length === 1 ? "" : "s"} scanned</span>
                      </div>
                    </div>
                  )}

                  {/* Loading State */}
                  {isCameraLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-white gap-3 p-4">
                      <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
                      <p className="text-sm font-medium text-slate-200">Initializing camera...</p>
                    </div>
                  )}

                  {/* Permission / Device Error State */}
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

                {/* Mode Toggle & Status Bar */}
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
                    {isAutoCaptureEnabled ? "Auto-detects paper" : "Manual shutter"}
                  </span>
                </div>

                {/* Shutter & Quick Actions Bar */}
                <div className="flex items-center justify-between gap-3 pt-1 px-1">
                  {/* File Import Button */}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 rounded-xl border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm h-11 cursor-pointer transition-all shadow-2xs"
                  >
                    <Upload className="w-4 h-4 mr-1.5 text-blue-600" />
                    Import Photo
                  </Button>

                  {/* Hidden File Input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {/* Capture Button (always available as manual trigger or fallback) */}
                  <Button
                    type="button"
                    disabled={!!cameraError || isCameraLoading}
                    onClick={() => handleCapture({ isAuto: false })}
                    className="flex-[1.5] rounded-xl bg-gradient-to-r from-[#093765] via-blue-700 to-blue-600 hover:from-[#072d54] hover:to-blue-700 text-white font-extrabold text-sm sm:text-base h-11 cursor-pointer transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    Capture Page
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Scanned Pages Preview List */}
          <div className="lg:col-span-5 space-y-3">
            <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-xl">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between border-b border-slate-100 space-y-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#093765] flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-extrabold text-slate-800">
                      Scanned Pages ({pages.length})
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {pages.length === 0 ? "No pages captured yet" : "Review, reorder, and edit pages"}
                    </CardDescription>
                  </div>
                </div>

                {pages.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleClearAll}
                    className="text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer h-8 px-2"
                  >
                    Clear All
                  </Button>
                )}
              </CardHeader>

              <CardContent className="p-3 sm:p-4 space-y-3">
                {pages.length === 0 ? (
                  /* Empty State */
                  <div className="py-12 px-4 text-center flex flex-col items-center justify-center space-y-3 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                    <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                      <Camera className="w-6 h-6" />
                    </div>
                    <div className="space-y-1 max-w-xs">
                      <p className="text-sm font-bold text-slate-700">No pages scanned yet</p>
                      <p className="text-xs text-slate-400">
                        Capture photos using the camera on the left or click &ldquo;Import Photo&rdquo; to add existing images.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Pages Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[400px] overflow-y-auto pr-1">
                      {pages.map((page, index) => (
                        <div
                          key={page.id}
                          className="group relative aspect-[3/4] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-2xs hover:shadow-md hover:border-blue-300 transition-all cursor-pointer flex flex-col justify-between"
                          onClick={() => setSelectedPreview(page)}
                        >
                          {/* Thumbnail Image */}
                          <img
                            src={page.dataUrl}
                            alt={`Scanned page ${index + 1}`}
                            className="w-full h-full object-cover"
                          />

                          {/* Top Badges & Actions */}
                          <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-none">
                            <div className="bg-[#093765]/90 backdrop-blur-xs text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded shadow-xs flex items-center gap-1">
                              <span>Page {index + 1}</span>
                              {page.isUploading && (
                                <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-300" />
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => handleRemovePage(page.id, e)}
                              title="Delete this page"
                              className="pointer-events-auto w-6 h-6 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center shadow-md transition-transform active:scale-90 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Reorder Buttons Overlay */}
                          <div className="absolute top-8 left-1.5 right-1.5 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            {index > 0 ? (
                              <button
                                type="button"
                                onClick={(e) => handleMovePage(index, "left", e)}
                                title="Move before"
                                className="pointer-events-auto w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center shadow-xs cursor-pointer"
                              >
                                <ArrowLeftIcon className="w-3 h-3" />
                              </button>
                            ) : <div />}
                            {index < pages.length - 1 ? (
                              <button
                                type="button"
                                onClick={(e) => handleMovePage(index, "right", e)}
                                title="Move after"
                                className="pointer-events-auto w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center shadow-xs cursor-pointer"
                              >
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            ) : <div />}
                          </div>

                          {/* Bottom Quick Edit Button */}
                          <div className="absolute bottom-1.5 inset-x-1.5 flex items-center justify-between gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => handleStartEdit(page, e)}
                              className="flex-1 bg-white/95 hover:bg-white text-[#093765] font-bold text-[11px] py-1 px-2 rounded-lg shadow-md border border-slate-200 flex items-center justify-center gap-1 transition-all cursor-pointer active:scale-95"
                            >
                              <CropIcon className="w-3 h-3 text-blue-600" />
                              <span>Edit</span>
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Add Page Quick Tile */}
                      <button
                        type="button"
                        onClick={() => {
                          if (fileInputRef.current) fileInputRef.current.click();
                        }}
                        className="aspect-[3/4] rounded-xl border-2 border-dashed border-blue-200 hover:border-blue-400 bg-blue-50/40 hover:bg-blue-50/80 transition-all flex flex-col items-center justify-center gap-1.5 text-blue-600 cursor-pointer p-2 text-center"
                      >
                        <Plus className="w-6 h-6" />
                        <span className="text-[11px] font-bold">Add Page</span>
                      </button>
                    </div>

                    {/* Finalize Button Footer */}
                    <div className="pt-2 border-t border-slate-100">
                      <Button
                        type="button"
                        onClick={handleFinalizeAndProceed}
                        disabled={isFinalizing}
                        className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm sm:text-base h-11 rounded-xl shadow-lg cursor-pointer transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                      >
                        {isFinalizing ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Compiling {pages.length} Pages into PDF...</span>
                          </>
                        ) : (
                          <>
                            <Printer className="w-5 h-5" />
                            <span>Compile &amp; Proceed to Print ({pages.length} {pages.length === 1 ? "page" : "pages"})</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Full Image Preview Modal */}
        {selectedPreview && !editingPage && (
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={() => setSelectedPreview(null)}
          >
            <div
              className="relative max-w-2xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 text-white border-b border-slate-800">
                <span className="text-sm font-bold truncate">{selectedPreview.name}</span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const p = selectedPreview;
                      setSelectedPreview(null);
                      handleStartEdit(p);
                    }}
                    className="h-7 text-xs bg-blue-600 hover:bg-blue-500 text-white border-0 cursor-pointer"
                  >
                    <CropIcon className="w-3 h-3 mr-1" />
                    Edit Page
                  </Button>
                  <button
                    onClick={() => setSelectedPreview(null)}
                    className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="p-2 overflow-auto flex items-center justify-center bg-slate-950">
                <img
                  src={selectedPreview.dataUrl}
                  alt="Full preview"
                  className="max-h-[75vh] w-auto object-contain rounded-lg"
                />
              </div>
            </div>
          </div>
        )}

        {/* STAGE 2: Image Editor Modal (Rotate, Crop, Filters) */}
        {editingPage && (
          <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col justify-between animate-in fade-in duration-200">
            {/* Editor Top Navigation Bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800 text-white">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditingPage(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-blue-400" />
                    Edit Document Page
                  </h2>
                  <p className="text-[11px] text-slate-400">{editingPage.name}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleResetAllEdits}
                  className="text-xs text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer h-8"
                >
                  <Undo className="w-3.5 h-3.5 mr-1" />
                  Reset
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveEdits}
                  disabled={isProcessingEdit}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm h-8 px-3.5 cursor-pointer shadow-md"
                >
                  {isProcessingEdit ? (
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Save Changes
                </Button>
              </div>
            </div>

            {/* Editor Center Viewport (Interactive Image & Crop Box) */}
            <div className="flex-1 relative flex items-center justify-center p-4 overflow-hidden select-none bg-slate-950">
              <div
                ref={cropContainerRef}
                className="relative max-h-[60vh] max-w-[85vw] flex items-center justify-center overflow-hidden rounded-lg shadow-2xl border border-slate-800/80"
              >
                {/* Visual Image with Dynamic Rotation & CSS Filter Preview */}
                <img
                  src={editingPage.originalDataUrl || editingPage.dataUrl}
                  alt="Editing frame"
                  style={{
                    transform: `rotate(${editRotation}deg)`,
                    transition: "transform 0.25s ease-out",
                    filter:
                      editFilter === "grayscale"
                        ? "grayscale(100%) contrast(110%)"
                        : editFilter === "magic"
                        ? "contrast(130%) brightness(105%) saturate(115%)"
                        : editFilter === "bw"
                        ? "grayscale(100%) contrast(200%) brightness(110%)"
                        : "none",
                  }}
                  className="max-h-[58vh] max-w-[82vw] object-contain block pointer-events-none"
                />

                {/* Dark Mask Overlays Outside the Crop Box */}
                <div
                  className="absolute bg-black/60 pointer-events-none transition-all"
                  style={{
                    top: 0,
                    left: 0,
                    right: 0,
                    height: `${cropRect.y * 100}%`,
                  }}
                />
                <div
                  className="absolute bg-black/60 pointer-events-none transition-all"
                  style={{
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: `${(1 - cropRect.y - cropRect.height) * 100}%`,
                  }}
                />
                <div
                  className="absolute bg-black/60 pointer-events-none transition-all"
                  style={{
                    top: `${cropRect.y * 100}%`,
                    left: 0,
                    width: `${cropRect.x * 100}%`,
                    height: `${cropRect.height * 100}%`,
                  }}
                />
                <div
                  className="absolute bg-black/60 pointer-events-none transition-all"
                  style={{
                    top: `${cropRect.y * 100}%`,
                    right: 0,
                    width: `${(1 - cropRect.x - cropRect.width) * 100}%`,
                    height: `${cropRect.height * 100}%`,
                  }}
                />

                {/* Interactive Crop Frame */}
                <div
                  className="absolute border-2 border-blue-400/90 shadow-2xl transition-all cursor-move flex items-center justify-center group"
                  style={{
                    top: `${cropRect.y * 100}%`,
                    left: `${cropRect.x * 100}%`,
                    width: `${cropRect.width * 100}%`,
                    height: `${cropRect.height * 100}%`,
                  }}
                  onMouseDown={(e) => handlePointerDown("move", e)}
                  onTouchStart={(e) => handlePointerDown("move", e)}
                >
                  {/* Rule of Thirds Grid Lines */}
                  <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
                    <div className="border-r border-b border-blue-300/30" />
                    <div className="border-r border-b border-blue-300/30" />
                    <div className="border-b border-blue-300/30" />
                    <div className="border-r border-b border-blue-300/30" />
                    <div className="border-r border-b border-blue-300/30" />
                    <div className="border-b border-blue-300/30" />
                    <div className="border-r border-b border-blue-300/30" />
                    <div className="border-r border-b border-blue-300/30" />
                    <div />
                  </div>

                  {/* Corner Resize Handles */}
                  <div
                    className="absolute -top-2.5 -left-2.5 w-6 h-6 bg-white border-2 border-blue-600 rounded-full shadow-md cursor-nwse-resize z-20 flex items-center justify-center active:scale-125 transition-transform"
                    onMouseDown={(e) => handlePointerDown("nw", e)}
                    onTouchStart={(e) => handlePointerDown("nw", e)}
                  />
                  <div
                    className="absolute -top-2.5 -right-2.5 w-6 h-6 bg-white border-2 border-blue-600 rounded-full shadow-md cursor-nesw-resize z-20 flex items-center justify-center active:scale-125 transition-transform"
                    onMouseDown={(e) => handlePointerDown("ne", e)}
                    onTouchStart={(e) => handlePointerDown("ne", e)}
                  />
                  <div
                    className="absolute -bottom-2.5 -left-2.5 w-6 h-6 bg-white border-2 border-blue-600 rounded-full shadow-md cursor-nesw-resize z-20 flex items-center justify-center active:scale-125 transition-transform"
                    onMouseDown={(e) => handlePointerDown("sw", e)}
                    onTouchStart={(e) => handlePointerDown("sw", e)}
                  />
                  <div
                    className="absolute -bottom-2.5 -right-2.5 w-6 h-6 bg-white border-2 border-blue-600 rounded-full shadow-md cursor-nwse-resize z-20 flex items-center justify-center active:scale-125 transition-transform"
                    onMouseDown={(e) => handlePointerDown("se", e)}
                    onTouchStart={(e) => handlePointerDown("se", e)}
                  />

                  {/* Edge Resize Handles */}
                  <div
                    className="absolute -top-1.5 inset-x-6 h-3 cursor-ns-resize z-10 hover:bg-blue-400/40 rounded"
                    onMouseDown={(e) => handlePointerDown("n", e)}
                    onTouchStart={(e) => handlePointerDown("n", e)}
                  />
                  <div
                    className="absolute -bottom-1.5 inset-x-6 h-3 cursor-ns-resize z-10 hover:bg-blue-400/40 rounded"
                    onMouseDown={(e) => handlePointerDown("s", e)}
                    onTouchStart={(e) => handlePointerDown("s", e)}
                  />
                  <div
                    className="absolute -left-1.5 inset-y-6 w-3 cursor-ew-resize z-10 hover:bg-blue-400/40 rounded"
                    onMouseDown={(e) => handlePointerDown("w", e)}
                    onTouchStart={(e) => handlePointerDown("w", e)}
                  />
                  <div
                    className="absolute -right-1.5 inset-y-6 w-3 cursor-ew-resize z-10 hover:bg-blue-400/40 rounded"
                    onMouseDown={(e) => handlePointerDown("e", e)}
                    onTouchStart={(e) => handlePointerDown("e", e)}
                  />
                </div>
              </div>
            </div>

            {/* Editor Bottom Toolbar: Rotate, Crop Aspect Ratio, Enhance Filters */}
            <div className="bg-slate-900 border-t border-slate-800 p-3 sm:p-4 space-y-3">
              {/* Row 1: Rotation Actions & Crop Reset */}
              <div className="flex flex-wrap items-center justify-between gap-2 max-w-3xl mx-auto">
                {/* Rotate Buttons */}
                <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleRotateCCW}
                    className="h-8 px-2.5 text-xs text-slate-200 hover:text-white hover:bg-slate-700 rounded-lg cursor-pointer"
                    title="Rotate 90° counter-clockwise"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1 text-blue-400" />
                    Rotate Left
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleRotateCW}
                    className="h-8 px-2.5 text-xs text-slate-200 hover:text-white hover:bg-slate-700 rounded-lg cursor-pointer"
                    title="Rotate 90° clockwise"
                  >
                    <RotateCw className="w-3.5 h-3.5 mr-1 text-blue-400" />
                    Rotate 90°
                  </Button>
                  <div className="text-[10px] font-mono text-slate-400 px-2 py-0.5 bg-slate-900 rounded">
                    {editRotation}°
                  </div>
                </div>

                {/* Aspect Ratio Presets */}
                <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => applyAspectRatioPreset("free")}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      editAspectRatio === "free"
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    Free
                  </button>
                  <button
                    type="button"
                    onClick={() => applyAspectRatioPreset("a4")}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      editAspectRatio === "a4"
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    A4 Doc
                  </button>
                  <button
                    type="button"
                    onClick={() => applyAspectRatioPreset("1:1")}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      editAspectRatio === "1:1"
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    1:1
                  </button>
                  <button
                    type="button"
                    onClick={() => applyAspectRatioPreset("4:3")}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      editAspectRatio === "4:3"
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    4:3
                  </button>
                </div>

                {/* Full Frame Reset Button */}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleResetCrop}
                  className="h-8 text-xs bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700 cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5 mr-1 text-slate-400" />
                  Full Image
                </Button>
              </div>

              {/* Row 2: Document Filter Presets */}
              <div className="flex items-center justify-center gap-2 max-w-3xl mx-auto pt-1">
                <span className="text-[11px] font-semibold text-slate-400 mr-1 hidden sm:inline">
                  Filter Mode:
                </span>
                <button
                  type="button"
                  onClick={() => setEditFilter("original")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    editFilter === "original"
                      ? "bg-blue-600/20 border-blue-500 text-blue-300 shadow-xs"
                      : "bg-slate-800 border-slate-700/60 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  Original
                </button>
                <button
                  type="button"
                  onClick={() => setEditFilter("magic")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    editFilter === "magic"
                      ? "bg-blue-600/20 border-blue-500 text-blue-300 shadow-xs"
                      : "bg-slate-800 border-slate-700/60 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Magic Color
                </button>
                <button
                  type="button"
                  onClick={() => setEditFilter("bw")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    editFilter === "bw"
                      ? "bg-blue-600/20 border-blue-500 text-blue-300 shadow-xs"
                      : "bg-slate-800 border-slate-700/60 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Contrast className="w-3.5 h-3.5" />
                  B&amp;W Doc
                </button>
                <button
                  type="button"
                  onClick={() => setEditFilter("grayscale")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    editFilter === "grayscale"
                      ? "bg-blue-600/20 border-blue-500 text-blue-300 shadow-xs"
                      : "bg-slate-800 border-slate-700/60 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  Grayscale
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DocumentScanner;
