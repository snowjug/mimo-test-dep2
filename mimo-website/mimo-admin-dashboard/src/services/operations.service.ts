import { OperationsPageData, OperationsFilterOptions } from '../types/operations.types';
import { mockOperationsData } from '../mocks/operations.mock';
import api from '../api';

export interface IOperationsService {
  getOperations(filters?: OperationsFilterOptions): Promise<OperationsPageData>;
}

export class MockOperationsService implements IOperationsService {
  async getOperations(filters?: OperationsFilterOptions): Promise<OperationsPageData> {
    await new Promise((resolve) => setTimeout(resolve, 80));
    let jobs = [...mockOperationsData.jobs];
    if (filters?.kioskId && filters.kioskId !== 'all') {
      jobs = jobs.filter((j) => j.kioskCode === filters.kioskId);
    }
    if (filters?.stage && filters.stage !== 'All') {
      jobs = jobs.filter((j) => j.stage === filters.stage);
    }
    if (filters?.status && filters.status !== 'All') {
      jobs = jobs.filter((j) => j.status === filters.status);
    }
    if (filters?.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      jobs = jobs.filter((j) => j.fileName.toLowerCase().includes(q) || j.jobCode.toLowerCase().includes(q));
    }
    return {
      ...mockOperationsData,
      jobs,
    };
  }
}

export class ApiOperationsService implements IOperationsService {
  async getOperations(filters?: OperationsFilterOptions): Promise<OperationsPageData> {
    try {
      const response = await api.get('/admin/operations', { params: filters });
      return response.data;
    } catch {
      return mockOperationsData;
    }
  }
}

const isMock = (import.meta as any).env?.VITE_DATA_SOURCE !== 'api';
export const operationsService: IOperationsService = isMock
  ? new MockOperationsService()
  : new ApiOperationsService();
