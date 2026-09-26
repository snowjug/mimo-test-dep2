import React from 'react';
import { IndianRupee, Printer, CheckCircle2, ShoppingBag, ArrowUpRight, Cpu, Users, Undo2 } from 'lucide-react';
import { useRange } from '../../context/RangeContext';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { insights } from '../../services/insights.service';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { LiveIndicator } from '../../components/ui/LiveIndicator';
import { Delta, ErrorBanner, PeriodComparison, TrendChart, TruncatedNote } from '../../components/insights/InsightBits';
import { describeRange } from '../../lib/dateRange';
import { dateTime, inr, int, pct, timeAgo } from '../../lib/format';
import { EmptyState, LevelBar } from '../../components/ui/shared';

const Card: React.FC<{ title?: string; subtitle?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ title, subtitle, action, className = '', children }) => (
  <section className={`p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs ${className}`}>
    {(title || action) && (
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          {title && <h2 className="text-sm font-bold text-[var(--text-1)]">{title}</h2>}
          {subtitle && <p className="text-xs text-[var(--text-3)] mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
    )}
    {children}
  </section>
);

const Kpi: React.FC<{ title: string; value: string; icon: React.ReactNode; tint: string; sub?: React.ReactNode; loading: boolean }> = ({ title, value, icon, tint, sub, loading }) => (
  <div className="p-4 sm:p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
    <div className="flex items-center justify-between mb-3">
      <span className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">{title}</span>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${tint}`}>{icon}</div>
    </div>
    {loading ? <div className="skeleton h-8 w-28" /> : <p className="text-2xl sm:text-3xl font-black text-[var(--text-1)] tabular-nums">{value}</p>}
    <div className="mt-1.5 min-h-[16px]">{!loading && sub}</div>
  </div>
);

export const OverviewPage: React.FC = () => {
  const { range, setRange, current, live } = useRange();
  const analytics = useLiveQuery(() => insights.analytics(current()), [range], { live });
  const kiosks = useLiveQuery(() => insights.kiosks(current()), [range], { live });
  const jobs = useLiveQuery(() => insights.jobs(current(), { limit: 8 }), [range], { live });

  const a = analytics.data;
  const cur = a?.current;
  const prev = a?.previous?.summary;
  const loading = analytics.loading;

  return (
    <div className="space-y-6 animate-fadeIn font-sans select-none">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-1)]">Platform Overview</h1>
          <p className="text-xs sm:text-sm text-[var(--text-2)] mt-1">Live revenue, print volume and machine health · {describeRange(range)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LiveIndicator updatedAt={analytics.updatedAt} live={live} fetching={analytics.fetching} onRefresh={() => { analytics.refresh(); kiosks.refresh(); jobs.refresh(); }} />
          <DateRangePicker value={range} onChange={setRange} tone="admin" />
        </div>
      </div>

      {analytics.error && <ErrorBanner message={analytics.error} onRetry={analytics.refresh} />}
      <TruncatedNote show={a?.truncated} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi title="Revenue" loading={loading} value={cur ? inr(cur.revenue) : '—'} icon={<IndianRupee size={16} />} tint="bg-indigo-500/10 text-indigo-500"
          sub={cur && <Delta current={cur.revenue} previous={prev?.revenue} />} />
        <Kpi title="Orders" loading={loading} value={cur ? int(cur.orders) : '—'} icon={<ShoppingBag size={16} />} tint="bg-blue-500/10 text-blue-500"
          sub={cur && <Delta current={cur.orders} previous={prev?.orders} />} />
        <Kpi title="Pages printed" loading={loading} value={cur ? int(cur.pages) : '—'} icon={<Printer size={16} />} tint="bg-amber-500/10 text-amber-500"
          sub={cur && <Delta current={cur.pages} previous={prev?.pages} />} />
        <Kpi title="Print success rate" loading={loading} value={cur ? pct(cur.successRate) : '—'} icon={<CheckCircle2 size={16} />} tint="bg-emerald-500/10 text-emerald-500"
          sub={cur && <span className="text-[11px] text-[var(--text-3)]">{cur.completedJobs} printed · {cur.failedJobs} failed</span>} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi title="Net revenue" loading={loading} value={cur ? inr(cur.netRevenue) : '—'} icon={<IndianRupee size={16} />} tint="bg-violet-500/10 text-violet-500"
          sub={cur && <span className="text-[11px] text-[var(--text-3)]">after {inr(cur.refundedAmount)} refunds</span>} />
        <Kpi title="Avg order value" loading={loading} value={cur ? inr(cur.avgOrderValue) : '—'} icon={<ShoppingBag size={16} />} tint="bg-sky-500/10 text-sky-500"
          sub={cur && <span className="text-[11px] text-[var(--text-3)]">{cur.freeOrders} free / coupon orders</span>} />
        <Kpi title="New users" loading={loading} value={cur ? int(cur.newUsers) : '—'} icon={<Users size={16} />} tint="bg-pink-500/10 text-pink-500"
          sub={cur && <Delta current={cur.newUsers} previous={prev?.newUsers} />} />
        <Kpi title="Refunds" loading={loading} value={cur ? int(cur.refundCount) : '—'} icon={<Undo2 size={16} />} tint="bg-rose-500/10 text-rose-500"
          sub={cur && <Delta current={cur.refundedAmount} previous={prev?.refundedAmount} goodWhenDown />} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2" title="Revenue & volume" subtitle={a ? `${a.range.granularity === 'hour' ? 'Hourly' : 'Daily'} · ${describeRange(range)}` : undefined}>
          {a ? <TrendChart series={a.series} tone="admin" /> : <div className="skeleton h-[300px]" />}
        </Card>

        <Card title="Machines" subtitle="Live status from each kiosk's heartbeat"
          action={<span className="text-[11px] font-bold text-[var(--text-3)]">{kiosks.data ? `${kiosks.data.summary.online}/${kiosks.data.summary.total} online` : ''}</span>}>
          {kiosks.error && <ErrorBanner message={kiosks.error} onRetry={kiosks.refresh} />}
          {kiosks.loading && <div className="space-y-3"><div className="skeleton h-24" /><div className="skeleton h-24" /></div>}
          <div className="space-y-3">
            {kiosks.data?.kiosks.map((k) => {
              const paper = k.printers.find((p) => p.paperPct !== null);
              return (
                <div key={k.kioskId} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/50">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${k.online ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                      <span className="text-sm font-bold text-[var(--text-1)] truncate">{k.name} <span className="font-mono text-[11px] text-[var(--text-3)]">{k.kioskId}</span></span>
                    </div>
                    <span className={`text-[11px] font-bold ${k.online ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{k.online ? 'Online' : 'Offline'}</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-3)] mt-1 truncate" title={k.printerStatus || ''}>
                    {k.printerStatus || (k.lastSeen ? `Last seen ${timeAgo(k.lastSeen)}` : 'No heartbeat received yet')}
                  </p>
                  {paper && <div className="mt-2"><LevelBar value={paper.paperPct ?? 0} label={`Paper · ${paper.paperLevel}/${paper.paperCapacity} sheets`} /></div>}
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--text-2)]">
                    <span><b className="text-[var(--text-1)]">{k.stats.jobs}</b> jobs</span>
                    <span><b className="text-[var(--text-1)]">{k.stats.pages}</b> pages</span>
                    <span><b className="text-[var(--text-1)]">{inr(k.stats.revenue)}</b></span>
                    {(k.queue.paid + k.queue.printing) > 0 && <span className="ml-auto text-amber-600 dark:text-amber-400 font-bold">{k.queue.printing} printing · {k.queue.paid} queued</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card title="Compared with the previous period" subtitle={a?.previous ? `${describeRange(range)} vs the ${Math.round((new Date(a.previous.to).getTime() - new Date(a.previous.from).getTime()) / 86400000) || 1}-day period before it` : undefined}>
          {a ? <PeriodComparison current={a.current} previous={a.previous?.summary ?? null} tone="admin" /> : <div className="skeleton h-64" />}
        </Card>

        <Card className="xl:col-span-2" title="Recent print jobs" subtitle={jobs.data ? `Latest ${jobs.data.jobs.length} of ${jobs.data.total} in this period` : undefined}
          action={<span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400"><Cpu size={12} /> Full list in Print Operations <ArrowUpRight size={12} /></span>}>
          {jobs.error && <ErrorBanner message={jobs.error} onRetry={jobs.refresh} />}
          {jobs.loading ? <div className="skeleton h-48" /> : jobs.data && jobs.data.jobs.length === 0 ? (
            <EmptyState icon={<Printer size={20} />} title="No print jobs in this period" description="New jobs appear here automatically." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-[var(--text-3)] border-b border-[var(--border)]">
                    <th className="py-2 pr-3 font-bold">Document</th><th className="py-2 pr-3 font-bold">Customer</th><th className="py-2 pr-3 font-bold">Machine</th>
                    <th className="py-2 pr-3 font-bold">Pages</th><th className="py-2 pr-3 font-bold">Amount</th><th className="py-2 pr-3 font-bold">Status</th><th className="py-2 font-bold text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.data?.jobs.map((j) => (
                    <tr key={j.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2.5 pr-3 font-semibold text-[var(--text-1)] max-w-[180px] truncate" title={j.file}>{j.file}</td>
                      <td className="py-2.5 pr-3 text-[var(--text-2)] max-w-[160px] truncate" title={j.userEmail}>{j.userEmail}</td>
                      <td className="py-2.5 pr-3 font-mono text-[var(--text-2)]">{j.destination}</td>
                      <td className="py-2.5 pr-3 tabular-nums text-[var(--text-2)]">{j.totalPages}</td>
                      <td className="py-2.5 pr-3 tabular-nums font-semibold text-[var(--text-1)]">{inr(j.cost)}</td>
                      <td className="py-2.5 pr-3"><StatusPill status={j.status} /></td>
                      <td className="py-2.5 text-right text-[var(--text-3)] whitespace-nowrap">{dateTime(j.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const s = status.toLowerCase();
  const cls = ['completed', 'printed'].includes(s) ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    : ['failed', 'refunded'].includes(s) ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
    : ['printing', 'paid'].includes(s) ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
    : 'bg-slate-500/10 text-slate-500';
  return <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold capitalize ${cls}`}>{status}</span>;
};
