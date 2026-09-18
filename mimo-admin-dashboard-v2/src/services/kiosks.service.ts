import type { KiosksPageData } from '../types/kiosks.types';
import { mockKiosksData } from '../mocks/mockData';

export const kiosksService = {
  async getKiosks(): Promise<KiosksPageData> {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return mockKiosksData;
  },
};
