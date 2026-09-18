import type { ConfigurationPageData } from '../types/configuration.types';
import { mockConfigurationData } from '../mocks/mockData';

export const configurationService = {
  async getConfiguration(): Promise<ConfigurationPageData> {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return mockConfigurationData;
  },

  async updateConfiguration(_newConfig: Partial<ConfigurationPageData>): Promise<{ success: boolean }> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return { success: true };
  },
};
