// Unit tests for src/utils/activePrint.ts (resuming a print after the kiosk page reloads).
// Run: node --test --experimental-strip-types scripts/test_active_print.mts   (Node 22.6+; flag not needed on 23.6+)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveActivePrint, loadActivePrint, clearActivePrint, markActivePrintCompleted, MAX_RESUME_AGE_MS, SUMMARY_RESUME_MS }
  from '../src/utils/activePrint.ts';

class MemoryStorage {
  data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(k: string) { return this.data.has(k) ? this.data.get(k)! : null; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  removeItem(k: string) { this.data.delete(k); }
  setItem(k: string, v: string) { this.data.set(k, String(v)); }
}

const job = { userName: 'Asha', fileName: 'report.pdf', pages: 21, copies: 1, mode: 'Black & White' };
const T0 = 1_800_000_000_000;

test('a print saved before a reload is resumed on the same kiosk', () => {
  const s = new MemoryStorage() as unknown as Storage;
  saveActivePrint({ code: '4821', kioskId: 'CV-001', job, startedAt: T0 }, s);
  assert.deepEqual(loadActivePrint('CV-001', T0 + 50_000, s), { code: '4821', kioskId: 'CV-001', job, startedAt: T0 });
});

test('never resumed on another kiosk, and the stale entry is dropped', () => {
  const s = new MemoryStorage() as unknown as Storage;
  saveActivePrint({ code: '4821', kioskId: 'CV-001', job, startedAt: T0 }, s);
  assert.equal(loadActivePrint('SV-002', T0 + 1000, s), null);
  assert.equal(loadActivePrint('CV-001', T0 + 1000, s), null, 'removed after the mismatch');
});

test('too old to matter: not resumed', () => {
  const s = new MemoryStorage() as unknown as Storage;
  saveActivePrint({ code: '4821', kioskId: 'CV-001', job, startedAt: T0 }, s);
  assert.equal(loadActivePrint('CV-001', T0 + MAX_RESUME_AGE_MS, s), null);
});

test('cleared on completion / failure / reset: nothing to resume', () => {
  const s = new MemoryStorage() as unknown as Storage;
  saveActivePrint({ code: '4821', kioskId: 'CV-001', job, startedAt: T0 }, s);
  clearActivePrint(s);
  assert.equal(loadActivePrint('CV-001', T0 + 1000, s), null);
});

test('malformed or tampered entries are ignored', () => {
  const s = new MemoryStorage() as unknown as Storage;
  for (const raw of ['{', '"x"', JSON.stringify({ code: '12', kioskId: 'CV-001', job, startedAt: T0 }),
    JSON.stringify({ code: '4821', kioskId: 'CV-001', startedAt: T0 }),
    JSON.stringify({ code: '4821', kioskId: 'CV-001', job, startedAt: T0 + 10_000 })]) {
    s.setItem('mimo.activePrint', raw);
    assert.equal(loadActivePrint('CV-001', T0, s), null, raw);
  }
});

test('no kiosk id or no storage: never resumes, never throws', () => {
  const s = new MemoryStorage() as unknown as Storage;
  saveActivePrint({ code: '4821', kioskId: 'CV-001', job, startedAt: T0 }, s);
  assert.equal(loadActivePrint(undefined, T0, s), null);
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); } } as unknown as Storage;
  assert.doesNotThrow(() => saveActivePrint({ code: '4821', kioskId: 'CV-001', job, startedAt: T0 }, broken));
  assert.equal(loadActivePrint('CV-001', T0, broken), null);
});

test('completed print: a reload within the summary lifetime reopens the summary, later it does not', () => {
  const s = new MemoryStorage() as unknown as Storage;
  saveActivePrint({ code: '4821', kioskId: 'CV-001', job, startedAt: T0 }, s);
  markActivePrintCompleted(T0 + 40_000, s);
  assert.equal(loadActivePrint('CV-001', T0 + 45_000, s)?.completedAt, T0 + 40_000);
  assert.equal(loadActivePrint('CV-001', T0 + 40_000 + SUMMARY_RESUME_MS, s), null);
});

test('marking completed without a saved print is a no-op', () => {
  const s = new MemoryStorage() as unknown as Storage;
  markActivePrintCompleted(T0, s);
  assert.equal(loadActivePrint('CV-001', T0, s), null);
});
