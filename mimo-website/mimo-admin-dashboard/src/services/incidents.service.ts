import { IncidentsPageData } from '../types/incidents.types';
import { mockIncidentsData } from '../mocks/incidents.mock';
import api from '../api';

export interface IIncidentsService {
  getIncidents(): Promise<IncidentsPageData>;
}

export class MockIncidentsService implements IIncidentsService {
  async getIncidents(): Promise<IncidentsPageData> {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return mockIncidentsData;
  }
}

export class ApiIncidentsService implements IIncidentsService {
  async getIncidents(): Promise<IncidentsPageData> {
    try {
      const response = await api.get('/admin/incidents');
      return response.data;
    } catch {
      return mockIncidentsData;
    }
  }
}

const isMock = (import.meta as any).env?.VITE_DATA_SOURCE !== 'api';
export const incidentsService: IIncidentsService = isMock
  ? new MockIncidentsService()
  : new ApiIncidentsService();
