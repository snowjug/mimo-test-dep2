import React, { useEffect, useState } from 'react';
import {
  CreditCard,
  RefreshCw,
  Search,
  IndianRupee,
  CheckCircle2,
  Smartphone,
  Banknote,
  Wallet,
} from 'lucide-react';
import { financeService } from '../../services/finance.service';
import type { FinancePageData, TransactionItem } from '../../types/finance.types';
import { MetricCard } from '../../components/cards/MetricCard';
import { Badge } from '../../components/ui/Badge';

interface FinancePageProps {
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export const FinancePage: React.FC<FinancePageProps> = ({
  searchQuery = '',
  onSearchChange,
}) => {
  const [data, setData] = useState<FinancePageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [methodFilter, setMethodFilter] = useState<'All' | 'UPI' | 'Card' | 'Cash'>('All');
  const [localSearch, setLocalSearch] = useState(searchQuery);

  const loadData = async () => {
    try {
      const res = await financeService.getFinance();
      setData(res);
    } catch (err) {
      console.error('Failed to load finance data', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const effectiveSearch = searchQuery || localSearch;

  const handleSearchChange = (val: string) => {
    setLocalSearch(val);
    if (onSearchChange) {
      onSearchChange(val);
    }
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#20D3A2] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-[#8EA6BF]">Loading Financial Ledger...</span>
        </div>
      </div>
    );
  }

  const filteredTransactions = data.transactions.filter((tx) => {
    const matchesMethod = methodFilter === 'All' || tx.method === methodFilter;
    const matchesSearch =
      !effectiveSearch ||
      tx.txCode.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      tx.jobCode.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      tx.kioskName.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      tx.method.toLowerCase().includes(effectiveSearch.toLowerCase());

    return matchesMethod && matchesSearch;
  });

  const getMethodIcon = (method: TransactionItem['method']) => {
    switch (method) {
      case 'UPI':
        return <Smartphone size={14} className="text-[#20D3A2]" />;
      case 'Card':
        return <CreditCard size={14} className="text-sky-400" />;
      case 'Cash':
        return <Banknote size={14} className="text-amber-400" />;
      default:
        return <Wallet size={14} className="text-[#8EA6BF]" />;
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black text-[#F5F7FA] tracking-tight">
              Finance & Billing Ledger
            </h1>
            <Badge variant="active" size="sm">
              SETTLEMENT GATEWAY
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-[#8EA6BF] font-medium mt-1">
            Real-time transaction capture, UPI & card settlement reconciliation, and gross kiosk billing.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-[#10223A] hover:bg-[#132943] border border-[#1D3A59] text-[#F5F7FA] rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-[#20D3A2]' : ''} />
            <span>{refreshing ? 'Reconciling...' : 'Sync Gateway'}</span>
          </button>
        </div>
      </div>

      {/* Row 1: KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
        <MetricCard
          title="Gross Revenue Today"
          value={`₹${data.kpis.totalRevenue.toLocaleString()}`}
          subtitle="All transactions logged"
          icon={<IndianRupee size={18} className="text-[#20D3A2]" />}
          trendText="+18.4%"
          trendPositive={true}
          accentBarColor="emerald"
        />
        <MetricCard
          title="Total Transactions"
          value={data.kpis.totalTransactions.toString()}
          subtitle="Completed kiosk sessions"
          icon={<CreditCard size={18} className="text-sky-400" />}
          trendText="98.5% Auth"
          trendPositive={true}
        />
        <MetricCard
          title="Average Order Value"
          value={`₹${data.kpis.avgOrderValue.toFixed(2)}`}
          subtitle="~13.8 pages per session"
          icon={<IndianRupee size={18} className="text-amber-400" />}
          trendText="Nominal"
          trendPositive={true}
        />
        <MetricCard
          title="Settled to Bank"
          value={`₹${data.kpis.settledAmount.toLocaleString()}`}
          subtitle="T+1 settlement batch"
          icon={<CheckCircle2 size={18} className="text-[#20D3A2]" />}
          trendText="Reconciled"
          trendPositive={true}
        />
      </div>

      {/* Row 2: Payment Method Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
        {data.paymentMethods.map((pm) => (
          <div
            key={pm.method}
            className="p-5 sm:p-6 rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg flex flex-col justify-between"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#1D3A59]">
              <div className="flex items-center gap-2">
                {getMethodIcon(pm.method)}
                <h3 className="text-sm font-bold text-[#F5F7FA]">{pm.method} Payments</h3>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-[#07111F] text-[#F5F7FA] border border-[#1D3A59]">
                {pm.percentage}% Share
              </span>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-2xl font-black text-[#F5F7FA]">₹{pm.amount.toLocaleString()}</p>
              <div className="flex items-center justify-between text-xs text-[#8EA6BF]">
                <span>{pm.transactionCount} transactions</span>
                <span className="text-[#20D3A2] font-semibold">100% Success</span>
              </div>
              <div className="h-1.5 w-full bg-[#07111F] rounded-full overflow-hidden border border-[#1D3A59]">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pm.percentage}%`, backgroundColor: pm.color }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Row 3: Filter Toolbar */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {(['All', 'UPI', 'Card', 'Cash'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethodFilter(m)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                methodFilter === m
                  ? 'bg-[#20D3A2] text-[#07111F] shadow-md shadow-[#20D3A2]/20 font-black'
                  : 'bg-[#07111F]/70 text-[#8EA6BF] hover:text-[#F5F7FA] hover:bg-[#132943] border border-[#1D3A59]'
              }`}
            >
              {m} Payments
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8EA6BF]" />
          <input
            type="text"
            placeholder="Search tx ID, job, kiosk..."
            value={effectiveSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-[#07111F]/70 border border-[#1D3A59] rounded-xl text-xs text-[#F5F7FA] placeholder-[#6F89A3] focus:border-[#20D3A2] focus:outline-hidden transition-all"
          />
        </div>
      </div>

      {/* Row 4: Transaction Ledger Table & Mobile Stacked Cards */}
      <div className="rounded-2xl bg-[#10223A] border border-[#1D3A59] shadow-lg overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[#1D3A59] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-bold text-[#F5F7FA]">Settlement Ledger</h3>
            <span className="text-xs font-semibold text-[#8EA6BF]">
              ({filteredTransactions.length} records)
            </span>
          </div>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="p-12 text-center">
            <CreditCard size={36} className="mx-auto text-[#6F89A3] opacity-50 mb-3" />
            <p className="text-sm font-bold text-[#F5F7FA]">No transactions found</p>
            <p className="text-xs text-[#8EA6BF] mt-1">Try changing the payment method filter.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1D3A59] bg-[#07111F]/40 text-[11px] font-black uppercase text-[#6F89A3] tracking-wider">
                    <th className="py-3.5 px-5">Tx ID</th>
                    <th className="py-3.5 px-5">Job Reference</th>
                    <th className="py-3.5 px-5">Kiosk Node</th>
                    <th className="py-3.5 px-5">Gateway Method</th>
                    <th className="py-3.5 px-5 text-right">Gross Amount</th>
                    <th className="py-3.5 px-5 text-center">Status</th>
                    <th className="py-3.5 px-5 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1D3A59]/60 text-xs text-[#CAD7E6]">
                  {filteredTransactions.map((tx) => (
                    <tr
                      key={tx.id}
                      className="hover:bg-[#132943]/40 transition-colors"
                    >
                      <td className="py-4 px-5 font-mono font-bold text-[#20D3A2]">
                        {tx.txCode}
                      </td>
                      <td className="py-4 px-5 font-mono font-medium text-[#F5F7FA]">
                        {tx.jobCode}
                      </td>
                      <td className="py-4 px-5 font-semibold text-[#F5F7FA]">
                        {tx.kioskName}
                      </td>
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-2">
                          {getMethodIcon(tx.method)}
                          <span className="font-semibold text-[#F5F7FA]">{tx.method}</span>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-right font-black text-[#F5F7FA]">
                        ₹{tx.amount.toFixed(2)}
                      </td>
                      <td className="py-4 px-5 text-center">
                        <Badge
                          variant={tx.status === 'completed' ? 'completed' : 'critical'}
                          size="sm"
                        >
                          {tx.status.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-4 px-5 text-right text-[11px] text-[#8EA6BF]">
                        {tx.timestamp}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Card View */}
            <div className="md:hidden divide-y divide-[#1D3A59]/60">
              {filteredTransactions.map((tx) => (
                <div key={tx.id} className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-[#20D3A2]">
                      {tx.txCode}
                    </span>
                    <Badge
                      variant={tx.status === 'completed' ? 'completed' : 'critical'}
                      size="sm"
                    >
                      {tx.status.toUpperCase()}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#F5F7FA]">{tx.kioskName}</span>
                    <span className="text-sm font-black text-[#20D3A2]">₹{tx.amount.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#8EA6BF] pt-1">
                    <div className="flex items-center gap-1.5">
                      {getMethodIcon(tx.method)}
                      <span>{tx.method}</span>
                    </div>
                    <span>{tx.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
