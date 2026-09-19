import { RevenueTrendPoint } from './dashboard.types';

export interface CategoryDistribution {
  category: string;
  pages: number;
  percentage: number;
  color: string;
}

export interface FunnelStage {
  stage: string;
  count: number;
  percentage: number;
  subtext: string;
}

export interface AnalyticsKPIs {
  totalRevenue: number;
  paidPages: number;
  printedPages: number;
  fulfillmentRate: number;
  avgPagesPerJob: number;
  activeUsers: number;
}

export interface AnalyticsPageData {
  kpis: AnalyticsKPIs;
  revenueTrends: RevenueTrendPoint[];
  categoryBreakdown: CategoryDistribution[];
  funnel: FunnelStage[];
  kioskPerformance: {
    kioskName: string;
    revenue: number;
    pages: number;
    successRate: number;
  }[];
}
