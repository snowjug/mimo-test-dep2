import React, { useState, useEffect } from "react";
import axios from "axios";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// Using the same API base url configured globally
const API_BASE = "https://us-central1-mimo-v2-11868.cloudfunctions.net/api";

export default function AdminDashboard() {
  const [token, setToken] = useState(localStorage.getItem("adminToken") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const [metrics, setMetrics] = useState<any>(null);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [newCoupon, setNewCoupon] = useState({ code: "", discount: "", expiry: "" });

  useEffect(() => {
    if (token) {
      fetchData();
      const interval = setInterval(fetchData, 30000); // refresh every 30s
      return () => clearInterval(interval);
    }
  }, [token]);

  const fetchData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [metricsRes, couponsRes] = await Promise.all([
        axios.get(`${API_BASE}/admin/metrics`, { headers }),
        axios.get(`${API_BASE}/admin/coupons`, { headers })
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
    try {
      const res = await axios.post(`${API_BASE}/admin/login`, { email, password });
      const jwt = res.data.token;
      localStorage.setItem("adminToken", jwt);
      setToken(jwt);
    } catch (err) {
      setError("Invalid credentials");
    }
  };

  const logout = () => {
    localStorage.removeItem("adminToken");
    setToken("");
    setMetrics(null);
  };

  const createCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(
        `${API_BASE}/admin/coupons`,
        { code: newCoupon.code, discountPercentage: newCoupon.discount, expiryDate: newCoupon.expiry || null },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNewCoupon({ code: "", discount: "", expiry: "" });
      fetchData();
    } catch (err) {
      alert("Failed to create coupon");
    }
  };

  const deleteCoupon = async (code: string) => {
    if (confirm(`Delete coupon ${code}?`)) {
      try {
        await axios.delete(`${API_BASE}/admin/coupons/${code}`, { headers: { Authorization: `Bearer ${token}` } });
        fetchData();
      } catch (err) {
        alert("Failed to delete coupon");
      }
    }
  };

  // Check if Pi is offline (no heartbeat in 2 minutes)
  const isPiOffline = () => {
    if (!metrics?.piStatus?.lastSeen) return true;
    const lastSeen = new Date(metrics.piStatus.lastSeen._seconds * 1000).getTime();
    return Date.now() - lastSeen > 120000;
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-[#FDF9F1] flex items-center justify-center p-4">
        <form onSubmit={login} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-[#2D332F]/10">
          <h1 className="text-2xl font-bold text-[#2D332F] mb-6">Admin Login</h1>
          {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}
          <input
            type="email"
            placeholder="Email"
            className="w-full mb-4 p-3 rounded-lg border border-[#2D332F]/20 focus:outline-none focus:ring-2 focus:ring-[#E5E9E6]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full mb-6 p-3 rounded-lg border border-[#2D332F]/20 focus:outline-none focus:ring-2 focus:ring-[#E5E9E6]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="w-full bg-[#2D332F] text-white py-3 rounded-lg font-bold hover:bg-black transition-colors">
            Login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDF9F1] p-8 font-inter">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-black text-[#2D332F] uppercase tracking-tighter">Mimo Command Center</h1>
          <button onClick={logout} className="text-sm font-bold text-red-500 hover:text-red-700">Logout</button>
        </div>

        {/* METRICS ROW */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#2D332F]/10">
            <h3 className="text-sm text-gray-500 font-bold uppercase mb-1">Total Revenue</h3>
            <p className="text-3xl font-black text-green-600">₹{metrics?.totalRevenue || "0"}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#2D332F]/10">
            <h3 className="text-sm text-gray-500 font-bold uppercase mb-1">Total Orders</h3>
            <p className="text-3xl font-black text-[#2D332F]">{metrics?.totalOrders || "0"}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#2D332F]/10">
            <h3 className="text-sm text-gray-500 font-bold uppercase mb-1">Pages Printed</h3>
            <p className="text-3xl font-black text-[#2D332F]">{metrics?.totalPagesPrinted || "0"}</p>
          </div>
          <div className={`p-6 rounded-2xl shadow-sm border border-[#2D332F]/10 ${isPiOffline() ? 'bg-red-50' : 'bg-white'}`}>
            <h3 className="text-sm text-gray-500 font-bold uppercase mb-1">Pi Printer Status</h3>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isPiOffline() ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
              <p className="text-xl font-bold text-[#2D332F]">
                {isPiOffline() ? "OFFLINE" : "Online"}
              </p>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              Status: <span className="font-mono">{metrics?.piStatus?.printerStatus || "Unknown"}</span>
            </p>
          </div>
        </div>

        {/* PEAK HOUR ANALYTICS */}
        {metrics?.hourlyData && (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#2D332F]/10 mb-8">
            <h2 className="text-2xl font-bold text-[#2D332F] mb-6">Peak Hour Analytics</h2>
            <p className="text-gray-500 mb-6">Total prints distributed by hour of the day.</p>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="hour" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip 
                    cursor={{ fill: '#f1f5f9' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="prints" fill="#093765" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* COUPONS SECTION */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#2D332F]/10">
          <h2 className="text-2xl font-bold text-[#2D332F] mb-6">Coupons & Discounts</h2>
          
          <form onSubmit={createCoupon} className="flex gap-4 mb-8 items-end">
            <div className="flex-1">
              <label className="block text-sm font-bold text-gray-700 mb-1">Coupon Code</label>
              <input 
                type="text" required placeholder="e.g. MIMO50" 
                className="w-full p-2 border rounded focus:ring-2 focus:ring-[#E5E9E6]"
                value={newCoupon.code} onChange={e => setNewCoupon({...newCoupon, code: e.target.value.toUpperCase()})}
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-bold text-gray-700 mb-1">Discount %</label>
              <input 
                type="number" required min="1" max="100" placeholder="e.g. 50" 
                className="w-full p-2 border rounded focus:ring-2 focus:ring-[#E5E9E6]"
                value={newCoupon.discount} onChange={e => setNewCoupon({...newCoupon, discount: e.target.value})}
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-bold text-gray-700 mb-1">Expiry Date (Optional)</label>
              <input 
                type="date" 
                className="w-full p-2 border rounded focus:ring-2 focus:ring-[#E5E9E6]"
                value={newCoupon.expiry} onChange={e => setNewCoupon({...newCoupon, expiry: e.target.value})}
              />
            </div>
            <button type="submit" className="bg-[#2D332F] text-white px-6 py-2 rounded font-bold hover:bg-black">
              Create
            </button>
          </form>

          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-200 text-sm uppercase text-gray-500">
                <th className="pb-3">Code</th>
                <th className="pb-3">Discount</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Expiry</th>
                <th className="pb-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map(c => (
                <tr key={c.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-4 font-bold text-lg">{c.code}</td>
                  <td className="py-4 text-green-600 font-bold">{c.discountPercentage}% OFF</td>
                  <td className="py-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${c.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {c.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                  <td className="py-4 text-gray-500">
                    {c.expiryDate ? new Date(c.expiryDate._seconds * 1000).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="py-4">
                    <button onClick={() => deleteCoupon(c.id)} className="text-red-500 font-bold hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
              {coupons.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-gray-500">No coupons created yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
