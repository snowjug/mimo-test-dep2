const IN = 'en-IN';
/** ₹1,23,456.50 — whole rupees when there are no paise. */
export const inr = (n: number | null | undefined) => {
  const v = Number(n) || 0;
  return `₹${v.toLocaleString(IN, { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`;
};
export const int = (n: number | null | undefined) => (Number(n) || 0).toLocaleString(IN);
export const pct = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? '—' : `${n.toFixed(digits)}%`);
export const timeAgo = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/** Firestore timestamps arrive from the API as ISO strings or {_seconds,_nanoseconds}. */
export const tsToIso = (v: unknown): string | null => {
  if (!v) return null;
  if (typeof v === 'string') return v;
  const o = v as { _seconds?: number; seconds?: number };
  const s = o._seconds ?? o.seconds;
  return typeof s === 'number' ? new Date(s * 1000).toISOString() : null;
};

/** 14:03:27 — seconds matter when tracing a print. */
export const clockTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
/** 45s · 2m 05s · 1h 12m */
export const duration = (ms: number | null | undefined) => {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
};
