import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, ChevronLeft, ChevronRight, CreditCard, Download, Eye, IndianRupee, Clock, XCircle, CheckCircle2, Search } from 'lucide-react';
import { FinanceMetricCard } from '../components/FinanceMetricCard';
import { StatusBadge } from '../components/StatusBadge';
import { FinanceDetailsDrawer } from '../components/FinanceDetailsDrawer';
import { ErrorBanner, TruncatedNote } from '../../../components/insights/InsightBits';
import { useRange } from '../../../context/RangeContext';
import { describeRange } from '../../../lib/dateRange';
import { dateTime, inr, int } from '../../../lib/format';
import type { TransactionRow } from '../../../types/insights.types';
import { TxnDetails } from './FinanceOverviewPage';

export interface FinanceTransactionsPageProps {
  transactions: TransactionRow[];
  total: number;
  truncated: boolean;
  /** Text typed in the top bar search box */
  globalSearch?: string;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

const PAGE_SIZE = 10;
type SortField = 'createdAt' | 'amount';
const STATUS_FILTERS = ['ALL', 'PAID', 'PENDING', 'FAILED', 'REFUNDED'] as const;
const groupOf = (s: string) => (s === 'INITIATED' ? 'PENDING' : s);

export const FinanceTransactionsPage: React.FC<FinanceTransactionsPageProps> = ({ transactions, total, truncated, globalSearch = '', loading, error, onRefresh }) => {
  const { range } = useRange();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>('ALL');
  const [method, setMethod] = useState('ALL');
  const [sort, setSort] = useState<{ field: SortField; dir: 'asc' | 'desc' }>({ field: 'createdAt', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<TransactionRow | null>(null);

  useEffect(() => { setPage(1); }, [range, status, method, search, globalSearch]);

  const methods = useMemo(() => ['ALL', ...Array.from(new Set(transactions.map((t) => t.method))).sort()], [transactions]);

  const rows = useMemo(() => {
    const q = `${search} ${globalSearch}`.trim().toLowerCase();
    return transactions
      .filter((t) => (status === 'ALL' || groupOf(t.status) === status) && (method === 'ALL' || t.method === method))
      .filter((t) => !q || [t.orderId, t.userEmail, t.userName, t.kioskId, t.gatewayRef, t.couponCode].some((v) => v && String(v).toLowerCase().includes(q)))
      .sort((a, b) => {
        const av = sort.field === 'amount' ? a.amount : new Date(a.createdAt || 0).getTime();
        const bv = sort.field === 'amount' ? b.amount : new Date(b.createdAt || 0).getTime();
        return sort.dir === 'asc' ? av - bv : bv - av;
      });
  }, [transactions, status, method, search, globalSearch, sort]);

  const count = (s: string) => transactions.filter((t) => groupOf(t.status) === s).length;
  const ledger = transactions.filter((t) => t.status === 'PAID' || t.status === 'REFUNDED').reduce((x, t) => x + t.amount, 0);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const toggleSort = (field: SortField) => setSort((s) => (s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'desc' }));

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = 'Order ID,Customer,Machine,Method,Gross (INR),Discount (INR),Paid (INR),Status,Gateway ref,Created at\n';
    const body = rows.map((t) => [t.orderId, t.userEmail, t.kioskId, t.method, t.gross, t.discount, t.amount, t.status, t.gatewayRef, t.createdAt].map(esc).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([head + body], { type: 'text/csv;charset=utf-8;' }));
    link.download = `MIMO_Transactions_${describeRange(range).replace(/[^\w]+/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-6">
      {error && <ErrorBanner message={error} onRetry={onRefresh} />}
      <TruncatedNote show={truncated} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <FinanceMetricCard title="Transactions" value={int(total)} icon={<CreditCard className="w-5 h-5" />} change={describeRange(range)} comparisonText="" loading={loading} />
        <FinanceMetricCard title="Paid" value={int(count('PAID'))} icon={<CheckCircle2 className="w-5 h-5" />} iconBgColor="bg-emerald-50" iconColor="text-emerald-600" loading={loading} />
        <FinanceMetricCard title="Failed" value={int(count('FAILED'))} icon={<XCircle className="w-5 h-5" />} iconBgColor="bg-rose-50" iconColor="text-rose-600" loading={loading} />
        <FinanceMetricCard title="Pending" value={int(count('PENDING'))} icon={<Clock className="w-5 h-5" />} iconBgColor="bg-amber-50" iconColor="text-amber-600" loading={loading} />
        <FinanceMetricCard title="Collected" value={inr(ledger)} icon={<IndianRupee className="w-5 h-5" />} iconBgColor="bg-indigo-50" iconColor="text-indigo-600" loading={loading} />
      </div>

      <div className="bg-white border border-[#EDE9FE] rounded-2xl p-4 shadow-xs flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order ID, customer, machine, gateway reference…"
            className="w-full bg-[#FAF9FD] border border-[#EDE9FE] rounded-xl pl-10 pr-3 py-2.5 text-xs font-medium focus:outline-none focus:border-[#6D35E8]" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="bg-[#FAF9FD] border border-[#EDE9FE] rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700">
          {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
        </select>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="bg-[#FAF9FD] border border-[#EDE9FE] rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700">
          {methods.map((m) => <option key={m} value={m}>{m === 'ALL' ? 'All methods' : m}</option>)}
        </select>
        <button type="button" onClick={exportCsv} disabled={rows.length === 0} className="px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-xl flex items-center gap-2 cursor-pointer disabled:opacity-50"><Download className="w-3.5 h-3.5" /> Export CSV</button>
      </div>

      <div className="bg-white border border-[#EDE9FE] rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF9FD]">
              <tr className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="whitespace-nowrap py-3 px-4">Order</th>
                <th className="whitespace-nowrap py-3 px-4">Customer</th>
                <th className="whitespace-nowrap py-3 px-4">Machine</th>
                <th className="whitespace-nowrap py-3 px-4">Method</th>
                <th className="whitespace-nowrap py-3 px-4">Gross</th>
                <th className="whitespace-nowrap py-3 px-4">Discount</th>
                <th className="whitespace-nowrap py-3 px-4"><button type="button" onClick={() => toggleSort('amount')} className="inline-flex items-center gap-1 cursor-pointer">Paid <ArrowUpDown className="w-3 h-3" /></button></th>
                <th className="whitespace-nowrap py-3 px-4">Status</th>
                <th className="whitespace-nowrap py-3 px-4"><button type="button" onClick={() => toggleSort('createdAt')} className="inline-flex items-center gap-1 cursor-pointer">Created <ArrowUpDown className="w-3 h-3" /></button></th>
                <th className="py-3 px-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading && Array.from({ length: 5 }).map((_, i) => <tr key={i}><td colSpan={10} className="p-4"><div className="h-5 bg-slate-50 rounded animate-pulse" /></td></tr>)}
              {!loading && visible.length === 0 && <tr><td colSpan={10} className="py-14 text-center text-xs font-semibold text-slate-400">No transactions match in {describeRange(range).toLowerCase()}.</td></tr>}
              {visible.map((t) => (
                <tr key={t.id} className="hover:bg-[#FAF9FD]">
                  <td className="whitespace-nowrap py-3 px-4 font-mono font-bold text-[#6D35E8]">{t.orderId}</td>
                  <td className="py-3 px-4 text-slate-700 font-semibold truncate max-w-[200px]" title={t.userEmail || ''}>{t.userEmail || t.userName || '—'}</td>
                  <td className="whitespace-nowrap py-3 px-4 font-mono text-slate-600">{t.kioskId || '—'}</td>
                  <td className="whitespace-nowrap py-3 px-4 text-slate-600 font-semibold">{t.method}</td>
                  <td className="whitespace-nowrap py-3 px-4 font-mono text-slate-600">{inr(t.gross)}</td>
                  <td className="whitespace-nowrap py-3 px-4 font-mono text-slate-500">{t.discount > 0 ? `-${inr(t.discount)}` : '—'}</td>
                  <td className="whitespace-nowrap py-3 px-4 font-mono font-black text-slate-900">{inr(t.amount)}</td>
                  <td className="py-3 px-4"><StatusBadge status={t.status} /></td>
                  <td className="whitespace-nowrap py-3 px-4 text-slate-400 text-[11px] font-medium">{dateTime(t.createdAt)}</td>
                  <td className="py-3 px-4 text-right"><button type="button" onClick={() => setSelected(t)} className="text-slate-400 hover:text-[#6D35E8] cursor-pointer" title="Details"><Eye className="w-4 h-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
          <span>Showing {rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} of {rows.length}</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="p-1.5 rounded-lg border border-[#EDE9FE] disabled:opacity-40 cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
            <span className="font-bold text-[#6D35E8]">{page} / {pages}</span>
            <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="p-1.5 rounded-lg border border-[#EDE9FE] disabled:opacity-40 cursor-pointer"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      <FinanceDetailsDrawer isOpen={!!selected} onClose={() => setSelected(null)} title={selected ? `Order ${selected.orderId}` : ''} subtitle={selected ? dateTime(selected.createdAt) : ''} badge={selected ? <StatusBadge status={selected.status} /> : undefined}>
        {selected && <TxnDetails t={selected} />}
      </FinanceDetailsDrawer>
    </div>
  );
};
