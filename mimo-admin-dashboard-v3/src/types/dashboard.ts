export interface DashboardKPIs {
  revenueToday: number;
  revenueTrendPercent: number;
  paidPages: number;
  printedPages: number;
  fulfillmentPercent: number;
  printSuccessPercent: number;
  customerValueAtRisk: number;
  unresolvedRiskCount: number;
}

export interface RevenueVolumeDataPoint {
  date: string;
  revenue: number;
  paidPages: number;
  printedPages: number;
}

export interface NeedsAttentionItem {
  id: string;
  title: string;
  subtitle?: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'success';
  timeAgo: string;
  linkUrl?: string;
}

export interface KioskEntitySummary {
  id: string;
  name: string;
  status: 'Online' | 'Offline' | 'Maintenance' | 'Attention';
  pagesToday: number;
  revenueToday: number;
  successRate: number;
  paperLevel?: number;
  printerHealth?: string;
}

export interface LiveOperationRow {
  id: string;
  jobCode: string;
  documentName: string;
  kioskName: string;
  kioskId: string;
  pageCount: number;
  stage: 'Processing' | 'Printing' | 'Merge' | 'Queued' | 'Completed' | 'Failed';
  durationSeconds: number;
  status: 'ACTIVE' | 'PRINTING' | 'WARNING' | 'QUEUED' | 'COMPLETED' | 'FAILED';
  fileCount?: number;
}

export interface MIMOIntelligenceInsight {
  id: string;
  text: string;
  category?: string;
  isPositive?: boolean;
}

export interface IncidentSummaryCount {
  critical: number;
  high: number;
  medium: number;
  low: number;
  totalLast24Hours: number;
}

export type PrintJobStatus = 'received' | 'not_received' | 'failed' | 'processing' | 'refunded';

export interface RecentPrintJob {
  id: string;
  time: string;
  customerName: string;
  kiosk: 'M1' | 'M2' | string;
  isColor?: boolean;
  pages: number;
  isDuplex?: boolean;
  status: PrintJobStatus;
  price: number;
  couponUsed?: boolean;
}

export interface DashboardOverviewData {
  kpis: DashboardKPIs;
  revenueVolumeSeries: RevenueVolumeDataPoint[];
  needsAttention: NeedsAttentionItem[];
  kiosks: KioskEntitySummary[];
  liveOperations: LiveOperationRow[];
  recentJobs?: RecentPrintJob[];
  intelligence: MIMOIntelligenceInsight[];
  incidents: IncidentSummaryCount;
  lastUpdated: string;
}
