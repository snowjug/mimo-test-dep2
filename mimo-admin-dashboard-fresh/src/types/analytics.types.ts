import type { RevenueTrendPoint } from './dashboard.types';

export interface KioskPerformanceItem {
  kioskName: string;
  pages: number;
  revenue: number;
  successRate: number;
}

export interface CategoryBreakdownItem {
  category: string;
  pages: number;
  percentage: number;
  color: string;
}

export interface AnalyticsKPIs {
  totalRevenue: number;
  paidPages: number;
  printedPages: number;
  fulfillmentRate: number;
}

export interface AnalyticsPageData {
  kpis: AnalyticsKPIs;
  revenueTrends: RevenueTrendPoint[];
  kioskPerformance: KioskPerformanceItem[];
  categoryBreakdown: CategoryBreakdownItem[];
}
