export interface MetricValue {
  raw: number;
  formatted: string;
  trendText?: string;
  trendPositive?: boolean;
  tagLabel?: string;
  subtitle?: string;
}

export interface OverviewKPIs {
  revenueToday: MetricValue;
  paidPages: MetricValue;
  printedPages: MetricValue;
  printSuccess: MetricValue;
  customerValueAtRisk: MetricValue;
}

export interface RevenueTrendPoint {
  date: string;
  displayDate: string;
  revenue: number;
  paidPageVolume: number;
  printedPageVolume: number;
}

export interface FulfillmentStats {
  percentage: number;
  fulfilledPages: number;
  totalPages: number;
  slaTarget: number;
}

export interface AttentionItem {
  id: string;
  title: string;
  severity: 'critical' | 'warning' | 'info' | 'success';
  timeAgo: string;
  description?: string;
}

export interface KioskEntitySummary {
  id: string;
  name: string;
  code: string;
  status: 'Online' | 'Attention' | 'Offline';
  pagesToday: number;
  revenueToday: number;
  successRate: number;
}

export interface LiveOperationSummary {
  id: string;
  jobCode: string;
  fileName: string;
  kioskName: string;
  kioskCode: string;
  pageCount: number;
  fileCount?: number;
  stage: 'Processing' | 'Printing' | 'Merge' | 'Completed' | 'Failed';
  duration: string;
  status: 'ACTIVE' | 'PRINTING' | 'WARNING' | 'QUEUED' | 'COMPLETED' | 'FAILED';
}

export interface IntelligenceInsight {
  id: string;
  text: string;
  iconType: 'trend' | 'award' | 'shield';
}

export interface IncidentsSummaryCount {
  critical: number;
  high: number;
  medium: number;
}

export interface DashboardOverviewData {
  kpis: OverviewKPIs;
  revenueTrends: RevenueTrendPoint[];
  fulfillment: FulfillmentStats;
  needsAttention: AttentionItem[];
  kiosks: KioskEntitySummary[];
  liveOperations: LiveOperationSummary[];
  intelligence: IntelligenceInsight[];
  incidents: IncidentsSummaryCount;
}
