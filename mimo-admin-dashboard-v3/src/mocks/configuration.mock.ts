import type { ConfigurationPageData } from '../types/configuration';

export const mockConfigurationData: ConfigurationPageData = {
  platform: {
    platformName: 'MIMO',
    timezone: 'Asia/Kolkata (IST)',
    dateFormat: 'DD MMM YYYY',
    currency: 'INR (₹)',
    defaultLanguage: 'English',
  },
  kiosks: [
    { id: 'k-1', name: 'MIMO 1', location: 'Main Lobby', status: 'Online', model: 'KM-100', ipAddress: '192.168.1.101' },
    { id: 'k-2', name: 'MIMO 2', location: 'Library', status: 'Online', model: 'KM-100', ipAddress: '192.168.1.102' },
    { id: 'k-3', name: 'MIMO 3', location: 'Cafeteria', status: 'Online', model: 'KM-200', ipAddress: '192.168.1.103' },
    { id: 'k-4', name: 'MIMO 4', location: 'Admin Block', status: 'Offline', model: 'KM-200', ipAddress: '—' },
    { id: 'k-5', name: 'MIMO 5', location: 'Hostel', status: 'Maintenance', model: 'KM-100', ipAddress: '192.168.1.105' },
  ],
  print: {
    allowBwPrinting: true,
    allowColorPrinting: true,
    defaultPrintMode: 'B&W',
    maxPagesPerJob: 50,
    supportedFileTypes: ['PDF', 'DOC', 'DOCX', 'PPT', 'PPTX', 'JPG', 'PNG'],
    autoDeleteFiles: true,
  },
  pricing: {
    bwPagePrice: 2.0,
    colorPagePrice: 5.0,
    acceptUpi: true,
    acceptCard: true,
    acceptCash: true,
    enableWallet: true,
    autoRefundOnFailure: true,
  },
  users: [
    { id: 'u-1', name: 'Admin', role: 'Super Admin', email: 'admin@mimo.in', status: 'Online', lastLogin: '12 Sep, 10:24 AM' },
    { id: 'u-2', name: 'Rahul', role: 'Operator', email: 'rahul@mimo.in', status: 'Online', lastLogin: '12 Sep, 09:18 AM' },
    { id: 'u-3', name: 'Priya', role: 'Support', email: 'priya@mimo.in', status: 'Offline', lastLogin: '11 Sep, 06:32 PM' },
    { id: 'u-4', name: 'Arjun', role: 'Viewer', email: 'arjun@mimo.in', status: 'Online', lastLogin: '12 Sep, 08:11 AM' },
  ],
  system: {
    printServerCups: '192.168.1.50',
    firebaseProject: 'mimo-prod',
    storageBucket: 'mimo-uploads',
    logLevel: 'Info',
    maintenanceMode: false,
    enableErrorReporting: true,
    automaticBackups: true,
  },
  integrations: [
    { id: 'int-1', name: 'Firebase', status: 'Connected' },
    { id: 'int-2', name: 'Razorpay', status: 'Connected' },
    { id: 'int-3', name: 'CUPS', status: 'Connected' },
    { id: 'int-4', name: 'Email (SMTP)', status: 'Connected' },
  ],
  security: {
    requireAdminApprovalForRefunds: true,
    enableAuditLogging: true,
    restrictUsbPrinting: false,
    sessionTimeoutMinutes: 30,
  },
};
