import React from 'react';
import {
  LayoutDashboard,
  Printer,
  HardDrive,
  AlertTriangle,
  BarChart3,
  CreditCard,
  Settings,
  HelpCircle,
  LogOut,
  User,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout?: () => void;
  incidentCount?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  onLogout,
  incidentCount = 2,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'operations', label: 'Operations', icon: Printer, badgeText: 'Live' },
    { id: 'kiosks', label: 'Kiosks', icon: HardDrive },
    { id: 'incidents', label: 'Incidents', icon: AlertTriangle, badgeCount: incidentCount },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'finance', label: 'Finance', icon: CreditCard },
    { id: 'configuration', label: 'Configuration', icon: Settings },
  ];

  return (
    <div className="h-full flex flex-col justify-between select-none font-sans bg-[#0A1728] text-[#F5F7FA]">
      {/* Top Brand & Navigation */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Brand Header */}
        <div
          className={`p-4 border-b border-[#1D3A59] flex items-center ${
            isCollapsed ? 'justify-center' : 'justify-between'
          } gap-2 min-h-[72px]`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#20D3A2] flex items-center justify-center text-[#07111F] font-black text-xl shadow-lg shadow-[#20D3A2]/20 shrink-0">
              M
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-base text-[#F5F7FA] tracking-tight truncate">MIMO</span>
                  <span className="text-[10px] font-black uppercase px-1.5 py-0.2 rounded bg-[#20D3A2]/20 text-[#20D3A2] border border-[#20D3A2]/30 shrink-0">
                    ADMIN
                  </span>
                </div>
                <p className="text-[11px] text-[#8EA6BF] font-medium tracking-wide truncate">
                  Command Center
                </p>
              </div>
            )}
          </div>

          {/* Collapse/Expand Toggle Button */}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
              className="p-1.5 rounded-lg text-[#8EA6BF] hover:text-[#F5F7FA] hover:bg-[#132943] transition-colors cursor-pointer shrink-0"
            >
              {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          )}
        </div>

        {/* Navigation Item List */}
        <nav className={`py-4 space-y-1.5 ${isCollapsed ? 'px-2' : 'px-3'}`}>
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
                } py-2.5 rounded-xl text-sm transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#20D3A2]/15 border border-[#20D3A2]/40 text-[#20D3A2] font-bold shadow-md shadow-black/20'
                    : 'text-[#8EA6BF] hover:text-[#F5F7FA] hover:bg-[#132943]/60 font-semibold'
                }`}
              >
                <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 min-w-0'}`}>
                  <Icon size={19} className={isActive ? 'text-[#20D3A2]' : 'text-[#8EA6BF]'} />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </div>

                {!isCollapsed && item.badgeText && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[#20D3A2]/20 text-[#20D3A2] border border-[#20D3A2]/30 shrink-0">
                    {item.badgeText}
                  </span>
                )}

                {!isCollapsed && item.badgeCount !== undefined && item.badgeCount > 0 && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                    {item.badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom User Area / Help / Sign Out */}
      <div className="p-3 border-t border-[#1D3A59] bg-[#07111F]/50 space-y-1">
        {/* Help Link */}
        <button
          type="button"
          onClick={() => alert('MIMO Fleet Support: Documentation & Live Logs available.')}
          title={isCollapsed ? 'Help & Docs' : undefined}
          className={`w-full flex items-center ${
            isCollapsed ? 'justify-center' : 'gap-3 px-3'
          } py-2 rounded-xl text-xs font-semibold text-[#8EA6BF] hover:text-[#F5F7FA] hover:bg-[#132943] transition-colors cursor-pointer`}
        >
          <HelpCircle size={17} />
          {!isCollapsed && <span>Help & Docs</span>}
        </button>

        {/* Admin Pill / Logout */}
        <div
          className={`pt-1 flex items-center ${
            isCollapsed ? 'justify-center' : 'justify-between px-1'
          }`}
        >
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5 min-w-0'}`}>
            <div
              title={isCollapsed ? 'Admin User' : undefined}
              className="w-8 h-8 rounded-lg bg-[#20D3A2]/15 text-[#20D3A2] flex items-center justify-center font-bold text-xs border border-[#20D3A2]/30 shrink-0"
            >
              <User size={15} />
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#F5F7FA] truncate">Admin User</p>
                <p className="text-[10px] text-[#8EA6BF] font-medium truncate">admin@mimo.in</p>
              </div>
            )}
          </div>

          {!isCollapsed && onLogout && (
            <button
              type="button"
              onClick={onLogout}
              title="Sign Out"
              className="p-1.5 rounded-lg text-[#8EA6BF] hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer shrink-0"
            >
              <LogOut size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
