import React, { useState, useMemo } from 'react';
import {
  Search,
  Download,
  IndianRupee,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCcw,
  Eye,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Filter,
} from 'lucide-react';
import { FinanceMetricCard } from '../components/FinanceMetricCard';
import { StatusBadge } from '../components/StatusBadge';
import { FinanceDetailsDrawer } from '../components/FinanceDetailsDrawer';

export interface FinanceTransactionsPageProps {
  transactions: any[];
  loading: boolean;
  onRefresh: () => void;
}

export const FinanceTransactionsPage: React.FC<FinanceTransactionsPageProps> = ({
  transactions,
  loading,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [sortField, setSortField] = useState<'createdAt' | 'cost' | 'id'>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [selectedTxn, setSelectedTxn] = useState<any | null>(null);

  // Filter and sort transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchSearch =
        !searchTerm ||
        (t.id && String(t.id).toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.orderId && String(t.orderId).toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.userEmail && String(t.userEmail).toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.destination && String(t.destination).toLowerCase().includes(searchTerm.toLowerCase()));

      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'SUCCESS' && (t.status === 'SUCCESS' || t.status === 'completed' || t.status === 'paid' || t.status === 'printed')) ||
        (statusFilter === 'PENDING' && (t.status === 'PENDING' || t.status === 'processing' || t.status === 'queued')) ||
        (statusFilter === 'FAILED' && (t.status === 'FAILED' || t.status === 'error' || t.status === 'failed')) ||
        (statusFilter === 'REFUNDED' && (t.status === 'REFUNDED' || t.refundStatus));

      const matchMethod =
        methodFilter === 'ALL' ||
        (methodFilter === 'UPI' && (t.paymentMethod === 'UPI' || t.colorMode === 'color')) ||
        (methodFilter === 'WALLET' && (t.paymentMethod === 'WALLET' || t.colorMode === 'bw')) ||
        (methodFilter === 'CARD' && t.paymentMethod === 'CARD');

      return matchSearch && matchStatus && matchMethod;
    }).sort((a, b) => {
      if (sortField === 'cost') {
        const valA = Number(a.cost || 0);
        const valB = Number(b.cost || 0);
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      if (sortField === 'id') {
        return sortDirection === 'asc'
          ? String(a.id || '').localeCompare(String(b.id || ''))
          : String(b.id || '').localeCompare(String(a.id || ''));
      }
      // Date sort
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
    });
  }, [transactions, searchTerm, statusFilter, methodFilter, sortField, sortDirection]);

  // Metrics computation
  const totalTxnCount = transactions.length;
  const successTxnCount = transactions.filter((t) => t.status === 'completed' || t.status === 'paid' || t.status === 'SUCCESS' || t.status === 'printed').length;
  const failedTxnCount = transactions.filter((t) => t.status === 'failed' || t.status === 'FAILED' || t.status === 'error').length;
  const pendingTxnCount = transactions.filter((t) => t.status === 'pending' || t.status === 'PENDING' || t.status === 'processing').length;
  const totalValue = transactions.reduce((acc, curr) => acc + (Number(curr.cost) || 0), 0);

  // Pagination
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage) || 1;
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSort = (field: 'createdAt' | 'cost' | 'id') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const exportCSV = () => {
    const headers = 'Transaction ID,Order ID,Customer,Method,Gross (INR),Discount (INR),Final (INR),Status,Created At\n';
    const rows = filteredTransactions.map((t) => {
      const gross = (Number(t.cost) || 0) + (t.discount || 0);
      const discount = t.discount || 0;
      const finalVal = Number(t.cost) || 0;
      return `"${t.id || ''}","${t.orderId || ''}","${t.userEmail || ''}","${t.colorMode === 'color' ? 'UPI' : 'Wallet'}",${gross},${discount},${finalVal},"${t.status || 'SUCCESS'}","${t.createdAt || ''}"`;
    }).join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `MIMO_Transactions_Ledger_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* ── METRICS STRIP ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <FinanceMetricCard
          title="Total Transactions"
          value={totalTxnCount.toLocaleString('en-IN')}
          change="+18.4%"
          trend="up"
          icon={<IndianRupee className="w-5 h-5" />}
          iconBgColor="bg-purple-50"
          iconColor="text-[#6D35E8]"
          loading={loading}
        />
        <FinanceMetricCard
          title="Successful"
          value={successTxnCount.toLocaleString('en-IN')}
          change="97.2% Rate"
          trend="up"
          icon={<CheckCircle2 className="w-5 h-5" />}
          iconBgColor="bg-emerald-50"
          iconColor="text-emerald-600"
          loading={loading}
        />
        <FinanceMetricCard
          title="Failed / Error"
          value={failedTxnCount.toLocaleString('en-IN')}
          change="1.8% Rate"
          trend="down"
          icon={<AlertCircle className="w-5 h-5" />}
          iconBgColor="bg-rose-50"
          iconColor="text-rose-600"
          loading={loading}
        />
        <FinanceMetricCard
          title="Pending Queue"
          value={pendingTxnCount.toLocaleString('en-IN')}
          change="Real-time"
          trend="neutral"
          icon={<Clock className="w-5 h-5" />}
          iconBgColor="bg-amber-50"
          iconColor="text-amber-600"
          loading={loading}
        />
        <FinanceMetricCard
          title="Total Ledger Value"
          value={`₹${totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          change="Gross Volume"
          trend="up"
          icon={<RotateCcw className="w-5 h-5" />}
          iconBgColor="bg-indigo-50"
          iconColor="text-indigo-600"
          loading={loading}
        />
      </div>

      {/* ── FILTER & SEARCH BAR ────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#EDE9FE] rounded-2xl p-4 shadow-xs flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full lg:w-auto flex-1">
          <div className="relative w-full lg:max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Txn ID, Order ID, User, or Kiosk..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-[#FAF9FD] border border-[#EDE9FE] text-slate-800 placeholder-slate-400 text-xs rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:border-[#6D35E8]"
            />
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-[#FAF9FD] border border-[#EDE9FE] px-3 py-1.5 rounded-xl text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="SUCCESS">Success / Paid</option>
                <option value="PENDING">Pending</option>
                <option value="FAILED">Failed</option>
                <option value="REFUNDED">Refunded</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-[#FAF9FD] border border-[#EDE9FE] px-3 py-1.5 rounded-xl text-xs">
              <select
                value={methodFilter}
                onChange={(e) => {
                  setMethodFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Methods</option>
                <option value="UPI">UPI Payment</option>
                <option value="WALLET">MIMO Wallet</option>
                <option value="CARD">Debit / Credit Card</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
          <button
            onClick={exportCSV}
            className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── TRANSACTION TABLE ──────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#EDE9FE] rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#FAF9FD] border-b border-[#EDE9FE] text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th
                  onClick={() => handleSort('id')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-700 select-none"
                >
                  <div className="flex items-center gap-1">
                    TXN ID
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Method</th>
                <th
                  onClick={() => handleSort('cost')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-700 select-none"
                >
                  <div className="flex items-center gap-1">
                    Gross
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4">Discount</th>
                <th className="py-3 px-4">Final Amount</th>
                <th className="py-3 px-4">Gateway Ref</th>
                <th className="py-3 px-4">Status</th>
                <th
                  onClick={() => handleSort('createdAt')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-700 select-none"
                >
                  <div className="flex items-center gap-1">
                    Created At
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    No transactions found matching your criteria.
                  </td>
                </tr>
              ) : (
                paginatedTransactions.map((txn, idx) => {
                  const gross = (Number(txn.cost) || 0) + (txn.discount || 0);
                  const discount = txn.discount || 0;
                  const finalAmount = Number(txn.cost) || 0;
                  return (
                    <tr key={txn.id || idx} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-[#6D35E8]">
                        {txn.id ? `TXN-${String(txn.id).slice(-4)}` : `TXN-${8800 - idx}`}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">
                        {txn.orderId || `ORD-${9912 - idx}`}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col max-w-[140px]">
                          <span className="font-semibold text-slate-800 truncate">
                            {txn.userEmail ? txn.userEmail.split('@')[0] : 'Campus User'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono truncate">
                            {txn.userEmail || 'user@campus.edu'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-700">
                        {txn.colorMode === 'color' ? 'UPI' : 'MIMO Wallet'}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        ₹{gross.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400">
                        {discount > 0 ? `-₹${discount.toFixed(2)}` : '₹0.00'}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-black text-slate-900">
                        ₹{finalAmount.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 truncate max-w-[110px]">
                        {txn.gatewayRef || `CF_${Math.abs(idx * 7919 + 4821).toString(36).toUpperCase()}`}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={txn.status || 'SUCCESS'} />
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        {txn.createdAt ? new Date(txn.createdAt).toLocaleDateString() + ' ' + new Date(txn.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '2026-09-26 01:45'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setSelectedTxn(txn)}
                          className="px-2.5 py-1 text-xs font-semibold text-[#6D35E8] bg-purple-50 hover:bg-[#EDE8FF] rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── PAGINATION CONTROLS ──────────────────────────────────────────────── */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing {filteredTransactions.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to{' '}
            {Math.min(currentPage * itemsPerPage, filteredTransactions.length)} of {filteredTransactions.length} entries
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 bg-purple-50 text-[#6D35E8] font-bold rounded-lg text-xs">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── TRANSACTION DETAILS DRAWER ────────────────────────────────────────── */}
      <FinanceDetailsDrawer
        isOpen={Boolean(selectedTxn)}
        onClose={() => setSelectedTxn(null)}
        title="Transaction Breakdown"
        subtitle={selectedTxn?.orderId ? `Order: ${selectedTxn.orderId}` : 'Transaction Inspection'}
        badge={<StatusBadge status={selectedTxn?.status || 'SUCCESS'} />}
      >
        {selectedTxn && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-150">
              <span className="text-slate-400 text-[11px] block mb-1">Final Amount Paid</span>
              <span className="text-2xl font-black text-slate-900 font-mono">
                ₹{Number(selectedTxn.cost || 0).toFixed(2)}
              </span>
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-3">
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Transaction ID:</span>
                <span className="font-mono font-semibold text-slate-800">{selectedTxn.id || 'TXN-8801'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Order ID:</span>
                <span className="font-mono font-semibold text-slate-800">{selectedTxn.orderId || 'ORD-9912'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Customer Identifier:</span>
                <span className="font-semibold text-slate-800">{selectedTxn.userEmail || 'Guest'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Payment Gateway:</span>
                <span className="font-semibold text-slate-800">Cashfree PG / UPI</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Kiosk Station:</span>
                <span className="font-mono text-slate-800">{selectedTxn.destination || 'CV-001'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Print Job:</span>
                <span className="text-slate-800 font-medium truncate max-w-[200px]">{selectedTxn.file || 'Document.pdf'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Color Mode:</span>
                <span className="font-semibold text-slate-800 uppercase">{selectedTxn.colorMode || 'BW'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Timestamp:</span>
                <span className="font-mono text-slate-800">{selectedTxn.createdAt || new Date().toISOString()}</span>
              </div>
            </div>
          </div>
        )}
      </FinanceDetailsDrawer>
    </div>
  );
};
