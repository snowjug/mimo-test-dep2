import React, { useEffect, useState, useCallback } from 'react';
import { Plus, X, Loader2, ChevronRight, ChevronDown, CheckCircle2, Circle, UserMinus, UserPlus } from 'lucide-react';
import { hr, Employee, Department } from '../../services/hr.service';
import { ErrorBanner } from '../../components/insights/InsightBits';
import { errorMessage } from '../../hooks/useLiveQuery';

const DEPARTMENTS: { value: Department; label: string }[] = [
  { value: 'technical', label: 'Technical' },
  { value: 'hr', label: 'HR' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'finance', label: 'Finance' },
  { value: 'admin', label: 'Admin' },
];
const STATUS_DOT: Record<Employee['status'], string> = {
  onboarding: 'bg-amber-500',
  active: 'bg-emerald-500',
  offboarded: 'bg-[var(--text-3)]',
};

const NewEmployeeModal: React.FC<{ onClose: () => void; onCreated: () => void }> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState<Department>('technical');
  const [title, setTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await hr.createEmployee({ name: name.trim(), email: email.trim() || undefined, department, title: title.trim() || undefined, phone: phone.trim() || undefined });
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
          <p className="text-[16px] font-bold text-[var(--text-1)]">Add a new hire</p>
          <button onClick={onClose}><X className="size-4.5 text-[var(--text-3)]" /></button>
        </div>
        {error && <ErrorBanner message={error} />}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 text-[14px] outline-none" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 text-[13px] outline-none" />
        <div className="grid grid-cols-2 gap-2">
          <select value={department} onChange={(e) => setDepartment(e.target.value as Department)} className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-[13px] outline-none">
            {DEPARTMENTS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 text-[13px] outline-none" />
        </div>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 text-[13px] outline-none" />
        <p className="text-[11.5px] text-[var(--text-3)]">New hires start in the onboarding checklist — flip them to Active once they're set up.</p>
        <button disabled={submitting || !name.trim()} onClick={submit} className="press w-full rounded-full bg-[#093765] py-2.5 text-[13px] font-semibold text-white disabled:opacity-50">
          {submitting ? 'Adding...' : 'Add to roster'}
        </button>
      </div>
    </div>
  );
};

