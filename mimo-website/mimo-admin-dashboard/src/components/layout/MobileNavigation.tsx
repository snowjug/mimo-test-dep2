import React, { useState } from 'react';
import {
  LayoutDashboard,
  Printer,
  HardDrive,
  AlertTriangle,
  MoreHorizontal,
  BarChart3,
  CreditCard,
  Settings,
  HelpCircle,
  LogOut,
  X,
} from 'lucide-react';

interface MobileNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout?: () => void;
}

export const MobileNavigation: React.FC<MobileNavigationProps> = ({
  activeTab,
  onTabChange,
  onLogout,
}) => {
  const [showMoreSheet, setShowMoreSheet] = useState(false);

  const mainItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'operations', label: 'Queue', icon: Printer },
    { id: 'kiosks', label: 'Kiosks', icon: HardDrive },
    { id: 'incidents', label: 'Alerts', icon: AlertTriangle },
  ];

  const moreItems = [
    { id: 'analytics', label: 'Telemetry Analytics', icon: BarChart3 },
    { id: 'finance', label: 'Finance & Billing', icon: CreditCard },
    { id: 'configuration', label: 'System Configuration', icon: Settings },
  ];

  const handleTabSelect = (id: string) => {
    onTabChange(id);
    setShowMoreSheet(false);
  };

  return (
    <>
      {/* "More" Slide-up Drawer */}
      {showMoreSheet && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex flex-col justify-end md:hidden">
          <div className="bg-[#0A1728] border-t border-[#1D3A59] rounded-t-3xl p-6 space-y-5 max-h-[85vh] overflow-y-auto text-[#F5F7FA] animate-in slide-in-from-bottom duration-200 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#1D3A59]">
              <h3 className="font-extrabold text-base text-[#F5F7FA]">All Modules & Settings</h3>
              <button
                type="button"
                onClick={() => setShowMoreSheet(false)}
                className="p-2 rounded-xl text-[#8EA6BF] hover:text-[#F5F7FA] hover:bg-[#132943]"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-2.5">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleTabSelect(item.id)}
                    className={`w-full min-h-[52px] flex items-center gap-3.5 p-4 rounded-2xl text-sm font-bold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#20D3A2]/15 text-[#20D3A2] border border-[#20D3A2]/40 shadow-sm'
                        : 'bg-[#10223A] text-[#8EA6BF] hover:text-[#F5F7FA] border border-[#1D3A59]'
                    }`}
                  >
                    <Icon size={20} className={isActive ? 'text-[#20D3A2]' : 'text-[#8EA6BF]'} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="pt-4 border-t border-[#1D3A59] space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  alert('MIMO Support & Docs available at support@mimo.in');
                  setShowMoreSheet(false);
                }}
                className="w-full min-h-[50px] flex items-center gap-3.5 p-3.5 rounded-2xl text-sm font-semibold text-[#8EA6BF] hover:bg-[#10223A] hover:text-[#F5F7FA] cursor-pointer"
              >
                <HelpCircle size={18} className="text-[#8EA6BF]" />
                <span>Help & Documentation</span>
              </button>

              {onLogout && (
                <button
                  type="button"
                  onClick={() => {
                    onLogout();
                    setShowMoreSheet(false);
                  }}
                  className="w-full min-h-[50px] flex items-center gap-3.5 p-3.5 rounded-2xl text-sm font-bold text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                >
                  <LogOut size={18} className="text-rose-400" />
                  <span>Sign Out</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fixed Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#07111F]/95 backdrop-blur-xl border-t border-[#1D3A59] py-2.5 px-4 z-40 flex items-center justify-around shadow-2xl">
        {mainItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleTabSelect(item.id)}
              className={`flex-1 min-h-[52px] flex flex-col items-center justify-center py-1 rounded-xl transition-all cursor-pointer ${
                isActive
                  ? 'text-[#20D3A2] font-black'
                  : 'text-[#8EA6BF] hover:text-[#F5F7FA] font-semibold'
              }`}
            >
              <div
                className={`p-1.5 rounded-xl transition-all ${
                  isActive ? 'bg-[#20D3A2]/20 text-[#20D3A2] border border-[#20D3A2]/40 shadow-xs' : ''
                }`}
              >
                <Icon size={20} />
              </div>
              <span className="text-[11px] mt-1 tracking-tight">{item.label}</span>
            </button>
          );
        })}

        {/* More Button */}
        <button
          type="button"
          onClick={() => setShowMoreSheet(true)}
          className={`flex-1 min-h-[52px] flex flex-col items-center justify-center py-1 rounded-xl transition-all cursor-pointer ${
            ['analytics', 'finance', 'configuration'].includes(activeTab)
              ? 'text-[#20D3A2] font-black'
              : 'text-[#8EA6BF] hover:text-[#F5F7FA] font-semibold'
          }`}
        >
          <div
            className={`p-1.5 rounded-xl transition-all ${
              ['analytics', 'finance', 'configuration'].includes(activeTab)
                ? 'bg-[#20D3A2]/20 text-[#20D3A2] border border-[#20D3A2]/40 shadow-xs'
                : ''
            }`}
          >
            <MoreHorizontal size={20} />
          </div>
          <span className="text-[11px] mt-1 tracking-tight">More</span>
        </button>
      </nav>
    </>
  );
};
