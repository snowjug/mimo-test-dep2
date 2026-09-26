import api from '../api';
import { DateRangeValue, toApiRange } from '../lib/dateRange';
import type {
  Analytics,
  IncidentsResponse,
  JobsResponse,
  KiosksResponse,
  TransactionsResponse,
} from '../types/insights.types';

const params = (range: DateRangeValue, extra: Record<string, string | number | undefined> = {}) => {
  const r = toApiRange(range);
  return { from: r.from, to: r.to, tzOffset: r.tzOffset, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined && v !== '')) };
};

/** Live, date-filtered admin data. All endpoints are admin-only and computed on the server from Firestore. */
export const insights = {
  analytics: (range: DateRangeValue, compare = true) =>
    api.get<Analytics>('/admin/analytics', { params: params(range, { compare: compare ? 1 : 0 }) }).then((r) => r.data),

  transactions: (range: DateRangeValue, opts: { status?: string; limit?: number } = {}) =>
    api.get<TransactionsResponse>('/admin/transactions', { params: params(range, opts) }).then((r) => r.data),

  jobs: (range: DateRangeValue, opts: { status?: string; kioskId?: string; limit?: number } = {}) =>
    api.get<JobsResponse>('/admin/jobs', { params: params(range, opts) }).then((r) => r.data),

  kiosks: (range: DateRangeValue) =>
    api.get<KiosksResponse>('/admin/kiosks', { params: params(range) }).then((r) => r.data),

  incidents: (range: DateRangeValue) =>
    api.get<IncidentsResponse>('/admin/incidents', { params: params(range) }).then((r) => r.data),
};
