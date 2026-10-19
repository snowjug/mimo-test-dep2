import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

export interface FinanceMetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  comparisonText?: string;
  icon: React.ReactNode;
  iconBgColor?: string;
  iconColor?: string;
  sparklineData?: number[];
  sparklineColor?: string;
  loading?: boolean;
}

export const FinanceMetricCard: React.FC<FinanceMetricCardProps> = ({
  title,
  value,
  change,
  trend = 'neutral',
  comparisonText = 'vs. prev. period',
  icon,
  iconBgColor = 'bg-purple-50',
  iconColor = 'text-[#093765]',
  sparklineData,
  sparklineColor = '#093765',
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-[#E4E7EB] dark:border-slate-800 rounded-2xl p-5 shadow-xs animate-pulse flex flex-col justify-between h-36 min-w-0">
        <div className="flex items-center justify-between">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800" />
          <div className="w-12 h-4 rounded bg-slate-100 dark:bg-slate-800" />
        </div>
        <div>
          <div className="w-20 h-3 bg-slate-100 dark:bg-slate-800 rounded mb-2" />
          <div className="w-28 h-6 bg-slate-100 dark:bg-slate-800 rounded" />
        </div>
      </div>
    );
  }

  // Mini sparkline renderer
  const renderSparkline = () => {
    if (!sparklineData || sparklineData.length < 2) return null;
    const min = Math.min(...sparklineData);
    const max = Math.max(...sparklineData);
    const range = max - min || 1;
    const width = 56;
    const height = 20;

    const points = sparklineData
      .map((val, idx) => {
        const x = (idx / (sparklineData.length - 1)) * width;
        const y = height - ((val - min) / range) * (height - 4) - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

    return (
      <svg className="w-14 h-5 overflow-visible shrink-0" viewBox={`0 0 ${width} ${height}`}>
        <polyline
          fill="none"
          stroke={sparklineColor}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    );
  };

  const isPositive = trend === 'up';
  const isNegative = trend === 'down';

  // Compute theme-adaptive colored glass badge for icons
  const getThemedIconStyles = () => {
    const rawBg = iconBgColor || '';
    const rawColor = iconColor || '';

    if (rawBg.includes('dark:')) {
      return `${rawBg} ${rawColor}`;
    }

    if (rawBg.includes('emerald') || rawColor.includes('emerald')) {
      return 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/25';
    }
    if (rawBg.includes('amber') || rawColor.includes('amber')) {
      return 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-500/25';
    }
    if (rawBg.includes('rose') || rawColor.includes('rose') || rawBg.includes('red')) {
      return 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-500/25';
    }
    if (rawBg.includes('sky') || rawColor.includes('sky')) {
      return 'bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-100 dark:border-sky-500/25';
    }
    if (rawBg.includes('cyan') || rawColor.includes('cyan')) {
      return 'bg-cyan-50 dark:bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-100 dark:border-cyan-500/25';
    }
    if (rawBg.includes('purple') || rawColor.includes('purple')) {
      return 'bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-500/25';
    }
    if (rawBg.includes('indigo') || rawColor.includes('indigo')) {
      return 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/25';
    }
    return 'bg-indigo-50/80 dark:bg-indigo-500/15 text-[#093765] dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/25';
  };

  return (
    <div className="bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-slate-700 transition-all duration-200 rounded-2xl p-4 md:p-4.5 shadow-xs hover:shadow-md flex flex-col justify-between min-w-0">
      <div className="flex items-center justify-between mb-2.5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-2xs shrink-0 ${getThemedIconStyles()}`}>
          {icon}
        </div>
        {renderSparkline()}
      </div>

      <div className="min-w-0">
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tracking-tight block truncate mb-0.5">
          {title}
        </span>
        <div className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight font-mono truncate">
          {value}
        </div>
      </div>

      {(change || comparisonText) && (
        <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-1.5 text-[11px] min-w-0">
          {change && (
            <span
              className={`inline-flex items-center font-bold px-1.5 py-0.5 rounded-md shrink-0 text-[10px] ${
                isPositive
                  ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60'
                  : isNegative
                  ? 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60'
                  : 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800'
              }`}
            >
              {isPositive ? (
                <ArrowUpRight className="w-3 h-3 mr-0.5 stroke-[2.5]" />
              ) : isNegative ? (
                <ArrowDownRight className="w-3 h-3 mr-0.5 stroke-[2.5]" />
              ) : (
                <Minus className="w-3 h-3 mr-0.5" />
              )}
              {change}
            </span>
          )}
          {comparisonText && (
            <span className="text-slate-400 dark:text-slate-400 text-[10.5px] truncate leading-tight">
              {comparisonText}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
