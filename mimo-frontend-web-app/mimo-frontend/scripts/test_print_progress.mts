// Comprehensive unit tests for src/utils/printProgress.ts (MIMO 1.0 continuous progress model).
// Run: node --test --experimental-strip-types scripts/test_print_progress.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePrintProgress,
  calculateMilestoneBounds,
  stepVisualProgress,
  getVisualTickDelay,
  verifiedPercent,
} from '../src/utils/printProgress.ts';

const poll = (over: Record<string, unknown>, prev = { previousProgress: 0, previousSheetsCompleted: 0 }) =>
  calculatePrintProgress({ pages: 1, copies: 1, ...prev, ...over } as Parameters<typeof calculatePrintProgress>[0]);

test('single sheet: continuous milestone bounds, never 100% before completion', () => {
  // 1. Initial state when printing starts: floor = 1%, ceiling = 95%
  const p1 = poll({ status: 'printing', sheetsCompleted: 0, totalSheets: 1 });
  assert.equal(p1.progress, 1);
  assert.equal(p1.milestoneFloor, 1);
  assert.equal(p1.milestoneCeiling, 95);
  assert.equal(p1.isPrinting, true);
  assert.equal(p1.isCompleted, false);

  // 2. Smooth visual ticking advances continuously from 1% towards ceiling
  let prog = p1.progress;
  const bounds = { floor: p1.milestoneFloor, ceiling: p1.milestoneCeiling };
  for (let i = 0; i < 200; i++) {
    prog = stepVisualProgress(prog, bounds, false, false, 1);
  }
  // Must smoothly reach the in-flight ceiling and NOT exceed 95%
  assert.equal(prog, 95);

  // 3. Even if Pi streams sheetsCompleted == 1 while status is still 'printing', progress is capped below 100%
  const pStray = poll({ status: 'printing', sheetsCompleted: 1, totalSheets: 1 });
  assert.equal(pStray.progress, 95);
  assert.equal(pStray.isCompleted, false);
  assert.ok(pStray.progress < 100, 'Must never reach 100% while status is printing');

  // 4. Exactly 100% when authoritative completion signal arrives
  const c = poll({ status: 'completed', isPrinted: true, sheetsCompleted: 1, totalSheets: 1 });
  assert.equal(c.progress, 100);
  assert.equal(c.milestoneFloor, 100);
  assert.equal(c.milestoneCeiling, 100);
  assert.equal(c.isCompleted, true);
  assert.equal(c.statusMsg, 'Print Completed ✅');
});

test('multi sheet: continuous milestone floor and ceiling pacing with hardware updates', () => {
  const total = 5;

  // Initial bounds before any sheet physically finishes
  const b0 = calculateMilestoneBounds(0, total, 'bw');
  assert.equal(b0.floor, 1);
  assert.equal(b0.ceiling, 16); // Math.round((0.85/5)*95)

  // Sheet 1 finishes: floor lifts to 19%, ceiling to 35%
  const b1 = calculateMilestoneBounds(1, total, 'bw');
  assert.equal(b1.floor, 19);
  assert.equal(b1.ceiling, 35); // Math.round((1.85/5)*95)

  // Sheet 2 finishes: floor lifts to 38%, ceiling to 54%
  const b2 = calculateMilestoneBounds(2, total, 'bw');
  assert.equal(b2.floor, 38);
  assert.equal(b2.ceiling, 54);

  // Sheet 3 finishes: floor lifts to 57%, ceiling to 73%
  const b3 = calculateMilestoneBounds(3, total, 'bw');
  assert.equal(b3.floor, 57);
  assert.equal(b3.ceiling, 73);

  // Sheet 4 finishes: floor lifts to 76%, ceiling to 92%
  const b4 = calculateMilestoneBounds(4, total, 'bw');
  assert.equal(b4.floor, 76);
  assert.equal(b4.ceiling, 92);

  // All 5 sheets counted by PJL but status is still 'printing': capped at 95%
  const b5 = calculateMilestoneBounds(5, total, 'bw');
  assert.equal(b5.floor, 95);
  assert.equal(b5.ceiling, 95);

  // Status message formatting
  assert.equal(poll({ status: 'printing', sheetsCompleted: 2, totalSheets: 5 }).statusMsg, '2 of 5 sheets printed…');
});

test('monotonic under delayed or out-of-order responses', () => {
  // If previous progress was 60% with 3 sheets counted, receiving a delayed poll
  // reporting 1 sheet must NEVER move progress backwards.
  const r = poll(
    { status: 'printing', sheetsCompleted: 1, totalSheets: 5 },
    { previousProgress: 60, previousSheetsCompleted: 3 }
  );
  assert.equal(r.progress, 60);
  assert.equal(r.sheetsCompleted, 3);
});

test('missing / garbage sheet data claims nothing and calculates fallback total', () => {
  for (const v of [null, undefined, 'abc', -3]) {
    const res = poll({ status: 'printing', sheetsCompleted: v, totalSheets: 4 });
    assert.equal(res.progress, 1);
    assert.equal(res.sheetsCompleted, 0);
  }
  // totalSheets missing: falls back to pages x copies (duplex = ceil(pages/2))
  assert.equal(poll({ status: 'printing', sheetsCompleted: 1, pages: 4, copies: 1, doubleSided: 'double' }).totalSheets, 2);
  assert.equal(poll({ status: 'printing', sheetsCompleted: 1, pages: 5, copies: 2, doubleSided: false }).totalSheets, 10);
});

