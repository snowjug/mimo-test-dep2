/**
 * Festival Configuration for Kiosk UI
 *
 * Defines the date range during which SV-002 operates in Festive Mode (MIMO 2.0 festive theme).
 * Outside of this date window, SV-002 automatically reverts to the Elegant White Lily theme.
 *
 * To test or force modes regardless of current date, use URL query parameters:
 *   ?festive=true   -> Force Festive UI
 *   ?festive=false  -> Force Normal / Elegant White Lily UI
 */

export const FESTIVAL_CONFIG = {
  // Festival start date (inclusive) — YYYY-MM-DD or full ISO 8601 string
  START_DATE: '2026-09-01T00:00:00+05:30',
  // Festival end date (inclusive)
  END_DATE: '2026-09-30T23:59:59+05:30',
  // Name of the festival
  NAME: 'Ganesh Chaturthi',
};

/**
 * Checks whether the festival period is currently active.
 * Allows `?festive=true` or `?festive=false` URL parameters to override for testing.
 */
export function isFestivalActive(now: Date = new Date()): boolean {
  if (typeof window !== 'undefined' && window.location) {
    const params = new URLSearchParams(window.location.search);
    const festiveParam = params.get('festive');
    if (festiveParam === 'true') return true;
    if (festiveParam === 'false') return false;
  }

  const current = now.getTime();
  const start = new Date(FESTIVAL_CONFIG.START_DATE).getTime();
  const end = new Date(FESTIVAL_CONFIG.END_DATE).getTime();

  return current >= start && current <= end;
}
