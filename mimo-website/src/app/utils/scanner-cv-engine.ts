/**
 * MIMO Document Scanner - OpenCV.js WebAssembly & Computer Vision Engine
 *
 * Provides:
 * 1. On-demand lazy-loading of OpenCV.js WebAssembly.
 * 2. Real-time multi-strategy document boundary and 4-corner detection.
 * 3. 4-point quadrilateral homography & perspective warping to standard A4 ratio.
 * 4. Document enhancement algorithms (Original, Magic Enhance, High-Contrast B&W, Grayscale).
 * 5. Built-in analytical 3x3 projective homography & adaptive threshold fallback engine.
 *
 * Candidate SELECTION (which quad is "the document") is not decided here. Every strategy below only
 * proposes quadrilaterals; scanner-document-scorer.ts scores and picks the winner. This split is what stops
 * a face/body/table silhouette — often the single largest convex quad in frame — from being picked just
 * because it is the biggest.
 */
import { pickBestCandidate, scoreCandidate, type CandidateInput, type CandidateScoreBreakdown } from "./scanner-document-scorer.ts";

export interface Point2D {
  x: number; // 0..1 normalized or absolute pixels
  y: number;
}

export interface DocumentCorners {
  topLeft: Point2D;
  topRight: Point2D;
  bottomRight: Point2D;
  bottomLeft: Point2D;
}

export interface DocumentDetectionResult {
  hasDocument: boolean;
  corners: DocumentCorners; // Normalized 0..1
  areaPercent: number; // 0..1
  aspectRatio: number;
  confidence: number; // 0..1 — the winning candidate's composite score from scanner-document-scorer.ts
  isFallback: boolean;
  // Present only when options.debug is true: every candidate this frame produced, worst to best, for the
  // on-screen debug overlay (document-scanner.tsx). Never populated in normal (non-debug) operation.
  debugCandidates?: Array<CandidateScoreBreakdown & { areaPercent: number; isExtremalFallback?: boolean }>;
}

export type EnhancementMode = "original" | "enhanced" | "bw" | "grayscale";

export interface DetectionOptions {
  minAreaPercent?: number; // Minimum area of frame (default: 0.10)
  maxAreaPercent?: number; // Maximum area of frame (default: 0.85)
  downscaleWidth?: number; // Width for analysis canvas (default: 480)
  downscaleHeight?: number; // Height for analysis canvas
  smoothingFactor?: number; // Temporal corner smoothing 0..1 (default: 0.45)
  previousQuad?: DocumentCorners | null; // last accepted quad, fed to the scorer for temporal continuity
  debug?: boolean; // when true, populates DocumentDetectionResult.debugCandidates
}

export interface WarpOptions {
  targetWidth?: number; // Output width in pixels (default: 1240 for A4 150 DPI)
  targetHeight?: number; // Output height in pixels (default: 1754 for A4 150 DPI)
  aspectRatio?: "a4" | "free" | "1:1" | "4:3" | "16:9";
  enhancement?: EnhancementMode;
}

// OpenCV.js 4.9.0 (Apache-2.0) is served from the site itself (public/vendor/opencv), so detection never
// depends on a third-party CDN. The docs.opencv.org 4.11.0 build the scanner used to load returns 404.
const OPENCV_SRC = "/vendor/opencv/opencv-4.9.0.js";
// The file is ~10 MB; give slow phone connections time before reporting detection as unavailable.
const OPENCV_LOAD_TIMEOUT_MS = 60000;

export type CvLoadStatus = "loading" | "ready" | "unavailable";

// Global OpenCV Loader Singleton
let openCvPromise: Promise<boolean> | null = null;
let isOpenCvReady = false;
let cvLoadStatus: CvLoadStatus = "loading";

export function getCvLoadStatus(): CvLoadStatus {
  return cvLoadStatus;
}

/**
 * Check if OpenCV is loaded and available
 */
export function isCVReady(): boolean {
  return isOpenCvReady && typeof (window as any).cv !== "undefined" && typeof (window as any).cv.Mat === "function";
}

/**
 * Lazy-load OpenCV.js (bundled with the site). Resolves true once `window.cv` is usable, false when it cannot
 * be loaded — callers must then report detection as unavailable rather than invent corners.
 * (It never resolves with `cv` itself: the Emscripten runtime object is a thenable, so a promise would try to
 * adopt it and never settle.)
 */
