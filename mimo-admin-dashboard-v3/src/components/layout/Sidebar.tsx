import React from 'react';
import {
  LayoutDashboard,
  Printer,
  HardDrive,
  AlertTriangle,
  BarChart3,
  IndianRupee,
  Settings,
  ChevronRight,
  X,
} from 'lucide-react';

export interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  incidentCount?: number;
  isCollapsed?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  incidentCount = 2,
  isCollapsed = false,
  onClose,
}) => {
  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'operations', label: 'Operations', icon: Printer, badgeText: 'Live' },
    { id: 'kiosks', label: 'Kiosks', icon: HardDrive },
    { id: 'incidents', label: 'Incidents', icon: AlertTriangle, badge: incidentCount },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'finance', label: 'Finance', icon: IndianRupee },
    { id: 'configuration', label: 'Configuration', icon: Settings },
  ];

  return (
    <div className="h-full flex flex-col justify-between select-none font-sans bg-white dark:bg-[#0B132B] border-r border-slate-200/80 dark:border-[#1E293B] transition-colors duration-200">
      {/* Top Brand Header & Navigation */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Brand Header */}
        <div
          className={`p-4 sm:p-5 flex items-center ${
            isCollapsed ? 'justify-center' : 'justify-between'
          } gap-3 min-h-[64px] border-b border-slate-100 dark:border-[#1E293B]`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center text-white font-black text-xl shadow-xs shrink-0">
              M
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 leading-none">
                  <span className="font-black text-lg text-slate-900 dark:text-[#F8FAFC] tracking-tight">
                    MIMO
                  </span>
                  <span className="font-black text-lg text-[#6366F1] dark:text-[#818CF8] tracking-tight">
                    ADMIN
                  </span>
                </div>
                <p className="text-xs text-slate-400 dark:text-[#8495AA] mt-1 font-medium">
                  Command Center v2.0
                </p>
              </div>
            )}
          </div>

          {onClose && !isCollapsed && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#15273F] transition-colors"
              aria-label="Close navigation"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Section Heading */}
        {!isCollapsed && (
          <div className="px-5 pt-5 pb-2">
            <span className="text-[11px] font-extrabold uppercase text-slate-400 dark:text-[#8495AA] tracking-wider">
              NAVIGATION
            </span>
          </div>
        )}

        {/* Navigation Item List */}
        <nav className={`py-1 space-y-1 ${isCollapsed ? 'px-2' : 'px-3.5'}`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`w-full min-h-[46px] flex items-center ${
                  isCollapsed ? 'justify-center px-0' : 'justify-between px-3.5'
                } py-2.5 rounded-2xl text-[15px] sm:text-[16px] font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#F3E8FF] text-[#7C3AED] dark:bg-[#818CF8]/20 dark:text-[#C084FC] dark:border dark:border-[#818CF8]/30 shadow-xs'
                    : 'text-slate-600 dark:text-[#CBD5E1] hover:text-slate-900 dark:hover:text-[#F8FAFC] hover:bg-slate-50 dark:hover:bg-[#111C30]'
                }`}
              >
                <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 min-w-0'}`}>
                  <div className="w-5 flex items-center justify-center shrink-0">
                    <Icon size={19} className={isActive ? 'text-[#7C3AED] dark:text-[#C084FC]' : 'text-slate-400 dark:text-[#8495AA]'} />
                  </div>
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </div>

                {!isCollapsed && item.badgeText && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#FCE7F3] text-[#DB2777] border border-[#FBCFE8] dark:bg-[#DB2777]/20 dark:text-[#F472B6] dark:border-[#DB2777]/40">
                    {item.badgeText}
                  </span>
                )}

                {!isCollapsed && item.badge !== undefined && item.badge > 0 && (
                  <span className="w-5 h-5 flex items-center justify-center rounded-full text-xs font-semibold bg-[#EDE9FE] text-[#7C3AED] border border-[#DDD6FE] dark:bg-[#7C3AED]/20 dark:text-[#C084FC]">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Profile Card */}
      {!isCollapsed ? (
        <div className="p-3.5 m-3.5 rounded-2xl bg-white dark:bg-[#111C30] border border-slate-200/90 dark:border-[#1E293B] shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-xs">
            AD
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900 dark:text-[#F8FAFC] leading-tight truncate">
              Admin User
            </p>
            <p className="text-xs text-slate-400 dark:text-[#8495AA] mt-0.5 truncate">
              admin@mimo.print
            </p>
          </div>
          <ChevronRight size={16} className="text-slate-400 shrink-0" />
        </div>
      ) : (
        <div className="p-3 border-t border-slate-100 dark:border-[#1E293B] flex justify-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-xs">
            AD
          </div>
        </div>
      )}
    </div>
  );
};
