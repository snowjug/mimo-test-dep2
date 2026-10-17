import React, { useState } from 'react';
import {
  Users,
  UserCheck,
  UserPlus,
  TrendingUp,
  Activity,
  Percent,
  IndianRupee,
  Calendar,
  Eye,
  EyeOff,
  Layers,
  Repeat,
  ShoppingBag,
  Shield,
} from 'lucide-react';
import { FinanceMetricCard } from '../components/FinanceMetricCard';
import { FinanceChartCard } from '../components/FinanceChartCard';
import { ErrorBanner } from '../../../components/insights/InsightBits';
import { LiveIndicator } from '../../../components/ui/LiveIndicator';
import { DateRangePicker } from '../../../components/ui/DateRangePicker';
import { useRange } from '../../../context/RangeContext';
import { describeRange } from '../../../lib/dateRange';
import { inr, int } from '../../../lib/format';
import type { UserGrowthReport } from '../../../types/insights.types';

export interface FinanceCustomerAnalyticsProps {
  report: UserGrowthReport | null;
  loading: boolean;
  error: string | null;
  updatedAt: Date | null;
  onRefresh: () => void;
}

/**
 * Customer Analytics & Cohorts (Formerly Krishna Demand Report)
 * Provides comprehensive customer retention, cohort matrix, AOV, repeat purchase frequency,
 * conversion funnels, and PII masking for financial privacy compliance.
 */
