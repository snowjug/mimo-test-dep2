/**
 * Date-range model shared by the admin dashboard and the finance portal.
 *
 * A range is a pair of LOCAL calendar dates (inclusive), e.g. 2026-09-01 .. 2026-09-26. The API receives the
 * instants [local midnight of `from`, local midnight after `to`) plus the browser's UTC offset, so "today",
 * hourly/daily buckets and peak hours all follow the viewer's calendar (IST for the MIMO team).
 */
export type RangePresetId = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';

export interface DateRangeValue {
  preset: RangePresetId;
  /** YYYY-MM-DD, local, inclusive */
  from: string;
  /** YYYY-MM-DD, local, inclusive */
  to: string;
}

export interface ApiRange {
  from: string; // ISO instant (inclusive)
  to: string;   // ISO instant (exclusive)
  tzOffset: number; // minutes ahead of UTC
}

export const PRESETS: { id: RangePresetId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
];

const pad = (n: number) => String(n).padStart(2, '0');
export const toDateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromDateKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d); // local midnight
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function presetRange(preset: Exclude<RangePresetId, 'custom'>, now = new Date()): DateRangeValue {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'yesterday': { const y = addDays(today, -1); return { preset, from: toDateKey(y), to: toDateKey(y) }; }
    case '7d': return { preset, from: toDateKey(addDays(today, -6)), to: toDateKey(today) };
    case '30d': return { preset, from: toDateKey(addDays(today, -29)), to: toDateKey(today) };
    case 'month': return { preset, from: toDateKey(new Date(today.getFullYear(), today.getMonth(), 1)), to: toDateKey(today) };
    default: return { preset: 'today', from: toDateKey(today), to: toDateKey(today) };
  }
}

/** Default everywhere: today only. */
export const defaultRange = (): DateRangeValue => presetRange('today');

/** Re-evaluates a preset against the current clock (so "Today" stays today after midnight). */
export const resolveRange = (v: DateRangeValue, now = new Date()): DateRangeValue =>
  v.preset === 'custom' ? v : presetRange(v.preset, now);

export function toApiRange(v: DateRangeValue): ApiRange {
  const start = fromDateKey(v.from);
  const endExclusive = addDays(fromDateKey(v.to), 1);
  return { from: start.toISOString(), to: endExclusive.toISOString(), tzOffset: -new Date().getTimezoneOffset() };
}

/** True when the range includes today, i.e. numbers can still change and are worth polling. */
export const isLiveRange = (v: DateRangeValue, now = new Date()) => {
  const t = toDateKey(now);
  return v.from <= t && t <= v.to;
};

export const rangeDays = (v: DateRangeValue) =>
  Math.round((fromDateKey(v.to).getTime() - fromDateKey(v.from).getTime()) / 86400000) + 1;

const fmt = (key: string, withYear: boolean) =>
  fromDateKey(key).toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });

export function describeRange(v: DateRangeValue): string {
  if (v.preset === 'today') return 'Today';
  if (v.preset === 'yesterday') return 'Yesterday';
  const sameYear = v.from.slice(0, 4) === new Date().getFullYear().toString() && v.to.slice(0, 4) === v.from.slice(0, 4);
  return v.from === v.to ? fmt(v.from, true) : `${fmt(v.from, !sameYear)} – ${fmt(v.to, true)}`;
}

/** Label for a chart bucket key returned by the API ("YYYY-MM-DD" or "YYYY-MM-DDTHH"). */
export function bucketLabel(key: string): string {
  if (key.includes('T')) {
    const hour = Number(key.slice(11, 13));
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${h12}${hour < 12 ? 'am' : 'pm'}`;
  }
  return fromDateKey(key).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Percentage change vs. the previous period; null when there is nothing to compare against. */
export function pctChange(current: number, previous: number | undefined | null): number | null {
  if (previous === undefined || previous === null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
