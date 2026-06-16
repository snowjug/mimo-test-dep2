import React, { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, BarChart2
} from 'recharts';
import {
  Building, LogOut, Loader2, Printer, RefreshCcw, Tag,
  Home, Ticket, Search, User, Zap, Activity, Settings, Cpu,
  Droplets, Layers, Save, CheckCircle2, Sun, Moon, Bell, BarChart2 as BarIcon
} from 'lucide-react';
import api from './api';

// ─── colour helpers ──────────────────────────────────────────────────────────
const DARK = {
  pageBg:      '#0b1929',
  sidebarBg:   '#0f2235',
  sidebarBord: '#1a3a5c',
  cardBg:      '#122033',
  cardBord:    '#1a3a5c',
  text:        '#ffffff',
  sub:         '#64829a',
  accent:      '#2dd4a0',
  accentBg:    'rgba(45,212,160,0.12)',
  accentText:  '#2dd4a0',
  divider:     '#1a3a5c',
  inputBg:     '#0b1929',
  inputBord:   '#1a3a5c',
  rowHover:    'rgba(45,212,160,0.05)',
};

const LIGHT = {
  pageBg:      '#f0effe',
  sidebarBg:   '#ffffff',
  sidebarBord: '#e8e3ff',
  cardBg:      '#ffffff',
  cardBord:    '#e8e3ff',
  text:        '#1e1b4b',
  sub:         '#6b7280',
  accent:      '#7c3aed',
  accentBg:    '#ede9fe',
  accentText:  '#7c3aed',
  divider:     '#ede9fe',
  inputBg:     '#f5f3ff',
  inputBord:   '#ddd6fe',
  rowHover:    '#f5f3ff',
};

