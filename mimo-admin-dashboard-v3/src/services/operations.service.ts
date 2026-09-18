import type { OperationsPageData, PrintOperationItem } from '../types/operation';
import { mockOperationsData } from '../mocks/operations.mock';

export interface IOperationsService {
  getOperations(): Promise<OperationsPageData>;
  retryOperation(id: string): Promise<PrintOperationItem | null>;
  cancelOperation(id: string): Promise<boolean>;
}

class OperationsService implements IOperationsService {
  async getOperations(): Promise<OperationsPageData> {
    await new Promise((res) => setTimeout(res, 80));
    return mockOperationsData;
  }

  async retryOperation(id: string): Promise<PrintOperationItem | null> {
    await new Promise((res) => setTimeout(res, 120));
    const op = mockOperationsData.operations.find((o) => o.id === id);
    if (op) {
      op.status = 'active';
      op.stage = 'Processing';
      return { ...op };
    }
    return null;
  }

  async cancelOperation(id: string): Promise<boolean> {
    await new Promise((res) => setTimeout(res, 100));
    const op = mockOperationsData.operations.find((o) => o.id === id);
    if (op) {
      op.status = 'failed';
      op.stage = 'Failed';
      return true;
    }
    return false;
  }
}

export const operationsService = new OperationsService();
