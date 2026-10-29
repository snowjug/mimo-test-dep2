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
  grossCollections?: number;
  netCollections?: number;
  completeness?: 'COMPLETE' | 'PARTIAL_RECORDS_TRUNCATED' | string;
  whatsappAudit?: {
    totalJobs: number;
    confirmedJobs: number;
    estimatedJobCost: number;
    reconciliationStatus: string;
    note: string;
  };
}

export interface SeriesPoint {
  key: string; // "YYYY-MM-DD" or "YYYY-MM-DDTHH" (local)
  start: string;
  revenue: number;
  refunds: number;
  orders: number;
  jobs: number;
  pages: number;
  /** Legacy definition (failed + refunded statuses); kept for the finance portal. */
  failed: number;
  /** Reporting outcome (one per job, see Reporting). Absent on older API responses. */
  successful?: number;
  reportFailed?: number;
  issues?: number;
}

export interface KioskReporting {
  successful: number;
  failed: number;
  /** successful + failed */
  attempts: number;
  failureRate: number | null;
  issues: number;
  /** true once attempts >= Reporting.minAttemptsToRank */
  rankable: boolean;
}

export interface KioskBreakdown {
  kioskId: string;
  name: string;
  type: 'bw' | 'color';
  description: string;
  shortLabel?: string;
  lifecycleStatus?: string;
  jobs: number;
  completed: number;
  failed: number;
  pages: number;
  revenue: number;
  reporting?: KioskReporting;
}

export type IssueCategoryId = 'paper' | 'printer' | 'network' | 'payment' | 'print_failure' | 'timeout' | 'machine_pi' | 'ink_toner' | 'other';
/** exact: the system's own fixed message · inferred: matched from failure text · customer: raised by a customer · unknown: no usable reason */
export type IssueBasis = 'exact' | 'inferred' | 'customer' | 'unknown';
export type IssueSource = 'job_failure' | 'customer_report' | 'refund_request';

export interface IssueCategoryCount { category: IssueCategoryId; label: string; count: number }

/** One consistent set of dashboard KPIs. Every job is in exactly one outcome bucket. */
export interface Reporting {
  jobs: {
    total: number;
    successful: number;
    failed: number;
    /** Refunded without ever printing or failing; not part of the success rate. */
    refundedUnprinted: number;
    inProgress: number;
    abandoned: number;
    unknown: number;
    /** successful / (successful + failed); null when none finished */
    successRate: number | null;
    pages: number;
  };
  revenue: { net: number; gross: number; refunded: number; refundCount: number };
  issues: {
    total: number;
    detected: number;
    customerReported: number;
    payment: number;
    byCategory: IssueCategoryCount[];
    bySource: Record<IssueSource, number>;
    /** Refund requests could not be fully read, so payment issues may be missing. */
    partial: boolean;
  };
  minAttemptsToRank: number;
}

export interface ProblemMachine {
  kioskId: string;
  name: string;
  shortLabel: string | null;
  attempts: number;
  failed: number;
  failureRate: number;
  issues: number;
}

export interface Analytics {
  range: { from: string; to: string; granularity: 'hour' | 'day'; tzOffset: number; dateBasis?: 'created' | 'payment' };
  current: Summary;
  previous: { from: string; to: string; summary: Summary } | null;
  /** Absent on API versions before the Phase 1 reporting upgrade. */
  reporting?: Reporting;
  problemMachines?: ProblemMachine[];
  series: SeriesPoint[];
  byKiosk: KioskBreakdown[];
  unassignedRevenue: number;
  byPaymentMethod: { method: string; amount: number; count: number }[];
  byStatus: { status: string; count: number }[];
  modes: Record<'color' | 'bw' | 'duplex' | 'simplex', { jobs: number; pages: number }>;
  byHour: { hour: number; jobs: number }[];
  truncated: boolean;
  updatedAt: string;
  metadata?: {
    dateBasis: string;
    timezone: string;
    currency: string;
    isTruncated: boolean;
    settlementDataAvailable: boolean;
    settlementNote: string;
    whatsappAudit: {
      status: string;
      note: string;
    };
  };
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
  status: 'PAID' | 'REFUNDED' | 'FAILED' | 'PENDING' | 'INITIATED' | string;
  method: string;
  gatewayRef: string | number | null;
  refundAmount?: number | null;
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
  originalCost?: number;
  discount?: number;
  couponCode?: string | null;
  copies: number;
  pageCount: number;
  totalPages: number;
  sheets?: number;
  colorMode: 'color' | 'bw';
  duplex: boolean;
  destination: string;
  destinationShortLabel?: string | null;
  orderId: string | null;
  printerStatus: string | null;
  refundStatus: string | null;
  refundAmount: number | null;
  userName?: string | null;
  refund?: RefundInfo | null;
  outcome?: JobOutcome;
  printVerified?: boolean;
  sheetsVerified?: number | null;
  timeline?: TimelineStep[];
  customerIssue?: CustomerIssue | null;
}

