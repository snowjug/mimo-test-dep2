import React, { useState } from 'react';
import {
  CheckCircle2,
  Save,
  Loader2,
  Search,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface Transaction {
  id: string;
  orderId: string;
  user: string;
  kiosk: string;
  pages: number;
  type: string;
  amount: number;
  paymentMethod: 'UPI' | 'Card' | 'Wallet';
  status: 'SUCCESS' | 'REFUNDED' | 'PENDING';
  timestamp: string;
}

const INITIAL_TRANSACTIONS: Transaction[] = [
  { id: 'TXN-8801', orderId: 'ORD-9912', user: 'rahul.s@campus.edu', kiosk: 'MIMO 1', pages: 7, type: 'B&W', amount: 16.10, paymentMethod: 'UPI', status: 'SUCCESS', timestamp: '2m ago' },
  { id: 'TXN-8800', orderId: 'ORD-9911', user: 'priya.k@campus.edu', kiosk: 'MIMO 2', pages: 2, type: 'Color', amount: 20.00, paymentMethod: 'Card', status: 'SUCCESS', timestamp: '14m ago' },
  { id: 'TXN-8799', orderId: 'ORD-9910', user: 'arjun.v@campus.edu', kiosk: 'MIMO 2', pages: 14, type: 'B&W', amount: 32.20, paymentMethod: 'UPI', status: 'PENDING', timestamp: '28m ago' },
  { id: 'TXN-8798', orderId: 'ORD-9909', user: 'sneha.m@campus.edu', kiosk: 'MIMO 1', pages: 1, type: 'Color', amount: 10.00, paymentMethod: 'Wallet', status: 'SUCCESS', timestamp: '45m ago' },
  { id: 'TXN-8797', orderId: 'ORD-9908', user: 'vikram.r@campus.edu', kiosk: 'MIMO 3', pages: 22, type: 'B&W', amount: 50.60, paymentMethod: 'UPI', status: 'SUCCESS', timestamp: '1h ago' },
  { id: 'TXN-8796', orderId: 'ORD-9907', user: 'ananya.d@campus.edu', kiosk: 'MIMO 4', pages: 8, type: 'B&W', amount: 18.40, paymentMethod: 'UPI', status: 'REFUNDED', timestamp: '2h ago' },
];

export const FinancePage: React.FC = () => {
  const { isDark } = useTheme();
  const [pricing, setPricing] = useState({
    pricePerPageBW: 2.30,
    pricePerPageColor: 10.00,
    pricePerPageA4: 2.30,
    pricePerPageGraph: 2.00,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedSettings, setSavedSettings] = useState(false);

  const [coupons, setCoupons] = useState([
    { id: '1', code: 'CAMPUS50', discount: 50, isActive: true },
    { id: '2', code: 'EXAM100', discount: 100, isActive: true },
    { id: '3', code: 'WELCOME10', discount: 10, isActive: true },
  ]);
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponDiscount, setNewCouponDiscount] = useState('');

  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [searchTxn, setSearchTxn] = useState('');

  const handleSavePricing = () => {
    setSavingSettings(true);
    setTimeout(() => {
      setSavingSettings(false);
      setSavedSettings(true);
      setTimeout(() => setSavedSettings(false), 3000);
    }, 600);
  };

  const handleAddCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCouponCode || !newCouponDiscount) return;
    setCoupons([
      ...coupons,
      { id: Date.now().toString(), code: newCouponCode.toUpperCase(), discount: Number(newCouponDiscount), isActive: true },
    ]);
    setNewCouponCode('');
    setNewCouponDiscount('');
  };

  const handleRevokeCoupon = (id: string) => {
    setCoupons(coupons.filter((c) => c.id !== id));
  };

  const handleRefund = (id: string) => {
    setTransactions(
      transactions.map((t) => (t.id === id ? { ...t, status: 'REFUNDED' } : t))
    );
  };

  const filteredTxns = transactions.filter(
    (t) =>
      t.id.toLowerCase().includes(searchTxn.toLowerCase()) ||
      t.orderId.toLowerCase().includes(searchTxn.toLowerCase()) ||
      t.user.toLowerCase().includes(searchTxn.toLowerCase())
  );

  return (
    <div className="w-full space-y-6 pb-12 select-none font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className={`text-2xl sm:text-3xl font-black tracking-tight ${
            isDark ? 'text-white' : 'text-[#1e1b4b]'
          }`}>
            Finance & Billing Hub
          </h1>
          <p className={`text-xs sm:text-sm font-medium mt-0.5 ${
            isDark ? 'text-slate-400' : 'text-gray-500'
          }`}>
            Campus print billing collections, transaction records, refunds, and promo discounts
          </p>
        </div>

        <span className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider shadow-sm self-start sm:self-auto border ${
          isDark
            ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-400'
            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
        }`}>
          ● Gateway Settlement Live
        </span>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`border rounded-2xl p-5 shadow-sm ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">TOTAL REVENUE</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">+14.2%</span>
          </div>
          <div className="mt-3">
            <div className={`text-3xl font-black ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>₹14,250.00</div>
            <p className="text-xs text-gray-400 mt-0.5">Daily print billing</p>
          </div>
        </div>

        <div className={`border rounded-2xl p-5 shadow-sm ${
          isDark ? 'bg-[#1e293b] border-amber-500/30' : 'bg-white border-amber-200/80'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">VALUE AT RISK</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-amber-400 border border-amber-500/30">2 AT RISK</span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-amber-500">₹580.00</div>
            <p className="text-xs text-gray-400 mt-0.5">Pending user confirmation</p>
          </div>
        </div>

        <div className={`border rounded-2xl p-5 shadow-sm ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">REFUND CLAIMS</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500/15 text-red-400 border border-red-500/30">1 Settled</span>
          </div>
          <div className="mt-3">
            <div className={`text-3xl font-black ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>₹18.40</div>
            <p className="text-xs text-gray-400 mt-0.5">Paper jam autorefund</p>
          </div>
        </div>

        <div className={`border rounded-2xl p-5 shadow-sm ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">PROMO SAVINGS</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/15 text-purple-400 border border-purple-500/30">Active</span>
          </div>
          <div className="mt-3">
            <div className={`text-3xl font-black ${isDark ? 'text-purple-400' : 'text-[#7c3aed]'}`}>₹420.00</div>
            <p className="text-xs text-gray-400 mt-0.5">Discount coupons applied</p>
          </div>
        </div>
      </div>

      {/* Pricing & Coupon Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Pricing Rules (7 cols) */}
        <div className={`lg:col-span-7 border rounded-2xl p-6 shadow-sm flex flex-col justify-between ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div>
            <h2 className={`text-base font-bold mb-1 ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>Print Pricing Configuration</h2>
            <p className="text-xs text-gray-400 mb-5">Set campus rates per sheet and printing mode</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'B&W Print Rate', key: 'pricePerPageBW' },
                { label: 'Color Print Rate', key: 'pricePerPageColor' },
                { label: 'A4 Blank Sheet Rate', key: 'pricePerPageA4' },
                { label: 'Graph Sheet Rate', key: 'pricePerPageGraph' },
              ].map((f) => (
                <div key={f.key} className={`border rounded-xl p-3.5 ${
                  isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-gray-50/80 border-gray-200'
                }`}>
                  <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-1.5">
                    {f.label}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-400">₹</span>
                    <input
                      type="number"
                      step="0.10"
                      value={(pricing as any)[f.key]}
                      onChange={(e) => setPricing({ ...pricing, [f.key]: parseFloat(e.target.value) || 0 })}
                      className={`w-full pl-8 pr-3 py-2 border rounded-lg text-base font-black focus:outline-none ${
                        isDark
                          ? 'bg-slate-900 border-slate-700 text-white focus:border-[#8b5cf6]'
                          : 'bg-white border-gray-200 text-[#1e1b4b] focus:border-[#7c3aed]'
                      }`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`flex justify-end pt-5 mt-4 border-t ${isDark ? 'border-slate-700' : 'border-gray-100'}`}>
            <button
              onClick={handleSavePricing}
              disabled={savingSettings}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold text-xs shadow-md shadow-purple-500/20 transition-all cursor-pointer"
            >
              {savingSettings ? <Loader2 size={14} className="animate-spin" /> : savedSettings ? <CheckCircle2 size={14} /> : <Save size={14} />}
              {savedSettings ? 'Pricing Saved!' : 'Save Pricing Rules'}
            </button>
          </div>
        </div>

        {/* Coupons (5 cols) */}
        <div className={`lg:col-span-5 border rounded-2xl p-6 shadow-sm flex flex-col justify-between ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div>
            <h2 className={`text-base font-bold mb-1 ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>Promotional Coupons</h2>
            <p className="text-xs text-gray-400 mb-4">Generate and revoke student discount codes</p>

            {/* Add Coupon Form */}
            <form onSubmit={handleAddCoupon} className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="CODE (e.g. SEM2026)"
                value={newCouponCode}
                onChange={(e) => setNewCouponCode(e.target.value.toUpperCase())}
                className={`flex-1 px-3 py-1.5 border rounded-xl text-xs font-bold uppercase focus:outline-none ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-200 text-[#1e1b4b]'
                }`}
              />
              <input
                type="number"
                placeholder="%"
                value={newCouponDiscount}
                onChange={(e) => setNewCouponDiscount(e.target.value)}
                className={`w-16 px-2 py-1.5 border rounded-xl text-xs font-bold text-center focus:outline-none ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-200 text-[#1e1b4b]'
                }`}
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-[#7c3aed] text-white rounded-xl text-xs font-bold hover:bg-[#6d28d9] cursor-pointer"
              >
                + Add
              </button>
            </form>

            {/* Coupons List */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {coupons.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center justify-between p-2.5 border rounded-xl text-xs ${
                    isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-gray-50 border-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`font-mono font-black ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>{c.code}</span>
                    <span className="font-bold text-[#a78bfa]">{c.discount}% OFF</span>
                  </div>
                  <button
                    onClick={() => handleRevokeCoupon(c.id)}
                    className="text-red-500 font-bold hover:underline text-[11px] cursor-pointer"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Records Table */}
      <div className={`border rounded-2xl p-6 shadow-sm space-y-4 ${
        isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className={`text-base font-bold ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>Billing & Transaction Ledger</h2>
            <p className="text-xs text-gray-400 mt-0.5">Real-time payment settlements from kiosk terminals</p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by Txn ID, Order, User..."
              value={searchTxn}
              onChange={(e) => setSearchTxn(e.target.value)}
              className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl transition-all focus:outline-none ${
                isDark
                  ? 'bg-slate-800/80 border border-slate-700 text-white placeholder-slate-400 focus:border-[#8b5cf6]'
                  : 'bg-gray-50 border border-gray-200 text-[#1e1b4b] placeholder-gray-400 focus:border-[#7c3aed] focus:bg-white'
              }`}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className={`border-b text-[10px] uppercase font-extrabold tracking-wider ${
                isDark ? 'border-slate-700 text-slate-400' : 'border-gray-100 text-gray-400'
              }`}>
                <th className="pb-3 pl-2">Txn ID</th>
                <th className="pb-3">Order Code</th>
                <th className="pb-3">Student User</th>
                <th className="pb-3">Kiosk Node</th>
                <th className="pb-3">Pages</th>
                <th className="pb-3">Amount</th>
                <th className="pb-3">Payment</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 pr-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className={`divide-y font-medium ${isDark ? 'divide-slate-700/60' : 'divide-gray-100'}`}>
              {filteredTxns.map((t) => (
                <tr key={t.id} className="hover:bg-purple-500/10 transition-colors">
                  <td className="py-3 pl-2 font-mono font-bold text-[#a78bfa]">{t.id}</td>
                  <td className={`py-3 font-mono font-semibold ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>{t.orderId}</td>
                  <td className="py-3 text-gray-400 max-w-[150px] truncate">{t.user}</td>
                  <td className={`py-3 font-semibold ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>{t.kiosk}</td>
                  <td className={`py-3 font-bold ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>{t.pages} pgs ({t.type})</td>
                  <td className={`py-3 font-black ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>₹{t.amount.toFixed(2)}</td>
                  <td className="py-3 text-gray-400 font-semibold">{t.paymentMethod}</td>
                  <td className="py-3 whitespace-nowrap">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                        t.status === 'SUCCESS'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : t.status === 'PENDING'
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : 'bg-gray-500/15 text-gray-400 border border-gray-500/30'
                      }`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="py-3 pr-2 text-right whitespace-nowrap">
                    {t.status !== 'REFUNDED' && (
                      <button
                        onClick={() => handleRefund(t.id)}
                        className="text-xs font-bold text-[#a78bfa] hover:underline cursor-pointer"
                      >
                        Refund
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
