import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { AttentionItem } from '../../types/dashboard.types';

interface AttentionCardProps {
  items: AttentionItem[];
  onViewAll?: () => void;
}

export const AttentionCard: React.FC<AttentionCardProps> = ({ items, onViewAll }) => {
  const getDotColor = (sev: AttentionItem['severity']) => {
    switch (sev) {
      case 'critical':
        return 'bg-rose-500 shadow-sm shadow-rose-500/50';
      case 'warning':
        return 'bg-amber-400 shadow-sm shadow-amber-400/50';
      case 'success':
        return 'bg-[#20D3A2] shadow-sm shadow-[#20D3A2]/50';
      default:
        return 'bg-blue-400';
    }
  };

  return (
    <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-[#1D3A59]">
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-bold text-[#F5F7FA]">Needs Attention</h3>
            <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 text-[11px] font-black flex items-center justify-center border border-rose-500/30">
              {items.length}
            </span>
          </div>
          {onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              className="text-xs font-bold text-[#20D3A2] hover:text-[#20D3A2]/80 flex items-center gap-1 cursor-pointer"
            >
              <span>View all</span>
              <ChevronRight size={14} />
            </button>
          )}
        </div>

        {/* Item List */}
        <div className="mt-3.5 space-y-2.5">
          {items.map((item) => (
            <div
              key={item.id}
              className="p-3 rounded-xl bg-[#07111F]/60 border border-[#1D3A59]/80 hover:border-[#1D3A59] transition-all flex items-center justify-between gap-3 cursor-pointer group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${getDotColor(item.severity)}`} />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#F5F7FA] truncate group-hover:text-[#20D3A2] transition-colors">
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="text-[11px] text-[#8EA6BF] truncate mt-0.5">{item.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] text-[#8EA6BF]">{item.timeAgo}</span>
                <ChevronRight size={13} className="text-[#6F89A3] group-hover:text-[#20D3A2] transition-colors" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
