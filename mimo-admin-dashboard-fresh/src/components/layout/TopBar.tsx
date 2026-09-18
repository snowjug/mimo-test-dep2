import React, { useState } from 'react';
import {
  Search,
  Bell,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Moon,
  LogOut,
} from 'lucide-react';

interface TopBarProps {
  onSearch?: (query: string) => void;
  onReset?: () => void;
  onLogout?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onSearch,
  onReset,
  onLogout,
  isSidebarCollapsed,
  onToggleSidebar,
}) => {
  const [query, setQuery] = useState('');

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    onSearch?.(e.target.value);
  };

  return (
    <header className="h-16 bg-[#0A1728] border-b border-[#1D3A59] px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-20 font-sans shadow-md">
      {/* Left side: Sidebar Toggle + Brand (mobile) + Global Search */}
      <div className="flex items-center gap-3 sm:gap-4 flex-1 max-w-xl min-w-0">
        {/* Sidebar Collapse/Expand Toggle Button */}
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            className="flex items-center justify-center p-2 rounded-xl bg-[#07111F] border border-[#1D3A59] text-[#8EA6BF] hover:text-[#F5F7FA] hover:border-[#20D3A2]/50 transition-colors cursor-pointer shrink-0"
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        )}

        {/* Mobile Brand indicator */}
        <div className="flex md:hidden items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-[#20D3A2] flex items-center justify-center text-[#07111F] font-black text-sm shadow-md shadow-[#20D3A2]/20">
            M
          </div>
          <span className="font-black text-sm text-[#F5F7FA] tracking-tight">MIMO</span>
        </div>

        {/* Global Search Input with ⌘ K shortcut */}
        <div className="relative flex-1 hidden sm:flex items-center">
          <Search size={15} className="absolute left-3.5 text-[#6F89A3] pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={handleSearchChange}
            placeholder="Quick search nodes, orders, jobs..."
            className="w-full pl-9 pr-12 py-2 bg-[#07111F] border border-[#1D3A59] rounded-xl text-xs text-[#F5F7FA] placeholder-[#6F89A3] focus:outline-none focus:border-[#20D3A2] focus:ring-1 focus:ring-[#20D3A2]/30 transition-all"
          />
          <span className="absolute right-3 text-[10px] font-mono font-bold text-[#6F89A3] bg-[#10223A] px-1.5 py-0.5 rounded border border-[#1D3A59]">
            ⌘ K
          </span>
        </div>
      </div>

      {/* Right Controls Container */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Reset Filter Button */}
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            title="Reset Filters"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#07111F] border border-[#1D3A59] text-xs font-semibold text-[#8EA6BF] hover:text-[#F5F7FA] hover:border-[#20D3A2]/50 transition-all cursor-pointer"
          >
            <RotateCcw size={13} />
            <span className="hidden sm:inline">Reset</span>
          </button>
        )}

        {/* Dark / Light Theme Toggle */}
        <button
          type="button"
          onClick={() => alert('Theme locked to Production Dark Navy.')}
          title="Toggle Theme"
          className="flex items-center justify-center p-2 rounded-xl bg-[#07111F] border border-[#1D3A59] text-[#8EA6BF] hover:text-[#F5F7FA] hover:border-[#20D3A2]/50 transition-all cursor-pointer"
        >
          <Moon size={16} />
        </button>

        {/* Notifications Bell */}
        <button
          type="button"
          onClick={() => alert('3 Fleet Alerts: Low paper on MIMO 2, Spool retry pending, UPI gateway active.')}
          title="Notifications"
          className="relative flex items-center justify-center p-2 rounded-xl bg-[#07111F] border border-[#1D3A59] text-[#8EA6BF] hover:text-[#F5F7FA] hover:border-[#20D3A2]/50 transition-all cursor-pointer"
        >
          <Bell size={16} />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-[#0A1728]">
            3
          </span>
        </button>

        {/* Admin Avatar Pill */}
        <div className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-xl bg-[#10223A] border border-[#1D3A59] text-xs font-bold text-[#F5F7FA]">
          <div className="w-6 h-6 rounded-lg bg-[#20D3A2] text-[#07111F] flex items-center justify-center font-black text-xs">
            AD
          </div>
          <span className="hidden sm:inline">Admin</span>
        </div>

        {/* Sign Out Button */}
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            title="Logout"
            className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 transition-all cursor-pointer"
          >
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        )}
      </div>
    </header>
  );
};
