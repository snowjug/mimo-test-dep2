import React, { useState, useEffect } from 'react';
import {
  Save,
  Plus,
  MoreHorizontal,
  CheckCircle2,
  Shield,
  Printer,
  DollarSign,
  Users,
  Settings,
  HardDrive,
  Layers,
  Download,
  Upload,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { configurationService } from '../../services/configuration.service';
import { ConfigurationPageData } from '../../types/configuration.types';
import { Badge } from '../../components/ui/Badge';

export const ConfigurationPage: React.FC = () => {
  const [data, setData] = useState<ConfigurationPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await configurationService.getConfiguration();
        setData(res);
      } catch (err) {
        console.error('Failed to load configuration:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSaveAll = async () => {
    if (!data) return;
    setSaving(true);
    try {
      await configurationService.saveConfiguration(data);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save configuration settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 font-sans">
        <Loader2 className="w-10 h-10 animate-spin text-[#20D3A2]" />
        <p className="text-sm font-bold text-[#8EA6BF] uppercase tracking-wider">
          Loading Configuration Control Plane...
        </p>
      </div>
    );
  }

  const tabs = [
    { id: 'general', label: 'General', icon: Layers },
    { id: 'kiosks', label: 'Kiosk Settings', icon: HardDrive },
    { id: 'print', label: 'Print & Document', icon: Printer },
    { id: 'payments', label: 'Payments', icon: DollarSign },
    { id: 'users', label: 'Users & Access', icon: Users },
    { id: 'integrations', label: 'Integrations', icon: Shield },
    { id: 'system', label: 'System', icon: Settings },
  ];

  return (
    <div className="space-y-8 sm:space-y-10 select-none font-sans text-[#F5F7FA] w-full">
      {/* 1. Header matching Image 1 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#6F89A3] mb-1.5">
            <span>←</span>
            <span>Configuration</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-[#F5F7FA] tracking-tight">
            Configuration
          </h1>
          <p className="text-base sm:text-lg font-medium text-[#8EA6BF] mt-1.5 leading-relaxed">
            Manage kiosks, system settings, print policies and integrations for MIMO.
          </p>
        </div>

        <div className="flex items-center gap-3.5 self-start sm:self-auto">
          {savedSuccess && (
            <span className="flex items-center gap-2 text-sm font-bold text-[#20D3A2] bg-[#20D3A2]/20 px-4 py-2 rounded-xl border border-[#20D3A2]/30 shadow-xs">
              <CheckCircle2 size={16} />
              Saved successfully!
            </span>
          )}
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving}
            className="min-h-[44px] flex items-center gap-2.5 px-6 py-2.5 bg-[#20D3A2] hover:bg-[#1bb88d] active:scale-98 text-[#07111F] text-sm font-black rounded-xl shadow-lg shadow-[#20D3A2]/25 transition-all cursor-pointer"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            <span>{saving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* 2. Top Navigation Tabs */}
      <div className="flex items-center gap-2.5 overflow-x-auto pb-3 border-b border-[#1D3A59]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[44px] flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#20D3A2]/20 text-[#20D3A2] border border-[#20D3A2]/40 shadow-xs'
                  : 'bg-[#10223A] text-[#8EA6BF] border border-[#1D3A59] hover:text-[#F5F7FA] hover:border-[#20D3A2]/40'
              }`}
            >
              <Icon size={16} className={isActive ? 'text-[#20D3A2]' : 'text-[#8EA6BF]'} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Three-Column Card Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-7 items-start">
        {/* ================= COLUMN 1 ================= */}
        <div className="space-y-6 sm:space-y-7">
          {/* Card 1: Platform Settings */}
          <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 sm:p-7 shadow-xl space-y-5">
            <div>
              <h2 className="text-base font-extrabold text-[#F5F7FA]">Platform Settings</h2>
              <p className="text-xs text-[#8EA6BF] font-medium mt-0.5">Core system configuration</p>
            </div>

            <div className="space-y-4 text-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-[#8EA6BF] font-semibold w-full sm:w-1/3">Platform Name</label>
                <input
                  type="text"
                  value={data.platform.platformName}
                  onChange={(e) =>
                    setData({ ...data, platform: { ...data.platform, platformName: e.target.value } })
                  }
                  className="flex-1 px-3.5 py-2 bg-[#0A1728] border border-[#1D3A59] rounded-xl text-[#F5F7FA] font-medium focus:outline-none focus:border-[#20D3A2]"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-[#8EA6BF] font-semibold w-full sm:w-1/3">Timezone</label>
                <select
                  value={data.platform.timezone}
                  onChange={(e) =>
                    setData({ ...data, platform: { ...data.platform, timezone: e.target.value } })
                  }
                  className="flex-1 px-3.5 py-2 bg-[#0A1728] border border-[#1D3A59] rounded-xl text-[#F5F7FA] font-medium focus:outline-none focus:border-[#20D3A2]"
                >
                  <option>Asia/Kolkata (IST)</option>
                  <option>UTC</option>
                  <option>America/New_York (EST)</option>
                </select>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-[#8EA6BF] font-semibold w-full sm:w-1/3">Date Format</label>
                <select
                  value={data.platform.dateFormat}
                  onChange={(e) =>
                    setData({ ...data, platform: { ...data.platform, dateFormat: e.target.value } })
                  }
                  className="flex-1 px-3.5 py-2 bg-[#0A1728] border border-[#1D3A59] rounded-xl text-[#F5F7FA] font-medium focus:outline-none focus:border-[#20D3A2]"
                >
                  <option>DD MMM YYYY</option>
                  <option>YYYY-MM-DD</option>
                  <option>MM/DD/YYYY</option>
                </select>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-[#8EA6BF] font-semibold w-full sm:w-1/3">Currency</label>
                <select
                  value={data.platform.currency}
                  onChange={(e) =>
                    setData({ ...data, platform: { ...data.platform, currency: e.target.value } })
                  }
                  className="flex-1 px-3.5 py-2 bg-[#0A1728] border border-[#1D3A59] rounded-xl text-[#F5F7FA] font-medium focus:outline-none focus:border-[#20D3A2]"
                >
                  <option>INR (₹)</option>
                  <option>USD ($)</option>
                  <option>EUR (€)</option>
                </select>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-[#8EA6BF] font-semibold w-full sm:w-1/3">Default Language</label>
                <select
                  value={data.platform.defaultLanguage}
                  onChange={(e) =>
                    setData({ ...data, platform: { ...data.platform, defaultLanguage: e.target.value } })
                  }
                  className="flex-1 px-3.5 py-2 bg-[#0A1728] border border-[#1D3A59] rounded-xl text-[#F5F7FA] font-medium focus:outline-none focus:border-[#20D3A2]"
                >
                  <option>English</option>
                  <option>Hindi</option>
                  <option>Kannada</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveAll}
                  className="px-4 py-2 bg-[#20D3A2] hover:bg-[#1bb88d] text-[#07111F] font-black rounded-xl text-xs sm:text-sm transition-all cursor-pointer shadow-xs"
                >
                  Save
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Pricing & Payment Settings */}
          <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 sm:p-7 shadow-xl space-y-5">
            <div>
              <h2 className="text-base font-extrabold text-[#F5F7FA]">Pricing & Payment Settings</h2>
              <p className="text-xs text-[#8EA6BF] font-medium mt-0.5">Configure pricing, payment methods and revenue settings</p>
            </div>

            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <label className="text-[#8EA6BF] font-semibold">B&W Page Price (₹)</label>
                <input
                  type="number"
                  step="0.5"
                  value={data.pricing.bwPagePrice}
                  onChange={(e) =>
                    setData({
                      ...data,
                      pricing: { ...data.pricing, bwPagePrice: parseFloat(e.target.value) || 0 },
                    })
                  }
                  className="w-28 px-3.5 py-2 bg-[#0A1728] border border-[#1D3A59] rounded-xl text-right text-[#F5F7FA] font-bold focus:outline-none focus:border-[#20D3A2]"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-[#8EA6BF] font-semibold">Color Page Price (₹)</label>
                <input
                  type="number"
                  step="0.5"
                  value={data.pricing.colorPagePrice}
                  onChange={(e) =>
                    setData({
                      ...data,
                      pricing: { ...data.pricing, colorPagePrice: parseFloat(e.target.value) || 0 },
                    })
                  }
                  className="w-28 px-3.5 py-2 bg-[#0A1728] border border-[#1D3A59] rounded-xl text-right text-[#F5F7FA] font-bold focus:outline-none focus:border-[#20D3A2]"
                />
              </div>

              {/* Toggles */}
              {[
                { label: 'Accept UPI Payments', key: 'acceptUpi' },
                { label: 'Accept Card Payments', key: 'acceptCard' },
                { label: 'Accept Cash Payments', key: 'acceptCash' },
                { label: 'Enable Wallet/Prepaid', key: 'enableWallet' },
                { label: 'Auto Refund on Failure', key: 'autoRefundOnFailure' },
              ].map((t) => {
                const isChecked = (data.pricing as any)[t.key];
                return (
                  <div key={t.key} className="flex items-center justify-between pt-1">
                    <span className="text-[#8EA6BF] font-medium">{t.label}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setData({
                          ...data,
                          pricing: { ...data.pricing, [t.key]: !isChecked },
                        })
                      }
                      className={`w-12 h-6 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                        isChecked ? 'bg-[#20D3A2]' : 'bg-[#132943] border border-[#1D3A59]'
                      }`}
                    >
                      <div
                        className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform ${
                          isChecked ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card 3: Integrations */}
          <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 sm:p-7 shadow-xl space-y-4">
            <div>
              <h2 className="text-base font-extrabold text-[#F5F7FA]">Integrations</h2>
              <p className="text-xs text-[#8EA6BF] font-medium mt-0.5">Manage third-party services</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              {data.integrations.map((intg) => (
                <div
                  key={intg.id}
                  className="p-3 border border-[#1D3A59] rounded-xl bg-[#0A1728] flex items-center justify-between hover:border-[#20D3A2]/40 transition-colors"
                >
                  <div className="min-w-0 pr-1">
                    <p className="font-bold text-[#F5F7FA] truncate">{intg.name}</p>
                    <span className="text-xs font-semibold text-[#20D3A2]">Connected</span>
                  </div>
                  <span className="text-[#6F89A3] text-sm">›</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ================= COLUMN 2 ================= */}
        <div className="space-y-6 sm:space-y-7">
          {/* Card 4: Kiosk Configuration Table */}
          <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 sm:p-7 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-[#F5F7FA]">Kiosk Configuration</h2>
                <p className="text-xs text-[#8EA6BF] font-medium mt-0.5">Manage all registered kiosks</p>
              </div>
              <button
                type="button"
                onClick={() => alert('New kiosk registration modal')}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0A1728] border border-[#1D3A59] hover:border-[#20D3A2]/50 text-[#8EA6BF] hover:text-[#F5F7FA] font-bold rounded-xl text-xs transition-all cursor-pointer"
              >
                <Plus size={14} />
                <span>Add Kiosk</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="text-xs text-[#8EA6BF] border-b border-[#1D3A59] font-black uppercase">
                    <th className="py-2.5 pr-2">Name</th>
                    <th className="py-2.5 px-2">Location</th>
                    <th className="py-2.5 px-2">Status</th>
                    <th className="py-2.5 px-2">Model</th>
                    <th className="py-2.5 px-2">IP Address</th>
                    <th className="py-2.5 pl-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1D3A59]">
                  {data.kiosks.map((kiosk) => (
                    <tr key={kiosk.id} className="hover:bg-[#132943]/80 font-medium text-[#8EA6BF]">
                      <td className="py-3 pr-2 font-bold text-[#F5F7FA]">{kiosk.name}</td>
                      <td className="py-3 px-2 text-[#8EA6BF]">{kiosk.location}</td>
                      <td className="py-3 px-2">
                        <Badge
                          variant={
                            kiosk.status === 'Online'
                              ? 'online'
                              : kiosk.status === 'Offline'
                              ? 'offline'
                              : 'maintenance'
                          }
                          size="sm"
                        >
                          {kiosk.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-[#8EA6BF]">{kiosk.model}</td>
                      <td className="py-3 px-2 text-[#8EA6BF] font-mono text-xs">{kiosk.ipAddress}</td>
                      <td className="py-3 pl-2 text-right">
                        <button type="button" className="text-[#8EA6BF] hover:text-[#F5F7FA] p-1.5 cursor-pointer">
                          <MoreHorizontal size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-2 text-right">
              <span className="text-xs sm:text-sm font-bold text-[#20D3A2] hover:text-[#1bb88d] cursor-pointer inline-flex items-center gap-1">
                View All Kiosks →
              </span>
            </div>
          </div>

          {/* Card 5: User & Access Management */}
          <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 sm:p-7 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-[#F5F7FA]">User & Access Management</h2>
                <p className="text-xs text-[#8EA6BF] font-medium mt-0.5">Manage admin users and role permissions</p>
              </div>
              <button
                type="button"
                onClick={() => alert('New user registration modal')}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0A1728] border border-[#1D3A59] hover:border-[#20D3A2]/50 text-[#8EA6BF] hover:text-[#F5F7FA] font-bold rounded-xl text-xs transition-all cursor-pointer"
              >
                <Plus size={14} />
                <span>Add User</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="text-xs text-[#8EA6BF] border-b border-[#1D3A59] font-black uppercase">
                    <th className="py-2.5 pr-2">Name</th>
                    <th className="py-2.5 px-2">Role</th>
                    <th className="py-2.5 px-2">Email</th>
                    <th className="py-2.5 px-2">Status</th>
                    <th className="py-2.5 px-2">Last Login</th>
                    <th className="py-2.5 pl-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1D3A59]">
                  {data.users.map((user) => (
                    <tr key={user.id} className="hover:bg-[#132943]/80 font-medium text-[#8EA6BF]">
                      <td className="py-3 pr-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-[#20D3A2]/20 text-[#20D3A2] text-xs font-bold flex items-center justify-center border border-[#20D3A2]/30">
                            {user.name.charAt(0)}
                          </div>
                          <span className="font-bold text-[#F5F7FA]">{user.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-[#8EA6BF]">{user.role}</td>
                      <td className="py-3 px-2 text-[#8EA6BF]">{user.email}</td>
                      <td className="py-3 px-2">
                        <Badge variant={user.status === 'Online' ? 'online' : 'offline'} size="sm">
                          {user.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-[#8EA6BF] text-xs">{user.lastLogin}</td>
                      <td className="py-3 pl-2 text-right">
                        <button type="button" className="text-[#8EA6BF] hover:text-[#F5F7FA] p-1.5 cursor-pointer">
                          <MoreHorizontal size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-2 text-right">
              <span className="text-xs sm:text-sm font-bold text-[#20D3A2] hover:text-[#1bb88d] cursor-pointer inline-flex items-center gap-1">
                Manage Permissions →
              </span>
            </div>
          </div>

          {/* Card 6: Security & Policies */}
          <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 sm:p-7 shadow-xl space-y-4">
            <div>
              <h2 className="text-base font-extrabold text-[#F5F7FA]">Security & Policies</h2>
              <p className="text-xs text-[#8EA6BF] font-medium mt-0.5">Access control and operational policies</p>
            </div>

            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[#8EA6BF] font-medium">Require Admin Approval for Refunds</span>
                <button
                  type="button"
                  onClick={() =>
                    setData({
                      ...data,
                      security: {
                        ...data.security,
                        requireAdminApprovalForRefunds: !data.security.requireAdminApprovalForRefunds,
                      },
                    })
                  }
                  className={`w-12 h-6 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                    data.security.requireAdminApprovalForRefunds ? 'bg-[#20D3A2]' : 'bg-[#132943] border border-[#1D3A59]'
                  }`}
                >
                  <div
                    className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform ${
                      data.security.requireAdminApprovalForRefunds ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#8EA6BF] font-medium">Enable Audit Logging</span>
                <button
                  type="button"
                  onClick={() =>
                    setData({
                      ...data,
                      security: { ...data.security, enableAuditLogging: !data.security.enableAuditLogging },
                    })
                  }
                  className={`w-12 h-6 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                    data.security.enableAuditLogging ? 'bg-[#20D3A2]' : 'bg-[#132943] border border-[#1D3A59]'
                  }`}
                >
                  <div
                    className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform ${
                      data.security.enableAuditLogging ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#8EA6BF] font-medium">Restrict USB Printing</span>
                <button
                  type="button"
                  onClick={() =>
                    setData({
                      ...data,
                      security: { ...data.security, restrictUsbPrinting: !data.security.restrictUsbPrinting },
                    })
                  }
                  className={`w-12 h-6 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                    data.security.restrictUsbPrinting ? 'bg-[#20D3A2]' : 'bg-[#132943] border border-[#1D3A59]'
                  }`}
                >
                  <div
                    className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform ${
                      data.security.restrictUsbPrinting ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[#8EA6BF] font-semibold">Session Timeout (Admin)</span>
                <select
                  value={`${data.security.sessionTimeoutMinutes} minutes`}
                  onChange={(e) =>
                    setData({
                      ...data,
                      security: {
                        ...data.security,
                        sessionTimeoutMinutes: parseInt(e.target.value) || 30,
                      },
                    })
                  }
                  className="px-3.5 py-1.5 bg-[#0A1728] border border-[#1D3A59] rounded-xl text-xs sm:text-sm font-medium text-[#F5F7FA]"
                >
                  <option>15 minutes</option>
                  <option>30 minutes</option>
                  <option>60 minutes</option>
                  <option>120 minutes</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ================= COLUMN 3 ================= */}
        <div className="space-y-6 sm:space-y-7">
          {/* Card 7: Print Settings */}
          <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 sm:p-7 shadow-xl space-y-5">
            <div>
              <h2 className="text-base font-extrabold text-[#F5F7FA]">Print Settings</h2>
              <p className="text-xs text-[#8EA6BF] font-medium mt-0.5">Configure print behavior and limits</p>
            </div>

            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[#F5F7FA] font-semibold">Allow B&W Printing</p>
                  <p className="text-xs text-[#8EA6BF]">Enable black & white printing</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setData({ ...data, print: { ...data.print, allowBwPrinting: !data.print.allowBwPrinting } })
                  }
                  className={`w-12 h-6 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                    data.print.allowBwPrinting ? 'bg-[#20D3A2]' : 'bg-[#132943] border border-[#1D3A59]'
                  }`}
                >
                  <div
                    className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform ${
                      data.print.allowBwPrinting ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[#F5F7FA] font-semibold">Allow Color Printing</p>
                  <p className="text-xs text-[#8EA6BF]">Enable color printing</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setData({ ...data, print: { ...data.print, allowColorPrinting: !data.print.allowColorPrinting } })
                  }
                  className={`w-12 h-6 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                    data.print.allowColorPrinting ? 'bg-[#20D3A2]' : 'bg-[#132943] border border-[#1D3A59]'
                  }`}
                >
                  <div
                    className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform ${
                      data.print.allowColorPrinting ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#8EA6BF] font-semibold">Default Print Mode</span>
                <select
                  value={data.print.defaultPrintMode}
                  onChange={(e) =>
                    setData({
                      ...data,
                      print: { ...data.print, defaultPrintMode: e.target.value as 'B&W' | 'Color' },
                    })
                  }
                  className="px-3.5 py-1.5 bg-[#0A1728] border border-[#1D3A59] rounded-xl font-medium text-[#F5F7FA]"
                >
                  <option>B&W</option>
                  <option>Color</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#8EA6BF] font-semibold">Max Pages per Job</span>
                <input
                  type="number"
                  value={data.print.maxPagesPerJob}
                  onChange={(e) =>
                    setData({
                      ...data,
                      print: { ...data.print, maxPagesPerJob: parseInt(e.target.value) || 1 },
                    })
                  }
                  className="w-24 px-3 py-1.5 bg-[#0A1728] border border-[#1D3A59] rounded-xl text-right font-bold text-[#F5F7FA]"
                />
              </div>

              <div className="flex items-start justify-between gap-2">
                <span className="text-[#8EA6BF] font-semibold shrink-0">Supported File Types</span>
                <span className="text-xs font-mono font-bold text-[#20D3A2] text-right bg-[#0A1728] border border-[#1D3A59] px-2.5 py-1 rounded-lg">
                  {data.print.supportedFileTypes.join(', ')}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="text-[#F5F7FA] font-semibold">Auto Delete Files</p>
                  <p className="text-xs text-[#8EA6BF]">Delete files after 24 hours</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setData({ ...data, print: { ...data.print, autoDeleteFiles: !data.print.autoDeleteFiles } })
                  }
                  className={`w-12 h-6 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                    data.print.autoDeleteFiles ? 'bg-[#20D3A2]' : 'bg-[#132943] border border-[#1D3A59]'
                  }`}
                >
                  <div
                    className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform ${
                      data.print.autoDeleteFiles ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Card 8: System Configuration */}
          <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 sm:p-7 shadow-xl space-y-4">
            <div>
              <h2 className="text-base font-extrabold text-[#F5F7FA]">System Configuration</h2>
              <p className="text-xs text-[#8EA6BF] font-medium mt-0.5">Low-level system settings</p>
            </div>

            <div className="space-y-3.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#8EA6BF] font-semibold">Print Server (CUPS)</span>
                <input
                  type="text"
                  value={data.system.printServerCups}
                  onChange={(e) =>
                    setData({ ...data, system: { ...data.system, printServerCups: e.target.value } })
                  }
                  className="w-36 px-3 py-1.5 bg-[#0A1728] border border-[#1D3A59] rounded-xl text-right font-mono text-xs text-[#F5F7FA]"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[#8EA6BF] font-semibold">Firebase Project</span>
                <input
                  type="text"
                  value={data.system.firebaseProject}
                  onChange={(e) =>
                    setData({ ...data, system: { ...data.system, firebaseProject: e.target.value } })
                  }
                  className="w-36 px-3 py-1.5 bg-[#0A1728] border border-[#1D3A59] rounded-xl text-right font-mono text-xs text-[#F5F7FA]"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[#8EA6BF] font-semibold">Storage Bucket</span>
                <input
                  type="text"
                  value={data.system.storageBucket}
                  onChange={(e) =>
                    setData({ ...data, system: { ...data.system, storageBucket: e.target.value } })
                  }
                  className="w-36 px-3 py-1.5 bg-[#0A1728] border border-[#1D3A59] rounded-xl text-right font-mono text-xs text-[#F5F7FA]"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[#8EA6BF] font-semibold">Log Level</span>
                <select
                  value={data.system.logLevel}
                  onChange={(e) =>
                    setData({ ...data, system: { ...data.system, logLevel: e.target.value as any } })
                  }
                  className="px-3 py-1.5 bg-[#0A1728] border border-[#1D3A59] rounded-xl font-medium text-[#F5F7FA]"
                >
                  <option>Debug</option>
                  <option>Info</option>
                  <option>Warn</option>
                  <option>Error</option>
                </select>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="text-[#F5F7FA] font-semibold">Maintenance Mode</p>
                  <p className="text-xs text-[#8EA6BF]">Disable public kiosk access</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setData({ ...data, system: { ...data.system, maintenanceMode: !data.system.maintenanceMode } })
                  }
                  className={`w-12 h-6 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                    data.system.maintenanceMode ? 'bg-[#20D3A2]' : 'bg-[#132943] border border-[#1D3A59]'
                  }`}
                >
                  <div
                    className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform ${
                      data.system.maintenanceMode ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#8EA6BF] font-semibold">Enable Error Reporting</span>
                <button
                  type="button"
                  onClick={() =>
                    setData({
                      ...data,
                      system: { ...data.system, enableErrorReporting: !data.system.enableErrorReporting },
                    })
                  }
                  className={`w-12 h-6 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                    data.system.enableErrorReporting ? 'bg-[#20D3A2]' : 'bg-[#132943] border border-[#1D3A59]'
                  }`}
                >
                  <div
                    className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform ${
                      data.system.enableErrorReporting ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#8EA6BF] font-semibold">Automatic Backups</span>
                <button
                  type="button"
                  onClick={() =>
                    setData({ ...data, system: { ...data.system, automaticBackups: !data.system.automaticBackups } })
                  }
                  className={`w-12 h-6 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                    data.system.automaticBackups ? 'bg-[#20D3A2]' : 'bg-[#132943] border border-[#1D3A59]'
                  }`}
                >
                  <div
                    className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform ${
                      data.system.automaticBackups ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Card 9: Data Management */}
          <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 sm:p-7 shadow-xl space-y-4">
            <div>
              <h2 className="text-base font-extrabold text-[#F5F7FA]">Data Management</h2>
              <p className="text-xs text-[#8EA6BF] font-medium mt-0.5">Backup, restore and data controls</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => alert('Configuration snapshot downloaded.')}
                className="flex-1 min-h-[44px] p-2.5 bg-[#0A1728] hover:bg-[#132943] border border-[#1D3A59] rounded-xl text-xs sm:text-sm font-bold text-[#8EA6BF] hover:text-[#F5F7FA] flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Download size={15} />
                <span>Backup</span>
              </button>
              <button
                type="button"
                onClick={() => alert('Select configuration file to restore.')}
                className="flex-1 min-h-[44px] p-2.5 bg-[#0A1728] hover:bg-[#132943] border border-[#1D3A59] rounded-xl text-xs sm:text-sm font-bold text-[#8EA6BF] hover:text-[#F5F7FA] flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Upload size={15} />
                <span>Restore</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Reset to factory default configuration?')) {
                    alert('Configuration reset to defaults.');
                  }
                }}
                className="min-h-[44px] px-3.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 rounded-xl text-xs sm:text-sm font-bold text-rose-400 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <RotateCcw size={15} />
                <span>Reset</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
