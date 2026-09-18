import type { IncidentsPageData } from '../types/incidents.types';
import { mockIncidentsData } from '../mocks/mockData';

export const incidentsService = {
  async getIncidents(): Promise<IncidentsPageData> {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return mockIncidentsData;
  },
};
