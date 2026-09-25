import React, { useEffect, useState, useMemo } from 'react';
import {
  Users,
  UserCheck,
  Percent,
  IndianRupee,
  Search,
  RefreshCw,
  Coins,
  FileText,
  Calendar,
  Phone,
  Mail,
  ShieldCheck,
  ChevronRight,
  User,
  CheckCircle2,
  Clock,
  ArrowUpDown,
  Filter,
  Layers,
  Sparkles,
  Download,
} from 'lucide-react';
import { usersService } from '../../services/users.service';
import { AdminUserItem, AdminUserMetrics } from '../../types/user.types';
import { useTheme } from '../../context/ThemeContext';

export const UsersPage: React.FC = () => {
  const { isDark } = useTheme();
  const [metrics, setMetrics] = useState<AdminUserMetrics | null>(null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'PAYING' | 'FREE'>('ALL');
  const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null);
  const [sortBy, setSortBy] = useState<'spend' | 'orders' | 'date'>('spend');

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await usersService.getUsers();
      setMetrics(res.metrics);
      setUsers(res.users);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredUsers = useMemo(() => {
    let list = [...users];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.mobileNumber.toLowerCase().includes(q)
      );
    }

    if (filterType === 'PAYING') {
      list = list.filter((u) => u.isPayingCustomer);
    } else if (filterType === 'FREE') {
      list = list.filter((u) => !u.isPayingCustomer);
    }

    if (sortBy === 'spend') {
      list.sort((a, b) => b.totalSpend - a.totalSpend);
    } else if (sortBy === 'orders') {
      list.sort((a, b) => b.orderCount - a.orderCount);
    } else if (sortBy === 'date') {
      list.sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime());
    }

    return list;
  }, [users, search, filterType, sortBy]);

  const exportCSV = () => {
    const headers = ['Username', 'Email', 'Phone', 'Total Spend (INR)', 'Orders', 'Pages', 'MIMO Coins', 'Joined At'];
    const rows = filteredUsers.map((u) => [
      `"${u.username}"`,
      `"${u.email}"`,
      `"${u.mobileNumber}"`,
      u.totalSpend,
      u.orderCount,
      u.pagesPrinted,
      u.mimoCoins,
      `"${new Date(u.joinedAt).toLocaleDateString()}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `mimo_users_${new Date().toISOString().slice(0, 10)}.csv`);
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
              Customer Intelligence
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <Sparkles size={12} />
              Real-Time Roster
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-2)] mt-1">
            Track user registrations, conversion rates, spending patterns, and customer lifetime value.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)] transition-all cursor-pointer shadow-xs"
          >
            <Download size={14} />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white transition-all cursor-pointer shadow-md shadow-indigo-500/20 disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Metrics Grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">Total Registered</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Users size={16} />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-[var(--text-1)]">
            {loading ? '...' : metrics?.totalUsers || 0}
          </p>
          <p className="text-[11px] text-[var(--text-3)] font-medium mt-1">
            Accounts registered on campus
          </p>
        </div>

        {/* Active Paying Customers */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">Paying Customers</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <UserCheck size={16} />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-[var(--text-1)]">
            {loading ? '...' : metrics?.activeCustomers || 0}
          </p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
            {metrics?.totalUsers ? `${((metrics.activeCustomers / metrics.totalUsers) * 100).toFixed(0)}% of total userbase` : '0%'}
          </p>
        </div>

        {/* Conversion Rate */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">Conversion Rate</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <Percent size={16} />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-[var(--text-1)]">
            {loading ? '...' : `${metrics?.conversionRate || 0}%`}
          </p>
          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-indigo-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(metrics?.conversionRate || 0, 100)}%` }}
            />
          </div>
        </div>

        {/* ARPU */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">Avg Revenue / User</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <IndianRupee size={16} />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-[var(--text-1)]">
            {loading ? '...' : `₹${metrics?.avgRevenuePerUser || 0}`}
          </p>
          <p className="text-[11px] text-[var(--text-3)] font-medium mt-1">
            Total Revenue: ₹{metrics?.totalRevenue?.toLocaleString('en-IN') || 0}
          </p>
        </div>
      </div>

      {/* ── Table & Filter Controls ─────────────────────────────────── */}
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs overflow-hidden">
        {/* Controls Toolbar */}
        <div className="p-4 sm:p-5 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--surface)]">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              type="text"
              placeholder="Search by name, email, or mobile..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--primary)] transition-all"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto">
            <div className="flex items-center p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
              {(['ALL', 'PAYING', 'FREE'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    filterType === type
                      ? 'bg-[var(--surface)] text-[var(--primary)] shadow-xs'
                      : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
                  }`}
                >
                  {type === 'ALL' ? 'All' : type === 'PAYING' ? 'Paying Customers' : 'Free Users'}
                </button>
              ))}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--text-2)] font-semibold">
              <ArrowUpDown size={13} />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent border-none outline-none cursor-pointer font-bold text-[var(--text-1)]"
              >
                <option value="spend" className="bg-[var(--surface)] text-[var(--text-1)]">Sort by Spend</option>
                <option value="orders" className="bg-[var(--surface)] text-[var(--text-1)]">Sort by Orders</option>
                <option value="date" className="bg-[var(--surface)] text-[var(--text-1)]">Sort by Join Date</option>
              </select>
            </div>
          </div>
        </div>

        {/* User List Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider">
                <th className="py-3 px-4 sm:px-6">Customer</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Orders</th>
                <th className="py-3 px-4">Pages Printed</th>
                <th className="py-3 px-4">Total Spend</th>
                <th className="py-3 px-4">MIMO Coins</th>
                <th className="py-3 px-4 sm:px-6 text-right">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-xs sm:text-sm">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[var(--text-3)]">
                    <RefreshCw className="animate-spin inline mr-2" size={18} />
                    Loading user intelligence...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[var(--text-3)]">
                    No users matching criteria
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    className="hover:bg-[var(--surface-2)]/60 transition-colors cursor-pointer group"
                  >
                    {/* User Identity */}
                    <td className="py-3.5 px-4 sm:px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                          {u.username.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-[var(--text-1)] group-hover:text-[var(--primary)] transition-colors">
                            {u.username}
                          </p>
                          <p className="text-[11px] text-[var(--text-3)] truncate max-w-[180px]">
                            {u.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Contact */}
                    <td className="py-3.5 px-4 text-[var(--text-2)] font-medium">
                      {u.mobileNumber || '—'}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4">
                      {u.isPayingCustomer ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 size={11} />
                          Customer
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                          Free Account
                        </span>
                      )}
                    </td>

                    {/* Orders Count */}
                    <td className="py-3.5 px-4 font-bold text-[var(--text-1)]">
                      {u.orderCount}
                    </td>

                    {/* Pages Printed */}
                    <td className="py-3.5 px-4 font-semibold text-[var(--text-2)]">
                      {u.pagesPrinted}
                    </td>

                    {/* Total Spend */}
                    <td className="py-3.5 px-4 font-black text-emerald-600 dark:text-emerald-400">
                      ₹{u.totalSpend.toFixed(2)}
                    </td>

                    {/* MIMO Coins */}
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 font-bold text-amber-500">
                        <Coins size={13} />
                        {u.mimoCoins}
                      </span>
                    </td>

                    {/* Joined Date */}
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
                className="px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-bold hover:bg-[var(--primary-hover)] transition-all cursor-pointer"
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
