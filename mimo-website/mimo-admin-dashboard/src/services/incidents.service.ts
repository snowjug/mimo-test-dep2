import api from '../api';

export class IncidentsService {
  public async getRefundRequests(): Promise<any[]> {
    const res = await api.get('/admin/refund-requests');
    return res.data?.requests || [];
  }

  public async getHardwareAlerts(): Promise<any> {
    const res = await api.get('/admin/hardware');
    return res.data || {};
  }
}

export const incidentsService = new IncidentsService();
