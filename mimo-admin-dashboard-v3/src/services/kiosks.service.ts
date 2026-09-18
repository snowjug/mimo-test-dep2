import type { KiosksPageData, KioskEntityRecord } from '../types/kiosk';
import { mockKiosksData } from '../mocks/kiosks.mock';

export interface IKiosksService {
  getKiosks(): Promise<KiosksPageData>;
  rebootKiosk(id: string): Promise<boolean>;
  refillSupplies(id: string, type: 'ink' | 'paper'): Promise<KioskEntityRecord | null>;
}

class KiosksService implements IKiosksService {
  async getKiosks(): Promise<KiosksPageData> {
    await new Promise((res) => setTimeout(res, 80));
    return mockKiosksData;
  }

  async rebootKiosk(id: string): Promise<boolean> {
    await new Promise((res) => setTimeout(res, 200));
    const k = mockKiosksData.kiosks.find((x) => x.id === id);
    if (k) {
      k.lastSeen = 'Just now';
      return true;
    }
    return false;
  }

  async refillSupplies(id: string, _type: 'ink' | 'paper'): Promise<KioskEntityRecord | null> {
    await new Promise((res) => setTimeout(res, 150));
    const k = mockKiosksData.kiosks.find((x) => x.id === id);
    if (k) {
      return { ...k };
    }
    return null;
  }
}

export const kiosksService = new KiosksService();
