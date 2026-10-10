import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Play, Pause, Square, CheckCircle2, Circle, ChevronRight, ChevronDown,
  AlertTriangle, Megaphone, Activity, Send, X, Cpu, Wifi, WifiOff, Printer, FileText,
} from 'lucide-react';
import { useLiveQuery, errorMessage } from '../../hooks/useLiveQuery';
import { technical, TechTask, TaskStatus, TaskPriority, WorkSession, Announcement, ActivityEntry, TechMachine } from '../../services/technical.service';
import { ErrorBanner } from '../../components/insights/InsightBits';
import { pickQuote } from './quotes';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
};

const STATUS_META: Record<TaskStatus, { label: string; dot: string }> = {
  backlog: { label: 'Backlog', dot: 'bg-[var(--text-3)]' },
  assigned: { label: 'Assigned', dot: 'bg-blue-500' },
  in_progress: { label: 'In progress', dot: 'bg-amber-500' },
  blocked: { label: 'Blocked', dot: 'bg-rose-500' },
  in_review: { label: 'In review', dot: 'bg-violet-500' },
  completed: { label: 'Completed', dot: 'bg-emerald-500' },
};
const STATUS_ORDER: TaskStatus[] = ['backlog', 'assigned', 'in_progress', 'blocked', 'in_review', 'completed'];
const PRIORITY_META: Record<TaskPriority, { label: string; className: string }> = {
  low: { label: 'Low', className: 'text-[var(--text-3)]' },
  medium: { label: 'Medium', className: 'text-blue-600 dark:text-blue-400' },
  high: { label: 'High', className: 'text-amber-600 dark:text-amber-400' },
  critical: { label: 'Critical', className: 'text-rose-600 dark:text-rose-400' },
};

const toMs = (v: any): number | null => {
  if (!v) return null;
  if (typeof v === 'string') return new Date(v).getTime();
  if (v._seconds) return v._seconds * 1000;
  return null;
};
const fmtTime = (v: any) => {
  const ms = toMs(v);
  return ms ? new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--:--';
};
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

const SectionLabel: React.FC<{ icon: React.ElementType; children: React.ReactNode }> = ({ icon: Icon, children }) => (
  <div className="mb-3 flex items-center gap-2">
    <Icon className="size-4 text-[var(--text-3)]" strokeWidth={2} />
    <h2 className="text-[13px] font-semibold text-[var(--text-2)]">{children}</h2>
  </div>
);

