import React, { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import { useRange } from '../../context/RangeContext';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { insights } from '../../services/insights.service';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { LiveIndicator } from '../../components/ui/LiveIndicator';
import { Delta, ErrorBanner, PeriodComparison, TrendChart, TruncatedNote } from '../../components/insights/InsightBits';
import { ExecutiveReportsHub } from '../../components/insights/ExecutiveReportsHub';
import { bucketLabel, describeRange } from '../../lib/dateRange';
import { inr, int, pct } from '../../lib/format';
import { exportAnalyticsPdf } from '../../lib/pdfExport';
import type { Analytics } from '../../types/insights.types';

const COLORS = ['#093765', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8FB3DC'];
const OK_COLOR = '#10b981';
const FAIL_COLOR = '#f43f5e';

const Card: React.FC<{ title: string; subtitle?: string; className?: string; children: React.ReactNode }> = ({ title, subtitle, className = '', children }) => (
  <section className={`p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs ${className}`}>
    <h2 className="text-sm font-bold text-[var(--text-1)]">{title}</h2>
    {subtitle && <p className="text-xs text-[var(--text-3)] mt-0.5">{subtitle}</p>}
    <div className="mt-4">{children}</div>
  </section>
);
const NoData: React.FC<{ text?: string }> = ({ text = 'No data in this period' }) => <p className="py-10 text-center text-xs font-semibold text-[var(--text-3)]">{text}</p>;

export const AnalyticsPage: React.FC = () => {
  const [viewMode, setViewMode] = useState<'kpis' | 'reports'>('kpis');
  const { range, setRange, current, live } = useRange();
  const q = useLiveQuery(() => insights.analytics(current()), [range], { live });
  const a = q.data;

  const hours = a?.byHour.filter((h) => h.jobs > 0) ?? [];
  const modePie = a ? [
    { name: 'Colour', value: a.modes.color.pages },
    { name: 'Black & white', value: a.modes.bw.pages },
  ].filter((m) => m.value > 0) : [];
  const sidePie = a ? [
    { name: 'Double-sided', value: a.modes.duplex.pages },
    { name: 'Single-sided', value: a.modes.simplex.pages },
  ].filter((m) => m.value > 0) : [];
  // `reporting` is absent if the dashboard is newer than the deployed API; tiles then show "—" instead of guessing.
  const rep = a?.reporting;
  const outcomeSeries = a && rep ? a.series.map((p) => ({ label: bucketLabel(p.key), successful: p.successful ?? 0, failed: p.reportFailed ?? 0, issues: p.issues ?? 0 })) : [];
  const anyOutcome = outcomeSeries.some((p) => p.successful > 0 || p.failed > 0);
  const issueBars = rep ? rep.issues.byCategory.filter((c) => c.count > 0).sort((x, y) => y.count - x.count) : [];
  const unranked = a && rep ? a.byKiosk.filter((k) => k.reporting && !k.reporting.rankable && k.reporting.attempts > 0) : [];
  const dash = '—';
  const kpis = [
    { label: 'Net revenue', value: rep ? inr(rep.revenue.net) : dash, sub: rep ? `${inr(rep.revenue.gross)} gross · ${inr(rep.revenue.refunded)} refunded` : undefined, cur: rep?.revenue.net, prev: a?.previous?.summary.netRevenue },
    { label: 'Total print jobs', value: rep ? int(rep.jobs.total) : dash, sub: rep ? `${int(rep.jobs.inProgress)} in progress · ${int(rep.jobs.abandoned)} never collected` : undefined },
    { label: 'Successful jobs', value: rep ? int(rep.jobs.successful) : dash, sub: rep ? `${int(rep.jobs.pages)} pages printed` : undefined },
    { label: 'Failed jobs', value: rep ? int(rep.jobs.failed) : dash, sub: rep && rep.jobs.refundedUnprinted > 0 ? `+${int(rep.jobs.refundedUnprinted)} refunded before printing` : undefined, tone: rep && rep.jobs.failed > 0 ? 'text-rose-600' : undefined },
    { label: 'Success rate', value: rep ? pct(rep.jobs.successRate) : dash, sub: 'Successful ÷ (successful + failed)' },
    { label: 'Pages printed', value: rep ? int(rep.jobs.pages) : dash, sub: a ? `${int(a.current.bwPages)} B&W · ${int(a.current.colorPages)} colour` : undefined },
    { label: 'Issues', value: rep ? int(rep.issues.total) : dash, sub: rep ? `${rep.issues.detected} detected · ${rep.issues.customerReported} reported · ${rep.issues.payment} payment` : undefined },
  ];

  return (
    <div className="space-y-6 animate-fadeIn font-sans select-none">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-1)]">Analytics &amp; Reports</h1>
          <p className="text-xs sm:text-sm text-[var(--text-2)] mt-1">Demand, utilisation, unit economics &amp; strategic reports</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl bg-[var(--surface-2)] p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('kpis')}
              className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'kpis'
                  ? 'bg-[var(--surface)] text-[var(--text-1)] shadow-xs font-bold'
                  : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
              }`}
            >
              Fleet Operations &amp; KPIs
            </button>
            <button
              type="button"
              onClick={() => setViewMode('reports')}
              className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'reports'
                  ? 'bg-[var(--surface)] text-[var(--text-1)] shadow-xs font-bold'
                  : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
              }`}
            >
              Strategic Reports &amp; Profitability
            </button>
          </div>

          {viewMode === 'kpis' && (
            <>
              <LiveIndicator updatedAt={q.updatedAt} live={live} fetching={q.fetching} onRefresh={q.refresh} />
              <DateRangePicker value={range} onChange={setRange} tone="admin" />
              <button type="button" disabled={!a} onClick={() => a && exportAnalyticsPdf(a, describeRange(range))}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-xs font-bold border border-[var(--border)] bg-[var(--surface)] text-[var(--text-1)] hover:bg-[var(--surface-2)] transition-all cursor-pointer shadow-xs disabled:opacity-50">
                <Download size={13} className="text-indigo-600 dark:text-indigo-400" /> Export PDF Report
              </button>
            </>
          )}
        </div>
      </div>

      {viewMode === 'reports' ? (
        <ExecutiveReportsHub />
      ) : (
        <>
          {q.error && <ErrorBanner message={q.error} onRetry={q.refresh} />}
          <TruncatedNote show={a?.truncated} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="p-4 sm:p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs min-w-0">
            <span className="text-xs font-bold text-[var(--text-2)]">{k.label}</span>
            {q.loading ? <div className="skeleton h-8 w-24 mt-3" /> : <p className={`text-2xl sm:text-3xl font-black mt-2 tabular-nums ${k.tone ?? 'text-[var(--text-1)]'}`}>{k.value}</p>}
            {!q.loading && k.sub && <p className="mt-1 truncate text-[11px] text-[var(--text-3)]">{k.sub}</p>}
            {!q.loading && k.cur !== undefined && k.cur !== null && <div className="mt-1.5 min-h-[16px]"><Delta current={k.cur} previous={k.prev} /></div>}
          </div>
        ))}
      </div>
      {rep?.issues.partial && <p className="text-[11px] text-amber-600">Refund requests could not be fully loaded, so payment issues may be undercounted.</p>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="Successful vs failed jobs" subtitle={a ? `${a.range.granularity === 'hour' ? 'Hourly' : 'Daily'}, by when the job was created · in-progress and refunded-before-printing jobs are not shown` : undefined}>
          {!a ? <div className="skeleton h-56" /> : !rep || !anyOutcome ? <NoData /> : (
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={outcomeSeries} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="successful" name="Successful" stackId="o" fill={OK_COLOR} isAnimationActive={false} />
                  <Bar dataKey="failed" name="Failed" stackId="o" fill={FAIL_COLOR} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Issues by category" subtitle="Deduplicated issues in this period. Categories from failure text are inferred; see Incidents for the evidence.">
          {!a ? <div className="skeleton h-56" /> : !rep || issueBars.length === 0 ? <NoData text={rep ? 'No issues in this period' : undefined} /> : (
            <div style={{ height: Math.max(120, issueBars.length * 34) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={issueBars} layout="vertical" margin={{ left: 10, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="count" name="Issues" fill="#f59e0b" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <Card title="Most problematic machines" subtitle={rep ? `Failure rate = failed ÷ (successful + failed). Ranked only with at least ${rep.minAttemptsToRank} finished jobs in this period.` : undefined}>
        {!a ? <div className="skeleton h-24" /> : !rep ? <NoData /> : (
          <>
            {(a.problemMachines ?? []).length === 0 ? <NoData text="No machine has enough finished jobs in this period to rank" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[var(--text-3)]">
                      <th className="py-2 pr-3 font-bold">#</th><th className="py-2 pr-3 font-bold">Machine</th>
                      <th className="py-2 pr-3 font-bold text-right">Failure rate</th><th className="py-2 pr-3 font-bold text-right">Failed</th>
                      <th className="py-2 pr-3 font-bold text-right">Finished jobs</th><th className="py-2 font-bold text-right">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(a.problemMachines ?? []).map((m, i) => (
                      <tr key={m.kioskId} className="border-t border-[var(--border)] text-[var(--text-2)]">
                        <td className="py-2 pr-3 tabular-nums">{i + 1}</td>
                        <td className="py-2 pr-3"><b className="text-[var(--text-1)]">{m.name}</b> <span className="font-mono text-[var(--text-3)]">{m.kioskId}</span></td>
                        <td className={`py-2 pr-3 text-right font-bold tabular-nums ${m.failureRate > 0 ? 'text-rose-600' : 'text-[var(--text-1)]'}`}>{pct(m.failureRate)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{int(m.failed)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{int(m.attempts)}</td>
                        <td className="py-2 text-right tabular-nums">{int(m.issues)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {unranked.length > 0 && (
              <p className="mt-3 text-[11px] text-[var(--text-3)]">
                Too few jobs to rank: {unranked.map((k) => `${k.name} (${k.reporting!.failed} failed of ${k.reporting!.attempts})`).join(' · ')}
              </p>
            )}
          </>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2" title="Trend" subtitle={a ? `${a.range.granularity === 'hour' ? 'Hourly' : 'Daily'} totals for the selected dates` : undefined}>
          {a ? <TrendChart series={a.series} tone="admin" metrics={['revenue', 'orders', 'pages', 'jobs']} height={360} /> : <div className="skeleton h-[320px]" />}
        </Card>
        <Card title="Selected period vs previous" subtitle="The previous period is the same number of days immediately before">
          {a ? <PeriodComparison current={a.current} previous={a.previous?.summary ?? null} tone="admin" /> : <div className="skeleton h-72" />}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <Card title="Pages per machine" subtitle="Printed pages, revenue and failures by kiosk">
          {!a ? <div className="skeleton h-56" /> : (
            <>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={a.byKiosk} margin={{ left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
                    <XAxis dataKey="kioskId" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Bar dataKey="pages" name="Pages" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                      {a.byKiosk.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-3 space-y-1.5 text-xs">
                {a.byKiosk.map((k) => (
                  <li key={k.kioskId} className="flex items-center justify-between gap-3 text-[var(--text-2)]">
                    <span><b className="text-[var(--text-1)]">{k.name}</b> <span className="font-mono text-[var(--text-3)]">{k.kioskId}</span></span>
                    <span className="tabular-nums">{int(k.pages)} pages · {inr(k.revenue)}{k.failed > 0 && <span className="text-rose-600"> · {k.failed} failed</span>}</span>
                  </li>
                ))}
                {a.unassignedRevenue > 0 && <li className="text-[11px] text-[var(--text-3)]">{inr(a.unassignedRevenue)} of revenue could not be tied to a machine.</li>}
              </ul>
            </>
          )}
        </Card>

        <Card title="Colour vs black &amp; white" subtitle="Share of printed pages">
          {!a ? <div className="skeleton h-56" /> : modePie.length === 0 ? <NoData /> : (
            <MiniPie data={modePie} />
          )}
        </Card>

        <Card title="Single vs double-sided" subtitle="Share of printed pages">
          {!a ? <div className="skeleton h-56" /> : sidePie.length === 0 ? <NoData /> : (
            <MiniPie data={sidePie} />
          )}
        </Card>

        <Card title="Peak hours" subtitle="Print jobs by hour of day (India time, IST)" className="lg:col-span-2">
          {!a ? <div className="skeleton h-56" /> : hours.length === 0 ? <NoData /> : (
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={a.byHour} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
                  <XAxis dataKey="hour" tickFormatter={(h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={1} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip labelFormatter={(h: number) => `${h}:00 – ${h}:59`} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="jobs" name="Jobs" fill="#093765" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Payment methods" subtitle="Paid orders by how customers paid">
          {!a ? <div className="skeleton h-56" /> : a.byPaymentMethod.length === 0 ? <NoData /> : (
            <ul className="space-y-3">
              {a.byPaymentMethod.map((m, i) => {
                const total = a.byPaymentMethod.reduce((x, y) => x + y.count, 0) || 1;
                return (
                  <li key={m.method}>
                    <div className="flex justify-between text-xs mb-1"><span className="font-bold text-[var(--text-1)]">{m.method}</span><span className="text-[var(--text-2)] tabular-nums">{m.count} orders · {inr(m.amount)}</span></div>
                    <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(m.count / total) * 100}%`, background: COLORS[i % COLORS.length] }} /></div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Job outcomes" subtitle="Where this period's print jobs ended up" className="lg:col-span-2 xl:col-span-3">
          {!a ? <div className="skeleton h-16" /> : a.byStatus.length === 0 ? <NoData /> : (
            <div className="flex flex-wrap gap-3">
              {a.byStatus.sort((x, y) => y.count - x.count).map((s) => (
                <div key={s.status} className="px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/50 min-w-[110px]">
                  <p className="text-[10px] font-bold text-[var(--text-3)] capitalize">{s.status}</p>
                  <p className="text-xl font-black text-[var(--text-1)] tabular-nums">{int(s.count)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
        </>
      )}
    </div>
  );
};

const MiniPie: React.FC<{ data: { name: string; value: number }[] }> = ({ data }) => {
  const total = data.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <div className="flex items-center gap-4">
      <div style={{ width: 150, height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={2} isAnimationActive={false}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: number) => `${int(v)} pages`} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-2 text-xs">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2 text-[var(--text-2)]">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="font-bold text-[var(--text-1)]">{d.name}</span> {Math.round((d.value / total) * 100)}% <span className="text-[var(--text-3)]">({int(d.value)})</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
