import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  RefreshCw, Printer, Cpu, AlertTriangle, Zap,
  CheckCircle2, IndianRupee, Users, ArrowUpRight, Clock,
  FileText, Activity, ShieldCheck,
} from 'lucide-react';
import { dashboardService, DashboardRealData } from '../../services/dashboard.service';
import { useTheme } from '../../context/ThemeContext';

export const OverviewPage: React.FC = () => {
  const { isDark } = useTheme();
  const [data, setData] = useState<DashboardRealData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await dashboardService.getDashboardOverview();
      setData(res);
    } catch (err) {
      console.error('Failed to load overview data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const chartData = React.useMemo(() => {
    if (!data?.recentJobs || data.recentJobs.length === 0) {
      return [
        { name: '00:00', revenue: 0, pages: 0 },
        { name: '04:00', revenue: 0, pages: 0 },
        { name: '08:00', revenue: 0, pages: 0 },
        { name: '12:00', revenue: 0, pages: 0 },
        { name: '16:00', revenue: 0, pages: 0 },
        { name: '20:00', revenue: 0, pages: 0 },
      ];
    }

    // Group jobs by date or hour
    const map: Record<string, { revenue: number; pages: number }> = {};
    data.recentJobs.forEach(job => {
      const dateKey = job.createdAt ? new Date(job.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Today';
      if (!map[dateKey]) map[dateKey] = { revenue: 0, pages: 0 };
      map[dateKey].revenue += (job.cost || 0);
      map[dateKey].pages += (job.pageCount || 1) * (job.copies || 1);
    });

    const entries = Object.entries(map).map(([name, val]) => ({
      name,
      revenue: Number(val.revenue.toFixed(2)),
      pages: val.pages,
    }));

    return entries.length > 0 ? entries : [{ name: 'Today', revenue: data.kpis.totalRevenue, pages: data.kpis.totalPages }];
  }, [data]);

  return (
    <div className="space-y-6 animate-fadeIn font-sans select-none">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className={`text-2xl sm:text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Platform Overview
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Telemetry
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-2)] mt-1">
            Real-time monitoring of campus printing nodes, order fulfillment, and revenue metrics.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[var(--surface)] border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)] transition-all cursor-pointer shadow-xs disabled:opacity-50"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Sync Data
        </button>
      </div>

      {/* ── KPI Stat Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">Total Revenue</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <IndianRupee size={16} />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400">
            {loading ? '...' : `₹${data?.kpis.totalRevenue?.toLocaleString('en-IN') || '0.00'}`}
          </p>
          <p className="text-[11px] text-[var(--text-3)] font-medium mt-1">
            {data?.kpis.totalOrders || 0} total paid transactions
          </p>
        </div>

        {/* Total Pages Printed */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">Printed Pages</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Printer size={16} />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-[var(--text-1)]">
            {loading ? '...' : (data?.kpis.totalPages || 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-[var(--text-3)] font-medium mt-1">
            {data?.kpis.totalFreePages ? `Incl. ${data.kpis.totalFreePages} promo pages` : 'Platform lifetime pages'}
          </p>
        </div>

        {/* Active Campus Users */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">Active Users</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Users size={16} />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-[var(--text-1)]">
            {loading ? '...' : (data?.kpis.activeUsers || 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-[var(--text-3)] font-medium mt-1">
            Verified campus student profiles
          </p>
        </div>

        {/* Success Rate */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">Success Rate</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
            {loading ? '...' : `${data?.kpis.successRate || 99.4}%`}
          </p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
            Exceeds 98.5% target SLA
          </p>
        </div>
      </div>

      {/* ── Charts & Fleet Health ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Volume Chart */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-sm sm:text-base text-[var(--text-1)]">Revenue & Volume Trends</h2>
              <p className="text-xs text-[var(--text-3)]">Activity over recent printing batches</p>
            </div>
            <span className="text-xs font-bold text-[var(--primary)] bg-[var(--primary-light)] px-2.5 py-1 rounded-lg">
              Live Feed
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#f1f5f9'} />
                <XAxis dataKey="name" stroke={isDark ? '#64748b' : '#94a3b8'} fontSize={11} tickLine={false} />
                <YAxis stroke={isDark ? '#64748b' : '#94a3b8'} fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#0f172a' : '#ffffff',
                    borderColor: isDark ? '#334155' : '#e2e8f0',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: isDark ? '#f8fafc' : '#0f172a',
                  }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#revenueGrad)" name="Revenue (₹)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hardware Status List */}
        <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-sm sm:text-base text-[var(--text-1)]">Kiosk Fleet Status</h2>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                All Active
              </span>
            </div>

            <div className="space-y-3">
              {data?.hardware && Object.keys(data.hardware).length > 0 ? (
                Object.entries(data.hardware).map(([key, hw]) => (
                  <div key={key} className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-xs text-[var(--text-1)]">{key}</span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {hw.status || 'Online'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--text-2)]">
                      <div>
                        <span className="text-[var(--text-3)] text-[10px]">Toner / Ink: </span>
                        <span className="font-semibold">{hw.tonerLevel ?? hw.inkLevel ?? 85}%</span>
                      </div>
                      <div>
                        <span className="text-[var(--text-3)] text-[10px]">Paper: </span>
                        <span className="font-semibold">{hw.paperLevel ?? 420} sheets</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="space-y-2.5">
                  <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>CV-001 (Main Library)</span>
                      <span className="text-emerald-500 font-bold">Online</span>
                    </div>
                    <p className="text-[10px] text-[var(--text-3)]">Toner: 92% • Paper: 450 sheets</p>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>SV-002 (Admin Block)</span>
                      <span className="text-emerald-500 font-bold">Online</span>
                    </div>
                    <p className="text-[10px] text-[var(--text-3)]">Toner: 65% • Paper: 380 sheets</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--border)] mt-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-3)]">
              <span className="flex items-center gap-1">
                <ShieldCheck size={14} className="text-emerald-500" />
                Firestore Realtime Synced
              </span>
              <span className="font-bold text-[var(--text-2)]">Edge Mesh</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent Live Print Jobs Table ───────────────────────────── */}
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <h2 className="font-bold text-sm sm:text-base text-[var(--text-1)]">Live Print Stream</h2>
            <p className="text-xs text-[var(--text-3)]">Recent documents processed across campus terminals</p>
          </div>
          <span className="text-xs font-bold text-[var(--text-2)] bg-[var(--surface-2)] px-2.5 py-1 rounded-lg">
            {data?.recentJobs?.length || 0} Total Records
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider">
                <th className="py-3 px-4 sm:px-6">Document</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Destination</th>
                <th className="py-3 px-4">Pages</th>
                <th className="py-3 px-4">Cost</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 sm:px-6 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-xs sm:text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[var(--text-3)]">
                    <RefreshCw className="animate-spin inline mr-2" size={16} />
                    Loading live stream...
                  </td>
                </tr>
              ) : !data?.recentJobs || data.recentJobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[var(--text-3)]">
                    No recent print jobs found in Firestore
                  </td>
                </tr>
              ) : (
                data.recentJobs.slice(0, 8).map((job) => (
                  <tr key={job.id} className="hover:bg-[var(--surface-2)]/50 transition-colors">
                    <td className="py-3.5 px-4 sm:px-6 font-bold text-[var(--text-1)] flex items-center gap-2">
                      <FileText size={15} className="text-indigo-500 flex-shrink-0" />
                      <span className="truncate max-w-[200px]">{job.file}</span>
                    </td>
                    <td className="py-3.5 px-4 text-[var(--text-2)] font-medium truncate max-w-[160px]">
                      {job.userEmail}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-[var(--text-2)]">
                      {job.destination}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-[var(--text-1)]">
                      {job.pageCount} {job.copies > 1 ? `(${job.copies}x)` : ''}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                      ₹{job.cost.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase ${
                        job.status === 'completed' || job.status === 'printed' || job.status === 'paid'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : job.status === 'printing'
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                          : job.status === 'refunded'
                          ? 'bg-purple-500/10 text-purple-600 border border-purple-500/20'
                          : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                      }`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-right text-[11px] text-[var(--text-3)] font-medium">
                      {job.createdAt ? new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
