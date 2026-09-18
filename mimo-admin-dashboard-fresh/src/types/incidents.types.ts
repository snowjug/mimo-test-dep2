export interface IncidentItem {
  id: string;
  incidentCode: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  kioskName: string;
  kioskCode: string;
  category: 'Software' | 'Paper' | 'Network' | 'Hardware' | 'Payment';
  status: 'open' | 'investigating' | 'resolved';
  reportedAt: string;
  timeAgo: string;
  slaRemaining?: string;
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
