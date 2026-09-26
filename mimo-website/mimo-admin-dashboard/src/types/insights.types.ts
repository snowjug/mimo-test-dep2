/** Response shapes of the live admin endpoints (see functions/src/controllers/adminInsights.controller.js). */

export interface Summary {
  revenue: number;
  refundedAmount: number;
  netRevenue: number;
  orders: number;
  paidOrders: number;
  freeOrders: number;
  refundCount: number;
  pendingPayments: number;
  pendingAmount: number;
  failedPayments: number;
  avgOrderValue: number;
  jobs: number;
  completedJobs: number;
  failedJobs: number;
  pages: number;
  colorPages: number;
  bwPages: number;
  /** null when no job has finished in the range (never an invented number) */
  successRate: number | null;
  newUsers: number;
}

export interface SeriesPoint {
  key: string; // "YYYY-MM-DD" or "YYYY-MM-DDTHH" (local)
  start: string;
  revenue: number;
  refunds: number;
  orders: number;
  jobs: number;
  pages: number;
  failed: number;
}

export interface KioskBreakdown {
  kioskId: string;
  name: string;
  type: 'bw' | 'color';
  description: string;
  jobs: number;
  completed: number;
  failed: number;
  pages: number;
  revenue: number;
}

export interface Analytics {
  range: { from: string; to: string; granularity: 'hour' | 'day'; tzOffset: number };
  current: Summary;
  previous: { from: string; to: string; summary: Summary } | null;
  series: SeriesPoint[];
  byKiosk: KioskBreakdown[];
  unassignedRevenue: number;
  byPaymentMethod: { method: string; amount: number; count: number }[];
  byStatus: { status: string; count: number }[];
  modes: Record<'color' | 'bw' | 'duplex' | 'simplex', { jobs: number; pages: number }>;
  byHour: { hour: number; jobs: number }[];
  truncated: boolean;
  updatedAt: string;
}

export interface TransactionRow {
  id: string;
  orderId: string;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  amount: number;
  gross: number;
  discount: number;
  couponCode: string | null;
  coinsUsed: number;
  status: 'PAID' | 'REFUNDED' | 'FAILED' | 'PENDING' | 'INITIATED' | string;
  method: string;
  gatewayRef: string | number | null;
  kioskId: string | null;
  pages: number;
  createdAt: string | null;
  paidAt: string | null;
  refundedAt: string | null;
}

export interface TransactionsResponse {
  range: { from: string; to: string };
  total: number;
  truncated: boolean;
  transactions: TransactionRow[];
  updatedAt: string;
}

export interface JobRow {
  id: string;
  createdAt: string | null;
  userEmail: string;
  userPhone: string | null;
  file: string;
  status: string;
  cost: number;
  copies: number;
  pageCount: number;
  totalPages: number;
  colorMode: 'color' | 'bw';
  duplex: boolean;
  destination: string;
  orderId: string | null;
  printerStatus: string | null;
  refundStatus: string | null;
  refundAmount: number | null;
}

export interface JobsResponse {
  range: { from: string; to: string };
  total: number;
  truncated: boolean;
  jobs: JobRow[];
  updatedAt: string;
}

export interface PrinterInfo {
  key: string;
  type: 'bw' | 'color';
  status: string | null;
  paperLevel: number | null;
  paperCapacity: number;
  paperPct: number | null;
  tonerLevel: number | null;
  inkLevel: number | null;
}

export interface KioskLive {
  kioskId: string;
  name: string;
  type: 'bw' | 'color';
  description: string;
  online: boolean;
  lastSeen: string | null;
  secondsSinceSeen: number | null;
  printerStatus: string | null;
  printers: PrinterInfo[];
  queue: { paid: number; printing: number };
  stats: { jobs: number; completed: number; failed: number; pages: number; revenue: number };
}

export interface KiosksResponse {
  range: { from: string; to: string };
  summary: { total: number; online: number; offline: number };
  kiosks: KioskLive[];
  updatedAt: string;
}

export interface Incident {
  id: string;
  type: 'kiosk_offline' | 'paper_low' | 'supply_low' | 'print_failed' | 'refund_request';
  severity: 'high' | 'medium' | 'low';
  kioskId: string | null;
  title: string;
  detail: string;
  at: string | null;
  tab: string;
  jobId?: string;
  orderId?: string | null;
  refundStatus?: string | null;
}

export interface IncidentsResponse {
  range: { from: string; to: string };
  counts: { open: number; high: number; medium: number };
  incidents: Incident[];
  updatedAt: string;
}
