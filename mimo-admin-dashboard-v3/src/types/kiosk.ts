export type KioskStatus = 'Online' | 'Offline' | 'Printing' | 'Idle' | 'Maintenance';

export interface KioskKPIs {
  totalKiosks: number;
  online: number;
  printingNow: number;
  idle: number;
  offline: number;
}

export interface KioskEntityRecord {
  id: string;
  name: string;
  kioskCode: string;
  printerType?: 'B&W' | 'Color' | string;
  isColor?: boolean;
  status: KioskStatus;
  currentJobName?: string;
  currentJobPages?: number;
  currentJobProgress?: number;
  pagesToday: number;
  revenueToday: number;
  location: string;
  uptimePercent: number;
  lastSeen: string;
  ipAddress: string;
  firmware: string;
  activeTimeHours: number;
  usersCount: number;
}

export interface KioskEventItem {
  id: string;
  kioskName: string;
  eventText: string;
  timeAgo: string;
  dotColor: string;
}

export interface KioskPerformancePoint {
  date: string;
  pagesPrinted: number;
  revenue: number;
  activeHours: number;
}

export interface KiosksPageData {
  kpis: KioskKPIs;
  selectedKiosk: KioskEntityRecord;
  kiosks: KioskEntityRecord[];
  events: KioskEventItem[];
  performanceHistory: KioskPerformancePoint[];
}
