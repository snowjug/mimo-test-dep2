import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import {
  LayoutDashboard,
  Printer,
  Cpu,
  Users,
  AlertTriangle,
  X,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export interface AdminLayoutProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onLogout: () => void;
  onResetMetrics?: () => void;
  isResetting?: boolean;
  incidentCount?: number;
  children: React.ReactNode;
}

const MOBILE_BOTTOM_NAV = [
  { id: 'overview',   label: 'Overview',   icon: LayoutDashboard },
  { id: 'operations', label: 'Operations', icon: Printer },
  { id: 'kiosks',     label: 'Kiosks',     icon: Cpu },
  { id: 'users',      label: 'Customers',  icon: Users },
  { id: 'incidents',  label: 'Incidents',  icon: AlertTriangle },
];

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  activeTab,
  onTabChange,
  onLogout,
  onResetMetrics,
  isResetting = false,
  incidentCount = 2,
  children,
}) => {
  const { isDark } = useTheme();
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [activeTab]);

  return (
    <div
      className={`flex h-screen w-screen overflow-hidden font-sans antialiased select-none transition-colors duration-150 ${
        isDark ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* ── 1. FIXED/STICKY LEFT SIDEBAR (DESKTOP) ────────────────── */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={onTabChange}
        onLogout={onLogout}
        incidentCount={incidentCount}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(v => !v)}
      />

      {/* ── 2. MOBILE SLIDEOUT DRAWER ─────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity animate-fadeIn"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] h-full flex flex-col shadow-2xl animate-slideIn z-10">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 z-30 p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X size={18} />
            </button>
            <Sidebar
              activeTab={activeTab}
              onTabChange={(tab) => {
                onTabChange(tab);
                setMobileOpen(false);
              }}
              onLogout={onLogout}
              incidentCount={incidentCount}
              isMobile={true}
            />
          </div>
        </div>
      )}

      {/* ── 3. MAIN COLUMN (TOPBAR + SCROLLABLE CONTENT) ──────────── */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-150">
        {/* Sticky Topbar */}
        <Header
          activeTab={activeTab}
          onTabChange={onTabChange}
          onLogout={onLogout}
          onResetMetrics={onResetMetrics}
          isResetting={isResetting}
          incidentCount={incidentCount}
          onOpenMobileNav={() => setMobileOpen(true)}
        />

        {/* Scrollable Viewport */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 bg-slate-50 dark:bg-slate-950 transition-colors duration-150">
          <div className="w-full max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>

        {/* Mobile Bottom Quick Navigation */}
        <nav className="lg:hidden flex-shrink-0 flex items-center justify-around border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 h-14 z-20 shadow-lg">
          {MOBILE_BOTTOM_NAV.map(item => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                  active
                    ? 'text-indigo-600 dark:text-indigo-400 scale-105'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
