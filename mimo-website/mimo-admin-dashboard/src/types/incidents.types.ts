export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'acknowledged';

export interface IncidentEntity {
  id: string;
  incidentCode: string;
  title: string;
  kioskId: string;
  kioskName: string;
  category: 'Hardware' | 'Network' | 'Software' | 'Paper' | 'Payment';
  severity: IncidentSeverity;
  status: IncidentStatus;
  reportedAt: string;
  timeAgo: string;
  description: string;
  impact: string;
  slaRemainingMinutes?: number;
  resolvedAt?: string;
}

export interface IncidentsKPIs {
  critical: number;
  high: number;
  medium: number;
  low: number;
  resolved: number;
  activeCount: number;
  avgResolutionTimeHours: number;
}

export interface IncidentsPageData {
  kpis: IncidentsKPIs;
  incidents: IncidentEntity[];
}