export function loadOpenCV(): Promise<boolean> {
  if (openCvPromise) return openCvPromise;

  if (isCVReady()) {
    isOpenCvReady = true;
    cvLoadStatus = "ready";
    return Promise.resolve(true);
  }

  cvLoadStatus = "loading";
  openCvPromise = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      isOpenCvReady = ok;
      cvLoadStatus = ok ? "ready" : "unavailable";
      if (ok) console.log("[CV-ENGINE] OpenCV.js ready");
      else openCvPromise = null; // allow a later retry
      resolve(ok);
    };

    const timeout = setTimeout(() => {
      console.warn("[CV-ENGINE] OpenCV.js did not initialise in time; document detection unavailable.");
      finish(false);
    }, OPENCV_LOAD_TIMEOUT_MS);

    // window.cv becomes usable (cv.Mat defined) once the WebAssembly runtime has initialised. Poll for it rather
    // than awaiting window.cv, which is a self-referencing thenable.
    const checkReady = () => {
      if (settled) return;
      const w = window as any;
      if (w.cv && typeof w.cv.Mat === "function") {
        finish(true);
      } else {
        setTimeout(checkReady, 100);
      }
    };

    (window as any).Module = {
      onRuntimeInitialized() {
        checkReady();
      },
    };

    const existingScript = document.getElementById("opencv-wasm-script") as HTMLScriptElement | null;
    const script = existingScript || document.createElement("script");
    script.id = "opencv-wasm-script";
    script.async = true;
    script.type = "text/javascript";
    script.src = OPENCV_SRC;
    script.onload = () => checkReady();
    script.onerror = (err) => {
      console.warn("[CV-ENGINE] Failed to load bundled OpenCV.js; document detection unavailable.", err);
      script.remove();
      finish(false);
    };

    if (!existingScript) {
      document.body.appendChild(script);
    } else {
      checkReady();
    }
  });

  return openCvPromise;
}

/** The whole frame — used when no paper edge was found, so nothing is cropped on a guess. */
export function getFullFrameCorners(): DocumentCorners {
  return {
    topLeft: { x: 0, y: 0 },
    topRight: { x: 1, y: 0 },
    bottomRight: { x: 1, y: 1 },
    bottomLeft: { x: 0, y: 1 },
  };
}

/**
 * Default fallback document corners (centered A4 aspect ratio 0.707)
 */
export function getDefaultCorners(): DocumentCorners {
  return {
    topLeft: { x: 0.12, y: 0.08 },
    topRight: { x: 0.88, y: 0.08 },
    bottomRight: { x: 0.88, y: 0.92 },
    bottomLeft: { x: 0.12, y: 0.92 },
  };
}

/**
 * Order 4 arbitrary 2D points into standard clockwise order:
 * [Top-Left, Top-Right, Bottom-Right, Bottom-Left]
 *
 * Uses centroid polar sorting and sum/distance extrema projection
 * to reliably support arbitrary document orientations and tilts.
 */
export function orderCornerPoints(pts: Point2D[]): DocumentCorners {
  if (!pts || pts.length !== 4) {
    return getDefaultCorners();
  }

  // 1. Calculate centroid
  const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
  const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;

  // 2. Sort points in clockwise order around the centroid
  // (In screen coordinates with Y down, Math.atan2 yields clockwise ordering)
  const clockwise = [...pts].sort((a, b) => {
    const angleA = Math.atan2(a.y - cy, a.x - cx);
    const angleB = Math.atan2(b.y - cy, b.x - cx);
    return angleA - angleB;
  });

  // 3. Find the Top-Left corner: the point with minimum (x + y)
  let tlIndex = 0;
  let minSum = Infinity;
  for (let i = 0; i < 4; i++) {
    const sum = clockwise[i].x + clockwise[i].y;
    if (sum < minSum) {
      minSum = sum;
      tlIndex = i;
    }
  }

  // 4. Assign in clockwise order starting from Top-Left:
  // tlIndex -> Top-Left
  // (tlIndex + 1) % 4 -> Top-Right
  // (tlIndex + 2) % 4 -> Bottom-Right
  // (tlIndex + 3) % 4 -> Bottom-Left
  const tl = clockwise[tlIndex];
  const tr = clockwise[(tlIndex + 1) % 4];
  const br = clockwise[(tlIndex + 2) % 4];
  const bl = clockwise[(tlIndex + 3) % 4];

  return {
    topLeft: { x: Math.max(0, Math.min(1, tl.x)), y: Math.max(0, Math.min(1, tl.y)) },
    topRight: { x: Math.max(0, Math.min(1, tr.x)), y: Math.max(0, Math.min(1, tr.y)) },
    bottomRight: { x: Math.max(0, Math.min(1, br.x)), y: Math.max(0, Math.min(1, br.y)) },
    bottomLeft: { x: Math.max(0, Math.min(1, bl.x)), y: Math.max(0, Math.min(1, bl.y)) },
  };
}

/** Move each corner `fraction` of the way towards the quad's centroid. */
function insetCorners(c: DocumentCorners, fraction: number): DocumentCorners {
  const cx = (c.topLeft.x + c.topRight.x + c.bottomRight.x + c.bottomLeft.x) / 4;
  const cy = (c.topLeft.y + c.topRight.y + c.bottomRight.y + c.bottomLeft.y) / 4;
  const move = (p: Point2D): Point2D => ({ x: p.x + (cx - p.x) * fraction, y: p.y + (cy - p.y) * fraction });
  return { topLeft: move(c.topLeft), topRight: move(c.topRight), bottomRight: move(c.bottomRight), bottomLeft: move(c.bottomLeft) };
}

/**
 * Temporal Exponential Moving Average (EMA) smoothing for corners
 */
