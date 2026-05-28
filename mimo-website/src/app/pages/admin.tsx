import React, { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Building, ShieldAlert, LogOut, Loader2, Printer, CheckCircle, RefreshCcw, Tag, Home, BarChart2, Ticket, Settings, Bell, Search, User, Zap, Activity } from "lucide-react";
import api from "../api";

export default function AdminDashboard() {
  const [token, setToken] = useState(localStorage.getItem("adminToken") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [metrics, setMetrics] = useState<any>(null);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [recentPrints, setRecentPrints] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("dashboard");
  
  const [newCoupon, setNewCoupon] = useState({ code: "", discount: "", expiry: "" });
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
      const [metricsRes, couponsRes, printsRes] = await Promise.all([
        api.get(`/admin/metrics`, { headers }),
        api.get(`/admin/coupons`, { headers }),
        api.get(`/admin/recent-prints`, { headers }).catch(() => ({ data: [] })) // Graceful degradation
      ]);
      setMetrics(metricsRes.data);
      setCoupons(couponsRes.data);
      setRecentPrints(printsRes.data);
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
      setError("Invalid credentials.");
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("adminToken");
    setToken("");
    setMetrics(null);
    setCoupons([]);
    setRecentPrints([]);
  };

  const handleResetMetrics = async () => {
    if (!confirm("🚨 WARNING: Are you sure you want to RESET ALL METRICS? This cannot be undone!")) return;
    setIsResetting(true);
    try {
      await api.post(`/admin/reset-metrics`, {}, { headers: { Authorization: `Bearer ${token}` } });
      await fetchData();
      alert("✅ Metrics successfully reset.");
    } catch (err) {
      alert("Failed to reset metrics.");
    } finally {
      setIsResetting(false);
    }
  };

  const createCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/admin/coupons`, { code: newCoupon.code, discountPercentage: newCoupon.discount, expiryDate: newCoupon.expiry || null }, { headers: { Authorization: `Bearer ${token}` } });
      setNewCoupon({ code: "", discount: "", expiry: "" });
      fetchData();
    } catch (err) {
      alert("Failed to create coupon");
    }
  };

  const createBulkCoupons = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post(`/admin/coupons/bulk`, { prefix: bulkCoupon.prefix, count: bulkCoupon.count, discountPercentage: bulkCoupon.discount, expiryDate: bulkCoupon.expiry || null }, { headers: { Authorization: `Bearer ${token}` } });
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

  const revenueData = React.useMemo(() => {
    if (!metrics?.dailyRevenue) return [];
    return Object.entries(metrics.dailyRevenue).map(([date, revenue]) => ({ date, revenue })).sort((a, b) => a.date.localeCompare(b.date));
  }, [metrics]);

  const isPiOffline = () => {
    return metrics?.piStatus?.isOffline ?? true;
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-inter">
        <form onSubmit={login} className="bg-white p-10 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full max-w-md border border-slate-100">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
              <Building className="w-8 h-8" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 text-center mb-2">Welcome Back</h1>
          <p className="text-slate-500 text-sm text-center mb-8">Sign in to Mimo Command Center</p>
          
          {error && <p className="text-red-500 bg-red-50 p-3 rounded-xl mb-6 text-sm text-center font-medium">{error}</p>}
          
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Username / Email</label>
              <input type="text" placeholder="admin" className="w-full p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Password</label>
              <input type="password" placeholder="••••••••" className="w-full p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full mt-8 bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-bold transition-all flex items-center justify-center shadow-lg shadow-blue-600/20">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Login'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-inter flex">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col fixed h-full z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="p-6 flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-600/20">
            <span className="text-white font-black text-xl">M</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Mimo Admin</h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
            <Home className="w-5 h-5" /> Dashboard
          </button>
          <button onClick={() => setActiveTab('coupons')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'coupons' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
            <Ticket className="w-5 h-5" /> Coupons
          </button>
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all">
            <LogOut className="w-5 h-5" /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 ml-64 p-8">
        
        {/* Top Header */}
        <header className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">Dashboard Overview</h2>
            <p className="text-slate-500 mt-1">Check your metrics and manage the Mimo fleet.</p>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="text" placeholder="Search anything..." className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 w-64" />
            </div>
            <button onClick={handleResetMetrics} disabled={isResetting} className="flex items-center gap-2 text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-full transition-colors shadow-md">
              {isResetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
              Reset Analytics
            </button>
            <div className="w-10 h-10 bg-slate-200 rounded-full border-2 border-white shadow-sm overflow-hidden flex items-center justify-center">
              <User className="w-5 h-5 text-slate-500" />
            </div>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Total Revenue */}
              <div className="bg-white p-6 rounded-3xl shadow-[0_2px_12px_rgb(0,0,0,0.02)] border border-slate-100 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                    <span className="font-bold text-xl">₹</span>
                  </div>
                  <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full">+12.5%</span>
                </div>
                <div>
                  <p className="text-slate-500 text-sm font-medium mb-1">Total Revenue</p>
                  <h3 className="text-3xl font-bold text-slate-900">₹{metrics?.totalRevenue || "0.00"}</h3>
                </div>
              </div>

              {/* Total Orders */}
              <div className="bg-white p-6 rounded-3xl shadow-[0_2px_12px_rgb(0,0,0,0.02)] border border-slate-100 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                    <Zap className="w-6 h-6" />
                  </div>
                  <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">+34</span>
                </div>
                <div>
                  <p className="text-slate-500 text-sm font-medium mb-1">Total Orders</p>
                  <h3 className="text-3xl font-bold text-slate-900">{metrics?.totalOrders || "0"}</h3>
                </div>
              </div>

              {/* Pages Printed */}
              <div className="bg-white p-6 rounded-3xl shadow-[0_2px_12px_rgb(0,0,0,0.02)] border border-slate-100 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600">
                    <Activity className="w-6 h-6" />
                  </div>
                </div>
                <div>
                  <p className="text-slate-500 text-sm font-medium mb-1">Pages Printed</p>
                  <h3 className="text-3xl font-bold text-slate-900">{metrics?.totalPagesPrinted || "0"}</h3>
                </div>
              </div>

              {/* Pi Fleet Status */}
              <div className={`p-6 rounded-3xl shadow-[0_2px_12px_rgb(0,0,0,0.02)] border flex flex-col justify-between ${isPiOffline() ? 'bg-red-50/50 border-red-100' : 'bg-emerald-50/30 border-emerald-100'}`}>
                <div className="flex justify-between items-start mb-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isPiOffline() ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    <Printer className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${isPiOffline() ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                    <span className={`text-xs font-bold uppercase tracking-wider ${isPiOffline() ? 'text-red-700' : 'text-emerald-700'}`}>
                      {isPiOffline() ? 'Offline' : 'Online'}
                    </span>
                  </div>
                </div>
                <div>
                  <p className={`text-sm font-medium mb-1 ${isPiOffline() ? 'text-red-600/70' : 'text-emerald-700/70'}`}>Pi Fleet Status</p>
                  <h3 className={`text-xl font-bold truncate ${isPiOffline() ? 'text-red-700' : 'text-emerald-800'}`}>
                    {metrics?.piStatus?.printerStatus || "Unknown"}
                  </h3>
                </div>
              </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Left Column: Revenue Chart */}
              <div className="lg:col-span-2 space-y-8">
                <div className="bg-white p-6 rounded-3xl shadow-[0_2px_12px_rgb(0,0,0,0.02)] border border-slate-100">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-slate-900">Revenue Analytics</h2>
                    <select className="bg-slate-50 border border-slate-200 text-slate-600 text-sm rounded-lg px-3 py-1.5 outline-none focus:border-blue-500">
                      <option>This Month</option>
                      <option>Last Month</option>
                    </select>
                  </div>
                  <div className="h-72 w-full mt-4">
                    {revenueData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} dy={10} />
                          <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} dx={-10} />
                          <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px' }} />
                          <Bar dataKey="revenue" fill="#3b82f6" radius={[6, 6, 6, 6]} maxBarSize={40} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                        <BarChart2 className="w-12 h-12 mb-3 text-slate-200" />
                        <p className="text-sm font-medium">No revenue data yet.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Recent Activity Feed */}
              <div className="lg:col-span-1">
                <div className="bg-white p-6 rounded-3xl shadow-[0_2px_12px_rgb(0,0,0,0.02)] border border-slate-100 h-full max-h-[500px] flex flex-col">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-slate-900">Activity Log</h2>
                    <span className="text-sm font-medium text-blue-600 cursor-pointer hover:underline">View All</span>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                    {recentPrints.length > 0 ? recentPrints.map((job, idx) => (
                      <div key={idx} className="flex items-start gap-4 p-3 rounded-2xl hover:bg-slate-50 transition-colors">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200">
                          <Printer className="w-5 h-5 text-slate-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{job.userEmail}</p>
                          <p className="text-xs text-slate-500 truncate mt-0.5">Printed: {job.file}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${job.status === 'completed' || job.status === 'printed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {job.status.toUpperCase()}
                            </span>
                            <span className="text-xs font-semibold text-slate-700">{job.cost}</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">{job.date.split(',')[1]?.trim() || job.date}</span>
                      </div>
                    )) : (
                      <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                        <p className="text-sm">No recent activity.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {activeTab === 'coupons' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              
              {/* Create Coupons (Left) */}
              <div className="xl:col-span-1 space-y-6">
                
                <div className="bg-white p-6 rounded-3xl shadow-[0_2px_12px_rgb(0,0,0,0.02)] border border-slate-100">
                  <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2"><Tag className="w-5 h-5 text-indigo-500" /> Bulk Generator</h2>
                  <form onSubmit={createBulkCoupons} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Prefix</label>
                      <input type="text" required placeholder="e.g. CAMPUS" value={bulkCoupon.prefix} onChange={e => setBulkCoupon({...bulkCoupon, prefix: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Count</label>
                        <input type="number" required min="1" max="500" value={bulkCoupon.count} onChange={e => setBulkCoupon({...bulkCoupon, count: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Discount %</label>
                        <input type="number" required min="1" max="100" value={bulkCoupon.discount} onChange={e => setBulkCoupon({...bulkCoupon, discount: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                      </div>
                    </div>
                    <button type="submit" className="w-full mt-2 bg-indigo-600 text-white font-bold py-3.5 rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20">
                      Generate Coupons
                    </button>
                  </form>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-[0_2px_12px_rgb(0,0,0,0.02)] border border-slate-100">
                  <h2 className="text-lg font-bold text-slate-900 mb-6">Custom Code</h2>
                  <form onSubmit={createCoupon} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Specific Code</label>
                      <input type="text" required placeholder="e.g. EARLYBIRD" value={newCoupon.code} onChange={e => setNewCoupon({...newCoupon, code: e.target.value.toUpperCase()})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Discount %</label>
                      <input type="number" required min="1" max="100" value={newCoupon.discount} onChange={e => setNewCoupon({...newCoupon, discount: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none" />
                    </div>
                    <button type="submit" className="w-full mt-2 bg-slate-900 text-white font-bold py-3.5 rounded-xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20">
                      Create Coupon
                    </button>
                  </form>
                </div>

              </div>

              {/* Active Coupons Table (Right) */}
              <div className="xl:col-span-2 bg-white p-6 rounded-3xl shadow-[0_2px_12px_rgb(0,0,0,0.02)] border border-slate-100">
                <h2 className="text-lg font-bold text-slate-900 mb-6">Active Repository</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="pb-4 px-4 text-xs font-bold uppercase text-slate-400 tracking-wider">Coupon Code</th>
                        <th className="pb-4 px-4 text-xs font-bold uppercase text-slate-400 tracking-wider">Discount</th>
                        <th className="pb-4 px-4 text-xs font-bold uppercase text-slate-400 tracking-wider">Status</th>
                        <th className="pb-4 px-4 text-xs font-bold uppercase text-slate-400 tracking-wider text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {coupons.map((c, idx) => (
                        <tr key={c.id || idx} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200"><Tag className="w-4 h-4 text-slate-500" /></div>
                              <span className="font-mono font-bold text-slate-900">{c.code}</span>
                            </div>
                          </td>
                          <td className="py-4 px-4 font-bold text-indigo-600">{c.discountPercentage}% OFF</td>
                          <td className="py-4 px-4">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider ${c.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                              {c.isActive ? 'ACTIVE' : 'EXPIRED'}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-right">
                            <button onClick={() => deleteCoupon(c.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <span className="text-xs font-bold px-2">Revoke</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                      {coupons.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-16 text-center text-slate-400">
                            No active coupons found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        )}
      </main>
    </div>
  );
}
