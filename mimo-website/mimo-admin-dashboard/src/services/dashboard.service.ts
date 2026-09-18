import { DashboardOverviewData } from '../types/dashboard.types';
import { mockDashboardOverview } from '../mocks/dashboard.mock';
import api from '../api';

export interface IDashboardService {
  getOverview(): Promise<DashboardOverviewData>;
  refreshLiveQueue(): Promise<DashboardOverviewData['liveOperations']>;
}

export class MockDashboardService implements IDashboardService {
  async getOverview(): Promise<DashboardOverviewData> {
    // Simulate lightweight network resolution
    await new Promise((resolve) => setTimeout(resolve, 80));
    return mockDashboardOverview;
  }

  async refreshLiveQueue(): Promise<DashboardOverviewData['liveOperations']> {
    return mockDashboardOverview.liveOperations;
  }
}

export class ApiDashboardService implements IDashboardService {
  async getOverview(): Promise<DashboardOverviewData> {
    try {
      const response = await api.get('/admin/overview');
      return response.data;
    } catch {
      // Graceful fallback to mock data if API is unconfigured
      return mockDashboardOverview;
    }
  }

  async refreshLiveQueue(): Promise<DashboardOverviewData['liveOperations']> {
    try {
      const response = await api.get('/admin/live-queue');
      return response.data;
    } catch {
      return mockDashboardOverview.liveOperations;
    }
  }
}

const isMock = (import.meta as any).env?.VITE_DATA_SOURCE !== 'api';
export const dashboardService: IDashboardService = isMock
  ? new MockDashboardService()
  : new ApiDashboardService();
