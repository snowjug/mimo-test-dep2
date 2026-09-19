import { ConfigurationPageData } from '../types/configuration.types';
import { mockConfigurationData } from '../mocks/configuration.mock';
import api from '../api';

export interface IConfigurationService {
  getConfiguration(): Promise<ConfigurationPageData>;
  saveConfiguration(data: Partial<ConfigurationPageData>): Promise<boolean>;
}

export class MockConfigurationService implements IConfigurationService {
  private data: ConfigurationPageData = { ...mockConfigurationData };

  async getConfiguration(): Promise<ConfigurationPageData> {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return this.data;
  }

  async saveConfiguration(data: Partial<ConfigurationPageData>): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    this.data = {
      ...this.data,
      ...data,
    };
    return true;
  }
}

export class ApiConfigurationService implements IConfigurationService {
  async getConfiguration(): Promise<ConfigurationPageData> {
    try {
      const response = await api.get('/admin/configuration');
      return response.data;
    } catch {
      return mockConfigurationData;
    }
  }

  async saveConfiguration(data: Partial<ConfigurationPageData>): Promise<boolean> {
    try {
      await api.post('/admin/configuration', data);
      return true;
    } catch {
      return false;
    }
  }
}

const isMock = (import.meta as any).env?.VITE_DATA_SOURCE !== 'api';
export const configurationService: IConfigurationService = isMock
  ? new MockConfigurationService()
  : new ApiConfigurationService();
