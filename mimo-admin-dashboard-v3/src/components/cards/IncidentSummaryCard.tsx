import React from 'react';
import type { IncidentSummaryCount } from '../../types/dashboard';

export interface IncidentSummaryCardProps {
  incidents: IncidentSummaryCount;
  onNavigate?: () => void;
}

export const IncidentSummaryCard: React.FC<IncidentSummaryCardProps> = ({
  incidents,
  onNavigate,
}) => {
  return (
    <div className="mimo-card p-6 sm:p-7 flex flex-col justify-between h-full">
      {/* Standardized Card Header */}
      <div className="mimo-card-header">
        <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight">
          Incidents
        </h3>
        <span className="text-[10px] font-mono font-bold text-slate-400 dark:text-[#8495AA] uppercase tracking-wider shrink-0">
          LAST 24 HOURS
        </span>
      </div>

      {/* 3 Severity Tiles in Card Body - Full Height */}
      <div className="mimo-card-body flex-1 py-1">
        <div className="grid grid-cols-3 gap-2.5 h-full">
          {/* Critical */}
          <div
            onClick={onNavigate}
            className="p-3 rounded-xl bg-rose-600 dark:bg-rose-950/60 dark:border dark:border-rose-800/80 text-white dark:text-rose-300 flex flex-col items-center justify-center text-center shadow-xs cursor-pointer hover:bg-rose-700 dark:hover:bg-rose-900/80 transition-colors h-full"
          >
            <span className="text-2xl font-semibold leading-none">
              {incidents.critical}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wider mt-1.5 opacity-90">
              Critical
            </span>
          </div>

          {/* High */}
          <div
            onClick={onNavigate}
            className="p-3 rounded-xl bg-amber-500 dark:bg-amber-950/60 dark:border dark:border-amber-800/80 text-white dark:text-amber-300 flex flex-col items-center justify-center text-center shadow-xs cursor-pointer hover:bg-amber-600 dark:hover:bg-amber-900/80 transition-colors h-full"
          >
            <span className="text-2xl font-semibold leading-none">
              {incidents.high}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wider mt-1.5 opacity-90">
              High
            </span>
          </div>

          {/* Medium */}
          <div
            onClick={onNavigate}
            className="p-3 rounded-xl bg-yellow-500 dark:bg-yellow-950/60 dark:border dark:border-yellow-800/80 text-slate-900 dark:text-yellow-300 flex flex-col items-center justify-center text-center shadow-xs cursor-pointer hover:bg-yellow-600 dark:hover:bg-yellow-900/80 transition-colors h-full"
          >
            <span className="text-2xl font-semibold leading-none">
              {incidents.medium}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wider mt-1.5">
              Medium
            </span>
          </div>
        </div>
      </div>

      {onNavigate && (
        <div className="mimo-card-footer text-right">
          <button
            type="button"
            onClick={onNavigate}
            className="text-xs sm:text-sm font-bold text-[#6366F1] dark:text-[#A5B4FC] hover:underline cursor-pointer"
          >
            Manage incidents →
          </button>
        </div>
      )}
    </div>
  );
};
