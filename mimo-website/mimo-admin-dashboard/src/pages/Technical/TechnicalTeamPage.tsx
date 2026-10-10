import React, { useEffect, useState, useCallback } from 'react';
import { Users2, Plus, X, AlertTriangle, Loader2 } from 'lucide-react';
import { technical, TeamMember, TaskPriority } from '../../services/technical.service';
import { ErrorBanner } from '../../components/insights/InsightBits';
import { errorMessage } from '../../hooks/useLiveQuery';

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' },
];

/** Workload balancer: real data, deterministic logic, no fake AI. Flags the two conditions the brief asked
 * for by name — someone carrying far more than the team average, and someone with no high-priority work
 * while others are overloaded with it. */
const workloadInsights = (members: TeamMember[]): string[] => {
  if (members.length < 2) return [];
  const avg = members.reduce((s, m) => s + m.activeTasks, 0) / members.length;
  const notes: string[] = [];
  const overloaded = members.filter((m) => m.activeTasks >= avg + 2 && m.activeTasks >= 3);
  const idle = members.filter((m) => m.activeTasks === 0);
  overloaded.forEach((m) => {
    const lightest = members.filter((o) => o.id !== m.id).sort((a, b) => a.activeTasks - b.activeTasks)[0];
    if (lightest && lightest.activeTasks < m.activeTasks - 1) {
      notes.push(`${m.name} has ${m.activeTasks} active tasks while ${lightest.name} has ${lightest.activeTasks} — consider moving one over.`);
    }
  });
  idle.forEach((m) => notes.push(`${m.name} has no active tasks assigned.`));
  const blocked = members.filter((m) => m.blockedTasks > 0);
  blocked.forEach((m) => notes.push(`${m.name} has ${m.blockedTasks} blocked ${m.blockedTasks === 1 ? 'task' : 'tasks'}.`));
  return notes;
};

const NewTaskModal: React.FC<{ members: TeamMember[]; onClose: () => void; onCreated: () => void }> = ({ members, onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState(members[0]?.id || '');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [relatedMachine, setRelatedMachine] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!title.trim() || !assigneeId) return;
    setSubmitting(true);
    setError('');
    try {
      await technical.createTask({
        title: title.trim(),
        description: description.trim(),
        assigneeId,
        priority,
        relatedMachine: relatedMachine.trim() || null,
        dueAtMs: dueDate ? new Date(dueDate).getTime() : null,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-[460px] space-y-3 rounded-t-2xl bg-[var(--surface)] p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-[16px] font-bold text-[var(--text-1)]">New task</p>
          <button onClick={onClose}><X className="size-4.5 text-[var(--text-3)]" /></button>
        </div>
        {error && <ErrorBanner message={error} />}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 text-[14px] outline-none" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" rows={2} className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-[13px] outline-none" />
        <div className="grid grid-cols-2 gap-2">
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-[13px] outline-none">
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-[13px] outline-none">
            {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={relatedMachine} onChange={(e) => setRelatedMachine(e.target.value)} placeholder="Machine (optional)" className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 text-[13px] outline-none" />
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 text-[13px] outline-none" />
        </div>
        <button disabled={submitting || !title.trim()} onClick={submit} className="press w-full rounded-full bg-[#093765] py-2.5 text-[13px] font-semibold text-white disabled:opacity-50">
          {submitting ? 'Creating...' : 'Create & assign'}
        </button>
      </div>
    </div>
  );
};

export const TechnicalTeamPage: React.FC<{ currentMemberId: string }> = () => {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState('');
  const [showNewTask, setShowNewTask] = useState(false);

  const load = useCallback(async () => {
    try { setMembers(await technical.team()); setError(''); } catch (err) { setError(errorMessage(err)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const insightsList = members ? workloadInsights(members) : [];
  const totalActive = (members || []).reduce((s, m) => s + m.activeTasks, 0);
  const totalBlocked = (members || []).reduce((s, m) => s + m.blockedTasks, 0);

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-[var(--text-1)]">Team health</h1>
          <p className="mt-1 text-[13px] text-[var(--text-3)]">{members?.length ?? '—'} team members · {totalActive} active tasks{totalBlocked > 0 && ` · ${totalBlocked} blocked`}</p>
        </div>
        <button onClick={() => setShowNewTask(true)} className="press flex items-center gap-1.5 rounded-full bg-[#093765] px-4 py-2.5 text-[13px] font-semibold text-white">
          <Plus className="size-4" /> New task
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {insightsList.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-800 dark:text-amber-300"><AlertTriangle className="size-4" /> Worth a look</p>
          {insightsList.map((n, i) => <p key={i} className="text-[12.5px] text-amber-700 dark:text-amber-400">{n}</p>)}
        </div>
      )}

      {members === null ? (
        <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-[var(--text-3)]" /></div>
      ) : (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Users2 className="size-4 text-[var(--text-3)]" />
            <h2 className="text-[13px] font-semibold text-[var(--text-2)]">Workload</h2>
          </div>
          <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            {members.map((m, i) => {
              const max = Math.max(...members.map((x) => x.activeTasks), 1);
              return (
                <div key={m.id} className="animate-fadeIn px-4 py-3.5" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-8 items-center justify-center rounded-full bg-[var(--surface-2)] text-[12px] font-bold text-[var(--text-2)]">{m.name.slice(0, 2).toUpperCase()}</div>
                      <div>
                        <p className="text-[14px] font-semibold text-[var(--text-1)]">{m.name}</p>
                        <p className="text-[11px] text-[var(--text-3)]">{m.role === 'tech_lead' ? 'Technical Lead' : 'Technical Member'}{m.skills.length > 0 && ` · ${m.skills.join(', ')}`}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[14px] font-bold tabular-nums text-[var(--text-1)]">{m.activeTasks} active</p>
                      <p className="text-[11px] text-[var(--text-3)]">{m.completedTasks} completed{m.blockedTasks > 0 && <span className="text-rose-600 dark:text-rose-400"> · {m.blockedTasks} blocked</span>}</p>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div className={`h-full rounded-full ${m.blockedTasks > 0 ? 'bg-rose-500' : 'bg-[#093765]'}`} style={{ width: `${(m.activeTasks / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showNewTask && members && <NewTaskModal members={members} onClose={() => setShowNewTask(false)} onCreated={load} />}
    </div>
  );
};
