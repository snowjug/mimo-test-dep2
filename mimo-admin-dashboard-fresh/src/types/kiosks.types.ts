export interface KioskNode {
  id: string;
  name: string;
  code: string;
  location: string;
  status: 'Online' | 'Attention' | 'Offline' | 'Maintenance';
  model: string;
  ipAddress: string;
  paperLevel: number;
  tonerLevel: number;
  pagesToday: number;
  revenueToday: number;
  uptime: string;
  lastPing: string;
}

export interface KiosksKPIs {
  totalKiosks: number;
  onlineCount: number;
  attentionCount: number;
  totalPagesToday: number;
  fleetSuccessRate: number;
}

export interface KiosksPageData {
  kpis: KiosksKPIs;
  kiosks: KioskNode[];
}
