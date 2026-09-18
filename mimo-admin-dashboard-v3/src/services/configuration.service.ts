import type { ConfigurationPageData } from '../types/configuration';
import { mockConfigurationData } from '../mocks/configuration.mock';

export interface IConfigurationService {
  getConfiguration(): Promise<ConfigurationPageData>;
  saveConfiguration(updated: Partial<ConfigurationPageData>): Promise<ConfigurationPageData>;
}

class ConfigurationService implements IConfigurationService {
  async getConfiguration(): Promise<ConfigurationPageData> {
    await new Promise((res) => setTimeout(res, 80));
    return mockConfigurationData;
  }

  async saveConfiguration(updated: Partial<ConfigurationPageData>): Promise<ConfigurationPageData> {
    await new Promise((res) => setTimeout(res, 180));
    Object.assign(mockConfigurationData, updated);
    return { ...mockConfigurationData };
  }
}

export const configurationService = new ConfigurationService();
