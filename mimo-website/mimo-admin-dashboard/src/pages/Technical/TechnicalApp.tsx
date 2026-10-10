import React, { useEffect, useState, useCallback } from 'react';
import { LogOut, Wrench, Users2, Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { technical } from '../../services/technical.service';
import { TechnicalLoginPage } from '../../components/auth/TechnicalLoginPage';
import { TechnicalWorkspace } from './TechnicalWorkspace';
import { TechnicalTeamPage } from './TechnicalTeamPage';

type Tab = 'workspace' | 'team';

interface Me {
  member: { id: string; name: string; role: 'tech_lead' | 'tech_member'; email: string; skills: string[] };
  stats: { activeTasks: number; completedTasks: number; overdueTasks: number; completionRate: number | null; avgCompletionHours: number | null };
}

/**
 * Technical portal: its own login (separate from Admin/Finance — team members sign in with their own
 * identity, not the shared admin password), its own shell. Mirrors the Finance portal's structure.
 */
export const TechnicalApp: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();
  const [token, setToken] = useState(() => localStorage.getItem('technicalToken') || '');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('workspace');

  const loadMe = useCallback(async () => {
    setMeLoading(true);
    try {
      const data = await technical.me();
      setMe(data as Me);
    } catch {
      // api.ts already clears the token and reloads on a real 401; this just stops a spinner on other errors.
    } finally {
      setMeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) loadMe();
  }, [token, loadMe]);

  const handleLogin = async (email: string, password: string) => {
    setAuthError('');
    setAuthLoading(true);
    try {
      const { token: t } = await technical.login(email, password);
      localStorage.setItem('technicalToken', t);
      setToken(t);
    } catch (err: any) {
      setAuthError(err?.response?.data?.error || 'Invalid credentials.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('technicalToken');
    setToken('');
    setMe(null);
  };

  if (!token) {
    return <TechnicalLoginPage onLogin={handleLogin} loading={authLoading} error={authError} />;
  }

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-[100dvh] bg-[var(--canvas)] text-[var(--text-1)]">
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1100px] items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2.5">
              <span className="text-[16px] font-black tracking-tight text-[#093765] dark:text-white">MIMO</span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--text-2)]">Technical</span>
            </div>

            {me && (
              <nav className="hidden items-center gap-1 rounded-full bg-[var(--surface-2)] p-1 sm:flex">
                <button
                  onClick={() => setTab('workspace')}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${tab === 'workspace' ? 'bg-[var(--surface)] text-[var(--text-1)] shadow-sm' : 'text-[var(--text-3)]'}`}
                >
                  <Wrench className="size-3.5" /> My workspace
                </button>
                {me.member.role === 'tech_lead' && (
                  <button
                    onClick={() => setTab('team')}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${tab === 'team' ? 'bg-[var(--surface)] text-[var(--text-1)] shadow-sm' : 'text-[var(--text-3)]'}`}
                  >
                    <Users2 className="size-3.5" /> Team
                  </button>
                )}
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
              <button onClick={() => setTab('workspace')} className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${tab === 'workspace' ? 'bg-[var(--surface-2)] text-[var(--text-1)]' : 'text-[var(--text-3)]'}`}>My workspace</button>
              {me.member.role === 'tech_lead' && (
                <button onClick={() => setTab('team')} className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${tab === 'team' ? 'bg-[var(--surface-2)] text-[var(--text-1)]' : 'text-[var(--text-3)]'}`}>Team</button>
              )}
            </nav>
          )}
        </header>

        {meLoading || !me ? (
          <div className="flex min-h-[60dvh] items-center justify-center">
            <Loader2 className="size-6 animate-spin text-[var(--text-3)]" />
          </div>
        ) : tab === 'workspace' ? (
          <TechnicalWorkspace me={me} onRefreshMe={loadMe} />
        ) : (
          <TechnicalTeamPage currentMemberId={me.member.id} />
        )}
      </div>
    </div>
  );
};
