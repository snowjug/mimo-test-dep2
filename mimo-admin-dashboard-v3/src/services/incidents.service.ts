import type { IncidentsPageData, IncidentRecord } from '../types/incident';
import { mockIncidentsData } from '../mocks/incidents.mock';

export interface IIncidentsService {
  getIncidents(): Promise<IncidentsPageData>;
  acknowledgeIncident(id: string): Promise<IncidentRecord | null>;
  resolveIncident(id: string): Promise<IncidentRecord | null>;
}

class IncidentsService implements IIncidentsService {
  async getIncidents(): Promise<IncidentsPageData> {
    await new Promise((res) => setTimeout(res, 80));
    return mockIncidentsData;
  }

  async acknowledgeIncident(id: string): Promise<IncidentRecord | null> {
    await new Promise((res) => setTimeout(res, 120));
    const inc = mockIncidentsData.incidents.find((i) => i.id === id);
    if (inc) {
      inc.status = 'in_progress';
      return { ...inc };
    }
    return null;
  }

  async resolveIncident(id: string): Promise<IncidentRecord | null> {
    await new Promise((res) => setTimeout(res, 150));
    const inc = mockIncidentsData.incidents.find((i) => i.id === id);
    if (inc) {
      inc.status = 'resolved';
      return { ...inc };
    }
    return null;
  }
}

export const incidentsService = new IncidentsService();
