import React from 'react';
import {
  LayoutDashboard,
  Printer,
  Cpu,
  AlertTriangle,
  Users,
  BarChart2,
  IndianRupee,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Activity,
} from 'lucide-react';

export interface NavItemDef {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: string;
  badgeType?: 'live' | 'alert' | 'count' | 'info';
}

export interface SidebarProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onLogout: () => void;
  incidentCount?: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobile?: boolean;
  /** Live kiosk fleet summary from /admin/kiosks (null while loading). */
  fleet?: { online: number; total: number } | null;
  userEmail?: string;
}

const NAV_CORE: NavItemDef[] = [
  { id: 'overview',   label: 'Executive Overview',   icon: LayoutDashboard },
  { id: 'operations', label: 'Print Operations',     icon: Printer, badge: 'LIVE', badgeType: 'live' },
  { id: 'kiosks',     label: 'Kiosk Network',        icon: Cpu },
  { id: 'incidents',  label: 'Incident Management',  icon: AlertTriangle, badgeType: 'alert' },
];

const NAV_ANALYTICS: NavItemDef[] = [
  { id: 'analytics',  label: 'Analytics & Reports',  icon: BarChart2 },
  { id: 'users',      label: 'Customers',            icon: Users },
];

const NAV_FINANCE: NavItemDef[] = [
  { id: 'finance',    label: 'Finance Center',       icon: IndianRupee },
];

