/**
 * MIMO Document Scanner - Advanced Auto Capture Engine
 *
 * Combines Computer Vision quadrilateral document corner detection with
 * temporal motion stability measurement, exposure analysis, and strict
 * single-capture state locking to prevent duplicate page scans.
 */

import { DocumentCorners, DocumentDetectionResult } from "./scanner-cv-engine";

export type AutoCaptureStatus =
  | "searching"   // Scanning for document inside alignment guide
  | "detected"    // Document detected in frame, waiting for stability
  | "steady"      // Document held steady, countdown progressing
  | "capturing"   // Triggering automatic shutter (single event)
  | "locked"      // Capture locked: page captured, waiting for user to add next page
  | "cooldown";   // Brief cooldown after successful capture

export interface AutoCaptureAnalysis {
  status: AutoCaptureStatus;
  isDocumentDetected: boolean;
  isSteady: boolean;
  motionScore: number;
  meanLuminance: number;
  edgeContrast: number;
  stabilityProgress: number; // 0..1 (progress towards auto-trigger)
  message: string;
}

export interface AutoCaptureConfig {
  sampleFps?: number;           // Target sampling FPS (default: 12 FPS)
  stabilityDurationMs?: number; // Required steady time in ms (default: 750ms)
  motionThreshold?: number;     // Maximum pixel delta to consider steady (default: 5.0)
  minLuminance?: number;        // Minimum acceptable brightness (default: 35)
  maxLuminance?: number;        // Maximum acceptable brightness (default: 242)
  minEdgeContrast?: number;     // Minimum edge/contrast variance (default: 8.0)
  cooldownMs?: number;          // Cooldown after capture before next scan (default: 1800ms)
}

export class ScannerAutoCaptureEngine {
  private config: Required<AutoCaptureConfig>;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D | null;
  private prevSample: Uint8Array | null = null;
  private steadyStartTime: number | null = null;
  private lastCaptureTime: number = 0;

  // Single-capture lock & document signature state
  private isLocked: boolean = false;
  private isArmed: boolean = true;
  private lastCapturedCorners: DocumentCorners | null = null;

  constructor(config?: AutoCaptureConfig) {
    this.config = {
      sampleFps: config?.sampleFps ?? 12,
      stabilityDurationMs: config?.stabilityDurationMs ?? 750,
      motionThreshold: config?.motionThreshold ?? 5.0,
      minLuminance: config?.minLuminance ?? 35,
      maxLuminance: config?.maxLuminance ?? 242,
      minEdgeContrast: config?.minEdgeContrast ?? 8.0,
      cooldownMs: config?.cooldownMs ?? 1800,
    };

    // Offscreen canvas for downsampled lightweight frame analysis (320x240)
    this.offscreenCanvas = document.createElement("canvas");
    this.offscreenCanvas.width = 320;
    this.offscreenCanvas.height = 240;
    this.offscreenCtx = this.offscreenCanvas.getContext("2d", { willReadFrequently: true });
  }

  /**
   * Reset the stability counter and historical samples
   */
  public resetStability() {
    this.steadyStartTime = null;
    this.prevSample = null;
  }

  /**
   * Lock auto-capture after a successful document capture to prevent duplicate scans
   */
  public lockCapture(corners?: DocumentCorners) {
    this.isLocked = true;
    this.isArmed = false;
    this.lastCapturedCorners = corners || null;
    this.lastCaptureTime = Date.now();
    this.resetStability();
  }

  /**
   * Re-arm the scanner for the next page (e.g., when user taps "Add Page" or "Retake")
   */
  public reArm() {
    this.isLocked = false;
    this.isArmed = true;
    this.lastCapturedCorners = null;
    this.lastCaptureTime = 0;
    this.resetStability();
  }

  /**
   * Legacy cooldown trigger
   */
  public triggerCooldown() {
    this.lastCaptureTime = Date.now();
    this.resetStability();
  }

