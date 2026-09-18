import type { AnalyticsPageData } from '../types/analytics';
import { mockAnalyticsData } from '../mocks/analytics.mock';

export interface IAnalyticsService {
  getAnalytics(): Promise<AnalyticsPageData>;
}

class AnalyticsService implements IAnalyticsService {
  async getAnalytics(): Promise<AnalyticsPageData> {
    await new Promise((res) => setTimeout(res, 80));
    return mockAnalyticsData;
  }
}

export const analyticsService = new AnalyticsService();
