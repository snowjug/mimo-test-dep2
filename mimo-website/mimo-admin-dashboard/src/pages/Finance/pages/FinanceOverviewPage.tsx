import React, { useState } from 'react';
import { IndianRupee, CreditCard, Clock, RotateCcw, TrendingUp, ShoppingBag, Download, RotateCw, AlertTriangle, ArrowRight, CheckCircle2, BarChart3, Eye } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { FinanceMetricCard } from '../components/FinanceMetricCard';
import { FinanceChartCard } from '../components/FinanceChartCard';
import { StatusBadge } from '../components/StatusBadge';
import { FinanceDetailsDrawer } from '../components/FinanceDetailsDrawer';
import { ErrorBanner, PeriodComparison, TrendChart, TruncatedNote } from '../../../components/insights/InsightBits';
import { LiveIndicator } from '../../../components/ui/LiveIndicator';
import { useRange } from '../../../context/RangeContext';
import { describeRange, pctChange } from '../../../lib/dateRange';
import { dateTime, inr, int } from '../../../lib/format';
import type { Analytics, TransactionRow } from '../../../types/insights.types';

export interface FinanceOverviewProps {
  analytics: Analytics | null;
  transactions: TransactionRow[];
  refundRequests: any[];
  loading: boolean;
  error: string | null;
  updatedAt: Date | null;
  onRefresh: () => void;
  onNavigateToTab?: (tab: string) => void;
}

const PIE = ['#6D35E8', '#00C7F2', '#10B981', '#F59E0B', '#8B5CF6', '#F43F5E'];

const change = (cur: number, prev?: number | null) => {
  const c = pctChange(cur, prev);
  if (c === null) return prev === 0 && cur > 0 ? { change: 'New', trend: 'up' as const } : { change: undefined, trend: 'neutral' as const };
  return { change: `${Math.abs(c)}%`, trend: (c > 0 ? 'up' : c < 0 ? 'down' : 'neutral') as 'up' | 'down' | 'neutral' };
};

