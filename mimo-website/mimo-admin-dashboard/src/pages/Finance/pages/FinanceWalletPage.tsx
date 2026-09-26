import React, { useMemo, useState } from 'react';
import { Coins, Download, IndianRupee, Search, Users, Wallet } from 'lucide-react';
import { FinanceMetricCard } from '../components/FinanceMetricCard';
import { FinanceChartCard } from '../components/FinanceChartCard';
import { ErrorBanner } from '../../../components/insights/InsightBits';
import { dateTime, inr, int } from '../../../lib/format';
import type { AdminUserItem } from '../../../types/user.types';

/** 1 MIMO coin = ₹0.50 at checkout (see /create-order). */
const COIN_VALUE_INR = 0.5;

export interface FinanceWalletPageProps {
  users: AdminUserItem[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

/**
 * Customer MIMO-coin balances (read-only, straight from the users collection).
 * Coin grants/adjustments are intentionally not offered here: there is no audited backend endpoint for them yet.
 */
export const FinanceWalletPage: React.FC<FinanceWalletPageProps> = ({ users, loading, error, onRefresh }) => {
  const [search, setSearch] = useState('');
  const holders = useMemo(() => users.filter((u) => u.mimoCoins > 0).sort((a, b) => b.mimoCoins - a.mimoCoins), [users]);
  const totalCoins = users.reduce((a, u) => a + (u.mimoCoins || 0), 0);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return holders.filter((u) => !q || [u.email, u.username, u.id, u.mobileNumber].some((v) => v && String(v).toLowerCase().includes(q)));
  }, [holders, search]);

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = 'User ID,Name,Email,Coins,Value (INR),Total spend (INR),Orders\n' + shown.map((u) => [u.id, u.username, u.email, u.mimoCoins, u.mimoCoins * COIN_VALUE_INR, u.totalSpend, u.orderCount].map(esc).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `MIMO_Wallet_Balances_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-[#19162D] tracking-tight">Wallet &amp; Credits</h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">MIMO-coin balances across all customers (live snapshot, not date-filtered)</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading} className="px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-xl cursor-pointer disabled:opacity-50 self-start">{loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      {error && <ErrorBanner message={error} onRetry={onRefresh} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <FinanceMetricCard title="Coins in Circulation" value={int(totalCoins)} icon={<Coins className="w-5 h-5" />} loading={loading} change={`≈ ${inr(totalCoins * COIN_VALUE_INR)}`} comparisonText="redeemable value" />
        <FinanceMetricCard title="Wallets with Balance" value={int(holders.length)} icon={<Wallet className="w-5 h-5" />} iconBgColor="bg-emerald-50" iconColor="text-emerald-600" loading={loading} />
        <FinanceMetricCard title="Registered Customers" value={int(users.length)} icon={<Users className="w-5 h-5" />} iconBgColor="bg-cyan-50" iconColor="text-cyan-600" loading={loading} />
        <FinanceMetricCard title="Coin Value" value={`${inr(COIN_VALUE_INR)} / coin`} icon={<IndianRupee className="w-5 h-5" />} iconBgColor="bg-amber-50" iconColor="text-amber-600" loading={loading} />
      </div>

      <FinanceChartCard title="Customer balances" subtitle={`${shown.length} wallet${shown.length === 1 ? '' : 's'} with coins`}
        action={<div className="flex items-center gap-2">
          <div className="relative"><Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer…" className="bg-[#FAF9FD] border border-[#EDE9FE] rounded-xl pl-8 pr-3 py-2 text-xs w-52 focus:outline-none focus:border-[#6D35E8]" /></div>
          <button type="button" onClick={exportCsv} disabled={shown.length === 0} className="p-2 rounded-xl border border-[#EDE9FE] text-slate-600 hover:text-[#6D35E8] cursor-pointer disabled:opacity-40" title="Export CSV"><Download className="w-4 h-4" /></button>
        </div>}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                {['Customer', 'Coins', 'Value', 'Total spend', 'Orders', 'Joined'].map((h) => <th key={h} className="whitespace-nowrap py-2.5 px-3">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading && <tr><td colSpan={6} className="p-4"><div className="h-5 bg-slate-50 rounded animate-pulse" /></td></tr>}
              {!loading && shown.length === 0 && <tr><td colSpan={6} className="py-12 text-center text-xs font-semibold text-slate-400">{holders.length === 0 ? 'No customer holds MIMO coins yet.' : 'No customer matches your search.'}</td></tr>}
              {shown.slice(0, 200).map((u) => (
                <tr key={u.id} className="hover:bg-[#FAF9FD]">
                  <td className="py-3 px-3"><p className="font-bold text-slate-800">{u.username}</p><p className="text-[11px] text-slate-400">{u.email}</p></td>
                  <td className="whitespace-nowrap py-3 px-3 font-black font-mono text-slate-900">{int(u.mimoCoins)}</td>
                  <td className="whitespace-nowrap py-3 px-3 font-mono text-slate-600">{inr(u.mimoCoins * COIN_VALUE_INR)}</td>
                  <td className="whitespace-nowrap py-3 px-3 font-mono text-slate-600">{inr(u.totalSpend)}</td>
                  <td className="whitespace-nowrap py-3 px-3 text-slate-600">{u.orderCount}</td>
                  <td className="whitespace-nowrap py-3 px-3 text-slate-400 text-[11px]">{dateTime(u.joinedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shown.length > 200 && <p className="mt-3 text-[11px] text-slate-400">Showing the top 200 balances; export the CSV for the full list.</p>}
      </FinanceChartCard>
    </div>
  );
};
