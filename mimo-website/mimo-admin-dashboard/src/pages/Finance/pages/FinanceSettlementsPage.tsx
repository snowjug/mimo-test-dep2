import React from 'react';
import { CheckCircle2, Download, IndianRupee, Landmark, Receipt, RotateCcw } from 'lucide-react';
import { FinanceMetricCard } from '../components/FinanceMetricCard';
import { FinanceChartCard } from '../components/FinanceChartCard';
import { ErrorBanner } from '../../../components/insights/InsightBits';
import { useRange } from '../../../context/RangeContext';
import { bucketLabel, describeRange } from '../../../lib/dateRange';
import { inr, int } from '../../../lib/format';
import type { Analytics, TransactionRow } from '../../../types/insights.types';

export interface FinanceSettlementsPageProps {
  analytics: Analytics | null;
  transactions: TransactionRow[];
  loading: boolean;
  error: string | null;
}

/**
 * Collections ledger: what customers paid and what was refunded, per day/hour, taken from MIMO's own records.
 * Bank payouts are made by Cashfree and are not exposed to this API, so payout (UTR) data is not shown here.
 */
export const FinanceSettlementsPage: React.FC<FinanceSettlementsPageProps> = ({ analytics: a, transactions, loading, error }) => {
  const { range } = useRange();
  const cur = a?.current;
  const rows = (a?.series ?? []).filter((p) => p.orders > 0 || p.refunds > 0);
  // Money that actually went through the gateway = paid orders (including ones refunded later) with an amount.
  const gateway = transactions.filter((t) => (t.status === 'PAID' || t.status === 'REFUNDED') && t.amount > 0).reduce((x, t) => x + t.amount, 0);

  const exportCsv = (kind: 'ledger' | 'transactions') => {
    if (!a) return;
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = kind === 'ledger'
      ? 'Period,Orders,Gross (INR),Refunds (INR),Net (INR)\n' + a.series.map((p) => [p.key, p.orders, p.revenue, p.refunds, Math.round((p.revenue - p.refunds) * 100) / 100].join(',')).join('\n')
      : 'Order,Customer,Method,Paid (INR),Status,Gateway ref,Created\n' + transactions.map((t) => [t.orderId, t.userEmail, t.method, t.amount, t.status, t.gatewayRef, t.createdAt].map(esc).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `MIMO_${kind === 'ledger' ? 'Collections_Ledger' : 'Transactions'}_${a.range.from.slice(0, 10)}_${a.range.to.slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-[#19162D] tracking-tight">Settlements &amp; Reports</h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">Collections and refunds ledger · {describeRange(range)}</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button type="button" onClick={() => exportCsv('ledger')} disabled={!a} className="px-4 py-2.5 text-xs font-bold text-white bg-[#6D35E8] hover:bg-[#5b29c9] rounded-xl flex items-center gap-2 cursor-pointer disabled:opacity-50"><Download className="w-3.5 h-3.5" /> Ledger CSV</button>
          <button type="button" onClick={() => exportCsv('transactions')} disabled={!a} className="px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-xl flex items-center gap-2 cursor-pointer disabled:opacity-50"><Receipt className="w-3.5 h-3.5" /> Transactions CSV</button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <FinanceMetricCard title="Collected" value={cur ? inr(cur.revenue) : '—'} icon={<IndianRupee className="w-5 h-5" />} loading={loading} change={cur ? `${cur.orders} order${cur.orders === 1 ? '' : 's'}` : undefined} comparisonText="" />
        <FinanceMetricCard title="Via Payment Gateway" value={inr(gateway)} icon={<Landmark className="w-5 h-5" />} iconBgColor="bg-blue-50" iconColor="text-blue-600" loading={loading} change={cur ? `${cur.paidOrders} paid order${cur.paidOrders === 1 ? '' : 's'}` : undefined} comparisonText="" />
        <FinanceMetricCard title="Refunded" value={cur ? inr(cur.refundedAmount) : '—'} icon={<RotateCcw className="w-5 h-5" />} iconBgColor="bg-rose-50" iconColor="text-rose-600" loading={loading} change={cur ? `${cur.refundCount} refund${cur.refundCount === 1 ? '' : 's'}` : undefined} comparisonText="" />
        <FinanceMetricCard title="Net Collected" value={cur ? inr(cur.netRevenue) : '—'} icon={<CheckCircle2 className="w-5 h-5" />} iconBgColor="bg-emerald-50" iconColor="text-emerald-600" loading={loading} />
      </div>

      <FinanceChartCard title="Collections ledger" subtitle={a ? `${a.range.granularity === 'hour' ? 'Hourly' : 'Daily'} · only periods with activity` : undefined}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                {['Period', 'Orders', 'Gross', 'Refunds', 'Net'].map((h) => <th key={h} className="whitespace-nowrap py-2.5 px-3">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading && <tr><td colSpan={5} className="p-4"><div className="h-5 bg-slate-50 rounded animate-pulse" /></td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={5} className="py-12 text-center text-xs font-semibold text-slate-400">No collections or refunds in this period.</td></tr>}
              {rows.map((p) => (
                <tr key={p.key} className="hover:bg-[#FAF9FD]">
                  <td className="whitespace-nowrap py-3 px-3 font-bold text-slate-800">{bucketLabel(p.key)}{p.key.includes('T') ? '' : ` · ${p.key}`}</td>
                  <td className="py-3 px-3 text-slate-600">{int(p.orders)}</td>
                  <td className="whitespace-nowrap py-3 px-3 font-mono text-slate-800">{inr(p.revenue)}</td>
                  <td className="whitespace-nowrap py-3 px-3 font-mono text-rose-600">{p.refunds > 0 ? `-${inr(p.refunds)}` : '—'}</td>
                  <td className="whitespace-nowrap py-3 px-3 font-mono font-black text-slate-900">{inr(p.revenue - p.refunds)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && cur && (
              <tfoot>
                <tr className="border-t-2 border-[#EDE9FE] font-black text-slate-900">
                  <td className="py-3 px-3">Total</td><td className="py-3 px-3">{int(cur.orders)}</td><td className="py-3 px-3 font-mono">{inr(cur.revenue)}</td><td className="py-3 px-3 font-mono text-rose-600">{cur.refundedAmount > 0 ? `-${inr(cur.refundedAmount)}` : '—'}</td><td className="py-3 px-3 font-mono">{inr(cur.netRevenue)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="mt-4 text-[11px] text-slate-400">Bank settlements/payouts are handled by Cashfree; use the Cashfree dashboard for UTR and payout reports. This ledger reflects MIMO's own order records.</p>
      </FinanceChartCard>
    </div>
  );
};
