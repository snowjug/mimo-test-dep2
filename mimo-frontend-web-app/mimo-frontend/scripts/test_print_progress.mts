// Unit tests for src/utils/printProgress.ts (the kiosk's verified-sheet progress model).
// Run: node --test --experimental-strip-types scripts/test_print_progress.mts   (Node 22.6+; flag not needed on 23.6+)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePrintProgress, verifiedPercent } from '../src/utils/printProgress.ts';

const poll = (over: Record<string, unknown>, prev = { previousProgress: 0, previousSheetsCompleted: 0 }) =>
  calculatePrintProgress({ pages: 1, copies: 1, ...prev, ...over } as Parameters<typeof calculatePrintProgress>[0]);

test('single sheet: 0% while printing, 100% only on completed', () => {
  const p = poll({ status: 'printing', sheetsCompleted: 0, totalSheets: 1 });
  assert.equal(p.progress, 0);
  assert.equal(p.isPrinting, true);
  // even a stray sheetsCompleted == total while still "printing" must not read as done
  assert.equal(poll({ status: 'printing', sheetsCompleted: 1, totalSheets: 1 }).progress, 99);
  const c = poll({ status: 'completed', isPrinted: true, sheetsCompleted: 1, totalSheets: 1 });
  assert.equal(c.progress, 100);
  assert.equal(c.isCompleted, true);
});

test('multi sheet: progress is exactly the verified share, never time-based', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((k) => poll({ status: 'printing', sheetsCompleted: k, totalSheets: 5 }).progress),
    [0, 20, 40, 60, 80]);
  assert.equal(poll({ status: 'printing', sheetsCompleted: 2, totalSheets: 5 }).statusMsg, '2 of 5 sheets printed…');
});

test('monotonic under delayed or out-of-order responses', () => {
  const r = poll({ status: 'printing', sheetsCompleted: 1, totalSheets: 5 }, { previousProgress: 60, previousSheetsCompleted: 3 });
  assert.equal(r.progress, 60);
  assert.equal(r.sheetsCompleted, 3);
});

test('missing / garbage sheet data claims nothing', () => {
  for (const v of [null, undefined, 'abc', -3]) {
    assert.equal(poll({ status: 'printing', sheetsCompleted: v, totalSheets: 4 }).progress, 0);
  }
  // totalSheets missing: falls back to pages x copies (duplex = sheets)
  assert.equal(poll({ status: 'printing', sheetsCompleted: 1, pages: 4, copies: 1, doubleSided: 'double' }).totalSheets, 2);
});

test('paid / unknown status is waiting, not printing, and keeps last verified value', () => {
  const w = poll({ status: 'paid', sheetsCompleted: 0, totalSheets: 2 });
  assert.equal(w.isWaiting, true);
  assert.equal(w.isPrinting, false);
  assert.equal(w.progress, 0);
  assert.equal(poll({}, { previousProgress: 40, previousSheetsCompleted: 2 }).progress, 40);
});

test('failure keeps the verified value and never reaches 100', () => {
  const f = poll({ status: 'failed', printerStatus: 'x' }, { previousProgress: 40, previousSheetsCompleted: 2 });
  assert.equal(f.isFailed, true);
  assert.equal(f.progress, 40);
});

test('verifiedPercent bounds', () => {
  assert.equal(verifiedPercent(0, 0), 0);
  assert.equal(verifiedPercent(20, 21), 95);
  assert.equal(verifiedPercent(50, 3), 99);
});
