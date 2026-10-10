import React, { useEffect, useState, useCallback } from 'react';
import {
  Wrench, Megaphone, Users2, Plus, X, Loader2, ChevronRight, ChevronDown,
  Check, Ban, CheckCircle2, Circle, UserPlus, UserMinus,
} from 'lucide-react';
import { adminCompany } from '../../services/adminCompany.service';
import { adminGang, LoginStreaks } from '../../services/adminGang.service';
import { Employee } from '../../services/hr.service';
import { TechTask, TaskStatus, TaskPriority } from '../../services/technical.service';
import { MarketingTask, MarketingTaskStatus, MarketingTaskPriority } from '../../services/marketing.service';
import { ContributionGraph } from '../../components/gang/ContributionGraph';
import { ErrorBanner } from '../../components/insights/InsightBits';
import { errorMessage } from '../../hooks/useLiveQuery';

type GangTab = 'technical' | 'marketing' | 'hr';

const TECH_STATUS: Record<TaskStatus, { label: string; dot: string }> = {
  backlog: { label: 'Backlog', dot: 'bg-slate-400' },
  assigned: { label: 'Assigned', dot: 'bg-blue-500' },
  in_progress: { label: 'In progress', dot: 'bg-amber-500' },
  blocked: { label: 'Blocked', dot: 'bg-rose-500' },
  in_review: { label: 'In review', dot: 'bg-violet-500' },
  completed: { label: 'Completed', dot: 'bg-emerald-500' },
};
const TECH_STATUS_ORDER: TaskStatus[] = ['backlog', 'assigned', 'in_progress', 'blocked', 'in_review', 'completed'];
const MKT_STATUS: Record<MarketingTaskStatus, { label: string; dot: string }> = {
  planned: { label: 'Planned', dot: 'bg-slate-400' },
  in_progress: { label: 'In progress', dot: 'bg-amber-500' },
  completed: { label: 'Completed', dot: 'bg-emerald-500' },
};
const MKT_STATUS_ORDER: MarketingTaskStatus[] = ['planned', 'in_progress', 'completed'];

const streakKey = (e: Employee) => (e.loginRef ? `${e.loginRef.collection}_${e.loginRef.id}` : null);

