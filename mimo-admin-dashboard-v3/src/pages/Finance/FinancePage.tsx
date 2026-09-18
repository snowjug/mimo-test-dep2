import React, { useState } from 'react';
import {
  CreditCard,
  RefreshCw,
  IndianRupee,
  CheckCircle2,
  Smartphone,
  Banknote,
  Wallet,
} from 'lucide-react';
import { useFinance } from '../../hooks/useFinance';
import { MetricCard } from '../../components/cards/MetricCard';
import { PageHeader } from '../../components/ui/PageHeader';
import { LoadingSkeleton } from '../../components/ui/LoadingSkeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { SearchInput } from '../../components/ui/SearchInput';
import type { TransactionRecord } from '../../types/finance';

export interface FinancePageProps {
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export const FinancePage: React.FC<FinancePageProps> = ({
  searchQuery = '',
}) => {
  const { data, loading, refreshing, error, refresh } = useFinance();
  const [methodFilter, setMethodFilter] = useState<'All' | 'UPI' | 'Card' | 'Cash'>('All');
  const [localSearch, setLocalSearch] = useState(searchQuery);

  if (loading) return <LoadingSkeleton rows={4} />;
  if (error || !data) {
    return (
      <EmptyState
        title="Failed to Load Finance Ledger"
        description={error || 'An error occurred while connecting to the billing database.'}
        actionText="Retry"
        onAction={refresh}
      />
    );
  }

  const effectiveSearch = searchQuery || localSearch;
  const filteredTransactions = data.transactions.filter((tx) => {
    const matchesMethod = methodFilter === 'All' || tx.method === methodFilter;
    const matchesSearch =
      !effectiveSearch ||
      tx.txCode.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      tx.jobCode.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      tx.kioskName.toLowerCase().includes(effectiveSearch.toLowerCase());

    return matchesMethod && matchesSearch;
  });

  const getMethodIcon = (method: TransactionRecord['method']) => {
    switch (method) {
      case 'UPI':
        return <Smartphone size={18} className="text-indigo-600 dark:text-[#818CF8]" />;
      case 'Card':
        return <CreditCard size={18} className="text-purple-600 dark:text-purple-400" />;
      case 'Cash':
        return <Banknote size={18} className="text-amber-600 dark:text-amber-400" />;
      default:
        return <Wallet size={18} className="text-slate-500 dark:text-slate-400" />;
    }
  };

  return (
    <div className="flex flex-col gap-3.5 sm:gap-4 lg:gap-5 animate-in fade-in duration-200 font-sans">
      {/* Page Header */}
      <PageHeader
        title="Finance & Billing Ledger"
        description="Real-time transaction capture, UPI & card settlement reconciliation, and gross kiosk billing logs."
        actions={
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4.5 h-11 bg-white dark:bg-[#111C30] hover:bg-slate-50 dark:hover:bg-[#1A2844] border border-slate-200 dark:border-[#1E293B] text-slate-700 dark:text-[#F1F5F9] rounded-xl text-sm font-semibold transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin text-indigo-600 dark:text-[#818CF8]' : 'text-indigo-500 dark:text-[#818CF8]'} />
            <span>{refreshing ? 'Syncing...' : 'Sync Gateway'}</span>
          </button>
        }
      />

      {/* 4 Financial KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5 lg:gap-4">
        <MetricCard
          title="Gross Revenue Today"
          value={`₹${data.kpis.totalRevenue.toLocaleString()}`}
          trendText="+18.4%"
          trendPositive={true}
          subtitle="All transactions logged"
          icon={<IndianRupee size={16} />}
          iconBg="bg-[#EEF2FF] text-[#4F46E5] dark:bg-[#818CF8]/20 dark:text-[#818CF8]"
          hasTopHighlight={true}
        />
        <MetricCard
          title="Total Transactions"
          value={data.kpis.totalTransactions}
          trendText="98.5% Auth"
          trendPositive={true}
          subtitle="Completed kiosk sessions"
          icon={<CreditCard size={16} />}
          iconBg="bg-[#E0F2FE] text-[#0284C7] dark:bg-[#0284C7]/20 dark:text-[#38BDF8]"
        />
        <MetricCard
          title="Average Order Value"
          value={`₹${data.kpis.avgOrderValue.toFixed(2)}`}
          subtitle="~13.8 pages per order"
          icon={<IndianRupee size={16} />}
          iconBg="bg-[#F3E8FF] text-[#7C3AED] dark:bg-[#9333EA]/20 dark:text-[#C084FC]"
        />
        <MetricCard
          title="Settled to Bank"
          value={`₹${data.kpis.settledAmount.toLocaleString()}`}
          subtitle="T+1 settlement batch"
          icon={<CheckCircle2 size={16} />}
          iconBg="bg-[#EEF2FF] text-[#4F46E5] dark:bg-indigo-950/60 dark:text-[#A5B4FC]"
        />
      </div>

      {/* 3 Payment Methods Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-3.5 lg:gap-4">
        {data.paymentMethods.map((pm) => (
          <div
            key={pm.method}
            className="mimo-card p-5 sm:p-6 lg:p-7 flex flex-col justify-between h-full space-y-4 !min-h-[170px]"
          >
            {/* Header: Icon + Method Title on left, Share Badge on right */}
            <div className="w-full flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1E314B]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#0C1829] border border-slate-200 dark:border-[#1E314B] flex items-center justify-center shrink-0">
                  {getMethodIcon(pm.method)}
                </div>
                <h3 className="text-base sm:text-[17px] font-semibold text-slate-900 dark:text-[#F8FAFC]">
                  {pm.method}
                </h3>
              </div>
              <span className="text-xs sm:text-[13px] font-semibold px-3 py-1 rounded-full bg-slate-100 dark:bg-[#0C1829] text-slate-700 dark:text-[#CBD5E1] border border-slate-200 dark:border-[#1E314B]">
                {pm.percentage}% Share
              </span>
            </div>

            {/* Body: Prominent Centered Amount */}
            <div className="py-1 text-center my-auto">
              <p className="text-2xl sm:text-[30px] font-semibold text-slate-900 dark:text-[#F8FAFC] tracking-tight">
                ₹{pm.amount.toLocaleString()}
              </p>
            </div>

            {/* Footer: Sessions / Success + Progress bar */}
            <div className="w-full space-y-2.5 pt-1">
              <div className="w-full flex items-center justify-between text-sm sm:text-[14px] text-slate-500 dark:text-[#94A3B8]">
                <span>{pm.transactionCount} sessions</span>
                <span className="text-[#6366F1] dark:text-[#A5B4FC] font-medium">100% Success</span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 dark:bg-[#0C1829] rounded-full overflow-hidden border border-slate-200/60 dark:border-[#1E314B]">
                <div
                  className="h-full bg-[#6366F1] dark:bg-[#6366F1] rounded-full transition-all duration-500"
                  style={{ width: `${pm.percentage}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Bar & Transaction Table */}
      <div className="mimo-card p-5 sm:p-6 lg:p-7 space-y-5">
        <div className="pb-4 border-b border-slate-100 dark:border-[#1E314B] flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {(['All', 'UPI', 'Card', 'Cash'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethodFilter(m)}
                className={`px-4.5 py-2.5 h-11 sm:h-12 rounded-xl text-sm sm:text-[15px] font-medium transition-all shrink-0 cursor-pointer ${
                  methodFilter === m
                    ? 'bg-[#6366F1] text-white shadow-xs dark:bg-[#6366F1] dark:text-white'
                    : 'bg-slate-100 dark:bg-[#0C1829] text-slate-700 dark:text-[#CBD5E1] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#14243A] border border-slate-200 dark:border-[#1E314B]'
                }`}
              >
                {m === 'All' ? 'All Methods' : `${m} Payments`}
              </button>
            ))}
          </div>

          <div className="w-full sm:w-80 md:w-96 shrink-0">
            <SearchInput
              placeholder="Search Tx ID, Job Code, Kiosk..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              iconSize={18}
              inputSize="md"
              className="!h-11 sm:!h-12 text-sm sm:text-[15px]"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-[#1E314B] text-[13px] sm:text-[14px] font-semibold uppercase text-slate-400 dark:text-[#8495AA] tracking-wider">
                <th className="py-3.5 px-4 text-left min-w-[150px]">Transaction ID</th>
                <th className="py-3.5 px-4 text-left min-w-[110px]">Job Code</th>
                <th className="py-3.5 px-4 text-left min-w-[200px]">Kiosk</th>
                <th className="py-3.5 px-4 text-left min-w-[130px]">Method</th>
                <th className="py-3.5 px-4 text-right min-w-[130px]">Amount (₹)</th>
                <th className="py-3.5 px-4 text-right min-w-[120px]">Time</th>
                <th className="py-3.5 px-4 text-center min-w-[140px]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#1E314B]">
              {filteredTransactions.map((tx) => (
                <tr
                  key={tx.id}
                  className="hover:bg-slate-50 dark:hover:bg-[#14243A]/50 transition-colors h-[50px] sm:h-[54px]"
                >
                  <td className="py-3.5 px-4 font-mono font-semibold text-[14px] sm:text-[15px] text-slate-900 dark:text-[#F1F5F9]">
                    {tx.txCode}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[14px] sm:text-[15px] text-slate-500 dark:text-[#94A3B8]">
                    {tx.jobCode}
                  </td>
                  <td className="py-3.5 px-4 text-[14px] sm:text-[15px] font-medium text-slate-800 dark:text-[#CBD5E1]">
                    {tx.kioskName}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center gap-2 font-medium text-slate-800 dark:text-[#F1F5F9] text-[14px] sm:text-[15px]">
                      {getMethodIcon(tx.method)}
                      <span>{tx.method}</span>
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-semibold text-[14px] sm:text-[15px] text-slate-900 dark:text-[#F1F5F9]">
                    ₹{tx.amount.toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4 text-right text-slate-500 dark:text-[#94A3B8] text-[13px] sm:text-[14px] font-medium">
                    {tx.timestamp}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span
                      className={`inline-flex items-center justify-center text-xs sm:text-[13px] font-semibold px-3 py-1 rounded-full uppercase tracking-wider ${
                        tx.status === 'completed'
                          ? 'bg-[#EEF2FF] text-[#4F46E5] dark:bg-indigo-950/70 dark:text-[#A5B4FC] border border-indigo-200 dark:border-indigo-800/60'
                          : tx.status === 'refunded'
                          ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/70 dark:text-sky-400 border border-sky-200 dark:border-sky-800/60'
                          : 'bg-rose-50 text-rose-700 dark:bg-rose-950/70 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'
                      }`}
                    >
                      {tx.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
