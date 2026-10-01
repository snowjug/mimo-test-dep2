import React, { useEffect, useState, useMemo } from 'react';
import {
  Ticket,
  Plus,
  Search,
  RefreshCw,
  Trash2,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Calendar,
  Percent,
  Clock,
  Sparkles,
  AlertCircle,
  Hash,
  TrendingUp,
  Tag,
} from 'lucide-react';
import api from '../../api';
import { errorMessage } from '../../hooks/useLiveQuery';

export interface CouponItem {
  id: string;
  code: string;
  discountPercentage: number;
  isActive?: boolean;
  expiryDate?: string | { _seconds?: number; seconds?: number } | null;
  createdAt?: string | { _seconds?: number; seconds?: number } | null;
  maxUses?: number | null;
  usedCount?: number;
}

export const CouponsPage: React.FC = () => {
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Form State
  const [formCode, setFormCode] = useState('');
  const [formDiscount, setFormDiscount] = useState<number | string>(20);
  const [formExpiry, setFormExpiry] = useState('');
  const [formMaxUses, setFormMaxUses] = useState<number | string>('');
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Delete State
  const [deletingCode, setDeletingCode] = useState<string | null>(null);

  const fetchCoupons = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get('/admin/coupons');
      const data: CouponItem[] = Array.isArray(res.data) ? res.data : [];
      setCoupons(data);
    } catch (err: any) {
      setActionError(errorMessage(err, 'Failed to fetch coupons'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const parseDate = (val: any): Date | null => {
    if (!val) return null;
    if (typeof val === 'string') return new Date(val);
    if (val._seconds) return new Date(val._seconds * 1000);
    if (val.seconds) return new Date(val.seconds * 1000);
    return null;
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode.trim()) {
      setActionError('Please enter a coupon code.');
      return;
    }
    const discount = Number(formDiscount);
    if (isNaN(discount) || discount < 1 || discount > 100) {
      setActionError('Discount percentage must be between 1 and 100.');
      return;
    }

    setSaving(true);
    setActionError(null);
    try {
      await api.post('/admin/coupons', {
        code: formCode.trim().toUpperCase(),
        discountPercentage: discount,
        expiryDate: formExpiry ? new Date(formExpiry).toISOString() : null,
        maxUses: formMaxUses ? Number(formMaxUses) : null,
        isActive: formActive,
      });
      setActionSuccess(`Coupon ${formCode.toUpperCase()} saved successfully!`);
      setTimeout(() => setActionSuccess(null), 3500);
      setShowCreateModal(false);
      setFormCode('');
      setFormDiscount(20);
      setFormExpiry('');
      setFormMaxUses('');
      setFormActive(true);
      fetchCoupons(true);
    } catch (err: any) {
      setActionError(errorMessage(err, 'Failed to save coupon'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (coupon: CouponItem) => {
    try {
      const updatedStatus = coupon.isActive === false ? true : false;
      await api.post('/admin/coupons', {
        code: coupon.code || coupon.id,
        discountPercentage: coupon.discountPercentage,
        expiryDate: parseDate(coupon.expiryDate)?.toISOString() || null,
        maxUses: coupon.maxUses ?? null,
        isActive: updatedStatus,
      });
      fetchCoupons(true);
    } catch (err: any) {
      setActionError(errorMessage(err, 'Failed to update coupon status'));
    }
  };

  const handleDelete = async (code: string) => {
    try {
      setDeletingCode(code);
      await api.delete(`/admin/coupons/${encodeURIComponent(code)}`);
      setCoupons((prev) => prev.filter((c) => (c.code || c.id) !== code));
      setActionSuccess(`Coupon ${code} removed.`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError(errorMessage(err, 'Failed to delete coupon'));
    } finally {
      setDeletingCode(null);
    }
  };

  // Metrics
  const stats = useMemo(() => {
    const total = coupons.length;
    const active = coupons.filter((c) => {
      if (c.isActive === false) return false;
      const exp = parseDate(c.expiryDate);
      if (exp && exp.getTime() < Date.now()) return false;
      return true;
    }).length;
    const maxDiscount = coupons.reduce((max, c) => Math.max(max, c.discountPercentage || 0), 0);
    const totalUses = coupons.reduce((sum, c) => sum + (c.usedCount || 0), 0);
    return { total, active, maxDiscount, totalUses };
  }, [coupons]);

  // Filtered coupons
  const filtered = useMemo(() => {
    return coupons.filter((c) => {
      const codeStr = (c.code || c.id || '').toUpperCase();
      const matchesSearch = codeStr.includes(search.toUpperCase());
      const isExp = (() => {
        const d = parseDate(c.expiryDate);
        return d ? d.getTime() < Date.now() : false;
      })();
      const isLiveActive = c.isActive !== false && !isExp;

      if (statusFilter === 'ACTIVE') return matchesSearch && isLiveActive;
      if (statusFilter === 'INACTIVE') return matchesSearch && !isLiveActive;
      return matchesSearch;
    });
  }, [coupons, search, statusFilter]);

  return (
    <div className="space-y-5 sm:space-y-6 animate-fadeIn font-sans pb-12">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
            <Ticket size={20} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-1)]">
              Coupon Management
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-3)]">
              Create, inspect, and manage student discount codes & promotional campaigns.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchCoupons(true)}
            disabled={refreshing}
            className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:text-[var(--text-1)] text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin text-indigo-500' : ''} />
            <span className="hidden xs:inline">Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/25 transition-all cursor-pointer active:scale-95"
          >
            <Plus size={15} />
            <span>Create Coupon</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionError && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="cursor-pointer font-bold">✕</button>
        </div>
      )}
      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="cursor-pointer font-bold">✕</button>
        </div>
      )}

      {/* ── Summary Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="skeleton h-3 w-20 rounded" />
                <div className="skeleton h-4 w-4 rounded-full" />
              </div>
              <div className="skeleton h-7 w-16 rounded-md" />
              <div className="skeleton h-3 w-24 rounded" />
            </div>
          ))
        ) : (
          <>
            <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
              <div className="flex items-center justify-between text-[var(--text-3)] mb-1">
                <span className="text-xs font-semibold">Active Coupons</span>
                <Sparkles size={14} className="text-amber-500" />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                {stats.active}
              </p>
              <span className="text-[11px] text-[var(--text-3)] mt-0.5 block">
                {stats.total} total issued
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
              <div className="flex items-center justify-between text-[var(--text-3)] mb-1">
                <span className="text-xs font-semibold">Max Discount</span>
                <Percent size={14} className="text-indigo-500" />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400">
                {stats.maxDiscount}%
              </p>
              <span className="text-[11px] text-[var(--text-3)] mt-0.5 block">
                Top voucher saving
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
              <div className="flex items-center justify-between text-[var(--text-3)] mb-1">
                <span className="text-xs font-semibold">Total Redemptions</span>
                <TrendingUp size={14} className="text-blue-500" />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-[var(--text-1)]">
                {stats.totalUses}
              </p>
              <span className="text-[11px] text-[var(--text-3)] mt-0.5 block">
                Across campus prints
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
              <div className="flex items-center justify-between text-[var(--text-3)] mb-1">
                <span className="text-xs font-semibold">Campaign Status</span>
                <Tag size={14} className="text-emerald-500" />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-emerald-500">
                LIVE
              </p>
              <span className="text-[11px] text-[var(--text-3)] mt-0.5 block">
                Auto-applied at checkout
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Search & Filter Controls ──────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            type="text"
            placeholder="Search coupon code (e.g. WELCOME10)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-xl text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none focus:border-indigo-500 transition-colors shadow-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-[var(--surface-2)] rounded-xl border border-[var(--border)] self-start sm:self-auto">
          {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === filter
                  ? 'bg-[var(--surface)] text-[var(--text-1)] shadow-xs'
                  : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
              }`}
            >
              {filter === 'ALL' ? 'All Codes' : filter === 'ACTIVE' ? 'Active' : 'Inactive'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Coupons List / Table ───────────────────────────────────── */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xs overflow-hidden">
        {!loading && filtered.length === 0 ? (
          <div className="py-16 text-center text-[var(--text-3)] space-y-3">
            <Ticket size={36} className="mx-auto text-[var(--text-3)] opacity-40" />
            <p className="text-sm font-semibold text-[var(--text-2)]">No coupon codes found</p>
            <p className="text-xs text-[var(--text-3)] max-w-sm mx-auto">
              {search ? 'No coupons matched your search criteria.' : 'Create your first promo code to offer discounts to students.'}
            </p>
            {!search && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="mt-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus size={14} /> Create First Coupon
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider">
                  <th className="py-3 px-4 sm:px-6">Coupon Code</th>
                  <th className="py-3 px-4">Discount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Expiry Date</th>
                  <th className="py-3 px-4">Redemptions</th>
                  <th className="py-3 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] text-xs sm:text-sm">
                {loading ? (
                  Array.from({ length: 4 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="flex items-center gap-2">
                          <div className="skeleton h-6 w-24 rounded-lg" />
                          <div className="skeleton h-6 w-6 rounded-lg" />
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="skeleton h-5 w-16 rounded-md" />
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="skeleton h-5 w-20 rounded-full" />
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="skeleton h-4 w-28 rounded" />
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="skeleton h-4 w-16 rounded" />
                      </td>
                      <td className="py-3.5 px-4 sm:px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="skeleton h-6 w-14 rounded-lg" />
                          <div className="skeleton h-6 w-6 rounded-lg" />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  filtered.map((c) => {
                    const code = c.code || c.id;
                    const exp = parseDate(c.expiryDate);
                    const isExpired = exp ? exp.getTime() < Date.now() : false;
                    const isLive = c.isActive !== false && !isExpired;

                    return (
                      <tr
                        key={code}
                        className="hover:bg-[var(--surface-2)]/50 transition-colors group"
                      >
                        {/* Code + Copy */}
                        <td className="py-3.5 px-4 sm:px-6">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-xs sm:text-sm text-[var(--text-1)] bg-[var(--surface-2)] px-2.5 py-1 rounded-lg border border-[var(--border)] tracking-wider">
                              {code}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(code)}
                              title="Copy code"
                              className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer"
                            >
                              {copiedCode === code ? (
                                <Check size={13} className="text-emerald-500" />
                              ) : (
                                <Copy size={13} />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Discount % */}
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 font-black text-sm text-indigo-600 dark:text-indigo-400">
                            {c.discountPercentage}% OFF
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          {isLive ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 size={11} />
                              Active
                            </span>
                          ) : isExpired ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                              <Clock size={11} />
                              Expired
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                              <XCircle size={11} />
                              Disabled
                            </span>
                          )}
                        </td>

                        {/* Expiry Date */}
                        <td className="py-3.5 px-4 text-xs text-[var(--text-2)] font-medium">
                          {exp ? (
                            <span className={`inline-flex items-center gap-1.5 ${isExpired ? 'text-rose-500 font-semibold' : ''}`}>
                              <Calendar size={12} className="text-[var(--text-3)]" />
                              {exp.toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          ) : (
                            <span className="text-[var(--text-3)]">Never expires</span>
                          )}
                        </td>

                        {/* Redemptions */}
                        <td className="py-3.5 px-4 text-xs font-semibold text-[var(--text-2)]">
                          <span className="text-[var(--text-1)] font-bold">{c.usedCount || 0}</span>
                          {c.maxUses ? (
                            <span className="text-[var(--text-3)]"> / {c.maxUses} max</span>
                          ) : (
                            <span className="text-[var(--text-3)]"> uses</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 sm:px-6 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleActive(c)}
                              title={c.isActive === false ? 'Enable coupon' : 'Disable coupon'}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                                c.isActive === false
                                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20'
                                  : 'bg-[var(--surface-2)] text-[var(--text-2)] border-[var(--border)] hover:bg-[var(--border)]'
                              }`}
                            >
                              {c.isActive === false ? 'Enable' : 'Disable'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(code)}
                              disabled={deletingCode === code}
                              title="Delete coupon permanently"
                              className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            >
                              {deletingCode === code ? (
                                <RefreshCw size={13} className="animate-spin text-rose-500" />
                              ) : (
                                <Trash2 size={13} />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create Coupon Modal ────────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-xs">
                  <Ticket size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[var(--text-1)]">Create New Coupon</h3>
                  <p className="text-xs text-[var(--text-3)]">Issue promo code for campus users</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOrUpdate} className="space-y-4">
              {/* Code */}
              <div>
                <label className="block text-xs font-bold text-[var(--text-2)] mb-1 uppercase tracking-wider">
                  Coupon Code *
                </label>
                <div className="relative">
                  <Tag size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. EXAM25 or DIWALI50"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    className="w-full pl-9 pr-4 py-2 text-sm font-mono font-bold bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none focus:border-indigo-500 uppercase tracking-wider"
                  />
                </div>
              </div>

              {/* Discount % */}
              <div>
                <label className="block text-xs font-bold text-[var(--text-2)] mb-1 uppercase tracking-wider">
                  Discount Percentage (%) *
                </label>
                <div className="relative">
                  <Percent size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    placeholder="20"
                    value={formDiscount}
                    onChange={(e) => setFormDiscount(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm font-bold bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-[var(--text-1)] focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Expiry Date */}
              <div>
                <label className="block text-xs font-bold text-[var(--text-2)] mb-1 uppercase tracking-wider">
                  Expiry Date (Optional)
                </label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
                  <input
                    type="date"
                    value={formExpiry}
                    onChange={(e) => setFormExpiry(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-[var(--text-1)] focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <p className="text-[10px] text-[var(--text-3)] mt-1">Leave blank if this coupon should never expire.</p>
              </div>

              {/* Max Uses */}
              <div>
                <label className="block text-xs font-bold text-[var(--text-2)] mb-1 uppercase tracking-wider">
                  Max Redemptions Limit (Optional)
                </label>
                <div className="relative">
                  <Hash size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
                  <input
                    type="number"
                    min={1}
                    placeholder="Unlimited"
                    value={formMaxUses}
                    onChange={(e) => setFormMaxUses(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-[var(--text-1)] focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Status toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                <div>
                  <p className="text-xs font-bold text-[var(--text-1)]">Active Immediately</p>
                  <p className="text-[10px] text-[var(--text-3)]">Students can apply this promo code right away</p>
                </div>
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-2)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/25 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {saving && <RefreshCw size={12} className="animate-spin" />}
                  <span>{saving ? 'Creating...' : 'Create Coupon'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
