export type PaymentMethodType = 'UPI' | 'Card' | 'Cash' | 'Wallet';

export interface PaymentMethodShare {
  method: PaymentMethodType;
  amount: number;
  percentage: number;
  transactionCount: number;
  color: string;
}

export interface TransactionItem {
  id: string;
  txCode: string;
  jobCode: string;
  kioskName: string;
  amount: number;
  method: PaymentMethodType;
  status: 'completed' | 'pending' | 'failed' | 'refunded';
  timestamp: string;
}

export interface FinanceKPIs {
  totalRevenue: number;
  totalTransactions: number;
  avgOrderValue: number;
  settledAmount: number;
}

export interface FinancePageData {
  kpis: FinanceKPIs;
  paymentMethods: PaymentMethodShare[];
  transactions: TransactionItem[];
}
