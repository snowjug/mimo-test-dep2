import React, { useState, useEffect } from 'react';
import {
  Tag,
  IndianRupee,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  Check,
  AlertTriangle,
  Layers,
  Sparkles,
  Calendar,
  Percent,
} from 'lucide-react';
import api from '../../../api';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmationDialog } from '../components/ConfirmationDialog';

export interface FinancePricingPageProps {
  loading: boolean;
  onRefresh: () => void;
}

export const FinancePricingPage: React.FC<FinancePricingPageProps> = () => {
  // Pricing state
  const [pricing, setPricing] = useState({
    pricePerPageBW: 2.80,
    pricePerPageColor: 10.00,
    pricePerPageA4: 2.80,
    pricePerPageBWDuplex: 3.30,
    pricePerPageGraph: 2.00,
  });
  const [originalPricing, setOriginalPricing] = useState({ ...pricing });
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  const [pricingSuccess, setPricingSuccess] = useState(false);

  // Coupons state
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [showCreateCoupon, setShowCreateCoupon] = useState(false);
  const [showBulkGenerator, setShowBulkGenerator] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState('10');
  const [couponExpiry, setCouponExpiry] = useState('');
  const [bulkPrefix, setBulkPrefix] = useState('MIMO');
  const [bulkCount, setBulkCount] = useState('5');
  const [bulkDiscount, setBulkDiscount] = useState('15');
  const [couponToDelete, setCouponToDelete] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch Pricing and Coupons
  const fetchSettings = async () => {
    try {
      const res = await api.get('/admin/settings');
      if (res.data) {
        const data = {
          pricePerPageBW: Number(res.data.pricePerPageBW || 2.80),
          pricePerPageColor: Number(res.data.pricePerPageColor || 10.00),
          pricePerPageA4: Number(res.data.pricePerPageA4 || 2.80),
          pricePerPageBWDuplex: Number(res.data.pricePerPageBWDuplex || 3.30),
          pricePerPageGraph: Number(res.data.pricePerPageGraph || 2.00),
        };
        setPricing(data);
        setOriginalPricing(data);
      }
    } catch (e) {
      console.error('Failed to load pricing:', e);
    }
  };

  const fetchCoupons = async () => {
    setLoadingCoupons(true);
    try {
      const res = await api.get('/admin/coupons');
      if (Array.isArray(res.data)) {
        setCoupons(res.data);
      }
    } catch (e) {
      console.error('Failed to load coupons:', e);
    } finally {
      setLoadingCoupons(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchCoupons();
  }, []);

  const handleSavePricing = async () => {
    setIsSavingPricing(true);
    setStatusMessage(null);
    try {
      await api.post('/admin/settings', pricing);
      setOriginalPricing({ ...pricing });
      setPricingSuccess(true);
      setTimeout(() => setPricingSuccess(false), 3000);
      setStatusMessage({ type: 'success', text: 'Printing tariff rules saved and applied network-wide.' });
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.response?.data?.error || 'Failed to update pricing.' });
    } finally {
      setIsSavingPricing(false);
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode) return;
    setStatusMessage(null);
    try {
      await api.post('/admin/coupons', {
        code: couponCode.trim().toUpperCase(),
        discountPercentage: Number(couponDiscount),
        expiryDate: couponExpiry || null,
      });
      setShowCreateCoupon(false);
      setCouponCode('');
      setCouponExpiry('');
      setStatusMessage({ type: 'success', text: `Coupon ${couponCode.toUpperCase()} created successfully.` });
      fetchCoupons();
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.response?.data?.error || 'Failed to create coupon.' });
    }
  };

  const handleBulkGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    try {
      const res = await api.post('/admin/coupons/bulk', {
        prefix: bulkPrefix.trim().toUpperCase(),
        count: Number(bulkCount),
        discountPercentage: Number(bulkDiscount),
      });
      setShowBulkGenerator(false);
      setStatusMessage({ type: 'success', text: `Generated ${res.data.count || bulkCount} promo vouchers.` });
      fetchCoupons();
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.response?.data?.error || 'Bulk generation failed.' });
    }
  };

  const handleDeleteCoupon = async () => {
    if (!couponToDelete) return;
    try {
      await api.delete(`/admin/coupons/${couponToDelete}`);
      setCouponToDelete(null);
      setStatusMessage({ type: 'success', text: `Coupon ${couponToDelete} deactivated.` });
      fetchCoupons();
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: 'Failed to delete coupon.' });
    }
  };

  const isPricingDirty = JSON.stringify(pricing) !== JSON.stringify(originalPricing);

  return (
    <div className="space-y-8">
      {/* ── STATUS BANNER ──────────────────────────────────────────────────────── */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between animate-fadeIn ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            )}
            {statusMessage.text}
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-600">
            ×
          </button>
        </div>
      )}

      {/* ── SECTION A: PRINT PRICING CONFIGURATION ─────────────────────────────── */}
      <div className="bg-white border border-[#EDE9FE] rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <IndianRupee className="w-4 h-4" />
              </div>
              <h2 className="text-base font-extrabold text-[#19162D] tracking-tight">
                Print Tariff & Pricing Rules
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              Configure per-page rates applied across all connected MIMO kiosks.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isPricingDirty && (
              <button
                onClick={() => setPricing({ ...originalPricing })}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
            <button
              onClick={handleSavePricing}
              disabled={isSavingPricing || !isPricingDirty}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-xs cursor-pointer ${
                pricingSuccess
                  ? 'bg-emerald-600 text-white'
                  : isPricingDirty
                  ? 'bg-[#6D35E8] hover:bg-[#5b29c9] text-white shadow-purple-500/20'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              {pricingSuccess ? <Check className="w-4 h-4" /> : <Save className="w-3.5 h-3.5" />}
              {pricingSuccess ? 'Saved!' : 'Save Pricing Changes'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Black & White Simplex */}
          <div className="p-4 rounded-xl border border-slate-150 bg-[#FAF9FD]/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Black & White (A4 Simplex)</span>
              <StatusBadge status="ACTIVE" size="sm" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-500 font-mono">₹</span>
              <input
                type="number"
                step="0.10"
                value={pricing.pricePerPageBW}
                onChange={(e) => setPricing({ ...pricing, pricePerPageBW: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono font-black text-slate-900 text-base focus:outline-none focus:border-[#6D35E8]"
              />
            </div>
            <span className="text-[11px] text-slate-400 block">Default standard paper rate</span>
          </div>

          {/* Color Simplex */}
          <div className="p-4 rounded-xl border border-slate-150 bg-[#FAF9FD]/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Full Color (A4 Simplex)</span>
              <StatusBadge status="ACTIVE" size="sm" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-500 font-mono">₹</span>
              <input
                type="number"
                step="0.50"
                value={pricing.pricePerPageColor}
                onChange={(e) => setPricing({ ...pricing, pricePerPageColor: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono font-black text-slate-900 text-base focus:outline-none focus:border-[#6D35E8]"
              />
            </div>
            <span className="text-[11px] text-slate-400 block">Laser / Inkjet high resolution</span>
          </div>

          {/* Duplex B&W */}
          <div className="p-4 rounded-xl border border-slate-150 bg-[#FAF9FD]/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">B&W Duplex (Double Sided)</span>
              <StatusBadge status="ACTIVE" size="sm" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-500 font-mono">₹</span>
              <input
                type="number"
                step="0.10"
                value={pricing.pricePerPageBWDuplex}
                onChange={(e) => setPricing({ ...pricing, pricePerPageBWDuplex: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono font-black text-slate-900 text-base focus:outline-none focus:border-[#6D35E8]"
              />
            </div>
            <span className="text-[11px] text-slate-400 block">Double-sided discount rate</span>
          </div>

          {/* Graph Paper */}
          <div className="p-4 rounded-xl border border-slate-150 bg-[#FAF9FD]/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Engineering / Graph Paper</span>
              <StatusBadge status="ACTIVE" size="sm" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-500 font-mono">₹</span>
              <input
                type="number"
                step="0.10"
                value={pricing.pricePerPageGraph}
                onChange={(e) => setPricing({ ...pricing, pricePerPageGraph: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono font-black text-slate-900 text-base focus:outline-none focus:border-[#6D35E8]"
              />
            </div>
            <span className="text-[11px] text-slate-400 block">Pre-printed engineering grids</span>
          </div>
        </div>
      </div>

      {/* ── SECTION B: COUPONS & PROMOTIONS ────────────────────────────────────── */}
      <div className="bg-white border border-[#EDE9FE] rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-[#6D35E8] flex items-center justify-center">
                <Tag className="w-4 h-4" />
              </div>
              <h2 className="text-base font-extrabold text-[#19162D] tracking-tight">
                Discount Coupons & Promo Campaigns
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              Manage student promo codes and batch campaigns.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBulkGenerator(true)}
              className="px-3.5 py-2 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Bulk Generate
            </button>
            <button
              onClick={() => setShowCreateCoupon(true)}
              className="px-4 py-2 text-xs font-bold text-white bg-[#6D35E8] hover:bg-[#5b29c9] rounded-xl shadow-md shadow-purple-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New Coupon
            </button>
          </div>
        </div>

        {/* Coupons Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#FAF9FD] border-b border-[#EDE9FE] text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Coupon Code</th>
                <th className="py-3 px-4">Discount</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Expires</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingCoupons ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Loading promotional campaigns...
                  </td>
                </tr>
              ) : coupons.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No active discount coupons configured. Click "+ New Coupon" to create one.
                  </td>
                </tr>
              ) : (
                coupons.map((coupon) => (
                  <tr key={coupon.id || coupon.code} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-[#6D35E8]">
                      {coupon.code || coupon.id}
                    </td>
                    <td className="py-3.5 px-4 font-black font-mono text-emerald-600 text-sm">
                      {coupon.discountPercentage || 10}% OFF
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {coupon.isBulk ? 'Batch Voucher' : 'Campaign Code'}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={coupon.isActive !== false ? 'ACTIVE' : 'EXPIRED'} />
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                      {coupon.expiryDate ? new Date(coupon.expiryDate).toLocaleDateString() : 'No Expiry'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setCouponToDelete(coupon.code || coupon.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete Coupon"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── CREATE COUPON MODAL ────────────────────────────────────────────────── */}
      {showCreateCoupon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <form onSubmit={handleCreateCoupon} className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Create New Coupon</h3>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Code</label>
              <input
                type="text"
                required
                placeholder="e.g. EXAM25"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono font-bold uppercase focus:outline-none focus:border-[#6D35E8]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Discount (%)</label>
              <input
                type="number"
                min="1"
                max="100"
                required
                value={couponDiscount}
                onChange={(e) => setCouponDiscount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:border-[#6D35E8]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Expiry Date (Optional)</label>
              <input
                type="date"
                value={couponExpiry}
                onChange={(e) => setCouponExpiry(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-[#6D35E8]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateCoupon(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#6D35E8] hover:bg-[#5b29c9] rounded-xl shadow-xs"
              >
                Save Coupon
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── BULK GENERATOR MODAL ──────────────────────────────────────────────── */}
      {showBulkGenerator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <form onSubmit={handleBulkGenerate} className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Bulk Voucher Batch Generator</h3>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Code Prefix</label>
              <input
                type="text"
                required
                placeholder="e.g. CAMPUS"
                value={bulkPrefix}
                onChange={(e) => setBulkPrefix(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono font-bold uppercase focus:outline-none focus:border-[#6D35E8]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Number of Vouchers</label>
              <input
                type="number"
                min="1"
                max="50"
                required
                value={bulkCount}
                onChange={(e) => setBulkCount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:border-[#6D35E8]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Discount (%)</label>
              <input
                type="number"
                min="1"
                max="100"
                required
                value={bulkDiscount}
                onChange={(e) => setBulkDiscount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:border-[#6D35E8]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkGenerator(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#6D35E8] hover:bg-[#5b29c9] rounded-xl shadow-xs"
              >
                Generate Codes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── DELETE CONFIRMATION ──────────────────────────────────────────────── */}
      <ConfirmationDialog
        isOpen={Boolean(couponToDelete)}
        title="Deactivate Coupon"
        description={`Are you sure you want to deactivate and remove ${couponToDelete}? Students will no longer be able to apply this discount at checkout.`}
        confirmLabel="Deactivate Coupon"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={handleDeleteCoupon}
        onCancel={() => setCouponToDelete(null)}
      />
    </div>
  );
};
