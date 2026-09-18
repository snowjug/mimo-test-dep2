import React, { useEffect, useState } from 'react';
import {
  Save,
  Shield,
  IndianRupee,
  Printer,
  Globe,
  Database,
  Users,
  Check,
} from 'lucide-react';
import { configurationService } from '../../services/configuration.service';
import type { ConfigurationPageData } from '../../types/configuration.types';
import { Badge } from '../../components/ui/Badge';

interface ConfigurationPageProps {
  searchQuery?: string;
}

export const ConfigurationPage: React.FC<ConfigurationPageProps> = () => {
  const [data, setData] = useState<ConfigurationPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<string>('all');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [pricingState, setPricingState] = useState({
    bwPrice: 3.0,
    colorPrice: 10.0,
    acceptUpi: true,
    acceptCard: true,
    acceptCash: true,
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

  const handleSave = () => {
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

  const sections = [
    { id: 'all', label: 'All Settings' },
    { id: 'platform', label: 'Platform' },
    { id: 'pricing', label: 'Pricing & Billing' },
    { id: 'print', label: 'Print Engine' },
    { id: 'integrations', label: 'Integrations' },
    { id: 'users', label: 'Access Control' },
    { id: 'system', label: 'Diagnostics' },
  ];

  const showSection = (sec: string) => {
    if (activeSection === 'all') return true;
    return activeSection === sec;
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black text-[#F5F7FA] tracking-tight">
              Fleet Configuration
            </h1>
            <Badge variant="printing" size="sm">
              SYSTEM CONTROLS
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-[#8EA6BF] font-medium mt-1">
            Manage global pricing rules, print engine parameters, security policies, and integrations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#20D3A2] hover:bg-[#20D3A2]/90 text-[#07111F] rounded-xl text-xs font-black transition-all shadow-md shadow-[#20D3A2]/20 cursor-pointer"
          >
            {saveSuccess ? <Check size={16} /> : <Save size={16} />}
            <span>{saveSuccess ? 'Changes Saved' : 'Save Config'}</span>
          </button>
        </div>
      </div>

      {/* Navigation Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-b border-[#1D3A59] pt-1">
        {sections.map((sec) => (
          <button
            key={sec.id}
            type="button"
            onClick={() => setActiveSection(sec.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeSection === sec.id
                ? 'bg-[#20D3A2] text-[#07111F] font-black shadow-md shadow-[#20D3A2]/20'
                : 'bg-[#10223A] text-[#8EA6BF] hover:text-[#F5F7FA] hover:bg-[#132943] border border-[#1D3A59]'
            }`}
          >
            {sec.label}
          </button>
        ))}
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6">
        {/* 1. Platform & Localization */}
        {showSection('platform') && (
          <div className="p-5 sm:p-6 rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 pb-3 border-b border-[#1D3A59]">
                <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0">
                  <Globe size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#F5F7FA]">Platform & Locale</h3>
                  <p className="text-[11px] text-[#8EA6BF]">Regional defaults</p>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-xs">
                <div>
                  <label className="text-[11px] text-[#8EA6BF] font-semibold block mb-1">
                    Platform Instance Name
                  </label>
                  <input
                    type="text"
                    defaultValue={data.platform.platformName}
                    className="w-full px-3 py-2 bg-[#07111F] border border-[#1D3A59] rounded-xl text-xs text-[#F5F7FA] focus:border-[#20D3A2] outline-hidden"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[#8EA6BF] font-semibold block mb-1">
                      Timezone
                    </label>
                    <input
                      type="text"
                      disabled
                      value={data.platform.timezone}
                      className="w-full px-3 py-2 bg-[#07111F]/50 border border-[#1D3A59]/60 rounded-xl text-xs text-[#CAD7E6] opacity-80"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#8EA6BF] font-semibold block mb-1">
                      Currency
                    </label>
                    <input
                      type="text"
                      disabled
                      value={data.platform.currency}
                      className="w-full px-3 py-2 bg-[#07111F]/50 border border-[#1D3A59]/60 rounded-xl text-xs text-[#CAD7E6] opacity-80"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. Pricing & Payments */}
        {showSection('pricing') && (
          <div className="p-5 sm:p-6 rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 pb-3 border-b border-[#1D3A59]">
                <div className="w-9 h-9 rounded-xl bg-[#20D3A2]/15 border border-[#20D3A2]/30 text-[#20D3A2] flex items-center justify-center shrink-0">
                  <IndianRupee size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#F5F7FA]">Pricing & Billing</h3>
                  <p className="text-[11px] text-[#8EA6BF]">Per-page rate card</p>
                </div>
              </div>

              <div className="mt-4 space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[#8EA6BF] font-semibold block mb-1">
                      B&W Rate (₹/page)
                    </label>
                    <input
                      type="number"
                      value={pricingState.bwPrice}
                      onChange={(e) =>
                        setPricingState({ ...pricingState, bwPrice: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2 bg-[#07111F] border border-[#1D3A59] rounded-xl text-xs font-bold text-[#20D3A2] focus:border-[#20D3A2] outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#8EA6BF] font-semibold block mb-1">
                      Color Rate (₹/page)
                    </label>
                    <input
                      type="number"
                      value={pricingState.colorPrice}
                      onChange={(e) =>
                        setPricingState({ ...pricingState, colorPrice: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2 bg-[#07111F] border border-[#1D3A59] rounded-xl text-xs font-bold text-sky-400 focus:border-[#20D3A2] outline-hidden"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-[#1D3A59]/60 space-y-2">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-xs text-[#CAD7E6]">Accept UPI QR Payments</span>
                    <input
                      type="checkbox"
                      checked={pricingState.acceptUpi}
                      onChange={(e) =>
                        setPricingState({ ...pricingState, acceptUpi: e.target.checked })
                      }
                      className="w-4 h-4 accent-[#20D3A2]"
                    />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-xs text-[#CAD7E6]">Accept Debit/Credit Cards</span>
                    <input
                      type="checkbox"
                      checked={pricingState.acceptCard}
                      onChange={(e) =>
                        setPricingState({ ...pricingState, acceptCard: e.target.checked })
                      }
                      className="w-4 h-4 accent-[#20D3A2]"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. Print Engine Policies */}
        {showSection('print') && (
          <div className="p-5 sm:p-6 rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 pb-3 border-b border-[#1D3A59]">
                <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center shrink-0">
                  <Printer size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#F5F7FA]">Print Engine Parameters</h3>
                  <p className="text-[11px] text-[#8EA6BF]">CUPS & raster rules</p>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-xs">
                <div>
                  <label className="text-[11px] text-[#8EA6BF] font-semibold block mb-1">
                    Max Pages Per Job
                  </label>
                  <input
                    type="number"
                    defaultValue={data.print.maxPagesPerJob}
                    className="w-full px-3 py-2 bg-[#07111F] border border-[#1D3A59] rounded-xl text-xs text-[#F5F7FA] focus:border-[#20D3A2] outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#8EA6BF] font-semibold block mb-1">
                    Allowed Formats
                  </label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {data.print.supportedFileTypes.map((ext) => (
                      <span
                        key={ext}
                        className="px-2 py-0.5 rounded-md bg-[#07111F] text-[#20D3A2] text-xs font-mono border border-[#1D3A59]"
                      >
                        .{ext.toLowerCase()}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. Active Integrations */}
        {showSection('integrations') && (
          <div className="p-5 sm:p-6 rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 pb-3 border-b border-[#1D3A59]">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                  <Database size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#F5F7FA]">Fleet Integrations</h3>
                  <p className="text-[11px] text-[#8EA6BF]">Cloud mesh endpoints</p>
                </div>
              </div>

              <div className="mt-4 space-y-2.5">
                {data.integrations.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-[#07111F]/60 border border-[#1D3A59]/80 flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-bold text-[#F5F7FA]">{item.name}</p>
                      <p className="text-[10px] text-[#8EA6BF]">{item.type}</p>
                    </div>
                    <Badge variant="completed" size="sm">
                      {item.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 5. Access Control & Admins */}
        {showSection('users') && (
          <div className="p-5 sm:p-6 rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 pb-3 border-b border-[#1D3A59]">
                <div className="w-9 h-9 rounded-xl bg-[#20D3A2]/15 border border-[#20D3A2]/30 text-[#20D3A2] flex items-center justify-center shrink-0">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#F5F7FA]">Authorized Admins</h3>
                  <p className="text-[11px] text-[#8EA6BF]">Roles & permissions</p>
                </div>
              </div>

              <div className="mt-4 space-y-2.5">
                {data.users.map((u) => (
                  <div
                    key={u.id}
                    className="p-2.5 rounded-xl bg-[#07111F]/60 border border-[#1D3A59]/80 flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="font-bold text-[#F5F7FA] truncate">{u.name}</p>
                      <p className="text-[10px] text-[#8EA6BF] truncate">{u.email}</p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#132943] text-[#20D3A2] border border-[#1D3A59] shrink-0">
                      {u.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 6. Security Policies */}
        {showSection('system') && (
          <div className="p-5 sm:p-6 rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 pb-3 border-b border-[#1D3A59]">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                  <Shield size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#F5F7FA]">System & Security</h3>
                  <p className="text-[11px] text-[#8EA6BF]">Audit & safety policies</p>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-xs">
                <div className="p-2.5 rounded-xl bg-[#07111F]/60 border border-[#1D3A59]/80 space-y-1">
                  <span className="text-[10px] text-[#8EA6BF] uppercase font-bold">CUPS Server Host</span>
                  <p className="font-mono text-xs text-[#20D3A2]">{data.system.printServerCups}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#07111F]/60 border border-[#1D3A59]/80 space-y-1">
                  <span className="text-[10px] text-[#8EA6BF] uppercase font-bold">Firebase Project</span>
                  <p className="font-mono text-xs text-[#CAD7E6]">{data.system.firebaseProject}</p>
                </div>
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-[#8EA6BF]">Audit Logging</span>
                  <span className="text-[#20D3A2] font-bold">Enabled</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
