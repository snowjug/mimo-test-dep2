import React, { useState } from 'react';
import {
  LayoutDashboard,
  Printer,
  HardDrive,
  AlertTriangle,
  BarChart3,
  CreditCard,
  Settings,
  MoreHorizontal,
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

  const mainItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'operations', label: 'Queue', icon: Printer },
    { id: 'kiosks', label: 'Kiosks', icon: HardDrive },
    { id: 'incidents', label: 'Alerts', icon: AlertTriangle, badgeCount: incidentCount },
  ];

  const moreItems = [
    { id: 'analytics', label: 'Analytics', icon: BarChart3, desc: 'Fleet performance & trends' },
    { id: 'finance', label: 'Finance', icon: CreditCard, desc: 'Revenue & transaction ledger' },
    { id: 'configuration', label: 'Configuration', icon: Settings, desc: 'Fleet pricing & policies' },
  ];

  const handleSelect = (id: string) => {
    onTabChange(id);
    setShowMoreMenu(false);
  };

  const isMoreActive = ['analytics', 'finance', 'configuration'].includes(activeTab);

  return (
    <>
      {/* Slide-up Sheet Backdrop */}
      {showMoreMenu && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs md:hidden"
          onClick={() => setShowMoreMenu(false)}
        />
      )}

      {/* Slide-up Sheet for Additional Pages */}
      {showMoreMenu && (
        <div className="fixed bottom-[65px] left-0 right-0 z-50 bg-[#0A1728] border-t border-[#1D3A59] p-4 rounded-t-2xl shadow-2xl md:hidden animate-in slide-in-from-bottom duration-200">
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
            {moreItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={`w-full flex items-center gap-3.5 p-3 rounded-xl text-left transition-all ${
                    isActive
                      ? 'bg-[#20D3A2]/15 border border-[#20D3A2]/40 text-[#20D3A2]'
                      : 'hover:bg-[#132943]/60 text-[#8EA6BF] hover:text-[#F5F7FA]'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      isActive ? 'bg-[#20D3A2]/20 text-[#20D3A2]' : 'bg-[#10223A] text-[#8EA6BF]'
                    }`}
                  >
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${isActive ? 'text-[#20D3A2]' : 'text-[#F5F7FA]'}`}>
                      {item.label}
                    </p>
                    <p className="text-[11px] text-[#8EA6BF] truncate">{item.desc}</p>
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

      {/* Pinned Bottom Navigation Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 h-[64px] bg-[#0A1728]/95 backdrop-blur-md border-t border-[#1D3A59] flex items-center justify-around px-2 md:hidden"
        aria-label="Mobile Navigation"
      >
        {mainItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 transition-colors relative ${
                isActive ? 'text-[#20D3A2]' : 'text-[#8EA6BF] hover:text-[#F5F7FA]'
              }`}
            >
              <div className="relative">
                <Icon size={20} className={isActive ? 'text-[#20D3A2]' : 'text-[#8EA6BF]'} />
                {item.badgeCount !== undefined && item.badgeCount > 0 && (
                  <span className="absolute -top-1 -right-2 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                    {item.badgeCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold mt-1 tracking-tight">{item.label}</span>
            </button>
          );
        })}

        {/* More Tab */}
        <button
          type="button"
          onClick={() => setShowMoreMenu(!showMoreMenu)}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 transition-colors relative ${
            isMoreActive || showMoreMenu ? 'text-[#20D3A2]' : 'text-[#8EA6BF] hover:text-[#F5F7FA]'
          }`}
        >
          <MoreHorizontal size={20} />
          <span className="text-[10px] font-semibold mt-1 tracking-tight">More</span>
        </button>
      </nav>
    </>
  );
};
