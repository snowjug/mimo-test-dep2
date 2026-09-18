export interface PlatformConfig {
  platformName: string;
  timezone: string;
  dateFormat: string;
  currency: string;
  defaultLanguage: string;
}

export interface KioskConfigItem {
  id: string;
  name: string;
  location: string;
  status: 'Online' | 'Offline' | 'Maintenance';
  model: string;
  ipAddress: string;
}

export interface PrintPolicyConfig {
  allowBwPrinting: boolean;
  allowColorPrinting: boolean;
  defaultPrintMode: 'B&W' | 'Color';
  maxPagesPerJob: number;
  supportedFileTypes: string[];
  autoDeleteFiles: boolean;
}

export interface PricingPaymentConfig {
  bwPagePrice: number;
  colorPagePrice: number;
  acceptUpi: boolean;
  acceptCard: boolean;
  acceptCash: boolean;
  enableWallet: boolean;
  autoRefundOnFailure: boolean;
}

export interface AdminUserConfigItem {
  id: string;
  name: string;
  role: 'Super Admin' | 'Operator' | 'Support' | 'Viewer';
  email: string;
  status: 'Online' | 'Offline';
  lastLogin: string;
}

export interface SystemSettingsConfig {
  printServerCups: string;
  firebaseProject: string;
  storageBucket: string;
  logLevel: 'Info' | 'Debug' | 'Warn' | 'Error';
  maintenanceMode: boolean;
  enableErrorReporting: boolean;
  automaticBackups: boolean;
}

export interface IntegrationStatusItem {
  id: string;
  name: string;
  status: 'Connected' | 'Configured' | 'Disconnected';
}

export interface SecurityPolicyConfig {
  requireAdminApprovalForRefunds: boolean;
  enableAuditLogging: boolean;
  restrictUsbPrinting: boolean;
  sessionTimeoutMinutes: number;
}

export interface ConfigurationPageData {
  platform: PlatformConfig;
  kiosks: KioskConfigItem[];
  print: PrintPolicyConfig;
  pricing: PricingPaymentConfig;
  users: AdminUserConfigItem[];
  system: SystemSettingsConfig;
  integrations: IntegrationStatusItem[];
  security: SecurityPolicyConfig;
}
