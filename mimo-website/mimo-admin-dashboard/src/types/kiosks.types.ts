export type KioskStatus = 'Online' | 'Offline' | 'Attention' | 'Maintenance';

export interface KioskEntity {
  id: string;
  name: string;
  code: string;
  location: string;
  status: KioskStatus;
  model: string;
  ipAddress: string;
  uptime: string;
  pagesToday: number;
  revenueToday: number;
  successRate: number;
  paperLevel: number; // percentage
  tonerLevel: number; // percentage
  printerHealth: 'Good' | 'Warning' | 'Error' | 'Offline';
  currentJob?: {
    jobCode: string;
    fileName: string;
    progressPercent: number;
  };
  lastSeen: string;
  firmwareVersion: string;
}

export interface KiosksKPIs {
  totalKiosks: number;
  onlineCount: number;
  attentionCount: number;
  offlineCount: number;
  fleetSuccessRate: number;
  totalPagesToday: number;
  totalRevenueToday: number;
}

export interface KiosksPageData {
  kpis: KiosksKPIs;
  kiosks: KioskEntity[];
}
