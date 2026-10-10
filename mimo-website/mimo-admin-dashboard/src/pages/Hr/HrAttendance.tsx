import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, CalendarCheck } from 'lucide-react';
import { hr, Employee, AttendanceStatus, AttendanceEntry } from '../../services/hr.service';
import { ErrorBanner } from '../../components/insights/InsightBits';
import { errorMessage } from '../../hooks/useLiveQuery';

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; className: string }[] = [
  { value: 'present', label: 'Present', className: 'bg-emerald-600' },
  { value: 'half_day', label: 'Half day', className: 'bg-amber-500' },
  { value: 'leave', label: 'Leave', className: 'bg-blue-600' },
  { value: 'absent', label: 'Absent', className: 'bg-rose-600' },
];

export const HrAttendance: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [existing, setExisting] = useState<Record<string, AttendanceEntry>>({});
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    try {
      const [emps, att] = await Promise.all([hr.employees({ status: 'active' }), hr.attendance(today)]);
      setEmployees(emps);
      const byEmployee: Record<string, AttendanceEntry> = {};
      att.entries.forEach((e) => { byEmployee[e.employeeId] = e; });
      setExisting(byEmployee);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);

  const setMark = (employeeId: string, status: AttendanceStatus) => setMarks((m) => ({ ...m, [employeeId]: status }));

  const save = async () => {
    const entries = Object.entries(marks).map(([employeeId, status]) => {
      const employee = (employees || []).find((e) => e.id === employeeId);
      return { employeeId, employeeName: employee?.name || '', status };
    });
    if (entries.length === 0) return;
    setSaving(true);
    try {
      await hr.markAttendance(entries, today);
      setMarks({});
      setSavedAt(Date.now());
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const pendingCount = Object.keys(marks).length;

  return (
    <div className="mx-auto max-w-[800px] space-y-5 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight text-[var(--text-1)]">Attendance</h1>
          <p className="mt-1 text-[13px] text-[var(--text-3)]">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <button disabled={saving || pendingCount === 0} onClick={save} className="press flex items-center gap-1.5 rounded-full bg-[#093765] px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40">
          <CalendarCheck className="size-4" /> {saving ? 'Saving...' : pendingCount > 0 ? `Save (${pendingCount})` : 'Save'}
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}
      {savedAt && Date.now() - savedAt < 4000 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[13px] font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          Attendance saved.
        </div>
      )}

      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        {employees === null ? (
          <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-[var(--text-3)]" /></div>
        ) : employees.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[var(--text-3)]">No active employees yet.</p>
        ) : (
          employees.map((e) => {
            const current = marks[e.id] ?? existing[e.id]?.status;
            return (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[12px] font-bold text-[var(--text-2)]">{e.name.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <p className="text-[14px] font-medium text-[var(--text-1)]">{e.name}</p>
                    <p className="text-[11px] text-[var(--text-3)] capitalize">{e.department}</p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setMark(e.id, opt.value)}
                      className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${
                        current === opt.value ? `${opt.className} text-white` : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--border)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
