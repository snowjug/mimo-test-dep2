import api from '../api';

export class KiosksService {
  public async getHardware(): Promise<Record<string, any>> {
    const res = await api.get('/admin/hardware');
    return res.data || {};
  }

  public async updateHardware(updates: Record<string, any>): Promise<any> {
    const res = await api.post('/admin/hardware', { updates });
    return res.data;
  }
}

export const kiosksService = new KiosksService();
