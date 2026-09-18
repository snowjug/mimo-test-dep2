import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Search,
  CheckCircle2,
  TrendingUp,
  Receipt,
  IndianRupee,
} from 'lucide-react';
import { financeService } from '../../services/finance.service';
import { FinancePageData } from '../../types/finance.types';
import { Badge } from '../../components/ui/Badge';
import { MetricCard } from '../../components/ui/MetricCard';

export const FinancePage: React.FC = () => {
  const [data, setData] = useState<FinancePageData | null>(null);
  const [searchTxn, setSearchTxn] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const res = await financeService.getFinance();
      setData(res);
    } catch (e) {
      console.error('Error fetching finance data', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };

  const kpis = data?.kpis;
  const paymentMethods = data?.paymentMethods || [];
  const transactions = data?.transactions || [];

  const filteredTxns = transactions.filter(
    (t) =>
      t.txCode.toLowerCase().includes(searchTxn.toLowerCase()) ||
      t.jobCode.toLowerCase().includes(searchTxn.toLowerCase()) ||
      t.kioskName.toLowerCase().includes(searchTxn.toLowerCase())
  );

  return (
    <div className="space-y-8 sm:space-y-10 select-none font-sans text-[#F5F7FA]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[#F5F7FA]">
            Finance & Billing Operations
          </h1>
          <p className="text-base sm:text-lg font-medium mt-1.5 text-[#8EA6BF] leading-relaxed">
            Campus payment collections, payment method distribution, and transaction ledger
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 bg-[#10223A] border border-[#1D3A59] rounded-xl text-sm font-bold text-[#8EA6BF] hover:text-[#F5F7FA] hover:border-[#20D3A2]/50 transition-all shadow-xs cursor-pointer"
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin text-[#20D3A2]' : 'text-[#8EA6BF]'} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh Ledger'}</span>
          </button>
        </div>
      </div>

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="TOTAL REVENUE"
          value={`₹${(kpis?.totalRevenue ?? 14250).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          subtext="Campus print billing"
          trendBadge={{ text: '+14.2%', positive: true }}
          icon={<IndianRupee size={18} className="text-[#20D3A2]" />}
        />
        <MetricCard
          title="TOTAL TRANSACTIONS"
          value={(kpis?.totalTransactions ?? 342).toLocaleString()}
          subtext="Completed student checkouts"
          trendBadge={{ text: '+12%', positive: true }}
          icon={<Receipt size={18} className="text-blue-400" />}
        />
        <MetricCard
          title="AVG ORDER VALUE"
          value={`₹${(kpis?.avgOrderValue ?? 41.66).toFixed(2)}`}
          subtext="Per print dispatch session"
          icon={<TrendingUp size={18} className="text-amber-400" />}
        />
        <MetricCard
          title="SETTLED AMOUNT"
          value={`₹${(kpis?.settledAmount ?? 13670).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          subtext="Processed to campus bank"
          trendBadge={{ text: 'Settled', positive: true }}
          icon={<CheckCircle2 size={18} className="text-[#20D3A2]" />}
        />
      </div>

      {/* Payment Method Distribution */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {paymentMethods.map((pm) => (
          <div key={pm.method} className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 sm:p-7 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-xs sm:text-sm uppercase tracking-wider text-[#8EA6BF]">
                {pm.method} PAYMENTS
              </span>
              <span className="font-mono text-xs font-black px-2.5 py-1 rounded-md bg-[#0A1728] border border-[#1D3A59] text-[#20D3A2]">
                {pm.percentage}%
              </span>
            </div>
            <div>
              <div className="text-3xl font-black text-[#F5F7FA]">
                ₹{pm.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs sm:text-sm text-[#8EA6BF] font-medium mt-1">
                {pm.transactionCount} transactions
              </p>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden bg-[#0A1728] border border-[#1D3A59]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pm.percentage}%`, backgroundColor: pm.color }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Transactions Ledger Table Card */}
      <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 sm:p-7 space-y-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-[#F5F7FA]">Billing & Transaction Ledger</h2>
            <p className="text-xs sm:text-sm text-[#8EA6BF] mt-0.5 font-medium">
              Live payment records from UPI, Card, and Cash terminals
            </p>
          </div>

          <div className="relative w-full sm:w-80">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6F89A3]" />
            <input
              type="text"
              placeholder="Search by Txn, Job #..."
              value={searchTxn}
              onChange={(e) => setSearchTxn(e.target.value)}
              className="w-full min-h-[44px] pl-10 pr-4 py-2 text-sm rounded-xl bg-[#0A1728] border border-[#1D3A59] text-[#F5F7FA] placeholder-[#6F89A3] focus:outline-none focus:border-[#20D3A2] focus:ring-2 focus:ring-[#20D3A2]/20"
            />
          </div>
        </div>

        {/* Desktop View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#1D3A59] text-xs uppercase font-black tracking-wider text-[#8EA6BF]">
                <th className="pb-4 pl-3">Transaction ID</th>
                <th className="pb-4">Job Code</th>
                <th className="pb-4">Kiosk Node</th>
                <th className="pb-4">Amount</th>
                <th className="pb-4">Payment Mode</th>
                <th className="pb-4">Status</th>
                <th className="pb-4 pr-3 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1D3A59] font-medium">
              {filteredTxns.map((tx) => (
                <tr key={tx.id} className="hover:bg-[#132943]/80 transition-colors">
                  <td className="py-4 pl-3 font-mono font-bold text-[#20D3A2]">
                    {tx.txCode}
                  </td>
                  <td className="py-4 font-mono font-semibold text-[#8EA6BF]">
                    {tx.jobCode}
                  </td>
                  <td className="py-4 font-semibold text-[#F5F7FA]">{tx.kioskName}</td>
                  <td className="py-4 font-black text-[#F5F7FA]">
                    ₹{tx.amount.toFixed(2)}
                  </td>
                  <td className="py-4 font-semibold text-[#8EA6BF]">{tx.method}</td>
                  <td className="py-4 whitespace-nowrap">
                    <Badge status={tx.status} />
                  </td>
                  <td className="py-4 pr-3 text-right text-[#8EA6BF] text-xs font-semibold whitespace-nowrap">
                    {tx.timestamp}
                  </td>
                </tr>
              ))}
              {filteredTxns.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-14 text-center text-[#8EA6BF] font-semibold text-sm">
                    No transaction records match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden space-y-3.5">
          {filteredTxns.map((tx) => (
            <div
              key={tx.id}
              className="p-5 rounded-2xl border border-[#1D3A59] bg-[#0A1728] space-y-3 shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="font-mono text-xs font-bold text-[#20D3A2]">
                    {tx.txCode}
                  </span>
                  <div className="font-black text-lg text-[#F5F7FA] mt-0.5">
                    ₹{tx.amount.toFixed(2)}
                  </div>
                </div>
                <Badge status={tx.status} />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs py-2.5 border-t border-b border-[#1D3A59]">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#6F89A3]">Job Code</span>
                  <div className="font-mono font-semibold text-[#F5F7FA] mt-0.5">{tx.jobCode}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#6F89A3]">Kiosk</span>
                  <div className="font-semibold text-[#F5F7FA] mt-0.5">{tx.kioskName}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#6F89A3]">Method</span>
                  <div className="font-semibold text-[#F5F7FA] mt-0.5">{tx.method}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#6F89A3]">Time</span>
                  <div className="text-[#8EA6BF] mt-0.5">{tx.timestamp}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
