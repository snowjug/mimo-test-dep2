export interface PaymentMethodSummary {
  method: 'UPI' | 'Card' | 'Cash' | 'Wallet';
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
  method: 'UPI' | 'Card' | 'Cash' | 'Wallet';
  status: 'completed' | 'pending' | 'refunded' | 'failed';
  timestamp: string;
}

export interface FinanceKPIs {
  totalRevenue: number;
  totalTransactions: number;
  avgOrderValue: number;
  pendingSettlement: number;
  settledAmount: number;
}

export interface FinancePageData {
  kpis: FinanceKPIs;
  paymentMethods: PaymentMethodSummary[];
  transactions: TransactionRecord[];
}
