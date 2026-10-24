/**
 * The print this kiosk has started and not yet finished, kept in localStorage so it survives a page reload.
 *
 * The tablet's WebView can reload the kiosk mid-print (Activity recreation or renderer restart in the Android shell),
 * which used to drop the customer on the home screen while their pages were still coming out. On load, App resumes
 * the printing screen for this job; the backend job status then decides completion or failure as usual.
 * Written only after /kiosk/print accepted the job; removed on completion, failure and reset.
 */

export interface ActivePrintJob {
  userName: string;
  fileName: string;
  pages: number;
  copies: number;
  mode: string;
}

export interface ActivePrint {
  code: string;
  kioskId: string;
  job: ActivePrintJob;
  startedAt: number;
}

const KEY = 'mimo.activePrint';
// Older than this, the job has long been settled (the Pi and backend time out well before), so never resume it.
export const MAX_RESUME_AGE_MS = 30 * 60 * 1000;

export function saveActivePrint(print: ActivePrint, storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(KEY, JSON.stringify(print));
  } catch {
    // storage unavailable: the print still works, it just cannot be resumed after a reload
  }
}

export function clearActivePrint(storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function loadActivePrint(
  kioskId: string | undefined | null,
  now = Date.now(),
  storage: Storage | undefined = globalThis.localStorage
): ActivePrint | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<ActivePrint>;
    const valid =
      typeof p.code === 'string' && /^\d{4}$/.test(p.code) &&
      p.kioskId === kioskId && !!kioskId &&
      typeof p.startedAt === 'number' && now - p.startedAt >= 0 && now - p.startedAt < MAX_RESUME_AGE_MS &&
      !!p.job && typeof p.job === 'object';
    if (!valid) {
      storage?.removeItem(KEY);
      return null;
    }
    return p as ActivePrint;
  } catch {
    clearActivePrint(storage);
    return null;
  }
}
