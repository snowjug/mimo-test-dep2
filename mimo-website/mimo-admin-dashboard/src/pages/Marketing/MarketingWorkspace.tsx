import React, { useEffect, useState, useCallback } from 'react';
import { Plus, X, Megaphone, Loader2, ChevronRight, ChevronDown, Instagram, Mail, Globe, Printer } from 'lucide-react';
import { marketing, MarketingTask, MarketingTaskStatus, MarketingTaskPriority } from '../../services/marketing.service';
import { ErrorBanner } from '../../components/insights/InsightBits';
import { errorMessage } from '../../hooks/useLiveQuery';

const STATUS_META: Record<MarketingTaskStatus, { label: string; dot: string }> = {
  planned: { label: 'Planned', dot: 'bg-[var(--text-3)]' },
  in_progress: { label: 'In progress', dot: 'bg-amber-500' },
  completed: { label: 'Completed', dot: 'bg-emerald-500' },
};
const STATUS_ORDER: MarketingTaskStatus[] = ['planned', 'in_progress', 'completed'];
const PRIORITY_META: Record<MarketingTaskPriority, { label: string; className: string }> = {
  low: { label: 'Low', className: 'text-[var(--text-3)]' },
  medium: { label: 'Medium', className: 'text-blue-600 dark:text-blue-400' },
  high: { label: 'High', className: 'text-rose-600 dark:text-rose-400' },
};
const CHANNEL_ICON: Record<string, React.ElementType> = {
  instagram: Instagram,
  email: Mail,
  print: Printer,
  general: Globe,
};

const fmtDue = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null);

const NewTaskModal: React.FC<{ onClose: () => void; onCreated: () => void }> = ({ onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [channel, setChannel] = useState('instagram');
  const [priority, setPriority] = useState<MarketingTaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await marketing.createTask({ title: title.trim(), description: description.trim(), channel, priority, dueAtMs: dueDate ? new Date(dueDate).getTime() : null });
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
          <p className="text-[16px] font-bold text-[var(--text-1)]">New campaign / task</p>
          <button onClick={onClose}><X className="size-4.5 text-[var(--text-3)]" /></button>
        </div>
        {error && <ErrorBanner message={error} />}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What are you working on?" className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 text-[14px] outline-none" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Details (optional)" rows={2} className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-[13px] outline-none" />
        <div className="grid grid-cols-2 gap-2">
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-[13px] outline-none">
            <option value="instagram">Instagram</option>
            <option value="email">Email</option>
            <option value="print">Print / posters</option>
            <option value="general">General</option>
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value as MarketingTaskPriority)} className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-[13px] outline-none">
            {(Object.keys(PRIORITY_META) as MarketingTaskPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
          </select>
        </div>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 text-[13px] outline-none" />
        <button disabled={submitting || !title.trim()} onClick={submit} className="press w-full rounded-full bg-[#093765] py-2.5 text-[13px] font-semibold text-white disabled:opacity-50">
          {submitting ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  );
};

const TaskRow: React.FC<{ task: MarketingTask; expanded: boolean; onToggle: () => void; onChange: () => void }> = ({ task, expanded, onToggle, onChange }) => {
  const status = STATUS_META[task.status];
  const priority = PRIORITY_META[task.priority];
  const Icon = CHANNEL_ICON[task.channel] || Globe;
  const [busy, setBusy] = useState(false);

  const nextStatus = async (s: MarketingTaskStatus) => {
    setBusy(true);
    try { await marketing.updateTask(task.id, { status: s }); onChange(); } finally { setBusy(false); }
  };

  return (
    <div>
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className={`size-2 shrink-0 rounded-full ${status.dot}`} />
        <Icon className="size-3.5 shrink-0 text-[var(--text-3)]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-[var(--text-1)]">{task.title}</p>
          <p className="mt-0.5 text-[12px] text-[var(--text-3)]">
            {status.label}{task.dueAtMs && <> · Due {fmtDue(task.dueAtMs)}</>}
          </p>
        </div>
        <span className={`shrink-0 text-[12px] font-semibold ${priority.className}`}>{priority.label}</span>
        {expanded ? <ChevronDown className="size-4 shrink-0 text-[var(--text-3)]" /> : <ChevronRight className="size-4 shrink-0 text-[var(--text-3)]" />}
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-[var(--border)] bg-[var(--surface-2)]/40 px-4 py-3">
          {task.description && <p className="text-[13px] leading-relaxed text-[var(--text-2)]">{task.description}</p>}
          <div className="flex flex-wrap gap-1.5">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                disabled={busy || s === task.status}
                onClick={() => nextStatus(s)}
                className={`press rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-colors disabled:cursor-default ${
                  s === task.status ? `${STATUS_META[s].dot} text-white` : 'bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--border)]'
                }`}
              >
                {STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const MarketingWorkspace: React.FC<{ me: any }> = ({ me }) => {
  const [tasks, setTasks] = useState<MarketingTask[] | null>(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    try { setTasks(await marketing.tasks()); setError(''); } catch (err) { setError(errorMessage(err)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const active = (tasks || []).filter((t) => t.status !== 'completed');
  const completed = (tasks || []).filter((t) => t.status === 'completed');

  return (
    <div className="mx-auto max-w-[800px] space-y-6 px-4 py-6 sm:px-6">
      <div className="animate-fadeIn flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-[var(--text-1)]">Campaigns &amp; content</h1>
          <p className="mt-1 text-[13px] text-[var(--text-3)]">{me.stats.planned} planned · {me.stats.inProgress} in progress · {me.stats.completed} completed</p>
        </div>
        <button onClick={() => setShowNew(true)} className="press flex items-center gap-1.5 rounded-full bg-[#093765] px-4 py-2.5 text-[13px] font-semibold text-white">
          <Plus className="size-4" /> New
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <div>
        <div className="mb-3 flex items-center gap-2">
          <Megaphone className="size-4 text-[var(--text-3)]" />
          <h2 className="text-[13px] font-semibold text-[var(--text-2)]">Active</h2>
        </div>
        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          {tasks === null ? (
            <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-[var(--text-3)]" /></div>
          ) : active.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-[var(--text-3)]">Nothing planned yet — add your first campaign.</p>
          ) : (
            active.map((t) => <TaskRow key={t.id} task={t} expanded={expanded === t.id} onToggle={() => setExpanded(expanded === t.id ? null : t.id)} onChange={load} />)
          )}
        </div>
      </div>

      {completed.length > 0 && (
        <div>
          <h2 className="mb-3 text-[13px] font-semibold text-[var(--text-2)]">Completed</h2>
          <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] opacity-70">
            {completed.map((t) => <TaskRow key={t.id} task={t} expanded={expanded === t.id} onToggle={() => setExpanded(expanded === t.id ? null : t.id)} onChange={load} />)}
          </div>
        </div>
      )}

      {showNew && <NewTaskModal onClose={() => setShowNew(false)} onCreated={load} />}
    </div>
  );
};
