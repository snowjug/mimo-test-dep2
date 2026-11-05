import api from '../api';
import type {
  GuardianKioskDetail,
  GuardianKioskSummary,
  GuardianSummaryResponse,
  WebsiteHealthResponse,
  KioskOutageStatus,
  KioskOutageUpdate,
} from '../types/guardian.types';

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

  /** Customer website real-time condition, reachability, and client incident health. */
  websiteHealth: (skipProbe = false) =>
    api
      .get<WebsiteHealthResponse>('/admin/guardian/website-health', {
        params: skipProbe ? { skipProbe: '1' } : undefined,
      })
      .then((r) => r.data),

  /** Dispatch alert email regarding customer website condition to visionprintt@gmail.com */
  sendWebsiteAlert: (data?: { problem?: string; location?: string; details?: string }) =>
    api.post<{ success: boolean; recipient: string; outcome?: any }>('/admin/guardian/website-health/alert', data).then((r) => r.data),

  /** Mark active website error incidents as resolved, turning the status button back to green */
  resolveWebsiteIssues: () =>
    api.post<{ success: boolean; message: string }>('/admin/guardian/website-health/resolve').then((r) => r.data),

  /** Get current customer website outage and maintenance popup overrides */
  getOutages: () => api.get<KioskOutageStatus>('/admin/kiosk-outages').then((r) => r.data),

  /** Update outage overrides and notify waiting customers when restored */
  updateOutages: (data: KioskOutageUpdate) =>
    api.post<KioskOutageStatus>('/admin/kiosk-outages', data).then((r) => r.data),
};
