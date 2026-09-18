import type { DashboardOverviewData } from '../types/dashboard';
import { mockDashboardData } from '../mocks/dashboard.mock';

export interface IDashboardService {
  getDashboardOverview(): Promise<DashboardOverviewData>;
}

class DashboardService implements IDashboardService {
  async getDashboardOverview(): Promise<DashboardOverviewData> {
    // Simulated network latency for realism
    await new Promise((res) => setTimeout(res, 80));
    return mockDashboardData;
  }
}

export const dashboardService = new DashboardService();
