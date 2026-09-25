import api from '../api';

export class FinanceService {
  public async getSettings(): Promise<any> {
    const res = await api.get('/admin/settings');
    return res.data;
  }

  public async saveSettings(data: any): Promise<any> {
    const res = await api.post('/admin/settings', data);
    return res.data;
  }

  public async getCoupons(): Promise<any[]> {
    const res = await api.get('/admin/coupons');
    return res.data;
  }

  public async createCoupon(coupon: { code: string; discountPercentage: number; expiryDate?: any }): Promise<any> {
    const res = await api.post('/admin/coupons', coupon);
    return res.data;
  }

  public async deleteCoupon(code: string): Promise<any> {
    const res = await api.delete(`/admin/coupons/${code}`);
    return res.data;
  }
}

export const financeService = new FinanceService();
