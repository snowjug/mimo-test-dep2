import React, { useEffect, useState } from 'react';
import {
  Save,
  Printer,
  Database,
  Users,
  HardDrive,
  Check,
  Plus,
  MoreHorizontal,
  ChevronRight,
  Sliders,
  CreditCard,
  Cpu,
  Download,
  Upload,
  RotateCcw,
} from 'lucide-react';
import { configurationService } from '../../services/configuration.service';
import type { ConfigurationPageData } from '../../types/configuration.types';
import { SwitchToggle } from '../../components/ui/SwitchToggle';

interface ConfigurationPageProps {
  searchQuery?: string;
}

export const ConfigurationPage: React.FC<ConfigurationPageProps> = () => {
  const [data, setData] = useState<ConfigurationPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('general');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form State
  const [pricingState, setPricingState] = useState({
    bwPrice: 2.0,
    colorPrice: 5.0,
    acceptUpi: true,
    acceptCard: true,
    acceptCash: true,
    enableWallet: true,
    autoRefund: true,
  });

  const [printState, setPrintState] = useState({
    allowBw: true,
    allowColor: true,
    defaultMode: 'B&W',
    maxPages: 50,
    autoDelete: true,
  });

  const [securityState, setSecurityState] = useState({
    requireApproval: true,
    auditLogging: true,
    restrictUsb: false,
    sessionTimeout: 30,
  });

  const [systemState, setSystemState] = useState({
    maintenanceMode: false,
    errorReporting: true,
    backups: true,
  });

  const loadData = async () => {
    try {
      const res = await configurationService.getConfiguration();
      setData(res);
      setPricingState({
        bwPrice: res.pricing.bwPagePrice,
        colorPrice: res.pricing.colorPagePrice,
        acceptUpi: res.pricing.acceptUpi,
        acceptCard: res.pricing.acceptCard,
        acceptCash: res.pricing.acceptCash,
        enableWallet: res.pricing.enableWallet,
        autoRefund: res.pricing.autoRefundOnFailure,
      });
      setPrintState({
        allowBw: res.print.allowBwPrinting,
        allowColor: res.print.allowColorPrinting,
        defaultMode: res.print.defaultPrintMode,
        maxPages: res.print.maxPagesPerJob,
        autoDelete: res.print.autoDeleteFiles,
      });
      setSecurityState({
        requireApproval: res.security.requireAdminApprovalForRefunds,
        auditLogging: res.security.enableAuditLogging,
        restrictUsb: res.security.restrictUsbPrinting,
        sessionTimeout: res.security.sessionTimeoutMinutes,
      });
      setSystemState({
        maintenanceMode: res.system.maintenanceMode,
        errorReporting: res.system.enableErrorReporting,
        backups: res.system.automaticBackups,
      });
    } catch (err) {
      console.error('Failed to load configuration data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveAll = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#20D3A2] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-[#8EA6BF]">Loading Fleet Configuration...</span>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'general', label: 'General', icon: Sliders },
    { id: 'kiosks', label: 'Kiosk Settings', icon: HardDrive },
    { id: 'print', label: 'Print & Document', icon: Printer },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'users', label: 'Users & Access', icon: Users },
    { id: 'integrations', label: 'Integrations', icon: Database },
    { id: 'system', label: 'System', icon: Cpu },
  ];

  const showTab = (tabId: string) => activeTab === 'general' || activeTab === tabId;

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Top Breadcrumb & Page Header */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-[#8EA6BF] cursor-pointer hover:text-[#20D3A2]">
          ← Configuration
        </span>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#F5F7FA] tracking-tight">
              Configuration
            </h1>
            <p className="text-xs sm:text-sm text-[#8EA6BF] font-medium mt-1">
              Manage kiosks, system settings, print policies and integrations for MIMO.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSaveAll}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#20D3A2] hover:bg-[#20D3A2]/90 text-[#07111F] rounded-xl text-xs font-black transition-all shadow-lg shadow-[#20D3A2]/20 cursor-pointer"
            >
              {saveSuccess ? <Check size={16} /> : <Save size={16} />}
              <span>{saveSuccess ? 'Changes Saved!' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-b border-[#1D3A59]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-[#20D3A2] text-[#07111F] font-black shadow-md shadow-[#20D3A2]/20'
                  : 'bg-[#10223A] text-[#8EA6BF] hover:text-[#F5F7FA] hover:bg-[#132943] border border-[#1D3A59]'
              }`}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 6 Primary Cards Grid (3 Columns on Desktop, 2 on Tablet, 1 on Mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6">
        {/* Card 1: Platform Settings */}
        {showTab('general') && (
          <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl flex flex-col justify-between">
            <div>
              <div className="pb-3.5 border-b border-[#1D3A59]">
                <h3 className="text-base font-bold text-[#F5F7FA]">Platform Settings</h3>
                <p className="text-xs text-[#8EA6BF]">Core system configuration</p>
              </div>

              <div className="mt-4 space-y-3.5 text-xs">
                <div>
                  <label className="text-[11px] text-[#8EA6BF] font-semibold block mb-1">
                    Platform Name
                  </label>
                  <input
                    type="text"
                    defaultValue={data.platform.platformName}
                    className="w-full px-3 py-2 bg-[#07111F] border border-[#1D3A59] rounded-xl text-xs text-[#F5F7FA] focus:border-[#20D3A2] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#8EA6BF] font-semibold block mb-1">
                    Timezone
                  </label>
                  <select
                    defaultValue={data.platform.timezone}
                    className="w-full px-3 py-2 bg-[#07111F] border border-[#1D3A59] rounded-xl text-xs text-[#F5F7FA] focus:border-[#20D3A2] outline-none cursor-pointer"
                  >
                    <option value="Asia/Kolkata (IST)">Asia/Kolkata (IST)</option>
                    <option value="UTC">UTC (Universal Coordinated Time)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-[#8EA6BF] font-semibold block mb-1">
                    Date Format
                  </label>
                  <select
                    defaultValue={data.platform.dateFormat}
                    className="w-full px-3 py-2 bg-[#07111F] border border-[#1D3A59] rounded-xl text-xs text-[#F5F7FA] focus:border-[#20D3A2] outline-none cursor-pointer"
                  >
                    <option value="DD MMM YYYY">DD MMM YYYY (e.g. 12 Sep 2026)</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[#8EA6BF] font-semibold block mb-1">
                      Currency
                    </label>
                    <input
                      type="text"
                      disabled
                      value={data.platform.currency}
                      className="w-full px-3 py-2 bg-[#07111F]/60 border border-[#1D3A59]/60 rounded-xl text-xs text-[#CAD7E6] opacity-80"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#8EA6BF] font-semibold block mb-1">
                      Default Language
                    </label>
                    <input
                      type="text"
                      disabled
                      value={data.platform.defaultLanguage}
                      className="w-full px-3 py-2 bg-[#07111F]/60 border border-[#1D3A59]/60 rounded-xl text-xs text-[#CAD7E6] opacity-80"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-[#1D3A59] flex justify-end">
              <button
                type="button"
                onClick={handleSaveAll}
                className="px-4 py-1.5 bg-[#20D3A2] hover:bg-[#20D3A2]/90 text-[#07111F] rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Card 2: Kiosk Configuration Table */}
        {(showTab('general') || showTab('kiosks')) && (
          <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3.5 border-b border-[#1D3A59]">
                <div>
                  <h3 className="text-base font-bold text-[#F5F7FA]">Kiosk Configuration</h3>
                  <p className="text-xs text-[#8EA6BF]">Manage all registered kiosks</p>
                </div>
                <button
                  type="button"
                  onClick={() => alert('Add Kiosk modal opens')}
                  className="flex items-center gap-1.5 px-3 py-1 bg-[#132943] hover:bg-[#20D3A2]/20 border border-[#1D3A59] hover:border-[#20D3A2]/50 text-[#F5F7FA] rounded-lg text-xs font-semibold transition-all cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Add Kiosk</span>
                </button>
              </div>

              {/* Kiosks Compact Table */}
              <div className="mt-3.5 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#1D3A59] text-[10px] uppercase font-bold text-[#6F89A3]">
                      <th className="pb-2">Name</th>
                      <th className="pb-2">Location</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Model</th>
                      <th className="pb-2">IP</th>
                      <th className="pb-2 text-right">•••</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1D3A59]/50 text-xs">
                    {data.kiosks.map((k) => (
                      <tr key={k.id} className="hover:bg-[#132943]/40 transition-colors">
                        <td className="py-2.5 font-bold text-[#F5F7FA]">{k.name}</td>
                        <td className="py-2.5 text-[#8EA6BF]">{k.location}</td>
                        <td className="py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                              k.status === 'Online'
                                ? 'text-[#20D3A2]'
                                : k.status === 'Offline'
                                ? 'text-rose-400'
                                : 'text-amber-400'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                k.status === 'Online'
                                  ? 'bg-[#20D3A2]'
                                  : k.status === 'Offline'
                                  ? 'bg-rose-400'
                                  : 'bg-amber-400'
                              }`}
                            />
                            {k.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-[#8EA6BF]">{k.model}</td>
                        <td className="py-2.5 font-mono text-[11px] text-[#CAD7E6]">{k.ipAddress}</td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            title="Actions"
                            className="text-[#8EA6BF] hover:text-[#F5F7FA] p-1"
                          >
                            <MoreHorizontal size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#1D3A59]">
              <a
                href="/admin/kiosks"
                className="text-xs font-bold text-[#20D3A2] hover:underline flex items-center justify-between"
              >
                <span>View All Kiosks</span>
                <ChevronRight size={14} />
              </a>
            </div>
          </div>
        )}

        {/* Card 3: Print Settings */}
        {(showTab('general') || showTab('print')) && (
          <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl flex flex-col justify-between">
            <div>
              <div className="pb-3.5 border-b border-[#1D3A59]">
                <h3 className="text-base font-bold text-[#F5F7FA]">Print Settings</h3>
                <p className="text-xs text-[#8EA6BF]">Configure print behavior and limits</p>
              </div>

              <div className="mt-4 space-y-3.5 text-xs">
                <SwitchToggle
                  checked={printState.allowBw}
                  onChange={(c) => setPrintState({ ...printState, allowBw: c })}
                  label="Allow B&W Printing"
                  description="Enable black & white printing"
                />
                <SwitchToggle
                  checked={printState.allowColor}
                  onChange={(c) => setPrintState({ ...printState, allowColor: c })}
                  label="Allow Color Printing"
                  description="Enable color printing"
                />
                <div>
                  <label className="text-[11px] text-[#8EA6BF] font-semibold block mb-1">
                    Default Print Mode
                  </label>
                  <select
                    value={printState.defaultMode}
                    onChange={(e) => setPrintState({ ...printState, defaultMode: e.target.value as any })}
                    className="w-full px-3 py-2 bg-[#07111F] border border-[#1D3A59] rounded-xl text-xs text-[#F5F7FA] focus:border-[#20D3A2] outline-none cursor-pointer"
                  >
                    <option value="B&W">B&W (Black & White)</option>
                    <option value="Color">Color</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-[#8EA6BF] font-semibold block mb-1">
                    Max Pages per Job
                  </label>
                  <input
                    type="number"
                    value={printState.maxPages}
                    onChange={(e) => setPrintState({ ...printState, maxPages: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-[#07111F] border border-[#1D3A59] rounded-xl text-xs text-[#F5F7FA] focus:border-[#20D3A2] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#8EA6BF] font-semibold block mb-1">
                    Supported File Types
                  </label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {data.print.supportedFileTypes.map((ext) => (
                      <span
                        key={ext}
                        className="px-2 py-0.5 rounded-md bg-[#07111F] text-[#20D3A2] text-[11px] font-mono border border-[#1D3A59]"
                      >
                        {ext}
                      </span>
                    ))}
                  </div>
                </div>
                <SwitchToggle
                  checked={printState.autoDelete}
                  onChange={(c) => setPrintState({ ...printState, autoDelete: c })}
                  label="Auto Delete Files"
                  description="Delete files after 24 hours"
                />
              </div>
            </div>
          </div>
        )}

        {/* Card 4: Pricing & Payment Settings */}
        {(showTab('general') || showTab('payments')) && (
          <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl flex flex-col justify-between">
            <div>
              <div className="pb-3.5 border-b border-[#1D3A59]">
                <h3 className="text-base font-bold text-[#F5F7FA]">Pricing & Payment Settings</h3>
                <p className="text-xs text-[#8EA6BF]">Configure pricing, payment methods and revenue settings</p>
              </div>

              <div className="mt-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[#8EA6BF] font-semibold block mb-1">
                      B&W Page Price (₹)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={pricingState.bwPrice}
                      onChange={(e) => setPricingState({ ...pricingState, bwPrice: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-[#07111F] border border-[#1D3A59] rounded-xl text-xs font-bold text-[#20D3A2] focus:border-[#20D3A2] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#8EA6BF] font-semibold block mb-1">
                      Color Page Price (₹)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={pricingState.colorPrice}
                      onChange={(e) => setPricingState({ ...pricingState, colorPrice: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-[#07111F] border border-[#1D3A59] rounded-xl text-xs font-bold text-sky-400 focus:border-[#20D3A2] outline-none"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-[#1D3A59]/60 space-y-3">
                  <SwitchToggle
                    checked={pricingState.acceptUpi}
                    onChange={(c) => setPricingState({ ...pricingState, acceptUpi: c })}
                    label="Accept UPI Payments"
                  />
                  <SwitchToggle
                    checked={pricingState.acceptCard}
                    onChange={(c) => setPricingState({ ...pricingState, acceptCard: c })}
                    label="Accept Card Payments"
                  />
                  <SwitchToggle
                    checked={pricingState.acceptCash}
                    onChange={(c) => setPricingState({ ...pricingState, acceptCash: c })}
                    label="Accept Cash Payments"
                  />
                  <SwitchToggle
                    checked={pricingState.enableWallet}
                    onChange={(c) => setPricingState({ ...pricingState, enableWallet: c })}
                    label="Enable Wallet/Prepaid"
                  />
                  <SwitchToggle
                    checked={pricingState.autoRefund}
                    onChange={(c) => setPricingState({ ...pricingState, autoRefund: c })}
                    label="Auto Refund on Failure"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Card 5: User & Access Management */}
        {(showTab('general') || showTab('users')) && (
          <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3.5 border-b border-[#1D3A59]">
                <div>
                  <h3 className="text-base font-bold text-[#F5F7FA]">User & Access Management</h3>
                  <p className="text-xs text-[#8EA6BF]">Manage admin users and role permissions</p>
                </div>
                <button
                  type="button"
                  onClick={() => alert('Add User modal opens')}
                  className="flex items-center gap-1.5 px-3 py-1 bg-[#132943] hover:bg-[#20D3A2]/20 border border-[#1D3A59] hover:border-[#20D3A2]/50 text-[#F5F7FA] rounded-lg text-xs font-semibold transition-all cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Add User</span>
                </button>
              </div>

              <div className="mt-3.5 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#1D3A59] text-[10px] uppercase font-bold text-[#6F89A3]">
                      <th className="pb-2">Name</th>
                      <th className="pb-2">Role</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Last Login</th>
                      <th className="pb-2 text-right">•••</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1D3A59]/50 text-xs">
                    {data.users.map((u) => (
                      <tr key={u.id} className="hover:bg-[#132943]/40 transition-colors">
                        <td className="py-2.5 font-bold text-[#F5F7FA]">{u.name}</td>
                        <td className="py-2.5 text-[#8EA6BF]">{u.role}</td>
                        <td className="py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                              u.status === 'Online' ? 'text-[#20D3A2]' : 'text-[#8EA6BF]'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                u.status === 'Online' ? 'bg-[#20D3A2]' : 'bg-[#6F89A3]'
                              }`}
                            />
                            {u.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-[#8EA6BF] text-[11px]">{u.lastLogin}</td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            title="Actions"
                            className="text-[#8EA6BF] hover:text-[#F5F7FA] p-1"
                          >
                            <MoreHorizontal size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#1D3A59]">
              <button
                type="button"
                onClick={() => alert('Manage permissions drawer')}
                className="text-xs font-bold text-[#20D3A2] hover:underline flex items-center justify-between w-full cursor-pointer"
              >
                <span>Manage Permissions</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Card 6: System Configuration */}
        {(showTab('general') || showTab('system')) && (
          <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl flex flex-col justify-between">
            <div>
              <div className="pb-3.5 border-b border-[#1D3A59]">
                <h3 className="text-base font-bold text-[#F5F7FA]">System Configuration</h3>
                <p className="text-xs text-[#8EA6BF]">Low-level system settings</p>
              </div>

              <div className="mt-4 space-y-3.5 text-xs">
                <div>
                  <label className="text-[11px] text-[#8EA6BF] font-semibold block mb-1">
                    Print Server (CUPS)
                  </label>
                  <input
                    type="text"
                    defaultValue={data.system.printServerCups}
                    className="w-full px-3 py-2 bg-[#07111F] border border-[#1D3A59] rounded-xl text-xs font-mono text-[#20D3A2] focus:border-[#20D3A2] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#8EA6BF] font-semibold block mb-1">
                    Firebase Project
                  </label>
                  <input
                    type="text"
                    defaultValue={data.system.firebaseProject}
                    className="w-full px-3 py-2 bg-[#07111F] border border-[#1D3A59] rounded-xl text-xs font-mono text-[#F5F7FA] focus:border-[#20D3A2] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#8EA6BF] font-semibold block mb-1">
                    Storage Bucket
                  </label>
                  <input
                    type="text"
                    defaultValue={data.system.storageBucket}
                    className="w-full px-3 py-2 bg-[#07111F] border border-[#1D3A59] rounded-xl text-xs font-mono text-[#F5F7FA] focus:border-[#20D3A2] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#8EA6BF] font-semibold block mb-1">
                    Log Level
                  </label>
                  <select
                    defaultValue={data.system.logLevel}
                    className="w-full px-3 py-2 bg-[#07111F] border border-[#1D3A59] rounded-xl text-xs text-[#F5F7FA] focus:border-[#20D3A2] outline-none cursor-pointer"
                  >
                    <option value="Info">Info</option>
                    <option value="Debug">Debug</option>
                    <option value="Warn">Warn</option>
                    <option value="Error">Error</option>
                  </select>
                </div>
                <SwitchToggle
                  checked={systemState.maintenanceMode}
                  onChange={(c) => setSystemState({ ...systemState, maintenanceMode: c })}
                  label="Maintenance Mode"
                  description="Disable public kiosk access"
                />
                <SwitchToggle
                  checked={systemState.errorReporting}
                  onChange={(c) => setSystemState({ ...systemState, errorReporting: c })}
                  label="Enable Error Reporting"
                />
                <SwitchToggle
                  checked={systemState.backups}
                  onChange={(c) => setSystemState({ ...systemState, backups: c })}
                  label="Automatic Backups"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Row: Integrations, Security & Policies, Data Management (Matching Image 3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6 pt-2">
        {/* Integrations */}
        <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="pb-3.5 border-b border-[#1D3A59]">
              <h3 className="text-base font-bold text-[#F5F7FA]">Integrations</h3>
              <p className="text-xs text-[#8EA6BF]">Manage third-party services</p>
            </div>

            <div className="mt-3.5 grid grid-cols-2 gap-2.5">
              {data.integrations.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-[#07111F]/60 border border-[#1D3A59]/80 flex items-center justify-between"
                >
                  <div>
                    <p className="text-xs font-bold text-[#F5F7FA]">{item.name}</p>
                    <span className="text-[10px] text-[#20D3A2] font-semibold">{item.status}</span>
                  </div>
                  <Check size={14} className="text-[#20D3A2]" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Security & Policies */}
        <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="pb-3.5 border-b border-[#1D3A59]">
              <h3 className="text-base font-bold text-[#F5F7FA]">Security & Policies</h3>
              <p className="text-xs text-[#8EA6BF]">Access control and operational policies</p>
            </div>

            <div className="mt-3.5 space-y-3 text-xs">
              <SwitchToggle
                checked={securityState.requireApproval}
                onChange={(c) => setSecurityState({ ...securityState, requireApproval: c })}
                label="Require Admin Approval for Refunds"
              />
              <SwitchToggle
                checked={securityState.auditLogging}
                onChange={(c) => setSecurityState({ ...securityState, auditLogging: c })}
                label="Enable Audit Logging"
              />
              <SwitchToggle
                checked={securityState.restrictUsb}
                onChange={(c) => setSecurityState({ ...securityState, restrictUsb: c })}
                label="Restrict USB Printing"
              />
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-[#CAD7E6]">Session Timeout (Admin)</span>
                <select
                  value={securityState.sessionTimeout}
                  onChange={(e) => setSecurityState({ ...securityState, sessionTimeout: parseInt(e.target.value) })}
                  className="px-2.5 py-1 bg-[#07111F] border border-[#1D3A59] rounded-lg text-xs text-[#F5F7FA] outline-none cursor-pointer"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>60 minutes</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Data Management */}
        <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="pb-3.5 border-b border-[#1D3A59]">
              <h3 className="text-base font-bold text-[#F5F7FA]">Data Management</h3>
              <p className="text-xs text-[#8EA6BF]">Backup, restore and data controls</p>
            </div>

            <div className="mt-3.5 space-y-2.5">
              <button
                type="button"
                onClick={() => alert('Exporting fleet configuration JSON...')}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-[#07111F]/60 border border-[#1D3A59]/80 hover:border-[#20D3A2]/40 text-left transition-all cursor-pointer"
              >
                <div>
                  <p className="text-xs font-bold text-[#F5F7FA]">Backup Configuration</p>
                  <p className="text-[10px] text-[#8EA6BF]">Download current configuration JSON</p>
                </div>
                <Download size={16} className="text-[#20D3A2]" />
              </button>

              <button
                type="button"
                onClick={() => alert('Select configuration file to restore...')}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-[#07111F]/60 border border-[#1D3A59]/80 hover:border-sky-500/40 text-left transition-all cursor-pointer"
              >
                <div>
                  <p className="text-xs font-bold text-[#F5F7FA]">Restore Configuration</p>
                  <p className="text-[10px] text-[#8EA6BF]">Upload and restore from file</p>
                </div>
                <Upload size={16} className="text-sky-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  if (confirm('Reset to factory default configuration?')) {
                    alert('Configuration reset to defaults.');
                  }
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/15 text-left transition-all cursor-pointer"
              >
                <div>
                  <p className="text-xs font-bold text-rose-400">Reset to Default</p>
                  <p className="text-[10px] text-rose-300/80">Restore factory settings</p>
                </div>
                <RotateCcw size={16} className="text-rose-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
