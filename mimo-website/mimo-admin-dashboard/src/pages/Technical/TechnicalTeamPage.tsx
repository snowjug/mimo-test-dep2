import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Users2, Plus, X, AlertTriangle, Loader2, Camera, ZoomIn, Search,
  CheckCircle2, Clock, ChevronDown, ChevronRight, Filter, LayoutGrid, BarChart2
} from 'lucide-react';
import { technical, TeamMember, TaskPriority, TechTask, TaskStatus } from '../../services/technical.service';
import { ErrorBanner } from '../../components/insights/InsightBits';
import { errorMessage } from '../../hooks/useLiveQuery';
import { ProofImageModal, ProofModalData } from '../../components/shared/ProofImageModal';
import { tsToIso, timeAgo } from '../../lib/format';

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' },
];

const STATUS_CONFIG: Record<TaskStatus, { label: string; dot: string; bg: string; text: string }> = {
  backlog: { label: 'Backlog', dot: 'bg-slate-400', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400' },
  assigned: { label: 'Assigned', dot: 'bg-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-400' },
  in_progress: { label: 'In progress', dot: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400' },
  blocked: { label: 'Blocked', dot: 'bg-rose-500', bg: 'bg-rose-50 dark:bg-rose-950/30', text: 'text-rose-700 dark:text-rose-400' },
  in_review: { label: 'In review', dot: 'bg-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30', text: 'text-violet-700 dark:text-violet-400' },
  completed: { label: 'Completed', dot: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400' },
};

/** Workload balancer: real data, deterministic logic, no fake AI. */
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
  const [tasks, setTasks] = useState<TechTask[] | null>(null);
  const [activeView, setActiveView] = useState<'submissions' | 'workload'>('submissions');
  const [statusFilter, setStatusFilter] = useState<'all' | 'with_proof' | 'completed' | 'in_progress' | 'blocked'>('all');
  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewProof, setPreviewProof] = useState<ProofModalData | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [membersData, tasksData] = await Promise.all([
        technical.team(),
        technical.tasks(),
      ]);
      setMembers(membersData);
      setTasks(tasksData);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const allTasks = tasks || [];
  const withProofCount = allTasks.filter((t) => !!t.proofScreenshotUrl).length;
  const completedCount = allTasks.filter((t) => t.status === 'completed').length;
  const inProgressCount = allTasks.filter((t) => t.status === 'in_progress').length;
  const blockedCount = allTasks.filter((t) => t.status === 'blocked').length;

  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (statusFilter === 'with_proof' && !t.proofScreenshotUrl) return false;
      if (statusFilter === 'completed' && t.status !== 'completed') return false;
      if (statusFilter === 'in_progress' && t.status !== 'in_progress') return false;
      if (statusFilter === 'blocked' && t.status !== 'blocked') return false;
      if (memberFilter !== 'all' && t.assigneeId !== memberFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = t.title?.toLowerCase().includes(q);
        const matchAssignee = t.assigneeName?.toLowerCase().includes(q);
        const matchNote = t.proofNote?.toLowerCase().includes(q);
        const matchDesc = t.description?.toLowerCase().includes(q);
        if (!matchTitle && !matchAssignee && !matchNote && !matchDesc) return false;
      }
      return true;
    });
  }, [allTasks, statusFilter, memberFilter, searchQuery]);

  const insightsList = members ? workloadInsights(members) : [];
  const totalActive = (members || []).reduce((s, m) => s + m.activeTasks, 0);

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-6 sm:px-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-[var(--text-1)]">Team &amp; Proofs</h1>
          <p className="mt-1 text-[13px] text-[var(--text-3)]">
            {members?.length ?? '—'} team members &middot; {allTasks.length} total tasks &middot;{' '}
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {withProofCount} verified with proof
            </span>
          </p>
        </div>
        <button
          onClick={() => setShowNewTask(true)}
          className="press flex items-center gap-1.5 rounded-full bg-[#093765] px-4 py-2.5 text-[13px] font-semibold text-white shadow-xs hover:bg-[#0c437a] transition-colors"
        >
          <Plus className="size-4" /> New task
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {/* View Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
        <button
          onClick={() => setActiveView('submissions')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold transition-all ${
            activeView === 'submissions'
              ? 'bg-[#093765] text-white shadow-xs'
              : 'text-[var(--text-2)] hover:bg-[var(--surface-2)]'
          }`}
        >
          <LayoutGrid className="size-4" />
          Task Submissions &amp; Proofs ({allTasks.length})
        </button>
        <button
          onClick={() => setActiveView('workload')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold transition-all ${
            activeView === 'workload'
              ? 'bg-[#093765] text-white shadow-xs'
              : 'text-[var(--text-2)] hover:bg-[var(--surface-2)]'
          }`}
        >
          <BarChart2 className="size-4" />
          Workload Balance ({members?.length || 0})
        </button>
      </div>

      {activeView === 'submissions' && (
        <div className="space-y-4">
          {/* Filters & Search Bar */}
          <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xs">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setStatusFilter('all')}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-[#093765] text-white'
                    : 'border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface)]'
                }`}
              >
                All Tasks ({allTasks.length})
              </button>
              <button
                onClick={() => setStatusFilter('with_proof')}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === 'with_proof'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20'
                }`}
              >
                <Camera className="size-3.5" />
                With Proof Photo ({withProofCount})
              </button>
              <button
                onClick={() => setStatusFilter('completed')}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === 'completed'
                    ? 'bg-emerald-700 text-white'
                    : 'border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface)]'
                }`}
              >
                Completed ({completedCount})
              </button>
              <button
                onClick={() => setStatusFilter('in_progress')}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === 'in_progress'
                    ? 'bg-amber-600 text-white'
                    : 'border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface)]'
                }`}
              >
                In Progress ({inProgressCount})
              </button>
              {blockedCount > 0 && (
                <button
                  onClick={() => setStatusFilter('blocked')}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    statusFilter === 'blocked'
                      ? 'bg-rose-600 text-white'
                      : 'border border-rose-200 bg-[var(--surface-2)] text-rose-600 hover:bg-rose-50'
                  }`}
                >
                  Blocked ({blockedCount})
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--text-3)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by title, assignee, or proof notes..."
                  className="h-9.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] pl-9.5 pr-3 text-[13px] text-[var(--text-1)] outline-none focus:border-[#093765]"
                />
              </div>
              <select
                value={memberFilter}
                onChange={(e) => setMemberFilter(e.target.value)}
                className="h-9.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-[13px] text-[var(--text-1)] outline-none"
              >
                <option value="all">All Team Members</option>
                {(members || []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.role === 'tech_lead' ? '(Lead)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tasks Grid / Feed */}
          {tasks === null ? (
            <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-[var(--text-3)]" /></div>
          ) : filteredTasks.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
              <Camera className="mx-auto size-8 text-[var(--text-3)] opacity-50 mb-2" />
              <p className="text-[14px] font-semibold text-[var(--text-2)]">No task submissions found</p>
              <p className="mt-1 text-[12px] text-[var(--text-3)]">
                {statusFilter === 'with_proof'
                  ? 'No tasks with submitted proof screenshots match your filter.'
                  : 'Try selecting a different filter or clearing search.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTasks.map((task) => {
                const status = STATUS_CONFIG[task.status] || {
                  label: task.status,
                  dot: 'bg-slate-400',
                  bg: 'bg-slate-100',
                  text: 'text-slate-600',
                };
                const completedIso = tsToIso(task.completedAt);
                const completedAgo = completedIso ? timeAgo(completedIso) : null;
                const due = task.dueAtMs
                  ? new Date(task.dueAtMs).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                  : null;

                return (
                  <div
                    key={task.id}
                    className="flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                  >
                    <div className="space-y-3">
                      {/* Card Top: Assignee + Badges */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex size-7.5 shrink-0 items-center justify-center rounded-full bg-[#093765]/10 text-[#093765] dark:text-blue-300 font-bold text-[11px]">
                            {task.assigneeName ? task.assigneeName.slice(0, 2).toUpperCase() : '??'}
                          </div>
                          <div>
                            <p className="text-[13px] font-bold text-[var(--text-1)] leading-tight">
                              {task.assigneeName}
                            </p>
                            <p className="text-[11px] text-[var(--text-3)]">
                              {completedAgo ? `Done ${completedAgo}` : due ? `Due ${due}` : 'Assigned'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${status.bg} ${status.text}`}
                          >
                            <span className={`size-1.5 rounded-full ${status.dot}`} />
                            {status.label}
                          </span>
                        </div>
                      </div>

                      {/* Title & Description */}
                      <div>
                        <h3 className="text-[14px] font-bold text-[var(--text-1)] leading-snug">
                          {task.title}
                        </h3>
                        {task.description && (
                          <p className="mt-1 text-[12px] text-[var(--text-3)] line-clamp-2">
                            {task.description}
                          </p>
                        )}
                      </div>

                      {/* Proof Screenshot Section if available */}
                      {task.proofScreenshotUrl ? (
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-950/20 p-3 space-y-2">
                          <div className="flex items-center justify-between text-[11.5px] font-bold text-emerald-800 dark:text-emerald-300">
                            <span className="flex items-center gap-1.5">
                              <Camera className="size-3.5" /> Proof of Work Photo
                            </span>
                            <span className="text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400">
                              Click to inspect
                            </span>
                          </div>

                          {task.proofNote && (
                            <p className="text-[12px] text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-900/80 rounded-lg p-2 border border-emerald-500/20 leading-relaxed font-sans italic">
                              &ldquo;{task.proofNote}&rdquo;
                            </p>
                          )}

                          <div
                            onClick={() =>
                              setPreviewProof({
                                imageUrl: task.proofScreenshotUrl!,
                                title: task.title,
                                assigneeName: task.assigneeName,
                                proofNote: task.proofNote,
                                completedAt: task.completedAt,
                                status: status.label,
                              })
                            }
                            className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-black/10 aspect-video flex items-center justify-center"
                          >
                            <img
                              src={task.proofScreenshotUrl}
                              alt={task.title}
                              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity gap-1.5 text-white font-semibold text-xs backdrop-blur-xs">
                              <ZoomIn className="size-4" /> Full View Lightbox
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-[11px] text-[var(--text-3)] pt-1">
                          <span>Priority: <strong className="capitalize">{task.priority}</strong></span>
                          {task.relatedMachine && <span>Machine: <strong>{task.relatedMachine}</strong></span>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Workload Balancer View */}
      {activeView === 'workload' && (
        <div className="space-y-4">
          {insightsList.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="size-4" /> Worth a look
              </p>
              {insightsList.map((n, i) => (
                <p key={i} className="text-[12.5px] text-amber-700 dark:text-amber-400">
                  {n}
                </p>
              ))}
            </div>
          )}

          {members === null ? (
            <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-[var(--text-3)]" /></div>
          ) : (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Users2 className="size-4 text-[var(--text-3)]" />
                <h2 className="text-[13px] font-semibold text-[var(--text-2)]">Workload Capacity</h2>
              </div>
              <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                {members.map((m, i) => {
                  const max = Math.max(...members.map((x) => x.activeTasks), 1);
                  return (
                    <div key={m.id} className="animate-fadeIn px-4 py-3.5" style={{ animationDelay: `${i * 40}ms` }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-8 items-center justify-center rounded-full bg-[var(--surface-2)] text-[12px] font-bold text-[var(--text-2)]">
                            {m.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-[14px] font-semibold text-[var(--text-1)]">{m.name}</p>
                            <p className="text-[11px] text-[var(--text-3)]">
                              {m.role === 'tech_lead' ? 'Technical Lead' : 'Technical Member'}
                              {m.skills.length > 0 && ` · ${m.skills.join(', ')}`}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[14px] font-bold tabular-nums text-[var(--text-1)]">{m.activeTasks} active</p>
                          <p className="text-[11px] text-[var(--text-3)]">
                            {m.completedTasks} completed
                            {m.blockedTasks > 0 && (
                              <span className="text-rose-600 dark:text-rose-400"> &middot; {m.blockedTasks} blocked</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                        <div
                          className={`h-full rounded-full ${m.blockedTasks > 0 ? 'bg-rose-500' : 'bg-[#093765]'}`}
                          style={{ width: `${(m.activeTasks / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {showNewTask && members && (
        <NewTaskModal members={members} onClose={() => setShowNewTask(false)} onCreated={load} />
      )}

      {/* High-res Image Lightbox Modal */}
      <ProofImageModal data={previewProof} onClose={() => setPreviewProof(null)} />
    </div>
  );
};

