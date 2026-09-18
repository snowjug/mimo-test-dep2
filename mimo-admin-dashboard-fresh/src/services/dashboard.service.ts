import type { DashboardOverviewData } from '../types/dashboard.types';
import { mockOverviewData } from '../mocks/mockData';

export const dashboardService = {
  async getOverview(): Promise<DashboardOverviewData> {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return mockOverviewData;
  },
};
