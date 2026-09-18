import type { FinancePageData } from '../types/finance';
import { mockFinanceData } from '../mocks/finance.mock';

export interface IFinanceService {
  getFinance(): Promise<FinancePageData>;
}

class FinanceService implements IFinanceService {
  async getFinance(): Promise<FinancePageData> {
    await new Promise((res) => setTimeout(res, 80));
    return mockFinanceData;
  }
}

export const financeService = new FinanceService();
