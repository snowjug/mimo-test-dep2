import React, { useMemo, useState } from 'react';
import { Download, Search, Users, Wallet, CreditCard } from 'lucide-react';
import { FinanceMetricCard } from '../components/FinanceMetricCard';
import { FinanceChartCard } from '../components/FinanceChartCard';
import { ErrorBanner } from '../../../components/insights/InsightBits';
import { dateTime, inr, int } from '../../../lib/format';
import type { AdminUserItem } from '../../../types/user.types';

export interface FinanceWalletPageProps {
  users: AdminUserItem[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

/**
 * Customer Account & Credit Intelligence (read-only, straight from the users collection).
 */
export const FinanceWalletPage: React.FC<FinanceWalletPageProps> = ({ users = [], loading, error, onRefresh }) => {
  const [search, setSearch] = useState('');
  const activeUsers = useMemo(() => (users || []).filter((u) => (u.totalSpend || 0) > 0 || (u.orderCount || 0) > 0), [users]);
  const totalLifetimeSpend = useMemo(() => (users || []).reduce((a, u) => a + (u.totalSpend || 0), 0), [users]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (users || []).filter((u) => !q || [u.email, u.username, u.id, u.mobileNumber].some((v) => v && String(v).toLowerCase().includes(q)));
  }, [users, search]);

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = 'User ID,Name,Email,Total spend (INR),Orders,Joined\n' + shown.map((u) => [u.id, u.username, u.email, u.totalSpend, u.orderCount, u.joinedAt].map(esc).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `MIMO_Customer_Accounts_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-[#111318] dark:text-white tracking-tight">Customer Accounts &amp; Credits</h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">Live customer account directory and lifetime billing status</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading} className="px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 rounded-xl cursor-pointer disabled:opacity-50 self-start">{loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      {error && <ErrorBanner message={error} onRetry={onRefresh} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FinanceMetricCard title="Registered Customers" value={users?.length ? int(users.length) : '0'} icon={<Users className="w-5 h-5" />} loading={loading} change={`${activeUsers.length} transacting users`} comparisonText="" />
        <FinanceMetricCard title="Active Transacting Users" value={activeUsers.length ? int(activeUsers.length) : '0'} icon={<Wallet className="w-5 h-5" />} iconBgColor="bg-emerald-50" iconColor="text-emerald-600" loading={loading} />
        <FinanceMetricCard title="Customer Lifetime Spend" value={totalLifetimeSpend > 0 ? inr(totalLifetimeSpend) : '₹0'} icon={<CreditCard className="w-5 h-5" />} iconBgColor="bg-indigo-50" iconColor="text-indigo-600" loading={loading} />
      </div>

      <FinanceChartCard title="Customer Directory" subtitle={`${shown.length} customer account${shown.length === 1 ? '' : 's'}`}
        action={<div className="flex items-center gap-2">
          <div className="relative"><Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer…" className="bg-[#F3F4F6] dark:bg-slate-800 border border-[#E4E7EB] dark:border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs w-52 focus:outline-none focus:border-[#093765]" /></div>
          <button type="button" onClick={exportCsv} disabled={shown.length === 0} className="p-2 rounded-xl border border-[#E4E7EB] dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-[#093765] cursor-pointer disabled:opacity-40" title="Export CSV"><Download className="w-4 h-4" /></button>
        </div>}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold text-[10px]">
                {['Customer Name', 'Email Address', 'Total Spend', 'Print Orders', 'Account Created'].map((h) => <th key={h} className="whitespace-nowrap py-2.5 px-3">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {loading && <tr><td colSpan={5} className="p-4"><div className="h-5 bg-slate-50 dark:bg-slate-800 rounded animate-pulse" /></td></tr>}
              {!loading && shown.length === 0 && <tr><td colSpan={5} className="py-12 text-center text-xs font-semibold text-slate-400">{users.length === 0 ? 'No customer accounts recorded yet.' : 'No customer matches your search query.'}</td></tr>}
              {shown.slice(0, 200).map((u) => (
                <tr key={u.id} className="hover:bg-[#F3F4F6] dark:hover:bg-slate-800/50">
                  <td className="py-3 px-3"><p className="font-bold text-slate-800 dark:text-slate-200">{u.username || '—'}</p><p className="text-[10px] font-mono text-slate-400">{u.id || '—'}</p></td>
                  <td className="whitespace-nowrap py-3 px-3 text-slate-600 dark:text-slate-300">{u.email || '—'}</td>
                  <td className="whitespace-nowrap py-3 px-3 font-mono font-bold text-slate-900 dark:text-white">{u.totalSpend != null ? inr(u.totalSpend) : '—'}</td>
                  <td className="whitespace-nowrap py-3 px-3 text-slate-600 dark:text-slate-300">{u.orderCount ?? 0}</td>
                  <td className="whitespace-nowrap py-3 px-3 text-slate-400 text-[11px]">{dateTime(u.joinedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shown.length > 200 && <p className="mt-3 text-[11px] text-slate-400">Showing the top 200 accounts; export the CSV for the full list.</p>}
      </FinanceChartCard>
    </div>
  );
};


