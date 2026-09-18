import type { FinancePageData } from '../types/finance.types';
import { mockFinanceData } from '../mocks/mockData';

export const financeService = {
  async getFinance(): Promise<FinancePageData> {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return mockFinanceData;
  },
};