const EmployeeRow: React.FC<{ employee: Employee; expanded: boolean; onToggle: () => void; onChange: () => void }> = ({ employee, expanded, onToggle, onChange }) => {
  const [busy, setBusy] = useState(false);
  const [newTask, setNewTask] = useState('');

  const toggleTask = async (index: number, done: boolean) => {
    setBusy(true);
    try { await hr.toggleOnboarding(employee.id, index, done); onChange(); } finally { setBusy(false); }
  };
  const addTask = async () => {
    if (!newTask.trim()) return;
    setBusy(true);
    try { await hr.addOnboardingTask(employee.id, newTask.trim()); setNewTask(''); onChange(); } finally { setBusy(false); }
  };
  const activate = async () => {
    setBusy(true);
    try { await hr.updateEmployee(employee.id, { status: 'active' }); onChange(); } finally { setBusy(false); }
  };
  const offboard = async () => {
    if (!confirm(`Mark ${employee.name} as offboarded?`)) return;
    setBusy(true);
    try { await hr.updateEmployee(employee.id, { status: 'offboarded' }); onChange(); } finally { setBusy(false); }
  };

  const checklistDone = employee.onboardingChecklist.filter((t) => t.done).length;

  return (
    <div>
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className={`size-2 shrink-0 rounded-full ${STATUS_DOT[employee.status]}`} />
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[12px] font-bold text-[var(--text-2)]">{employee.name.slice(0, 2).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-[var(--text-1)]">{employee.name}</p>
          <p className="mt-0.5 text-[12px] text-[var(--text-3)] capitalize">
            {employee.department}{employee.title && ` · ${employee.title}`}
            {employee.status === 'onboarding' && ` · onboarding (${checklistDone}/${employee.onboardingChecklist.length})`}
            {employee.status === 'offboarded' && ' · offboarded'}
          </p>
        </div>
        {expanded ? <ChevronDown className="size-4 shrink-0 text-[var(--text-3)]" /> : <ChevronRight className="size-4 shrink-0 text-[var(--text-3)]" />}
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-[var(--border)] bg-[var(--surface-2)]/40 px-4 py-3">
          {employee.email && <p className="text-[12.5px] text-[var(--text-2)]">{employee.email}{employee.phone && ` · ${employee.phone}`}</p>}
          <p className="text-[12px] text-[var(--text-3)]">Leave balance — paid: {employee.leaveBalance.paid} · sick: {employee.leaveBalance.sick} · casual: {employee.leaveBalance.casual}</p>

          {employee.status === 'onboarding' && (
            <div className="space-y-1.5 rounded-xl bg-[var(--surface)] p-3">
              <p className="text-[11.5px] font-semibold text-[var(--text-2)]">Onboarding checklist</p>
              {employee.onboardingChecklist.map((item, i) => (
                <button key={i} disabled={busy} onClick={() => toggleTask(i, !item.done)} className="flex w-full items-center gap-2 py-1 text-left">
                  {item.done ? <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" /> : <Circle className="size-3.5 shrink-0 text-[var(--text-3)]" />}
                  <span className={`text-[12.5px] ${item.done ? 'text-[var(--text-3)] line-through' : 'text-[var(--text-1)]'}`}>{item.task}</span>
                </button>
              ))}
              <div className="flex gap-2 pt-1">
                <input value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTask()} placeholder="Add a step..." className="h-8 flex-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 text-[12px] outline-none" />
                <button disabled={busy || !newTask.trim()} onClick={addTask} className="press rounded-full bg-[var(--surface-2)] px-3 text-[12px] font-semibold text-[var(--text-2)] disabled:opacity-40">Add</button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {employee.status === 'onboarding' && (
              <button disabled={busy} onClick={activate} className="press flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
                <UserPlus className="size-3.5" /> Mark active
              </button>
            )}
            {employee.status !== 'offboarded' && (
              <button disabled={busy} onClick={offboard} className="press flex items-center gap-1.5 rounded-full bg-rose-600/10 px-3.5 py-1.5 text-[12px] font-semibold text-rose-600 dark:text-rose-400 disabled:opacity-50">
                <UserMinus className="size-3.5" /> Offboard
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const HrEmployees: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState<Department | 'all'>('all');

  const load = useCallback(async () => {
    try { setEmployees(await hr.employees()); setError(''); } catch (err) { setError(errorMessage(err)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const visible = (employees || []).filter((e) => filter === 'all' || e.department === filter);

  return (
    <div className="mx-auto max-w-[800px] space-y-5 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight text-[var(--text-1)]">Employees</h1>
          <p className="mt-1 text-[13px] text-[var(--text-3)]">{(employees || []).filter((e) => e.status !== 'offboarded').length} active across the company</p>
        </div>
        <button onClick={() => setShowNew(true)} className="press flex items-center gap-1.5 rounded-full bg-[#093765] px-4 py-2.5 text-[13px] font-semibold text-white">
          <Plus className="size-4" /> Add hire
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="flex gap-1.5 overflow-x-auto">
        {(['all', ...DEPARTMENTS.map((d) => d.value)] as (Department | 'all')[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold capitalize ${filter === f ? 'bg-[#093765] text-white' : 'bg-[var(--surface-2)] text-[var(--text-2)]'}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        {employees === null ? (
          <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-[var(--text-3)]" /></div>
        ) : visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[var(--text-3)]">No one here yet.</p>
        ) : (
          visible.map((e) => <EmployeeRow key={e.id} employee={e} expanded={expanded === e.id} onToggle={() => setExpanded(expanded === e.id ? null : e.id)} onChange={load} />)
        )}
      </div>

      {showNew && <NewEmployeeModal onClose={() => setShowNew(false)} onCreated={load} />}
    </div>
  );
};