export type JobOutcome = 'printed' | 'failed' | 'refunded' | 'refund_pending' | 'printing' | 'waiting' | 'abandoned';

export interface RefundInfo {
  state: 'refunded' | 'pending';
  amount: number | null;
  at: string | null;
  source: 'auto' | 'admin' | 'cashfree';
}

export interface TimelineStep {
  key: string;
  label: string;
  at: string;
}

export interface CustomerIssue {
  label: string | null;
  verdict: 'contradicted' | 'unverified' | 'needs_proof' | 'already_failed' | null;
  evidence: string | null;
  reportedAt: string | null;
}

export interface KioskRestart {
  status: 'pending' | 'waiting_idle' | 'rebooting' | 'done' | 'failed' | 'expired' | null;
  message: string | null;
  requestedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
}

export interface KioskCleaning {
  status: 'pending' | 'cleaning' | 'done' | 'failed' | null;
  message: string | null;
  requestedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
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
  paperTracked?: boolean;
  paperRefilledAt?: string | null;
  panelMessage?: string | null;
}

export interface KioskLive {
  kioskId: string;
  name: string;
  type: 'bw' | 'color';
  description: string;
  shortLabel?: string;
  locationId?: string | null;
  locationName?: string | null;
  campusId?: string | null;
  lifecycleStatus?: string;
  liveState?: 'AVAILABLE' | 'BUSY' | 'DEGRADED' | 'OFFLINE' | 'PROVISIONING' | 'MAINTENANCE' | 'DECOMMISSIONED';
  online: boolean;
  lastSeen: string | null;
  secondsSinceSeen: number | null;
  printerStatus: string | null;
  wifiSignalDbm: number | null;
  wifiQualityPct: number | null;
  printers: PrinterInfo[];
  queue: { paid: number; printing: number };
  stats: { jobs: number; completed: number; failed: number; pages: number; revenue: number };
  restart?: KioskRestart | null;
  cleaning?: KioskCleaning | null;
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
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  userPhone?: string | null;
  fileName?: string | null;
  failureReason?: string | null;
  status?: string | null;
  amount?: number | null;
  refundStatus?: string | null;
  refundAmount?: number | null;
  pageCount?: number | null;
  copies?: number | null;
  colorMode?: string | null;
}

export interface IncidentsResponse {
  range: { from: string; to: string };
  counts: { open: number; high: number; medium: number };
  incidents: Incident[];
  updatedAt: string;
}

export interface UserGrowthReport {
  range: { from: string; to: string };
  totalRegisteredUsers: number;
  totalGuestUsers: number;
  activeUsersInRange: number;
  currentMonthNewUsers: number;
  previousMonthNewUsers: number;
  growthPct: number;
  dailyAverageUsers: number;
  conversionRatePct: number;
  averageOrderValue?: number;
  repeatCustomerRatePct?: number;
  paymentsInRange: number;
  monthlyPayments: { month: string; monthKey?: string; total: number }[];
  cohorts?: {
    cohort: string;
    size: number;
    retention: { offset: number; activeCount: number; pct: number }[];
  }[];
  updatedAt: string;
}

