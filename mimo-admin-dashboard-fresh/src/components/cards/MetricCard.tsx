import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trendText?: string;
  trendPositive?: boolean;
  topBadge?: React.ReactNode;
  icon?: React.ReactNode;
  iconBg?: string;
  valueColor?: string;
  hasTopHighlight?: boolean;
  highlightColor?: 'emerald' | 'purple' | 'amber' | 'rose' | 'none';
  accentBarColor?: 'emerald' | 'purple' | 'amber' | 'rose' | 'none' | string;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  trendText,
  trendPositive = true,
  topBadge,
  icon,
  iconBg = 'bg-[#132943]',
  valueColor = 'text-[#F5F7FA]',
  hasTopHighlight = false,
  highlightColor = 'none',
  className = '',
}) => {
  return (
    <div
      className={`relative bg-[#10223A] rounded-2xl border border-[#1D3A59] p-4 sm:p-5 shadow-xl hover:border-[#20D3A2]/40 transition-all flex flex-col justify-between overflow-hidden group ${
        hasTopHighlight || highlightColor === 'emerald' ? 'border-t-2 border-t-[#20D3A2]' : ''
      } ${highlightColor === 'amber' ? 'border-t-2 border-t-[#F59E0B]' : ''} ${className}`}
    >
      {/* Top row: Left Icon / Right Badge */}
      <div className="flex items-center justify-between gap-2 mb-3">
        {icon ? (
          <div
            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg ${iconBg} border border-[#1D3A59] flex items-center justify-center shrink-0 shadow-sm`}
          >
            {icon}
          </div>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-1.5 shrink-0">
          {topBadge}
          {trendText && !topBadge && (
            <span
              className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black border ${
                trendPositive
                  ? 'bg-emerald-500/15 text-[#20D3A2] border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
              }`}
            >
              {trendPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              <span>{trendText}</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Value */}
      <div className="my-1">
        <div className={`text-2xl sm:text-3xl lg:text-[28px] xl:text-3xl font-black ${valueColor} tracking-tight truncate`}>
          {value}
        </div>
      </div>

      {/* Bottom Labels: Title & Subtitle */}
      <div className="mt-2 pt-0.5">
        <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#8EA6BF] truncate">
          {title}
        </p>
        {subtitle && (
          <p className="text-[11px] sm:text-xs text-[#6F89A3] font-medium truncate mt-0.5">
            {subtitle}
          </p>
        )}
      </div>

      {/* Bottom highlight bar if specified */}
      {highlightColor === 'purple' && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-linear-to-r from-purple-500 to-indigo-500" />
      )}
    </div>
  );
};
