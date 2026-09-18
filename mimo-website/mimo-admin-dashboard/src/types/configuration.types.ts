export interface PlatformSettings {
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

export interface PrintSettings {
  allowBwPrinting: boolean;
  allowColorPrinting: boolean;
  defaultPrintMode: 'B&W' | 'Color';
  maxPagesPerJob: number;
  supportedFileTypes: string[];
  autoDeleteFiles: boolean;
}

export interface PricingPaymentSettings {
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

export interface SystemConfig {
  printServerCups: string;
  firebaseProject: string;
  storageBucket: string;
  logLevel: 'Debug' | 'Info' | 'Warn' | 'Error';
  maintenanceMode: boolean;
  enableErrorReporting: boolean;
  automaticBackups: boolean;
}

export interface IntegrationStatus {
  id: string;
  name: string;
  type: 'firebase' | 'razorpay' | 'cups' | 'email';
  connected: boolean;
}

export interface SecurityPolicies {
  requireAdminApprovalForRefunds: boolean;
  enableAuditLogging: boolean;
  restrictUsbPrinting: boolean;
  sessionTimeoutMinutes: number;
}

export interface ConfigurationPageData {
  platform: PlatformSettings;
  kiosks: KioskConfigItem[];
  print: PrintSettings;
  pricing: PricingPaymentSettings;
  users: UserAccessItem[];
  system: SystemConfig;
  integrations: IntegrationStatus[];
  security: SecurityPolicies;
}