const NAV_SETTINGS: NavItemDef[] = [
  { id: 'configuration', label: 'System Configuration', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  onLogout,
  incidentCount = 0,
  collapsed = false,
  onToggleCollapse,
  isMobile = false,
  fleet = null,
  userEmail,
}) => {
  const isCollapsedView = collapsed && !isMobile;

  const NavItem = ({ item }: { item: NavItemDef }) => {
    const Icon = item.icon;
    const active = activeTab === item.id;
    const isIncidents = item.id === 'incidents';
    const alertCount = isIncidents && incidentCount > 0 ? incidentCount : null;
    const fleetBadge = item.id === 'kiosks' && fleet ? `${fleet.online}/${fleet.total} online` : null;

    return (
      <button
        type="button"
        onClick={() => onTabChange(item.id)}
        title={isCollapsedView ? item.label : undefined}
        className={`w-full flex items-center ${
          isCollapsedView ? 'justify-center px-0 h-10' : 'justify-between px-3 h-10'
        } rounded-xl transition-all duration-150 cursor-pointer group select-none text-left ${
          active
            ? 'bg-indigo-600 text-white font-semibold shadow-sm shadow-indigo-600/30'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70 font-medium'
        }`}
      >
        <div className={`flex items-center gap-3 min-w-0 ${isCollapsedView ? 'justify-center' : ''}`}>
          <Icon
            size={18}
            className={`flex-shrink-0 transition-colors ${
              active
                ? 'text-white'
                : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white'
            }`}
          />
          {!isCollapsedView && (
            <span className="text-sm font-semibold truncate leading-none">
              {item.label}
            </span>
          )}
        </div>

        {!isCollapsedView && (
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
            {/* Live Indicator Badge */}
            {item.badgeType === 'live' && (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                active
                  ? 'bg-white/20 text-white'
                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : 'bg-emerald-500'} animate-pulse`} />
                {item.badge}
              </span>
            )}

            {/* Info Badge (live fleet status for Kiosk Network) */}
            {(fleetBadge || (item.badgeType === 'info' && item.badge)) && (
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                active
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}>
                {fleetBadge || item.badge}
              </span>
            )}

            {/* Alert Badge */}
            {alertCount ? (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black flex items-center justify-center min-w-[18px] ${
                active
                  ? 'bg-white text-rose-600'
                  : 'bg-rose-500 text-white shadow-xs'
              }`}>
                {alertCount}
              </span>
            ) : null}
          </div>
        )}
      </button>
    );
  };

  const Section = ({ label, items }: { label: string; items: NavItemDef[] }) => (
    <div className="mb-4">
      {!isCollapsedView && (
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 px-3 mb-1.5">
          {label}
        </p>
      )}
      <div className="space-y-1">
        {items.map(item => (
          <NavItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  );

  return (
    <aside
      className={`${
        isMobile ? 'flex flex-col h-full w-full' : 'hidden lg:flex flex-col h-full'
      } border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all duration-200 select-none flex-shrink-0 z-20 ${
        isCollapsedView
          ? 'w-[76px] min-w-[76px] max-w-[76px]'
          : !isMobile
          ? 'w-[260px] min-w-[260px] max-w-[260px]'
          : ''
      }`}
    >
      {/* ── SECTION 1: BRAND HEADER ───────────────────────────────── */}
      <div
        className={`flex items-center ${
          isCollapsedView ? 'justify-center px-2' : 'justify-between px-4'
        } h-16 border-b border-slate-200 dark:border-slate-800 flex-shrink-0 bg-white dark:bg-slate-900`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white font-black text-sm shadow-md shadow-indigo-500/25 flex-shrink-0">
            M
          </div>
          {!isCollapsedView && (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-black text-base tracking-tight text-slate-900 dark:text-white">
                  MIMO
                </span>
                <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 px-1.5 py-0.5 rounded uppercase tracking-wider">
                  ADMIN
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Collapse/Expand Toggle (Desktop Only) */}
        {!isMobile && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex-shrink-0"
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        )}
      </div>

      {/* ── SECTION 2: NAVIGATION GROUPS ──────────────────────────── */}
      <nav className={`flex-1 overflow-y-auto overflow-x-hidden py-4 ${isCollapsedView ? 'px-2' : 'px-3'}`}>
        <Section label="Core" items={NAV_CORE} />
        <Section label="Analytics" items={NAV_ANALYTICS} />
        <Section label="Finance" items={NAV_FINANCE} />
        <Section label="Settings" items={NAV_SETTINGS} />
      </nav>

      {/* ── SECTION 3: FLEET STATUS (live from /admin/kiosks) ───────── */}
      {!isCollapsedView && (
        <div className="p-3 mx-3 mb-3 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 flex-shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Activity size={13} className={fleet && fleet.online < fleet.total ? 'text-amber-500' : 'text-emerald-500'} />
              Fleet Status
            </span>
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
              !fleet
                ? 'text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                : fleet.online === fleet.total
                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/20'
                : 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200/60 dark:border-amber-500/20'
            }`}>
              {fleet ? `${fleet.online}/${fleet.total} ONLINE` : '…'}
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 mb-1.5 overflow-hidden">
            <div
              className={`${fleet && fleet.online < fleet.total ? 'bg-amber-500' : 'bg-emerald-500'} h-full rounded-full transition-all`}
              style={{ width: fleet && fleet.total ? `${(fleet.online / fleet.total) * 100}%` : '0%' }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono">
            <span>{fleet ? `${fleet.online} online` : 'checking…'}</span>
            <span>{fleet ? `${fleet.total - fleet.online} offline` : ''}</span>
          </div>
        </div>
      )}

      {/* ── SECTION 4: USER PROFILE FOOTER ────────────────────────── */}
      <div className={`border-t border-slate-200 dark:border-slate-800 ${isCollapsedView ? 'p-2' : 'p-3'} flex-shrink-0 bg-slate-50/50 dark:bg-slate-950/50`}>
        <div className={`flex items-center gap-2.5 ${isCollapsedView ? 'justify-center' : 'justify-between'}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shadow-xs">
                AD
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
            </div>

            {!isCollapsedView && (
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">Administrator</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate" title={userEmail}>{userEmail || 'Signed in'}</p>
              </div>
            )}
          </div>

          {!isCollapsedView && (
            <button
              type="button"
              onClick={onLogout}
              title="Sign Out"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors flex-shrink-0 cursor-pointer"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
