import React from 'react';
import {
  Search,
  RotateCw,
  Bell,
  Menu,
  Sun,
  Moon,
} from 'lucide-react';
import { FinanceTab } from './FinanceSidebar';
import { DateRangePicker } from '../../../components/ui/DateRangePicker';
import { useRange } from '../../../context/RangeContext';
import { useTheme } from '../../../context/ThemeContext';

export interface FinanceTopbarProps {
  activeTab: FinanceTab;
  pendingRefundsCount?: number;
  onRefresh: () => void;
  isRefreshing?: boolean;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onOpenMobileMenu?: () => void;
  onOpenProfile?: () => void;
  profileName?: string | null;
  profileAvatarUrl?: string | null;
}

const TAB_TITLES: Record<FinanceTab, { title: string; breadcrumb: string }> = {
  overview: { title: 'Finance Overview', breadcrumb: 'Overview' },
  dashboard: { title: 'Finance Dashboard', breadcrumb: 'Dashboard' },
  transactions: { title: 'Transactions Ledger', breadcrumb: 'Transactions' },
  analytics: { title: 'Revenue Analytics', breadcrumb: 'Analytics' },
  refunds: { title: 'Refunds & Disputes', breadcrumb: 'Refunds' },
  pricing: { title: 'Pricing & Coupons', breadcrumb: 'Pricing & Coupons' },
  wallet: { title: 'Wallet & Credits', breadcrumb: 'Wallet & Credits' },
  settlements: { title: 'Settlements & Reports', breadcrumb: 'Settlements & Reports' },
  expenses: { title: 'Revenue & Expenses', breadcrumb: 'Revenue & Expenses' },
  'customer-analytics': { title: 'Customer Analytics', breadcrumb: 'Customer Analytics' },
  'krishna-report': { title: 'Customer Analytics', breadcrumb: 'Customer Analytics' },
};

export const FinanceTopbar: React.FC<FinanceTopbarProps> = ({
  activeTab,
  pendingRefundsCount = 0,
  onRefresh,
  isRefreshing = false,
  searchQuery = '',
  onSearchChange,
  onOpenMobileMenu,
  onOpenProfile,
  profileName,
  profileAvatarUrl,
}) => {
  const current = TAB_TITLES[activeTab] || { title: 'Finance', breadcrumb: 'Overview' };
  const { range, setRange } = useRange();
  const { isDark, toggleTheme } = useTheme();

  return (
    <header className="finance-topbar">
      {/* ── LEFT: BREADCRUMB & CURRENT TITLE ───────────────────────────── */}
      <div className="flex items-center gap-3 min-w-0">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="md:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-semibold leading-none mb-1">
            <span>MIMO Finance</span>
            <span>/</span>
            <span className="text-[#093765] dark:text-indigo-400">{current.breadcrumb}</span>
          </div>
          <span className="text-base font-black text-[#111318] dark:text-white tracking-tight leading-tight truncate">
            {current.title}
          </span>
        </div>
      </div>

      {/* ── CENTER: GLOBAL SEARCH BAR ──────────────────────────────────── */}
      <div className="hidden md:flex items-center flex-1 max-w-md mx-6">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search transactions, orders, users, kiosks..."
            value={searchQuery}
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
            className="w-full bg-[#F3F4F6] dark:bg-slate-800 border border-[#E4E7EB] dark:border-slate-700 hover:border-purple-300 dark:hover:border-indigo-500 focus:border-[#093765] dark:focus:border-indigo-400 text-slate-900 dark:text-white placeholder-slate-400 text-xs rounded-xl pl-9 pr-12 py-2 focus:outline-none transition-all shadow-2xs font-medium"
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[10px] font-mono text-slate-400 dark:text-slate-300 select-none shadow-2xs pointer-events-none">
            <span>⌘</span>
            <span>K</span>
          </div>
        </div>
      </div>

      {/* ── RIGHT: CONTROLS & PROFILE PILL ─────────────────────────────── */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Date range: applies to every finance page (default: today) */}
        <div className="hidden sm:block">
          <DateRangePicker value={range} onChange={setRange} tone="finance" />
        </div>

        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="p-2 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-[#E7EEF7] dark:hover:bg-slate-800 rounded-xl border border-[#E4E7EB] dark:border-slate-800 bg-white dark:bg-slate-900 transition-all cursor-pointer shadow-2xs"
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>

        {/* Refresh Button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh Financial Data"
          className="p-2 text-slate-600 dark:text-slate-300 hover:text-[#093765] dark:hover:text-indigo-400 hover:bg-[#E7EEF7] dark:hover:bg-slate-800 rounded-xl border border-[#E4E7EB] dark:border-slate-800 bg-white dark:bg-slate-900 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
        >
          <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#093765] dark:text-indigo-400' : ''}`} />
        </button>

        {/* Pending refund requests */}
        <div className="relative">
          <button
            type="button"
            title={pendingRefundsCount ? `${pendingRefundsCount} refund request(s) waiting for review` : 'No refund requests waiting'}
            className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl border border-[#E4E7EB] dark:border-slate-800 bg-white dark:bg-slate-900 transition-all cursor-pointer shadow-2xs relative"
          >
            <Bell className="w-4 h-4" />
            {pendingRefundsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-rose-500 text-white rounded-full text-[9px] font-black flex items-center justify-center shadow-xs">
                {pendingRefundsCount}
              </span>
            )}
          </button>
        </div>

        {/* Profile Pill */}
        <button
          type="button"
          onClick={onOpenProfile}
          className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800 cursor-pointer"
          title="My profile"
        >
          {profileAvatarUrl ? (
            <img src={profileAvatarUrl} alt={profileName || 'Finance'} className="w-8 h-8 rounded-xl object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-xl bg-[#093765] text-white flex items-center justify-center font-black text-xs shadow-xs">
              {(profileName || 'Finance').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="hidden lg:flex flex-col text-left">
            <span className="text-xs font-black text-slate-900 dark:text-white leading-tight">
              {profileName && profileName !== 'Vishal sir' ? profileName : 'Vatsa'}
            </span>
            <span className="text-[10px] text-slate-400 font-medium leading-tight">Finance Lead</span>
          </div>
        </button>
      </div>
    </header>
  );
};