export function smoothCorners(
  current: DocumentCorners,
  previous: DocumentCorners | null,
  alpha = 0.45
): DocumentCorners {
  if (!previous) return current;

  // Compute maximum point jump distance
  const maxDistance = Math.max(
    Math.hypot(current.topLeft.x - previous.topLeft.x, current.topLeft.y - previous.topLeft.y),
    Math.hypot(current.topRight.x - previous.topRight.x, current.topRight.y - previous.topRight.y),
    Math.hypot(current.bottomRight.x - previous.bottomRight.x, current.bottomRight.y - previous.bottomRight.y),
    Math.hypot(current.bottomLeft.x - previous.bottomLeft.x, current.bottomLeft.y - previous.bottomLeft.y)
  );

  // If user made a sudden large movement, snap immediately instead of lagging
  if (maxDistance > 0.35) {
    return current;
  }

  const smooth = (curr: Point2D, prev: Point2D): Point2D => ({
    x: alpha * curr.x + (1 - alpha) * prev.x,
    y: alpha * curr.y + (1 - alpha) * prev.y,
  });

  return {
    topLeft: smooth(current.topLeft, previous.topLeft),
    topRight: smooth(current.topRight, previous.topRight),
    bottomRight: smooth(current.bottomRight, previous.bottomRight),
    bottomLeft: smooth(current.bottomLeft, previous.bottomLeft),
  };
}

// Offscreen analysis canvas cache
let analysisCanvas: HTMLCanvasElement | null = null;
let isDetecting = false;

function quadAspectRatio(c: DocumentCorners): number {
  const topW = Math.hypot(c.topRight.x - c.topLeft.x, c.topRight.y - c.topLeft.y);
  const botW = Math.hypot(c.bottomRight.x - c.bottomLeft.x, c.bottomRight.y - c.bottomLeft.y);
  const leftH = Math.hypot(c.bottomLeft.x - c.topLeft.x, c.bottomLeft.y - c.topLeft.y);
  const rightH = Math.hypot(c.bottomRight.x - c.topRight.x, c.bottomRight.y - c.topRight.y);
  return (topW + botW) / 2 / (((leftH + rightH) / 2) || 1e-4);
}

/**
 * Helper: Collect every document-LIKE quadrilateral candidate from a binary edge/threshold image.
 *
 * Deliberately does not pick a winner. The old version ranked candidates by hull area alone ("biggest wins"),
 * which is exactly what let a face/body/table silhouette be chosen over the actual paper — a person's
 * head+shoulders outline against a wall is very often the single largest convex quad in frame. This function
 * only proposes candidates (with a coarse aspect-ratio sanity filter so absurd slivers never reach the
 * scorer); scanner-document-scorer.ts does the real ranking across every strategy's output combined.
 */
function findQuadCandidatesFromBinary(
  cv: any,
  binaryMat: any,
  sw: number,
  sh: number,
  minArea: number,
  maxArea: number
): CandidateInput[] {
  let contours: any = null;
  let hierarchy: any = null;
  let hull: any = null;
  let approx: any = null;
  const candidates: CandidateInput[] = [];

  try {
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(binaryMat, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    hull = new cv.Mat();
    approx = new cv.Mat();

    const totalFrameArea = sw * sh;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area < minArea || area > maxArea) continue;

      // Calculate convex hull to eliminate hand/finger notches and ragged edges
      cv.convexHull(contour, hull);
      const hullArea = cv.contourArea(hull);
      const perimeter = cv.arcLength(hull, true);
      const areaPercent = hullArea / totalFrameArea;

      // Multi-epsilon polygon approximation for robust 4-vertex discovery
      const epsilons = [0.015, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.10];
      let foundQuad = false;

      for (const eps of epsilons) {
        cv.approxPolyDP(hull, approx, eps * perimeter, true);

        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          const points: Point2D[] = [];
          for (let j = 0; j < 4; j++) {
            points.push({ x: approx.data32S[j * 2] / sw, y: approx.data32S[j * 2 + 1] / sh });
          }

          const ordered = orderCornerPoints(points);
          const ratio = quadAspectRatio(ordered);

          // Coarse plausibility gate only (portrait & landscape A4, receipts, ID cards, slight distortion).
          // The scorer does the real ranking afterwards; this just keeps absurd slivers out of the pool.
          if (ratio >= 0.35 && ratio <= 2.8) {
            candidates.push({ corners: ordered, areaPercent });
            foundQuad = true;
            break;
          }
        }
      }

      // If exact 4-point approximation was not reached but the convex hull has 5 to 10 vertices, fall back
      // to the 4 extremal points. Less reliable than a clean approxPolyDP quad, so it is tagged for the
      // scorer's small extremal-fallback penalty.
      if (!foundQuad && approx.rows >= 5 && approx.rows <= 10) {
        const hullPoints: Point2D[] = [];
        for (let j = 0; j < hull.rows; j++) {
          hullPoints.push({ x: hull.data32S[j * 2] / sw, y: hull.data32S[j * 2 + 1] / sh });
        }

        if (hullPoints.length >= 4) {
          let minSumPt = hullPoints[0], maxSumPt = hullPoints[0];
          let minDiffPt = hullPoints[0], maxDiffPt = hullPoints[0];
          let minSum = Infinity, maxSum = -Infinity;
          let minDiff = Infinity, maxDiff = -Infinity;

          for (const pt of hullPoints) {
            const s = pt.x + pt.y;
            const d = pt.y - pt.x;
            if (s < minSum) { minSum = s; minSumPt = pt; }
            if (s > maxSum) { maxSum = s; maxSumPt = pt; }
            if (d < minDiff) { minDiff = d; minDiffPt = pt; }
            if (d > maxDiff) { maxDiff = d; maxDiffPt = pt; }
          }

          const ordered = orderCornerPoints([minSumPt, minDiffPt, maxSumPt, maxDiffPt]);
          const ratio = quadAspectRatio(ordered);
          if (ratio >= 0.35 && ratio <= 2.8) {
            candidates.push({ corners: ordered, areaPercent, isExtremalFallback: true });
          }
        }
      }
    }

    return candidates;
  } finally {
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
    if (hull) hull.delete();
    if (approx) approx.delete();
  }
}