  /**
   * Check if candidate corners belong to the same physical document as the previous capture
   */
  public isSameDocumentAsLastCapture(corners: DocumentCorners): boolean {
    if (!this.lastCapturedCorners) return false;
    const l = this.lastCapturedCorners;
    const c = corners;

    // Centroid distance
    const lcx = (l.topLeft.x + l.topRight.x + l.bottomRight.x + l.bottomLeft.x) / 4;
    const lcy = (l.topLeft.y + l.topRight.y + l.bottomRight.y + l.bottomLeft.y) / 4;
    const ccx = (c.topLeft.x + c.topRight.x + c.bottomRight.x + c.bottomLeft.x) / 4;
    const ccy = (c.topLeft.y + c.topRight.y + c.bottomRight.y + c.bottomLeft.y) / 4;
    const dist = Math.hypot(lcx - ccx, lcy - ccy);

    // Max corner displacement
    const maxCornerDelta = Math.max(
      Math.hypot(l.topLeft.x - c.topLeft.x, l.topLeft.y - c.topLeft.y),
      Math.hypot(l.topRight.x - c.topRight.x, l.topRight.y - c.topRight.y),
      Math.hypot(l.bottomRight.x - c.bottomRight.x, l.bottomRight.y - c.bottomRight.y),
      Math.hypot(l.bottomLeft.x - c.bottomLeft.x, l.bottomLeft.y - c.bottomLeft.y)
    );

    // If centroid shifted less than 12% and corners shifted less than 20%, it is the exact same document
    return dist < 0.12 && maxCornerDelta < 0.20;
  }

