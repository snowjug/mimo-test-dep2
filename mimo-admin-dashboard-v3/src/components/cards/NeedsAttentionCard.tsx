import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { NeedsAttentionItem } from '../../types/dashboard';

export interface NeedsAttentionCardProps {
  items: NeedsAttentionItem[];
  lastUpdated?: string;
  onViewAll?: () => void;
  onItemClick?: (item: NeedsAttentionItem) => void;
}

export const NeedsAttentionCard: React.FC<NeedsAttentionCardProps> = ({
  items,
  lastUpdated = 'UPDATED 12s AGO',
  onViewAll,
  onItemClick,
}) => {
  const getDotColor = (severity: NeedsAttentionItem['severity']) => {
    switch (severity) {
      case 'critical':
        return 'bg-rose-500 ring-4 ring-rose-100 dark:ring-rose-950';
      case 'high':
        return 'bg-amber-500 ring-4 ring-amber-100 dark:ring-amber-950';
      case 'medium':
        return 'bg-yellow-500 ring-4 ring-yellow-100 dark:ring-yellow-950';
      case 'success':
        return 'bg-[#6366F1] ring-4 ring-indigo-100 dark:ring-indigo-950';
      default:
        return 'bg-slate-400';
    }
  };

  return (
    <div className="mimo-card p-6 sm:p-7 flex flex-col justify-between h-full">
      {/* Standardized Card Header */}
      <div className="mimo-card-header">
        <div className="flex items-center gap-2.5">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight">
            Needs Attention
          </h3>
          {items.length > 0 && (
            <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 text-xs font-black flex items-center justify-center">
              {items.length}
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono font-bold text-slate-400 dark:text-[#8495AA] uppercase tracking-wider shrink-0">
          {lastUpdated}
        </span>
      </div>

      {/* Card Body - Evenly distributed items */}
      <div className="mimo-card-body flex-1 flex flex-col justify-around gap-2.5">
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => onItemClick?.(item)}
            className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/70 dark:bg-[#14243A]/70 hover:bg-slate-100/90 dark:hover:bg-[#1A2E4B] border border-slate-100 dark:border-[#1E314B] transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${getDotColor(item.severity)}`} />
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-[#F1F5F9] truncate group-hover:text-[#6366F1] dark:group-hover:text-[#A5B4FC] transition-colors">
                  {item.title}
                </p>
                {item.subtitle && (
                  <p className="text-[11px] text-slate-500 dark:text-[#8495AA] truncate mt-0.5">{item.subtitle}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <span className="text-xs text-slate-400 dark:text-[#8495AA] font-medium">{item.timeAgo}</span>
              <ChevronRight size={15} className="text-slate-400 dark:text-[#8495AA] group-hover:text-[#6366F1] dark:group-hover:text-[#A5B4FC] group-hover:translate-x-0.5 transition-all" />
            </div>
          </div>
        ))}
      </div>

      {/* Standardized Card Footer */}
      {onViewAll && (
        <div className="mimo-card-footer text-right">
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs sm:text-sm font-bold text-[#6366F1] dark:text-[#A5B4FC] hover:underline cursor-pointer"
          >
            View all →
          </button>
        </div>
      )}
    </div>
  );
};
