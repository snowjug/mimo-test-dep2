import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  ArrowLeftRight,
  BarChart3,
  RotateCcw,
  Tag,
  WalletCards,
  FileSpreadsheet,
  LogOut,
  MoreHorizontal,
  RotateCw,
  Search,
  ChevronRight,
  X,
} from 'lucide-react';
import type { FinanceTab } from './FinanceSidebar';
import { FinanceSidebar } from './FinanceSidebar';
import { FinanceTopbar } from './FinanceTopbar';
import { DateRangePicker } from '../../../components/ui/DateRangePicker';
import { useRange } from '../../../context/RangeContext';

export interface FinanceLayoutProps {
  activeTab: FinanceTab;
  onTabChange: (tab: FinanceTab) => void;
  onLogout: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  pendingRefundsCount?: number;
  children: React.ReactNode;
}

const TITLES: Record<FinanceTab, string> = {
  overview: 'Overview',
  transactions: 'Transactions',
  analytics: 'Revenue',
  refunds: 'Refunds',
  pricing: 'Pricing and coupons',
  wallet: 'Wallet and credits',
  settlements: 'Settlements',
};

const TABS: { id: FinanceTab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'transactions', label: 'Payments', icon: ArrowLeftRight },
  { id: 'refunds', label: 'Refunds', icon: RotateCcw },
  { id: 'pricing', label: 'Pricing', icon: Tag },
];

const MORE: { id: FinanceTab; label: string; icon: React.ElementType }[] = [
  { id: 'analytics', label: 'Revenue analytics', icon: BarChart3 },
  { id: 'wallet', label: 'Wallet and credits', icon: WalletCards },
  { id: 'settlements', label: 'Settlements and reports', icon: FileSpreadsheet },
];

/** Finance portal shell (separate from Admin): app bar with date range, bottom tabs, "More" sheet. */
export const FinanceLayout: React.FC<FinanceLayoutProps> = ({
  activeTab,
  onTabChange,
  onLogout,
  onRefresh,
  isRefreshing,
  searchQuery = '',
  onSearchChange,
  pendingRefundsCount = 0,
  children,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const { range, setRange } = useRange();
  const inMore = MORE.some((m) => m.id === activeTab);

  useEffect(() => {
    setMoreOpen(false);
    window.scrollTo(0, 0);
  }, [activeTab]);

  return (
    <div className="min-h-[100dvh] bg-slate-100 font-sans text-slate-900 antialiased">
      {/* ── DESKTOP (lg and up): fixed sidebar + topbar grid, unchanged phone shell hidden ── */}
      <div className="finance-layout">
        <FinanceSidebar activeTab={activeTab} onTabChange={onTabChange} onLogout={onLogout} pendingRefundsCount={pendingRefundsCount} />
        <FinanceTopbar
          activeTab={activeTab}
          pendingRefundsCount={pendingRefundsCount}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
        />
        <main className="finance-main">
          <div className="mx-auto w-full max-w-[1600px] space-y-6">{children}</div>
        </main>
      </div>

      {/* ── PHONE (below lg): the existing mobile shell, unchanged ── */}
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col bg-slate-50 shadow-[0_0_0_1px_rgba(17,19,24,0.06)] lg:hidden">
        <header className="sticky top-0 z-30 bg-slate-50/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md">
          <div className="flex h-14 items-center justify-between">
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-emerald-700">MIMO Finance</p>
              <h1 className="-mt-0.5 truncate text-[22px] font-semibold tracking-tight text-slate-900">{TITLES[activeTab]}</h1>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label="Refresh data"
              className="flex size-10 items-center justify-center rounded-full text-slate-600 active:bg-slate-200 disabled:opacity-60"
            >
              <RotateCw size={20} strokeWidth={1.75} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="pb-3">
            <DateRangePicker value={range} onChange={setRange} tone="finance" />
          </div>
          {activeTab === 'transactions' && onSearchChange && (
            <div className="relative pb-3">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-[14px] text-slate-400" />
              <label htmlFor="finance-search" className="sr-only">Search payments</label>
              <input
                id="finance-search"
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Order, user or kiosk"
                className="h-11 w-full rounded-[12px] border border-slate-200 bg-white pl-10 pr-3 text-[16px] text-slate-900 placeholder:text-slate-500 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
              />
            </div>
          )}
        </header>

        <main className="flex-1 px-4 pb-28 pt-1">
          <div className="space-y-5">{children}</div>
        </main>

        <nav
          aria-label="Finance sections"
          className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[480px] border-t border-slate-200 bg-slate-50/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
        >
          <div className="grid h-[58px] grid-cols-5">
            {[...TABS, { id: '__more' as const, label: 'More', icon: MoreHorizontal }].map((t) => {
              const Icon = t.icon;
              const active = t.id === '__more' ? inMore || moreOpen : activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => (t.id === '__more' ? setMoreOpen(true) : onTabChange(t.id))}
                  className={`relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? 'text-indigo-700' : 'text-slate-500'}`}
                >
                  <Icon size={22} strokeWidth={active ? 2.1 : 1.75} />
                  {t.label}
                  {t.id === 'refunds' && pendingRefundsCount > 0 && (
                    <span className="absolute left-1/2 top-1.5 ml-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold tabular-nums text-white">
                      {pendingRefundsCount > 9 ? '9+' : pendingRefundsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {moreOpen && (
          <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="More">
            <div className="absolute inset-0 bg-slate-950/40 animate-fadeIn" onClick={() => setMoreOpen(false)} />
            <div className="sheet-in absolute inset-x-0 bottom-0 mx-auto w-full max-w-[480px] rounded-t-[28px] bg-white px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl">
              <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-slate-300" />
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-[20px] font-semibold tracking-tight">More</h2>
                <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close" className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                  <X size={16} />
                </button>
              </div>
              <div className="overflow-hidden rounded-[20px] bg-slate-100">
                {MORE.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onTabChange(m.id)}
                      className="flex min-h-[52px] w-full items-center gap-3 border-t border-slate-200 px-4 text-left first:border-t-0 active:bg-slate-200"
                    >
                      <Icon size={20} strokeWidth={1.75} className="text-slate-500" />
                      <span className={`flex-1 text-[16px] ${activeTab === m.id ? 'font-semibold text-indigo-700' : ''}`}>{m.label}</span>
                      <ChevronRight size={16} className="text-slate-400" />
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 overflow-hidden rounded-[20px] bg-slate-100">
                <button type="button" onClick={onLogout} className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left active:bg-slate-200">
                  <LogOut size={20} strokeWidth={1.75} className="text-rose-600" />
                  <span className="text-[16px] text-rose-600">Sign out</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
