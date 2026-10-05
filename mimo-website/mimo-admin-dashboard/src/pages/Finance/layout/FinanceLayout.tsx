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
  PieChart,
  Receipt,
  Menu,
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
  dashboard: 'Finance Dashboard',
  transactions: 'Transactions',
  analytics: 'Revenue Analytics',
  refunds: 'Refunds & Disputes',
  pricing: 'Pricing & Coupons',
  wallet: 'Wallet & Credits',
  settlements: 'Settlements & Reports',
  expenses: 'Revenue & Expenses',
};

const TABS: { id: FinanceTab; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard',    label: 'Dashboard', icon: PieChart },
  { id: 'overview',     label: 'Overview',  icon: LayoutDashboard },
  { id: 'transactions', label: 'Payments',  icon: ArrowLeftRight },
  { id: 'expenses',     label: 'Expenses',  icon: Receipt },
];

const MORE: { id: FinanceTab; label: string; icon: React.ElementType }[] = [
  { id: 'refunds',     label: 'Refunds & Disputes',     icon: RotateCcw },
  { id: 'analytics',   label: 'Revenue Analytics',      icon: BarChart3 },
  { id: 'pricing',     label: 'Pricing & Coupons',      icon: Tag },
  { id: 'wallet',      label: 'Wallet & Credits',       icon: WalletCards },
  { id: 'settlements', label: 'Settlements & Reports',  icon: FileSpreadsheet },
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
      {/* ── DESKTOP (lg and up): fixed sidebar + topbar grid ── */}
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

      {/* ── PHONE / TABLET (below lg): full-width fluid responsive mobile shell ── */}
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col bg-slate-50 lg:hidden">
        <header className="sticky top-0 z-30 bg-slate-50/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
          <div className="flex h-14 items-center justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">MIMO Finance</p>
              <h1 className="-mt-0.5 truncate text-[20px] font-black tracking-tight text-slate-900">
                {TITLES[activeTab] || 'Finance'}
              </h1>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                aria-label="Refresh data"
                className="flex size-9 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 active:bg-slate-100 disabled:opacity-60 shadow-2xs cursor-pointer"
              >
                <RotateCw size={16} strokeWidth={2} className={isRefreshing ? 'animate-spin text-indigo-600' : ''} />
              </button>
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-label="Open menu"
                className="flex size-9 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 active:bg-slate-100 shadow-2xs cursor-pointer"
              >
                <Menu size={18} strokeWidth={2} />
              </button>
            </div>
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
                className="h-11 w-full rounded-[12px] border border-slate-200 bg-white pl-10 pr-3 text-[15px] text-slate-900 placeholder:text-slate-500 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
              />
            </div>
          )}
        </header>

        <main className="flex-1 w-full px-3.5 sm:px-6 pb-28 pt-3 min-w-0 overflow-x-hidden">
          <div className="space-y-5 w-full min-w-0">{children}</div>
        </main>

        <nav
          aria-label="Finance sections"
          className="fixed inset-x-0 bottom-0 z-30 w-full border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md shadow-lg"
        >
          <div className="grid h-[58px] max-w-2xl mx-auto grid-cols-5">
            {[...TABS, { id: '__more' as const, label: 'More', icon: MoreHorizontal }].map((t) => {
              const Icon = t.icon;
              const active = t.id === '__more' ? inMore || moreOpen : activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => (t.id === '__more' ? setMoreOpen(true) : onTabChange(t.id))}
                  className={`relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold cursor-pointer transition-colors ${active ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Icon size={20} strokeWidth={active ? 2.5 : 1.75} />
                  <span>{t.label}</span>
                  {t.id === 'refunds' && pendingRefundsCount > 0 && (
                    <span className="absolute left-1/2 top-1 ml-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-extrabold tabular-nums text-white shadow-xs">
                      {pendingRefundsCount > 9 ? '9+' : pendingRefundsCount}
                    </span>
                  )}
                  {active && <span className="absolute bottom-1 w-4 h-0.5 bg-indigo-600 rounded-full" />}
                </button>
              );
            })}
          </div>
        </nav>

        {moreOpen && (
          <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="More">
            <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-xs animate-fadeIn" onClick={() => setMoreOpen(false)} />
            <div className="sheet-in absolute inset-x-0 bottom-0 mx-auto w-full max-w-lg rounded-t-[28px] bg-white px-5 pt-3 pb-[max(24px,env(safe-area-inset-bottom))] shadow-2xl">
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />
              <div className="mb-4 flex items-center justify-between px-1">
                <div>
                  <h2 className="text-[18px] font-black tracking-tight text-slate-900">All Finance Modules</h2>
                  <p className="text-[11px] text-slate-400">Quick access to all financial reports &amp; tools</p>
                </div>
                <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close" className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer">
                  <X size={16} />
                </button>
              </div>
              <div className="overflow-hidden rounded-[20px] bg-slate-50 border border-slate-200 divide-y divide-slate-100">
                {MORE.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onTabChange(m.id)}
                      className="flex min-h-[50px] w-full items-center gap-3 px-4 text-left hover:bg-indigo-50/50 active:bg-indigo-100 transition-colors cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 shadow-2xs">
                        <Icon size={16} strokeWidth={2} />
                      </div>
                      <span className={`flex-1 text-[14px] font-semibold ${activeTab === m.id ? 'font-bold text-indigo-700' : 'text-slate-800'}`}>{m.label}</span>
                      <ChevronRight size={16} className="text-slate-400" />
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 overflow-hidden rounded-[20px] bg-rose-50/60 border border-rose-100">
                <button type="button" onClick={onLogout} className="flex min-h-[50px] w-full items-center gap-3 px-4 text-left active:bg-rose-100 cursor-pointer">
                  <div className="w-8 h-8 rounded-xl bg-white border border-rose-200 flex items-center justify-center text-rose-600 shadow-2xs">
                    <LogOut size={16} strokeWidth={2} />
                  </div>
                  <span className="text-[14px] font-bold text-rose-600">Sign out of Finance</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
