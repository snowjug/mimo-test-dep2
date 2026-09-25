import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  trend?: { value: string; positive: boolean };
  icon?: React.ReactNode;
  iconColor?: string;
  accent?: boolean;
  /** If true, renders a pulsing "live" dot */
  live?: boolean;
  alert?: boolean;
  alertText?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtext,
  trend,
  icon,
  iconColor = 'bg-[var(--primary-light)] text-[var(--primary)]',
  accent = false,
  live = false,
  alert = false,
  alertText,
}) => {
  if (accent) {
    return (
      <div className="rounded-[var(--radius-lg)] p-5 bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] text-white flex flex-col justify-between min-h-[120px] shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/70">{title}</span>
          <div className="flex items-center gap-2">
            {live && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                LIVE
              </span>
            )}
            {trend && (
              <span className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                trend.positive ? 'bg-white/20 text-emerald-200' : 'bg-white/20 text-red-300'
              }`}>
                {trend.positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {trend.value}
              </span>
            )}
            {icon && (
              <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
                {icon}
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="text-2xl font-bold tracking-tight mt-3">{value}</div>
          {subtext && <p className="text-xs text-white/70 mt-0.5">{subtext}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-lg)] p-5 bg-[var(--surface)] border border-[var(--border)] flex flex-col justify-between min-h-[120px] hover:border-[var(--border-2)] transition-colors shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]">{title}</span>
        <div className="flex items-center gap-2">
          {alert && alertText && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              {alertText}
            </span>
          )}
          {trend && (
            <span className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              trend.positive
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
            }`}>
              {trend.positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {trend.value}
            </span>
          )}
          {icon && (
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconColor}`}>
              {icon}
            </div>
          )}
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold tracking-tight text-[var(--text-1)] mt-3">{value}</div>
        {subtext && <p className="text-xs text-[var(--text-3)] mt-0.5">{subtext}</p>}
      </div>
    </div>
  );
};
