/**
 * MIMO Document Scanner - Lightweight Canvas-Based Auto Capture Engine
 *
 * Performs 100% on-device client-side document detection, contrast analysis,
 * and temporal motion stability measurement without any external computer vision dependencies.
 */

export type AutoCaptureStatus =
  | "searching"   // Scanning for document inside alignment guide
  | "detected"    // Document detected in frame, waiting for stability
  | "steady"      // Document held steady, countdown progressing
  | "capturing"   // Triggering automatic shutter
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
  sampleFps?: number;           // Target sampling FPS (default: 10 FPS)
  stabilityDurationMs?: number; // Required steady time in ms (default: 800ms)
  motionThreshold?: number;     // Maximum pixel delta to consider steady (default: 4.5)
  minLuminance?: number;        // Minimum acceptable brightness (default: 38)
  maxLuminance?: number;        // Maximum acceptable brightness (default: 238)
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
  private lastProcessTime: number = 0;
  private isProcessing: boolean = false;

  constructor(config?: AutoCaptureConfig) {
    this.config = {
      sampleFps: config?.sampleFps ?? 10,
      stabilityDurationMs: config?.stabilityDurationMs ?? 800,
      motionThreshold: config?.motionThreshold ?? 4.5,
      minLuminance: config?.minLuminance ?? 38,
      maxLuminance: config?.maxLuminance ?? 238,
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
   * Reset the stability counter and historical samples (e.g. after manual capture or page shift)
   */
  public resetStability() {
    this.steadyStartTime = null;
    this.prevSample = null;
  }

  /**
   * Notify the engine that a capture occurred to initiate cooldown period
   */
  public triggerCooldown() {
    this.lastCaptureTime = Date.now();
    this.resetStability();
  }

  /**
   * Analyze the current video frame against the alignment guide
   */
  public analyzeFrame(video: HTMLVideoElement, guideNormalizedRect = { x: 0.1, y: 0.08, width: 0.8, height: 0.84 }): AutoCaptureAnalysis {
    const now = Date.now();

    // Check cooldown
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
        message: `Page captured! Ready in ${remaining}s...`,
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

    // 1. Calculate Guide Bounding Box in downsampled pixels
    const gx = Math.floor(guideNormalizedRect.x * sw);
    const gy = Math.floor(guideNormalizedRect.y * sh);
    const gw = Math.floor(guideNormalizedRect.width * sw);
    const gh = Math.floor(guideNormalizedRect.height * sh);

    // 2. Sample Grid Luminance & Motion Difference (32x24 grid = 768 samples)
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
          outerSampleCount++;
        }
      }
    }

    const meanLuminance = guideSampleCount > 0 ? totalGuideLuminance / guideSampleCount : 128;
    const meanOuterLuminance = outerSampleCount > 0 ? outerLuminance / outerSampleCount : 128;

    // 3. Motion Detection (Sum of Absolute Differences against previous sample)
    let motionScore = 0;
    if (this.prevSample) {
      let totalDiff = 0;
      for (let i = 0; i < currentSample.length; i++) {
        totalDiff += Math.abs(currentSample[i] - this.prevSample[i]);
      }
      motionScore = totalDiff / currentSample.length;
    }
    this.prevSample = currentSample;

    // 4. Edge / Contrast Analysis across guide borders
    // Sample gradient step across inner guide perimeter vs outer margin
    const edgeContrast = Math.abs(meanLuminance - meanOuterLuminance);

    // Check exposure validity
    const isExposureValid = meanLuminance >= this.config.minLuminance && meanLuminance <= this.config.maxLuminance;

    // Quadrant content check (ensures document is centered across all 4 corners)
    const q1Lum = this.sampleRegionLuminance(data, sw, gx + 10, gy + 10, Math.floor(gw / 3), Math.floor(gh / 3));
    const q2Lum = this.sampleRegionLuminance(data, sw, gx + gw - Math.floor(gw / 3) - 10, gy + 10, Math.floor(gw / 3), Math.floor(gh / 3));
    const q3Lum = this.sampleRegionLuminance(data, sw, gx + 10, gy + gh - Math.floor(gh / 3) - 10, Math.floor(gw / 3), Math.floor(gh / 3));
    const q4Lum = this.sampleRegionLuminance(data, sw, gx + gw - Math.floor(gw / 3) - 10, gy + gh - Math.floor(gh / 3) - 10, Math.floor(gw / 3), Math.floor(gh / 3));

    const maxQDiff = Math.max(
      Math.abs(q1Lum - q2Lum),
      Math.abs(q2Lum - q3Lum),
      Math.abs(q3Lum - q4Lum),
      Math.abs(q4Lum - q1Lum)
    );

    // Document is considered present if exposure is valid and contrast/uniformity conditions are met
    const isDocumentDetected = isExposureValid && (edgeContrast >= this.config.minEdgeContrast || maxQDiff < 75);
    const isSteady = isDocumentDetected && motionScore < this.config.motionThreshold;

    // 5. Evaluate Stability Progression
    let stabilityProgress = 0;
    let status: AutoCaptureStatus = "searching";
    let message = "Align document inside frame";

    if (!isExposureValid) {
      this.steadyStartTime = null;
      status = "searching";
      message = meanLuminance < this.config.minLuminance ? "Too dark - add lighting" : "Too bright / glare";
    } else if (!isDocumentDetected) {
      this.steadyStartTime = null;
      status = "searching";
      message = "Align document inside frame";
    } else if (!isSteady) {
      // Document is in frame but camera/document is moving
      this.steadyStartTime = null;
      status = "detected";
      message = "Hold steady...";
    } else {
      // Document is in frame AND steady
      if (this.steadyStartTime === null) {
        this.steadyStartTime = now;
      }

      const elapsedSteady = now - this.steadyStartTime;
      stabilityProgress = Math.min(1.0, elapsedSteady / this.config.stabilityDurationMs);

      if (stabilityProgress >= 1.0) {
        status = "capturing";
        message = "Capturing document...";
      } else {
        status = "steady";
        message = "Hold steady...";
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

  private sampleRegionLuminance(data: Uint8ClampedArray, sw: number, rx: number, ry: number, rw: number, rh: number): number {
    let sum = 0;
    let count = 0;
    const step = 4;
    for (let y = Math.max(0, ry); y < Math.min(240, ry + rh); y += step) {
      for (let x = Math.max(0, rx); x < Math.min(320, rx + rw); x += step) {
        const idx = (y * sw + x) * 4;
        sum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        count++;
      }
    }
    return count > 0 ? sum / count : 128;
  }
}
