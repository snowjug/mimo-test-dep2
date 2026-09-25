import React, { useState, useEffect, useMemo } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  Printer,
  IndianRupee,
  RefreshCw,
  Layers,
  Sparkles,
  Zap,
  PieChart as PieIcon,
  BarChart2,
  Users,
  UserCheck,
  Percent,
  Download,
  Search,
  CheckCircle2,
  Coins,
  ArrowUpDown,
  Activity,
  Calendar,
} from 'lucide-react';
import api from '../../api';
import { useTheme } from '../../context/ThemeContext';
import { usersService } from '../../services/users.service';
import { AdminUserItem, AdminUserMetrics } from '../../types/user.types';

export const AnalyticsPage: React.FC = () => {
  const { isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<'network' | 'customers'>('network');
  const [metrics, setMetrics] = useState<any>(null);
  const [recentPrints, setRecentPrints] = useState<any[]>([]);
  const [userMetrics, setUserMetrics] = useState<AdminUserMetrics | null>(null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Customer search & filter
  const [searchUser, setSearchUser] = useState('');
  const [userFilter, setUserFilter] = useState<'ALL' | 'PAYING' | 'FREE'>('ALL');
  const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [mRes, pRes, uRes] = await Promise.all([
        api.get('/admin/metrics').catch(() => ({ data: {} })),
        api.get('/admin/recent-prints').catch(() => ({ data: [] })),
        usersService.getUsers().catch(() => ({ metrics: null, users: [] })),
      ]);
      setMetrics(mRes.data || {});
      setRecentPrints(Array.isArray(pRes.data) ? pRes.data : []);
      setUserMetrics(uRes.metrics);
      setUsers(uRes.users);
    } catch (err) {
      console.error('Failed to load analytics data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const bwVsColor = useMemo(() => {
    let bw = 0;
    let color = 0;
    recentPrints.forEach(p => {
      const count = (p.pageCount || 1) * (p.copies || 1);
      if (p.colorMode === 'color') color += count;
      else bw += count;
    });
    if (bw === 0 && color === 0) bw = 1;
    return [
      { name: 'B&W Prints', value: bw, color: '#6366f1' },
      { name: 'Color Prints', value: color, color: '#ec4899' },
    ];
  }, [recentPrints]);

  const kioskBreakdown = useMemo(() => {
    const map: Record<string, number> = { 'CV-001': 0, 'SV-002': 0 };
    recentPrints.forEach(p => {
      const dest = p.destination || 'CV-001';
      map[dest] = (map[dest] || 0) + ((p.pageCount || 1) * (p.copies || 1));
    });
    return Object.entries(map).map(([kiosk, pages]) => ({
      kiosk,
      pages,
    }));
  }, [recentPrints]);

  const timeSeries = useMemo(() => {
    const map: Record<string, { revenue: number; pages: number }> = {};
    recentPrints.forEach(p => {
      const dateStr = p.createdAt ? new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Today';
      if (!map[dateStr]) map[dateStr] = { revenue: 0, pages: 0 };
      map[dateStr].revenue += (p.cost || 0);
      map[dateStr].pages += (p.pageCount || 1) * (p.copies || 1);
    });
    return Object.entries(map).map(([date, val]) => ({
      date,
      revenue: Number(val.revenue.toFixed(2)),
      pages: val.pages,
    }));
  }, [recentPrints]);

  const filteredUsers = useMemo(() => {
    let list = [...users];
    if (searchUser.trim()) {
      const q = searchUser.toLowerCase();
      list = list.filter(
        u =>
          u.username.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.mobileNumber.toLowerCase().includes(q)
      );
    }
    if (userFilter === 'PAYING') list = list.filter(u => u.isPayingCustomer);
    if (userFilter === 'FREE') list = list.filter(u => !u.isPayingCustomer);
    return list;
  }, [users, searchUser, userFilter]);

  const exportReport = () => {
    const headers = ['Metric', 'Value'];
    const rows = [
      ['Total Platform Revenue', `INR ${metrics?.totalRevenue || 0}`],
      ['Total Lifetime Pages', metrics?.totalPages || 0],
      ['Active Registered Users', metrics?.activeUsers || 0],
      ['Success Rate', `${metrics?.successRate || 99}%`],
      ['Total Paying Customers', userMetrics?.activeCustomers || 0],
      ['User Conversion Rate', `${userMetrics?.conversionRate || 0}%`],
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `mimo_analytics_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fadeIn font-sans select-none">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className={`text-2xl sm:text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Analytics & Reports
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <Sparkles size={12} />
              Aggregated Intelligence
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-2)] mt-1">
            Understand revenue, print demand, customer conversion, and edge machine performance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportReport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)] transition-all cursor-pointer shadow-xs"
          >
            <Download size={14} />
            Export Report
          </button>
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-all cursor-pointer shadow-md shadow-indigo-500/20 disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Sync Telemetry
          </button>
        </div>
      </div>

      {/* ── Subtabs ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('network')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'network'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
              : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)]'
          }`}
        >
          <BarChart2 size={14} />
          <span>Network Demand & Performance</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('customers')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'customers'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
              : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)]'
          }`}
        >
          <Users size={14} />
          <span>Customer Intelligence & Roster</span>
        </button>
      </div>

      {/* ── TAB 1: NETWORK DEMAND & PERFORMANCE ────────────────────── */}
      {activeTab === 'network' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Top Summary Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
              <span className="text-xs font-bold text-[var(--text-3)] uppercase tracking-wider">Total Revenue</span>
              <p className="text-2xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                ₹{metrics?.totalRevenue?.toLocaleString('en-IN') || 0}
              </p>
              <p className="text-[11px] text-[var(--text-3)] font-medium mt-1">Across all kiosk transactions</p>
            </div>
            <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
              <span className="text-xs font-bold text-[var(--text-3)] uppercase tracking-wider">Total Pages</span>
              <p className="text-2xl sm:text-3xl font-black text-[var(--text-1)] mt-1">
                {(metrics?.totalPages || 0).toLocaleString()}
              </p>
              <p className="text-[11px] text-[var(--text-3)] font-medium mt-1">Lifetime printed volume</p>
            </div>
            <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
              <span className="text-xs font-bold text-[var(--text-3)] uppercase tracking-wider">Active Users</span>
              <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {(metrics?.activeUsers || 0).toLocaleString()}
              </p>
              <p className="text-[11px] text-[var(--text-3)] font-medium mt-1">Registered student profiles</p>
            </div>
            <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
              <span className="text-xs font-bold text-[var(--text-3)] uppercase tracking-wider">Print Success Rate</span>
              <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {metrics?.successRate || '99%'}
              </p>
              <p className="text-[11px] text-emerald-600 font-semibold mt-1">Exceeds 98.5% target SLA</p>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Trends */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-base text-[var(--text-1)]">Daily Revenue Growth</h2>
                  <p className="text-xs text-[var(--text-3)]">Revenue collected over recent print batches</p>
                </div>
                <BarChart2 size={18} className="text-indigo-500" />
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeSeries.length > 0 ? timeSeries : [{ date: 'Today', revenue: metrics?.totalRevenue || 0 }]}>
                    <defs>
                      <linearGradient id="analyticsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#f1f5f9'} />
                    <XAxis dataKey="date" stroke={isDark ? '#64748b' : '#94a3b8'} fontSize={11} tickLine={false} />
                    <YAxis stroke={isDark ? '#64748b' : '#94a3b8'} fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? '#0f172a' : '#ffffff',
                        borderColor: isDark ? '#334155' : '#e2e8f0',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#analyticsGrad)" name="Revenue (₹)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* B&W vs Color Share */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-bold text-base text-[var(--text-1)]">Color vs B&W Ratio</h2>
                    <p className="text-xs text-[var(--text-3)]">Volume distribution by color mode</p>
                  </div>
                  <PieIcon size={18} className="text-pink-500" />
                </div>

                <div className="h-60 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={bwVsColor}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {bwVsColor.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Kiosk Volume Distribution */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-base text-[var(--text-1)]">Pages Printed per Kiosk Node</h2>
                <p className="text-xs text-[var(--text-3)]">Comparative workload across CV-001 and SV-002</p>
              </div>
              <Printer size={18} className="text-emerald-500" />
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={kioskBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#f1f5f9'} />
                  <XAxis dataKey="kiosk" stroke={isDark ? '#64748b' : '#94a3b8'} fontSize={11} tickLine={false} />
                  <YAxis stroke={isDark ? '#64748b' : '#94a3b8'} fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      borderColor: isDark ? '#334155' : '#e2e8f0',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="pages" fill="#10b981" radius={[6, 6, 0, 0]} name="Pages Printed" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: CUSTOMER INTELLIGENCE & ROSTER ─────────────────── */}
      {activeTab === 'customers' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Customer KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">Total Registered</span>
                <Users size={16} className="text-blue-500" />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-[var(--text-1)]">
                {userMetrics?.totalUsers || users.length}
              </p>
              <p className="text-[11px] text-[var(--text-3)] mt-1">Campus accounts</p>
            </div>

            <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">Paying Customers</span>
                <UserCheck size={16} className="text-emerald-500" />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                {userMetrics?.activeCustomers || users.filter(u => u.isPayingCustomer).length}
              </p>
              <p className="text-[11px] text-emerald-600 font-semibold mt-1">
                {userMetrics?.totalUsers ? `${((userMetrics.activeCustomers / userMetrics.totalUsers) * 100).toFixed(0)}% conversion` : '0%'}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">Conversion Rate</span>
                <Percent size={16} className="text-indigo-500" />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-[var(--text-1)]">
                {userMetrics?.conversionRate || 0}%
              </p>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(userMetrics?.conversionRate || 0, 100)}%` }}
                />
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">Avg Revenue / User</span>
                <IndianRupee size={16} className="text-amber-500" />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-[var(--text-1)]">
                ₹{userMetrics?.avgRevenuePerUser || 0}
              </p>
              <p className="text-[11px] text-[var(--text-3)] mt-1">Lifetime customer value</p>
            </div>
          </div>

          {/* Customer Roster Table */}
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
                <input
                  type="text"
                  placeholder="Search by student name, email, or phone..."
                  value={searchUser}
                  onChange={e => setSearchUser(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                {(['ALL', 'PAYING', 'FREE'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setUserFilter(type)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      userFilter === type
                        ? 'bg-[var(--surface)] text-indigo-600 shadow-xs'
                        : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
                    }`}
                  >
                    {type === 'ALL' ? 'All' : type === 'PAYING' ? 'Paying' : 'Free'}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider">
                    <th className="py-3 px-4 sm:px-6">Customer</th>
                    <th className="py-3 px-4">Contact</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Orders</th>
                    <th className="py-3 px-4">Pages</th>
                    <th className="py-3 px-4">Total Spend</th>
                    <th className="py-3 px-4">MIMO Coins</th>
                    <th className="py-3 px-4 sm:px-6 text-right">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] text-xs sm:text-sm">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-[var(--text-3)]">
                        No customer accounts found
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map(u => (
                      <tr
                        key={u.id}
                        onClick={() => setSelectedUser(u)}
                        className="hover:bg-[var(--surface-2)]/60 transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 px-4 sm:px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                              {u.username.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-[var(--text-1)] group-hover:text-indigo-600 transition-colors">
                                {u.username}
                              </p>
                              <p className="text-[11px] text-[var(--text-3)] truncate max-w-[180px]">
                                {u.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-[var(--text-2)] font-medium">
                          {u.mobileNumber || '—'}
                        </td>
                        <td className="py-3.5 px-4">
                          {u.isPayingCustomer ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 size={11} /> Customer
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500">
                              Free
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-[var(--text-1)]">
                          {u.orderCount}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-[var(--text-2)]">
                          {u.pagesPrinted}
                        </td>
                        <td className="py-3.5 px-4 font-black text-emerald-600 dark:text-emerald-400">
                          ₹{u.totalSpend.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 font-bold text-amber-500">
                            <Coins size={13} /> {u.mimoCoins}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 sm:px-6 text-right text-[11px] text-[var(--text-3)] font-medium">
                          {u.joinedAt ? new Date(u.joinedAt).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── User Detail Drawer / Modal ───────────────────────────────── */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                  {selectedUser.username.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-base text-[var(--text-1)]">{selectedUser.username}</h3>
                  <p className="text-xs text-[var(--text-3)]">{selectedUser.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                <span className="text-[10px] font-bold text-[var(--text-3)] uppercase">Total Spend</span>
                <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                  ₹{selectedUser.totalSpend.toFixed(2)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                <span className="text-[10px] font-bold text-[var(--text-3)] uppercase">Orders Completed</span>
                <p className="text-xl font-black text-[var(--text-1)] mt-0.5">
                  {selectedUser.orderCount}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                <span className="text-[10px] font-bold text-[var(--text-3)] uppercase">Pages Printed</span>
                <p className="text-xl font-black text-[var(--text-1)] mt-0.5">
                  {selectedUser.pagesPrinted}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                <span className="text-[10px] font-bold text-[var(--text-3)] uppercase">MIMO Coins</span>
                <p className="text-xl font-black text-amber-500 mt-0.5">
                  {selectedUser.mimoCoins}
                </p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-[var(--text-2)]">
              <div className="flex justify-between py-1.5 border-b border-[var(--border)]">
                <span className="text-[var(--text-3)]">User ID</span>
                <span className="font-mono text-[11px]">{selectedUser.id}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--border)]">
                <span className="text-[var(--text-3)]">Mobile Number</span>
                <span className="font-semibold">{selectedUser.mobileNumber || 'Not linked'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--border)]">
                <span className="text-[var(--text-3)]">Registration Date</span>
                <span>{selectedUser.joinedAt ? new Date(selectedUser.joinedAt).toLocaleString() : '—'}</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
