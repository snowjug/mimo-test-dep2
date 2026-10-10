import React from 'react';
import { Users, UserCheck, UserPlus, TrendingUp, Activity, Percent, IndianRupee, Calendar } from 'lucide-react';
import { FinanceMetricCard } from '../components/FinanceMetricCard';
import { FinanceChartCard } from '../components/FinanceChartCard';
import { ErrorBanner } from '../../../components/insights/InsightBits';
import { LiveIndicator } from '../../../components/ui/LiveIndicator';
import { DateRangePicker } from '../../../components/ui/DateRangePicker';
import { useRange } from '../../../context/RangeContext';
import { describeRange } from '../../../lib/dateRange';
import { inr, int } from '../../../lib/format';
import type { UserGrowthReport } from '../../../types/insights.types';

export interface FinanceKrishnaReportProps {
  report: UserGrowthReport | null;
  loading: boolean;
  error: string | null;
  updatedAt: Date | null;
  onRefresh: () => void;
}

/**
 * "Special Krishna Demand Report" — registered/active/new users, growth %, daily average, conversion rate
 * and payments by month. The date filter (today, last 30 days, a specific date, etc.) is the same
 * DateRangePicker every other Finance page already uses — picked here too, since this page's own numbers
 * are range-scoped server-side the same way.
 */
export const FinanceKrishnaReportPage: React.FC<FinanceKrishnaReportProps> = ({ report: r, loading, error, updatedAt, onRefresh }) => {
  const { range, setRange, live } = useRange();
  const maxMonthly = Math.max(1, ...(r?.monthlyPayments.map((m) => m.total) ?? [1]));

  return (
    <div className="space-y-6 animate-fadeIn font-sans pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Special Krishna Demand Report
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Registered &amp; active users, growth, conversion and payments · {describeRange(range)}
          </p>
        </div>
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <DateRangePicker value={range} onChange={setRange} tone="finance" />
          <LiveIndicator updatedAt={updatedAt} live={live} tone="finance" />
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={onRefresh} />}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
        <FinanceMetricCard
          title="Total Registered Users"
          value={r ? int(r.totalRegisteredUsers) : '—'}
          icon={<Users className="w-4 h-4" />}
          loading={loading}
          comparisonText="All-time, real accounts"
        />
        <FinanceMetricCard
          title="Active Users"
          value={r ? int(r.activeUsersInRange) : '—'}
          icon={<UserCheck className="w-4 h-4" />}
          iconBgColor="bg-emerald-50"
          iconColor="text-emerald-600"
          loading={loading}
          comparisonText="Printed at least once in range"
        />
        <FinanceMetricCard
          title="Current Month Users"
          value={r ? int(r.currentMonthNewUsers) : '—'}
          icon={<UserPlus className="w-4 h-4" />}
          iconBgColor="bg-indigo-50"
          iconColor="text-indigo-600"
          loading={loading}
          comparisonText={r ? `${r.previousMonthNewUsers} last month` : undefined}
        />
        <FinanceMetricCard
          title="Growth %"
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
          title="Customer Conversion Rate"
          value={r ? `${r.conversionRatePct}%` : '—'}
          icon={<Percent className="w-4 h-4" />}
          iconBgColor="bg-rose-50"
          iconColor="text-rose-600"
          loading={loading}
          comparisonText="Registered users who paid at least once"
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

      <FinanceChartCard
        title="Payments by month"
        subtitle="Trailing 6 months — independent of the date filter above"
        icon={<Calendar className="w-4 h-4" />}
      >
        {!r || r.monthlyPayments.every((m) => m.total === 0) ? (
          <p className="py-10 text-center text-xs font-semibold text-slate-400">No payments recorded in the trailing 6 months.</p>
        ) : (
          <div className="space-y-3 mt-1">
            {r.monthlyPayments.map((m) => (
              <div key={m.month}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{m.month}</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{inr(m.total)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-600" style={{ width: `${(m.total / maxMonthly) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </FinanceChartCard>
    </div>
  );
};
