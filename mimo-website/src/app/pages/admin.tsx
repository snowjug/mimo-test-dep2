import React, { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Building, ShieldAlert, LogOut, Loader2, Printer, CheckCircle, RefreshCcw, Tag } from "lucide-react";
import api from "../api";

export default function AdminDashboard() {
  const [token, setToken] = useState(localStorage.getItem("adminToken") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [metrics, setMetrics] = useState<any>(null);
  const [coupons, setCoupons] = useState<any[]>([]);
  
  // Single Coupon Form
  const [newCoupon, setNewCoupon] = useState({ code: "", discount: "", expiry: "" });
  
  // Bulk Coupon Form
  const [bulkCoupon, setBulkCoupon] = useState({ prefix: "", count: "10", discount: "50", expiry: "" });
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (token) {
      fetchData();
      const interval = setInterval(fetchData, 30000);
      return () => clearInterval(interval);
    }
  }, [token]);

  const fetchData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [metricsRes, couponsRes] = await Promise.all([
        api.get(`/admin/metrics`, { headers }),
        api.get(`/admin/coupons`, { headers })
      ]);
      setMetrics(metricsRes.data);
      setCoupons(couponsRes.data);
    } catch (err: any) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        logout();
      }
    }
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post(`/admin/login`, { email, password });
      const jwt = res.data.token;
      localStorage.setItem("adminToken", jwt);
      setToken(jwt);
    } catch (err) {
      setError("Invalid credentials. Are you sure you are an admin?");
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("adminToken");
    setToken("");
    setMetrics(null);
  };

  const handleResetMetrics = async () => {
    if (!confirm("🚨 WARNING: Are you sure you want to RESET ALL METRICS? This cannot be undone!")) return;
    setIsResetting(true);
    try {
      await api.post(`/admin/reset-metrics`, {}, { headers: { Authorization: `Bearer ${token}` } });
      await fetchData();
      alert("✅ Metrics have been successfully reset.");
    } catch (err) {
      alert("Failed to reset metrics.");
    } finally {
      setIsResetting(false);
    }
  };

  const createCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(
        `/admin/coupons`,
        { code: newCoupon.code, discountPercentage: newCoupon.discount, expiryDate: newCoupon.expiry || null },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNewCoupon({ code: "", discount: "", expiry: "" });
      fetchData();
    } catch (err) {
      alert("Failed to create coupon");
    }
  };

  const createBulkCoupons = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post(
        `/admin/coupons/bulk`,
        { 
          prefix: bulkCoupon.prefix, 
          count: bulkCoupon.count, 
          discountPercentage: bulkCoupon.discount, 
          expiryDate: bulkCoupon.expiry || null 
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setBulkCoupon({ prefix: "", count: "10", discount: "50", expiry: "" });
      alert(`Successfully generated ${res.data.count} coupons!`);
      fetchData();
    } catch (err) {
      alert("Failed to create bulk coupons");
    }
  };

  const deleteCoupon = async (code: string) => {
    if (confirm(`Delete coupon ${code}?`)) {
      try {
        await api.delete(`/admin/coupons/${code}`, { headers: { Authorization: `Bearer ${token}` } });
        fetchData();
      } catch (err) {
        alert("Failed to delete coupon");
      }
    }
  };

  // Convert dailyRevenue object to array for Recharts
  const revenueData = React.useMemo(() => {
    if (!metrics?.dailyRevenue) return [];
    return Object.entries(metrics.dailyRevenue).map(([date, revenue]) => ({
      date,
      revenue
    })).sort((a, b) => a.date.localeCompare(b.date));
  }, [metrics]);

  const isPiOffline = () => {
    if (!metrics?.piStatus?.lastSeen) return true;
    const lastSeen = new Date(metrics.piStatus.lastSeen._seconds ? metrics.piStatus.lastSeen._seconds * 1000 : metrics.piStatus.lastSeen).getTime();
    return Date.now() - lastSeen > 120000;
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#021024] to-[#052659] flex items-center justify-center p-4">
        <form onSubmit={login} className="bg-white/10 backdrop-blur-xl p-8 rounded-3xl shadow-2xl w-full max-w-md border border-white/20">
          <div className="flex justify-center mb-6">
            <Building className="w-16 h-16 text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-white text-center mb-2">Command Center</h1>
          <p className="text-blue-200/80 text-center mb-8">Authorized Personnel Only</p>
          
          {error && <p className="text-red-400 bg-red-400/10 p-3 rounded-lg mb-6 text-sm text-center font-medium border border-red-400/20">{error}</p>}
          
          <div className="space-y-4">
            <input
              type="email" placeholder="Admin Email"
              className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-blue-200/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={email} onChange={(e) => setEmail(e.target.value)} required
            />
            <input
              type="password" placeholder="Password"
              className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-blue-200/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={password} onChange={(e) => setPassword(e.target.value)} required
            />
          </div>
          <button type="submit" disabled={loading} className="w-full mt-8 bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-bold transition-all flex items-center justify-center">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Authenticate System'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F7FB] font-inter pb-12">
      
      {/* Navbar */}
      <nav className="bg-[#021024] text-white px-8 py-4 shadow-xl sticky top-0 z-50 flex justify-between items-center border-b border-blue-900/50">
        <div className="flex items-center gap-3">
          <Building className="w-6 h-6 text-blue-400" />
          <h1 className="text-2xl font-black tracking-tight">MIMO <span className="font-light opacity-80">COMMAND CENTER</span></h1>
        </div>
        <div className="flex items-center gap-6">
          <button onClick={handleResetMetrics} disabled={isResetting} className="flex items-center gap-2 text-sm font-bold bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg transition-colors">
            {isResetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            Reset Analytics
          </button>
          <button onClick={logout} className="flex items-center gap-2 text-sm font-medium text-blue-300 hover:text-white transition-colors">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 mt-8">
        
        {/* KPI Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Total Revenue</h3>
            <p className="text-4xl font-black text-[#052659]">₹{metrics?.totalRevenue?.toFixed(2) || "0.00"}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Total Orders</h3>
            <p className="text-4xl font-black text-[#052659]">{metrics?.totalOrders || "0"}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Pages Printed</h3>
            <p className="text-4xl font-black text-[#052659]">{metrics?.totalPagesPrinted || "0"}</p>
          </div>
          <div className={`p-6 rounded-2xl shadow-sm border ${isPiOffline() ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'} relative overflow-hidden`}>
            <h3 className={`text-sm font-semibold uppercase tracking-wider mb-2 ${isPiOffline() ? 'text-red-700' : 'text-green-700'}`}>Pi Fleet Status</h3>
            <div className="flex items-center gap-3">
              <Printer className={`w-10 h-10 ${isPiOffline() ? 'text-red-500' : 'text-green-600'}`} />
              <div>
                <p className={`text-2xl font-black ${isPiOffline() ? 'text-red-600' : 'text-green-700'}`}>
                  {isPiOffline() ? "OFFLINE" : "OPERATIONAL"}
                </p>
                <p className={`text-xs font-bold mt-1 ${isPiOffline() ? 'text-red-500/80' : 'text-green-700/80'}`}>
                  Status: {metrics?.piStatus?.printerStatus || "Unknown"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Analytics Chart */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 mb-8">
          <h2 className="text-xl font-bold text-[#021024] mb-2">Revenue Growth</h2>
          <p className="text-slate-500 text-sm mb-8">Daily real payments processed via Cashfree</p>
          <div className="h-80 w-full">
            {revenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={60} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                <ShieldAlert className="w-12 h-12 mb-3 opacity-20" />
                <p>No revenue data recorded yet.</p>
              </div>
            )}
          </div>
        </div>

        {/* Coupons Module */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          
          <div className="lg:col-span-1 space-y-6">
            {/* Bulk Generator */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-2 mb-6">
                <Tag className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-[#021024]">Bulk Generator</h2>
              </div>
              <form onSubmit={createBulkCoupons} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Prefix</label>
                  <input type="text" required placeholder="e.g. CAMPUS" value={bulkCoupon.prefix} onChange={e => setBulkCoupon({...bulkCoupon, prefix: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Count</label>
                    <input type="number" required min="1" max="500" value={bulkCoupon.count} onChange={e => setBulkCoupon({...bulkCoupon, count: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Discount %</label>
                    <input type="number" required min="1" max="100" value={bulkCoupon.discount} onChange={e => setBulkCoupon({...bulkCoupon, discount: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                  </div>
                </div>
                <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors">
                  Generate Bulk Coupons
                </button>
              </form>
            </div>

            {/* Single Generator */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-bold text-[#021024] mb-6">Create Custom Coupon</h2>
              <form onSubmit={createCoupon} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Specific Code</label>
                  <input type="text" required placeholder="e.g. EARLYBIRD" value={newCoupon.code} onChange={e => setNewCoupon({...newCoupon, code: e.target.value.toUpperCase()})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Discount %</label>
                  <input type="number" required min="1" max="100" value={newCoupon.discount} onChange={e => setNewCoupon({...newCoupon, discount: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                </div>
                <button type="submit" className="w-full bg-[#052659] text-white font-bold py-3 rounded-xl hover:bg-blue-900 transition-colors">
                  Create Coupon
                </button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-[#021024] mb-6">Active Coupons Repository</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-100 text-xs font-black uppercase text-slate-400 tracking-wider">
                    <th className="pb-3 px-4">Code</th>
                    <th className="pb-3 px-4">Discount</th>
                    <th className="pb-3 px-4">Status</th>
                    <th className="pb-3 px-4">Action</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {coupons.map(c => (
                    <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-4 font-mono font-bold text-slate-900">{c.code}</td>
                      <td className="py-4 px-4 font-black text-indigo-600">{c.discountPercentage}% OFF</td>
                      <td className="py-4 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {c.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <button onClick={() => deleteCoupon(c.id)} className="text-red-500 text-xs font-bold hover:text-red-700 underline">Revoke</button>
                      </td>
                    </tr>
                  ))}
                  {coupons.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-500">
                        No coupons found in the repository.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