test('paid / unknown status is waiting, not printing, but active recovery preserves in-flight progress', () => {
  // Initial wait: claims 0%
  const w = poll({ status: 'paid', sheetsCompleted: 0, totalSheets: 2 });
  assert.equal(w.isWaiting, true);
  assert.equal(w.isPrinting, false);
  assert.equal(w.progress, 0);

  // Page reload recovery: previousProgress preserved and marks printing
  const recovered = poll({ totalSheets: 5 }, { previousProgress: 40, previousSheetsCompleted: 2 });
  assert.equal(recovered.progress, 40);
  assert.equal(recovered.isPrinting, true);
});

test('failure keeps the verified value and never reaches 100', () => {
  const f = poll({ status: 'failed', errorMsg: 'Paper Jam' }, { previousProgress: 40, previousSheetsCompleted: 2 });
  assert.equal(f.isFailed, true);
  assert.equal(f.isCompleted, false);
  assert.equal(f.progress, 40);
  assert.equal(f.statusMsg, 'Paper Jam');

  const refunded = poll({ status: 'refunded' }, { previousProgress: 55, previousSheetsCompleted: 3 });
  assert.equal(refunded.isFailed, true);
  assert.equal(refunded.progress, 55);
});

test('staged progress with piReceivedAt and sentToPrinterAt before first sheet verified', () => {
  // piReceivedAt: Pi listener picked up job -> advances floor to 2%
  const p1 = poll({ status: 'printing', sheetsCompleted: 0, totalSheets: 1, piReceivedAt: '2026-10-24T12:00:00.000Z' });
  assert.equal(p1.progress, 2);
  assert.equal(p1.milestoneFloor, 2);
  assert.equal(p1.statusMsg, 'Preparing your page…');

  // sentToPrinterAt: CUPS sent job to USB printer -> advances floor to 5%
  const p2 = poll({
    status: 'printing',
    sheetsCompleted: 0,
    totalSheets: 1,
    piReceivedAt: '2026-10-24T12:00:00.000Z',
    sentToPrinterAt: '2026-10-24T12:00:05.000Z',
  });
  assert.equal(p2.progress, 5);
  assert.equal(p2.milestoneFloor, 5);
  assert.equal(p2.statusMsg, 'Printing your page…');

  // Multi-sheet message formatting
  const p3 = poll({ status: 'printing', sheetsCompleted: 0, totalSheets: 3, piReceivedAt: '2026-10-24T12:00:00.000Z' });
  assert.equal(p3.progress, 2);
  assert.equal(p3.statusMsg, 'Preparing 3 sheets…');

  const p4 = poll({ status: 'printing', sheetsCompleted: 0, totalSheets: 3, sentToPrinterAt: '2026-10-24T12:00:05.000Z' });
  assert.equal(p4.progress, 5);
  assert.equal(p4.statusMsg, 'Sending 3 sheets to printer…');

  // Strictly stays below 100%
  assert.ok(p4.progress < 100);
});

test('stepVisualProgress advances strictly towards ceiling and jumps to 100 on completion', () => {
  const bounds = { floor: 5, ceiling: 50 };

  // Starting below floor jumps to floor
  assert.equal(stepVisualProgress(0, bounds), 5);
  assert.equal(stepVisualProgress(4, bounds), 5);

  // Stepping advances by step
  assert.equal(stepVisualProgress(10, bounds, false, false, 1), 11);
  assert.equal(stepVisualProgress(49, bounds, false, false, 1), 50);

  // Does not exceed ceiling
  assert.equal(stepVisualProgress(50, bounds, false, false, 1), 50);

  // Fails keeps current
  assert.equal(stepVisualProgress(30, bounds, false, true), 30);

  // Completed jumps to 100
  assert.equal(stepVisualProgress(30, bounds, true, false), 100);
});

test('getVisualTickDelay provides calibrated adaptive intervals', () => {
  // Single-sheet B&W laser: progressive deceleration as it approaches 95%
  assert.equal(getVisualTickDelay(10, 'bw', 1), 60);
  assert.equal(getVisualTickDelay(60, 'bw', 1), 85);
  assert.equal(getVisualTickDelay(80, 'bw', 1), 120);
  assert.equal(getVisualTickDelay(90, 'bw', 1), 160);

  // Color mode: calibrated for inkjet (~200ms)
  assert.equal(getVisualTickDelay(30, 'color', 1), 200);

  // Multi-sheet B&W laser: scales proportionally
  const delay5 = getVisualTickDelay(30, 'bw', 5);
  assert.ok(delay5 >= 40 && delay5 <= 200);
});

test('legacy verifiedPercent helper preserved for compatibility', () => {
  assert.equal(verifiedPercent(0, 0), 1);
  assert.equal(verifiedPercent(0, 21), 1);
  assert.equal(verifiedPercent(20, 21), 94);
  assert.equal(verifiedPercent(50, 3), 99);
});