const MemberStrip: React.FC<{ members: Employee[]; streaks: LoginStreaks }> = ({ members, streaks }) => (
  <div className="flex flex-wrap gap-3 mb-5">
    {members.map((m) => {
      const key = streakKey(m);
      return (
        <div key={m.id} className="flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300">
            {m.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{m.name}</p>
            <ContributionGraph dates={key ? streaks[key] || [] : []} />
          </div>
        </div>
      );
    })}
  </div>
);

// ───────────────────────── Technical tab ─────────────────────────
const NewTechTaskModal: React.FC<{ members: Employee[]; onClose: () => void; onCreated: () => void }> = ({ members, onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState(members[0]?.loginRef?.id || '');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!title.trim() || !assigneeId) return;
    setBusy(true);
    setError('');
    try {
      await adminGang.createTechnicalTask({ title: title.trim(), assigneeId, priority });
      onCreated();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-[440px] space-y-3 rounded-t-2xl bg-white dark:bg-slate-900 p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-slate-900 dark:text-white">New technical task</p>
          <button onClick={onClose}><X className="size-4.5 text-slate-400" /></button>
        </div>
        {error && <ErrorBanner message={error} />}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 text-sm outline-none" />
        <div className="grid grid-cols-2 gap-2">
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs outline-none">
            {members.map((m) => m.loginRef && <option key={m.id} value={m.loginRef.id}>{m.name}</option>)}
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs outline-none">
            {(['low', 'medium', 'high', 'critical'] as TaskPriority[]).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <button disabled={busy || !title.trim() || !assigneeId} onClick={submit} className="w-full rounded-full bg-[#093765] py-2.5 text-xs font-bold text-white disabled:opacity-50">
          {busy ? 'Creating…' : 'Create & assign'}
        </button>
      </div>
    </div>
  );
};

const TechTaskRow: React.FC<{ task: TechTask; onChange: () => void }> = ({ task, onChange }) => {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = TECH_STATUS[task.status];

  const setStatus = async (s: TaskStatus) => {
    setBusy(true);
    try { await adminGang.updateTechnicalTask(task.id, { status: s }); onChange(); } finally { setBusy(false); }
  };

  return (
    <div>
      <button onClick={() => setExpanded((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className={`size-2 shrink-0 rounded-full ${status.dot}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{task.title}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{status.label} · {task.assigneeName}{task.creatorName && ` · assigned by ${task.creatorName}`}</p>
        </div>
        {expanded ? <ChevronDown className="size-4 text-slate-400" /> : <ChevronRight className="size-4 text-slate-400" />}
      </button>
      {expanded && (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-4 py-3">
          {TECH_STATUS_ORDER.map((s) => (
            <button
              key={s}
              disabled={busy || s === task.status}
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold disabled:cursor-default ${
                s === task.status ? `${TECH_STATUS[s].dot} text-white` : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {TECH_STATUS[s].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const TechnicalTab: React.FC<{ employees: Employee[]; streaks: LoginStreaks }> = ({ employees, streaks }) => {
  const [tasks, setTasks] = useState<TechTask[] | null>(null);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const members = employees.filter((e) => e.department === 'technical' && e.status !== 'offboarded');

  const load = useCallback(async () => {
    try { setTasks(await adminGang.technicalTasks()); setError(''); } catch (err) { setError(errorMessage(err)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <MemberStrip members={members} streaks={streaks} />
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Tasks</p>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 rounded-full bg-[#093765] px-3.5 py-2 text-xs font-bold text-white">
          <Plus className="size-3.5" /> New task
        </button>
      </div>
      {error && <ErrorBanner message={error} onRetry={load} />}
      <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {tasks === null ? (
          <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-slate-400" /></div>
        ) : tasks.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-slate-400">No technical tasks yet.</p>
        ) : (
          tasks.map((t) => <TechTaskRow key={t.id} task={t} onChange={load} />)
        )}
      </div>
      {showNew && <NewTechTaskModal members={members} onClose={() => setShowNew(false)} onCreated={load} />}
    </div>
  );
};

// ───────────────────────── Marketing tab ─────────────────────────
const NewMktTaskModal: React.FC<{ onClose: () => void; onCreated: () => void }> = ({ onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  const [channel, setChannel] = useState('instagram');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setError('');
    try {
      await adminGang.createMarketingTask({ title: title.trim(), channel });
      onCreated();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-[440px] space-y-3 rounded-t-2xl bg-white dark:bg-slate-900 p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-slate-900 dark:text-white">New campaign / task</p>
          <button onClick={onClose}><X className="size-4.5 text-slate-400" /></button>
        </div>
        {error && <ErrorBanner message={error} />}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's the task?" className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 text-sm outline-none" />
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs outline-none">
          <option value="instagram">Instagram</option>
          <option value="email">Email</option>
          <option value="print">Print / posters</option>
          <option value="general">General</option>
        </select>
        <button disabled={busy || !title.trim()} onClick={submit} className="w-full rounded-full bg-[#093765] py-2.5 text-xs font-bold text-white disabled:opacity-50">
          {busy ? 'Creating…' : 'Create'}
        </button>
      </div>
    </div>
  );
};

const MktTaskRow: React.FC<{ task: MarketingTask; onChange: () => void }> = ({ task, onChange }) => {
  const [busy, setBusy] = useState(false);
  const status = MKT_STATUS[task.status];

  const setStatus = async (s: MarketingTaskStatus) => {
    setBusy(true);
    try { await adminGang.updateMarketingTask(task.id, { status: s }); onChange(); } finally { setBusy(false); }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={`size-2 shrink-0 rounded-full ${status.dot}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{task.title}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">{status.label} · {task.channel}{task.createdByName && ` · by ${task.createdByName}`}</p>
      </div>
      <div className="flex gap-1">
        {MKT_STATUS_ORDER.map((s) => (
          <button
            key={s}
            disabled={busy || s === task.status}
            onClick={() => setStatus(s)}
            className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold disabled:cursor-default ${
              s === task.status ? `${MKT_STATUS[s].dot} text-white` : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {MKT_STATUS[s].label}
          </button>
        ))}
      </div>
    </div>
  );
};

const MarketingTab: React.FC<{ employees: Employee[]; streaks: LoginStreaks }> = ({ employees, streaks }) => {
  const [tasks, setTasks] = useState<MarketingTask[] | null>(null);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const members = employees.filter((e) => e.department === 'marketing' && e.status !== 'offboarded');

  const load = useCallback(async () => {
    try { setTasks(await adminGang.marketingTasks()); setError(''); } catch (err) { setError(errorMessage(err)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <MemberStrip members={members} streaks={streaks} />
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Campaigns &amp; tasks</p>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 rounded-full bg-[#093765] px-3.5 py-2 text-xs font-bold text-white">
          <Plus className="size-3.5" /> New
        </button>
      </div>
      {error && <ErrorBanner message={error} onRetry={load} />}
      <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {tasks === null ? (
          <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-slate-400" /></div>
        ) : tasks.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-slate-400">Nothing planned yet.</p>
        ) : (
          tasks.map((t) => <MktTaskRow key={t.id} task={t} onChange={load} />)
        )}
      </div>
      {showNew && <NewMktTaskModal onClose={() => setShowNew(false)} onCreated={load} />}
    </div>
  );
};

// ───────────────────────── HR tab ─────────────────────────
const HrTab: React.FC<{ employees: Employee[]; streaks: LoginStreaks; onEmployeesChanged: () => void }> = ({ employees, streaks, onEmployeesChanged }) => {
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [loadingLeave, setLoadingLeave] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const hrMembers = employees.filter((e) => e.department === 'hr' && e.status !== 'offboarded');

  const loadOverview = useCallback(async () => {
    setLoadingLeave(true);
    try {
      const overview = await adminCompany.hrOverview();
      setLeaveRequests(overview.pendingLeaveRequests);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingLeave(false);
    }
  }, []);
  useEffect(() => { loadOverview(); }, [loadOverview]);

  const decide = async (id: string, status: 'approved' | 'rejected') => {
    setBusyId(id);
    try { await adminGang.decideLeaveRequest(id, status); await loadOverview(); } finally { setBusyId(null); }
  };

  const toggleOnboarding = async (employeeId: string, index: number, done: boolean) => {
    await adminGang.toggleOnboarding(employeeId, index, done);
    onEmployeesChanged();
  };
  const offboard = async (employeeId: string, name: string) => {
    if (!confirm(`Mark ${name} as offboarded?`)) return;
    await adminGang.updateEmployee(employeeId, { status: 'offboarded' });
    onEmployeesChanged();
  };
  const activate = async (employeeId: string) => {
    await adminGang.updateEmployee(employeeId, { status: 'active' });
    onEmployeesChanged();
  };

  const onboarding = employees.filter((e) => e.status === 'onboarding');
  const active = employees.filter((e) => e.status === 'active');

  return (
    <div>
      <MemberStrip members={hrMembers} streaks={streaks} />

      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Pending leave requests</p>
      {error && <ErrorBanner message={error} onRetry={loadOverview} />}
      <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mb-6">
        {loadingLeave ? (
          <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-slate-400" /></div>
        ) : leaveRequests.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-slate-400">Nothing pending.</p>
        ) : (
          leaveRequests.map((r: any) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{r.employeeName} · {r.type}</p>
                <p className="text-[11px] text-slate-500">{r.days} day{r.days > 1 ? 's' : ''}{r.reason && ` · ${r.reason}`}</p>
              </div>
              <div className="flex gap-1.5">
                <button disabled={busyId === r.id} onClick={() => decide(r.id, 'approved')} className="flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">
                  <Check className="size-3.5" /> Approve
                </button>
                <button disabled={busyId === r.id} onClick={() => decide(r.id, 'rejected')} className="flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-950/30 px-3 py-1.5 text-[11px] font-bold text-rose-600 dark:text-rose-400 disabled:opacity-50">
                  <Ban className="size-3.5" /> Reject
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {onboarding.length > 0 && (
        <>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Onboarding</p>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mb-6">
            {onboarding.map((e) => {
              const done = e.onboardingChecklist.filter((c) => c.done).length;
              return (
                <div key={e.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{e.name}</p>
                      <p className="text-[11px] text-slate-500 capitalize">{e.department} · {done}/{e.onboardingChecklist.length} steps done</p>
                    </div>
                    <button onClick={() => activate(e.id)} className="flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white">
                      <UserPlus className="size-3.5" /> Mark active
                    </button>
                  </div>
                  <div className="mt-2 space-y-1">
                    {e.onboardingChecklist.map((item, i) => (
                      <button key={i} onClick={() => toggleOnboarding(e.id, i, !item.done)} className="flex w-full items-center gap-2 text-left">
                        {item.done ? <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" /> : <Circle className="size-3.5 shrink-0 text-slate-300" />}
                        <span className={`text-xs ${item.done ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-300'}`}>{item.task}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Active employees</p>
      <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {active.map((e) => (
          <div key={e.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{e.name}</p>
              <p className="text-[11px] text-slate-500 capitalize">{e.department}{e.title && ` · ${e.title}`}</p>
            </div>
            <button onClick={() => offboard(e.id, e.name)} className="flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:text-rose-600">
              <UserMinus className="size-3.5" /> Offboard
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ───────────────────────── Shell ─────────────────────────
const TABS: { id: GangTab; label: string; icon: React.ElementType }[] = [
  { id: 'technical', label: 'Technical', icon: Wrench },
  { id: 'marketing', label: 'Marketing', icon: Megaphone },
  { id: 'hr', label: 'HR', icon: Users2 },
];

export const MimoGangPage: React.FC = () => {
  const [tab, setTab] = useState<GangTab>('technical');
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [streaks, setStreaks] = useState<LoginStreaks>({});
  const [error, setError] = useState('');

  const loadEmployees = useCallback(async () => {
    try {
      const [emps, s] = await Promise.all([adminCompany.employees(), adminGang.loginStreaks()]);
      setEmployees(emps);
      setStreaks(s);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);
  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">MIMO GANG</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">What Technical, Marketing and HR are working on — and who's showing up.</p>
      </div>

      <div className="flex gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
              tab === t.id ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
            }`}
          >
            <t.icon className="size-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {error && <ErrorBanner message={error} onRetry={loadEmployees} />}

      {employees === null ? (
        <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-slate-400" /></div>
      ) : tab === 'technical' ? (
        <TechnicalTab employees={employees} streaks={streaks} />
      ) : tab === 'marketing' ? (
        <MarketingTab employees={employees} streaks={streaks} />
      ) : (
        <HrTab employees={employees} streaks={streaks} onEmployeesChanged={loadEmployees} />
      )}
    </div>
  );
};
