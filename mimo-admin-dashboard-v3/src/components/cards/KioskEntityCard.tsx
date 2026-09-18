import React from 'react';
import { Printer } from 'lucide-react';
import type { KioskEntitySummary } from '../../types/dashboard';

export interface KioskEntityCardProps {
  kiosks: KioskEntitySummary[];
  onViewAll?: () => void;
  onKioskSelect?: (kiosk: KioskEntitySummary) => void;
}

export const KioskEntityCard: React.FC<KioskEntityCardProps> = ({
  kiosks,
  onViewAll,
  onKioskSelect,
}) => {
  return (
    <div className="mimo-card p-6 sm:p-7 flex flex-col justify-between h-full">
      {/* Standardized Card Header */}
      <div className="mimo-card-header">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight">
              Kiosk Network
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-[#EDE9FE] text-[#7C3AED] dark:bg-[#7C3AED]/20 dark:text-[#DDD6FE] dark:border dark:border-[#7C3AED]/40">
              LIVE
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-[#8495AA] mt-0.5">Fleet-health kiosk entities</p>
        </div>

        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs sm:text-sm font-bold text-[#6366F1] dark:text-[#A5B4FC] hover:underline cursor-pointer"
          >
            View all →
          </button>
        )}
      </div>

      {/* Multi-card grid in body */}
      <div className="mimo-card-body flex-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 h-full">
          {kiosks.map((k) => (
            <div
              key={k.id}
              onClick={() => onKioskSelect?.(k)}
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#14243A] hover:bg-indigo-50/40 dark:hover:bg-[#1A2E4B] border border-slate-200/80 dark:border-[#1E314B] hover:border-indigo-200 dark:hover:border-indigo-500/50 transition-all cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white dark:bg-[#0C1829] border border-slate-200 dark:border-[#1E314B] flex items-center justify-center text-slate-700 dark:text-[#C3CFDD] shadow-xs">
                    <Printer size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-[#F1F5F9] leading-tight">{k.name}</h4>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#6366F1] dark:text-[#A5B4FC] mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#6366F1] animate-pulse" />
                      <span>{k.status}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-1 pt-2.5 border-t border-slate-200/60 dark:border-[#1E314B] text-xs">
                <div className="flex items-center justify-between text-slate-600 dark:text-[#C3CFDD]">
                  <span className="text-xs">Output</span>
                  <span className="font-bold text-slate-900 dark:text-[#F1F5F9]">{k.pagesToday} pages</span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-[#C3CFDD]">
                  <span className="text-xs">Revenue</span>
                  <span className="font-bold text-slate-900 dark:text-[#F1F5F9]">₹{k.revenueToday.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-slate-500 dark:text-[#8495AA] text-[11px]">
                  <span>Success Rate</span>
                  <span className="font-semibold text-slate-700 dark:text-[#C3CFDD]">{k.successRate}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
