import React from 'react';
import type { MIMOIntelligenceInsight } from '../../types/dashboard';

export interface IntelligenceCardProps {
  insights: MIMOIntelligenceInsight[];
  lastUpdated?: string;
}

export const IntelligenceCard: React.FC<IntelligenceCardProps> = ({
  insights,
  lastUpdated = 'UPDATED 12s AGO',
}) => {
  return (
    <div className="mimo-card p-6 sm:p-7 relative overflow-hidden bg-gradient-to-r from-indigo-50/60 via-white to-purple-50/40 dark:from-[#101D30] dark:via-[#14243A] dark:to-[#101D30] border-indigo-100/80 dark:border-[#1E314B] flex flex-col justify-between h-full">
      {/* Standardized Card Header */}
      <div className="mimo-card-header !border-indigo-100/80 dark:!border-[#1E314B]">
        <div className="flex items-center gap-2.5">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight">
            MIMO Intelligence
          </h3>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-[#EDE9FE] text-[#7C3AED] dark:bg-[#7C3AED]/20 dark:text-[#DDD6FE] dark:border dark:border-[#7C3AED]/40">
            LIVE
          </span>
        </div>
        <span className="text-[10px] font-mono font-bold text-slate-400 dark:text-[#8495AA] uppercase tracking-wider shrink-0">
          {lastUpdated}
        </span>
      </div>

      <p className="text-xs text-slate-500 dark:text-[#8495AA] font-medium -mt-2 mb-3">
        Automated fleet anomaly detection and operational trends
      </p>

      {/* Card Body Grid - Full Height */}
      <div className="mimo-card-body flex-1">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs h-full">
          {insights.map((ins) => (
            <div
              key={ins.id}
              className="flex items-start gap-2.5 p-3.5 rounded-xl bg-white/90 dark:bg-[#0C1829] border border-indigo-100/80 dark:border-[#1E314B] shadow-xs h-full"
            >
              <span className="text-[#6366F1] dark:text-[#A5B4FC] font-black text-lg leading-none shrink-0">•</span>
              <p className="text-xs font-semibold text-slate-800 dark:text-[#F1F5F9] leading-snug">{ins.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
