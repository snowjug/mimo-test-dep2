import { KiosksPageData } from '../types/kiosks.types';
import { mockKiosksData } from '../mocks/kiosks.mock';
import api from '../api';

export interface IKiosksService {
  getKiosks(): Promise<KiosksPageData>;
}

export class MockKiosksService implements IKiosksService {
  async getKiosks(): Promise<KiosksPageData> {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return mockKiosksData;
  }
}

export class ApiKiosksService implements IKiosksService {
  async getKiosks(): Promise<KiosksPageData> {
    try {
      const response = await api.get('/admin/kiosks');
      return response.data;
    } catch {
      return mockKiosksData;
    }
  }
}

const isMock = (import.meta as any).env?.VITE_DATA_SOURCE !== 'api';
export const kiosksService: IKiosksService = isMock
  ? new MockKiosksService()
  : new ApiKiosksService();
