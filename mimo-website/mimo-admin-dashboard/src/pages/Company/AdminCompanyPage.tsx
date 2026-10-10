import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, Users2, UserPlus, CalendarClock, FileText, Building2 } from 'lucide-react';
import { adminCompany } from '../../services/adminCompany.service';
import { Employee } from '../../services/hr.service';
import { ErrorBanner } from '../../components/insights/InsightBits';
import { errorMessage } from '../../hooks/useLiveQuery';

const DEPARTMENT_LABEL: Record<string, string> = { technical: 'Technical', hr: 'HR', marketing: 'Marketing', finance: 'Finance', admin: 'Admin' };

const toMs = (v: any): number => (v?.toMillis ? v.toMillis() : v?._seconds ? v._seconds * 1000 : v ? new Date(v).getTime() : 0);
const fmtAgo = (v: any) => {
  const ms = toMs(v);
  if (!ms) return '';
  const diffMin = Math.round((Date.now() - ms) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

/**
 * Admin Command Center's read-only view over HR data — headcount, attendance, leave and cross-department
 * activity. Admin never writes here; HR owns writes through its own portal (least-privilege, same split
 * as the Technical machine-fleet endpoint).
 */
export const AdminCompanyPage: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof adminCompany.hrOverview>> | null>(null);
  const [activity, setActivity] = useState<Awaited<ReturnType<typeof adminCompany.companyActivity>> | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [emps, ov, act] = await Promise.all([adminCompany.employees(), adminCompany.hrOverview(), adminCompany.companyActivity()]);
      setEmployees(emps);
      setOverview(ov);
      setActivity(act);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error && !overview) return <ErrorBanner message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-slate-900 dark:text-slate-50">Company overview</h1>
        <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">Headcount, attendance and leave across every department — read-only, owned by HR.</p>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {!overview ? (
        <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-slate-400" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Headcount', value: overview.headcount, icon: Users2 },
              { label: 'Onboarding', value: overview.onboarding, icon: UserPlus },
              { label: 'Pending leave', value: overview.pendingLeaveRequests.length, icon: CalendarClock, tone: overview.pendingLeaveRequests.length > 0 ? 'text-amber-600 dark:text-amber-400' : undefined },
              { label: 'Present today', value: `${overview.attendanceToday.present}/${overview.headcount}`, icon: Building2 },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900">
                <s.icon className="size-4 text-slate-400" />
                <p className={`mt-2 text-[20px] font-bold leading-tight tabular-nums tracking-tight ${s.tone ?? 'text-slate-900 dark:text-slate-50'}`}>{s.value}</p>
                <p className="mt-0.5 text-[11.5px] font-medium text-slate-500 dark:text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-3 text-[13px] font-semibold text-slate-700 dark:text-slate-300">By department</h2>
              <div className="space-y-2">
                {Object.entries(overview.byDepartment).map(([dept, count]) => {
                  const max = Math.max(...Object.values(overview.byDepartment), 1);
                  return (
                    <div key={dept}>
                      <div className="flex items-center justify-between text-[12.5px]">
                        <span className="text-slate-700 dark:text-slate-300">{DEPARTMENT_LABEL[dept] || dept}</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{count}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-full rounded-full bg-indigo-600" style={{ width: `${(count / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-3 text-[13px] font-semibold text-slate-700 dark:text-slate-300">Pending leave requests</h2>
              {overview.pendingLeaveRequests.length === 0 ? (
                <p className="py-4 text-center text-[12.5px] text-slate-400">Nothing pending.</p>
              ) : (
                <div className="space-y-2">
                  {overview.pendingLeaveRequests.slice(0, 6).map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-[12.5px]">
                      <span className="text-slate-700 dark:text-slate-300">{r.employeeName}</span>
                      <span className="text-slate-500 dark:text-slate-400">{r.days}d · {r.type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 text-[13px] font-semibold text-slate-700 dark:text-slate-300">Employee directory</h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {(employees || []).filter((e) => e.status !== 'offboarded').map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2.5 text-[13px]">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{e.name.slice(0, 2).toUpperCase()}</div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">{e.name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{e.title || DEPARTMENT_LABEL[e.department]}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${e.status === 'onboarding' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'}`}>
                    {e.status === 'onboarding' ? 'Onboarding' : 'Active'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center gap-2">
              <FileText className="size-4 text-slate-400" />
              <h2 className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">Cross-department activity</h2>
            </div>
            {activity === null ? (
              <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-slate-400" /></div>
            ) : activity.length === 0 ? (
              <p className="py-4 text-center text-[12.5px] text-slate-400">No activity yet.</p>
            ) : (
              <div className="space-y-2.5">
                {activity.slice(0, 15).map((a) => (
                  <p key={a.id} className="text-[12.5px] leading-snug text-slate-600 dark:text-slate-400">
                    <span className="font-medium text-slate-900 dark:text-slate-100">{a.actorName}</span> {a.description}{' '}
                    <span className="text-slate-400">· {DEPARTMENT_LABEL[a.department] || a.department} · {fmtAgo(a.createdAt)}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