export const FinanceOverviewPage: React.FC<FinanceOverviewProps> = ({ analytics: a, transactions, refundRequests, loading, error, updatedAt, onRefresh, onNavigateToTab }) => {
  const { range, live } = useRange();
  const [selected, setSelected] = useState<TransactionRow | null>(null);
  const cur = a?.current;
  const prev = a?.previous?.summary;
  const spark = (key: 'revenue' | 'orders' | 'refunds') => a?.series.map((p) => p[key]);
  const pendingRefunds = refundRequests.filter((r) => r.status === 'pending');
  const pendingRefundAmount = pendingRefunds.reduce((x, r) => x + (Number(r.amount) || 0), 0);
  const maxKiosk = Math.max(1, ...(a?.byKiosk.map((k) => k.revenue) ?? [1]));

  const exportSummary = () => {
    if (!a) return;
    const c = a.current;
    const csv = `Metric,Value\nPeriod,${a.range.from} to ${a.range.to}\nGross revenue (INR),${c.revenue}\nRefunds (INR),${c.refundedAmount}\nNet revenue (INR),${c.netRevenue}\nPaid orders,${c.orders}\nPending payments,${c.pendingPayments}\nFailed payments,${c.failedPayments}\nAverage order value (INR),${c.avgOrderValue}\n`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `MIMO_Finance_Overview_${a.range.from.slice(0, 10)}_${a.range.to.slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const alerts = a ? [
    pendingRefunds.length > 0 && { tone: 'rose', title: `${pendingRefunds.length} refund request${pendingRefunds.length > 1 ? 's' : ''} awaiting review`, detail: `Total ${inr(pendingRefundAmount)}`, tab: 'refunds' },
    a.current.failedPayments > 0 && { tone: 'amber', title: `${a.current.failedPayments} failed payment${a.current.failedPayments > 1 ? 's' : ''}`, detail: 'Customers whose payment did not go through in this period', tab: 'transactions' },
    a.current.pendingPayments > 0 && { tone: 'amber', title: `${a.current.pendingPayments} payment${a.current.pendingPayments > 1 ? 's' : ''} not completed`, detail: `${inr(a.current.pendingAmount)} started but not paid`, tab: 'transactions' },
    a.current.failedJobs > 0 && { tone: 'rose', title: `${a.current.failedJobs} print${a.current.failedJobs > 1 ? 's' : ''} failed`, detail: 'Paid jobs that did not print (auto-refund applies)', tab: 'refunds' },
  ].filter(Boolean) as { tone: string; title: string; detail: string; tab: string }[] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-[#EDE9FE] rounded-2xl p-5 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#EDE8FF] text-[#6D35E8] flex items-center justify-center shrink-0 shadow-xs"><BarChart3 className="w-6 h-6" /></div>
          <div>
            <h1 className="text-xl font-black text-[#19162D] tracking-tight leading-tight">Finance Overview</h1>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Payments, refunds and revenue · {describeRange(range)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <LiveIndicator updatedAt={updatedAt} live={live} tone="finance" />
          <button type="button" onClick={onRefresh} disabled={loading} className="px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-xl flex items-center gap-2 cursor-pointer">
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#6D35E8]' : ''}`} /> Refresh
          </button>
          <button type="button" onClick={exportSummary} disabled={!a} className="px-5 py-2.5 text-xs font-bold text-white bg-[#6D35E8] hover:bg-[#5b29c9] shadow-md shadow-purple-500/20 rounded-xl flex items-center gap-2 cursor-pointer disabled:opacity-50">
            <Download className="w-3.5 h-3.5" /> Export Report
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={onRefresh} />}
      <TruncatedNote show={a?.truncated} />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <FinanceMetricCard title="Total Revenue" value={cur ? inr(cur.revenue) : '—'} {...change(cur?.revenue ?? 0, prev?.revenue)} icon={<IndianRupee className="w-5 h-5" />} sparklineData={spark('revenue')} loading={loading} />
        <FinanceMetricCard title="Paid Orders" value={cur ? int(cur.orders) : '—'} {...change(cur?.orders ?? 0, prev?.orders)} icon={<CreditCard className="w-5 h-5" />} iconBgColor="bg-blue-50" iconColor="text-blue-600" sparklineColor="#3B82F6" sparklineData={spark('orders')} loading={loading} />
        <FinanceMetricCard title="Pending Payments" value={cur ? inr(cur.pendingAmount) : '—'} change={cur ? `${cur.pendingPayments} order${cur.pendingPayments === 1 ? '' : 's'}` : undefined} icon={<Clock className="w-5 h-5" />} iconBgColor="bg-amber-50" iconColor="text-amber-600" loading={loading} comparisonText="not completed" />
        <FinanceMetricCard title="Refunds Issued" value={cur ? inr(cur.refundedAmount) : '—'} {...change(cur?.refundedAmount ?? 0, prev?.refundedAmount)} icon={<RotateCcw className="w-5 h-5" />} iconBgColor="bg-rose-50" iconColor="text-rose-600" sparklineColor="#F43F5E" sparklineData={spark('refunds')} loading={loading} />
        <FinanceMetricCard title="Net Revenue" value={cur ? inr(cur.netRevenue) : '—'} {...change(cur?.netRevenue ?? 0, prev?.netRevenue)} icon={<TrendingUp className="w-5 h-5" />} iconBgColor="bg-indigo-50" iconColor="text-indigo-600" loading={loading} />
        <FinanceMetricCard title="Avg Order Value" value={cur ? inr(cur.avgOrderValue) : '—'} {...change(cur?.avgOrderValue ?? 0, prev?.avgOrderValue)} icon={<ShoppingBag className="w-5 h-5" />} iconBgColor="bg-cyan-50" iconColor="text-cyan-600" loading={loading} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <FinanceChartCard title="Revenue Trend" subtitle={a ? `${a.range.granularity === 'hour' ? 'Hourly' : 'Daily'} · ${describeRange(range)}` : undefined} className="xl:col-span-2">
          {a ? <TrendChart series={a.series} tone="finance" metrics={['revenue', 'orders']} /> : <div className="h-[300px] bg-slate-50 rounded-xl animate-pulse" />}
        </FinanceChartCard>

        <FinanceChartCard title="Payment Methods" subtitle="How paid orders were settled">
          {!a ? <div className="h-56 bg-slate-50 rounded-xl animate-pulse" /> : a.byPaymentMethod.length === 0 ? <p className="py-12 text-center text-xs font-semibold text-slate-400">No paid orders in this period</p> : (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={a.byPaymentMethod} dataKey="amount" nameKey="method" innerRadius={48} outerRadius={72} paddingAngle={2} isAnimationActive={false}>
                      {a.byPaymentMethod.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => inr(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-1.5">
                {a.byPaymentMethod.map((m, i) => (
                  <li key={m.method} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 font-semibold text-slate-700"><span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE[i % PIE.length] }} />{m.method}</span>
                    <span className="font-mono text-slate-500">{m.count} · {inr(m.amount)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </FinanceChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <FinanceChartCard title="Revenue by Machine" subtitle="Both MIMO kiosks" >
          {!a ? <div className="h-40 bg-slate-50 rounded-xl animate-pulse" /> : (
            <ul className="space-y-4">
              {a.byKiosk.map((k, i) => (
                <li key={k.kioskId}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-bold text-slate-800">{k.name} <span className="font-mono font-medium text-slate-400">{k.kioskId}</span></span>
                    <span className="font-black font-mono text-slate-900">{inr(k.revenue)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#F3EFFF] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(k.revenue / maxKiosk) * 100}%`, background: PIE[i % PIE.length] }} /></div>
                  <p className="text-[11px] text-slate-400 mt-1">{k.completed} printed · {int(k.pages)} pages{k.failed > 0 ? ` · ${k.failed} failed` : ''}</p>
                </li>
              ))}
              {a.unassignedRevenue > 0 && <li className="text-[11px] text-slate-400">{inr(a.unassignedRevenue)} could not be tied to a machine.</li>}
            </ul>
          )}
        </FinanceChartCard>

        <FinanceChartCard title="Compared with previous period" subtitle="Same number of days right before the selected range">
          {a ? <PeriodComparison current={a.current} previous={a.previous?.summary ?? null} tone="finance" /> : <div className="h-64 bg-slate-50 rounded-xl animate-pulse" />}
        </FinanceChartCard>

        <FinanceChartCard title="Financial Alerts" subtitle="Things that need attention">
          {!a ? <div className="h-40 bg-slate-50 rounded-xl animate-pulse" /> : alerts.length === 0 ? (
            <div className="py-10 text-center"><CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" /><p className="text-xs font-semibold text-slate-500">Nothing needs attention right now.</p></div>
          ) : (
            <ul className="space-y-2.5">
              {alerts.map((al) => (
                <li key={al.title}>
                  <button type="button" onClick={() => onNavigateToTab?.(al.tab)} className={`w-full text-left p-3 rounded-xl border cursor-pointer ${al.tone === 'rose' ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100'}`}>
                    <div className="flex items-start gap-2.5"><AlertTriangle className={`w-4 h-4 mt-0.5 ${al.tone === 'rose' ? 'text-rose-500' : 'text-amber-500'}`} />
                      <div><p className="text-xs font-bold text-slate-800">{al.title}</p><p className="text-[11px] text-slate-500">{al.detail}</p></div></div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </FinanceChartCard>
      </div>

      <FinanceChartCard title="Recent Transactions" subtitle={transactions.length ? `Latest ${Math.min(8, transactions.length)} in this period` : 'Payments appear here as they happen'}
        action={<button type="button" onClick={() => onNavigateToTab?.('transactions')} className="text-xs font-bold text-[#6D35E8] hover:underline flex items-center gap-1 cursor-pointer">View all <ArrowRight className="w-3.5 h-3.5" /></button>}>
        {transactions.length === 0 ? <p className="py-10 text-center text-xs font-semibold text-slate-400">No transactions in this period.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  {['Order', 'Customer', 'Machine', 'Amount', 'Method', 'Status', 'Time', ''].map((h) => <th key={h} className="whitespace-nowrap py-2.5 px-3">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {transactions.slice(0, 8).map((t) => (
                  <tr key={t.id} className="hover:bg-[#FAF9FD]">
                    <td className="whitespace-nowrap py-3 px-3 font-mono font-bold text-[#6D35E8]">{t.orderId}</td>
                    <td className="py-3 px-3 text-slate-700 font-semibold truncate max-w-[180px]" title={t.userEmail || ''}>{t.userEmail || t.userName || '—'}</td>
                    <td className="whitespace-nowrap py-3 px-3 font-mono text-slate-600">{t.kioskId || '—'}</td>
                    <td className="whitespace-nowrap py-3 px-3 font-black font-mono text-slate-900">{inr(t.amount)}</td>
                    <td className="whitespace-nowrap py-3 px-3 text-slate-600 font-semibold">{t.method}</td>
                    <td className="py-3 px-3"><StatusBadge status={t.status} /></td>
                    <td className="whitespace-nowrap py-3 px-3 text-slate-400 text-[11px] font-medium">{dateTime(t.createdAt)}</td>
                    <td className="py-3 px-3 text-right"><button type="button" onClick={() => setSelected(t)} className="text-slate-400 hover:text-[#6D35E8] cursor-pointer" title="Details"><Eye className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FinanceChartCard>

      <FinanceDetailsDrawer isOpen={!!selected} onClose={() => setSelected(null)} title={selected ? `Order ${selected.orderId}` : ''} subtitle={selected ? dateTime(selected.createdAt) : ''} badge={selected ? <StatusBadge status={selected.status} /> : undefined}>
        {selected && <TxnDetails t={selected} />}
      </FinanceDetailsDrawer>
    </div>
  );
};

/** Field list used by the details drawer (shared with the Transactions page). */
export const TxnDetails: React.FC<{ t: TransactionRow }> = ({ t }) => (
  <dl className="space-y-3 text-sm">
    {[
      ['Customer', t.userEmail || t.userName || t.userId || '—'],
      ['Machine', t.kioskId || '—'],
      ['Payment method', t.method],
      ['Gross', inr(t.gross)],
      ['Discount', t.discount > 0 ? `-${inr(t.discount)}${t.couponCode ? ` (${t.couponCode})` : ''}` : '—'],
      ['Coins used', t.coinsUsed ? String(t.coinsUsed) : '—'],
      ['Amount paid', inr(t.amount)],
      ['Pages', t.pages ? String(t.pages) : '—'],
      ['Gateway reference', t.gatewayRef ? String(t.gatewayRef) : '—'],
      ['Created', dateTime(t.createdAt)],
      ['Paid', dateTime(t.paidAt)],
      ['Refunded', t.refundedAt ? dateTime(t.refundedAt) : '—'],
    ].map(([k, v]) => (
      <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-400 font-semibold">{k}</dt><dd className="text-slate-800 font-bold text-right break-all">{v}</dd></div>
    ))}
  </dl>
);
