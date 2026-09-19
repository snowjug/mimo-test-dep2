import { FinancePageData } from '../types/finance.types';
import { mockFinanceData } from '../mocks/finance.mock';
import api from '../api';

export interface IFinanceService {
  getFinance(): Promise<FinancePageData>;
}

export class MockFinanceService implements IFinanceService {
  async getFinance(): Promise<FinancePageData> {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return mockFinanceData;
  }
}

export class ApiFinanceService implements IFinanceService {
  async getFinance(): Promise<FinancePageData> {
    try {
      const response = await api.get('/admin/finance');
      return response.data;
    } catch {
      return mockFinanceData;
    }
  }
}

const isMock = (import.meta as any).env?.VITE_DATA_SOURCE !== 'api';
export const financeService: IFinanceService = isMock
  ? new MockFinanceService()
  : new ApiFinanceService();
