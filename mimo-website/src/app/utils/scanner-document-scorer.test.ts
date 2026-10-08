/**
 * Pure-geometry tests for the document candidate scorer. No DOM/OpenCV needed, so this runs directly with:
 *   node --experimental-strip-types --test src/app/utils/scanner-document-scorer.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreCandidate, pickBestCandidate, DEFAULT_MIN_ACCEPT_SCORE, type CandidateInput } from "./scanner-document-scorer.ts";
import { orderCornerPoints } from "./scanner-cv-engine.ts";
import type { DocumentCorners } from "./scanner-cv-engine.ts";

// A clean A4-ish rectangle held up in the frame: good angles, good aspect ratio, moderate area.
const PAPER: CandidateInput = {
  corners: {
    topLeft: { x: 0.3, y: 0.25 },
    topRight: { x: 0.7, y: 0.22 },
    bottomRight: { x: 0.72, y: 0.75 },
    bottomLeft: { x: 0.28, y: 0.78 },
  },
  areaPercent: 0.3,
};

// A large, irregularly-skewed quad spanning most of the frame — stands in for a person's face+shoulders
// silhouette against a wall, which is very often the single largest convex quad OpenCV finds in the frame.
// Real body/face contours rarely approximate to a clean trapezoid; approxPolyDP forced to 4 points on one
// typically produces something closer to this kite-like shape with one sharply acute corner (the neck line).
const FACE_AND_BODY: CandidateInput = {
  corners: {
    topLeft: { x: 0.02, y: 0.02 },
    topRight: { x: 0.5, y: 0.3 },
    bottomRight: { x: 0.98, y: 0.98 },
    bottomLeft: { x: 0.1, y: 0.6 },
  },
  areaPercent: 0.7,
};

// From a real failure report: a notebook held up close to the face produced a merged contour running from
// the hairline, through the ear/jaw, down to the chest — a quad with only a weak paper-vs-skin edge on one
// side, so Canny merged the two into one shape. Reconstructed in normalized coordinates from the screenshot.
const NOTEBOOK_MERGED_WITH_FACE: CandidateInput = {
  corners: {
    topLeft: { x: 0.52, y: 0.18 },
    topRight: { x: 0.95, y: 0.37 },
    bottomRight: { x: 0.7, y: 0.95 },
    bottomLeft: { x: 0.52, y: 0.6 },
  },
  areaPercent: 0.33,
};

test("regression: a document merged with a face (real failure report) is rejected outright", () => {
  const result = pickBestCandidate([NOTEBOOK_MERGED_WITH_FACE]);
  assert.equal(result, null, `expected rejection; got score ${scoreCandidate(NOTEBOOK_MERGED_WITH_FACE).total}`);
});

test("regression: continuity cannot keep resurrecting a candidate that fails on its own merits", () => {
  // Simulates the sticky-wrong-answer failure: the bad candidate matching itself frame-to-frame must not be
  // enough to push it over the accept floor.
  const score = scoreCandidate(NOTEBOOK_MERGED_WITH_FACE, { previousQuad: NOTEBOOK_MERGED_WITH_FACE.corners });
  assert.ok(score.total < DEFAULT_MIN_ACCEPT_SCORE, `continuity rescued a bad candidate: ${score.total}`);
});

test("scoreCandidate: a held document scores well above a face/body-sized silhouette", () => {
  const paperScore = scoreCandidate(PAPER);
  const bodyScore = scoreCandidate(FACE_AND_BODY);
  assert.ok(paperScore.total > bodyScore.total, `expected paper (${paperScore.total}) > body (${bodyScore.total})`);
  assert.ok(paperScore.total >= DEFAULT_MIN_ACCEPT_SCORE, `paper should clear the accept floor: ${paperScore.total}`);
});

test("pickBestCandidate: picks the document over the larger silhouette (NOT the largest-area rule)", () => {
  const result = pickBestCandidate([FACE_AND_BODY, PAPER]);
  assert.ok(result, "expected a candidate to be accepted");
  assert.equal(result!.bestIndex, 1, "expected the paper candidate (index 1) to win despite smaller area");
});

test("pickBestCandidate: returns null (no guess) when nothing clears the accept floor", () => {
  // Only the bad silhouette is offered — the scorer must refuse rather than crop it.
  const result = pickBestCandidate([FACE_AND_BODY]);
  assert.equal(result, null);
});

test("pickBestCandidate: returns null for an empty candidate list", () => {
  assert.equal(pickBestCandidate([]), null);
});

test("continuity: a candidate near the previous frame's quad is preferred over an equally paper-like but relocated one", () => {
  const previousQuad: DocumentCorners = PAPER.corners;

  const sameSpot: CandidateInput = { ...PAPER, corners: shift(PAPER.corners, 0.01, 0.01) };
  const movedAway: CandidateInput = { ...PAPER, corners: shift(PAPER.corners, 0.4, 0.0) };

  const sameScore = scoreCandidate(sameSpot, { previousQuad });
  const movedScore = scoreCandidate(movedAway, { previousQuad });

  assert.ok(sameScore.continuity !== null && movedScore.continuity !== null);
  assert.ok(sameScore.continuity! > movedScore.continuity!);
  assert.ok(sameScore.total > movedScore.total, "staying near the last known document should score higher overall");
});

test("continuity: absent when no previous quad is supplied (first frame has no history to match)", () => {
  const score = scoreCandidate(PAPER);
  assert.equal(score.continuity, null);
});

test("extremal-fallback candidates are slightly penalized relative to an identical clean quad", () => {
  const clean = scoreCandidate(PAPER);
  const fallback = scoreCandidate({ ...PAPER, isExtremalFallback: true });
  assert.ok(fallback.total < clean.total);
});

test("aspect ratio: an Aadhar-card-shaped quad (~1.586) scores well, not just A4-shaped ones", () => {
  const idCard: CandidateInput = {
    corners: {
      topLeft: { x: 0.2, y: 0.4 },
      topRight: { x: 0.8, y: 0.4 },
      bottomRight: { x: 0.8, y: 0.62 },
      bottomLeft: { x: 0.2, y: 0.62 },
    },
    areaPercent: 0.3,
  };
  // width 0.6; set height to hit the real ID-card ratio (~1.586) exactly.
  const h = 0.6 / 1.586;
  idCard.corners.bottomRight.y = idCard.corners.topRight.y + h;
  idCard.corners.bottomLeft.y = idCard.corners.topLeft.y + h;

  const score = scoreCandidate(idCard);
  assert.ok(score.aspectRatio > 0.85, `expected a near-perfect aspect ratio match, got ${score.aspectRatio}`);
});

test("corner ordering: orderCornerPoints is stable regardless of input order (used before scoring)", () => {
  const expected = {
    topLeft: { x: 0.1, y: 0.1 },
    topRight: { x: 0.9, y: 0.1 },
    bottomRight: { x: 0.9, y: 0.9 },
    bottomLeft: { x: 0.1, y: 0.9 },
  };
  const shuffled = [expected.bottomRight, expected.topLeft, expected.bottomLeft, expected.topRight];
  const ordered = orderCornerPoints(shuffled);
  assert.deepEqual(ordered, expected);
});

function shift(c: DocumentCorners, dx: number, dy: number): DocumentCorners {
  const move = (p: { x: number; y: number }) => ({ x: p.x + dx, y: p.y + dy });
  return { topLeft: move(c.topLeft), topRight: move(c.topRight), bottomRight: move(c.bottomRight), bottomLeft: move(c.bottomLeft) };
}
