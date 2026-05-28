import React, { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Building, ShieldAlert, LogOut, Loader2, Printer, CheckCircle, RefreshCcw, Tag, Home, BarChart2, Ticket, Settings, Bell, Search, User, Zap, Activity } from "lucide-react";
import api from "../../api";

export default function AdminDashboard() {
  const [token, setToken] = useState(localStorage.getItem("adminToken") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [coupons, setCoupons] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("coupons");
  
  const [newCoupon, setNewCoupon] = useState({ code: "", discount: "", expiry: "" });
  const [bulkCoupon, setBulkCoupon] = useState({ prefix: "", count: "10", discount: "50", expiry: "" });

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
      const [couponsRes] = await Promise.all([
        api.get(`/admin/coupons`, { headers })
      ]);
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
      setError("Invalid credentials.");
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("adminToken");
    setToken("");
    setCoupons([]);
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
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all bg-blue-50 text-blue-700">
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
            <h2 className="text-3xl font-bold text-slate-900">Coupons Management</h2>
            <p className="text-slate-500 mt-1">Manage discount codes and promotions.</p>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="w-10 h-10 bg-slate-200 rounded-full border-2 border-white shadow-sm overflow-hidden flex items-center justify-center">
              <User className="w-5 h-5 text-slate-500" />
            </div>
          </div>
        </header>

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
