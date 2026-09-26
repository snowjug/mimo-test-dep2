> **Superseded / historical.** This describes the earlier mock-data / data-source layer of the admin dashboard (files such as `src/types/*.types.ts` and a `VITE_DATA_SOURCE` switch) that **no longer exists**:
> the dashboards now read live data from `/admin/analytics` and related endpoints. Current documentation: [`../README.md`](../README.md) and [`architecture.md`](../../../architecture.md) §8. Kept for reference only.

# MIMO Admin Dashboard Data Contract

## 1. Architecture Overview

The MIMO Admin Dashboard follows a strict unidirectional and decoupled architecture:
```
[ UI Layer: Pages & Components ]
            │
            ▼
[ ViewModels & Custom Hooks ]
            │
            ▼
[ Service Layer Interface (IDashboardService, IOperationsService, etc.) ]
            │
      ┌─────┴────────────────┐
      ▼                      ▼
[ Mock Services ]     [ API Client / REST Endpoints ]
  (Development)            (Production Backend)
```

Data source is configured dynamically via environment variable:
`VITE_DATA_SOURCE=mock` (default) or `VITE_DATA_SOURCE=api`.

---

## 2. Domain Data Contracts

### 2.1 Overview Domain (`src/types/dashboard.types.ts`)
```typescript
export interface OverviewKPIs {
  totalRevenue: number;         // Total revenue in INR (e.g. 14250.00)
  revenueTrendPercent: number;  // Percentage change (+14.2%)
  paidVolume: number;           // Total paid sheets (e.g. 4821)
  volumeTrendPercent: number;   // Percentage change (+8.6%)
  freePromoPages: number;       // Free promo pages (e.g. 184)
  dispatchSuccessRate: number;  // Success percentage (e.g. 98.8%)
  printedPages: number;         // Completed printed sheets (e.g. 4762)
  lifetimePages: number;        // Cumulative printed sheets (e.g. 4946)
  activeEdgeNodes: number;      // Online kiosks (e.g. 4)
  totalEdgeNodes: number;       // Total kiosks in mesh (e.g. 4)
}

export interface RevenueTrendPoint {
  date: string;         // e.g. "Aug 27", "Aug 31"
  revenue: number;      // In INR
  paidPages: number;    // Sheets paid
  printedPages: number; // Sheets printed
}

export interface LiveOperationItem {
  id: string;
  jobCode: string;          // e.g. "#9041"
  fileName: string;         // e.g. "Application_Form_Final.pdf"
  kioskName: string;        // e.g. "MIMO 1 (Main Library)"
  kioskCode: string;        // e.g. "CV-001"
  pages: number;            // Page count
  colorMode: 'B&W' | 'Color';
  cost: number;             // Total job amount
  stage: 'Queued' | 'Merging' | 'Printing' | 'Completed' | 'Failed';
  status: 'ACTIVE' | 'PRINTING' | 'DONE' | 'FAILED' | 'WARNING';
  createdAt: string;        // e.g. "Just now", "2m ago"
}
```

### 2.2 Operations Domain (`src/types/operations.types.ts`)
```typescript
export interface OperationsKPIs {
  totalJobs: number;
  processing: number;
  completed: number;
  failed: number;
  avgDurationSec: number;
}

export interface OperationsFilterOptions {
  kioskId?: string;
  stage?: OperationStage | 'All';
  status?: OperationStatus | 'All';
  searchQuery?: string;
}
```

### 2.3 Kiosks Domain (`src/types/kiosks.types.ts`)
```typescript
export interface KioskEntity {
  id: string;
  name: string;
  code: string;
  location: string;
  status: 'Online' | 'Offline' | 'Attention' | 'Maintenance';
  model: string;
  ipAddress: string;
  uptime: string;
  pagesToday: number;
  revenueToday: number;
  successRate: number;
  paperLevel: number; // 0 - 100 percentage
  tonerLevel: number; // 0 - 100 percentage
  printerHealth: 'Good' | 'Warning' | 'Error' | 'Offline';
  lastSeen: string;
}
```

### 2.4 Configuration Domain (`src/types/configuration.types.ts`)
```typescript
export interface ConfigurationState {
  pricing: {
    blackWhitePrice: number;
    colorPrice: number;
    paperReamAlertThreshold: number;
    tonerAlertThreshold: number;
  };
  operational: {
    autoReprintOnFailure: boolean;
    maxQueuePerKiosk: number;
    sessionTimeoutMinutes: number;
    maintenanceWindow: string;
  };
  network: {
    telemetrySyncIntervalSec: number;
    enableMeshFailover: boolean;
    primaryGatewayUrl: string;
    backupGatewayUrl: string;
  };
  coupons: PromoCoupon[];
}
```
