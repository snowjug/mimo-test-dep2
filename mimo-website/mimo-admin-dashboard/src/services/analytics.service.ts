import api from '../api';

export class AnalyticsService {
  public async getAnalyticsData(): Promise<{ metrics: any; recentPrints: any[] }> {
    const [mRes, pRes] = await Promise.all([
      api.get('/admin/metrics').catch(() => ({ data: {} })),
      api.get('/admin/recent-prints').catch(() => ({ data: [] })),
    ]);
    return {
      metrics: mRes.data || {},
      recentPrints: Array.isArray(pRes.data) ? pRes.data : [],
    };
  }
}

export const analyticsService = new AnalyticsService();
