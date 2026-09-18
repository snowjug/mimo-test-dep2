export interface PlatformSettings {
  platformName: string;
  timezone: string;
  dateFormat: string;
  currency: string;
  defaultLanguage: string;
}

export interface ConfigKioskItem {
  id: string;
  name: string;
  location: string;
  status: 'Online' | 'Offline' | 'Maintenance';
  model: string;
  ipAddress: string;
}

export interface PrintSettings {
  allowBwPrinting: boolean;
  allowColorPrinting: boolean;
  defaultPrintMode: 'B&W' | 'Color';
  maxPagesPerJob: number;
  supportedFileTypes: string[];
  autoDeleteFiles: boolean;
}

export interface PricingSettings {
  bwPagePrice: number;
  colorPagePrice: number;
  acceptUpi: boolean;
  acceptCard: boolean;
  acceptCash: boolean;
  enableWallet: boolean;
  autoRefundOnFailure: boolean;
}

export interface UserAccessItem {
  id: string;
  name: string;
  role: 'Super Admin' | 'Operator' | 'Support' | 'Viewer';
  email: string;
  status: 'Online' | 'Offline';
  lastLogin: string;
}

export interface SystemSettings {
  printServerCups: string;
  firebaseProject: string;
  storageBucket: string;
  logLevel: 'Debug' | 'Info' | 'Warn' | 'Error';
  maintenanceMode: boolean;
  enableErrorReporting: boolean;
  automaticBackups: boolean;
}

export interface IntegrationItem {
  id: string;
  name: string;
  type: string;
  status: 'Connected' | 'Disconnected' | 'Pending';
}

export interface SecuritySettings {
  requireAdminApprovalForRefunds: boolean;
  enableAuditLogging: boolean;
  restrictUsbPrinting: boolean;
  sessionTimeoutMinutes: number;
}

export interface ConfigurationPageData {
  platform: PlatformSettings;
  kiosks: ConfigKioskItem[];
  print: PrintSettings;
  pricing: PricingSettings;
  users: UserAccessItem[];
  system: SystemSettings;
  integrations: IntegrationItem[];
  security: SecuritySettings;
}
