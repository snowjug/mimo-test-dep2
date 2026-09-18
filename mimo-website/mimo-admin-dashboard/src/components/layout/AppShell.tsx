import React, { useState, useEffect } from 'react';
import {
  LayoutGrid,
  Printer,
  Cpu,
  AlertTriangle,
  BarChart2,
  IndianRupee,
  Settings,
  Search,
  RefreshCcw,
  Sun,
  Moon,
  Bell,
  LogOut,
  Menu,
  X,
  Loader2,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export interface AppShellProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onLogout: () => void;
  onResetMetrics?: () => void;
  isResetting?: boolean;
  incidentCount?: number;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeTab,
  onTabChange,
  onLogout,
  onResetMetrics,
  isResetting = false,
  incidentCount = 2,
  children,
}) => {
  const { isDark, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchVal, setSearchVal] = useState('');

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid, path: '/admin/overview' },
    { id: 'operations', label: 'Operations', icon: Printer, badge: 'Live', badgeType: 'live', path: '/admin/operations' },
    { id: 'kiosks', label: 'Kiosks', icon: Cpu, path: '/admin/kiosks' },
    { id: 'incidents', label: 'Incidents', icon: AlertTriangle, badge: incidentCount > 0 ? `${incidentCount}` : null, badgeType: 'count', path: '/admin/incidents' },
    { id: 'analytics', label: 'Analytics', icon: BarChart2, path: '/admin/analytics' },
    { id: 'finance', label: 'Finance', icon: IndianRupee, path: '/admin/finance' },
    { id: 'configuration', label: 'Configuration', icon: Settings, path: '/admin/configuration' },
  ];

  return (
    <div className={`flex h-screen w-screen overflow-hidden font-sans antialiased select-none ${
      isDark ? 'bg-[#0b1120] text-[#f8fafc]' : 'bg-[#faf8ff] text-[#1e1b4b]'
    }`}>
      {/* ── 1. DESKTOP PERMANENT FIXED SIDEBAR ─────────────────────────────────── */}
      <aside className={`hidden lg:flex w-[280px] xl:w-[300px] flex-shrink-0 flex-col h-full border-r z-30 transition-colors duration-200 ${
        isDark ? 'bg-[#0f172a] border-[#1e293b]' : 'bg-white border-[#ede9fe]'
      }`}>
        {/* Brand Header */}
        <div className="p-6 pb-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#7c3aed] flex items-center justify-center text-white font-black text-xl shadow-md shadow-purple-500/20 flex-shrink-0">
            M
          </div>
          <div>
            <div className="flex items-center gap-1.5 leading-none">
              <span className={`font-black text-lg tracking-tight ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>
                MIMO
              </span>
              <span className="text-xs font-black tracking-wider text-[#7c3aed] uppercase">
                ADMIN
              </span>
            </div>
            <div className={`text-[11px] font-semibold mt-1 ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
              Command Center v2.0
            </div>
          </div>
        </div>

        {/* Section Label */}
        <div className="px-6 pt-3 pb-1">
          <span className={`text-[11px] font-extrabold uppercase tracking-widest ${
            isDark ? 'text-slate-500' : 'text-gray-400'
          }`}>
            NAVIGATION
          </span>
        </div>

        {/* Navigation Items (7 items in exact order) */}
        <nav className="flex-1 px-4 py-2 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm transition-all duration-150 cursor-pointer ${
                  active
                    ? isDark
                      ? 'bg-purple-950/60 text-[#a78bfa] border border-purple-800/40 shadow-xs'
                      : 'bg-[#f3e8ff] text-[#7c3aed] border border-purple-100 shadow-xs'
                    : isDark
                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    : 'text-gray-500 hover:text-[#1e1b4b] hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon size={18} className={active ? (isDark ? 'text-[#a78bfa]' : 'text-[#7c3aed]') : (isDark ? 'text-slate-500' : 'text-gray-400')} />
                  <span>{item.label}</span>
                </div>
                {item.badge && item.badgeType === 'live' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-500/15 text-sky-400 border border-sky-500/30 tracking-wider uppercase">
                    {item.badge}
                  </span>
                )}
                {item.badge && item.badgeType === 'count' && (
                  <span className={`w-5 h-5 rounded-full text-[10px] font-extrabold flex items-center justify-center ${
                    isDark ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Admin User Profile Card at Bottom */}
        <div className={`p-4 border-t ${isDark ? 'border-[#1e293b]' : 'border-[#ede9fe]'}`}>
          <div className={`flex items-center justify-between p-2.5 rounded-xl border ${
            isDark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-gray-50/70 border-gray-100'
          }`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#7c3aed] text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-sm">
                AD
              </div>
              <div className="truncate">
                <div className={`font-bold text-xs truncate ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>
                  Admin User
                </div>
                <div className="text-[11px] text-gray-400 truncate">
                  admin@mimo.print
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── 2. MOBILE DRAWER NAVIGATION ────────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className={`relative w-72 max-w-[85vw] h-full flex flex-col z-10 p-5 shadow-2xl ${
            isDark ? 'bg-[#0f172a] text-white' : 'bg-white text-[#1e1b4b]'
          }`}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#7c3aed] flex items-center justify-center text-white font-black">
                  M
                </div>
                <div>
                  <div className="font-black text-base">MIMO ADMIN</div>
                  <div className="text-[10px] text-gray-400">Command Center v2.0</div>
                </div>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-2">NAVIGATION</div>
            <nav className="flex-1 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onTabChange(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-bold text-sm ${
                      active
                        ? isDark
                          ? 'bg-purple-950/60 text-[#a78bfa]'
                          : 'bg-[#f3e8ff] text-[#7c3aed]'
                        : isDark
                        ? 'text-slate-400 hover:bg-slate-800'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={17} className={active ? 'text-[#7c3aed]' : 'text-gray-400'} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="pt-4 border-t border-gray-100 dark:border-slate-800">
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl"
              >
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. MAIN RIGHT CONTENT REGION (Occupies exact remaining viewport width) ── */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header Bar */}
        <header className={`h-16 flex-shrink-0 border-b flex items-center justify-between px-4 sm:px-6 lg:px-8 z-20 transition-colors duration-200 ${
          isDark ? 'bg-[#0f172a] border-[#1e293b]' : 'bg-white border-[#ede9fe]'
        }`}>
          {/* Left: Hamburger + Pill Search */}
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className={`lg:hidden p-2 rounded-xl border ${
                isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Menu size={18} />
            </button>

            {/* Pill Search Field */}
            <div className="relative w-full max-w-md">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Quick search nodes, orders, jobs..."
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                className={`w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-full transition-all focus:outline-none ${
                  isDark
                    ? 'bg-slate-800/80 border border-slate-700 text-white placeholder-slate-400 focus:border-[#8b5cf6]'
                    : 'bg-gray-50/70 border border-[#ede9fe] text-[#1e1b4b] placeholder-gray-400 focus:border-[#7c3aed] focus:bg-white'
                }`}
              />
            </div>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Reset Button */}
            {onResetMetrics && (
              <button
                onClick={onResetMetrics}
                disabled={isResetting}
                className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                  isDark
                    ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {isResetting ? <Loader2 size={13} className="animate-spin" /> : <RefreshCcw size={13} />}
                Reset
              </button>
            )}

            {/* Global Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                isDark
                  ? 'border-slate-700 bg-slate-800 text-amber-400 hover:bg-slate-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Notification Bell */}
            <button className={`relative p-2 rounded-lg border cursor-pointer transition-colors ${
              isDark
                ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
            }`}>
              <Bell size={15} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#7c3aed]" />
            </button>

            {/* Admin Avatar Pill */}
            <div className="w-8 h-8 rounded-full bg-[#1e1b4b] text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-xs">
              AD
            </div>

            {/* Logout Button */}
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Scrollable Page Body (No horizontal scroll, proper max-width container) */}
        <main className={`flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 transition-colors duration-200 ${
          isDark ? 'bg-[#0b1120]' : 'bg-[#faf8ff]'
        }`}>
          <div className="w-full max-w-7xl mx-auto">
            {children}
          </div>
        </main>

        {/* ── 4. MOBILE BOTTOM NAVIGATION (Only visible on mobile screens) ──── */}
        <div className={`lg:hidden h-16 border-t flex items-center justify-around px-2 z-20 flex-shrink-0 transition-colors duration-200 ${
          isDark ? 'bg-[#0f172a] border-[#1e293b]' : 'bg-white border-[#ede9fe]'
        }`}>
          {[
            { id: 'overview', label: 'Overview', icon: LayoutGrid },
            { id: 'operations', label: 'Queue', icon: Printer },
            { id: 'kiosks', label: 'Kiosks', icon: Cpu },
            { id: 'incidents', label: 'Alerts', icon: AlertTriangle },
            { id: 'configuration', label: 'More', icon: Settings },
          ].map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-lg text-[10px] font-bold transition-colors ${
                  active
                    ? isDark ? 'text-[#a78bfa]' : 'text-[#7c3aed]'
                    : isDark ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
