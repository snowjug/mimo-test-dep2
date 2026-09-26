import React from 'react';
import { useLiveQuery } from '../../../hooks/useLiveQuery';
import { insights } from '../../../services/insights.service';
import { defaultRange } from '../../../lib/dateRange';
import {
  LayoutDashboard,
  ArrowLeftRight,
  BarChart3,
  RotateCcw,
  Tag,
  WalletCards,
  FileSpreadsheet,
  Layers,
  LogOut,
  ChevronRight,
  ArrowUpRight,
} from 'lucide-react';

export type FinanceTab =
  | 'overview'
  | 'transactions'
  | 'analytics'
  | 'refunds'
  | 'pricing'
  | 'wallet'
  | 'settlements';

export interface FinanceSidebarProps {
  activeTab: FinanceTab;
  onTabChange: (tab: FinanceTab) => void;
  onLogout: () => void;
  pendingRefundsCount?: number;
}

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'analytics', label: 'Revenue Analytics', icon: BarChart3 },
  { id: 'refunds', label: 'Refunds & Disputes', icon: RotateCcw, badgeKey: 'refunds' },
  { id: 'pricing', label: 'Pricing & Coupons', icon: Tag },
  { id: 'wallet', label: 'Wallet & Credits', icon: WalletCards },
  { id: 'settlements', label: 'Settlements & Reports', icon: FileSpreadsheet },
];

export const FinanceSidebar: React.FC<FinanceSidebarProps> = ({
  activeTab,
  onTabChange,
  onLogout,
  pendingRefundsCount = 0,
}) => {
  return (
    <aside className="finance-sidebar">
      {/* ── TOP: BRAND LOGO & TITLE (HEIGHT 64PX) ────────────────────────── */}
      <div className="h-[64px] min-h-[64px] px-5 flex items-center gap-3 border-b border-[#EDE9FE] bg-white">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#6D35E8] to-[#9065FD] flex items-center justify-center text-white shadow-md shadow-purple-500/20 shrink-0">
          <Layers className="w-5 h-5" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[15px] font-black text-[#19162D] tracking-tight leading-tight truncate">
            MIMO Finance
          </span>
          <span className="text-[11px] font-semibold text-slate-400 truncate">
            Financial Management
          </span>
        </div>
      </div>

      {/* ── MIDDLE: NAVIGATION ITEMS (14PX FONT, AMPLE PADDING) ─────────── */}
      <nav className="p-3 space-y-1.5 overflow-y-auto flex-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id as FinanceTab)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-[14px] font-bold transition-all duration-150 cursor-pointer text-left ${
                isActive
                  ? 'bg-[#EDE8FF] text-[#6D35E8] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <Icon
                  className={`w-5 h-5 shrink-0 transition-colors ${
                    isActive ? 'text-[#6D35E8]' : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                />
                <span className="truncate whitespace-nowrap">{item.label}</span>
              </div>

              {item.badgeKey === 'refunds' && pendingRefundsCount > 0 && (
                <span className="px-2 py-0.5 text-[11px] font-black rounded-full bg-rose-500 text-white shrink-0 shadow-xs ml-2">
                  {pendingRefundsCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── BOTTOM: STATUS & PROFILE SECTION ────────────────────────────── */}
      <div className="p-3 space-y-2 border-t border-[#EDE9FE] bg-[#FAF9FD] shrink-0">
        {/* Switch to Admin Ops */}
        <a
          href="/admin/"
          className="flex items-center justify-between px-3 py-2 rounded-xl text-[12px] font-bold text-slate-500 hover:text-[#6D35E8] hover:bg-[#EDE8FF] transition-colors"
        >
          <span className="flex items-center gap-2">
            <ArrowUpRight className="w-4 h-4 text-slate-400" />
            Switch to Admin Ops
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        </a>

        {/* Live machine status (from the kiosks' heartbeats) */}
        <FleetPill />

        {/* Profile Card */}
        <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-[#EDE9FE] shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#6D35E8] flex items-center justify-center text-white font-black text-xs shrink-0 shadow-xs">
              AD
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-extrabold text-slate-900 truncate leading-tight">
                Admin
              </span>
              <span className="text-[10px] text-slate-400 font-medium truncate leading-tight">
                Finance Manager
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            title="Logout"
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};

/** "2/2 machines online" from /admin/kiosks (replaces the old fixed "All Systems Operational"). */
const FleetPill: React.FC = () => {
  const q = useLiveQuery(() => insights.kiosks(defaultRange()), [], { intervalMs: 30000 });
  const sum = q.data?.summary;
  const ok = !!sum && sum.offline === 0;
  const dot = !sum ? 'bg-slate-300' : ok ? 'bg-emerald-500' : 'bg-amber-500';
  return (
    <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-[#EDE9FE] shadow-2xs">
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {ok && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dot}`} />
        </span>
        <div className="flex flex-col">
          <span className="text-[12px] font-bold text-slate-800 leading-none">Machines</span>
          <span className="text-[11px] text-slate-400 font-medium mt-0.5 leading-none">
            {q.error ? 'Status unavailable' : sum ? `${sum.online} of ${sum.total} online` : 'Checking…'}
          </span>
        </div>
      </div>
    </div>
  );
};
