import React, { useEffect, useState, useCallback } from 'react';
import { LogOut, Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { marketing } from '../../services/marketing.service';
import { MarketingLoginPage } from '../../components/auth/MarketingLoginPage';
import { MarketingWorkspace } from './MarketingWorkspace';

interface Me {
  member: { id: string; name: string; role: string; email: string };
  stats: { planned: number; inProgress: number; completed: number };
}

/** Marketing portal: one shared seat (no named individuals yet), one page. Same shell pattern as the
 * Technical/Finance portals, just without the tab nav since there's only one thing to show. */
export const MarketingApp: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();
  const [token, setToken] = useState(() => localStorage.getItem('marketingToken') || '');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  const loadMe = useCallback(async () => {
    setMeLoading(true);
    try {
      setMe((await marketing.me()) as Me);
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
      const { token: t } = await marketing.login(email, password);
      localStorage.setItem('marketingToken', t);
      setToken(t);
    } catch (err: any) {
      setAuthError(err?.response?.data?.error || 'Invalid credentials.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('marketingToken');
    setToken('');
    setMe(null);
  };

  if (!token) return <MarketingLoginPage onLogin={handleLogin} loading={authLoading} error={authError} />;

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-[100dvh] bg-[var(--canvas)] text-[var(--text-1)]">
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
          <div className="mx-auto flex max-w-[800px] items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2.5">
              <span className="text-[16px] font-black tracking-tight text-[#093765] dark:text-white">MIMO</span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--text-2)]">Marketing</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={toggleTheme} className="press flex size-8 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-2)]" aria-label="Toggle theme">
                {isDark ? '☀️' : '🌙'}
              </button>
              <button onClick={handleLogout} className="press flex size-8 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-2)]" aria-label="Log out">
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </header>

        {meLoading || !me ? (
          <div className="flex min-h-[60dvh] items-center justify-center">
            <Loader2 className="size-6 animate-spin text-[var(--text-3)]" />
          </div>
        ) : (
          <MarketingWorkspace me={me} />
        )}
      </div>
    </div>
  );
};