/**
 * Stage 1: Detect Document Boundary and 4 Corners in Real-Time
 */
export function detectDocumentCorners(
  source: CanvasImageSource,
  options?: DetectionOptions
): DocumentDetectionResult {
  if (isDetecting) {
    return {
      hasDocument: false,
      corners: getDefaultCorners(),
      areaPercent: 0,
      aspectRatio: 0.707,
      confidence: 0,
      isFallback: true,
    };
  }

  isDetecting = true;

  try {
    // Preserve source aspect ratio during downscaling to prevent geometric distortion
    const srcW = (source as any).videoWidth || (source as any).naturalWidth || (source as any).width || 1280;
    const srcH = (source as any).videoHeight || (source as any).naturalHeight || (source as any).height || 720;

    const targetMaxDim = options?.downscaleWidth ?? 480;
    const scale = Math.min(1.0, targetMaxDim / Math.max(srcW, srcH));
    const sw = Math.max(160, Math.round(srcW * scale));
    const sh = Math.max(120, Math.round(srcH * scale));

    const minArea = (options?.minAreaPercent ?? 0.08) * sw * sh;
    // 0.85 rather than 0.98: a document essentially never needs to fill nearly the whole frame, and a
    // near-full-frame contour is far more often the background/table/a person than a held document.
    const maxArea = (options?.maxAreaPercent ?? 0.85) * sw * sh;

    if (!analysisCanvas) {
      analysisCanvas = document.createElement("canvas");
    }
    analysisCanvas.width = sw;
    analysisCanvas.height = sh;

    const ctx = analysisCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return {
        hasDocument: false,
        corners: getDefaultCorners(),
        areaPercent: 0,
        aspectRatio: 0.707,
        confidence: 0,
        isFallback: true,
      };
    }

    // Draw downsampled frame with aspect ratio preserved
    ctx.drawImage(source, 0, 0, sw, sh);

    // Carries the debug breakdown out to the "no document found" fallback below, when options.debug is set
    // and every candidate this frame produced was rejected (so the caller can see why, not just that it failed).
    let lastDebugCandidates: DocumentDetectionResult["debugCandidates"];

    // ================= 1. OPENCV.JS MULTI-STRATEGY PIPELINE =================
    if (isCVReady()) {
      const cv = (window as any).cv;
      let srcMat: any = null;
      let grayMat: any = null;
      let blurMat: any = null;
      let cannyMat: any = null;
      let edgesMat: any = null;
      let otsuMat: any = null;
      let adaptMat: any = null;
      let kernel5: any = null;
      let kernel7: any = null;

      try {
        srcMat = cv.imread(analysisCanvas);
        grayMat = new cv.Mat();
        blurMat = new cv.Mat();
        cannyMat = new cv.Mat();
        edgesMat = new cv.Mat();
        otsuMat = new cv.Mat();
        adaptMat = new cv.Mat();
        kernel5 = cv.Mat.ones(5, 5, cv.CV_8U);
        kernel7 = cv.Mat.ones(7, 7, cv.CV_8U);

        // Pre-processing: Grayscale + 5x5 Gaussian Blur
        cv.cvtColor(srcMat, grayMat, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(grayMat, blurMat, new cv.Size(5, 5), 0);

        // Every strategy only PROPOSES candidates; none of them decides the winner (see findQuadCandidatesFromBinary
        // and scanner-document-scorer.ts). Strategy A runs first and, if it already produced something clearly
        // good, the more expensive strategies B/C are skipped — but "good" here means a high scored candidate,
        // not merely "a quad existed", which is the bug that let a face/body quad short-circuit the cascade before.
        const QUICK_ACCEPT_SCORE = 0.75;
        let candidates: CandidateInput[] = [];

        // Strategy A: Dual-Threshold Canny + Morphological Closing
        cv.Canny(blurMat, cannyMat, 30, 110);
        cv.morphologyEx(cannyMat, edgesMat, cv.MORPH_CLOSE, kernel5);
        candidates = candidates.concat(findQuadCandidatesFromBinary(cv, edgesMat, sw, sh, minArea, maxArea));
        let picked = pickBestCandidate(candidates, { previousQuad: options?.previousQuad });

        if (!picked || picked.score.total < QUICK_ACCEPT_SCORE) {
          // Strategy B: Otsu Binarization + Morphological Closing (ideal for paper on darker desks)
          cv.threshold(blurMat, otsuMat, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
          cv.morphologyEx(otsuMat, edgesMat, cv.MORPH_CLOSE, kernel7);
          cv.Canny(edgesMat, cannyMat, 40, 120);
          candidates = candidates.concat(findQuadCandidatesFromBinary(cv, cannyMat, sw, sh, minArea, maxArea));
          picked = pickBestCandidate(candidates, { previousQuad: options?.previousQuad });
        }

        if (!picked || picked.score.total < QUICK_ACCEPT_SCORE) {
          // Strategy C: Adaptive Gaussian Thresholding (ideal for uneven desk lighting & shadows)
          cv.adaptiveThreshold(blurMat, adaptMat, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 15, 3);
          cv.morphologyEx(adaptMat, edgesMat, cv.MORPH_CLOSE, kernel5);
          cv.Canny(edgesMat, cannyMat, 40, 120);
          candidates = candidates.concat(findQuadCandidatesFromBinary(cv, cannyMat, sw, sh, minArea, maxArea));
          picked = pickBestCandidate(candidates, { previousQuad: options?.previousQuad });
        }

        if (!picked || picked.score.total < QUICK_ACCEPT_SCORE) {
          // Strategy D: low-saturation + bright mask. Paper is close to white/gray (low colour saturation,
          // high brightness); skin, hair and most clothing/backgrounds carry noticeably more saturation. A/B/C
          // are all luminance-edge (Canny) based, so when a document is held up against or overlapping a
          // face the edge between them can be weak (similar brightness on both sides) and the two merge into
          // one contour — which is exactly how a face/body quad gets proposed at all. This strategy finds the
          // document on a completely different channel where paper and skin actually look different.
          let hsvMat: any = null;
          let channels: any = null;
          let satMat: any = null;
          let valMat: any = null;
          let satMask: any = null;
          let paperMask: any = null;
          try {
            hsvMat = new cv.Mat();
            cv.cvtColor(srcMat, hsvMat, cv.COLOR_RGBA2RGB);
            cv.cvtColor(hsvMat, hsvMat, cv.COLOR_RGB2HSV);
            channels = new cv.MatVector();
            cv.split(hsvMat, channels);
            satMat = channels.get(1);
            valMat = channels.get(2);
            satMask = new cv.Mat();
            paperMask = new cv.Mat();
            cv.threshold(satMat, satMask, 55, 255, cv.THRESH_BINARY_INV); // low saturation -> candidate paper
            cv.threshold(valMat, paperMask, 95, 255, cv.THRESH_BINARY); // bright enough to not be shadow
            cv.bitwise_and(satMask, paperMask, paperMask);
            cv.morphologyEx(paperMask, paperMask, cv.MORPH_CLOSE, kernel7);
            candidates = candidates.concat(findQuadCandidatesFromBinary(cv, paperMask, sw, sh, minArea, maxArea));
            picked = pickBestCandidate(candidates, { previousQuad: options?.previousQuad });
          } finally {
            if (satMat) satMat.delete();
            if (valMat) valMat.delete();
            if (satMask) satMask.delete();
            if (paperMask) paperMask.delete();
            if (channels) channels.delete();
            if (hsvMat) hsvMat.delete();
          }
        }

        if (options?.debug) {
          lastDebugCandidates = candidates
            .map((c) => ({
              ...scoreCandidate(c, { previousQuad: options?.previousQuad }),
              areaPercent: c.areaPercent,
              isExtremalFallback: c.isExtremalFallback,
            }))
            .sort((a, b) => a.total - b.total);
        }

        if (picked) {
          // Pull the corners ~0.8% towards the centre so the paper edge (and any table showing beyond it)
          // is trimmed from the scan.
          const orderedCorners = insetCorners(candidates[picked.bestIndex].corners, 0.008);

          return {
            hasDocument: true,
            corners: orderedCorners,
            areaPercent: candidates[picked.bestIndex].areaPercent,
            aspectRatio: picked.score.aspectRatioValue,
            confidence: picked.score.total,
            isFallback: false,
            debugCandidates: lastDebugCandidates,
          };
        }
      } catch (cvErr) {
        console.warn("[CV-ENGINE] Detection cycle error:", cvErr);
      } finally {
        if (srcMat) srcMat.delete();
        if (grayMat) grayMat.delete();
        if (blurMat) blurMat.delete();
        if (cannyMat) cannyMat.delete();
        if (edgesMat) edgesMat.delete();
        if (otsuMat) otsuMat.delete();
        if (adaptMat) adaptMat.delete();
        if (kernel5) kernel5.delete();
        if (kernel7) kernel7.delete();
      }
    }

    // No paper boundary found (or OpenCV unavailable). Report that honestly: the corners returned here are
    // only the on-screen alignment guide and must never be used as a crop.
    return {
      hasDocument: false,
      corners: getDefaultCorners(),
      areaPercent: 0,
      aspectRatio: 0.707,
      confidence: 0,
      isFallback: true,
      debugCandidates: lastDebugCandidates,
    };
  } finally {
    isDetecting = false;
  }
}

/**
 * Compute Perspective Transformation Matrix & Warp Image to Straight Rectangular Canvas
 * Uses OpenCV.js if available, or exact analytical 3x3 Projective Homography engine.
 */
export function warpPerspective(
  source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement,
  corners: DocumentCorners,
  options?: WarpOptions
): HTMLCanvasElement {
  const srcWidth = (source as any).videoWidth || (source as any).naturalWidth || source.width || 1280;
  const srcHeight = (source as any).videoHeight || (source as any).naturalHeight || source.height || 720;

  // Absolute corner points on source
  const tl = { x: corners.topLeft.x * srcWidth, y: corners.topLeft.y * srcHeight };
  const tr = { x: corners.topRight.x * srcWidth, y: corners.topRight.y * srcHeight };
  const br = { x: corners.bottomRight.x * srcWidth, y: corners.bottomRight.y * srcHeight };
  const bl = { x: corners.bottomLeft.x * srcWidth, y: corners.bottomLeft.y * srcHeight };

  // Calculate destination dimensions
  const widthTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const widthBottom = Math.hypot(br.x - bl.x, br.y - bl.y);
  const maxWidth = Math.max(widthTop, widthBottom);

  const heightLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const heightRight = Math.hypot(br.x - tr.x, br.y - tr.y);
  const maxHeight = Math.max(heightLeft, heightRight);

  // Standard high-resolution output size
  let dstWidth = options?.targetWidth || Math.round(maxWidth);
  let dstHeight = options?.targetHeight || Math.round(maxHeight);

  if (options?.aspectRatio === "a4" || !options?.aspectRatio) {
    const isLandscape = maxWidth > maxHeight * 1.05;
    if (isLandscape) {
      // Standard A4 Landscape: 1754 x 1240 @ 150 DPI
      dstWidth = 1754;
      dstHeight = 1240;
    } else {
      // Standard A4 Portrait: 1240 x 1754 @ 150 DPI
      dstWidth = 1240;
      dstHeight = 1754;
    }
  }

  // Free-ratio output follows the source size; cap it so a 12 MP phone photo does not become a 12 MP page.
  const MAX_OUTPUT_DIM = 2000;
  const shrink = Math.min(1, MAX_OUTPUT_DIM / Math.max(dstWidth, dstHeight));
  dstWidth = Math.max(1, Math.round(dstWidth * shrink));
  dstHeight = Math.max(1, Math.round(dstHeight * shrink));

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = dstWidth;
  outputCanvas.height = dstHeight;
  const outCtx = outputCanvas.getContext("2d", { willReadFrequently: true });
  if (!outCtx) return outputCanvas;

  // Prepare source canvas if video element or image passed
  let sourceCanvas: HTMLCanvasElement;
  if (source instanceof HTMLCanvasElement) {
    sourceCanvas = source;
  } else {
    sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = srcWidth;
    sourceCanvas.height = srcHeight;
    const sCtx = sourceCanvas.getContext("2d");
    sCtx?.drawImage(source, 0, 0, srcWidth, srcHeight);
  }

  // ================= 1. OPENCV.JS PERSPECTIVE WARP =================
  if (isCVReady()) {
    const cv = (window as any).cv;
    let srcMat: any = null;
    let dstMat: any = null;
    let srcCornersMat: any = null;
    let dstCornersMat: any = null;
    let M: any = null;

    try {
      srcMat = cv.imread(sourceCanvas);
      dstMat = new cv.Mat();

      srcCornersMat = cv.matFromArray(4, 1, cv.CV_32FC2, [
        tl.x, tl.y,
        tr.x, tr.y,
        br.x, br.y,
        bl.x, bl.y,
      ]);

      dstCornersMat = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0,
        dstWidth, 0,
        dstWidth, dstHeight,
        0, dstHeight,
      ]);

      M = cv.getPerspectiveTransform(srcCornersMat, dstCornersMat);
      cv.warpPerspective(
        srcMat,
        dstMat,
        M,
        new cv.Size(dstWidth, dstHeight),
        cv.INTER_LINEAR,
        cv.BORDER_CONSTANT,
        new cv.Scalar(255, 255, 255, 255)
      );

      cv.imshow(outputCanvas, dstMat);

      // Apply enhancement if requested
      if (options?.enhancement && options.enhancement !== "original") {
        enhanceDocumentImage(outputCanvas, options.enhancement);
      }

      return outputCanvas;
    } catch (err) {
      console.warn("[CV-ENGINE] OpenCV warp failed, falling back to native homography:", err);
    } finally {
      if (srcMat) srcMat.delete();
      if (dstMat) dstMat.delete();
      if (srcCornersMat) srcCornersMat.delete();
      if (dstCornersMat) dstCornersMat.delete();
      if (M) M.delete();
    }
  }

  // ================= 2. NATIVE ANALYTICAL HOMOGRAPHY ENGINE =================
  warpNativeHomography(sourceCanvas, outputCanvas, tl, tr, br, bl, dstWidth, dstHeight);

  if (options?.enhancement && options.enhancement !== "original") {
    enhanceDocumentImage(outputCanvas, options.enhancement);
  }

  return outputCanvas;
}

