import api from '../api';
import type { GuardianKioskDetail, GuardianKioskSummary, GuardianSummaryResponse } from '../types/guardian.types';

/**
 * MIMO Edge Guardian — read-only admin data. Uses the SAME authenticated `api` client every other
 * admin page uses (axios instance in ../api.ts): the admin JWT is attached automatically, and a 401
 * is handled by that client's existing global interceptor exactly like every other admin endpoint —
 * nothing Guardian-specific is added to authentication.
 *
 * There is no write method here on purpose: the backend route is GET-only, and this dashboard page
 * must never issue a kiosk command, change status, or write telemetry (see GuardianPage.tsx).
 */
export const guardian = {
  /** All kiosks that have ever reported (not every provisioned kiosk — the backend only knows
   * about kiosks present in guardian_health_latest). */
  summary: () => api.get<GuardianSummaryResponse>('/admin/guardian/health').then((r) => r.data),

  /** One kiosk, summary shape (no full snapshot). */
  kiosk: (kioskId: string) =>
    api.get<GuardianKioskSummary>('/admin/guardian/health', { params: { kioskId } }).then((r) => r.data),

  /** One kiosk with its full last-accepted snapshot. */
  kioskDetail: (kioskId: string) =>
    api.get<GuardianKioskDetail>('/admin/guardian/health', { params: { kioskId, detail: '1' } }).then((r) => r.data),
};
