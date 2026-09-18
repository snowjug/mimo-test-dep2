import React, { useState } from 'react';
import {
  Search,
  RotateCcw,
  Bell,
  LogOut,
  User,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

interface TopBarProps {
  onSearch?: (query: string) => void;
  onLogout?: () => void;
  onReset?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onSearch,
  onLogout,
  onReset,
  isSidebarCollapsed,
  onToggleSidebar,
}) => {
  const [query, setQuery] = useState('');

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    onSearch?.(e.target.value);
  };

  const handleReset = () => {
    if (confirm('Reset dashboard telemetry filters?')) {
      onReset?.();
    }
  };

  return (
    <header className="h-18 bg-[#0A1728] border-b border-[#1D3A59] px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-20 font-sans shadow-lg">
      {/* Left side: Sidebar Toggle + Search on Desktop / Brand on Mobile */}
      <div className="flex items-center gap-3.5 flex-1 max-w-xl min-w-0">
        {/* Desktop Sidebar Toggle */}
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            className="hidden md:flex items-center justify-center p-2 rounded-xl bg-[#07111F] border border-[#1D3A59] text-[#8EA6BF] hover:text-[#F5F7FA] hover:border-[#20D3A2]/50 transition-colors cursor-pointer shrink-0"
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        )}

        {/* Mobile Brand indicator */}
        <div className="flex md:hidden items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[#20D3A2] flex items-center justify-center text-[#07111F] font-black text-base shadow-md shadow-[#20D3A2]/20">
            M
          </div>
          <span className="font-black text-base text-[#F5F7FA] tracking-tight">MIMO ADMIN</span>
        </div>

        {/* Desktop Search Input */}
        <div className="relative hidden md:flex items-center flex-1">
          <Search size={16} className="absolute left-3.5 text-[#6F89A3] pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={handleSearchChange}
            placeholder="Quick search nodes, orders, jobs..."
            className="w-full pl-10 pr-4 py-2 bg-[#07111F] border border-[#1D3A59] rounded-xl text-xs sm:text-sm text-[#F5F7FA] placeholder-[#6F89A3] focus:outline-none focus:border-[#20D3A2] focus:ring-2 focus:ring-[#20D3A2]/20 transition-all"
          />
        </div>
      </div>

      {/* Right Controls Container */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Reset Button */}
        <button
          type="button"
          onClick={handleReset}
          className="hidden sm:inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl bg-[#07111F] border border-[#1D3A59] text-xs sm:text-sm font-semibold text-[#8EA6BF] hover:text-[#F5F7FA] hover:border-[#20D3A2]/50 transition-all cursor-pointer shadow-xs"
        >
          <RotateCcw size={14} className="text-[#8EA6BF]" />
          <span>Reset</span>
        </button>

        {/* Notifications Bell */}
        <button
          type="button"
          onClick={() => alert('3 active telemetry alerts: Paper low on SV-002, 2 pending retry jobs, UPI callback synced.')}
          className="relative min-h-[40px] min-w-[40px] flex items-center justify-center p-2 rounded-xl bg-[#07111F] border border-[#1D3A59] text-[#8EA6BF] hover:text-[#F5F7FA] hover:border-[#20D3A2]/50 transition-all cursor-pointer shadow-xs"
        >
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-[#0A1728]">
            3
          </span>
        </button>

        {/* Admin Pill Badge */}
        <div className="min-h-[40px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#20D3A2] text-[#07111F] text-xs sm:text-sm font-black shadow-md shadow-[#20D3A2]/20 cursor-pointer">
          <User size={15} className="stroke-[2.5]" />
          <span>Admin</span>
        </div>

        {/* Logout Button on Desktop */}
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="hidden sm:inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl bg-[#07111F] border border-rose-500/30 text-rose-400 hover:bg-rose-500/15 text-xs sm:text-sm font-bold transition-all cursor-pointer"
          >
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        )}
      </div>
    </header>
  );
};
