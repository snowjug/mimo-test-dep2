import type { OperationsPageData, OperationJobItem } from '../types/operations.types';
import { mockOperationsData } from '../mocks/mockData';

export const operationsService = {
  async getOperations(): Promise<OperationsPageData> {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return mockOperationsData;
  },

  async retryJob(_jobId: string): Promise<{ success: boolean; job: OperationJobItem }> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return {
      success: true,
      job: mockOperationsData.jobs[0],
    };
  },
};
