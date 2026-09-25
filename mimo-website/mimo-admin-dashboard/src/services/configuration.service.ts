import api from '../api';

export class ConfigurationService {
  public async getScreensaver(): Promise<any> {
    const res = await api.get('/admin/screensaver');
    return res.data;
  }

  public async saveScreensaver(data: any): Promise<any> {
    const res = await api.post('/admin/screensaver', data);
    return res.data;
  }
}

export const configurationService = new ConfigurationService();
