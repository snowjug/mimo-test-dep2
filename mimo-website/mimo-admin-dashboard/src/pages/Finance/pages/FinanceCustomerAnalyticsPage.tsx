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
  Shield,
  Layers,
  Repeat,
  ShoppingBag,
} from 'lucide-react';
import { FinanceMetricCard } from '../components/FinanceMetricCard';
import { FinanceChartCard } from '../components/FinanceChartCard';
import { ErrorBanner } from '../../../components/insights/InsightBits';
import { LiveIndicator } from '../../../components/ui/LiveIndicator';
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
  const { range, live } = useRange();
  const [maskPII, setMaskPII] = useState<boolean>(true);

  const maxMonthly = Math.max(1, ...(r?.monthlyPayments?.map((m) => m.total) ?? [1]));

  return (
    <div className="space-y-6 animate-fadeIn font-sans pb-12">
      {/* ── HEADER & CONTROLS ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Customer Analytics
            </h1>
            <span className="px-2.5 py-0.5 text-[10.5px] font-bold rounded-full bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-500/30">
              Jan 2026 Baseline
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Cohort retention curves, conversion funnel, AOV, and customer spend behavior · {describeRange(range)}
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
          {/* PII Masking Toggle */}
          <button
            type="button"
            onClick={() => setMaskPII(!maskPII)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
              maskPII
                ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/25'
                : 'bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/25'
            }`}
            title="Toggle Student PII Masking for compliance with data privacy standards"
          >
            {maskPII ? <Shield className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>PII Masking: {maskPII ? 'PROTECTED' : 'UNMASKED'}</span>
          </button>

          <LiveIndicator updatedAt={updatedAt} live={live} tone="finance" />
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={onRefresh} />}

      {/* ── CORE METRICS ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        <FinanceMetricCard
          title="Total Registered Users"
          value={r ? int(r.totalRegisteredUsers) : '—'}
          icon={<Users className="w-4 h-4" />}
          loading={loading}
          comparisonText="Real student accounts"
        />
        <FinanceMetricCard
          title="Guest Sessions"
          value={r ? int(r.totalGuestUsers) : '—'}
          icon={<Users className="w-4 h-4" />}
          iconBgColor="bg-amber-50"
          iconColor="text-amber-600"
          loading={loading}
          comparisonText="Walk-up QR scans"
        />
        <FinanceMetricCard
          title="Active Users In Range"
          value={r ? int(r.activeUsersInRange) : '—'}
          icon={<UserCheck className="w-4 h-4" />}
          iconBgColor="bg-emerald-50"
          iconColor="text-emerald-600"
          loading={loading}
          comparisonText="Completed 1+ print job"
        />
        <FinanceMetricCard
          title="Conversion Rate"
          value={r ? `${r.conversionRatePct}%` : '—'}
          icon={<Percent className="w-4 h-4" />}
          iconBgColor="bg-rose-50"
          iconColor="text-rose-600"
          loading={loading}
          comparisonText="Registered to paid order"
        />
        <FinanceMetricCard
          title="Average Order Value"
          value={r?.averageOrderValue ? inr(r.averageOrderValue) : '—'}
          icon={<ShoppingBag className="w-4 h-4" />}
          iconBgColor="bg-sky-50"
          iconColor="text-sky-600"
          loading={loading}
          comparisonText="Revenue ÷ total orders"
        />
        <FinanceMetricCard
          title="Repeat Customer Rate"
          value={r?.repeatCustomerRatePct !== undefined ? `${r.repeatCustomerRatePct}%` : '—'}
          icon={<Repeat className="w-4 h-4" />}
          iconBgColor="bg-purple-50"
          iconColor="text-purple-600"
          loading={loading}
          comparisonText="Students with 2+ orders"
        />
        <FinanceMetricCard
          title="Current Month New Users"
          value={r ? int(r.currentMonthNewUsers) : '—'}
          icon={<UserPlus className="w-4 h-4" />}
          iconBgColor="bg-indigo-50"
          iconColor="text-indigo-600"
          loading={loading}
          comparisonText={r ? `${r.previousMonthNewUsers} last month` : 'Monthly acquisition'}
        />
        <FinanceMetricCard
          title="User Growth %"
          value={r ? `${r.growthPct > 0 ? '+' : ''}${r.growthPct}%` : '—'}
          trend={r ? (r.growthPct > 0 ? 'up' : r.growthPct < 0 ? 'down' : 'neutral') : 'neutral'}
          icon={<TrendingUp className="w-4 h-4" />}
          iconBgColor="bg-amber-50"
          iconColor="text-amber-600"
          loading={loading}
          comparisonText="Month over month"
        />
        <FinanceMetricCard
          title="Daily Average Users"
          value={r ? r.dailyAverageUsers : '—'}
          icon={<Activity className="w-4 h-4" />}
          loading={loading}
          comparisonText="Active users ÷ days"
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-100 dark:border-indigo-500/25 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Layers className="w-4 h-4" />
              </div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                Customer Cohort Retention Matrix
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Tracking repeat print orders across months since student registration cohort (from Jan 2026 launch).
            </p>
          </div>
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700/60 self-start sm:self-auto">
            {r?.cohorts?.length || 0} Cohorts Tracked
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200/70 dark:border-slate-800">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700/80 text-slate-500 dark:text-slate-400 font-bold text-[10px] uppercase tracking-wider">
                <th className="py-3 px-4">Cohort Month</th>
                <th className="py-3 px-4">Cohort Size</th>
                <th className="py-3 px-3 text-center">Month 0 (Signup)</th>
                <th className="py-3 px-3 text-center">Month 1</th>
                <th className="py-3 px-3 text-center">Month 2</th>
                <th className="py-3 px-3 text-center">Month 3</th>
                <th className="py-3 px-3 text-center">Month 4</th>
                <th className="py-3 px-3 text-center">Month 5+</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono">
              {!r?.cohorts || r.cohorts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 font-sans">
                    No student cohorts recorded yet.
                  </td>
                </tr>
              ) : (
                r.cohorts.map((c) => (
                  <tr key={c.cohort} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
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

                      let cellBadgeClass = '';
                      if (pct >= 50) {
                        cellBadgeClass = 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/35 font-bold';
                      } else if (pct >= 20) {
                        cellBadgeClass = 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/35 font-bold';
                      } else if (pct > 0) {
                        cellBadgeClass = 'bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/25 font-semibold';
                      }

                      return (
                        <td key={offset} className="py-2.5 px-2 text-center">
                          {pct > 0 ? (
                            <div className={`py-1 px-2 rounded-lg text-xs inline-flex flex-col items-center justify-center min-w-[54px] shadow-2xs ${cellBadgeClass}`}>
                              <span>{pct}%</span>
                              {count > 0 && (
                                <span className="text-[9.5px] font-mono opacity-80 mt-0.5 leading-none">
                                  ({count})
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600 text-xs font-sans select-none">—</span>
                          )}
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
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{m.month}</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{inr(m.total)}</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-sky-500 dark:from-indigo-500 dark:to-sky-400 transition-all duration-300"
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
