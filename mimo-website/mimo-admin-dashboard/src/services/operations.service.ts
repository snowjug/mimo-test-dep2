import api from '../api';

export interface PrintJobRecord {
  id: string;
  createdAt: string;
  userEmail: string;
  userPhone: string | null;
  file: string;
  status: string;
  cost: number;
  copies: number;
  pageCount: number;
  colorMode: string;
  destination: string;
  orderId: string | null;
  refundStatus: string | null;
  refundAmount?: number | null;
}

export class OperationsService {
  public async getOperations(): Promise<PrintJobRecord[]> {
    const res = await api.get<PrintJobRecord[]>('/admin/recent-prints');
    return Array.isArray(res.data) ? res.data : [];
  }

  public async refundJob(orderId: string, refundAmount: number, note?: string): Promise<{ message: string; refundId: string }> {
    const res = await api.post('/admin/refund', { orderId, refundAmount, note });
    return res.data;
  }
}

export const operationsService = new OperationsService();
