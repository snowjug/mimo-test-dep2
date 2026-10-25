import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Wrench, Megaphone, Users2, Plus, X, Loader2, ChevronRight, ChevronDown,
  Check, Ban, CheckCircle2, Circle, UserPlus, UserMinus, CalendarClock, Flame,
  Camera, ZoomIn, Search, Image as ImageIcon, FileText,
} from 'lucide-react';
import { adminCompany } from '../../services/adminCompany.service';
import { adminGang, LoginStreaks } from '../../services/adminGang.service';
import { Employee } from '../../services/hr.service';
import { TechTask, TaskStatus, TaskPriority } from '../../services/technical.service';
import { MarketingTask, MarketingTaskStatus, MarketingTaskPriority } from '../../services/marketing.service';
import { ContributionGraph } from '../../components/gang/ContributionGraph';
import { ErrorBanner } from '../../components/insights/InsightBits';
import { errorMessage } from '../../hooks/useLiveQuery';
import { ProofImageModal, ProofModalData } from '../../components/shared/ProofImageModal';
import { tsToIso, timeAgo } from '../../lib/format';

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
        <div key={m.id} className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 sm:w-auto">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300">
            {m.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
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

const TechTaskRow: React.FC<{
  task: TechTask;
  members: Employee[];
  onChange: () => void;
  onViewProof: (data: ProofModalData) => void;
}> = ({ task, members, onChange, onViewProof }) => {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = TECH_STATUS[task.status] || { label: task.status, dot: 'bg-slate-400' };
  const due = task.dueAtMs ? new Date(task.dueAtMs).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null;
  const completedIso = tsToIso(task.completedAt);
  const completedAgo = completedIso ? timeAgo(completedIso) : null;

  const setStatus = async (s: TaskStatus) => {
    setBusy(true);
    try { await adminGang.updateTechnicalTask(task.id, { status: s }); onChange(); } finally { setBusy(false); }
  };
  const reassign = async (assigneeId: string) => {
    if (!assigneeId || assigneeId === task.assigneeId) return;
    setBusy(true);
    try { await adminGang.updateTechnicalTask(task.id, { assigneeId }); onChange(); } finally { setBusy(false); }
  };

  return (
    <div className={`transition-colors ${expanded ? 'bg-slate-50/50 dark:bg-slate-800/20' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/40'}`}>
      <button onClick={() => setExpanded((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className={`size-2 shrink-0 rounded-full ${status.dot}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{task.title}</p>
            {task.proofScreenshotUrl && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                <Camera className="size-3" /> Proof attached
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            <span className="font-semibold text-slate-700 dark:text-slate-300">{task.assigneeName}</span>
            {task.creatorName && <> &middot; by {task.creatorName}</>}
            <> &middot; <span className="font-medium">{status.label}</span></>
            {completedAgo && <> &middot; <span className="text-emerald-600 dark:text-emerald-400 font-medium">Completed {completedAgo}</span></>}
            {due && !completedAgo && <> &middot; Due {due}</>}
          </p>
        </div>
        {task.proofScreenshotUrl && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewProof({
                imageUrl: task.proofScreenshotUrl!,
                title: task.title,
                assigneeName: task.assigneeName,
                proofNote: task.proofNote,
                completedAt: task.completedAt,
                status: status.label,
              });
            }}
            className="flex items-center gap-1 shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 transition-colors"
            title="Inspect submitted proof screenshot"
          >
            <ZoomIn className="size-3.5" />
            <span className="hidden sm:inline">Inspect proof</span>
          </button>
        )}
        {expanded ? <ChevronDown className="size-4 text-slate-400 shrink-0" /> : <ChevronRight className="size-4 text-slate-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-4 py-4">
          {task.description && (
            <div>
              <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Description</p>
              <p className="text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-700 leading-relaxed">{task.description}</p>
            </div>
          )}

          {task.proofScreenshotUrl && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  <Camera className="size-3.5" /> Submitted Proof of Work
                </p>
                {completedAgo && (
                  <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    Done {completedAgo}
                  </span>
                )}
              </div>

              {task.proofNote && (
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-wide text-slate-400 mb-1">Completion Note / Report</p>
                  <p className="text-xs text-slate-800 dark:text-slate-200 bg-white/90 dark:bg-slate-900/90 rounded-lg p-2.5 border border-emerald-500/20 leading-relaxed font-sans">
                    {task.proofNote}
                  </p>
                </div>
              )}

              <div className="relative group max-w-md overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-black/10">
                <img
                  src={task.proofScreenshotUrl}
                  alt={task.title}
                  className="h-44 w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    onViewProof({
                      imageUrl: task.proofScreenshotUrl!,
                      title: task.title,
                      assigneeName: task.assigneeName,
                      proofNote: task.proofNote,
                      completedAt: task.completedAt,
                      status: status.label,
                    })
                  }
                  className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity gap-2 text-white font-semibold text-xs backdrop-blur-xs"
                >
                  <ZoomIn className="size-4" /> Click to view full proof screenshot
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Change Status</p>
              <div className="flex flex-wrap gap-1.5">
                {TECH_STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    disabled={busy || s === task.status}
                    onClick={() => setStatus(s)}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-semibold disabled:cursor-default transition-all ${
                      s === task.status ? `${TECH_STATUS[s].dot} text-white shadow-xs` : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {TECH_STATUS[s].label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Reassign</p>
              <select
                disabled={busy}
                value={task.assigneeId}
                onChange={(e) => reassign(e.target.value)}
                className="h-9 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs outline-none disabled:opacity-50"
              >
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const TechnicalTab: React.FC<{ employees: Employee[]; streaks: LoginStreaks }> = ({ employees, streaks }) => {
  const [tasks, setTasks] = useState<TechTask[] | null>(null);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'with_proof' | 'completed' | 'in_progress' | 'blocked'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewProof, setPreviewProof] = useState<ProofModalData | null>(null);

  const members = employees.filter((e) => e.department === 'technical' && e.status !== 'offboarded');

  const load = useCallback(async () => {
    try { setTasks(await adminGang.technicalTasks()); setError(''); } catch (err) { setError(errorMessage(err)); }
  }, []);
  useEffect(() => { load(); }, [load]);

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
      if (assigneeFilter !== 'all' && t.assigneeId !== assigneeFilter) return false;
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
  }, [allTasks, statusFilter, assigneeFilter, searchQuery]);

  return (
    <div>
      <MemberStrip members={members} streaks={streaks} />

      {/* Header & New Task */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Technical Operations &amp; Proofs</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {allTasks.length} total tasks &middot;{' '}
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{withProofCount} with proof screenshot</span>
          </p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 rounded-full bg-[#093765] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#0c437a] transition-colors">
          <Plus className="size-3.5" /> New task
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="mb-4 space-y-2.5">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === 'all'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
            }`}
          >
            All ({allTasks.length})
          </button>
          <button
            onClick={() => setStatusFilter('with_proof')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === 'with_proof'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
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
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
            }`}
          >
            Completed ({completedCount})
          </button>
          <button
            onClick={() => setStatusFilter('in_progress')}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === 'in_progress'
                ? 'bg-amber-600 text-white'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
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
                  : 'bg-white dark:bg-slate-900 text-rose-600 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50'
              }`}
            >
              Blocked ({blockedCount})
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by task title, technician, or note..."
              className="h-9 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-9 pr-3 text-xs outline-none focus:border-[#093765]"
            />
          </div>
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs outline-none"
          >
            <option value="all">All Technicians</option>
            {members.map((m) => (
              <option key={m.id} value={m.loginRef?.id || m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        {tasks === null ? (
          <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-slate-400" /></div>
        ) : filteredTasks.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No tasks found</p>
            <p className="mt-1 text-xs text-slate-400">
              {statusFilter === 'with_proof'
                ? 'No tasks have submitted proof screenshots for the current filters.'
                : 'No tasks match the selected filters.'}
            </p>
          </div>
        ) : (
          filteredTasks.map((t) => (
            <TechTaskRow
              key={t.id}
              task={t}
              members={members}
              onChange={load}
              onViewProof={setPreviewProof}
            />
          ))
        )}
      </div>

      {showNew && <NewTechTaskModal members={members} onClose={() => setShowNew(false)} onCreated={load} />}

      {/* Proof Lightbox Modal */}
      <ProofImageModal data={previewProof} onClose={() => setPreviewProof(null)} />
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
      {/* HR Pulse: the daily-glance strip — what needs attention right now, across the whole company. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
        <div className={`rounded-xl border p-3 ${leaveRequests.length > 0 ? 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'}`}>
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            <CalendarClock className="size-3.5" /> Needs action
          </div>
          <p className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">{loadingLeave ? '—' : leaveRequests.length}</p>
          <p className="text-[11px] text-slate-500">pending leave request{leaveRequests.length === 1 ? '' : 's'}</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <UserPlus className="size-3.5" /> Onboarding
          </div>
          <p className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">{onboarding.length}</p>
          <p className="text-[11px] text-slate-500">in progress, company-wide</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <Users2 className="size-3.5" /> Active staff
          </div>
          <p className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">{active.length}</p>
          <p className="text-[11px] text-slate-500">across tech, HR &amp; marketing</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <Flame className="size-3.5" /> HR team
          </div>
          <p className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">{hrMembers.length}</p>
          <p className="text-[11px] text-slate-500">logged-in streaks below</p>
        </div>
      </div>

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
