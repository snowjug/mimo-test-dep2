import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import {
  Building, LogOut, Loader2, Printer, RefreshCcw, Tag,
  Home, BarChart2, Ticket, Search, User, Zap, Activity, Settings, Cpu, Droplets, Layers, Save, CheckCircle2
} from 'lucide-react';
import api from './api';

export default function AdminDashboard() {
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [metrics, setMetrics] = useState<any>(null);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [recentPrints, setRecentPrints] = useState<any[]>([]);
  const [pricing, setPricing] = useState({ pricePerPageBW: 2.30, pricePerPageColor: 10.00 });
  const [hardware, setHardware] = useState<any>({});
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [newCoupon, setNewCoupon] = useState({ code: '', discount: '', expiry: '' });
  const [bulkCoupon, setBulkCoupon] = useState({ prefix: '', count: '10', discount: '50', expiry: '' });
  const [isResetting, setIsResetting] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedSettings, setSavedSettings] = useState(false);

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
      const [metricsRes, couponsRes, printsRes, settingsRes, hardwareRes] = await Promise.all([
        api.get('/admin/metrics', { headers }),
        api.get('/admin/coupons', { headers }),
        api.get('/admin/recent-prints', { headers }).catch(() => ({ data: [] })),
        api.get('/admin/settings', { headers }).catch(() => ({ data: { pricePerPageBW: 2.30, pricePerPageColor: 10.0 } })),
        api.get('/admin/hardware', { headers }).catch(() => ({ data: {} }))
      ]);
      setMetrics(metricsRes.data);
      setCoupons(couponsRes.data);
      setRecentPrints(printsRes.data);
      setPricing({
        pricePerPageBW: settingsRes.data.pricePerPageBW || 2.30,
        pricePerPageColor: settingsRes.data.pricePerPageColor || 10.00
      });
      setHardware(hardwareRes.data);
    } catch (err: any) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        logout();
      }
    }
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/admin/login', { email, password });
      const jwt = res.data.token;
      localStorage.setItem('adminToken', jwt);
      setToken(jwt);
    } catch {
      setError('Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('adminToken');
    setToken('');
    setMetrics(null);
    setCoupons([]);
    setRecentPrints([]);
  };

  const handleResetMetrics = async () => {
    if (!confirm('🚨 WARNING: Are you sure you want to RESET ALL METRICS? This cannot be undone!')) return;
    setIsResetting(true);
    try {
      await api.post('/admin/reset-metrics', {}, { headers: { Authorization: `Bearer ${token}` } });
      await fetchData();
      alert('✅ Metrics successfully reset.');
    } catch {
      alert('Failed to reset metrics.');
    } finally {
      setIsResetting(false);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.post('/admin/settings', pricing, { headers: { Authorization: `Bearer ${token}` } });
      setSavedSettings(true);
      setTimeout(() => setSavedSettings(false), 3000);
      fetchData();
    } catch (err) {
      alert('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const updateHardwareLevel = async (kioskId: string, updates: any) => {
    try {
      await api.post('/admin/hardware', { updates: { [kioskId]: updates } }, { headers: { Authorization: `Bearer ${token}` } });
      fetchData();
    } catch (err) {
      alert('Failed to update hardware');
    }
  };

  const createCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/coupons', {
        code: newCoupon.code,
        discountPercentage: newCoupon.discount,
        expiryDate: newCoupon.expiry || null,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setNewCoupon({ code: '', discount: '', expiry: '' });
      fetchData();
    } catch {
      alert('Failed to create coupon');
    }
  };

  const createBulkCoupons = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/coupons/bulk', {
        prefix: bulkCoupon.prefix,
        count: bulkCoupon.count,
        discountPercentage: bulkCoupon.discount,
        expiryDate: bulkCoupon.expiry || null,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setBulkCoupon({ prefix: '', count: '10', discount: '50', expiry: '' });
      alert(`Successfully generated ${res.data.count} coupons!`);
      fetchData();
    } catch {
      alert('Failed to create bulk coupons');
    }
  };

  const deleteCoupon = async (code: string) => {
    if (confirm(`Delete coupon ${code}?`)) {
      try {
        await api.delete(`/admin/coupons/${code}`, { headers: { Authorization: `Bearer ${token}` } });
        fetchData();
      } catch {
        alert('Failed to delete coupon');
      }
    }
  };

  const revenueData = React.useMemo(() => {
    if (!metrics?.dailyRevenue) return [];
    return Object.entries(metrics.dailyRevenue)
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [metrics]);

  const isPiOffline = () => metrics?.piStatus?.isOffline ?? true;

  const getPercentageColor = (val: number) => {
    if (val > 50) return 'bg-emerald-500';
    if (val > 20) return 'bg-amber-500';
    return 'bg-red-500';
  };

  // ─── LOGIN SCREEN ─────────────────────────────────────────────────────────
  if (!token) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
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
              <input
                type="text"
                placeholder="admin"
                className="w-full p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-8 bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-bold transition-all flex items-center justify-center shadow-lg shadow-blue-600/20 disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Login'}
          </button>
        </form>
      </div>
    );
  }

  // ─── MAIN DASHBOARD ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">

      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col fixed h-full z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="p-6 flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-600/20">
            <span className="text-white font-black text-xl">M</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Mimo Admin</h1>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
          >
            <Home className="w-5 h-5" /> Dashboard
          </button>
          <button
            onClick={() => setActiveTab('hardware')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'hardware' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
          >
            <Cpu className="w-5 h-5" /> Hardware Logs
          </button>
          <button
            onClick={() => setActiveTab('coupons')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'coupons' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
          >
            <Ticket className="w-5 h-5" /> Coupons
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'settings' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
          >
            <Settings className="w-5 h-5" /> Settings
          </button>
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <LogOut className="w-5 h-5" /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8">

        {/* Header */}
        <header className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 capitalize">{activeTab} Overview</h2>
            <p className="text-slate-500 mt-1">Manage the Mimo ecosystem and live analytics.</p>
          </div>
          <div className="flex items-center gap-6">
            <button
              onClick={handleResetMetrics}
              disabled={isResetting}
              className="flex items-center gap-2 text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-full transition-colors shadow-md disabled:opacity-60"
            >
              {isResetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
              Reset Analytics
            </button>
            <div className="w-10 h-10 bg-slate-200 rounded-full border-2 border-white shadow-sm overflow-hidden flex items-center justify-center">
              <User className="w-5 h-5 text-slate-500" />
            </div>
          </div>
        </header>

        {/* ─── DASHBOARD TAB ─────────────────────────── */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in">

            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Revenue */}
              <div className="bg-white p-6 rounded-3xl shadow-[0_2px_12px_rgb(0,0,0,0.02)] border border-slate-100 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                    <span className="font-bold text-xl">₹</span>
                  </div>
                </div>
                <div>
                  <p className="text-slate-500 text-sm font-medium mb-1">Total Revenue</p>
                  <h3 className="text-3xl font-bold text-slate-900">₹{(metrics?.totalRevenue || 0).toFixed(2)}</h3>
                </div>
              </div>

              {/* Orders */}
              <div className="bg-white p-6 rounded-3xl shadow-[0_2px_12px_rgb(0,0,0,0.02)] border border-slate-100 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                    <Zap className="w-6 h-6" />
                  </div>
                </div>
                <div>
                  <p className="text-slate-500 text-sm font-medium mb-1">Paid Pages</p>
                  <h3 className="text-3xl font-bold text-slate-900">{(metrics?.totalPagesPrinted || 0) - (metrics?.totalFreePages || 0)}</h3>
                </div>
              </div>

              {/* Free Pages */}
              <div className="bg-white p-6 rounded-3xl shadow-[0_2px_12px_rgb(0,0,0,0.02)] border border-slate-100 flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-bl-full -mr-10 -mt-10" />
                <div className="flex justify-between items-start mb-4 relative">
                  <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
                    <Ticket className="w-6 h-6" />
                  </div>
                </div>
                <div className="relative">
                  <p className="text-slate-500 text-sm font-medium mb-1">Zero-Rupee Pages (Free)</p>
                  <h3 className="text-3xl font-bold text-slate-900">{metrics?.totalFreePages || '0'}</h3>
                </div>
              </div>

              {/* Total Pages */}
              <div className="bg-white p-6 rounded-3xl shadow-[0_2px_12px_rgb(0,0,0,0.02)] border border-slate-100 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600">
                    <Activity className="w-6 h-6" />
                  </div>
                </div>
                <div>
                  <p className="text-slate-500 text-sm font-medium mb-1">Total Lifetime Pages</p>
                  <h3 className="text-3xl font-bold text-slate-900">{metrics?.totalPagesPrinted || '0'}</h3>
                </div>
              </div>
            </div>

            {/* Charts & Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
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
                
                {/* Print Modality */}
                <div className="grid grid-cols-2 gap-6 mt-8">
                  <div className="bg-white p-6 rounded-3xl shadow-[0_2px_12px_rgb(0,0,0,0.02)] border border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">B&W Pages Printed</p>
                      <h3 className="text-2xl font-bold text-slate-900 mt-1">{metrics?.totalBwPages || 0}</h3>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                      <div className="w-4 h-4 rounded-full bg-slate-800" />
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-3xl shadow-[0_2px_12px_rgb(0,0,0,0.02)] border border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">Color Pages Printed</p>
                      <h3 className="text-2xl font-bold text-slate-900 mt-1">{metrics?.totalColorPages || 0}</h3>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center">
                      <div className="w-4 h-4 rounded-full bg-rose-500" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Activity Feed */}
              <div className="lg:col-span-1">
                <div className="bg-white p-6 rounded-3xl shadow-[0_2px_12px_rgb(0,0,0,0.02)] border border-slate-100 h-full max-h-[600px] flex flex-col">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-slate-900">Activity Log</h2>
                  </div>
                  <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                    {recentPrints.length > 0 ? recentPrints.map((job, idx) => (
                      <div key={idx} className="flex items-start gap-4 p-3 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200">
                          <Printer className="w-5 h-5 text-slate-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{job.userEmail}</p>
                          <p className="text-xs text-slate-500 truncate mt-0.5">Printed: {job.file}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${job.status === 'completed' || job.status === 'printed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {job.status?.toUpperCase()}
                            </span>
                            {job.cost === 0 || job.cost === "0" ? (
                               <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">FREE</span>
                            ) : (
                               <span className="text-xs font-semibold text-slate-700">₹{job.cost}</span>
                            )}
                          </div>
                        </div>
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

        {/* ─── HARDWARE TAB ─────────────────────────── */}
        {activeTab === 'hardware' && (
          <div className="space-y-8 animate-in fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* KIOSK 1: Brother */}
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-center mb-6">
                   <div>
                     <h2 className="text-2xl font-black text-slate-900">CV-001 (B&W)</h2>
                     <p className="text-sm text-slate-500 font-medium">Brother HL-L2440DW</p>
                   </div>
                   <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> ONLINE
                   </span>
                </div>
                
                <div className="space-y-6">
                  {/* Toner */}
                  <div>
                     <div className="flex justify-between text-sm font-bold mb-2">
                       <span className="flex items-center gap-2 text-slate-700"><Droplets className="w-4 h-4" /> Toner Level</span>
                       <span className="text-slate-900">{hardware['CV-001']?.tonerLevel || 0}%</span>
                     </div>
                     <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                       <div className={`h-3 rounded-full transition-all duration-1000 ${getPercentageColor(hardware['CV-001']?.tonerLevel || 0)}`} style={{ width: `\${hardware['CV-001']?.tonerLevel || 0}%` }}></div>
                     </div>
                  </div>
                  
                  {/* Paper */}
                  <div>
                     <div className="flex justify-between text-sm font-bold mb-2">
                       <span className="flex items-center gap-2 text-slate-700"><Layers className="w-4 h-4" /> Paper Ream</span>
                       <span className="text-slate-900">{hardware['CV-001']?.paperLevel || 0} pages</span>
                     </div>
                     <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                       <div className={`h-3 rounded-full transition-all duration-1000 ${getPercentageColor((hardware['CV-001']?.paperLevel || 0)/5)}`} style={{ width: `\${(hardware['CV-001']?.paperLevel || 0)/5}%` }}></div>
                     </div>
                  </div>
                  
                  <div className="pt-4 border-t border-slate-100 flex gap-3">
                     <button onClick={() => updateHardwareLevel('CV-001', { tonerLevel: 100 })} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm transition-colors">Refill Toner</button>
                     <button onClick={() => updateHardwareLevel('CV-001', { paperLevel: 500 })} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm transition-colors">Add Paper (500)</button>
                  </div>
                </div>
              </div>

              {/* KIOSK 2: Epson */}
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-center mb-6">
                   <div>
                     <h2 className="text-2xl font-black text-slate-900">SV-002-COLOR</h2>
                     <p className="text-sm text-slate-500 font-medium">Epson EcoTank L3250</p>
                   </div>
                   <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> ONLINE
                   </span>
                </div>
                
                <div className="space-y-6">
                  {/* Ink */}
                  <div>
                     <div className="flex justify-between text-sm font-bold mb-2">
                       <span className="flex items-center gap-2 text-slate-700"><Droplets className="w-4 h-4 text-cyan-500" /> Cyan/Magenta/Yellow Ink</span>
                       <span className="text-slate-900">{hardware['SV-002-COLOR']?.inkLevel || 0}%</span>
                     </div>
                     <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                       <div className={`h-3 rounded-full transition-all duration-1000 ${getPercentageColor(hardware['SV-002-COLOR']?.inkLevel || 0)}`} style={{ width: `\${hardware['SV-002-COLOR']?.inkLevel || 0}%` }}></div>
                     </div>
                  </div>
                  
                  {/* Paper */}
                  <div>
                     <div className="flex justify-between text-sm font-bold mb-2">
                       <span className="flex items-center gap-2 text-slate-700"><Layers className="w-4 h-4" /> Paper Ream</span>
                       <span className="text-slate-900">{hardware['SV-002-COLOR']?.paperLevel || 0} pages</span>
                     </div>
                     <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                       <div className={`h-3 rounded-full transition-all duration-1000 ${getPercentageColor((hardware['SV-002-COLOR']?.paperLevel || 0)/5)}`} style={{ width: `\${(hardware['SV-002-COLOR']?.paperLevel || 0)/5}%` }}></div>
                     </div>
                  </div>
                  
                  <div className="pt-4 border-t border-slate-100 flex gap-3">
                     <button onClick={() => updateHardwareLevel('SV-002-COLOR', { inkLevel: 100 })} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm transition-colors">Refill Ink Tanks</button>
                     <button onClick={() => updateHardwareLevel('SV-002-COLOR', { paperLevel: 500 })} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm transition-colors">Add Paper (500)</button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ─── SETTINGS TAB ─────────────────────────── */}
        {activeTab === 'settings' && (
          <div className="space-y-8 animate-in fade-in max-w-3xl">
            <div className="bg-white p-8 rounded-3xl shadow-[0_2px_12px_rgb(0,0,0,0.02)] border border-slate-100">
               <h2 className="text-xl font-bold text-slate-900 mb-2">Pricing Configuration</h2>
               <p className="text-sm text-slate-500 mb-8">Update the per-page printing costs. These changes will instantly reflect on the frontend and in the Cashfree payment gateway.</p>
               
               <div className="space-y-6">
                 <div className="grid grid-cols-2 gap-6">
                   <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                         <div className="w-3 h-3 rounded-full bg-slate-800" /> B&W Price (₹)
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">₹</span>
                        <input 
                           type="number" 
                           step="0.10"
                           value={pricing.pricePerPageBW}
                           onChange={(e) => setPricing({...pricing, pricePerPageBW: parseFloat(e.target.value)})}
                           className="w-full pl-10 pr-4 py-4 rounded-xl bg-white border border-slate-200 text-xl font-black text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        />
                      </div>
                   </div>
                   
                   <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                         <div className="w-3 h-3 rounded-full bg-gradient-to-r from-cyan-400 via-pink-500 to-yellow-400" /> Color Price (₹)
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">₹</span>
                        <input 
                           type="number" 
                           step="0.10"
                           value={pricing.pricePerPageColor}
                           onChange={(e) => setPricing({...pricing, pricePerPageColor: parseFloat(e.target.value)})}
                           className="w-full pl-10 pr-4 py-4 rounded-xl bg-white border border-slate-200 text-xl font-black text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        />
                      </div>
                   </div>
                 </div>
                 
                 <div className="pt-6 border-t border-slate-100 flex justify-end">
                    <button 
                      onClick={saveSettings}
                      disabled={savingSettings}
                      className={`flex items-center gap-2 font-bold px-8 py-4 rounded-xl transition-all shadow-lg ${savedSettings ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'}`}
                    >
                      {savingSettings ? <Loader2 className="w-5 h-5 animate-spin" /> : savedSettings ? <CheckCircle2 className="w-5 h-5" /> : <Save className="w-5 h-5" />}
                      {savedSettings ? 'Saved Successfully' : 'Save Pricing Details'}
                    </button>
                 </div>
               </div>
            </div>
          </div>
        )}

        {/* ─── COUPONS TAB ─────────────────────────── */}
        {activeTab === 'coupons' && (
          <div className="space-y-8 animate-in fade-in">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
               {/* Same coupon code from original App.tsx */}
               <div className="xl:col-span-1 space-y-6">
                <div className="bg-white p-6 rounded-3xl shadow-[0_2px_12px_rgb(0,0,0,0.02)] border border-slate-100">
                  <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2"><Tag className="w-5 h-5 text-indigo-500" /> Bulk Generator</h2>
                  <form onSubmit={createBulkCoupons} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Prefix</label>
                      <input type="text" required placeholder="e.g. CAMPUS" value={bulkCoupon.prefix} onChange={e => setBulkCoupon({ ...bulkCoupon, prefix: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Count</label>
                        <input type="number" required min="1" max="500" value={bulkCoupon.count} onChange={e => setBulkCoupon({ ...bulkCoupon, count: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Discount %</label>
                        <input type="number" required min="1" max="100" value={bulkCoupon.discount} onChange={e => setBulkCoupon({ ...bulkCoupon, discount: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
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
                      <input type="text" required placeholder="e.g. EARLYBIRD" value={newCoupon.code} onChange={e => setNewCoupon({ ...newCoupon, code: e.target.value.toUpperCase() })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Discount %</label>
                      <input type="number" required min="1" max="100" value={newCoupon.discount} onChange={e => setNewCoupon({ ...newCoupon, discount: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none" />
                    </div>
                    <button type="submit" className="w-full mt-2 bg-slate-900 text-white font-bold py-3.5 rounded-xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20">
                      Create Coupon
                    </button>
                  </form>
                </div>
              </div>

              {/* Right: Coupon table */}
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
                          <td colSpan={4} className="py-16 text-center text-slate-400">No active coupons found.</td>
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
