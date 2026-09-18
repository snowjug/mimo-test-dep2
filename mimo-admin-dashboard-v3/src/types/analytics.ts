export interface AnalyticsKPIs {
  totalRevenue: number;
  revenueTrend: number;
  totalPaidPages: number;
  paidPagesTrend: number;
  printedPages: number;
  printedPagesTrend: number;
  printSuccessRate: number;
  successRateTrend: number;
  uniqueCustomers: number;
  customersTrend: number;
}

export interface RevenuePageVolumePoint {
  date: string;
  revenue: number;
  paidPages: number;
  printedPages: number;
}

export interface FunnelTier {
  stage: string;
  count: number;
  percentage: number;
}

export interface CategoryDistribution {
  category: string;
  percentage: number;
  color: string;
}

export interface KioskPerformanceRow {
  name: string;
  pages: number;
  revenue: number;
  successRate: number;
  activeHours: number;
  trend: number;
}

export interface DocumentTypeRow {
  rank: number;
  documentType: string;
  pages: number;
  percentage: number;
  iconType: string;
}

export interface TrendInsightItem {
  id: string;
  text: string;
  icon: string;
}

export interface AnalyticsPageData {
  kpis: AnalyticsKPIs;
  revenueVolumeSeries: RevenuePageVolumePoint[];
  funnel: FunnelTier[];
  categories: CategoryDistribution[];
  kioskPerformance: KioskPerformanceRow[];
  topDocuments: DocumentTypeRow[];
  insights: TrendInsightItem[];
}
