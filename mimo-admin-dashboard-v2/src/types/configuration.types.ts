export interface PlatformSettings {
  platformName: string;
  timezone: string;
  dateFormat: string;
  currency: string;
  defaultLanguage: string;
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

export interface PrintSettings {
  allowBwPrinting: boolean;
  allowColorPrinting: boolean;
  defaultPrintMode: 'B&W' | 'Color';
  maxPagesPerJob: number;
  supportedFileTypes: string[];
  autoDeleteFiles: boolean;
}

export interface IntegrationItem {
  id: string;
  name: string;
  type: string;
  status: 'Connected' | 'Disconnected';
}

export interface ConfigKioskItem {
  id: string;
  name: string;
  location: string;
  status: 'Online' | 'Offline' | 'Maintenance';
  model: string;
  ipAddress: string;
}

export interface ConfigUserItem {
  id: string;
  name: string;
  role: string;
  email: string;
  status: 'Online' | 'Offline';
  lastLogin: string;
}

export interface SecuritySettings {
  requireAdminApprovalForRefunds: boolean;
  enableAuditLogging: boolean;
  restrictUsbPrinting: boolean;
  sessionTimeoutMinutes: number;
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

export interface ConfigurationPageData {
  platform: PlatformSettings;
  pricing: PricingSettings;
  print: PrintSettings;
  integrations: IntegrationItem[];
  kiosks: ConfigKioskItem[];
  users: ConfigUserItem[];
  security: SecuritySettings;
  system: SystemSettings;
}
