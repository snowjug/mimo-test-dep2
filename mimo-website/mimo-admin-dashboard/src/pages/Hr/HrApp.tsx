import React, { useEffect, useState, useCallback } from 'react';
import { LogOut, Loader2, LayoutDashboard, Users2, CalendarCheck, CalendarClock } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { hr } from '../../services/hr.service';
import { HrLoginPage } from '../../components/auth/HrLoginPage';
import { HrOverview } from './HrOverview';
import { HrEmployees } from './HrEmployees';
import { HrAttendance } from './HrAttendance';
import { HrLeave } from './HrLeave';

type Tab = 'overview' | 'employees' | 'attendance' | 'leave';
const TABS: { value: Tab; label: string; icon: React.ElementType }[] = [
  { value: 'overview', label: 'Overview', icon: LayoutDashboard },
  { value: 'employees', label: 'Employees', icon: Users2 },
  { value: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { value: 'leave', label: 'Leave', icon: CalendarClock },
];

interface Me {
  member: { id: string; name: string; role: 'hr_lead' | 'hr_staff'; email: string };
  stats: { totalEmployees: number; onboarding: number; pendingLeaveRequests: number };
}

/** HR portal: its own login, its own shell, same structure as the Technical/Finance/Marketing portals. */
export const HrApp: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();
  const [token, setToken] = useState(() => localStorage.getItem('hrToken') || '');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');

  const loadMe = useCallback(async () => {
    setMeLoading(true);
    try {
      setMe((await hr.me()) as Me);
    } catch {
      // api.ts clears the token and reloads on a real 401; this just stops the spinner on other errors.
    } finally {
      setMeLoading(false);
    }
  }, []);

  useEffect(() => { if (token) loadMe(); }, [token, loadMe]);

  const handleLogin = async (email: string, password: string) => {
    setAuthError('');
    setAuthLoading(true);
    try {
      const { token: t } = await hr.login(email, password);
      localStorage.setItem('hrToken', t);
      setToken(t);
    } catch (err: any) {
      setAuthError(err?.response?.data?.error || 'Invalid credentials.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('hrToken');
    setToken('');
    setMe(null);
  };

  if (!token) return <HrLoginPage onLogin={handleLogin} loading={authLoading} error={authError} />;

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-[100dvh] bg-[var(--canvas)] text-[var(--text-1)]">
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
          <div className="mx-auto flex max-w-[800px] items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2.5">
              <span className="text-[16px] font-black tracking-tight text-[#093765] dark:text-white">MIMO</span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--text-2)]">HR</span>
            </div>

            {me && (
              <nav className="hidden items-center gap-1 rounded-full bg-[var(--surface-2)] p-1 sm:flex">
                {TABS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTab(t.value)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${tab === t.value ? 'bg-[var(--surface)] text-[var(--text-1)] shadow-sm' : 'text-[var(--text-3)]'}`}
                  >
                    <t.icon className="size-3.5" /> {t.label}
                  </button>
                ))}
              </nav>
            )}

            <div className="flex items-center gap-2">
              {me && <span className="hidden text-[13px] font-medium text-[var(--text-2)] sm:inline">{me.member.name}</span>}
              <button onClick={toggleTheme} className="press flex size-8 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-2)]" aria-label="Toggle theme">
                {isDark ? '☀️' : '🌙'}
              </button>
              <button onClick={handleLogout} className="press flex size-8 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-2)]" aria-label="Log out">
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
          {me && (
            <nav className="flex items-center gap-1 overflow-x-auto px-4 pb-2 sm:hidden">
              {TABS.map((t) => (
                <button key={t.value} onClick={() => setTab(t.value)} className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${tab === t.value ? 'bg-[var(--surface-2)] text-[var(--text-1)]' : 'text-[var(--text-3)]'}`}>
                  {t.label}
                </button>
              ))}
            </nav>
          )}
        </header>

        {meLoading || !me ? (
          <div className="flex min-h-[60dvh] items-center justify-center">
            <Loader2 className="size-6 animate-spin text-[var(--text-3)]" />
          </div>
        ) : tab === 'overview' ? (
          <HrOverview me={me} />
        ) : tab === 'employees' ? (
          <HrEmployees />
        ) : tab === 'attendance' ? (
          <HrAttendance />
        ) : (
          <HrLeave />
        )}
      </div>
    </div>
  );
};
