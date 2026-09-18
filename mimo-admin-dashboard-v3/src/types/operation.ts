export type OperationStatus = 'active' | 'printing' | 'warning' | 'queued' | 'completed' | 'failed';
export type OperationStage = 'Processing' | 'Printing' | 'Merge' | 'Spooling' | 'Queued' | 'Completed' | 'Failed';

export interface PrintOperationItem {
  id: string;
  jobCode: string;
  documentName: string;
  fileSizeMb: number;
  pages: number;
  color: boolean;
  kioskId: string;
  kioskName: string;
  stage: OperationStage;
  status: OperationStatus;
  durationSeconds: number;
  submittedAt: string;
  paymentMethod: 'UPI' | 'Card' | 'Cash' | 'Wallet';
  amount: number;
}

export interface OperationsKPIs {
  totalJobs: number;
  inQueue: number;
  completed: number;
  actionNeeded: number;
  pendingRefunds: number;
}

export interface OperationsPageData {
  kpis: OperationsKPIs;
  operations: PrintOperationItem[];
}
