import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, FileText, Users2, UserPlus, CalendarClock, Wrench, Megaphone, UserCircle2 } from 'lucide-react';
import { hr, CompanyMember, HrActivityEntry } from '../../services/hr.service';
import { ErrorBanner } from '../../components/insights/InsightBits';
import { errorMessage } from '../../hooks/useLiveQuery';

const DEPT_ICON: Record<CompanyMember['department'], React.ElementType> = { technical: Wrench, hr: Users2, marketing: Megaphone };
const DEPT_LABEL: Record<CompanyMember['department'], string> = { technical: 'Technical', hr: 'HR', marketing: 'Marketing' };

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

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

interface Me {
  member: { id: string; name: string };
  stats: { totalEmployees: number; onboarding: number; pendingLeaveRequests: number };
}

export const HrOverview: React.FC<{ me: Me }> = ({ me }) => {
  const [activity, setActivity] = useState<HrActivityEntry[] | null>(null);
  const [members, setMembers] = useState<CompanyMember[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await hr.companyUpdates();
      setActivity(data.updates);
      setMembers(data.members);
      setError('');
    } catch (err) { setError(errorMessage(err)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const stats = [
    { label: 'Total employees', value: me.stats.totalEmployees, icon: Users2 },
    { label: 'Onboarding', value: me.stats.onboarding, icon: UserPlus },
    { label: 'Pending leave', value: me.stats.pendingLeaveRequests, icon: CalendarClock, tone: me.stats.pendingLeaveRequests > 0 ? 'text-amber-600 dark:text-amber-400' : undefined },
  ];

  return (
    <div className="mx-auto max-w-[800px] space-y-6 px-4 py-6 sm:px-6">
      <div className="animate-fadeIn">
        <h1 className="text-[22px] font-bold tracking-tight text-[var(--text-1)]">{greeting()}, {me.member.name.split(' ')[0]}</h1>
        <p className="mt-1 text-[13px] text-[var(--text-3)]">Here's the company at a glance.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((s, i) => (
          <div key={s.label} className="animate-fadeIn press-lift rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5" style={{ animationDelay: `${i * 40}ms` }}>
            <s.icon className="size-4 text-[var(--text-3)]" />
            <p className={`mt-2 text-[22px] font-bold leading-tight tabular-nums tracking-tight ${s.tone ?? 'text-[var(--text-1)]'}`}>{s.value}</p>
            <p className="mt-0.5 text-[11.5px] font-medium text-[var(--text-3)]">{s.label}</p>
          </div>
        ))}
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <div>
        <div className="mb-3 flex items-center gap-2">
          <FileText className="size-4 text-[var(--text-3)]" />
          <h2 className="text-[13px] font-semibold text-[var(--text-2)]">Latest updates</h2>
        </div>
        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          {activity === null ? (
            <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-[var(--text-3)]" /></div>
          ) : activity.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-[var(--text-3)]">No activity yet.</p>
          ) : (
            activity.slice(0, 12).map((a) => (
              <div key={a.id} className="flex items-start gap-2.5 px-4 py-3">
                <FileText className="mt-0.5 size-3.5 shrink-0 text-[var(--text-3)]" />
                <p className="text-[12.5px] leading-snug text-[var(--text-2)]"><span className="font-medium text-[var(--text-1)]">{a.actorName}</span> {a.description} <span className="text-[var(--text-3)]">· {fmtAgo(a.createdAt)}</span></p>
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <UserCircle2 className="size-4 text-[var(--text-3)]" />
          <h2 className="text-[13px] font-semibold text-[var(--text-2)]">Team &amp; current assignments</h2>
        </div>
        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          {members === null ? (
            <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-[var(--text-3)]" /></div>
          ) : (
            members.map((m) => {
              const DeptIcon = DEPT_ICON[m.department];
              return (
                <div key={m.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[11px] font-bold text-[var(--text-2)]">
                    {m.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13px] font-semibold text-[var(--text-1)]">{m.name}</p>
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-3)]">
                        <DeptIcon className="size-2.5" /> {DEPT_LABEL[m.department]}
                      </span>
                    </div>
                    {m.currentTasks.length === 0 ? (
                      <p className="mt-0.5 text-[11.5px] text-[var(--text-3)]">No tasks currently assigned.</p>
                    ) : (
                      <div className="mt-1 space-y-0.5">
                        {m.currentTasks.map((t, i) => (
                          <p key={i} className="truncate text-[11.5px] text-[var(--text-2)]">
                            {t.title}{t.assignedBy && <span className="text-[var(--text-3)]"> · by {t.assignedBy}</span>}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
