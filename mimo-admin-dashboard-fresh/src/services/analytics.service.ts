import type { AnalyticsPageData } from '../types/analytics.types';
import { mockAnalyticsData } from '../mocks/mockData';

export const analyticsService = {
  async getAnalytics(): Promise<AnalyticsPageData> {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return mockAnalyticsData;
  },
};
