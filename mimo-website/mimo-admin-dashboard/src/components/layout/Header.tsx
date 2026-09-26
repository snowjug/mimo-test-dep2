import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  RefreshCcw,
  Sun,
  Moon,
  Bell,
  LogOut,
  Menu,
  ChevronDown,
  Loader2,
  ShieldAlert,
  Settings,
  ArrowUpRight,
  Info,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import type { Incident } from '../../types/insights.types';
import { timeAgo } from '../../lib/format';

export interface HeaderProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onLogout: () => void;
  onResetMetrics?: () => void;
  isResetting?: boolean;
  incidentCount?: number;
  /** Live open incidents from /admin/incidents (drives the bell). */
  alerts?: Incident[];
  onOpenMobileNav: () => void;
}

interface NotificationItem {
  id: string;
  title: string;
  desc: string;
  time: string;
  type: 'warning' | 'info' | 'success';
  read: boolean;
  actionTab?: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  onLogout,
  onResetMetrics,
  isResetting = false,
  incidentCount = 0,
  alerts = [],
  onOpenMobileNav,
}) => {
  const { isDark, toggleTheme } = useTheme();
  const [searchVal, setSearchVal] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const notifications: NotificationItem[] = alerts.slice(0, 8).map((a) => ({
    id: a.id,
    title: a.title,
    desc: a.detail,
    time: timeAgo(a.at),
    type: a.severity === 'high' ? 'warning' : 'info',
    read: readIds.has(a.id),
    actionTab: a.tab,
  }));

  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    setReadIds(new Set(alerts.map(a => a.id)));
  };

  const currentTabInfo = {
    overview: { label: 'Executive Overview', desc: 'Network revenue & operational performance' },
    operations: { label: 'Print Operations', desc: 'Live print stream & queue dispatch' },
    kiosks: { label: 'Kiosk Network', desc: 'Autonomous edge machine health & status' },
    incidents: { label: 'Incident Management', desc: 'Hardware alerts & SLA failure tracking' },
    analytics: { label: 'Analytics & Reports', desc: 'Demand trends, utilization & performance' },
    finance: { label: 'MIMO Finance Center', desc: 'Revenue intelligence, refunds & tariffs' },
    configuration: { label: 'System Configuration', desc: 'Platform settings & hardware thresholds' },
  }[activeTab] || { label: 'Command Center', desc: 'MIMO Platform' };

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-4 sm:px-6 lg:px-8 flex items-center justify-between font-sans select-none shadow-xs">
      {/* ── LEFT: BREADCRUMBS & SECTION INFO ──────────────────────── */}
      <div className="flex items-center gap-3 min-w-0 flex-shrink">
        {/* Mobile menu trigger */}
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="lg:hidden p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex-shrink-0"
          aria-label="Open Navigation"
        >
          <Menu size={18} />
        </button>

        {/* Breadcrumb hierarchy */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs min-w-0">
          <span className="hidden sm:inline font-bold text-slate-400 dark:text-slate-500 shrink-0">MIMO</span>
          <span className="hidden sm:inline text-slate-300 dark:text-slate-700 shrink-0">/</span>
          <span className="font-black text-slate-900 dark:text-slate-100 truncate capitalize">
            {currentTabInfo.label}
          </span>
          <span className="hidden xl:inline-block text-slate-300 dark:text-slate-700 shrink-0">/</span>
          <span className="hidden xl:inline-block text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-xs">
            {currentTabInfo.desc}
          </span>
        </nav>
      </div>

      {/* ── CENTER: SEARCH FIELD EXPANDING INTO AVAILABLE SPACE ────── */}
      <div className="flex-1 max-w-xs sm:max-w-sm md:max-w-md mx-3 sm:mx-6">
        <div className="relative flex items-center w-full">
          <Search
            size={14}
            className={`absolute left-3 pointer-events-none transition-colors ${
              isSearchFocused ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'
            }`}
          />
          <input
            id="global-search-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search kiosks, prints, customers..."
            value={searchVal}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            onChange={e => setSearchVal(e.target.value)}
            className="w-full h-9 pl-9 pr-8 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
          />
          {searchVal && (
            <button
              type="button"
              onClick={() => setSearchVal('')}
              className="absolute right-2.5 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded cursor-pointer"
            >
              <span className="text-xs font-bold leading-none">&times;</span>
            </button>
          )}
        </div>
      </div>

      {/* ── RIGHT: UTILITY & ACTION CONTROLS ───────────────────────── */}
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">

        {/* Reset Telemetry */}
        {onResetMetrics && (
          <button
            type="button"
            onClick={onResetMetrics}
            disabled={isResetting}
            title="Reset Telemetry Metrics"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 h-9 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer shadow-xs disabled:opacity-50"
          >
            {isResetting ? (
              <Loader2 size={14} className="animate-spin text-indigo-600 dark:text-indigo-400" />
            ) : (
              <RefreshCcw size={14} className="text-slate-400" />
            )}
            <span>Reset</span>
          </button>
        )}

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer shadow-xs"
        >
          {isDark ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-indigo-600" />}
        </button>

        {/* Notifications Bell */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setShowNotifications(v => !v)}
            title="Notifications"
            className="relative w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer shadow-xs"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
            )}
          </button>

          {/* Notification Popover */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 z-50 animate-fadeIn">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-900 dark:text-slate-100">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {notifications.length === 0 && (
                  <p className="py-6 text-center text-xs font-semibold text-slate-400">All clear — no open incidents.</p>
                )}
                {notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (n.actionTab) {
                        onTabChange(n.actionTab);
                        setShowNotifications(false);
                      }
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      !n.read
                        ? 'bg-indigo-50/60 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5">
                        {n.type === 'warning' && <AlertTriangle size={13} className="text-amber-500 dark:text-amber-400 flex-shrink-0" />}
                        {n.type === 'info' && <Info size={13} className="text-blue-500 dark:text-blue-400 flex-shrink-0" />}
                        {n.type === 'success' && <CheckCircle2 size={13} className="text-emerald-500 dark:text-emerald-400 flex-shrink-0" />}
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{n.title}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap font-mono">{n.time === '—' ? '' : n.time}</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">{n.desc}</p>
                  </div>
                ))}
              </div>

              <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-800 text-center">
                <button
                  type="button"
                  onClick={() => {
                    onTabChange('incidents');
                    setShowNotifications(false);
                  }}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  View all alerts <ArrowUpRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Admin User Profile Pill */}
        <div className="relative pl-1.5 border-l border-slate-200 dark:border-slate-800" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setShowUserMenu(v => !v)}
            className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all cursor-pointer"
          >
            <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 text-white flex items-center justify-center text-xs font-bold shadow-xs">
              AD
            </div>
            <div className="hidden md:block text-left">
              <p className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight">Admin</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono leading-none">Superadmin</p>
            </div>
            <ChevronDown size={13} className="hidden sm:block text-slate-400" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-52 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-2 z-50 animate-fadeIn">
              <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 mb-1">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Admin User</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">admin@mimo.in</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onTabChange('configuration');
                  setShowUserMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <Settings size={14} />
                Settings
              </button>
              <button
                type="button"
                onClick={() => {
                  onTabChange('incidents');
                  setShowUserMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <ShieldAlert size={14} />
                Active Alerts
              </button>
              <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
              <button
                type="button"
                onClick={() => {
                  setShowUserMenu(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
              >
                <LogOut size={14} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
