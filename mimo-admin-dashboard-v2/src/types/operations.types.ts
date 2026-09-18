export interface OperationJobItem {
  id: string;
  jobCode: string;
  fileName: string;
  userEmail: string;
  kioskName: string;
  kioskCode: string;
  pageCount: number;
  fileCount: number;
  stage: 'Processing' | 'Completed' | 'Failed' | 'Queued' | 'Printing';
  status: 'active' | 'printing' | 'completed' | 'failed' | 'queued';
  duration: string;
  timestamp: string;
  cost: number;
}

export interface OperationsKPIs {
  totalJobs: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface KioskFilterItem {
  id: string;
  name: string;
  code: string;
}

export interface OperationsPageData {
  kpis: OperationsKPIs;
  jobs: OperationJobItem[];
  kiosksList: KioskFilterItem[];
}
