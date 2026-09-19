import { AnalyticsPageData } from '../types/analytics.types';
import { mockAnalyticsData } from '../mocks/analytics.mock';
import api from '../api';

export interface IAnalyticsService {
  getAnalytics(): Promise<AnalyticsPageData>;
}

export class MockAnalyticsService implements IAnalyticsService {
  async getAnalytics(): Promise<AnalyticsPageData> {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return mockAnalyticsData;
  }
}

export class ApiAnalyticsService implements IAnalyticsService {
  async getAnalytics(): Promise<AnalyticsPageData> {
    try {
      const response = await api.get('/admin/analytics');
      return response.data;
    } catch {
      return mockAnalyticsData;
    }
  }
}

const isMock = (import.meta as any).env?.VITE_DATA_SOURCE !== 'api';
export const analyticsService: IAnalyticsService = isMock
  ? new MockAnalyticsService()
  : new ApiAnalyticsService();
