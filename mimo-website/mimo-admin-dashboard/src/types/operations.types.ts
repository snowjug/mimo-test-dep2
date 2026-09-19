import { OperationStage, OperationStatus, LiveOperationItem } from './dashboard.types';

export interface OperationsKPIs {
  totalJobs: number;
  processing: number;
  completed: number;
  failed: number;
  avgDurationSec: number;
}

export interface OperationsFilterOptions {
  kioskId?: string;
  stage?: OperationStage | 'All';
  status?: OperationStatus | 'All';
  searchQuery?: string;
}

export interface OperationsPageData {
  kpis: OperationsKPIs;
  jobs: LiveOperationItem[];
  kiosksList: { id: string; name: string }[];
}
