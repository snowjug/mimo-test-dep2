import React, { useState, useEffect, useMemo } from 'react';
import {
  IndianRupee,
  Save,
  CheckCircle2,
  RefreshCw,
  Plus,
  Trash2,
  Tag,
  Loader2,
  Sparkles,
  CreditCard,
  FileText,
  Search,
  ArrowUpRight,
  TrendingUp,
  AlertCircle,
  RotateCcw,
  Check,
  X,
  Calendar,
  Layers,
  DollarSign,
  PieChart as PieIcon,
  ShieldCheck,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import api from '../../api';
import { useTheme } from '../../context/ThemeContext';

interface PricingSettings {
  pricePerPageBW: number;
  pricePerPageColor: number;
  pricePerPageA4: number;
  pricePerPageBWDuplex: number;
  pricePerPageGraph: number;
}

interface CouponItem {
  id: string;
  code: string;
  discountPercentage: number;
  isActive: boolean;
  expiryDate?: any;
}

interface RefundItem {
  id: string;
  orderId: string;
  userEmail: string;
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'processed';
  createdAt: string;
  file?: string;
}

export const FinancePage: React.FC = () => {
  const { isDark } = useTheme();
  const [activeSegment, setActiveSegment] = useState<'overview' | 'transactions' | 'refunds' | 'pricing'>('overview');

  // Pricing State
  const [pricing, setPricing] = useState<PricingSettings>({
    pricePerPageBW: 2.80,
    pricePerPageColor: 10.00,
    pricePerPageA4: 2.80,
    pricePerPageBWDuplex: 3.30,
    pricePerPageGraph: 2.00,
  });
  const [savingPricing, setSavingPricing] = useState(false);
  const [savedPricingSuccess, setSavedPricingSuccess] = useState(false);

  // Coupon State
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [newCode, setNewCode] = useState('');
  const [newDiscount, setNewDiscount] = useState('');
  const [creatingCoupon, setCreatingCoupon] = useState(false);

  // Transactions & Metrics
  const [transactions, setTransactions] = useState<any[]>([]);
  const [refundRequests, setRefundRequests] = useState<RefundItem[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTxn, setSearchTxn] = useState('');
  const [selectedTxn, setSelectedTxn] = useState<any | null>(null);

  // Refund Modal
  const [processingRefund, setProcessingRefund] = useState(false);
  const [refundModal, setRefundModal] = useState<{ open: boolean; item: RefundItem | null }>({
    open: false,
    item: null,
  });

  const loadFinanceData = async () => {
    setLoading(true);
    try {
      const [settingsRes, couponsRes, printsRes, refundsRes, metricsRes] = await Promise.all([
        api.get('/admin/settings').catch(() => ({ data: {} })),
        api.get('/admin/coupons').catch(() => ({ data: [] })),
        api.get('/admin/recent-prints').catch(() => ({ data: [] })),
        api.get('/admin/refund-requests').catch(() => ({ data: [] })),
        api.get('/admin/metrics').catch(() => ({ data: {} })),
      ]);

      if (settingsRes.data) {
        setPricing({
          pricePerPageBW: settingsRes.data.pricePerPageBW ?? 2.80,
          pricePerPageColor: settingsRes.data.pricePerPageColor ?? 10.00,
          pricePerPageA4: settingsRes.data.pricePerPageA4 ?? 2.80,
          pricePerPageBWDuplex: settingsRes.data.pricePerPageBWDuplex ?? 3.30,
          pricePerPageGraph: settingsRes.data.pricePerPageGraph ?? 2.00,
        });
      }

      setCoupons(Array.isArray(couponsRes.data) ? couponsRes.data : []);
      setTransactions(Array.isArray(printsRes.data) ? printsRes.data : []);
      setRefundRequests(Array.isArray(refundsRes.data) ? refundsRes.data : []);
      setMetrics(metricsRes.data || {});
    } catch (err) {
      console.error('Failed to load finance data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinanceData();
  }, []);

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPricing(true);
    setSavedPricingSuccess(false);
    try {
      await api.post('/admin/settings', pricing);
      setSavedPricingSuccess(true);
      setTimeout(() => setSavedPricingSuccess(false), 3000);
    } catch (err) {
      alert('Failed to save pricing configuration');
    } finally {
      setSavingPricing(false);
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newDiscount) return;
    setCreatingCoupon(true);
    try {
      await api.post('/admin/coupons', {
        code: newCode.trim().toUpperCase(),
        discountPercentage: Number(newDiscount),
      });
      setNewCode('');
      setNewDiscount('');
      const res = await api.get('/admin/coupons');
      setCoupons(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      alert('Failed to create coupon');
    } finally {
      setCreatingCoupon(false);
    }
  };

  const handleDeleteCoupon = async (code: string) => {
    if (!confirm(`Delete coupon ${code}?`)) return;
    try {
      await api.delete(`/admin/coupons/${code}`);
      setCoupons(prev => prev.filter(c => c.code !== code && c.id !== code));
    } catch (err) {
      alert('Failed to delete coupon');
    }
  };

  const handleProcessRefund = async () => {
    if (!refundModal.item) return;
    setProcessingRefund(true);
    try {
      await api.post('/admin/refund', {
        orderId: refundModal.item.orderId,
        refundAmount: refundModal.item.amount,
        reason: refundModal.item.reason || 'Admin Approved Refund',
      });
      setRefundModal({ open: false, item: null });
      loadFinanceData();
    } catch (err) {
      alert('Refund execution failed. Please verify Cashfree API credentials.');
    } finally {
      setProcessingRefund(false);
    }
  };

  const totalGross = useMemo(() => {
    return metrics?.totalRevenue || transactions.reduce((acc, t) => acc + (t.cost || 0), 0);
  }, [metrics, transactions]);

  const totalRefunded = useMemo(() => {
    return refundRequests
      .filter(r => r.status === 'processed' || r.status === 'approved')
      .reduce((acc, r) => acc + (r.amount || 0), 0);
  }, [refundRequests]);

  const netRevenue = Math.max(0, totalGross - totalRefunded);

  const revenueTimeSeries = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach(t => {
      const d = t.createdAt ? new Date(t.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Today';
      map[d] = (map[d] || 0) + (t.cost || 0);
    });
    return Object.entries(map).map(([date, amount]) => ({
      date,
      amount: Number(amount.toFixed(2)),
    }));
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    if (!searchTxn.trim()) return transactions;
    const q = searchTxn.toLowerCase();
    return transactions.filter(
      t =>
        t.userEmail?.toLowerCase().includes(q) ||
        t.file?.toLowerCase().includes(q) ||
        t.orderId?.toLowerCase().includes(q)
    );
  }, [transactions, searchTxn]);

  return (
    <div className="space-y-6 animate-fadeIn font-sans select-none">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className={`text-2xl sm:text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              MIMO Finance Center
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Cashfree Settlement Mesh
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-2)] mt-1">
            Financial performance, payment ledger, refund disputes, and campus tariff pricing.
          </p>
        </div>

        <button
          type="button"
          onClick={loadFinanceData}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[var(--surface)] border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)] transition-all cursor-pointer shadow-xs"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Sync Finance
        </button>
      </div>

      {/* ── Segment Navigation ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2 overflow-x-auto">
        {[
          { id: 'overview', label: 'Financial Overview', icon: TrendingUp },
          { id: 'transactions', label: 'Transaction Ledger', icon: FileText },
          { id: 'refunds', label: `Refund Desk (${refundRequests.length})`, icon: RotateCcw },
          { id: 'pricing', label: 'Pricing & Coupons', icon: Tag },
        ].map(tab => {
          const Icon = tab.icon;
          const active = activeSegment === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSegment(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)]'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── SEGMENT 1: OVERVIEW ────────────────────────────────────── */}
      {activeSegment === 'overview' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Financial KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
              <span className="text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider">Gross Collections</span>
              <p className="text-2xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                ₹{totalGross.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-[var(--text-3)] mt-1">Total revenue collected</p>
            </div>

            <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
              <span className="text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider">Net Realized Revenue</span>
              <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                ₹{netRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-[var(--text-3)] mt-1">Gross minus processed refunds</p>
            </div>

            <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
              <span className="text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider">Disputes / Refunds</span>
              <p className="text-2xl sm:text-3xl font-black text-amber-500 mt-1">
                ₹{totalRefunded.toFixed(2)}
              </p>
              <p className="text-[11px] text-[var(--text-3)] mt-1">{refundRequests.length} total claims recorded</p>
            </div>

            <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
              <span className="text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider">Settlement Rate</span>
              <p className="text-2xl sm:text-3xl font-black text-[var(--text-1)] mt-1">
                100%
              </p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">Instant Cashfree Webhook</p>
            </div>
          </div>

          {/* Large Financial Revenue Trend */}
          <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-base text-[var(--text-1)]">Revenue Intelligence</h2>
                <p className="text-xs text-[var(--text-3)]">Daily gross collections across all active kiosk hardware</p>
              </div>
              <span className="text-xs font-bold text-indigo-500 font-mono">Real-Time Sync</span>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueTimeSeries.length > 0 ? revenueTimeSeries : [{ date: 'Today', amount: totalGross }]}>
                  <defs>
                    <linearGradient id="finGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#f1f5f9'} />
                  <XAxis dataKey="date" stroke={isDark ? '#64748b' : '#94a3b8'} fontSize={11} tickLine={false} />
                  <YAxis stroke={isDark ? '#64748b' : '#94a3b8'} fontSize={11} tickLine={false} tickFormatter={v => `₹${v}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      borderColor: isDark ? '#334155' : '#e2e8f0',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                  />
                  <Area type="monotone" dataKey="amount" stroke="#4f46e5" strokeWidth={2.5} fillOpacity={1} fill="url(#finGrad)" name="Revenue (₹)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── SEGMENT 2: TRANSACTION LEDGER ──────────────────────────── */}
      {activeSegment === 'transactions' && (
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs overflow-hidden animate-fadeIn">
          <div className="p-4 sm:p-5 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-base text-[var(--text-1)]">Payment Transaction Ledger</h2>
              <p className="text-xs text-[var(--text-3)]">Complete audit log of student checkouts</p>
            </div>
            <div className="relative w-full max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
              <input
                type="text"
                placeholder="Search by Order ID, file, user..."
                value={searchTxn}
                onChange={e => setSearchTxn(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)]"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider">
                  <th className="py-3 px-4 sm:px-6">Order ID</th>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Document</th>
                  <th className="py-3 px-4">Pages</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4">Settled Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 sm:px-6 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] text-xs sm:text-sm">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-[var(--text-3)]">
                      No matching transactions found
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map(t => (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedTxn(t)}
                      className="hover:bg-[var(--surface-2)]/60 transition-colors cursor-pointer group"
                    >
                      <td className="py-3.5 px-4 sm:px-6 font-mono font-bold text-[var(--text-1)] group-hover:text-indigo-600">
                        {t.orderId || t.id}
                      </td>
                      <td className="py-3.5 px-4 text-[var(--text-2)] font-medium">
                        {t.userEmail}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-[var(--text-1)] truncate max-w-[180px]">
                        {t.file}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-[var(--text-2)]">
                        {t.pageCount} pgs
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="uppercase text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {t.colorMode}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-black text-emerald-600 dark:text-emerald-400">
                        ₹{(t.cost || 0).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase ${
                          t.status === 'completed' || t.status === 'paid' || t.status === 'printed'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-amber-500/10 text-amber-600'
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 sm:px-6 text-right text-[11px] text-[var(--text-3)] font-medium">
                        {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : 'Today'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SEGMENT 3: REFUND DESK ─────────────────────────────────── */}
      {activeSegment === 'refunds' && (
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs overflow-hidden animate-fadeIn">
          <div className="p-4 sm:p-5 border-b border-[var(--border)] flex items-center justify-between">
            <div>
              <h2 className="font-bold text-base text-[var(--text-1)]">Refund & Dispute Center</h2>
              <p className="text-xs text-[var(--text-3)]">Review and authorize Cashfree student refund payouts</p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              {refundRequests.length} Active Requests
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider">
                  <th className="py-3 px-4 sm:px-6">Order ID</th>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 sm:px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] text-xs sm:text-sm">
                {refundRequests.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[var(--text-3)]">
                      <CheckCircle2 size={24} className="mx-auto mb-2 text-emerald-500" />
                      Zero open refund disputes!
                    </td>
                  </tr>
                ) : (
                  refundRequests.map(r => (
                    <tr key={r.id || r.orderId} className="hover:bg-[var(--surface-2)]/50 transition-colors">
                      <td className="py-3.5 px-4 sm:px-6 font-mono font-bold text-[var(--text-1)]">
                        {r.orderId}
                      </td>
                      <td className="py-3.5 px-4 text-[var(--text-2)] font-medium">
                        {r.userEmail}
                      </td>
                      <td className="py-3.5 px-4 font-black text-rose-600 dark:text-rose-400">
                        ₹{(r.amount || 0).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-[var(--text-2)] max-w-xs truncate">
                        {r.reason || 'Hardware paper jam / print incomplete'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase ${
                          r.status === 'processed'
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : 'bg-amber-500/10 text-amber-600'
                        }`}>
                          {r.status || 'pending'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 sm:px-6 text-right">
                        <button
                          type="button"
                          onClick={() => setRefundModal({ open: true, item: r })}
                          className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
                        >
                          Process Refund
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SEGMENT 4: PRICING & COUPONS ───────────────────────────── */}
      {activeSegment === 'pricing' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeIn">
          {/* Print Pricing Configuration */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-base text-[var(--text-1)]">Campus Tariff Rates</h2>
                  <p className="text-xs text-[var(--text-3)]">Real-time per page pricing applied at all kiosk terminals</p>
                </div>
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                  <IndianRupee size={16} />
                </div>
              </div>

              <form onSubmit={handleSavePricing} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* B&W */}
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider mb-1">
                      B&W Print Rate (A4)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-3)]">₹</span>
                      <input
                        type="number"
                        step="0.10"
                        value={pricing.pricePerPageBW}
                        onChange={(e) => setPricing({ ...pricing, pricePerPageBW: parseFloat(e.target.value) || 0 })}
                        className="w-full pl-8 pr-3 py-2 text-xs sm:text-sm font-bold rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)]"
                      />
                    </div>
                  </div>

                  {/* Color */}
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider mb-1">
                      Color Print Rate (A4)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-3)]">₹</span>
                      <input
                        type="number"
                        step="0.50"
                        value={pricing.pricePerPageColor}
                        onChange={(e) => setPricing({ ...pricing, pricePerPageColor: parseFloat(e.target.value) || 0 })}
                        className="w-full pl-8 pr-3 py-2 text-xs sm:text-sm font-bold rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)]"
                      />
                    </div>
                  </div>

                  {/* Duplex B&W */}
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider mb-1">
                      Duplex B&W Rate
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-3)]">₹</span>
                      <input
                        type="number"
                        step="0.10"
                        value={pricing.pricePerPageBWDuplex}
                        onChange={(e) => setPricing({ ...pricing, pricePerPageBWDuplex: parseFloat(e.target.value) || 0 })}
                        className="w-full pl-8 pr-3 py-2 text-xs sm:text-sm font-bold rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)]"
                      />
                    </div>
                  </div>

                  {/* Graph Paper */}
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider mb-1">
                      Graph / Special Sheet
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-3)]">₹</span>
                      <input
                        type="number"
                        step="0.10"
                        value={pricing.pricePerPageGraph}
                        onChange={(e) => setPricing({ ...pricing, pricePerPageGraph: parseFloat(e.target.value) || 0 })}
                        className="w-full pl-8 pr-3 py-2 text-xs sm:text-sm font-bold rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)]"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-3 flex items-center justify-between">
                  {savedPricingSuccess ? (
                    <span className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                      <CheckCircle2 size={14} /> Pricing saved to Firestore!
                    </span>
                  ) : <span />}

                  <button
                    type="submit"
                    disabled={savingPricing}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-indigo-500/20 disabled:opacity-50"
                  >
                    {savingPricing ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    Save Pricing
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Promotional Discount Coupons */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-base text-[var(--text-1)]">Promotional Coupons</h2>
                  <p className="text-xs text-[var(--text-3)]">Generate and manage student discount codes</p>
                </div>
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                  <Tag size={16} />
                </div>
              </div>

              <form onSubmit={handleCreateCoupon} className="flex gap-2 mb-4">
                <input
                  type="text"
                  placeholder="CODE (e.g. SEM2026)"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  required
                  className="flex-1 px-3 py-2 text-xs font-bold uppercase rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)]"
                />
                <div className="relative w-24">
                  <input
                    type="number"
                    placeholder="%"
                    value={newDiscount}
                    onChange={(e) => setNewDiscount(e.target.value)}
                    required
                    min="1"
                    max="100"
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={creatingCoupon}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  <Plus size={14} /> Add
                </button>
              </form>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {coupons.length === 0 ? (
                  <p className="text-xs text-[var(--text-3)] py-4 text-center">No active coupons</p>
                ) : (
                  coupons.map((coupon) => (
                    <div
                      key={coupon.id || coupon.code}
                      className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2">
                        <Tag size={14} className="text-purple-500" />
                        <span className="font-mono font-bold text-xs text-[var(--text-1)]">{coupon.code}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400">
                          {coupon.discountPercentage}% OFF
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteCoupon(coupon.code || coupon.id)}
                        className="p-1 text-[var(--text-3)] hover:text-rose-500 transition-colors cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Transaction Details Drawer ──────────────────────────────── */}
      {selectedTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div>
                <h3 className="font-bold text-base text-[var(--text-1)]">Transaction Details</h3>
                <p className="text-xs text-[var(--text-3)] font-mono">{selectedTxn.orderId || selectedTxn.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTxn(null)}
                className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-[var(--border)]">
                <span className="text-[var(--text-3)]">Student Email</span>
                <span className="font-semibold">{selectedTxn.userEmail}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--border)]">
                <span className="text-[var(--text-3)]">Document File</span>
                <span className="font-semibold truncate max-w-[200px]">{selectedTxn.file}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--border)]">
                <span className="text-[var(--text-3)]">Pages & Mode</span>
                <span className="font-semibold">{selectedTxn.pageCount} pgs ({selectedTxn.colorMode})</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--border)]">
                <span className="text-[var(--text-3)]">Amount Charged</span>
                <span className="font-black text-emerald-600 dark:text-emerald-400">₹{(selectedTxn.cost || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--border)]">
                <span className="text-[var(--text-3)]">Payment Gateway</span>
                <span className="font-semibold">Cashfree (Automated Settlement)</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--border)]">
                <span className="text-[var(--text-3)]">Status</span>
                <span className="font-bold uppercase text-emerald-500">{selectedTxn.status}</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedTxn(null)}
                className="px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-bold hover:bg-[var(--primary-hover)] transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Refund Execution Confirmation Modal ──────────────────────── */}
      {refundModal.open && refundModal.item && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-[var(--border)]">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                <RotateCcw size={20} />
              </div>
              <div>
                <h3 className="font-bold text-base text-[var(--text-1)]">Authorize Cashfree Refund</h3>
                <p className="text-xs text-[var(--text-3)] font-mono">{refundModal.item.orderId}</p>
              </div>
            </div>

            <p className="text-xs text-[var(--text-2)] leading-relaxed">
              You are about to issue an immediate cash reversal of{' '}
              <strong className="text-rose-600 font-bold">₹{(refundModal.item.amount || 0).toFixed(2)}</strong> to{' '}
              <span className="font-semibold text-[var(--text-1)]">{refundModal.item.userEmail}</span>.
            </p>

            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300">
              <strong>Reason:</strong> {refundModal.item.reason || 'Hardware paper jam / incomplete print'}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRefundModal({ open: false, item: null })}
                disabled={processingRefund}
                className="px-4 py-2 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text-2)] hover:bg-[var(--surface-2)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProcessRefund}
                disabled={processingRefund}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-rose-500/20 disabled:opacity-50"
              >
                {processingRefund ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Confirm & Refund ₹{refundModal.item.amount.toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
