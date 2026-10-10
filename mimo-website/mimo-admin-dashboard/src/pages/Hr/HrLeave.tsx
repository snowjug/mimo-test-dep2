import React, { useEffect, useState, useCallback } from 'react';
import { Plus, X, Loader2, Check, Ban } from 'lucide-react';
import { hr, Employee, LeaveRequest, LeaveType } from '../../services/hr.service';
import { ErrorBanner } from '../../components/insights/InsightBits';
import { errorMessage } from '../../hooks/useLiveQuery';

const TYPE_LABEL: Record<LeaveType, string> = { paid: 'Paid', sick: 'Sick', casual: 'Casual', unpaid: 'Unpaid' };
const STATUS_META: Record<LeaveRequest['status'], { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  approved: { label: 'Approved', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  rejected: { label: 'Rejected', className: 'bg-rose-500/10 text-rose-700 dark:text-rose-400' },
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const NewLeaveModal: React.FC<{ employees: Employee[]; onClose: () => void; onCreated: () => void }> = ({ employees, onClose, onCreated }) => {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id || '');
  const [type, setType] = useState<LeaveType>('paid');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!employeeId || !fromDate || !toDate) return;
    setSubmitting(true);
    setError('');
    try {
      await hr.fileLeaveRequest({ employeeId, type, fromDate, toDate, reason: reason.trim() });
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
          <p className="text-[16px] font-bold text-[var(--text-1)]">File a leave request</p>
          <button onClick={onClose}><X className="size-4.5 text-[var(--text-3)]" /></button>
        </div>
        {error && <ErrorBanner message={error} />}
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-[13px] outline-none">
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.department})</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as LeaveType)} className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-[13px] outline-none">
          {(Object.keys(TYPE_LABEL) as LeaveType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 text-[13px] outline-none" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 text-[13px] outline-none" />
        </div>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" rows={2} className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-[13px] outline-none" />
        <button disabled={submitting || !employeeId || !fromDate || !toDate} onClick={submit} className="press w-full rounded-full bg-[#093765] py-2.5 text-[13px] font-semibold text-white disabled:opacity-50">
          {submitting ? 'Filing...' : 'File request'}
        </button>
      </div>
    </div>
  );
};

export const HrLeave: React.FC = () => {
  const [requests, setRequests] = useState<LeaveRequest[] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [reqs, emps] = await Promise.all([hr.leaveRequests(), hr.employees({ status: 'active' })]);
      setRequests(reqs);
      setEmployees(emps);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (id: string, status: 'approved' | 'rejected') => {
    setBusyId(id);
    try { await hr.decideLeaveRequest(id, status); await load(); } finally { setBusyId(null); }
  };

  const pending = (requests || []).filter((r) => r.status === 'pending');
  const decided = (requests || []).filter((r) => r.status !== 'pending');

  return (
    <div className="mx-auto max-w-[800px] space-y-5 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight text-[var(--text-1)]">Leave</h1>
          <p className="mt-1 text-[13px] text-[var(--text-3)]">{pending.length} pending approval</p>
        </div>
        <button onClick={() => setShowNew(true)} className="press flex items-center gap-1.5 rounded-full bg-[#093765] px-4 py-2.5 text-[13px] font-semibold text-white">
          <Plus className="size-4" /> File leave
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <div>
        <h2 className="mb-2 text-[13px] font-semibold text-[var(--text-2)]">Pending</h2>
        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          {requests === null ? (
            <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-[var(--text-3)]" /></div>
          ) : pending.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-[var(--text-3)]">Nothing pending.</p>
          ) : (
            pending.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-[14px] font-medium text-[var(--text-1)]">{r.employeeName} · {TYPE_LABEL[r.type]}</p>
                  <p className="text-[12px] text-[var(--text-3)]">{fmtDate(r.fromDate)} – {fmtDate(r.toDate)} ({r.days}d){r.reason && ` · ${r.reason}`}</p>
                </div>
                <div className="flex gap-1.5">
                  <button disabled={busyId === r.id} onClick={() => decide(r.id, 'approved')} className="press flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
                    <Check className="size-3.5" /> Approve
                  </button>
                  <button disabled={busyId === r.id} onClick={() => decide(r.id, 'rejected')} className="press flex items-center gap-1 rounded-full bg-rose-600/10 px-3 py-1.5 text-[12px] font-semibold text-rose-600 dark:text-rose-400 disabled:opacity-50">
                    <Ban className="size-3.5" /> Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {decided.length > 0 && (
        <div>
          <h2 className="mb-2 text-[13px] font-semibold text-[var(--text-2)]">History</h2>
          <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            {decided.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-[13.5px] font-medium text-[var(--text-1)]">{r.employeeName} · {TYPE_LABEL[r.type]}</p>
                  <p className="text-[11.5px] text-[var(--text-3)]">{fmtDate(r.fromDate)} – {fmtDate(r.toDate)} ({r.days}d)</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_META[r.status].className}`}>{STATUS_META[r.status].label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showNew && <NewLeaveModal employees={employees} onClose={() => setShowNew(false)} onCreated={load} />}
    </div>
  );
};
