import React, { useState, useEffect } from 'react';
import { CheckCircle2, Download, IndianRupee, Landmark, Receipt, RotateCcw, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';
import { FinanceMetricCard } from '../components/FinanceMetricCard';
import { FinanceChartCard } from '../components/FinanceChartCard';
import { ErrorBanner } from '../../../components/insights/InsightBits';
import { useRange } from '../../../context/RangeContext';
import { bucketLabel, describeRange } from '../../../lib/dateRange';
import { inr, int } from '../../../lib/format';
import type { Analytics, TransactionRow } from '../../../types/insights.types';
import api from '../../../api';

export interface FinanceSettlementsPageProps {
  analytics: Analytics | null;
  transactions: TransactionRow[];
  loading: boolean;
  error: string | null;
}

interface SettlementRecord {
  settlementId: string;
  utr: string;
  amount: number;
  fee: number;
  tax: number;
  adjustment: number;
  time: string;
  status: string;
  health: string;
}

interface ReconciliationData {
  status: 'RECONCILED' | 'UNRECONCILED' | 'DISCREPANCY_DETECTED';
  collections: {
    count: number;
    totalRupees: number;
  };
  settlements: {
    count: number;
    totalSettledRupees: number;
    totalFeesRupees: number;
    totalAdjustmentsRupees: number;
    records: SettlementRecord[];
  };
  varianceRupees: number;
  settlementRecordsAvailable: boolean;
  note: string;
  updatedAt: string;
}

/**
 * Collections and Bank Settlements ledger:
 * Reconciles customer collections with Cashfree bank transfers, UTR batch numbers,
 * MDR platform processing charges, and GST taxes.
 */
export const FinanceSettlementsPage: React.FC<FinanceSettlementsPageProps> = ({
  analytics: a,
  transactions,
  loading,
  error,
}) => {
  const { range } = useRange();
  const cur = a?.current;
  const rows = (a?.series ?? []).filter((p) => p.orders > 0 || p.refunds > 0);

  const [reconciliation, setReconciliation] = useState<ReconciliationData | null>(null);
  const [loadingRecon, setLoadingRecon] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const fetchReconciliation = async () => {
    setLoadingRecon(true);
    try {
      const res = await api.get('/admin/settlements/reconciliation');
      setReconciliation(res.data);
    } catch (err: any) {
      console.warn('Could not load settlement reconciliation:', err.message);
    } finally {
      setLoadingRecon(false);
    }
  };

  useEffect(() => {
    fetchReconciliation();
  }, []);

  const handleSyncSettlements = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await api.post('/admin/settlements/sync?dryRun=false');
      if (res.data?.success) {
        const audit = res.data.auditSummary;
        setSyncMessage(`Sync successful! Processed ${audit.rowsAccepted} settlements (${audit.duplicatesDetected} duplicates isolated). Total Net Settled: ₹${res.data.financialTotals?.totalSettledAmount?.toLocaleString('en-IN')}`);
        await fetchReconciliation();
      }
    } catch (err: any) {
      setSyncMessage(`Sync failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const exportCsv = (kind: 'ledger' | 'transactions' | 'settlements') => {
    if (!a && kind !== 'settlements') return;
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    let csv = '';
    let filename = '';

    if (kind === 'ledger' && a) {
      csv = 'Period,Orders,Gross (INR),Refunds (INR),Net (INR)\n' +
        a.series.map((p) => [p.key, p.orders, p.revenue, p.refunds, Math.round((p.revenue - p.refunds) * 100) / 100].join(',')).join('\n');
      filename = `MIMO_Collections_Ledger_${a.range.from.slice(0, 10)}_${a.range.to.slice(0, 10)}.csv`;
    } else if (kind === 'transactions') {
      csv = 'Order,Customer,Method,Paid (INR),Status,Gateway ref,Created\n' +
        transactions.map((t) => [t.orderId, t.userEmail, t.method, t.amount, t.status, t.gatewayRef, t.createdAt].map(esc).join(',')).join('\n');
      filename = `MIMO_Transactions_${(a?.range?.from || 'start').slice(0, 10)}_${(a?.range?.to || 'end').slice(0, 10)}.csv`;
    } else if (kind === 'settlements' && reconciliation?.settlements?.records) {
      csv = 'Date,Settlement ID,UTR,Amount Settled (INR),Fee (INR),Tax (INR),Adjustment (INR),Status,Health\n' +
        reconciliation.settlements.records.map((s) => [s.time, s.settlementId, s.utr, s.amount, s.fee, s.tax, s.adjustment, s.status, s.health].map(esc).join(',')).join('\n');
      filename = `MIMO_Bank_Settlements_${new Date().toISOString().slice(0, 10)}.csv`;
    }

    if (csv) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    }
  };

  const settledAmount = reconciliation?.settlements?.totalSettledRupees ?? null;
  const feesAmount = reconciliation?.settlements?.totalFeesRupees ?? 0;
  const adjustmentsAmount = reconciliation?.settlements?.totalAdjustmentsRupees ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-[#111318] dark:text-white tracking-tight">Settlements &amp; Reports</h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">Collections, Bank Transfers &amp; UTR Reconciliation · {describeRange(range)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <button
            type="button"
            onClick={handleSyncSettlements}
            disabled={syncing}
            className="px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Gateway Settlements'}
          </button>
          <button type="button" onClick={() => exportCsv('ledger')} disabled={!a} className="px-3 py-2 text-xs font-bold text-white bg-[#093765] hover:bg-[#062A4E] dark:bg-indigo-600 dark:hover:bg-indigo-700 rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"><Download className="w-3.5 h-3.5" /> Ledger CSV</button>
          <button type="button" onClick={() => exportCsv('settlements')} disabled={!reconciliation?.settlements?.records?.length} className="px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"><Landmark className="w-3.5 h-3.5" /> UTR CSV</button>
          <button type="button" onClick={() => exportCsv('transactions')} disabled={!transactions.length} className="px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"><Receipt className="w-3.5 h-3.5" /> Txns CSV</button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {syncMessage && (
        <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* Cashfree Settlement & Reconciliation Status Banner */}
      <div className={`p-4 rounded-2xl border text-xs flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
        reconciliation?.settlementRecordsAvailable
          ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
          : 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-200/80 dark:border-amber-800 text-amber-900 dark:text-amber-200'
      }`}>
        <div className="space-y-1">
          <p className="font-bold flex items-center gap-1.5">
            {reconciliation?.settlementRecordsAvailable ? (
              <>
                <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-800 dark:text-emerald-300">Cashfree Bank Settlements Reconciled &amp; Traceable</span>
              </>
            ) : (
              <>
                <Landmark className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="text-amber-800 dark:text-amber-300">Bank Settlements Awaiting Ingestion</span>
              </>
            )}
          </p>
          <p className="text-[11px] leading-relaxed opacity-90">
            {reconciliation?.settlementRecordsAvailable ? (
              <>
                <strong>Verified Inward Credits:</strong> Reconciled with Cashfree payment gateway bank disbursements. Total gateway friction (MDR fees + GST): <strong>{inr(feesAmount)}</strong>. Adjustments: <strong>{inr(adjustmentsAmount)}</strong>.
              </>
            ) : (
              <>
                <strong>Customer Collections:</strong> Active in Firestore. Cashfree settlements can be imported immediately using the <em>Sync Gateway Settlements</em> button above.
              </>
            )}
          </p>
        </div>
        {reconciliation?.settlementRecordsAvailable && (
          <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-200/70 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 rounded-lg shrink-0">
            {reconciliation.settlements.count} Settlements Ingested
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <FinanceMetricCard title="Gross Collections" value={cur ? inr(cur.grossCollections ?? cur.revenue) : '—'} icon={<IndianRupee className="w-5 h-5" />} loading={loading} change={cur ? `${cur.orders} order${cur.orders === 1 ? '' : 's'}` : undefined} comparisonText="" />
        <FinanceMetricCard title="Completed Refunds" value={cur ? inr(cur.refundedAmount) : '—'} icon={<RotateCcw className="w-5 h-5" />} iconBgColor="bg-rose-50" iconColor="text-rose-600" loading={loading} change={cur ? `${cur.refundCount} refund${cur.refundCount === 1 ? '' : 's'}` : undefined} comparisonText="" />
        <FinanceMetricCard title="Net Collections" value={cur ? inr(cur.netCollections ?? cur.netRevenue) : '—'} icon={<CheckCircle2 className="w-5 h-5" />} iconBgColor="bg-emerald-50" iconColor="text-emerald-600" loading={loading} />
        <FinanceMetricCard
          title="Bank Settlements"
          value={loadingRecon ? 'Loading...' : settledAmount !== null ? inr(settledAmount) : 'Unreconciled'}
          icon={<Landmark className="w-5 h-5" />}
          iconBgColor={settledAmount !== null ? 'bg-emerald-50' : 'bg-amber-50'}
          iconColor={settledAmount !== null ? 'text-emerald-600' : 'text-amber-600'}
          loading={loading || loadingRecon}
          change={settledAmount !== null ? `${reconciliation?.settlements?.count || 0} batches reconciled` : 'Click Sync Settlements'}
          comparisonText=""
        />
      </div>

      {/* Cashfree UTR & Bank Transfer Ledger */}
      {reconciliation?.settlements?.records && reconciliation.settlements.records.length > 0 && (
        <FinanceChartCard title="Cashfree Bank Transfers &amp; UTR Settlement Ledger" subtitle={`Showing latest ${reconciliation.settlements.records.length} bank disbursements`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold text-[10px]">
                  {['Date', 'Settlement ID', 'Bank UTR', 'Net Settled (INR)', 'Platform Fee', 'GST', 'Adjustment', 'Health'].map((h) => (
                    <th key={h} className="whitespace-nowrap py-2.5 px-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {reconciliation.settlements.records.map((s, idx) => (
                  <tr key={`${s.settlementId}-${idx}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="whitespace-nowrap py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-200">{s.time}</td>
                    <td className="whitespace-nowrap py-2.5 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">{s.settlementId}</td>
                    <td className="whitespace-nowrap py-2.5 px-3 font-mono text-xs font-bold text-[#093765] dark:text-indigo-400">{s.utr || '—'}</td>
                    <td className="whitespace-nowrap py-2.5 px-3 font-mono font-black text-emerald-600 dark:text-emerald-400">{inr(s.amount)}</td>
                    <td className="whitespace-nowrap py-2.5 px-3 font-mono text-slate-500 dark:text-slate-400">{s.fee > 0 ? inr(s.fee) : '—'}</td>
                    <td className="whitespace-nowrap py-2.5 px-3 font-mono text-slate-500 dark:text-slate-400">{s.tax > 0 ? inr(s.tax) : '—'}</td>
                    <td className="whitespace-nowrap py-2.5 px-3 font-mono text-rose-500 dark:text-rose-400">{s.adjustment !== 0 ? inr(s.adjustment) : '—'}</td>
                    <td className="whitespace-nowrap py-2.5 px-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        s.health === 'Excellent' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                        s.health === 'Healthy' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' :
                        s.health === 'Partial' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {s.health}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FinanceChartCard>
      )}

      <FinanceChartCard title="Collections ledger" subtitle={a ? `${a.range.granularity === 'hour' ? 'Hourly' : 'Daily'} · only periods with activity` : undefined}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold text-[10px]">
                {['Period', 'Orders', 'Gross', 'Refunds', 'Net'].map((h) => <th key={h} className="whitespace-nowrap py-2.5 px-3">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {loading && <tr><td colSpan={5} className="p-4"><div className="h-5 bg-slate-50 dark:bg-slate-800 rounded animate-pulse" /></td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={5} className="py-12 text-center text-xs font-semibold text-slate-400">No collections or refunds in this period.</td></tr>}
              {rows.map((p) => (
                <tr key={p.key} className="hover:bg-[#F3F4F6] dark:hover:bg-slate-800/50">
                  <td className="whitespace-nowrap py-3 px-3 font-bold text-slate-800 dark:text-slate-200">{bucketLabel(p.key)}{p.key.includes('T') ? '' : ` · ${p.key}`}</td>
                  <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{int(p.orders)}</td>
                  <td className="whitespace-nowrap py-3 px-3 font-mono text-slate-800 dark:text-slate-200">{inr(p.revenue)}</td>
                  <td className="whitespace-nowrap py-3 px-3 font-mono text-rose-600 dark:text-rose-400">{p.refunds > 0 ? `-${inr(p.refunds)}` : '—'}</td>
                  <td className="whitespace-nowrap py-3 px-3 font-mono font-black text-slate-900 dark:text-white">{inr(p.revenue - p.refunds)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && cur && (
              <tfoot>
                <tr className="border-t-2 border-[#E4E7EB] dark:border-slate-700 font-black text-slate-900 dark:text-white">
                  <td className="py-3 px-3">Total</td><td className="py-3 px-3">{int(cur.orders)}</td><td className="py-3 px-3 font-mono">{inr(cur.grossCollections ?? cur.revenue)}</td><td className="py-3 px-3 font-mono text-rose-600 dark:text-rose-400">{cur.refundedAmount > 0 ? `-${inr(cur.refundedAmount)}` : '—'}</td><td className="py-3 px-3 font-mono">{inr(cur.netCollections ?? cur.netRevenue)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="mt-4 text-[11px] text-slate-400 dark:text-slate-400">Bank settlements are verified by Cashfree UTR batch transfers. Platform processing fees and adjustments are accounted for in the Bank Settlements ledger.</p>
      </FinanceChartCard>
    </div>
  );
};
