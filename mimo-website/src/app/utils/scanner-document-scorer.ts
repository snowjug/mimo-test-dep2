/**
 * MIMO Document Scanner - Document Candidate Scorer
 *
 * The CV engine (scanner-cv-engine.ts) finds every contour that is roughly quadrilateral and convex and hands
 * them here as candidates. Picking "the biggest one" is what let a person's face/body/torso win over the
 * actual paper they were holding — a face+shoulders silhouette against a wall is very often the largest
 * convex quad in the frame. This module scores every candidate on several independent, cheap, pure-geometry
 * signals and picks the one that looks most like a held document, not the one that covers the most pixels.
 *
 * Deliberately has zero DOM/OpenCV dependency so it can be unit tested with plain objects.
 */

import type { DocumentCorners, Point2D } from "./scanner-cv-engine";

export interface CandidateInput {
  corners: DocumentCorners; // normalized 0..1, already ordered TL/TR/BR/BL
  areaPercent: number; // candidate's convex-hull area / full frame area, 0..1
  isExtremalFallback?: boolean; // true if corners came from the "5-10 vertex hull extremes" fallback, not a clean approxPolyDP quad
}

export interface CandidateScoreBreakdown {
  total: number; // 0..1, weighted composite
  area: number;
  rectangularity: number;
  angle: number;
  aspectRatio: number;
  center: number;
  continuity: number | null; // null when no previous-frame quad was supplied
  aspectRatioValue: number; // the candidate's measured width/height ratio
}

export interface ScoringOptions {
  previousQuad?: DocumentCorners | null; // last accepted quad, for temporal continuity (reduces frame-to-frame flicker)
  idealAreaPercent?: number; // area fraction scored highest (default 0.45 — a document held up fills under half the frame)
  areaFalloff?: number; // how fast the area score drops moving away from idealAreaPercent (default 0.55)
  minAcceptScore?: number; // candidates scoring below this are rejected outright rather than guessed (default 0.5)
}

// A4, US Letter, and ID/Aadhar-card ratios, portrait and landscape. Perspective distortion shifts the measured
// ratio around, so aspectRatioScore() uses a generous log-distance tolerance rather than an exact match.
const KNOWN_ASPECT_RATIOS = [0.707, 1.414, 0.773, 1.294, 0.63, 1.586, 1.0];

