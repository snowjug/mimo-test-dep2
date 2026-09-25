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
  iconColor = 'text-[#6D35E8]',
  sparklineData,
  sparklineColor = '#6D35E8',
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="bg-white border border-[#EDE9FE] rounded-2xl p-5 shadow-xs animate-pulse flex flex-col justify-between h-36 min-w-0">
        <div className="flex items-center justify-between">
          <div className="w-10 h-10 rounded-xl bg-slate-100" />
          <div className="w-12 h-4 rounded bg-slate-100" />
        </div>
        <div>
          <div className="w-20 h-3 bg-slate-100 rounded mb-2" />
          <div className="w-28 h-6 bg-slate-100 rounded" />
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

  return (
    <div className="bg-white border border-[#EDE9FE] hover:border-purple-300 transition-all duration-200 rounded-2xl p-4 md:p-5 shadow-xs hover:shadow-md flex flex-col justify-between min-w-0">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${iconBgColor} flex items-center justify-center ${iconColor} shadow-2xs shrink-0`}>
          {icon}
        </div>
        {renderSparkline()}
      </div>

      <div className="min-w-0">
        <span className="text-[12px] font-semibold text-slate-500 tracking-tight block truncate mb-1">
          {title}
        </span>
        <div className="text-xl md:text-2xl font-black text-[#19162D] tracking-tight font-mono truncate">
          {value}
        </div>
      </div>

      {(change || comparisonText) && (
        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-[11px] min-w-0">
          {change && (
            <span
              className={`inline-flex items-center font-bold px-1.5 py-0.5 rounded-md shrink-0 text-[10px] ${
                isPositive
                  ? 'text-emerald-700 bg-emerald-50'
                  : isNegative
                  ? 'text-rose-700 bg-rose-50'
                  : 'text-slate-600 bg-slate-100'
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
            <span className="text-slate-400 truncate">
              {comparisonText}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