  /**
   * Analyze the current video frame against detected document corners or fallback guide
   */
  public analyzeFrame(
    video: HTMLVideoElement,
    cvResult?: DocumentDetectionResult,
    guideNormalizedRect = { x: 0.1, y: 0.08, width: 0.8, height: 0.84 }
  ): AutoCaptureAnalysis {
    const now = Date.now();

    // 1. If currently locked, prevent any auto-capture from triggering
    if (this.isLocked || !this.isArmed) {
      const isSame = cvResult?.hasDocument && this.isSameDocumentAsLastCapture(cvResult.corners);
      return {
        status: "locked",
        isDocumentDetected: !!cvResult?.hasDocument,
        isSteady: false,
        motionScore: 0,
        meanLuminance: 128,
        edgeContrast: 0,
        stabilityProgress: 0,
        message: isSame
          ? "Page captured! Tap + to scan next page"
          : "Scanner ready — tap + to scan next page",
      };
    }

    // 2. Check cooldown
    if (now - this.lastCaptureTime < this.config.cooldownMs) {
      const remaining = Math.ceil((this.config.cooldownMs - (now - this.lastCaptureTime)) / 1000);
      return {
        status: "cooldown",
        isDocumentDetected: false,
        isSteady: false,
        motionScore: 0,
        meanLuminance: 128,
        edgeContrast: 0,
        stabilityProgress: 0,
        message: `Next scan in ${remaining}s...`,
      };
    }

    if (!video || video.readyState < 2 || !this.offscreenCtx) {
      return {
        status: "searching",
        isDocumentDetected: false,
        isSteady: false,
        motionScore: 0,
        meanLuminance: 0,
        edgeContrast: 0,
        stabilityProgress: 0,
        message: "Align document inside frame",
      };
    }

    const sw = this.offscreenCanvas.width;
    const sh = this.offscreenCanvas.height;

    // Draw downsampled video frame onto offscreen analysis canvas
    this.offscreenCtx.drawImage(video, 0, 0, sw, sh);
    const imgData = this.offscreenCtx.getImageData(0, 0, sw, sh);
    const data = imgData.data;

    // Calculate Guide Bounding Box in downsampled pixels
    const gx = Math.floor(guideNormalizedRect.x * sw);
    const gy = Math.floor(guideNormalizedRect.y * sh);
    const gw = Math.floor(guideNormalizedRect.width * sw);
    const gh = Math.floor(guideNormalizedRect.height * sh);

    // Sample Grid Luminance & Motion Difference (32x24 grid = 768 samples)
    const gridCols = 32;
    const gridRows = 24;
    const currentSample = new Uint8Array(gridCols * gridRows);
    let sampleIdx = 0;
    let totalGuideLuminance = 0;
    let guideSampleCount = 0;

    let outerLuminance = 0;
    let outerSampleCount = 0;

    for (let r = 0; r < gridRows; r++) {
      const py = Math.floor((r / (gridRows - 1)) * (sh - 1));
      for (let c = 0; c < gridCols; c++) {
        const px = Math.floor((c / (gridCols - 1)) * (sw - 1));
        const pIdx = (py * sw + px) * 4;
        const lum = Math.round(0.299 * data[pIdx] + 0.587 * data[pIdx + 1] + 0.114 * data[pIdx + 2]);
        currentSample[sampleIdx++] = lum;

        const isInsideGuide = px >= gx && px <= gx + gw && py >= gy && py <= gy + gh;
        if (isInsideGuide) {
          totalGuideLuminance += lum;
          guideSampleCount++;
        } else {
          outerLuminance += lum;
        }
      }
    }

    const meanLuminance = guideSampleCount > 0 ? totalGuideLuminance / guideSampleCount : 128;
    const meanOuterLuminance = outerSampleCount > 0 ? outerLuminance / outerSampleCount : 128;

    // Motion Detection (Sum of Absolute Differences against previous sample)
    let motionScore = 0;
    if (this.prevSample) {
      let totalDiff = 0;
      for (let i = 0; i < currentSample.length; i++) {
        totalDiff += Math.abs(currentSample[i] - this.prevSample[i]);
      }
      motionScore = totalDiff / currentSample.length;
    }
    this.prevSample = currentSample;

    // Edge / Contrast Analysis
    const edgeContrast = Math.abs(meanLuminance - meanOuterLuminance);
    const isExposureValid = meanLuminance >= this.config.minLuminance && meanLuminance <= this.config.maxLuminance;

    // Determine document detection (either from CV or luminance edge heuristic)
    const isCVDetected = !!(cvResult && cvResult.hasDocument && !cvResult.isFallback && cvResult.areaPercent >= 0.08 && cvResult.areaPercent <= 0.98);
    const isHeuristicDetected = isExposureValid && edgeContrast >= this.config.minEdgeContrast;
    const isDocumentDetected = isCVDetected || isHeuristicDetected;

    const isSteady = isDocumentDetected && motionScore < this.config.motionThreshold;

    // Evaluate Stability Progression
    let stabilityProgress = 0;
    let status: AutoCaptureStatus = "searching";
    let message = isCVDetected ? "Document detected - hold steady" : "Align document inside frame";

    if (!isExposureValid) {
      this.steadyStartTime = null;
      status = "searching";
      message = meanLuminance < this.config.minLuminance ? "Too dark - add lighting" : "Too bright / glare";
    } else if (!isDocumentDetected) {
      this.steadyStartTime = null;
      status = "searching";
      message = "Align document inside frame";
    } else if (!isSteady) {
      this.steadyStartTime = null;
      status = "detected";
      message = isCVDetected ? "Paper detected! Hold steady..." : "Hold camera steady...";
    } else {
      if (this.steadyStartTime === null) {
        this.steadyStartTime = now;
      }

      const elapsedSteady = now - this.steadyStartTime;
      stabilityProgress = Math.min(1.0, elapsedSteady / this.config.stabilityDurationMs);

      if (stabilityProgress >= 1.0) {
        // Trigger single capture event and lock immediate repetition
        status = "capturing";
        message = "Capturing document...";
        this.isLocked = true;
        this.steadyStartTime = null;
      } else {
        status = "steady";
        message = isCVDetected ? "Perfect! Holding steady..." : "Hold steady...";
      }
    }

    return {
      status,
      isDocumentDetected,
      isSteady,
      motionScore,
      meanLuminance,
      edgeContrast,
      stabilityProgress,
      message,
    };
  }
}
