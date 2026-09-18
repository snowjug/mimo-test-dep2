import React, { useState } from 'react';
import {
  LayoutDashboard,
  Printer,
  HardDrive,
  AlertTriangle,
  Menu,
  BarChart3,
  CreditCard,
  Settings,
  X,
  LogOut,
} from 'lucide-react';

interface MobileNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  incidentCount?: number;
  onLogout?: () => void;
}

export const MobileNavigation: React.FC<MobileNavigationProps> = ({
  activeTab,
  onTabChange,
  incidentCount = 2,
  onLogout,
}) => {
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const mainTabs = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'operations', label: 'Queue', icon: Printer },
    { id: 'kiosks', label: 'Kiosks', icon: HardDrive },
    { id: 'incidents', label: 'Alerts', icon: AlertTriangle, badge: incidentCount },
  ];

  const moreTabs = [
    { id: 'analytics', label: 'Analytics', icon: BarChart3, desc: 'Telemetry graphs & trends' },
    { id: 'finance', label: 'Finance & Billing', icon: CreditCard, desc: 'Revenue, payouts & receipts' },
    { id: 'configuration', label: 'Configuration', icon: Settings, desc: 'Fleet pricing & system controls' },
  ];

  const handleSelect = (id: string) => {
    onTabChange(id);
    setShowMoreMenu(false);
  };

  const isMoreActive = ['analytics', 'finance', 'configuration'].includes(activeTab);

  return (
    <>
      {/* Slide-up Drawer Backdrop */}
      {showMoreMenu && (
        <div
          className="fixed inset-0 z-40 bg-black/75 backdrop-blur-xs md:hidden"
          onClick={() => setShowMoreMenu(false)}
        />
      )}

      {/* Slide-up Drawer for Additional Modules */}
      {showMoreMenu && (
        <div className="fixed bottom-[65px] left-0 right-0 z-50 bg-[#0A1728] border-t border-[#1D3A59] p-4 rounded-t-2xl shadow-2xl md:hidden animate-in slide-in-from-bottom duration-200 font-sans">
          <div className="flex items-center justify-between pb-3 border-b border-[#1D3A59]">
            <span className="text-xs font-bold text-[#F5F7FA] uppercase tracking-wider">
              More Modules
            </span>
            <button
              type="button"
              onClick={() => setShowMoreMenu(false)}
              className="p-1.5 rounded-lg text-[#8EA6BF] hover:text-[#F5F7FA] hover:bg-[#132943]"
            >
              <X size={18} />
            </button>
          </div>

          <div className="py-2 space-y-1">
            {moreTabs.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all ${
                    isActive
                      ? 'bg-[#20D3A2]/15 border border-[#20D3A2]/40 text-[#20D3A2]'
                      : 'hover:bg-[#132943]/60 text-[#8EA6BF] hover:text-[#F5F7FA]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        isActive ? 'bg-[#20D3A2]/20 text-[#20D3A2]' : 'bg-[#10223A] text-[#8EA6BF]'
                      }`}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-bold truncate ${isActive ? 'text-[#20D3A2]' : 'text-[#F5F7FA]'}`}>
                        {item.label}
                      </p>
                      <p className="text-[11px] text-[#8EA6BF] truncate">{item.desc}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {onLogout && (
            <div className="pt-2 mt-2 border-t border-[#1D3A59]">
              <button
                type="button"
                onClick={() => {
                  setShowMoreMenu(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-all font-semibold text-sm"
              >
                <LogOut size={18} />
                <span>Sign Out of Console</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Pinned Bottom Navigation Bar matching Mobile Screenshots 1, 2, 4 */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 h-[68px] bg-[#0A1728]/95 backdrop-blur-md border-t border-[#1D3A59] flex items-center justify-around px-2 md:hidden font-sans"
        aria-label="Mobile Navigation"
      >
        {mainTabs.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className="flex-1 flex flex-col items-center justify-center py-1 transition-all relative"
            >
              <div
                className={`flex items-center justify-center px-3 py-1 rounded-full transition-all ${
                  isActive
                    ? 'bg-[#20D3A2]/20 text-[#20D3A2] border border-[#20D3A2]/30 shadow-sm shadow-[#20D3A2]/20'
                    : 'text-[#8EA6BF] hover:text-[#F5F7FA]'
                }`}
              >
                <Icon size={19} className={isActive ? 'text-[#20D3A2]' : 'text-[#8EA6BF]'} />
              </div>
              <span
                className={`text-[10px] font-bold mt-0.5 tracking-tight ${
                  isActive ? 'text-[#20D3A2]' : 'text-[#8EA6BF]'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}

        {/* More Tab */}
        <button
          type="button"
          onClick={() => setShowMoreMenu(!showMoreMenu)}
          className="flex-1 flex flex-col items-center justify-center py-1 transition-all relative"
        >
          <div
            className={`flex items-center justify-center px-3 py-1 rounded-full transition-all ${
              isMoreActive || showMoreMenu
                ? 'bg-[#20D3A2]/20 text-[#20D3A2] border border-[#20D3A2]/30'
                : 'text-[#8EA6BF] hover:text-[#F5F7FA]'
            }`}
          >
            <Menu size={19} />
          </div>
          <span
            className={`text-[10px] font-bold mt-0.5 tracking-tight ${
              isMoreActive || showMoreMenu ? 'text-[#20D3A2]' : 'text-[#8EA6BF]'
            }`}
          >
            More
          </span>
        </button>
      </nav>
    </>
  );
};