/**
 * Exact 3x3 Projective Homography & Bilinear Backward Mapping
 * Transforms any arbitrary convex quadrilateral source region [tl, tr, br, bl]
 * into a straight rectangular canvas [0, 0, dstW, dstH].
 */
function warpNativeHomography(
  srcCanvas: HTMLCanvasElement,
  dstCanvas: HTMLCanvasElement,
  tl: Point2D,
  tr: Point2D,
  br: Point2D,
  bl: Point2D,
  dstW: number,
  dstH: number
) {
  const srcCtx = srcCanvas.getContext("2d");
  const dstCtx = dstCanvas.getContext("2d");
  if (!srcCtx || !dstCtx) return;

  const srcImg = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  const dstImg = dstCtx.createImageData(dstW, dstH);

  const srcData = srcImg.data;
  const dstData = dstImg.data;
  const sw = srcCanvas.width;
  const sh = srcCanvas.height;

  // Derive 3x3 Projective Homography Matrix mapping Unit Square (u, v) -> Source Quad (x, y)
  const x0 = tl.x, y0 = tl.y;
  const x1 = tr.x, y1 = tr.y;
  const x2 = br.x, y2 = br.y;
  const x3 = bl.x, y3 = bl.y;

  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const sx = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sy = y0 - y1 + y2 - y3;

  let g = 0, h = 0;
  let a11 = 0, a12 = 0, a13 = 0;
  let a21 = 0, a22 = 0, a23 = 0;

  const det = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(det) > 1e-7 && (Math.abs(sx) > 1e-7 || Math.abs(sy) > 1e-7)) {
    // Projective distortion
    g = (sx * dy2 - sy * dx2) / det;
    h = (dx1 * sy - dy1 * sx) / det;
    a11 = x1 - x0 + g * x1;
    a12 = x3 - x0 + h * x3;
    a13 = x0;
    a21 = y1 - y0 + g * y1;
    a22 = y3 - y0 + h * y3;
    a23 = y0;
  } else {
    // Affine / Parallelogram
    a11 = x1 - x0;
    a12 = x3 - x0;
    a13 = x0;
    a21 = y1 - y0;
    a22 = y3 - y0;
    a23 = y0;
  }

  // Backward map each destination pixel (dx, dy) to source (sx, sy)
  for (let dy = 0; dy < dstH; dy++) {
    const v = dy / (dstH - 1);
    const dstRowOffset = dy * dstW * 4;

    for (let dx = 0; dx < dstW; dx++) {
      const u = dx / (dstW - 1);
      const denom = g * u + h * v + 1;
      const srcX = (a11 * u + a12 * v + a13) / denom;
      const srcY = (a21 * u + a22 * v + a23) / denom;

      const dIdx = dstRowOffset + dx * 4;

      if (srcX >= 0 && srcX < sw - 1 && srcY >= 0 && srcY < sh - 1) {
        // High-speed Bilinear interpolation
        const xFloor = Math.floor(srcX);
        const yFloor = Math.floor(srcY);
        const xCeil = xFloor + 1;
        const yCeil = yFloor + 1;

        const wx1 = srcX - xFloor;
        const wx0 = 1 - wx1;
        const wy1 = srcY - yFloor;
        const wy0 = 1 - wy1;

        const idx00 = (yFloor * sw + xFloor) * 4;
        const idx10 = (yFloor * sw + xCeil) * 4;
        const idx01 = (yCeil * sw + xFloor) * 4;
        const idx11 = (yCeil * sw + xCeil) * 4;

        dstData[dIdx] = Math.round(
          wy0 * (wx0 * srcData[idx00] + wx1 * srcData[idx10]) +
          wy1 * (wx0 * srcData[idx01] + wx1 * srcData[idx11])
        );
        dstData[dIdx + 1] = Math.round(
          wy0 * (wx0 * srcData[idx00 + 1] + wx1 * srcData[idx10 + 1]) +
          wy1 * (wx0 * srcData[idx01 + 1] + wx1 * srcData[idx11 + 1])
        );
        dstData[dIdx + 2] = Math.round(
          wy0 * (wx0 * srcData[idx00 + 2] + wx1 * srcData[idx10 + 2]) +
          wy1 * (wx0 * srcData[idx01 + 2] + wx1 * srcData[idx11 + 2])
        );
        dstData[dIdx + 3] = 255;
      } else {
        dstData[dIdx] = 255;
        dstData[dIdx + 1] = 255;
        dstData[dIdx + 2] = 255;
        dstData[dIdx + 3] = 255;
      }
    }
  }

  dstCtx.putImageData(dstImg, 0, 0);
}

