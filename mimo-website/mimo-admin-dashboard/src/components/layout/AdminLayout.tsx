import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Printer,
  Cpu,
  Users,
  AlertTriangle,
  BarChart2,
  IndianRupee,
  Settings,
  LogOut,
  Bell,
  Sun,
  Moon,
  MoreHorizontal,
  RefreshCcw,
  ChevronRight,
  X,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { insights } from '../../services/insights.service';
import { defaultRange } from '../../lib/dateRange';
import { timeAgo } from '../../lib/format';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

/** Email stored in the admin JWT (display only; the API verifies the token). */
const emailFromToken = (): string | undefined => {
  try {
    const t = localStorage.getItem('adminToken') || '';
    const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.email === 'string' ? payload.email : undefined;
  } catch {
    return undefined;
  }
};

export interface AdminLayoutProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onLogout: () => void;
  onResetMetrics?: () => void;
  isResetting?: boolean;
  incidentCount?: number; // ignored: the layout reads the live count itself
  children: React.ReactNode;
}

const TITLES: Record<string, string> = {
  overview: 'Overview',
  operations: 'Operations',
  kiosks: 'Kiosks',
  incidents: 'Incidents',
  analytics: 'Analytics',
  users: 'Customers',
  finance: 'Finance',
  configuration: 'Configuration',
};

const TABS = [
  { id: 'overview',   label: 'Overview',   icon: LayoutDashboard },
  { id: 'operations', label: 'Operations', icon: Printer },
  { id: 'kiosks',     label: 'Kiosks',     icon: Cpu },
  { id: 'incidents',  label: 'Incidents',  icon: AlertTriangle },
];

const MORE = [
  { id: 'analytics',     label: 'Analytics',     icon: BarChart2 },
  { id: 'users',         label: 'Customers',     icon: Users },
  { id: 'finance',       label: 'Finance',       icon: IndianRupee },
  { id: 'configuration', label: 'Configuration', icon: Settings },
];