export default function AdminDashboard() {
  const [token, setToken]         = useState(localStorage.getItem('adminToken') || '');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [dark, setDark]           = useState(() => localStorage.getItem('adminTheme') !== 'light');

  const [metrics, setMetrics]           = useState<any>(null);
  const [coupons, setCoupons]           = useState<any[]>([]);
  const [recentPrints, setRecentPrints] = useState<any[]>([]);
  const [pricing, setPricing]           = useState({ pricePerPageBW: 2.30, pricePerPageColor: 10.00, pricePerPageA4: 2.30, pricePerPageGraph: 2.00 });
  const [hardware, setHardware]         = useState<any>({});
  const [activeTab, setActiveTab]       = useState('dashboard');
  const [newCoupon, setNewCoupon]       = useState({ code: '', discount: '', expiry: '' });
  const [bulkCoupon, setBulkCoupon]     = useState({ prefix: '', count: '10', discount: '50', expiry: '' });
  const [isResetting, setIsResetting]   = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedSettings, setSavedSettings]   = useState(false);

  const T = dark ? DARK : LIGHT;
  const toggleTheme = () => setDark(d => { const n = !d; localStorage.setItem('adminTheme', n ? 'dark' : 'light'); return n; });

  useEffect(() => {
    if (token) { fetchData(); const iv = setInterval(fetchData, 30000); return () => clearInterval(iv); }
  }, [token]);

  const fetchData = async () => {
    try {
      const h = { Authorization: `Bearer ${token}` };
      const [mR, cR, pR, sR, hwR] = await Promise.all([
        api.get('/admin/metrics',       { headers: h }),
        api.get('/admin/coupons',       { headers: h }),
        api.get('/admin/recent-prints', { headers: h }).catch(() => ({ data: [] })),
        api.get('/admin/settings',      { headers: h }).catch(() => ({ data: {} })),
        api.get('/admin/hardware',      { headers: h }).catch(() => ({ data: {} })),
      ]);
      setMetrics(mR.data);
      setCoupons(cR.data);
      setRecentPrints(pR.data);
      setPricing({
        pricePerPageBW:    sR.data.pricePerPageBW    || 2.30,
        pricePerPageA4:    sR.data.pricePerPageA4    || 2.30,
        pricePerPageGraph: sR.data.pricePerPageGraph || 2.00,
        pricePerPageColor: sR.data.pricePerPageColor || 10.00,
      });
      setHardware(hwR.data);
    } catch (err: any) {
      if (err.response?.status === 401 || err.response?.status === 403) logout();
    }
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { const r = await api.post('/admin/login', { email, password }); localStorage.setItem('adminToken', r.data.token); setToken(r.data.token); }
    catch { setError('Invalid credentials.'); } finally { setLoading(false); }
  };

  const logout = () => { localStorage.removeItem('adminToken'); setToken(''); setMetrics(null); setCoupons([]); setRecentPrints([]); };

  const handleResetMetrics = async () => {
    if (!confirm('Reset ALL metrics?')) return;
    setIsResetting(true);
    try { await api.post('/admin/reset-metrics', {}, { headers: { Authorization: `Bearer ${token}` } }); await fetchData(); }
    catch { alert('Failed.'); } finally { setIsResetting(false); }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try { await api.post('/admin/settings', pricing, { headers: { Authorization: `Bearer ${token}` } }); setSavedSettings(true); setTimeout(() => setSavedSettings(false), 3000); fetchData(); }
    catch { alert('Failed.'); } finally { setSavingSettings(false); }
  };

  const updateHardwareLevel = async (id: string, u: any) => {
    try { await api.post('/admin/hardware', { updates: { [id]: u } }, { headers: { Authorization: `Bearer ${token}` } }); fetchData(); }
    catch { alert('Failed.'); }
  };

  const createCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.post('/admin/coupons', { code: newCoupon.code, discountPercentage: newCoupon.discount, expiryDate: newCoupon.expiry || null }, { headers: { Authorization: `Bearer ${token}` } }); setNewCoupon({ code: '', discount: '', expiry: '' }); fetchData(); }
    catch { alert('Failed.'); }
  };

  const createBulkCoupons = async (e: React.FormEvent) => {
    e.preventDefault();
    try { const r = await api.post('/admin/coupons/bulk', { prefix: bulkCoupon.prefix, count: bulkCoupon.count, discountPercentage: bulkCoupon.discount, expiryDate: bulkCoupon.expiry || null }, { headers: { Authorization: `Bearer ${token}` } }); setBulkCoupon({ prefix: '', count: '10', discount: '50', expiry: '' }); alert(`Generated ${r.data.count} coupons!`); fetchData(); }
    catch { alert('Failed.'); }
  };

  const deleteCoupon = async (code: string) => {
    if (confirm(`Delete coupon ${code}?`)) { try { await api.delete(`/admin/coupons/${code}`, { headers: { Authorization: `Bearer ${token}` } }); fetchData(); } catch { alert('Failed.'); } }
  };

  const revenueData = React.useMemo(() => {
    if (!metrics?.dailyRevenue || Object.keys(metrics.dailyRevenue).length === 0) {
      return [
        { date: 'May 27', revenue: 280 }, { date: 'May 28', revenue: 790 },
        { date: 'May 29', revenue: 920 }, { date: 'May 30', revenue: 660 },
        { date: 'May 31', revenue: 850 }, { date: 'Jun 1', revenue: 690 },
        { date: 'Jun 2', revenue: 750 }, { date: 'Jun 3', revenue: 810 },
        { date: 'Jun 4', revenue: 980 }, { date: 'Jun 5', revenue: 620 },
        { date: 'Jun 6', revenue: 320 }, { date: 'Jun 7', revenue: 840 },
        { date: 'Jun 8', revenue: 600 }, { date: 'Jun 9', revenue: 690 },
      ];
    }
    return Object.entries(metrics.dailyRevenue).map(([date, revenue]) => ({ date, revenue })).sort((a, b) => a.date.localeCompare(b.date));
  }, [metrics]);

  const pieData = (metrics?.totalBwPages || 0) === 0 && (metrics?.totalColorPages || 0) === 0
    ? [ { name: 'B&W Pages', value: 65 }, { name: 'Color Pages', value: 35 } ]
    : [
        { name: 'B&W Pages',   value: metrics?.totalBwPages    || 0 },
        { name: 'Color Pages', value: metrics?.totalColorPages || 0 },
      ];

  const getLevelColor = (v: number) => v > 50 ? (dark ? '#2dd4a0' : '#7c3aed') : v > 20 ? '#f59e0b' : '#ef4444';

  // ── shared style helpers ────────────────────────────────────────────────
  const card = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    background: T.cardBg, border: `1px solid ${T.cardBord}`, borderRadius: '1rem',
    boxShadow: dark ? 'none' : '0 2px 16px rgba(109,90,230,0.07)', ...extra,
  });

  const inp = (): React.CSSProperties => ({
    width: '100%', padding: '.625rem .875rem', borderRadius: '.625rem',
    border: `1.5px solid ${T.inputBord}`, background: T.inputBg,
    color: T.text, fontSize: '.875rem', outline: 'none', boxSizing: 'border-box',
  });

  // ── STATUS badge helper ────────────────────────────────────────────────
  const statusBadge = (status: string) => {
    const s = status?.toLowerCase();
    const map: Record<string, { bg: string; color: string }> = {
      done:       { bg: dark ? 'rgba(45,212,160,0.15)' : '#d1fae5', color: dark ? '#2dd4a0' : '#065f46' },
      completed:  { bg: dark ? 'rgba(45,212,160,0.15)' : '#d1fae5', color: dark ? '#2dd4a0' : '#065f46' },
      printed:    { bg: dark ? 'rgba(45,212,160,0.15)' : '#d1fae5', color: dark ? '#2dd4a0' : '#065f46' },
      pending:    { bg: 'rgba(245,158,11,0.15)', color: '#d97706' },
      processing: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
      failed:     { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444' },
    };
    const style = map[s] || { bg: 'rgba(100,130,154,0.15)', color: T.sub };
    return (
      <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '.65rem', fontWeight: 800, letterSpacing: '.06em', background: style.bg, color: style.color, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        {s === 'done' || s === 'completed' || s === 'printed' ? '✓ ' : ''}{status?.toUpperCase()}
      </span>
    );
  };

  // ── LOGIN ────────────────────────────────────────────────────────────────
  if (!token) return (
    <div style={{ minHeight: '100vh', background: T.pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <form onSubmit={login} style={{ ...card(), padding: '2.5rem', width: '100%', maxWidth: '22rem' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <div style={{ width: 56, height: 56, background: T.accent, borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building style={{ color: dark ? '#0b1929' : '#fff', width: 28, height: 28 }} />
          </div>
        </div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: T.text, textAlign: 'center', marginBottom: '.4rem' }}>Welcome Back</h1>
        <p style={{ color: T.sub, fontSize: '.85rem', textAlign: 'center', marginBottom: '1.75rem' }}>Sign in to Mimo Admin</p>
        {error && <p style={{ color: '#ef4444', background: '#fef2f2', padding: '.6rem 1rem', borderRadius: '.625rem', fontSize: '.8rem', textAlign: 'center', marginBottom: '.875rem' }}>{error}</p>}
        {([['Username / Email', 'text', email, setEmail], ['Password', 'password', password, setPassword]] as any[]).map(([lbl, typ, val, set]) => (
          <div key={lbl} style={{ marginBottom: '.875rem' }}>
            <label style={{ display: 'block', fontSize: '.68rem', fontWeight: 700, color: T.sub, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '.3rem' }}>{lbl}</label>
            <input type={typ} value={val} onChange={(e) => set(e.target.value)} required style={inp()} />
          </div>
        ))}
        <button type="submit" disabled={loading} style={{ width: '100%', marginTop: '1.25rem', background: T.accent, color: dark ? '#0b1929' : '#fff', fontWeight: 800, padding: '.875rem', borderRadius: '.75rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem' }}>
          {loading ? <Loader2 style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} /> : 'Login'}
        </button>
      </form>
    </div>
  );

  const navItems = [
    { id: 'dashboard', icon: <Home size={17} />, label: 'Dashboard' },
    { id: 'hardware',  icon: <Cpu size={17} />,  label: 'Hardware Logs' },
    { id: 'coupons',   icon: <Ticket size={17} />, label: 'Coupons' },
    { id: 'settings',  icon: <Settings size={17} />, label: 'Settings' },
  ];

  // ── MAIN LAYOUT ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: T.pageBg, transition: 'background .3s' }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', background: T.sidebarBg, borderRight: `1px solid ${T.sidebarBord}`, transition: 'background .3s, border-color .3s' }}>
        <div style={{ padding: '1.5rem 1.25rem 1.25rem', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
          <div style={{ width: 36, height: 36, borderRadius: '.75rem', background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ color: dark ? '#0b1929' : '#fff', fontWeight: 900, fontSize: '1.1rem' }}>M</span>
          </div>
          <div>
            <div style={{ fontWeight: 900, fontSize: '.95rem', color: T.text, lineHeight: 1.1 }}>MIMO {dark ? 'ADMIN' : ''}</div>
            {!dark && <div style={{ fontSize: '.58rem', fontWeight: 800, letterSpacing: '.1em', color: T.accentText, background: T.accentBg, padding: '1px 5px', borderRadius: 3, marginTop: 2, display: 'inline-block' }}>ADMIN</div>}
          </div>
        </div>

        <nav style={{ flex: 1, padding: '.5rem .75rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map(item => {
            const active = activeTab === item.id;
            return (
              <button key={item.id} onClick={() => setActiveTab(item.id)} style={{
                display: 'flex', alignItems: 'center', gap: '.625rem', padding: '.7rem 1rem',
                borderRadius: '.75rem', border: 'none', cursor: 'pointer', width: '100%',
                fontSize: '.875rem', fontWeight: active ? 700 : 500, transition: 'all .2s',
                background: active ? (dark ? T.accentBg : T.accent) : 'transparent',
                color: active ? (dark ? T.accent : '#fff') : T.sub,
              }}>
                {item.icon} {item.label}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: '.75rem', borderTop: `1px solid ${T.divider}` }}>
          <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: '.625rem', padding: '.7rem 1rem', borderRadius: '.75rem', border: 'none', cursor: 'pointer', width: '100%', background: 'transparent', color: T.sub, fontSize: '.875rem', fontWeight: 500 }}>
            <LogOut size={17} /> {dark ? 'Logout' : 'Sign Out'}
          </button>
        </div>
      </aside>

      {/* ── Right column ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.75rem 1.75rem', background: T.sidebarBg, borderBottom: `1px solid ${T.sidebarBord}`, transition: 'background .3s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', background: T.inputBg, border: `1px solid ${T.inputBord}`, borderRadius: '.875rem', padding: '.45rem 1rem', color: T.sub, fontSize: '.82rem', width: 240 }}>
            <Search size={14} /> Search…
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.625rem' }}>
            <button onClick={handleResetMetrics} disabled={isResetting} style={{ display: 'flex', alignItems: 'center', gap: '.35rem', padding: '.45rem .875rem', borderRadius: '.625rem', border: `1px solid ${T.inputBord}`, background: 'transparent', color: T.sub, fontSize: '.78rem', fontWeight: 700, cursor: 'pointer' }}>
              {isResetting ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCcw size={13} />} Reset
            </button>
            <button id="theme-toggle" onClick={toggleTheme} title={dark ? 'Light mode' : 'Dark mode'} style={{ width: 34, height: 34, borderRadius: '.625rem', border: `1px solid ${T.inputBord}`, background: T.inputBg, color: dark ? '#f59e0b' : T.sub, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button style={{ width: 34, height: 34, borderRadius: '.625rem', border: `1px solid ${T.inputBord}`, background: T.inputBg, color: T.sub, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bell size={15} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '.72rem', color: dark ? '#0b1929' : '#fff' }}>
                {dark ? <User size={16} /> : 'AD'}
              </div>
              <span style={{ fontWeight: 700, fontSize: '.85rem', color: T.text }}>{dark ? 'Admin' : 'Admin User'}</span>
            </div>
          </div>
        </header>

        {/* Scrollable content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '1.75rem' }}>

          {/* ── DASHBOARD TAB ─────────────────────────────────────────── */}
          {activeTab === 'dashboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Page heading */}
              <div style={{ marginBottom: '.25rem' }}>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: T.text }}>Dashboard</h2>
                <p style={{ color: T.sub, fontSize: '.85rem', marginTop: '.2rem' }}>Welcome back — here's your latest overview</p>
              </div>

              {/* KPI row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem' }}>
                {[
                  { icon: '₹', label: 'TOTAL REVENUE',   val: `₹${(metrics?.totalRevenue || 0).toFixed(2)}`,
                    lightBg: T.cardBg, lightText: T.text, lightSub: T.sub, lightIconBg: T.accentBg, lightIconText: T.accentText },
                  { icon: '⚡', label: 'PAID PAGES',      val: (metrics?.totalPagesPrinted || 0) - (metrics?.totalFreePages || 0),
                    lightBg: '#f472b6', lightText: '#fff', lightSub: 'rgba(255,255,255,0.8)', lightIconBg: 'rgba(255,255,255,0.2)', lightIconText: '#fff' },
                  { icon: '🎫', label: 'FREE PAGES',      val: metrics?.totalFreePages || 0,
                    lightBg: '#7c3aed', lightText: '#fff', lightSub: 'rgba(255,255,255,0.8)', lightIconBg: 'rgba(255,255,255,0.15)', lightIconText: '#fff' },
                  { icon: '📊', label: 'LIFETIME PAGES',  val: metrics?.totalPagesPrinted || 0,
                    lightBg: T.cardBg, lightText: T.text, lightSub: T.sub, lightIconBg: '#fce7f3', lightIconText: '#be185d' },
                ].map((k, i) => (
                  <div key={k.label} style={{ ...card({ padding: '1.25rem' }), background: dark ? T.cardBg : k.lightBg, boxShadow: !dark && i === 1 ? '0 6px 20px rgba(244,114,182,.3)' : !dark && i === 2 ? '0 6px 20px rgba(124,58,237,.3)' : undefined }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.625rem', marginBottom: '.875rem' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '.625rem', background: dark ? T.accentBg : k.lightIconBg, color: dark ? T.accentText : k.lightIconText, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>{k.icon}</div>
                      <span style={{ fontSize: '.65rem', fontWeight: 800, color: dark ? T.sub : k.lightSub, letterSpacing: '.08em', textTransform: 'uppercase' }}>{k.label}</span>
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 900, color: dark ? T.text : k.lightText }}>{k.val}</div>
                  </div>
                ))}
              </div>

              {/* Revenue Trends + Sales Distribution */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>

                {/* Revenue Trends */}
                <div style={{ ...card({ padding: '1.5rem' }), background: dark ? T.cardBg : '#4c3b9e' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h3 style={{ fontWeight: 700, color: dark ? T.text : '#fff', fontSize: '1rem' }}>Revenue Trends</h3>
                    <span style={{ fontSize: '.7rem', fontWeight: 700, padding: '4px 12px', borderRadius: 999, background: dark ? T.accentBg : 'rgba(255,255,255,0.1)', color: dark ? T.accentText : '#fff' }}>All Months</span>
                  </div>
                  <div style={{ height: 240 }}>
                    {revenueData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={revenueData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor={dark ? T.accent : '#f472b6'} stopOpacity={0.25} />
                              <stop offset="95%" stopColor={dark ? T.accent : '#f472b6'} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)'} />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: dark ? T.sub : 'rgba(255,255,255,0.4)' }} axisLine={false} tickLine={false} dy={8} />
                          <YAxis tick={{ fontSize: 10, fill: dark ? T.sub : 'rgba(255,255,255,0.4)' }} axisLine={false} tickLine={false} dx={-4} tickFormatter={v => `₹${v}`} />
                          <Tooltip
                            cursor={{ stroke: dark ? T.accent : 'rgba(255,255,255,0.2)', strokeWidth: 1, strokeDasharray: '4 4' }}
                            contentStyle={{ background: dark ? T.cardBg : '#ffffff', border: dark ? `1px solid ${T.cardBord}` : 'none', borderRadius: 10, color: dark ? T.text : '#4c3b9e', padding: '8px 14px', fontSize: 12, fontWeight: 700 }}
                            labelStyle={{ color: dark ? T.accent : '#f472b6', fontWeight: 700, marginBottom: 4 }}
                            formatter={(v: any) => [`revenue : ${v}`, '']}
                          />
                          <Area type="monotone" dataKey="revenue" stroke={dark ? T.accent : '#f472b6'} strokeWidth={2.5} fill="url(#revGrad)" dot={false} activeDot={{ r: 5, fill: dark ? T.accent : '#ffffff', stroke: dark ? T.cardBg : '#f472b6', strokeWidth: 2 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: dark ? T.sub : 'rgba(255,255,255,.4)' }}>
                        <BarIcon size={36} style={{ marginBottom: 8, opacity: .3 }} />
                        <p style={{ fontSize: '.85rem' }}>No revenue data yet.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sales Distribution */}
                <div style={{ ...card({ padding: '1.5rem' }) }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h3 style={{ fontWeight: 700, color: T.text, fontSize: '1rem' }}>Sales Distribution</h3>
                    <span style={{ fontSize: '.7rem', fontWeight: 700, padding: '4px 12px', borderRadius: 999, background: T.accentBg, color: T.accentText }}>All charts</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
                    <PieChart width={180} height={180}>
                      <Pie data={pieData.every(d => d.value === 0) ? [{ name: 'Empty', value: 1 }] : pieData}
                        cx={90} cy={90} innerRadius={0} outerRadius={80} dataKey="value" startAngle={90} endAngle={-270}>
                        {(pieData.every(d => d.value === 0) ? [{ name: 'Empty', value: 1 }] : pieData).map((_, i) => (
                          <Cell key={i} fill={i === 0 ? (dark ? '#34d399' : '#7c3aed') : (dark ? '#059669' : '#f472b6')} stroke="none" />
                        ))}
                      </Pie>
                    </PieChart>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.625rem' }}>
                    {[
                      { label: 'B&W Pages', val: metrics?.totalBwPages || 0, color: dark ? '#34d399' : '#7c3aed' },
                      { label: 'Color Pages', val: metrics?.totalColorPages || 0, color: dark ? '#059669' : '#f472b6' }
                    ].map(p => (
                      <div key={p.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color }} />
                          <span style={{ fontSize: '.82rem', color: T.sub }}>{p.label}</span>
                        </div>
                        <span style={{ fontSize: '.82rem', fontWeight: 700, color: T.text }}>{p.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent Activity Log – full-width table */}
              <div style={{ ...card({ padding: '1.5rem' }) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <div>
                    <h3 style={{ fontWeight: 700, color: T.text, fontSize: '1rem' }}>Recent Activity Log</h3>
                    <p style={{ fontSize: '.78rem', color: T.sub, marginTop: 2 }}>All print jobs across your kiosks</p>
                  </div>
                  <span style={{ fontSize: '.7rem', fontWeight: 800, padding: '4px 12px', borderRadius: 999, background: T.accentBg, color: T.accentText }}>{recentPrints.length} JOBS</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${T.divider}` }}>
                        {['DATE & TIME', 'USER DETAILS', 'FILE PRINTED', 'PRINTER', 'MODE', 'PAGES', 'STATUS', 'COST', 'REFUND'].map(h => (
                          <th key={h} style={{ padding: '.5rem .875rem', textAlign: 'left', fontSize: '.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: T.sub, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentPrints.length > 0 ? recentPrints.map((job, idx) => (
                        <tr key={idx} style={{ borderBottom: `1px solid ${T.divider}` }}>
                          <td style={{ padding: '.75rem .875rem', color: T.sub, whiteSpace: 'nowrap', fontSize: '.78rem' }}>{job.createdAt || job.timestamp || '—'}</td>
                          <td style={{ padding: '.75rem .875rem', color: T.text, fontWeight: 600, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.userEmail || 'Guest User'}</td>
                          <td style={{ padding: '.75rem .875rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span style={{ color: T.accent, fontWeight: 600 }}>{job.file || job.fileName || '—'}</span>
                          </td>
                          <td style={{ padding: '.75rem .875rem', color: T.sub, whiteSpace: 'nowrap' }}>
                            <span style={{ background: T.accentBg, color: T.sub, padding: '2px 8px', borderRadius: 6, fontSize: '.72rem' }}>{job.printer || 'Any'}</span>
                          </td>
                          <td style={{ padding: '.75rem .875rem', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '.35rem', color: T.sub, fontSize: '.8rem' }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: job.mode === 'color' ? '#f43f5e' : '#94a3b8', flexShrink: 0 }} />
                              {job.mode === 'color' ? 'Color' : 'B&W'}
                            </span>
                          </td>
                          <td style={{ padding: '.75rem .875rem', color: T.text, fontWeight: 600, whiteSpace: 'nowrap' }}>{job.pages ? `${job.pages} × 1` : '—'}</td>
                          <td style={{ padding: '.75rem .875rem', whiteSpace: 'nowrap' }}>{statusBadge(job.status || 'done')}</td>
                          <td style={{ padding: '.75rem .875rem', color: T.text, fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {job.cost === 0 || job.cost === '0' ? '₹0' : `₹${job.cost || 0}`}
                          </td>
                          <td style={{ padding: '.75rem .875rem', whiteSpace: 'nowrap' }}>
                            {(job.cost === 0 || job.cost === '0') ? (
                              <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '.65rem', fontWeight: 800, background: T.accentBg, color: T.accentText }}>FREE</span>
                            ) : job.refundStatus ? (
                              <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '.65rem', fontWeight: 800, background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>{job.refundStatus.toUpperCase()}</span>
                            ) : <span style={{ color: T.sub }}>—</span>}
                          </td>
                        </tr>
                      )) : (
                        <tr><td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: T.sub }}>No activity yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── HARDWARE ───────────────────────────────────────────────── */}
          {activeTab === 'hardware' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '1.25rem' }}>
              {Object.entries(hardware).map(([id, data]: any) => (
                <div key={id} style={{ ...card({ padding: '1.75rem' }) }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: '1.1rem', color: T.text }}>{id} {data.type === 'color' ? '(COLOR)' : '(B&W)'}</div>
                      <div style={{ fontSize: '.78rem', color: T.sub, marginTop: 2 }}>{data.name || 'Printer Kiosk'}</div>
                    </div>
                    <span style={{ fontSize: '.65rem', fontWeight: 800, padding: '3px 10px', borderRadius: 999, background: '#d1fae5', color: '#065f46', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} /> {data.status?.toUpperCase() || 'ONLINE'}
                    </span>
                  </div>
                  {[
                    { label: data.type === 'color' ? 'Ink Level' : 'Toner Level', val: data.type === 'color' ? data.inkLevel || 0 : data.tonerLevel || 0 },
                    { label: 'Paper Level', val: Math.min((data.paperLevel || 0) / 5, 100) },
                  ].map(bar => (
                    <div key={bar.label} style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', fontWeight: 700, color: T.text, marginBottom: '.4rem' }}>
                        <span>{bar.label}</span><span>{bar.val}%</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 999, background: T.inputBg, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 999, background: getLevelColor(bar.val), width: `${bar.val}%`, transition: 'width 1s' }} />
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: '.75rem', marginTop: '.875rem', paddingTop: '.875rem', borderTop: `1px solid ${T.divider}` }}>
                    {data.type === 'color'
                      ? <button onClick={() => updateHardwareLevel(id, { inkLevel: 100 })} style={btnSt(T)}>Refill Ink</button>
                      : <button onClick={() => updateHardwareLevel(id, { tonerLevel: 100 })} style={btnSt(T)}>Refill Toner</button>}
                    <button onClick={() => updateHardwareLevel(id, { paperLevel: 500 })} style={btnSt(T)}>Add Paper</button>
                  </div>
                </div>
              ))}
              {Object.keys(hardware).length === 0 && (
                <div style={{ gridColumn: '1/-1', ...card({ padding: '5rem', textAlign: 'center', color: T.sub }) }}>
                  <Cpu size={36} style={{ margin: '0 auto .875rem', opacity: .3 }} /><p>No hardware devices found.</p>
                </div>
              )}
            </div>
          )}

          {/* ── SETTINGS ───────────────────────────────────────────────── */}
          {activeTab === 'settings' && (
            <div style={{ maxWidth: 700 }}>
              <div style={{ ...card({ padding: '2rem' }) }}>
                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: T.text, marginBottom: '.4rem' }}>Pricing Configuration</div>
                <p style={{ fontSize: '.83rem', color: T.sub, marginBottom: '1.75rem' }}>Update per-page printing costs.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                  {[{ label: 'B&W Print', key: 'pricePerPageBW' }, { label: 'Color Print', key: 'pricePerPageColor' }, { label: 'A4 Blank Sheet', key: 'pricePerPageA4' }, { label: 'Graph Sheet', key: 'pricePerPageGraph' }].map(f => (
                    <div key={f.key} style={{ background: T.inputBg, border: `1.5px solid ${T.inputBord}`, borderRadius: '.875rem', padding: '1.1rem' }}>
                      <label style={{ display: 'block', fontSize: '.67rem', fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '.6rem' }}>{f.label}</label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: T.sub }}>₹</span>
                        <input type="number" step="0.10" value={(pricing as any)[f.key]} onChange={e => setPricing({ ...pricing, [f.key]: parseFloat(e.target.value) })}
                          style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 12, paddingBottom: 12, borderRadius: '.625rem', border: `1.5px solid ${T.inputBord}`, background: T.cardBg, color: T.text, fontSize: '1.2rem', fontWeight: 900, outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '1.25rem', borderTop: `1px solid ${T.divider}` }}>
                  <button onClick={saveSettings} disabled={savingSettings} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.875rem 2rem', borderRadius: '.875rem', border: 'none', cursor: 'pointer', fontWeight: 800, background: savedSettings ? '#10b981' : T.accent, color: dark ? '#0b1929' : '#fff' }}>
                    {savingSettings ? <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} /> : savedSettings ? <CheckCircle2 size={17} /> : <Save size={17} />}
                    {savedSettings ? 'Saved!' : 'Save Settings'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── COUPONS ────────────────────────────────────────────────── */}
          {activeTab === 'coupons' && (
            <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1.25rem', alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {[
                  { title: 'Bulk Generator', form: true, bulk: true },
                  { title: 'Custom Code',    form: true, bulk: false },
                ].map(sec => (
                  <div key={sec.title} style={{ ...card({ padding: '1.5rem' }) }}>
                    <div style={{ fontWeight: 800, color: T.text, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                      <Tag size={15} style={{ color: T.accentText }} /> {sec.title}
                    </div>
                    <form onSubmit={sec.bulk ? createBulkCoupons : createCoupon} style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                      {sec.bulk
                        ? [{ l: 'Prefix', k: 'prefix', t: 'text', p: 'CAMPUS' }, { l: 'Count', k: 'count', t: 'number' }, { l: 'Discount %', k: 'discount', t: 'number' }].map(f => (
                            <div key={f.k}>
                              <label style={{ display: 'block', fontSize: '.67rem', fontWeight: 700, color: T.sub, marginBottom: 3 }}>{f.l}</label>
                              <input type={f.t} required placeholder={f.p} value={(bulkCoupon as any)[f.k]} onChange={e => setBulkCoupon({ ...bulkCoupon, [f.k]: e.target.value })} style={inp()} />
                            </div>
                          ))
                        : [{ l: 'Code', v: newCoupon.code, cb: (e: any) => setNewCoupon({ ...newCoupon, code: e.target.value.toUpperCase() }), t: 'text' }, { l: 'Discount %', v: newCoupon.discount, cb: (e: any) => setNewCoupon({ ...newCoupon, discount: e.target.value }), t: 'number' }].map(f => (
                            <div key={f.l}>
                              <label style={{ display: 'block', fontSize: '.67rem', fontWeight: 700, color: T.sub, marginBottom: 3 }}>{f.l}</label>
                              <input type={f.t} required value={f.v} onChange={f.cb} style={inp()} />
                            </div>
                          ))
                      }
                      <button type="submit" style={{ padding: '.7rem', borderRadius: '.625rem', border: 'none', cursor: 'pointer', background: sec.bulk ? T.accent : (dark ? '#1a3a5c' : '#1e293b'), color: sec.bulk ? (dark ? '#0b1929' : '#fff') : '#fff', fontWeight: 800, fontSize: '.85rem', marginTop: '.25rem' }}>
                        {sec.bulk ? 'Generate Coupons' : 'Create Coupon'}
                      </button>
                    </form>
                  </div>
                ))}
              </div>

              <div style={{ ...card({ padding: '1.5rem' }) }}>
                <div style={{ fontWeight: 800, color: T.text, marginBottom: '1.25rem', fontSize: '.95rem' }}>Active Repository</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${T.divider}` }}>
                        {['Coupon Code', 'Discount', 'Status', 'Action'].map((h, i) => (
                          <th key={h} style={{ padding: '.625rem 1rem', textAlign: i === 3 ? 'right' : 'left', fontSize: '.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: T.sub }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {coupons.map((c, idx) => (
                        <tr key={c.id || idx} style={{ borderBottom: `1px solid ${T.divider}` }}>
                          <td style={{ padding: '.8rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '.625rem' }}>
                              <div style={{ width: 30, height: 30, borderRadius: '.5rem', background: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Tag size={13} style={{ color: T.accentText }} /></div>
                              <span style={{ fontFamily: 'monospace', fontWeight: 800, color: T.text }}>{c.code}</span>
                            </div>
                          </td>
                          <td style={{ padding: '.8rem 1rem', fontWeight: 800, color: T.accentText }}>{c.discountPercentage}% OFF</td>
                          <td style={{ padding: '.8rem 1rem' }}>
                            <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '.65rem', fontWeight: 800, background: c.isActive ? '#d1fae5' : '#fee2e2', color: c.isActive ? '#065f46' : '#991b1b' }}>{c.isActive ? 'ACTIVE' : 'EXPIRED'}</span>
                          </td>
                          <td style={{ padding: '.8rem 1rem', textAlign: 'right' }}>
                            <button onClick={() => deleteCoupon(c.id)} style={{ padding: '3px 12px', borderRadius: '.5rem', border: 'none', cursor: 'pointer', background: 'transparent', color: T.sub, fontWeight: 700, fontSize: '.78rem' }}>Revoke</button>
                          </td>
                        </tr>
                      ))}
                      {coupons.length === 0 && <tr><td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: T.sub }}>No active coupons found.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const btnSt = (T: typeof DARK): React.CSSProperties => ({
  flex: 1, padding: '.625rem', borderRadius: '.625rem', border: `1px solid ${T.cardBord}`,
  cursor: 'pointer', background: T.inputBg, color: T.text, fontWeight: 700, fontSize: '.82rem',
});