/**
 * Apply Document Enhancement Filters to an Image Canvas
 */
export function enhanceDocumentImage(
  canvas: HTMLCanvasElement,
  mode: EnhancementMode
): HTMLCanvasElement {
  if (mode === "original") return canvas;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  if (mode === "grayscale") {
    for (let i = 0; i < data.length; i += 4) {
      const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      data[i] = lum;
      data[i + 1] = lum;
      data[i + 2] = lum;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  if (mode === "enhanced") {
    // Magic Color Filter: Dynamic white-point lifting + contrast curve + color preservation
    // 1. Sample paper background highlight luminance (approx 95th percentile)
    let sumHigh = 0;
    let countHigh = 0;
    const sampleStep = 16;

    for (let i = 0; i < data.length; i += 4 * sampleStep) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum > 160) {
        sumHigh += lum;
        countHigh++;
      }
    }

    const avgPaperLum = countHigh > 0 ? sumHigh / countHigh : 210;
    const whiteScale = Math.min(1.4, 255 / Math.max(170, avgPaperLum * 0.96));
    const gamma = 0.85;

    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        let val = (data[i + c] * whiteScale) / 255;
        val = Math.pow(Math.min(1.0, val), gamma);
        // Mild S-curve contrast boost
        val = (val - 0.5) * 1.25 + 0.5;
        data[i + c] = Math.min(255, Math.max(0, Math.round(val * 255)));
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  if (mode === "bw") {
    // High-Contrast Document Binarization with Local Adaptive Block Thresholding
    // Adapts to uneven shadows and gradients across the document surface
    const blockSize = 16;
    const blocksX = Math.ceil(w / blockSize);
    const blocksY = Math.ceil(h / blockSize);
    const blockMeans = new Float32Array(blocksX * blocksY);

    // 1. Compute mean luminance per local block
    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        let sum = 0;
        let count = 0;
        const startX = bx * blockSize;
        const startY = by * blockSize;
        const endX = Math.min(w, startX + blockSize);
        const endY = Math.min(h, startY + blockSize);

        for (let y = startY; y < endY; y += 2) {
          for (let x = startX; x < endX; x += 2) {
            const idx = (y * w + x) * 4;
            sum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            count++;
          }
        }
        blockMeans[by * blocksX + bx] = count > 0 ? sum / count : 128;
      }
    }

    // 2. Apply local threshold
    for (let y = 0; y < h; y++) {
      const by = Math.min(blocksY - 1, Math.floor(y / blockSize));
      for (let x = 0; x < w; x++) {
        const bx = Math.min(blocksX - 1, Math.floor(x / blockSize));
        const localMean = blockMeans[by * blocksX + bx];
        const threshold = Math.max(60, localMean * 0.88);

        const idx = (y * w + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

        const outVal = lum > threshold ? 255 : 0;
        data[idx] = outVal;
        data[idx + 1] = outVal;
        data[idx + 2] = outVal;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  return canvas;
}

/**
 * Compute the maximum recommended JPEG byte size per page to guarantee final PDF <= 500 KB
 */
export function getRecommendedPageBudget(pageCount: number): number {
  const totalBudget = 460 * 1024; // 460 KB total budget (leaving 40KB margin for PDF wrapper & pdf-lib overhead)
  const count = Math.max(1, pageCount);
  return Math.min(220 * 1024, Math.floor(totalBudget / count));
}

/**
 * Convert Canvas to a compressed JPEG Data URL that guarantees adherence to the per-page budget
 * to enforce the 500 KB multi-page PDF limit.
 */
export function compressCanvasToOptimizedJpeg(
  canvas: HTMLCanvasElement,
  options?: {
    maxBytesPerPage?: number;
    initialQuality?: number;
    minQuality?: number;
  }
): { dataUrl: string; byteSize: number } {
  const maxBytes = options?.maxBytesPerPage ?? 140 * 1024;
  let quality = options?.initialQuality ?? 0.82;
  const minQuality = options?.minQuality ?? 0.52;

  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  let byteSize = Math.round((dataUrl.length - 23) * 0.75);

  while (byteSize > maxBytes && quality > minQuality) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    byteSize = Math.round((dataUrl.length - 23) * 0.75);
  }

  // If still above budget (e.g. very detailed colored graphic), downscale slightly
  if (byteSize > maxBytes && (canvas.width > 900 || canvas.height > 1200)) {
    const scaleFactor = 0.85;
    const scaledCanvas = document.createElement("canvas");
    scaledCanvas.width = Math.round(canvas.width * scaleFactor);
    scaledCanvas.height = Math.round(canvas.height * scaleFactor);
    const sCtx = scaledCanvas.getContext("2d");
    if (sCtx) {
      sCtx.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
      dataUrl = scaledCanvas.toDataURL("image/jpeg", Math.max(minQuality, quality));
      byteSize = Math.round((dataUrl.length - 23) * 0.75);
    }
  }

  return { dataUrl, byteSize };
}

