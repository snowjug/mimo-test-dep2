export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IncidentStatus = 'open' | 'in_progress' | 'resolved' | 'archived';

export interface IncidentKPIs {
  critical: number;
  high: number;
  medium: number;
  low: number;
  resolvedToday: number;
}

export interface IncidentTrendPoint {
  date: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface CategoryCount {
  category: string;
  count: number;
  percentage: number;
  color: string;
}

export interface AffectedKiosk {
  kioskName: string;
  count: number;
  color: string;
}

export interface IncidentRecord {
  id: string;
  incidentCode: string;
  title: string;
  kioskName: string;
  category: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  reportedAt: string;
  updatedAt: string;
  assignedTo: string;
}

export interface ActivityEvent {
  id: string;
  text: string;
  timeAgo: string;
  color: string;
}

export interface IncidentsPageData {
  kpis: IncidentKPIs;
  trends: IncidentTrendPoint[];
  categories: CategoryCount[];
  affectedKiosks: AffectedKiosk[];
  incidents: IncidentRecord[];
  recentActivity: ActivityEvent[];
  slaPercentage: number;
  slaResolvedCount: number;
  slaTotalCount: number;
}
