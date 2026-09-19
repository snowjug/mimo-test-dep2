import React from 'react';
import { FulfillmentStats } from '../../types/dashboard.types';

interface FulfillmentDonutChartProps {
  stats: FulfillmentStats;
  size?: number;
}

export const FulfillmentDonutChart: React.FC<FulfillmentDonutChartProps> = ({
  stats,
  size = 210,
}) => {
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (stats.percentage / 100) * circumference;

  return (
    <div className="w-full h-full bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 sm:p-7 shadow-xl flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg sm:text-xl font-extrabold text-[#F5F7FA] tracking-tight">
          Paid Page Fulfillment
        </h2>
        <span className="text-xs font-black text-[#20D3A2] bg-[#20D3A2]/20 px-3 py-1 rounded-full border border-[#20D3A2]/30">
          98.8% SLA
        </span>
      </div>

      {/* SVG Donut Circle */}
      <div className="flex-1 flex items-center justify-center py-4 relative">
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
              stroke="url(#emeraldGlowGradient)"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="none"
              className="transition-all duration-1000 ease-out"
            />
            <defs>
              <linearGradient id="emeraldGlowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#20D3A2" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>
          </svg>

          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-4xl font-black text-[#F5F7FA] tracking-tight font-sans">
              {stats.percentage}%
            </span>
            <span className="text-xs sm:text-sm font-semibold text-[#8EA6BF] mt-1">
              {stats.fulfilledPages.toLocaleString()} / {stats.totalPages.toLocaleString()}
            </span>
            <span className="text-xs text-[#6F89A3] font-medium mt-0.5">pages fulfilled</span>
          </div>
        </div>
      </div>

      {/* Bottom Legend */}
      <div className="flex items-center justify-center gap-6 text-xs sm:text-sm font-semibold text-[#8EA6BF] pt-3 border-t border-[#1D3A59]">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#20D3A2]" />
          <span>Fulfilled</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#1D3A59]" />
          <span>Remaining</span>
        </div>
      </div>
    </div>
  );
};
