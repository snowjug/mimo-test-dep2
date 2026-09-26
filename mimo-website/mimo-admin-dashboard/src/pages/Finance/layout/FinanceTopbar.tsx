import React from 'react';
import {
  Search,
  RotateCw,
  Bell,
  Menu,
} from 'lucide-react';
import { FinanceTab } from './FinanceSidebar';
import { DateRangePicker } from '../../../components/ui/DateRangePicker';
import { useRange } from '../../../context/RangeContext';

export interface FinanceTopbarProps {
  activeTab: FinanceTab;
  pendingRefundsCount?: number;
  onRefresh: () => void;
  isRefreshing?: boolean;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onOpenMobileMenu?: () => void;
}

const TAB_TITLES: Record<FinanceTab, { title: string; breadcrumb: string }> = {
  overview: { title: 'Finance Overview', breadcrumb: 'Overview' },
  transactions: { title: 'Transactions Ledger', breadcrumb: 'Transactions' },
  analytics: { title: 'Revenue Analytics', breadcrumb: 'Analytics' },
  refunds: { title: 'Refunds & Disputes', breadcrumb: 'Refunds' },
  pricing: { title: 'Pricing & Coupons', breadcrumb: 'Pricing & Coupons' },
  wallet: { title: 'Wallet & Credits', breadcrumb: 'Wallet & Credits' },
  settlements: { title: 'Settlements & Reports', breadcrumb: 'Settlements & Reports' },
};

export const FinanceTopbar: React.FC<FinanceTopbarProps> = ({
  activeTab,
  pendingRefundsCount = 0,
  onRefresh,
  isRefreshing = false,
  searchQuery = '',
  onSearchChange,
  onOpenMobileMenu,
}) => {
  const current = TAB_TITLES[activeTab] || { title: 'Finance', breadcrumb: 'Overview' };
  const { range, setRange } = useRange();

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
            <span className="text-[#6D35E8]">{current.breadcrumb}</span>
          </div>
          <span className="text-base font-black text-[#19162D] tracking-tight leading-tight truncate">
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
            className="w-full bg-[#FAF9FD] border border-[#EDE9FE] hover:border-purple-300 focus:border-[#6D35E8] text-slate-900 placeholder-slate-400 text-xs rounded-xl pl-9 pr-12 py-2 focus:outline-none transition-all shadow-2xs font-medium"
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono text-slate-400 select-none shadow-2xs pointer-events-none">
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

        {/* Refresh Button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh Financial Data"
          className="p-2 text-slate-600 hover:text-[#6D35E8] hover:bg-[#EDE8FF] rounded-xl border border-[#EDE9FE] bg-white transition-all cursor-pointer shadow-2xs disabled:opacity-50"
        >
          <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#6D35E8]' : ''}`} />
        </button>

        {/* Pending refund requests */}
        <div className="relative">
          <button
            type="button"
            title={pendingRefundsCount ? `${pendingRefundsCount} refund request(s) waiting for review` : 'No refund requests waiting'}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-[#EDE9FE] bg-white transition-all cursor-pointer shadow-2xs relative"
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
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-xl bg-[#6D35E8] text-white flex items-center justify-center font-black text-xs shadow-xs">
            AD
          </div>
          <div className="hidden lg:flex flex-col">
            <span className="text-xs font-black text-slate-900 leading-tight">Admin</span>
            <span className="text-[10px] text-slate-400 font-medium leading-tight">Finance Manager</span>
          </div>
        </div>
      </div>
    </header>
  );
};
