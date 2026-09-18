import React from 'react';
import { AlertTriangle } from 'lucide-react';

export interface MetricCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  trendText?: string;
  trendPositive?: boolean;
  trendBadge?: { text: string; positive: boolean };
  isLive?: boolean;
  tagLabel?: string;
  hasAlert?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtext,
  trendText,
  trendPositive = true,
  trendBadge,
  isLive,
  tagLabel,
  hasAlert,
  icon,
  className = '',
}) => {
  const badge = trendBadge || (trendText ? { text: trendText, positive: trendPositive } : undefined);

  return (
    <div
      className={`bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl hover:border-[#20D3A2]/40 transition-all flex flex-col justify-between ${className}`}
    >
      {/* Top row: Title and status tag/icon */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-xs sm:text-sm font-extrabold text-[#8EA6BF] uppercase tracking-wider">
          {title}
        </span>
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-[#20D3A2]/20 text-[#20D3A2] border border-[#20D3A2]/30">
              <span className="w-2 h-2 rounded-full bg-[#20D3A2] animate-pulse" />
              LIVE
            </span>
          )}
          {badge && !isLive && (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black border ${
                badge.positive
                  ? 'bg-[#20D3A2]/20 text-[#20D3A2] border-[#20D3A2]/30'
                  : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
              }`}
            >
              {badge.text}
            </span>
          )}
          {tagLabel && (
            <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-[#132943] text-[#8EA6BF] border border-[#1D3A59]">
              {tagLabel}
            </span>
          )}
          {hasAlert && (
            <span className="text-amber-400 bg-amber-500/20 p-1.5 rounded-full border border-amber-500/30">
              <AlertTriangle size={15} />
            </span>
          )}
          {icon && (
            <div className="text-[#8EA6BF] p-2 rounded-xl bg-[#132943] border border-[#1D3A59] flex items-center justify-center">
              {icon}
            </div>
          )}
        </div>
      </div>

      {/* Main Primary Value */}
      <div className="my-1.5">
        <span className="text-3xl sm:text-4xl font-black text-[#F5F7FA] tracking-tight font-sans">
          {value}
        </span>
      </div>

      {/* Subtext */}
      {subtext && (
        <p className="text-xs sm:text-sm font-medium text-[#8EA6BF] truncate mt-1">
          {subtext}
        </p>
      )}
    </div>
  );
};
