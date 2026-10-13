/**
 * Date-range model shared by the admin dashboard and the finance portal.
 *
 * A range is a pair of calendar dates (inclusive) in MIMO's operational timezone, Asia/Kolkata, e.g.
 * 2026-09-01 .. 2026-09-26. The API receives the instants [IST midnight of `from`, IST midnight after `to`) plus
 * tzOffset=330, so "today", hourly/daily buckets and peak hours follow the kiosks' calendar whatever timezone the
 * viewer's browser is set to. India has no daylight saving, so the offset is a constant.
 */
export type RangePresetId = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';

export interface DateRangeValue {
  preset: RangePresetId;
  /** YYYY-MM-DD, Asia/Kolkata, inclusive */
  from: string;
  /** YYYY-MM-DD, Asia/Kolkata, inclusive */
  to: string;
}

export interface ApiRange {
  from: string; // ISO instant (inclusive)
  to: string;   // ISO instant (exclusive)
  tzOffset: number; // minutes ahead of UTC
}

export const OPERATIONAL_TIME_ZONE = 'Asia/Kolkata';
/** Minutes ahead of UTC for Asia/Kolkata (UTC+05:30, no daylight saving). */
export const OPERATIONAL_TZ_OFFSET = 330;
const OFFSET_MS = OPERATIONAL_TZ_OFFSET * 60000;
const DAY_MS = 86400000;

export const PRESETS: { id: RangePresetId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const keyOfUtcDate = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const keyParts = (key: string) => key.split('-').map(Number) as [number, number, number];
/** The calendar date as a UTC-midnight instant: plain date arithmetic, independent of any timezone. */
const keyToUtc = (key: string) => { const [y, m, d] = keyParts(key); return Date.UTC(y, m - 1, d); };

/** The Asia/Kolkata calendar date of an instant, as YYYY-MM-DD. */
export const toDateKey = (d: Date) => keyOfUtcDate(new Date(d.getTime() + OFFSET_MS));
const addDaysKey = (key: string, n: number) => keyOfUtcDate(new Date(keyToUtc(key) + n * DAY_MS));
/** IST midnight at the start of a date key, as an instant. */
const istMidnight = (key: string) => new Date(keyToUtc(key) - OFFSET_MS);

export function presetRange(preset: Exclude<RangePresetId, 'custom'>, now = new Date()): DateRangeValue {
  const today = toDateKey(now);
  switch (preset) {
    case 'yesterday': { const y = addDaysKey(today, -1); return { preset, from: y, to: y }; }
    case '7d': return { preset, from: addDaysKey(today, -6), to: today };
    case '30d': return { preset, from: addDaysKey(today, -29), to: today };
    case 'month': return { preset, from: `${today.slice(0, 8)}01`, to: today };
    default: return { preset: 'today', from: today, to: today };
  }
}

/** Default everywhere: today only. */
export const defaultRange = (): DateRangeValue => presetRange('today');

/** Re-evaluates a preset against the current clock (so "Today" stays today after IST midnight). */
export const resolveRange = (v: DateRangeValue, now = new Date()): DateRangeValue =>
  v.preset === 'custom' ? v : presetRange(v.preset, now);

export function toApiRange(v: DateRangeValue): ApiRange {
  return { from: istMidnight(v.from).toISOString(), to: istMidnight(addDaysKey(v.to, 1)).toISOString(), tzOffset: OPERATIONAL_TZ_OFFSET };
}

/** True when the range includes today (IST), i.e. numbers can still change and are worth polling. */
export const isLiveRange = (v: DateRangeValue, now = new Date()) => {
  const t = toDateKey(now);
  return v.from <= t && t <= v.to;
};

export const rangeDays = (v: DateRangeValue) => Math.round((keyToUtc(v.to) - keyToUtc(v.from)) / DAY_MS) + 1;

/** Formats a date key as that calendar date (not shifted by the browser's timezone). */
const fmt = (key: string, withYear: boolean) =>
  new Date(keyToUtc(key)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC', ...(withYear ? { year: 'numeric' } : {}) });

export function describeRange(v: DateRangeValue): string {
  if (v.preset === 'today') return 'Today';
  if (v.preset === 'yesterday') return 'Yesterday';
  const sameYear = v.from.slice(0, 4) === toDateKey(new Date()).slice(0, 4) && v.to.slice(0, 4) === v.from.slice(0, 4);
  return v.from === v.to ? fmt(v.from, true) : `${fmt(v.from, !sameYear)} – ${fmt(v.to, true)}`;
}

/** Label for a chart bucket key returned by the API ("YYYY-MM-DD" or "YYYY-MM-DDTHH", both IST). */
export function bucketLabel(key: string): string {
  if (key.includes('T')) {
    const hour = Number(key.slice(11, 13));
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${h12}${hour < 12 ? 'am' : 'pm'}`;
  }
  return fmt(key, false);
}

/** Percentage change vs. the previous period; null when there is nothing to compare against. */
export function pctChange(current: number, previous: number | undefined | null): number | null {
  if (previous === undefined || previous === null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
