import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  badgeText?: string;
  badgeVariant?: 'live' | 'today' | 'neutral' | 'success';
  trendText?: string;
  trendPositive?: boolean;
  trendNegative?: boolean;
  icon?: React.ReactNode;
  iconBg?: string;
  valueColor?: string;
  hasTopHighlight?: boolean;
  sparklineColor?: string;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  badgeText,
  badgeVariant = 'live',
  trendText,
  trendPositive = true,
  trendNegative = false,
  icon,
  iconBg = 'bg-[#EEF2FF] text-[#4F46E5] dark:bg-[#818CF8]/20 dark:text-[#818CF8]',
  valueColor = 'text-slate-900 dark:text-[#F1F5F9]',
  hasTopHighlight = false,
  sparklineColor,
  className = '',
}) => {
  return (
    <div
      className={`mimo-card mimo-card-kpi relative overflow-hidden group ${
        hasTopHighlight ? 'border-t-3 border-t-[#6366F1]' : ''
      } ${className}`}
    >
      {/* Top Section: Title & Optional Centered Icon / Badge */}
      <div className="w-full flex items-center justify-center gap-2 shrink-0 flex-wrap">
        {icon && (
          <div className={`w-5 h-5 rounded-md ${iconBg} flex items-center justify-center shrink-0 text-xs`}>
            {icon}
          </div>
        )}
        <span className="mimo-card-label truncate">
          {title}
        </span>
        {badgeText && (
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider shrink-0 ${
              badgeVariant === 'live' || badgeVariant === 'today'
                ? 'bg-[#F3E8FF] text-[#7C3AED] border border-[#DDD6FE] dark:bg-[#7C3AED]/20 dark:text-[#C084FC]'
                : 'bg-slate-100 text-slate-600 dark:bg-[#16242E] dark:text-[#CBD5E1] dark:border dark:border-[#233947]'
            }`}
          >
            {badgeText}
          </span>
        )}
      </div>

      {/* Main Numerical Metric Value: 28–30px, font-medium (500) */}
      <div className="my-auto py-0.5 w-full flex flex-col items-center justify-center">
        <div className={`mimo-card-metric ${valueColor} truncate w-full`}>
          {value}
        </div>

        {sparklineColor && (
          <div className="mt-0.5 flex justify-center">
            <svg className="w-10 h-4" viewBox="0 0 60 25" fill="none">
              <path
                d="M2 18 C 12 12, 22 22, 32 8 C 42 16, 52 4, 58 6"
                stroke={sparklineColor}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Bottom Section: Centered Trend or Subtitle */}
      <div className="mt-auto w-full flex items-center justify-center text-xs text-center shrink-0 min-h-[18px]">
        {trendText ? (
          <div
            className={`inline-flex items-center justify-center gap-1 font-medium text-xs ${
              trendNegative
                ? 'text-rose-600 dark:text-rose-400'
                : trendPositive
                ? 'text-[#6366F1] dark:text-[#A5B4FC]'
                : 'text-slate-500 dark:text-[#94A3B8]'
            }`}
          >
            {trendNegative ? (
              <ArrowDownRight size={12} className="shrink-0" />
            ) : (
              <ArrowUpRight size={12} className="shrink-0" />
            )}
            <span>{trendText}</span>
          </div>
        ) : subtitle ? (
          <span className="mimo-card-desc truncate max-w-full">
            {subtitle}
          </span>
        ) : null}
      </div>
    </div>
  );
};
