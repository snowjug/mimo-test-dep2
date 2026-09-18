import React from 'react';
import {
  LayoutDashboard,
  Printer,
  HardDrive,
  BarChart3,
  MoreHorizontal,
} from 'lucide-react';

export interface MobileNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenMoreDrawer: () => void;
  isDrawerOpen?: boolean;
  incidentCount?: number;
}

export const MobileNavigation: React.FC<MobileNavigationProps> = ({
  activeTab,
  onTabChange,
  onOpenMoreDrawer,
  isDrawerOpen = false,
}) => {
  const mainTabs = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'operations', label: 'Operations', icon: Printer },
    { id: 'kiosks', label: 'Kiosks', icon: HardDrive },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  const isMoreActive = isDrawerOpen || ['incidents', 'finance', 'configuration'].includes(activeTab);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-[#0B1728]/95 backdrop-blur-md border-t border-slate-200/80 dark:border-[#1E314B] flex items-center justify-around px-2 md:hidden font-sans shadow-lg transition-colors duration-200 select-none"
      style={{
        height: 'calc(60px + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      aria-label="Mobile Navigation"
    >
      {mainTabs.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id && !isDrawerOpen;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            className="flex-1 flex flex-col items-center justify-center py-1 transition-all cursor-pointer"
          >
            <div
              className={`flex items-center justify-center px-3.5 py-1 rounded-full transition-all ${
                isActive
                  ? 'bg-[#6366F1] text-white shadow-xs'
                  : 'text-slate-500 dark:text-[#8495AA] hover:text-slate-800 dark:hover:text-[#F1F5F9]'
              }`}
            >
              <Icon size={18} />
            </div>
            <span
              className={`text-[10px] font-bold mt-0.5 tracking-tight ${
                isActive ? 'text-[#6366F1] dark:text-[#A5B4FC]' : 'text-slate-500 dark:text-[#8495AA]'
              }`}
            >
              {item.label}
            </span>
          </button>
        );
      })}

      {/* 5th Tab: More -> opens full left navigation drawer */}
      <button
        type="button"
        onClick={onOpenMoreDrawer}
        className="flex-1 flex flex-col items-center justify-center py-1 transition-all cursor-pointer"
      >
        <div
          className={`flex items-center justify-center px-3.5 py-1 rounded-full transition-all ${
            isMoreActive
              ? 'bg-[#6366F1] text-white shadow-xs'
              : 'text-slate-500 dark:text-[#8495AA] hover:text-slate-800 dark:hover:text-[#F1F5F9]'
          }`}
        >
          <MoreHorizontal size={18} />
        </div>
        <span
          className={`text-[10px] font-bold mt-0.5 tracking-tight ${
            isMoreActive ? 'text-[#6366F1] dark:text-[#A5B4FC]' : 'text-slate-500 dark:text-[#8495AA]'
          }`}
        >
          More
        </span>
      </button>
    </nav>
  );
};