/** Bottom sheet used for "More" and the alerts list. */
const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
    <div className="absolute inset-0 bg-slate-950/40 animate-fadeIn" onClick={onClose} />
    <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[28px] bg-white dark:bg-slate-900 px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl sheet-in">
      <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-slate-300 dark:bg-slate-700" />
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[20px] font-semibold tracking-tight text-slate-900 dark:text-slate-50">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        >
          <X size={16} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  activeTab,
  onTabChange,
  onLogout,
  onResetMetrics,
  isResetting = false,
  children,
}) => {
  const { isDark, toggleTheme } = useTheme();
  const [sheet, setSheet] = useState<'more' | 'alerts' | null>(null);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true');

  // Live fleet + incidents for the tab badge, the fleet line and the alerts sheet (always "today").
  const kiosksQ = useLiveQuery(() => insights.kiosks(defaultRange()), [], { intervalMs: 30000 });
  const incidentsQ = useLiveQuery(() => insights.incidents(defaultRange()), [], { intervalMs: 30000 });
  const fleet = kiosksQ.data ? { online: kiosksQ.data.summary.online, total: kiosksQ.data.summary.total } : null;
  const incidentCount = incidentsQ.data?.counts.open ?? 0;
  const alerts = incidentsQ.data?.incidents ?? [];
  const userEmail = emailFromToken();

  useEffect(() => {
    setSheet(null);
    document.getElementById('admin-scroll')?.scrollTo(0, 0);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(collapsed));
  }, [collapsed]);

  const inMore = MORE.some((m) => m.id === activeTab);
  const iconBtn =
    'relative flex size-10 items-center justify-center rounded-full text-slate-600 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 transition-colors';

  return (
    <div className={`min-h-[100dvh] bg-slate-100 dark:bg-slate-950 font-sans antialiased ${isDark ? 'dark text-slate-100' : 'text-slate-900'}`}>
      {/* ── DESKTOP (lg and up): fixed sidebar + topbar, unchanged phone shell hidden ── */}
      <div className="hidden h-screen w-screen overflow-hidden lg:flex">
        <Sidebar
          activeTab={activeTab}
          onTabChange={onTabChange}
          onLogout={onLogout}
          incidentCount={incidentCount}
          fleet={fleet}
          userEmail={userEmail}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header
            activeTab={activeTab}
            onTabChange={onTabChange}
            onLogout={onLogout}
            onResetMetrics={onResetMetrics}
            isResetting={isResetting}
            incidentCount={incidentCount}
            alerts={alerts}
            onOpenMobileNav={() => {}}
          />
          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-50 p-4 transition-colors duration-150 dark:bg-slate-950 sm:p-6 lg:p-8">
            <div className="mx-auto w-full max-w-7xl space-y-6">{children}</div>
          </main>
        </div>
      </div>

      {/* ── PHONE (below lg): the existing mobile shell, unchanged ── */}
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col bg-slate-50 dark:bg-slate-950 shadow-[0_0_0_1px_rgba(17,19,24,0.06)] lg:hidden">
        {/* App bar */}
        <header className="sticky top-0 z-30 bg-slate-50/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md dark:bg-slate-950/85">
          <div className="flex h-14 items-center justify-between">
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">
                MIMO Admin{fleet ? `, ${fleet.online} of ${fleet.total} kiosks online` : ''}
              </p>
              <h1 className="-mt-0.5 truncate text-[22px] font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                {TITLES[activeTab] ?? 'Admin'}
              </h1>
            </div>
            <div className="flex items-center">
              <button type="button" onClick={toggleTheme} className={iconBtn} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
                {isDark ? <Sun size={20} strokeWidth={1.75} /> : <Moon size={20} strokeWidth={1.75} />}
              </button>
              <button type="button" onClick={() => setSheet('alerts')} className={iconBtn} aria-label={`Alerts, ${incidentCount} open`}>
                <Bell size={20} strokeWidth={1.75} />
                {incidentCount > 0 && (
                  <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-semibold tabular-nums text-white">
                    {incidentCount > 9 ? '9+' : incidentCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main id="admin-scroll" className="flex-1 px-4 pb-28 pt-2">
          <div className="space-y-5">{children}</div>
        </main>

        {/* Bottom tabs */}
        <nav
          aria-label="Sections"
          className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[480px] border-t border-slate-200 bg-slate-50/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90"
        >
          <div className="grid h-[58px] grid-cols-5">
            {[...TABS, { id: '__more', label: 'More', icon: MoreHorizontal }].map((t) => {
              const Icon = t.icon;
              const active = t.id === '__more' ? inMore || sheet === 'more' : activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => (t.id === '__more' ? setSheet('more') : onTabChange(t.id))}
                  className={`relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                    active ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <Icon size={22} strokeWidth={active ? 2.1 : 1.75} />
                  {t.label}
                  {t.id === 'incidents' && incidentCount > 0 && (
                    <span className="absolute left-1/2 top-1.5 ml-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold tabular-nums text-white">
                      {incidentCount > 9 ? '9+' : incidentCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {sheet === 'more' && (
          <Sheet title="More" onClose={() => setSheet(null)}>
            <div className="overflow-hidden rounded-[20px] bg-slate-100 dark:bg-slate-800/60">
              {MORE.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onTabChange(m.id)}
                    className="flex min-h-[52px] w-full items-center gap-3 border-t border-slate-200 px-4 text-left first:border-t-0 active:bg-slate-200 dark:border-slate-700/60 dark:active:bg-slate-800"
                  >
                    <Icon size={20} strokeWidth={1.75} className="text-slate-500 dark:text-slate-400" />
                    <span className={`flex-1 text-[16px] ${activeTab === m.id ? 'font-semibold text-indigo-700 dark:text-indigo-300' : 'text-slate-900 dark:text-slate-100'}`}>{m.label}</span>
                    <ChevronRight size={16} className="text-slate-400" />
                  </button>
                );
              })}
            </div>

            <div className="mt-4 overflow-hidden rounded-[20px] bg-slate-100 dark:bg-slate-800/60">
              {onResetMetrics && (
                <button
                  type="button"
                  onClick={onResetMetrics}
                  disabled={isResetting}
                  className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left active:bg-slate-200 disabled:opacity-50 dark:active:bg-slate-800"
                >
                  <RefreshCcw size={20} strokeWidth={1.75} className={`text-slate-500 ${isResetting ? 'animate-spin' : ''}`} />
                  <span className="flex-1 text-[16px] text-slate-900 dark:text-slate-100">Reset metrics</span>
                </button>
              )}
              <button
                type="button"
                onClick={onLogout}
                className="flex min-h-[52px] w-full items-center gap-3 border-t border-slate-200 px-4 text-left first:border-t-0 active:bg-slate-200 dark:border-slate-700/60 dark:active:bg-slate-800"
              >
                <LogOut size={20} strokeWidth={1.75} className="text-rose-600 dark:text-rose-400" />
                <span className="flex-1 text-[16px] text-rose-600 dark:text-rose-400">Sign out</span>
              </button>
            </div>
            {userEmail && <p className="mt-3 px-1 text-[13px] text-slate-500">Signed in as {userEmail}</p>}
          </Sheet>
        )}

        {sheet === 'alerts' && (
          <Sheet title="Alerts" onClose={() => setSheet(null)}>
            {alerts.length === 0 ? (
              <p className="py-10 text-center text-[15px] text-slate-500">No open incidents.</p>
            ) : (
              <div className="overflow-hidden rounded-[20px] bg-slate-100 dark:bg-slate-800/60">
                {alerts.slice(0, 8).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => a.tab && onTabChange(a.tab)}
                    className="flex w-full items-start gap-3 border-t border-slate-200 px-4 py-3 text-left first:border-t-0 active:bg-slate-200 dark:border-slate-700/60 dark:active:bg-slate-800"
                  >
                    <AlertTriangle
                      size={18}
                      strokeWidth={1.75}
                      className={`mt-0.5 shrink-0 ${a.severity === 'high' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium text-slate-900 dark:text-slate-100">{a.title}</span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-slate-500 dark:text-slate-400">{a.detail}</span>
                    </span>
                    <span className="shrink-0 text-[12px] tabular-nums text-slate-500">{timeAgo(a.at) === '—' ? '' : timeAgo(a.at)}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => onTabChange('incidents')}
              className="mt-3 flex min-h-11 w-full items-center justify-center text-[15px] font-medium text-indigo-700 dark:text-indigo-300"
            >
              View all incidents
            </button>
          </Sheet>
        )}
      </div>
    </div>
  );
};
