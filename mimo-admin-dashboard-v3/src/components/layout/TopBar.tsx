import React, { useState } from 'react';
import {
  Menu,
  RotateCcw,
  Moon,
  Sun,
  Bell,
  LogOut,
} from 'lucide-react';
import { SearchInput } from '../ui/SearchInput';

export type AppTheme = 'light' | 'dark' | 'emerald' | 'purple';

export interface TopBarProps {
  currentTheme: AppTheme;
  onToggleTheme: () => void;
  onSearchChange?: (q: string) => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onLogout?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentTheme,
  onToggleTheme,
  onSearchChange,
  onToggleSidebar,
}) => {
  const [searchVal, setSearchVal] = useState('');

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchVal(e.target.value);
    onSearchChange?.(e.target.value);
  };

  const handleReset = () => {
    setSearchVal('');
    onSearchChange?.('');
    window.location.reload();
  };

  const handleLogout = () => {
    if (confirm('Sign out of MIMO Admin Dashboard?')) {
      window.location.reload();
    }
  };

  return (
    <header className="h-14 sm:h-16 bg-white dark:bg-[#0B1728] border-b border-slate-200/80 dark:border-[#1E314B] px-3 sm:px-6 flex items-center justify-between sticky top-0 z-20 font-sans transition-colors duration-200">
      {/* Left Area: Hamburger / Menu Toggle + Quick Search Bar */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 max-w-xl min-w-0 pr-2">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title="Toggle Sidebar"
            aria-label="Toggle Sidebar"
            className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-slate-200 dark:border-[#1E314B] bg-white dark:bg-[#14243A] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-[#1A2E4B] transition-colors cursor-pointer shrink-0 shadow-xs"
          >
            <Menu size={18} />
          </button>
        )}

        {/* Global Search Bar */}
        <div className="w-full max-w-[320px] sm:max-w-[420px]">
          <SearchInput
            value={searchVal}
            onChange={handleInput}
            placeholder="Quick search..."
            iconSize={16}
            inputSize="sm"
            className="!h-9 sm:!h-10 text-xs sm:text-sm"
          />
        </div>
      </div>

      {/* Right Controls Container */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {/* Reset Button (Hidden on small mobile) */}
        <button
          type="button"
          onClick={handleReset}
          title="Reset Dashboard State"
          className="hidden sm:flex items-center gap-1.5 px-3.5 h-9 sm:h-10 rounded-xl border border-slate-200 dark:border-[#1E314B] bg-white dark:bg-[#14243A] hover:bg-slate-50 dark:hover:bg-[#1A2E4B] text-slate-700 dark:text-[#C3CFDD] transition-colors cursor-pointer text-xs font-bold shadow-xs"
        >
          <RotateCcw size={14} className="text-slate-500 dark:text-[#8495AA]" />
          <span>Reset</span>
        </button>

        {/* Dark / Light Mode Toggle Button */}
        <button
          type="button"
          onClick={onToggleTheme}
          title="Toggle Theme"
          aria-label="Toggle Theme"
          className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-slate-200 dark:border-[#1E314B] bg-white dark:bg-[#14243A] hover:bg-slate-50 dark:hover:bg-[#1A2E4B] text-slate-700 dark:text-[#C3CFDD] transition-colors cursor-pointer shadow-xs"
        >
          {currentTheme === 'dark' ? (
            <Sun size={16} className="text-amber-400" />
          ) : (
            <Moon size={16} className="text-slate-600 dark:text-[#C3CFDD]" />
          )}
        </button>

        {/* Notifications Bell Button */}
        <button
          type="button"
          onClick={() => alert('System telemetry healthy. All kiosks operational.')}
          title="Notifications"
          aria-label="Notifications"
          className="relative flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#111C30] hover:bg-slate-50 dark:hover:bg-[#1A2844] text-slate-600 dark:text-[#CBD5E1] transition-colors cursor-pointer shadow-xs"
        >
          <Bell size={16} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-[#EC4899] rounded-full" />
        </button>

        {/* Admin Avatar Circle */}
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-xs cursor-default">
          AD
        </div>

        {/* Logout Button (Hidden on small mobile) */}
        <button
          type="button"
          onClick={handleLogout}
          title="Logout"
          className="hidden sm:flex items-center gap-1.5 px-3.5 h-9 sm:h-10 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/30 hover:bg-rose-100/70 dark:hover:bg-rose-950/60 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer text-xs font-bold shadow-xs"
        >
          <LogOut size={14} />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
};