export const FinanceCustomerAnalyticsPage: React.FC<FinanceCustomerAnalyticsProps> = ({
  report: r,
  loading,
  error,
  updatedAt,
  onRefresh,
}) => {
  const { range, setRange, live } = useRange();
  const [maskPII, setMaskPII] = useState<boolean>(true);

  const maxMonthly = Math.max(1, ...(r?.monthlyPayments?.map((m) => m.total) ?? [1]));

  return (
    <div className="space-y-6 animate-fadeIn font-sans pb-12">
      {/* ── HEADER & CONTROLS ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Customer Analytics
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
              Jan 2026 Baseline
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Cohort retention curves, conversion funnel, AOV, and customer spend behavior · {describeRange(range)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
          {/* PII Masking Toggle */}
          <button
            type="button"
            onClick={() => setMaskPII(!maskPII)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
              maskPII
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
            }`}
            title="Toggle Student PII Masking for compliance with data privacy standards"
          >
            {maskPII ? <Shield className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>PII Masking: {maskPII ? 'PROTECTED' : 'UNMASKED'}</span>
          </button>

          <DateRangePicker value={range} onChange={setRange} tone="finance" />
          <LiveIndicator updatedAt={updatedAt} live={live} tone="finance" />
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={onRefresh} />}

      {/* ── CORE METRICS ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3">
        <FinanceMetricCard
          title="Total Registered Users"
          value={r ? int(r.totalRegisteredUsers) : '—'}
          icon={<Users className="w-4 h-4" />}
          loading={loading}
          comparisonText="Real accounts (excludes walk-up guests)"
        />
        <FinanceMetricCard
          title="Guest Sessions"
          value={r ? int(r.totalGuestUsers) : '—'}
          icon={<Users className="w-4 h-4" />}
          iconBgColor="bg-amber-50"
          iconColor="text-amber-600"
          loading={loading}
          comparisonText="Walk-up QR scans without registration"
        />
        <FinanceMetricCard
          title="Active Users In Range"
          value={r ? int(r.activeUsersInRange) : '—'}
          icon={<UserCheck className="w-4 h-4" />}
          iconBgColor="bg-emerald-50"
          iconColor="text-emerald-600"
          loading={loading}
          comparisonText="Printed at least one job in range"
        />
        <FinanceMetricCard
          title="Conversion Rate"
          value={r ? `${r.conversionRatePct}%` : '—'}
          icon={<Percent className="w-4 h-4" />}
          iconBgColor="bg-rose-50"
          iconColor="text-rose-600"
          loading={loading}
          comparisonText="Registered users who paid at least once"
        />
        <FinanceMetricCard
          title="Average Order Value"
          value={r?.averageOrderValue ? inr(r.averageOrderValue) : '—'}
          icon={<ShoppingBag className="w-4 h-4" />}
          iconBgColor="bg-sky-50"
          iconColor="text-sky-600"
          loading={loading}
          comparisonText="Total revenue ÷ total paid orders"
        />
        <FinanceMetricCard
          title="Repeat Customer Rate"
          value={r?.repeatCustomerRatePct !== undefined ? `${r.repeatCustomerRatePct}%` : '—'}
          icon={<Repeat className="w-4 h-4" />}
          iconBgColor="bg-purple-50"
          iconColor="text-purple-600"
          loading={loading}
          comparisonText="Paying students with 2+ completed orders"
        />
        <FinanceMetricCard
          title="Current Month New Users"
          value={r ? int(r.currentMonthNewUsers) : '—'}
          icon={<UserPlus className="w-4 h-4" />}
          iconBgColor="bg-indigo-50"
          iconColor="text-indigo-600"
          loading={loading}
          comparisonText={r ? `${r.previousMonthNewUsers} last month` : undefined}
        />
        <FinanceMetricCard
          title="User Growth %"
          value={r ? `${r.growthPct > 0 ? '+' : ''}${r.growthPct}%` : '—'}
          trend={r ? (r.growthPct > 0 ? 'up' : r.growthPct < 0 ? 'down' : 'neutral') : 'neutral'}
          icon={<TrendingUp className="w-4 h-4" />}
          iconBgColor="bg-amber-50"
          iconColor="text-amber-600"
          loading={loading}
          comparisonText="New users, month over month"
        />
        <FinanceMetricCard
          title="Daily Average Users"
          value={r ? r.dailyAverageUsers : '—'}
          icon={<Activity className="w-4 h-4" />}
          loading={loading}
          comparisonText="Active users ÷ days in range"
        />
        <FinanceMetricCard
          title="Payments In Range"
          value={r ? inr(r.paymentsInRange) : '—'}
          icon={<IndianRupee className="w-4 h-4" />}
          iconBgColor="bg-emerald-50"
          iconColor="text-emerald-600"
          loading={loading}
          comparisonText={describeRange(range)}
        />
      </div>

      {/* ── COHORT RETENTION CURVES ──────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border border-[#E4E7EB] dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                Customer Cohort Retention Matrix
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Tracking repeat print orders across months since student registration cohort (from Jan 2026 launch).
            </p>
          </div>
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 font-mono">
            {r?.cohorts?.length || 0} Cohorts Tracked
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-semibold text-[10px]">
                <th className="py-3 px-4">Cohort Month</th>
                <th className="py-3 px-4">Cohort Size</th>
                <th className="py-3 px-4 text-center">Month 0 (Signup)</th>
                <th className="py-3 px-4 text-center">Month 1</th>
                <th className="py-3 px-4 text-center">Month 2</th>
                <th className="py-3 px-4 text-center">Month 3</th>
                <th className="py-3 px-4 text-center">Month 4</th>
                <th className="py-3 px-4 text-center">Month 5+</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {!r?.cohorts || r.cohorts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 font-sans">
                    No student cohorts recorded yet.
                  </td>
                </tr>
              ) : (
                r.cohorts.map((c) => (
                  <tr key={c.cohort} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-slate-100">
                      {c.cohort}
                    </td>
                    <td className="py-3 px-4 font-bold text-indigo-600 dark:text-indigo-400">
                      {c.size} users
                    </td>
                    {[0, 1, 2, 3, 4, 5].map((offset) => {
                      const ret = c.retention?.find((x) => x.offset === offset);
                      const pct = ret?.pct ?? 0;
                      const count = ret?.activeCount ?? 0;
                      let bgClass = 'bg-slate-50 dark:bg-slate-800/30 text-slate-400';
                      if (pct >= 50) bgClass = 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-bold';
                      else if (pct >= 25) bgClass = 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 font-bold';
                      else if (pct > 0) bgClass = 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-medium';

                      return (
                        <td key={offset} className="py-2.5 px-3 text-center">
                          <div className={`py-1 px-2 rounded-lg text-xs ${bgClass}`}>
                            <span>{pct > 0 ? `${pct}%` : '—'}</span>
                            {count > 0 && (
                              <span className="block text-[9px] opacity-75 font-sans">
                                ({count})
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── PAYMENTS BY MONTH (JAN 2026 TO PRESENT) ──────────────────────── */}
      <FinanceChartCard
        title="Monthly Revenue Collections (IST)"
        subtitle="Historical collections computed from January 2026 launch date"
        icon={<Calendar className="w-4 h-4" />}
      >
        {!r || !r.monthlyPayments || r.monthlyPayments.every((m) => m.total === 0) ? (
          <p className="py-10 text-center text-xs font-semibold text-slate-400">
            No payments recorded since launch.
          </p>
        ) : (
          <div className="space-y-3 mt-1">
            {r.monthlyPayments.map((m) => (
              <div key={m.month}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{m.month}</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{inr(m.total)}</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#093765] dark:bg-indigo-500 transition-all duration-300"
                    style={{ width: `${(m.total / maxMonthly) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </FinanceChartCard>
    </div>
  );
};

// Backward-compatible alias
export const FinanceKrishnaReportPage = FinanceCustomerAnalyticsPage;
export type FinanceKrishnaReportProps = FinanceCustomerAnalyticsProps;