export interface FinanceExpenseItem {
  id: string;
  date: string;
  type: 'expense';
  category: string;
  description: string;
  amount: number;
  paidBy: string;
  reference: string;
  year: number;
  monthKey: string;
  monthName: string;
  status: 'approved' | 'draft';
  notes?: string;
}

export interface FinanceJournalItem {
  id: string;
  date: string;
  debitAccount: string | null;
  debitAmount: number | null;
  creditAccount: string | null;
  creditAmount: number | null;
  narration: string | null;
}

export interface FinanceFounderPsr {
  name: string;
  totalInvestment: number;
  netInvestment: number;
  ownershipPct: number;
  profitSharePct: number;
}

export interface FinanceRevenueItem {
  id: string;
  date: string;
  type: 'revenue';
  category: 'revenue';
  description: string;
  amount: number;
  amountSettled: number;
  serviceCharge: number;
  serviceTaxGst: number;
  adjustment: number;
  reference: string;
  orderId: string | null;
  cfOrderId: string | null;
  rawStatus: string;
  settlementStatus: string;
  settlementHealth: string;
  isSettlementConfirmed?: boolean;
  isSettlementPending?: boolean;
  status: 'approved' | 'draft';
  notes?: string;
}

export interface FinanceSheetResponse {
  sheetId?: string;
  sheetUrl?: string;
  expenses: {
    totalExpenses: number | null;
    totalExpenses2026?: number;
    totalExpenses2025?: number;
    count: number;
    items: FinanceExpenseItem[];
    monthlyTotals?: Record<string, number>;
    categoryTotals?: Record<string, number>;
    isAvailable: boolean;
  };
  journal?: {
    count: number;
    items: FinanceJournalItem[];
  };
  psr?: {
    founders: FinanceFounderPsr[];
    totalInvestment: number;
  };
  revenue: {
    totalGrossRevenue: number;
    totalConfirmedSettled: number;
    totalPendingSettlement: number;
    totalSettled: number;
    totalServiceCharges: number;
    totalGst: number;
    totalAdjustments: number;
    count: number;
    items: FinanceRevenueItem[];
    monthlyTotals: Record<string, number>;
    monthlyConfirmedSettled?: Record<string, number>;
    monthlyPendingSettlements?: Record<string, number>;
    isAvailable?: boolean;
    note?: string;
  };
  summary: {
    netPL: number | null;
    isPlAvailable: boolean;
  };
  cached: boolean;
  lastSyncedAt: string;
  syncError?: string | null;
}
export interface IssueRelated {
  type: 'customer_report' | 'refund_request';
  at: string | null;
  label?: string | null;
  verdict?: string | null;
  note?: string | null;
  status?: string | null;
  jobIds?: string[];
  requestId?: string;
}

export interface IssueRow {
  id: string;
  category: IssueCategoryId;
  basis: IssueBasis;
  source: IssueSource;
  severity: 'high' | 'medium' | 'low';
  kioskId: string | null;
  machineName: string | null;
  at: string | null;
  jobId: string | null;
  jobIds: string[];
  orderId: string | null;
  title: string;
  evidence: {
    printerStatus?: string | null;
    printVerified?: boolean;
    sheetsVerified?: number | null;
    verdict?: string | null;
    note?: string | null;
    status?: string | null;
    amount?: number | null;
    reason?: string | null;
  };
  related: IssueRelated[];
}

/** A problem that exists right now; never part of a date range's totals. */
export interface CurrentAlert {
  id: string;
  category: IssueCategoryId;
  basis: IssueBasis;
  severity: 'high' | 'medium' | 'low';
  kioskId: string;
  machineName: string;
  at: string | null;
  title: string;
  evidence: Record<string, unknown>;
}

export interface IssuesResponse {
  range: { from: string; to: string };
  categories: { id: IssueCategoryId; label: string }[];
  total: number;
  truncated: boolean;
  partial: boolean;
  counts: { total: number; byCategory: IssueCategoryCount[]; bySource: Record<IssueSource, number> };
  issues: IssueRow[];
  current: CurrentAlert[];
  updatedAt: string;
}
