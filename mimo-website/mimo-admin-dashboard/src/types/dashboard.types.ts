export interface DashboardKPIs {
  totalRevenue: {
    amount: number;
    formatted: string;
    subtext: string;
    trendPercentage: number;
    trendLabel: string;
    isLive?: boolean;
  };
  paidPages: {
    count: number;
    formatted: string;
    subtext: string;
    trendPercentage: number;
    trendLabel: string;
  };
  printedPages: {
    count: number;
    formatted: string;
    lifetimeFormatted: string;
    subtext: string;
  };
  successRate: {
    rate: number;
    formatted: string;
    subtext: string;
    targetText: string;
  };
  customerValueAtRisk: {
    amount: number;
    formatted: string;
    subtext: string;
    badgeText: string;
    hasAlert: boolean;
  };
  kioskNetworkStatus: {
    onlineCount: number;
    totalCount: number;
    formatted: string;
    subtext: string;
  };
  activePrintQueue: {
    jobCount: number;
    formatted: string;
    subtext: string;
  };
}

export interface RevenueTrendPoint {
  date: string;
  displayDate: string;
  revenue: number;
  paidPageVolume: number;
  printedPageVolume: number;
}

export interface FulfillmentStats {
  fulfilledPages: number;
  totalPages: number;
  percentage: number;
  slaText: string;
}

export type AttentionSeverity = 'critical' | 'warning' | 'info' | 'success';

export interface NeedsAttentionItem {
  id: string;
  title: string;
  description?: string;
  timeAgo: string;
  severity: AttentionSeverity;
}

export interface KioskSummary {
  id: string;
  name: string;
  code: string;
  status: 'Online' | 'Offline' | 'Attention' | 'Maintenance';
  pagesToday: number;
  revenueToday: number;
  successRate: number;
  paperLevel?: number;
  printerHealth?: string;
}

export type OperationStage = 'Processing' | 'Printing' | 'Merge' | 'Queued' | 'Completed';
export type OperationStatus = 'ACTIVE' | 'PRINTING' | 'WARNING' | 'QUEUED' | 'COMPLETED';

export interface LiveOperationItem {
  id: string;
  jobCode: string;
  fileName: string;
  kioskName: string;
  kioskCode: string;
  fileCount: number;
  pageCount: number;
  maxPageRef?: number;
  stage: OperationStage;
  duration: string;
  status: OperationStatus;
}

export interface MIMOIntelligenceInsight {
  id: string;
  text: string;
  category?: 'volume' | 'revenue' | 'diagnostics' | 'security';
}

export interface IncidentsSummary {
  critical: number;
  high: number;
  medium: number;
  timeframeLabel: string;
}

export interface DashboardOverviewData {
  kpis: DashboardKPIs;
  revenueTrends: RevenueTrendPoint[];
  fulfillment: FulfillmentStats;
  needsAttention: NeedsAttentionItem[];
  kiosks: KioskSummary[];
  liveOperations: LiveOperationItem[];
  intelligence: MIMOIntelligenceInsight[];
  incidents: IncidentsSummary;
  lastUpdatedText: string;
}
