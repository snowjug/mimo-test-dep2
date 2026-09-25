import React, { useState } from 'react';
import { FinanceSidebar, FinanceTab } from './FinanceSidebar';
import { FinanceTopbar } from './FinanceTopbar';
import { X } from 'lucide-react';

export interface FinanceLayoutProps {
  activeTab: FinanceTab;
  onTabChange: (tab: FinanceTab) => void;
  onLogout: () => void;
  dateRange: string;
  onDateRangeChange: (range: string) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  pendingRefundsCount?: number;
  children: React.ReactNode;
}

export const FinanceLayout: React.FC<FinanceLayoutProps> = ({
  activeTab,
  onTabChange,
  onLogout,
  dateRange,
  onDateRangeChange,
  onRefresh,
  isRefreshing,
  searchQuery,
  onSearchChange,
  pendingRefundsCount,
  children,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleTabSelect = (tab: FinanceTab) => {
    onTabChange(tab);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="finance-layout">
      {/* ── DESKTOP PERSISTENT SIDEBAR (GRID COL 1, ROW 1/-1) ─────────── */}
      <FinanceSidebar
        activeTab={activeTab}
        onTabChange={handleTabSelect}
        onLogout={onLogout}
        pendingRefundsCount={pendingRefundsCount}
      />

      {/* ── MOBILE DRAWER (ONLY VISIBLE ON PHONES/TABLETS) ─────────────── */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 max-w-xs w-full bg-white shadow-2xl z-50 flex flex-col">
            <div className="p-4 flex items-center justify-end border-b border-[#EDE9FE]">
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <FinanceSidebar
                activeTab={activeTab}
                onTabChange={handleTabSelect}
                onLogout={onLogout}
                pendingRefundsCount={pendingRefundsCount}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── TOPBAR NAVIGATION (GRID COL 2, ROW 1) ──────────────────────── */}
      <FinanceTopbar
        activeTab={activeTab}
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
      />

      {/* ── MAIN DASHBOARD CONTENT (GRID COL 2, ROW 2) ─────────────────── */}
      <main className="finance-main">
        <div className="max-w-[1600px] w-full mx-auto space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
};
