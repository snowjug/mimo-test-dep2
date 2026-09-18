import React from 'react';
import type { FulfillmentStats } from '../../types/dashboard.types';

interface FulfillmentDonutProps {
  stats: FulfillmentStats;
  size?: number;
}

export const FulfillmentDonut: React.FC<FulfillmentDonutProps> = ({
  stats,
  size = 180,
}) => {
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (stats.percentage / 100) * circumference;

  return (
    <div className="w-full h-full bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base sm:text-lg font-bold text-[#F5F7FA]">
          Paid Page Fulfillment
        </h3>
        <span className="text-[11px] font-bold text-[#20D3A2] bg-[#20D3A2]/20 px-2.5 py-0.5 rounded-full border border-[#20D3A2]/30">
          {stats.slaTarget}% SLA
        </span>
      </div>

      {/* SVG Donut Circle */}
      <div className="flex-1 flex items-center justify-center py-2 relative">
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="transform -rotate-90">
            {/* Background track */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#1D3A59"
              strokeWidth={strokeWidth}
              fill="none"
            />
            {/* Progress arc */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="url(#emeraldFulfillmentGradient)"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="none"
              className="transition-all duration-1000 ease-out"
            />
            <defs>
              <linearGradient id="emeraldFulfillmentGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#20D3A2" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>
          </svg>

          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none">
            <span className="text-3xl font-black text-[#F5F7FA] tracking-tight">
              {stats.percentage}%
            </span>
            <span className="text-[11px] font-semibold text-[#8EA6BF] mt-0.5">
              {stats.fulfilledPages.toLocaleString()} / {stats.totalPages.toLocaleString()}
            </span>
            <span className="text-[10px] text-[#6F89A3]">pages</span>
          </div>
        </div>
      </div>

      {/* Bottom Legend */}
      <div className="flex items-center justify-center gap-6 text-xs font-semibold text-[#8EA6BF] pt-2 border-t border-[#1D3A59]">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#20D3A2]" />
          <span>Fulfilled</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#1D3A59]" />
          <span>Remaining</span>
        </div>
      </div>
    </div>
  );
};
