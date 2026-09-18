export type PaymentMethod = 'UPI' | 'Card' | 'Cash' | 'Wallet';
export type TransactionStatus = 'Success' | 'Pending' | 'Failed' | 'Refunded';

export interface FinanceKPIs {
  totalRevenue: number;
  totalTransactions: number;
  avgOrderValue: number;
  pendingSettlement: number;
  settledAmount: number;
  refundsProcessed: number;
}

export interface PaymentBreakdown {
  method: PaymentMethod;
  amount: number;
  percentage: number;
  transactionCount: number;
  color: string;
}

export interface TransactionRecord {
  id: string;
  txCode: string;
  jobCode: string;
  kioskName: string;
  amount: number;
  method: PaymentMethod;
  status: TransactionStatus;
  customerPhone?: string;
  timestamp: string;
}

export interface FinancePageData {
  kpis: FinanceKPIs;
  paymentMethods: PaymentBreakdown[];
  transactions: TransactionRecord[];
}
