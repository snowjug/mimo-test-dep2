export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'pending';

export interface IncidentItem {
  id: string;
  incidentCode: string;
  severity: IncidentSeverity;
  title: string;
  description: string;
  kioskName: string;
  kioskCode: string;
  category: 'Hardware' | 'Paper' | 'Network' | 'Software' | 'Payment';
  status: IncidentStatus;
  reportedAt: string;
  timeAgo: string;
}

export interface IncidentsKPIs {
  critical: number;
  high: number;
  avgResolutionTimeHours: number;
  resolved: number;
}

export interface IncidentsPageData {
  kpis: IncidentsKPIs;
  incidents: IncidentItem[];
}