const WEIGHTS = { area: 0.2, rectangularity: 0.15, angle: 0.25, aspectRatio: 0.2, center: 0.05, continuity: 0.15 };
const EXTREMAL_FALLBACK_PENALTY = 0.05;
export const DEFAULT_MIN_ACCEPT_SCORE = 0.58;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function shoelaceArea(pts: Point2D[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function boundingBoxArea(pts: Point2D[]): number {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

function angleAtDegrees(prev: Point2D, cur: Point2D, next: Point2D): number {
  const v1x = prev.x - cur.x, v1y = prev.y - cur.y;
  const v2x = next.x - cur.x, v2y = next.y - cur.y;
  const mag1 = Math.hypot(v1x, v1y) || 1e-6;
  const mag2 = Math.hypot(v2x, v2y) || 1e-6;
  const cos = clamp((v1x * v2x + v1y * v2y) / (mag1 * mag2), -1, 1);
  return (Math.acos(cos) * 180) / Math.PI;
}

function cornerList(c: DocumentCorners): Point2D[] {
  return [c.topLeft, c.topRight, c.bottomRight, c.bottomLeft];
}

function interiorAngles(c: DocumentCorners): number[] {
  const pts = cornerList(c);
  return pts.map((p, i) => angleAtDegrees(pts[(i + 3) % 4], p, pts[(i + 1) % 4]));
}

function centroidOf(c: DocumentCorners): Point2D {
  const pts = cornerList(c);
  return { x: pts.reduce((s, p) => s + p.x, 0) / 4, y: pts.reduce((s, p) => s + p.y, 0) / 4 };
}

function sideLengths(c: DocumentCorners): { avgW: number; avgH: number } {
  const topW = Math.hypot(c.topRight.x - c.topLeft.x, c.topRight.y - c.topLeft.y);
  const botW = Math.hypot(c.bottomRight.x - c.bottomLeft.x, c.bottomRight.y - c.bottomLeft.y);
  const leftH = Math.hypot(c.bottomLeft.x - c.topLeft.x, c.bottomLeft.y - c.topLeft.y);
  const rightH = Math.hypot(c.bottomRight.x - c.topRight.x, c.bottomRight.y - c.topRight.y);
  return { avgW: (topW + botW) / 2, avgH: (leftH + rightH) / 2 };
}

// Intentionally duplicated from scanner-auto-capture.ts (not imported) to keep this module dependency-free.
function maxCornerShift(a: DocumentCorners, b: DocumentCorners): number {
  return Math.max(
    Math.hypot(a.topLeft.x - b.topLeft.x, a.topLeft.y - b.topLeft.y),
    Math.hypot(a.topRight.x - b.topRight.x, a.topRight.y - b.topRight.y),
    Math.hypot(a.bottomRight.x - b.bottomRight.x, a.bottomRight.y - b.bottomRight.y),
    Math.hypot(a.bottomLeft.x - b.bottomLeft.x, a.bottomLeft.y - b.bottomLeft.y)
  );
}

/** How close the candidate's area is to a typical "document held up to the camera" fraction of the frame. */
function areaScore(areaPercent: number, idealAreaPercent: number, falloff: number): number {
  return clamp(1 - Math.abs(areaPercent - idealAreaPercent) / falloff, 0, 1);
}

/** Convex-hull area over its own axis-aligned bounding box. A compact quad scores high; an irregular silhouette does not. */
function rectangularityScore(corners: DocumentCorners): number {
  const pts = cornerList(corners);
  const bbox = boundingBoxArea(pts) || 1e-6;
  return clamp(shoelaceArea(pts) / bbox, 0, 1);
}

/** Rotation-invariant: a true rectangle keeps ~90° interior angles under tilt; a body/face outline does not. */
function angleScore(corners: DocumentCorners): number {
  const angles = interiorAngles(corners);
  const avgDeviation = angles.reduce((s, a) => s + Math.abs(a - 90), 0) / angles.length;
  return clamp(1 - avgDeviation / 28, 0, 1);
}

/** Closest match (log-distance, tolerant of perspective skew) to a known document aspect ratio. */
function aspectRatioScore(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  const minDist = Math.min(...KNOWN_ASPECT_RATIOS.map((k) => Math.abs(Math.log(ratio / k))));
  return clamp(1 - minDist / 0.55, 0, 1);
}

/** Weak preference for candidates nearer the frame center; never a requirement. */
function centerScore(corners: DocumentCorners): number {
  const c = centroidOf(corners);
  return clamp(1 - Math.hypot(c.x - 0.5, c.y - 0.5) / 0.6, 0, 1);
}

/** How close this candidate sits to the last accepted quad. Rewards staying locked onto the same physical
 * document frame-to-frame instead of jumping to whatever else qualifies (paper -> face -> table -> paper). */
function continuityScore(corners: DocumentCorners, previous: DocumentCorners | null | undefined): number | null {
  if (!previous) return null;
  return clamp(1 - maxCornerShift(corners, previous) / 0.35, 0, 1);
}

export function scoreCandidate(candidate: CandidateInput, options?: ScoringOptions): CandidateScoreBreakdown {
  const ideal = options?.idealAreaPercent ?? 0.45;
  const falloff = options?.areaFalloff ?? 0.55;
  const { avgW, avgH } = sideLengths(candidate.corners);
  const ratio = avgW / (avgH || 1e-6);

  const area = areaScore(candidate.areaPercent, ideal, falloff);
  const rectangularity = rectangularityScore(candidate.corners);
  const angle = angleScore(candidate.corners);
  const aspectRatio = aspectRatioScore(ratio);
  const center = centerScore(candidate.corners);
  const continuity = continuityScore(candidate.corners, options?.previousQuad);

  const baseParts: Array<[number, number]> = [
    [WEIGHTS.area, area],
    [WEIGHTS.rectangularity, rectangularity],
    [WEIGHTS.angle, angle],
    [WEIGHTS.aspectRatio, aspectRatio],
    [WEIGHTS.center, center],
  ];
  const baseWeightSum = baseParts.reduce((s, [w]) => s + w, 0);
  const baseTotal = baseParts.reduce((s, [w, v]) => s + w * v, 0) / baseWeightSum;

  // Continuity only ever smooths jitter between candidates that already look plausible on their own; it must
  // never be the reason a shape that doesn't look like a document on its own merits keeps getting re-accepted
  // frame after frame just because it matches what was (wrongly) accepted last time.
  const CONTINUITY_MIN_BASE_SCORE = 0.45;
  let total = baseTotal;
  if (continuity !== null && baseTotal >= CONTINUITY_MIN_BASE_SCORE) {
    const weightSum = baseWeightSum + WEIGHTS.continuity;
    total = (baseTotal * baseWeightSum + continuity * WEIGHTS.continuity) / weightSum;
  }

  // Hard angle gate: a quad whose corners are nowhere near 90° is not a rectangle, however well it scores on
  // everything else (area, aspect ratio and even rectangularity can all look fine for a merged face+paper
  // blob). Below angle 0.5 the whole score is scaled down proportionally rather than just averaged in, so a
  // bad angle can't be compensated away by other signals.
  const angleGate = clamp(angle / 0.5, 0, 1);
  total *= angleGate;

  if (candidate.isExtremalFallback) total = Math.max(0, total - EXTREMAL_FALLBACK_PENALTY);

  return { total: clamp(total, 0, 1), area, rectangularity, angle, aspectRatio, center, continuity, aspectRatioValue: ratio };
}

/**
 * Scores every candidate and returns the best one, or null if even the best candidate doesn't clear
 * minAcceptScore. Returning null is deliberate: a wrong automatic crop is worse than reporting "no document
 * found" and asking the user to adjust (see scanner-cv-engine.ts callers).
 */
export function pickBestCandidate(
  candidates: CandidateInput[],
  options?: ScoringOptions
): { bestIndex: number; score: CandidateScoreBreakdown; all: CandidateScoreBreakdown[] } | null {
  if (!candidates.length) return null;
  const all = candidates.map((c) => scoreCandidate(c, options));
  let bestIndex = 0;
  for (let i = 1; i < all.length; i++) {
    if (all[i].total > all[bestIndex].total) bestIndex = i;
  }
  const minAccept = options?.minAcceptScore ?? DEFAULT_MIN_ACCEPT_SCORE;
  if (all[bestIndex].total < minAccept) return null;
  return { bestIndex, score: all[bestIndex], all };
}
