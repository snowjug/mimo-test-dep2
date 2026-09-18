export interface MetricValue {
  raw: number;
  formatted: string;
}

export interface OverviewKPIs {
  totalRevenue: MetricValue;
  paidPages: MetricValue;
  printedPages: MetricValue;
  successRate: MetricValue;
  customerValueAtRisk: MetricValue;
}

export interface RevenueTrendPoint {
  date: string;
  revenue: number;
  paidPageVolume: number;
  printedPageVolume: number;
  displayDate: string;
}

export interface FulfillmentStats {
  percentage: number;
  fulfilledPages: number;
  totalPages: number;
  slaTarget: number;
}

export interface NeedsAttentionItem {
  id: string;
  title: string;
  severity: 'critical' | 'warning' | 'info';
  timeAgo: string;
  description?: string;
  type: string;
}

export interface OverviewKioskNode {
  id: string;
  name: string;
  status: 'Online' | 'Attention' | 'Offline' | 'Maintenance';
  pagesToday: number;
  revenueToday: number;
  successRate: number;
}

export interface LiveOperationItem {
  id: string;
  fileName: string;
  kioskName: string;
  pageCount: number;
  duration: string;
  status: 'ACTIVE' | 'PRINTING' | 'QUEUED' | 'WARNING';
}

export interface IntelligenceItem {
  id: string;
  text: string;
  type: 'insight' | 'trend' | 'alert';
}

export interface IncidentSummaryStats {
  critical: number;
  high: number;
  medium: number;
  totalLast24h: number;
}

export interface DashboardOverviewData {
  kpis: OverviewKPIs;
  revenueTrends: RevenueTrendPoint[];
  fulfillment: FulfillmentStats;
  needsAttention: NeedsAttentionItem[];
  kiosks: OverviewKioskNode[];
  liveOperations: LiveOperationItem[];
  intelligence: IntelligenceItem[];
  incidents: IncidentSummaryStats;
}

export type OperationStage = 'All' | 'Processing' | 'Completed' | 'Failed';
