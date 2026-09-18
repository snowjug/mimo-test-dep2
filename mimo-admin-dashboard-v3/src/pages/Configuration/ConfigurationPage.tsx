import React, { useState } from 'react';
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
import { useConfiguration } from '../../hooks/useConfiguration';
import { SwitchToggle } from '../../components/ui/SwitchToggle';
import { PageHeader } from '../../components/ui/PageHeader';
import { LoadingSkeleton } from '../../components/ui/LoadingSkeleton';
import { EmptyState } from '../../components/ui/EmptyState';

export interface ConfigurationPageProps {
  searchQuery?: string;
}

export const ConfigurationPage: React.FC<ConfigurationPageProps> = () => {
  const { data, loading, saving, error, savedSuccess, saveConfig, refresh } = useConfiguration();
  const [activeTab, setActiveTab] = useState<string>('general');

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

  if (loading) return <LoadingSkeleton rows={5} />;
  if (error || !data) {
    return (
      <EmptyState
        title="Failed to Load Configuration"
        description={error || 'An unexpected error occurred while loading settings.'}
        actionText="Retry"
        onAction={refresh}
      />
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

  const handleSaveAll = () => {
    saveConfig({
      pricing: {
        ...data.pricing,
        bwPagePrice: pricingState.bwPrice,
        colorPagePrice: pricingState.colorPrice,
        acceptUpi: pricingState.acceptUpi,
        acceptCard: pricingState.acceptCard,
        acceptCash: pricingState.acceptCash,
        enableWallet: pricingState.enableWallet,
        autoRefundOnFailure: pricingState.autoRefund,
      },
      print: {
        ...data.print,
        allowBwPrinting: printState.allowBw,
        allowColorPrinting: printState.allowColor,
        defaultPrintMode: printState.defaultMode as 'B&W' | 'Color',
        maxPagesPerJob: printState.maxPages,
        autoDeleteFiles: printState.autoDelete,
      },
    });
  };

  const showTab = (tabId: string) => activeTab === 'general' || activeTab === tabId;

  return (
    <div className="flex flex-col gap-3 sm:gap-3.5 lg:gap-4 animate-in fade-in duration-200 font-sans">
      {/* Page Header with Save Button */}
      <PageHeader
        breadcrumb="← Fleet Settings"
        title="Configuration"
        description="Manage kiosks, system settings, print policies, pricing structures and integrations for MIMO."
        actions={
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving}
            className="flex items-center gap-2 px-5 h-11 bg-[#6366F1] hover:bg-[#4F46E5] text-white rounded-xl text-sm sm:text-[15px] font-medium transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            {savedSuccess ? <Check size={18} /> : <Save size={18} />}
            <span>{savedSuccess ? 'Changes Saved!' : saving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        }
      />

      {/* Tabs Navigation with Generous Spacing & High Readability */}
      <div className="flex items-center gap-2.5 sm:gap-3 overflow-x-auto pb-2 scrollbar-none border-b border-slate-200/80 dark:border-[#1E314B]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2.5 px-4.5 py-2.5 sm:px-5 sm:py-3 h-11 sm:h-12 rounded-xl text-sm sm:text-[15px] font-medium transition-all shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-[#6366F1] text-white shadow-xs dark:bg-[#6366F1] dark:text-white'
                  : 'bg-white dark:bg-[#0C1829] text-slate-700 dark:text-[#CBD5E1] hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-[#14243A] border border-slate-200 dark:border-[#1E314B]'
              }`}
            >
              <Icon size={18} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 2-Column Dashboard Grid (Independent content-based column flow) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-3.5 lg:gap-4 items-start content-start">
        {/* Left Column */}
        <div className="flex flex-col gap-3 sm:gap-3.5 lg:gap-4">
          {/* Card 1: Platform Settings */}
          {showTab('general') && (
            <div className="mimo-card p-6 sm:p-7 lg:p-8 flex flex-col justify-between">
              <div>
                <div className="mimo-card-header !pb-4 !mb-5">
                  <div>
                    <h2 className="text-xl sm:text-[22px] font-semibold text-slate-900 dark:text-[#F8FAFC] tracking-tight">
                      Platform Settings
                    </h2>
                    <p className="text-sm sm:text-[15px] text-slate-500 dark:text-[#94A3B8] mt-1">
                      Core system configuration and regional defaults
                    </p>
                  </div>
                </div>

                <div className="space-y-4 sm:space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-sm sm:text-[15px] font-medium text-slate-900 dark:text-[#F8FAFC] block">
                      Platform Name
                    </label>
                    <input
                      type="text"
                      defaultValue={data.platform.platformName}
                      className="mimo-input text-sm sm:text-base"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm sm:text-[15px] font-medium text-slate-900 dark:text-[#F8FAFC] block">
                      Timezone
                    </label>
                    <select
                      defaultValue={data.platform.timezone}
                      className="mimo-select text-sm sm:text-base"
                    >
                      <option value="Asia/Kolkata (IST)">Asia/Kolkata (IST)</option>
                      <option value="UTC">UTC (Universal Coordinated Time)</option>
                      <option value="America/New_York (EST)">America/New_York (EST)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm sm:text-[15px] font-medium text-slate-900 dark:text-[#F8FAFC] block">
                      Date Format
                    </label>
                    <select
                      defaultValue={data.platform.dateFormat}
                      className="mimo-select text-sm sm:text-base"
                    >
                      <option value="DD MMM YYYY">DD MMM YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm sm:text-[15px] font-medium text-slate-900 dark:text-[#F8FAFC] block">
                        Currency
                      </label>
                      <input
                        type="text"
                        disabled
                        value={data.platform.currency}
                        className="mimo-input text-sm sm:text-base opacity-75 cursor-not-allowed bg-slate-100 dark:bg-[#0C1829] border border-slate-200 dark:border-[#1E314B] text-slate-600 dark:text-[#CBD5E1]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm sm:text-[15px] font-medium text-slate-900 dark:text-[#F8FAFC] block">
                        Default Language
                      </label>
                      <input
                        type="text"
                        disabled
                        value={data.platform.defaultLanguage}
                        className="mimo-input text-sm sm:text-base opacity-75 cursor-not-allowed bg-slate-100 dark:bg-[#0C1829] border border-slate-200 dark:border-[#1E314B] text-slate-600 dark:text-[#CBD5E1]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-[#1E314B] flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveAll}
                  className="px-5 h-11 bg-[#6366F1] hover:bg-[#4F46E5] text-white rounded-xl text-sm sm:text-[15px] font-medium transition-all shadow-xs cursor-pointer"
                >
                  Save Platform Settings
                </button>
              </div>
            </div>
          )}

          {/* Card 3: Print Settings */}
          {(showTab('general') || showTab('print')) && (
            <div className="mimo-card p-6 sm:p-7 lg:p-8 flex flex-col justify-between">
              <div>
                <div className="mimo-card-header !pb-4 !mb-5">
                  <div>
                    <h2 className="text-xl sm:text-[22px] font-semibold text-slate-900 dark:text-[#F8FAFC] tracking-tight">
                      Print & Document Policies
                    </h2>
                    <p className="text-sm sm:text-[15px] text-slate-500 dark:text-[#94A3B8] mt-1">
                      Configure page limits, color rules, and job retention
                    </p>
                  </div>
                </div>

                <div className="space-y-4 divide-y divide-slate-100 dark:divide-[#1E314B]">
                  <div className="pt-2">
                    <SwitchToggle
                      checked={printState.allowBw}
                      onChange={(c) => setPrintState({ ...printState, allowBw: c })}
                      label="Allow Black & White Printing"
                      description="Enable standard monochrome printing across all supporting kiosks"
                    />
                  </div>

                  <div className="pt-3">
                    <SwitchToggle
                      checked={printState.allowColor}
                      onChange={(c) => setPrintState({ ...printState, allowColor: c })}
                      label="Allow Color Printing"
                      description="Permit color print jobs on color-capable hardware kiosks (e.g. M2)"
                    />
                  </div>

                  <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-h-[52px]">
                    <div>
                      <p className="text-sm sm:text-[15px] font-medium text-slate-900 dark:text-[#F8FAFC]">
                        Default Print Mode
                      </p>
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-[#94A3B8] mt-0.5">
                        Preselected color mode for new document uploads
                      </p>
                    </div>
                    <select
                      value={printState.defaultMode}
                      onChange={(e) => setPrintState({ ...printState, defaultMode: e.target.value })}
                      className="mimo-select text-sm sm:text-base min-w-[140px] self-start sm:self-auto"
                    >
                      <option value="B&W">Black & White</option>
                      <option value="Color">Color</option>
                    </select>
                  </div>

                  <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-h-[52px]">
                    <div>
                      <p className="text-sm sm:text-[15px] font-medium text-slate-900 dark:text-[#F8FAFC]">
                        Maximum Pages Per Job
                      </p>
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-[#94A3B8] mt-0.5">
                        Limit document page length to avoid queue congestion
                      </p>
                    </div>
                    <input
                      type="number"
                      value={printState.maxPages}
                      onChange={(e) => setPrintState({ ...printState, maxPages: parseInt(e.target.value) || 1 })}
                      className="mimo-input w-28 text-center text-sm sm:text-base font-semibold self-start sm:self-auto"
                      min={1}
                      max={500}
                    />
                  </div>

                  <div className="pt-3">
                    <SwitchToggle
                      checked={printState.autoDelete}
                      onChange={(c) => setPrintState({ ...printState, autoDelete: c })}
                      label="Auto-Delete Printed Files"
                      description="Purge temporary customer PDF files after successful print fulfillment"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-[#1E314B] flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveAll}
                  className="px-5 h-11 bg-[#6366F1] hover:bg-[#4F46E5] text-white rounded-xl text-sm sm:text-[15px] font-medium transition-all shadow-xs cursor-pointer"
                >
                  Save Print Policies
                </button>
              </div>
            </div>
          )}

          {/* Card 5: User & Access Management */}
          {(showTab('general') || showTab('users')) && (
            <div className="mimo-card p-6 sm:p-7 lg:p-8 !h-auto self-start flex flex-col">
              <div className="space-y-4 sm:space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-[#1E314B]">
                  <div>
                    <h2 className="text-xl sm:text-[22px] font-semibold text-slate-900 dark:text-[#F8FAFC] tracking-tight">
                      User & Access Management
                    </h2>
                    <p className="text-sm sm:text-[15px] text-slate-500 dark:text-[#94A3B8] mt-1">
                      Manage operator roles, permissions, and audit trails
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => alert('Add User dialog')}
                    className="flex items-center gap-1.5 px-4 h-10 sm:h-11 bg-slate-100 dark:bg-[#14243A] hover:bg-slate-200 dark:hover:bg-[#1B2F4A] text-slate-800 dark:text-[#F1F5F9] rounded-xl text-sm font-medium transition-all cursor-pointer self-start sm:self-auto border border-slate-200 dark:border-[#1E314B]"
                  >
                    <Plus size={16} />
                    <span>Add User</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-[#1E314B] text-xs sm:text-[13px] uppercase font-semibold text-slate-400 dark:text-[#8495AA]">
                        <th className="py-3 px-1">Name</th>
                        <th className="py-3 px-2">Role</th>
                        <th className="py-3 px-2">Status</th>
                        <th className="py-3 px-2">Last Login</th>
                        <th className="py-3 px-1 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#1E314B] text-sm sm:text-[15px]">
                      {data.users.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-[#14243A]/50 transition-colors h-[52px]">
                          <td className="py-3.5 px-1 font-semibold text-slate-900 dark:text-[#F1F5F9]">{u.name}</td>
                          <td className="py-3.5 px-2 text-slate-600 dark:text-[#C3CFDD]">{u.role}</td>
                          <td className="py-3.5 px-2">
                            <span
                              className={`inline-flex items-center gap-1.5 text-xs sm:text-[13px] font-medium px-2.5 py-1 rounded-full ${
                                u.status === 'Online'
                                  ? 'bg-[#EEF2FF] text-[#6366F1] dark:bg-indigo-950/60 dark:text-[#A5B4FC] border border-indigo-200/80 dark:border-indigo-800/60'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  u.status === 'Online' ? 'bg-[#6366F1]' : 'bg-slate-400 dark:bg-slate-600'
                                }`}
                              />
                              {u.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-2 text-slate-500 dark:text-[#8495AA]">{u.lastLogin}</td>
                          <td className="py-3.5 px-1 text-right">
                            <button type="button" title="Actions" className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-[#F1F5F9] rounded-lg hover:bg-slate-100 dark:hover:bg-[#1E314B] cursor-pointer">
                              <MoreHorizontal size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 dark:border-[#1E314B]">
                <button
                  type="button"
                  onClick={() => alert('Manage permissions drawer')}
                  className="text-sm sm:text-[15px] font-medium text-indigo-600 dark:text-[#818CF8] hover:underline flex items-center justify-between w-full cursor-pointer"
                >
                  <span>Manage Role Matrix & Permissions</span>
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Card 7: Integrations */}
          {(showTab('general') || showTab('integrations')) && (
            <div className="mimo-card p-6 sm:p-7 lg:p-8 !h-auto self-start flex flex-col">
              <div className="mimo-card-header !pb-4 !mb-4">
                <div>
                  <h2 className="text-xl sm:text-[22px] font-semibold text-slate-900 dark:text-[#F8FAFC] tracking-tight">
                    Integrations
                  </h2>
                  <p className="text-sm sm:text-[15px] text-slate-500 dark:text-[#94A3B8] mt-1">
                    Manage connected third-party providers & APIs
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs sm:text-[13px] font-medium bg-[#EEF2FF] text-[#4F46E5] dark:bg-indigo-950/70 dark:text-[#A5B4FC] border border-indigo-200 dark:border-indigo-800/60">
                  4 CONNECTED
                </span>
              </div>

              {/* 2-Column Responsive Grid for Integrations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
                {data.integrations.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 dark:bg-[#0C1829] border border-slate-200/90 dark:border-[#1E314B] flex items-center justify-between hover:bg-slate-100/90 dark:hover:bg-[#14243A] transition-all"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-base font-semibold text-slate-900 dark:text-[#F8FAFC] leading-snug truncate">
                        {item.name}
                      </p>
                      <span className="text-xs sm:text-sm font-medium text-[#6366F1] dark:text-[#A5B4FC] mt-0.5 inline-block">
                        {item.status}
                      </span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-[#EEF2FF] dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800/80 flex items-center justify-center text-[#6366F1] dark:text-[#A5B4FC] shrink-0">
                      <Check size={16} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-3 sm:gap-3.5 lg:gap-4">
          {/* Card 2: Kiosk Configuration */}
          {(showTab('general') || showTab('kiosks')) && (
            <div className="mimo-card p-6 sm:p-7 lg:p-8 flex flex-col justify-between">
              <div>
                <div className="mimo-card-header !pb-4 !mb-5">
                  <div>
                    <h2 className="text-xl sm:text-[22px] font-semibold text-slate-900 dark:text-[#F8FAFC] tracking-tight">
                      Kiosk Configuration
                    </h2>
                    <p className="text-sm sm:text-[15px] text-slate-500 dark:text-[#94A3B8] mt-1">
                      Manage all registered network kiosks
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => alert('Add Kiosk provisioning modal')}
                    className="flex items-center gap-1.5 px-4 h-10 sm:h-11 bg-[#EEF2FF] hover:bg-[#E0E7FF] dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-[#6366F1] dark:text-[#A5B4FC] rounded-xl text-sm font-medium transition-all cursor-pointer self-start sm:self-auto border border-indigo-200/80 dark:border-indigo-800/60 shadow-2xs"
                  >
                    <Plus size={16} />
                    <span>Add Kiosk</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-[#1E314B] text-xs sm:text-[13px] uppercase font-semibold text-slate-400 dark:text-[#8495AA]">
                        <th className="py-3 px-1">Name</th>
                        <th className="py-3 px-2">Location</th>
                        <th className="py-3 px-2">Status</th>
                        <th className="py-3 px-2">Model</th>
                        <th className="py-3 px-2">IP Address</th>
                        <th className="py-3 px-1 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#1E314B] text-sm sm:text-[15px]">
                      {data.kiosks.map((k) => (
                        <tr key={k.id} className="hover:bg-slate-50 dark:hover:bg-[#15253B] transition-colors h-[52px]">
                          <td className="py-3.5 px-1 font-semibold text-slate-900 dark:text-[#F1F5F9]">{k.name}</td>
                          <td className="py-3.5 px-2 text-slate-600 dark:text-[#C3CFDD]">{k.location}</td>
                          <td className="py-3.5 px-2">
                            <span
                              className={`inline-flex items-center gap-1.5 text-xs sm:text-[13px] font-medium px-2.5 py-1 rounded-full ${
                                k.status === 'Online'
                                  ? 'bg-[#EEF2FF] text-[#6366F1] dark:bg-indigo-950/60 dark:text-[#A5B4FC] border border-indigo-200/80 dark:border-indigo-800/60'
                                  : k.status === 'Offline'
                                  ? 'bg-[#FCE7F3] text-[#DB2777] dark:bg-pink-950/60 dark:text-[#F472B6] border border-pink-200/80 dark:border-pink-800/60'
                                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60'
                              }`}
                            >
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  k.status === 'Online'
                                    ? 'bg-[#6366F1]'
                                    : k.status === 'Offline'
                                    ? 'bg-[#EC4899]'
                                    : 'bg-amber-500'
                                }`}
                              />
                              {k.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-2 text-slate-600 dark:text-[#C3CFDD] font-mono text-xs sm:text-sm">{k.model}</td>
                          <td className="py-3.5 px-2 font-mono text-xs sm:text-sm text-slate-500 dark:text-[#8495AA]">{k.ipAddress}</td>
                          <td className="py-3.5 px-1 text-right">
                            <button type="button" title="Actions" className="p-1.5 text-slate-400 dark:text-[#8495AA] hover:text-slate-700 dark:hover:text-[#F1F5F9] rounded-lg hover:bg-slate-100 dark:hover:bg-[#1E314B] cursor-pointer">
                              <MoreHorizontal size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-[#1E314B]">
                <a href="/kiosks" className="text-sm sm:text-[15px] font-medium text-indigo-600 dark:text-[#818CF8] hover:underline flex items-center justify-between">
                  <span>View Full Kiosk Network</span>
                  <ChevronRight size={18} />
                </a>
              </div>
            </div>
          )}

          {/* Card 4: Pricing Settings */}
          {(showTab('general') || showTab('payments')) && (
            <div className="mimo-card p-6 sm:p-7 lg:p-8 flex flex-col justify-between">
              <div className="space-y-5">
                <div className="mimo-card-header !pb-4 !mb-4">
                  <div>
                    <h2 className="text-xl sm:text-[22px] font-semibold text-slate-900 dark:text-[#F8FAFC] tracking-tight">
                      Pricing & Payment Settings
                    </h2>
                    <p className="text-sm sm:text-[15px] text-slate-500 dark:text-[#94A3B8] mt-1">
                      Set per-page pricing and configure payment gateway options
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm sm:text-[15px] font-medium text-slate-900 dark:text-[#F8FAFC] block">
                      B&W Page Price (₹)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={pricingState.bwPrice}
                      onChange={(e) => setPricingState({ ...pricingState, bwPrice: parseFloat(e.target.value) || 0 })}
                      className="mimo-input text-sm sm:text-base font-semibold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm sm:text-[15px] font-medium text-slate-900 dark:text-[#F8FAFC] block">
                      Color Page Price (₹)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={pricingState.colorPrice}
                      onChange={(e) => setPricingState({ ...pricingState, colorPrice: parseFloat(e.target.value) || 0 })}
                      className="mimo-input text-sm sm:text-base font-semibold"
                    />
                  </div>
                </div>

                <div className="pt-2 space-y-4 divide-y divide-slate-100 dark:divide-[#1E314B]">
                  <div className="pt-2">
                    <SwitchToggle
                      checked={pricingState.acceptUpi}
                      onChange={(c) => setPricingState({ ...pricingState, acceptUpi: c })}
                      label="Accept UPI Payments"
                      description="Enable dynamic QR code generation for Google Pay, PhonePe, and Paytm"
                    />
                  </div>
                  <div className="pt-3">
                    <SwitchToggle
                      checked={pricingState.acceptCard}
                      onChange={(c) => setPricingState({ ...pricingState, acceptCard: c })}
                      label="Accept Debit & Credit Cards"
                      description="Enable card reader terminals for chip, swipe, and contactless payments"
                    />
                  </div>
                  <div className="pt-3">
                    <SwitchToggle
                      checked={pricingState.enableWallet}
                      onChange={(c) => setPricingState({ ...pricingState, enableWallet: c })}
                      label="Enable Campus Wallet"
                      description="Allow students and faculty to pay using registered campus card balance"
                    />
                  </div>
                  <div className="pt-3">
                    <SwitchToggle
                      checked={pricingState.autoRefund}
                      onChange={(c) => setPricingState({ ...pricingState, autoRefund: c })}
                      label="Auto-Refund on Print Failure"
                      description="Automatically refund user payment if the print job fails before completion"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-[#1E314B] flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveAll}
                  className="px-5 h-11 bg-[#6366F1] hover:bg-[#4F46E5] text-white rounded-xl text-sm sm:text-[15px] font-medium transition-all shadow-xs cursor-pointer"
                >
                  Save Pricing Rules
                </button>
              </div>
            </div>
          )}

          {/* Card 6: System Configuration */}
          {(showTab('general') || showTab('system')) && (
            <div className="mimo-card p-6 sm:p-7 lg:p-8 flex flex-col justify-between">
              <div className="space-y-5">
                <div className="mimo-card-header !pb-4 !mb-4">
                  <div>
                    <h2 className="text-xl sm:text-[22px] font-semibold text-slate-900 dark:text-[#F8FAFC] tracking-tight">
                      System Configuration
                    </h2>
                    <p className="text-sm sm:text-[15px] text-slate-500 dark:text-[#94A3B8] mt-1">
                      Low-level infrastructure and spooler backend endpoints
                    </p>
                  </div>
                </div>

                <div className="space-y-4 sm:space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-sm sm:text-[15px] font-medium text-slate-900 dark:text-[#F8FAFC] block">
                      Print Server (CUPS)
                    </label>
                    <input
                      type="text"
                      defaultValue={data.system.printServerCups}
                      className="mimo-input font-mono text-sm sm:text-base font-medium text-indigo-600 dark:text-[#818CF8]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm sm:text-[15px] font-medium text-slate-900 dark:text-[#F8FAFC] block">
                      Firebase Project ID
                    </label>
                    <input
                      type="text"
                      defaultValue={data.system.firebaseProject}
                      className="mimo-input font-mono text-sm sm:text-base font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm sm:text-[15px] font-medium text-slate-900 dark:text-[#F8FAFC] block">
                      Storage Bucket
                    </label>
                    <input
                      type="text"
                      defaultValue={data.system.storageBucket}
                      className="mimo-input font-mono text-sm sm:text-base font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm sm:text-[15px] font-medium text-slate-900 dark:text-[#F8FAFC] block">
                      Log Level
                    </label>
                    <select
                      defaultValue={data.system.logLevel}
                      className="mimo-select text-sm sm:text-base font-medium w-full"
                    >
                      <option value="Info">Info (Standard)</option>
                      <option value="Debug">Debug (Verbose)</option>
                      <option value="Warn">Warn (Warnings only)</option>
                      <option value="Error">Error (Errors only)</option>
                    </select>
                  </div>

                  <div className="pt-2 space-y-3 divide-y divide-slate-100 dark:divide-[#1E314B]">
                    <div className="pt-2">
                      <SwitchToggle
                        checked={systemState.maintenanceMode}
                        onChange={(c) => setSystemState({ ...systemState, maintenanceMode: c })}
                        label="Maintenance Mode"
                        description="Temporarily lock all kiosks with maintenance screen"
                      />
                    </div>
                    <div className="pt-3">
                      <SwitchToggle
                        checked={systemState.errorReporting}
                        onChange={(c) => setSystemState({ ...systemState, errorReporting: c })}
                        label="Enable Error Reporting"
                        description="Transmit telemetry exceptions to centralized telemetry stream"
                      />
                    </div>
                    <div className="pt-3">
                      <SwitchToggle
                        checked={systemState.backups}
                        onChange={(c) => setSystemState({ ...systemState, backups: c })}
                        label="Automatic Daily Backups"
                        description="Snapshot kiosk configurations and database transactions nightly"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-[#1E314B] flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveAll}
                  className="px-5 h-11 bg-[#6366F1] hover:bg-[#4F46E5] text-white rounded-xl text-sm sm:text-[15px] font-medium transition-all shadow-xs cursor-pointer"
                >
                  Save System Settings
                </button>
              </div>
            </div>
          )}

          {/* Card 8: Security & Policies */}
          {(showTab('general') || showTab('system')) && (
            <div className="mimo-card p-6 sm:p-7 lg:p-8 !h-auto self-start flex flex-col">
              <div>
                <div className="mimo-card-header !pb-4 !mb-5">
                  <div>
                    <h2 className="text-xl sm:text-[22px] font-semibold text-slate-900 dark:text-[#F8FAFC] tracking-tight">
                      Security & Policies
                    </h2>
                    <p className="text-sm sm:text-[15px] text-slate-500 dark:text-[#94A3B8] mt-1">
                      Access control, refund approvals, and audit rules
                    </p>
                  </div>
                </div>

                {/* Structured Setting Rows with generous spacing */}
                <div className="space-y-3 divide-y divide-slate-100 dark:divide-[#1E314B]">
                  <div className="pt-2">
                    <SwitchToggle
                      checked={securityState.requireApproval}
                      onChange={(c) => setSecurityState({ ...securityState, requireApproval: c })}
                      label="Require Admin Approval for Refunds"
                      description="Mandate operator approval before processing automatic refund disbursements"
                    />
                  </div>

                  <div className="pt-3">
                    <SwitchToggle
                      checked={securityState.auditLogging}
                      onChange={(c) => setSecurityState({ ...securityState, auditLogging: c })}
                      label="Enable Audit Logging"
                      description="Capture immutable ledger logs for all administrative sessions and print actions"
                    />
                  </div>

                  <div className="pt-3">
                    <SwitchToggle
                      checked={securityState.restrictUsb}
                      onChange={(c) => setSecurityState({ ...securityState, restrictUsb: c })}
                      label="Restrict USB Printing"
                      description="Enforce cloud/QR upload only and disable physical USB drive connectivity"
                    />
                  </div>

                  {/* Session Timeout Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3.5 min-h-[52px]">
                    <div>
                      <p className="text-sm sm:text-[15px] font-medium text-slate-900 dark:text-[#F8FAFC] leading-snug">
                        Session Timeout
                      </p>
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-[#94A3B8] mt-0.5">
                        Automatically terminate inactive operator and kiosk sessions
                      </p>
                    </div>
                    <select
                      value={securityState.sessionTimeout}
                      onChange={(e) => setSecurityState({ ...securityState, sessionTimeout: parseInt(e.target.value) })}
                      className="mimo-select text-sm sm:text-base font-medium px-4 rounded-xl min-w-[160px] self-start sm:self-auto"
                    >
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>60 minutes</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full-Width Data Management Card */}
      <div className="mimo-card p-6 sm:p-7 lg:p-8">
        <div className="mimo-card-header !pb-4 !mb-5">
          <div>
            <h2 className="text-xl sm:text-[22px] font-semibold text-slate-900 dark:text-[#F8FAFC] tracking-tight">
              Data Management & Fleet Backup
            </h2>
            <p className="text-sm sm:text-[15px] text-slate-500 dark:text-[#94A3B8] mt-1">
              Configuration snapshot serialization, system recovery, and factory defaults
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-3.5 lg:gap-4">
          <button
            type="button"
            onClick={() => alert('Exporting fleet configuration JSON...')}
            className="p-5 rounded-2xl bg-slate-50 dark:bg-[#0C1829] hover:bg-slate-100 dark:hover:bg-[#14243A] border border-slate-200 dark:border-[#1E314B] text-left transition-all cursor-pointer flex items-center justify-between group"
          >
            <div>
              <p className="text-base font-semibold text-slate-900 dark:text-[#F8FAFC]">Backup Configuration</p>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-[#94A3B8] mt-0.5">Download current JSON state</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-[#818CF8] shrink-0 ml-2 group-hover:scale-105 transition-transform">
              <Download size={19} />
            </div>
          </button>

          <button
            type="button"
            onClick={() => alert('Select configuration file to restore...')}
            className="p-5 rounded-2xl bg-slate-50 dark:bg-[#0C1829] hover:bg-slate-100 dark:hover:bg-[#14243A] border border-slate-200 dark:border-[#1E314B] text-left transition-all cursor-pointer flex items-center justify-between group"
          >
            <div>
              <p className="text-base font-semibold text-slate-900 dark:text-[#F8FAFC]">Restore Configuration</p>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-[#94A3B8] mt-0.5">Upload and overwrite settings</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800/60 flex items-center justify-center text-[#3B82F6] dark:text-sky-400 shrink-0 ml-2 group-hover:scale-105 transition-transform">
              <Upload size={19} />
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              if (confirm('Reset to factory default configuration?')) {
                alert('Configuration reset to defaults.');
              }
            }}
            className="p-5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/20 hover:bg-rose-100/80 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-left transition-all cursor-pointer flex items-center justify-between group"
          >
            <div>
              <p className="text-base font-semibold text-rose-700 dark:text-rose-400">Reset to Defaults</p>
              <p className="text-xs sm:text-sm text-rose-600/80 dark:text-rose-400/70 mt-0.5">Restore original factory image</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/60 border border-rose-200 dark:border-rose-800/80 flex items-center justify-center text-rose-700 dark:text-rose-300 shrink-0 ml-2 group-hover:scale-105 transition-transform">
              <RotateCcw size={19} />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