// ───────────────────────── Work session widget ─────────────────────────
const WorkSessionCard: React.FC = () => {
  const [session, setSession] = useState<WorkSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setSession(await technical.sessionToday()); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<any>) => {
    setBusy(true);
    try { await fn(); await load(); } finally { setBusy(false); }
  };

  const isActive = session?.status === 'active';
  const isPaused = session?.status === 'paused';
  const isOpen = isActive || isPaused;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-[var(--text-2)]">Work session</p>
          {loading ? (
            <div className="skeleton mt-1 h-5 w-32" />
          ) : isOpen ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-[18px] font-bold text-[var(--text-1)]">
              {fmtTime(session!.startedAt)} <ChevronRight className="size-4 text-[var(--text-3)]" />
              <span className={isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{isActive ? 'ACTIVE' : 'PAUSED'}</span>
            </p>
          ) : (
            <p className="mt-0.5 text-[14px] text-[var(--text-3)]">{session ? `Ended at ${fmtTime(session.endedAt)}` : 'Not started yet today'}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isOpen && (
            <button disabled={busy} onClick={() => act(() => technical.startSession())} className="press flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
              <Play className="size-3.5" /> Start work
            </button>
          )}
          {isActive && (
            <>
              <button disabled={busy} onClick={() => act(() => technical.pauseSession())} className="press flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-3.5 py-2 text-[13px] font-semibold text-[var(--text-1)] disabled:opacity-50">
                <Pause className="size-3.5" /> Break
              </button>
              <button disabled={busy} onClick={() => act(() => technical.endSession())} className="press flex items-center gap-1.5 rounded-full bg-rose-600 px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
                <Square className="size-3.5" /> End
              </button>
            </>
          )}
          {isPaused && (
            <button disabled={busy} onClick={() => act(() => technical.resumeSession())} className="press flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
              <Play className="size-3.5" /> Resume
            </button>
          )}
        </div>
      </div>

      {session && session.events.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-[var(--border)] pt-3">
          {session.events.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px] text-[var(--text-3)]">
              <span className="tabular-nums">{fmtTime(e.at)}</span>
              <span>—</span>
              <span className="text-[var(--text-2)]">
                {e.type === 'started' && 'Started work'}
                {e.type === 'paused' && 'Break'}
                {e.type === 'resumed' && (e.taskTitle ? `Resumed · ${e.taskTitle}` : 'Resumed')}
                {e.type === 'ended' && 'Ended work'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ───────────────────────── Task row + detail ─────────────────────────
const TaskRow: React.FC<{ task: TechTask; expanded: boolean; onToggle: () => void; onChange: () => void }> = ({ task, expanded, onToggle, onChange }) => {
  const status = STATUS_META[task.status];
  const priority = PRIORITY_META[task.priority];
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const overdue = task.dueAtMs && task.dueAtMs < Date.now() && task.status !== 'completed';

  const nextStatus = async (s: TaskStatus) => {
    setBusy(true);
    try { await technical.updateTask(task.id, { status: s }); onChange(); } finally { setBusy(false); }
  };
  const submitComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try { await technical.commentOnTask(task.id, comment.trim()); setComment(''); onChange(); } finally { setBusy(false); }
  };

  return (
    <div>
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className={`size-2 shrink-0 rounded-full ${status.dot}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-[var(--text-1)]">{task.title}</p>
          <p className="mt-0.5 text-[12px] text-[var(--text-3)]">
            {status.label}
            {task.relatedMachine && <> · {task.relatedMachine}</>}
            {task.dueAtMs && <span className={overdue ? 'text-rose-600 dark:text-rose-400 font-medium' : ''}> · {overdue ? 'Overdue: ' : 'Due '}{new Date(task.dueAtMs).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
          </p>
        </div>
        <span className={`shrink-0 text-[12px] font-semibold ${priority.className}`}>{priority.label}</span>
        {expanded ? <ChevronDown className="size-4 shrink-0 text-[var(--text-3)]" /> : <ChevronRight className="size-4 shrink-0 text-[var(--text-3)]" />}
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-[var(--border)] bg-[var(--surface-2)]/40 px-4 py-3">
          {task.description && <p className="text-[13px] leading-relaxed text-[var(--text-2)]">{task.description}</p>}
          <p className="text-[11px] text-[var(--text-3)]">Assigned by {task.creatorName} · {fmtAgo(task.createdAt)}</p>

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

          {task.comments.length > 0 && (
            <div className="space-y-2 rounded-xl bg-[var(--surface)] p-3">
              {task.comments.map((c) => (
                <div key={c.id} className="text-[12.5px]">
                  <span className="font-semibold text-[var(--text-1)]">{c.authorName}</span>{' '}
                  <span className="text-[var(--text-3)]">{fmtAgo(c.createdAt)}</span>
                  <p className="text-[var(--text-2)]">{c.body}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitComment()}
              placeholder="Add a comment..."
              className="h-9 flex-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[12.5px] text-[var(--text-1)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-3)]/20"
            />
            <button disabled={busy || !comment.trim()} onClick={submitComment} className="press flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-2)] disabled:opacity-40">
              <Send className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ───────────────────────── Daily report ─────────────────────────
const DailyReportCard: React.FC<{ completedToday: TechTask[] }> = ({ completedToday }) => {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [blockers, setBlockers] = useState('');
  const [tomorrowPlan, setTomorrowPlan] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    if (!summary.trim()) return;
    setSubmitting(true);
    try {
      await technical.submitDailyReport({ summary, blockers, tomorrowPlan, completedTaskIds: completedToday.map((t) => t.id) });
      setSubmitted(true);
      setOpen(false);
    } finally { setSubmitting(false); }
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-[13px] font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
        <CheckCircle2 className="size-4" /> Daily report submitted. See you tomorrow.
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="press flex w-full items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-left">
        <div>
          <p className="text-[14px] font-semibold text-[var(--text-1)]">What did you accomplish today?</p>
          <p className="mt-0.5 text-[12px] text-[var(--text-3)]">{completedToday.length} {completedToday.length === 1 ? 'task' : 'tasks'} completed today · takes 30 seconds</p>
        </div>
        <ChevronRight className="size-4 text-[var(--text-3)]" />
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold text-[var(--text-1)]">Today's report</p>
        <button onClick={() => setOpen(false)} className="text-[var(--text-3)]"><X className="size-4" /></button>
      </div>
      {completedToday.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {completedToday.map((t) => <span key={t.id} className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">✓ {t.title}</span>)}
        </div>
      )}
      <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What did you work on?" rows={2} className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-[13px] text-[var(--text-1)] outline-none" />
      <textarea value={blockers} onChange={(e) => setBlockers(e.target.value)} placeholder="Any blockers? (optional)" rows={2} className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-[13px] text-[var(--text-1)] outline-none" />
      <textarea value={tomorrowPlan} onChange={(e) => setTomorrowPlan(e.target.value)} placeholder="Plan for tomorrow (optional)" rows={2} className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-[13px] text-[var(--text-1)] outline-none" />
      <button disabled={submitting || !summary.trim()} onClick={submit} className="press w-full rounded-full bg-[#093765] py-2.5 text-[13px] font-semibold text-white disabled:opacity-50">
        {submitting ? 'Submitting...' : 'Submit report'}
      </button>
    </div>
  );
};

// ───────────────────────── Main workspace ─────────────────────────
export const TechnicalWorkspace: React.FC<{ me: any; onRefreshMe: () => void }> = ({ me, onRefreshMe }) => {
  const [quote] = useState(pickQuote); // one draw per mount = a new one every refresh
  const [tasks, setTasks] = useState<TechTask[] | null>(null);
  const [tasksError, setTasksError] = useState('');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [newAnnouncement, setNewAnnouncement] = useState('');
  const isLead = me.member.role === 'tech_lead';

  const loadAll = useCallback(async () => {
    try {
      const [t, a, act] = await Promise.all([technical.tasks('me'), technical.announcements(), technical.activity()]);
      setTasks(t);
      setAnnouncements(a);
      setActivity(act);
      setTasksError('');
    } catch (err) {
      setTasksError(errorMessage(err));
    }
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  const refreshAfterChange = () => { loadAll(); onRefreshMe(); };

  const activeTasks = useMemo(() => (tasks || []).filter((t) => t.status !== 'completed'), [tasks]);
  const completedToday = useMemo(() => {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    return (tasks || []).filter((t) => t.status === 'completed' && toMs(t.completedAt)! >= startOfDay.getTime());
  }, [tasks]);
  const blockedCount = activeTasks.filter((t) => t.status === 'blocked').length;
  const overdueCount = activeTasks.filter((t) => t.dueAtMs && t.dueAtMs < Date.now()).length;

  // REAL machine telemetry — technical-scoped endpoint (health/status only, no revenue).
  const kiosks = useLiveQuery(() => technical.machines(), [], { live: true, intervalMs: 30000 });
  const machines: TechMachine[] = kiosks.data?.kiosks ?? [];

  const postAnnouncement = async () => {
    if (!newAnnouncement.trim()) return;
    await technical.postAnnouncement(newAnnouncement.trim());
    setNewAnnouncement('');
    loadAll();
  };

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-6 sm:px-6">
      <div className="animate-fadeIn">
        <h1 className="text-[24px] font-bold tracking-tight text-[var(--text-1)]">{greeting()}, {me.member.name.split(' ')[0]}</h1>
        <p className="mt-1 text-[13px] text-[var(--text-3)]">
          {overdueCount > 0 ? `${overdueCount} overdue` : 'Nothing overdue'}
          {blockedCount > 0 && <> · {blockedCount} blocked</>}
          {' · '}{me.stats.completionRate !== null ? `${me.stats.completionRate}% completion rate` : 'No tasks yet'}
        </p>
        <p className="mt-3 text-[13px] italic leading-relaxed text-[var(--text-2)]">
          "{quote.line}" <span className="not-italic text-[var(--text-3)]">— {quote.by}</span>
        </p>
      </div>

      {tasksError && <ErrorBanner message={tasksError} onRetry={loadAll} />}

      <div className="animate-fadeIn" style={{ animationDelay: '40ms' }}><WorkSessionCard /></div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Active tasks', value: me.stats.activeTasks },
          { label: 'Overdue', value: me.stats.overdueTasks, tone: me.stats.overdueTasks > 0 ? 'text-rose-600 dark:text-rose-400' : undefined },
          { label: 'Completed total', value: me.stats.completedTasks },
          { label: 'Avg. completion', value: me.stats.avgCompletionHours !== null ? `${me.stats.avgCompletionHours}h` : '—' },
        ].map((s, i) => (
          <div key={s.label} className="animate-fadeIn press-lift rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5" style={{ animationDelay: `${80 + i * 30}ms` }}>
            <p className="text-[12px] font-medium text-[var(--text-3)]">{s.label}</p>
            <p className={`mt-0.5 text-[22px] font-bold leading-tight tabular-nums tracking-tight ${s.tone ?? 'text-[var(--text-1)]'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="animate-fadeIn" style={{ animationDelay: '220ms' }}><DailyReportCard completedToday={completedToday} /></div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <SectionLabel icon={CheckCircle2}>Your tasks</SectionLabel>
          <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            {tasks === null ? (
              <div className="space-y-2 p-4"><div className="skeleton h-12 rounded-xl" /><div className="skeleton h-12 rounded-xl" /></div>
            ) : activeTasks.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Circle className="size-6 text-[var(--text-3)]" />
                <p className="text-[13px] text-[var(--text-3)]">Nothing assigned right now.</p>
              </div>
            ) : (
              activeTasks.map((t) => (
                <TaskRow key={t.id} task={t} expanded={expandedTask === t.id} onToggle={() => setExpandedTask(expandedTask === t.id ? null : t.id)} onChange={refreshAfterChange} />
              ))
            )}
          </div>

          <div className="mt-6">
            <SectionLabel icon={Megaphone}>Team announcements</SectionLabel>
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
              {isLead && (
                <div className="flex gap-2 border-b border-[var(--border)] p-3">
                  <input value={newAnnouncement} onChange={(e) => setNewAnnouncement(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && postAnnouncement()} placeholder="Post an announcement to the team..." className="h-9 flex-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3.5 text-[12.5px] outline-none" />
                  <button disabled={!newAnnouncement.trim()} onClick={postAnnouncement} className="press flex size-9 shrink-0 items-center justify-center rounded-full bg-[#093765] text-white disabled:opacity-40"><Send className="size-3.5" /></button>
                </div>
              )}
              <div className="divide-y divide-[var(--border)]">
                {announcements.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[13px] text-[var(--text-3)]">No announcements yet.</p>
                ) : announcements.map((a) => (
                  <div key={a.id} className="px-4 py-3.5">
                    <p className="text-[13px] leading-relaxed text-[var(--text-1)]">{a.body}</p>
                    <p className="mt-1 text-[11px] text-[var(--text-3)]">{a.postedByName} · {fmtAgo(a.createdAt)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div>
          <SectionLabel icon={Cpu}>Machine fleet</SectionLabel>
          {kiosks.error && <ErrorBanner message={errorMessage(kiosks.error)} />}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {kiosks.loading ? (
              <><div className="skeleton h-24 rounded-2xl" /><div className="skeleton h-24 rounded-2xl" /></>
            ) : machines.length === 0 ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-8 text-center">
                <AlertTriangle className="mx-auto mb-2 size-5 text-[var(--text-3)]" />
                <p className="text-[13px] text-[var(--text-3)]">No machines reporting.</p>
              </div>
            ) : (
              machines.map((k) => (
                <div key={k.kioskId} className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`size-2 rounded-full ${!k.online ? 'bg-rose-500' : k.liveState === 'DEGRADED' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                      <p className="text-[14px] font-semibold text-[var(--text-1)]">{k.name}</p>
                    </div>
                    {k.online ? <Wifi className="size-3.5 text-[var(--text-3)]" /> : <WifiOff className="size-3.5 text-[var(--text-3)]" />}
                  </div>
                  <p className="flex items-center gap-1.5 text-[12px] text-[var(--text-2)]"><Printer className="size-3.5" />{k.printerStatus || 'No report yet'}</p>
                  <p className="text-[11px] text-[var(--text-3)]">{k.lastSeen ? `Last seen ${fmtAgo(k.lastSeen)}` : 'Never reported in'}</p>
                </div>
              ))
            )}
          </div>

          <div className="mt-6">
            <SectionLabel icon={Activity}>Recent activity</SectionLabel>
            <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
              {activity.length === 0 ? (
                <p className="px-4 py-6 text-center text-[13px] text-[var(--text-3)]">No activity yet.</p>
              ) : activity.slice(0, 8).map((a) => (
                <div key={a.id} className="flex items-start gap-2.5 px-4 py-3">
                  <FileText className="mt-0.5 size-3.5 shrink-0 text-[var(--text-3)]" />
                  <p className="text-[12.5px] leading-snug text-[var(--text-2)]"><span className="font-medium text-[var(--text-1)]">{a.actorName}</span> {a.description} <span className="text-[var(--text-3)]">· {fmtAgo(a.createdAt)}</span></p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
