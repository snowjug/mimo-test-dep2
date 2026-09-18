import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { RevenueVolumeDataPoint } from '../../types/dashboard';

export interface RevenueVolumeChartProps {
  data: RevenueVolumeDataPoint[];
  height?: number;
}

export const RevenueVolumeChart: React.FC<RevenueVolumeChartProps> = ({
  data,
}) => {
  return (
    <div className="mimo-card p-6 sm:p-7 flex flex-col justify-between h-full">
      {/* Card Header */}
      <div className="mimo-card-header !pb-4 !mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight">
            Revenue Trends
          </h3>
          <p className="text-xs text-slate-500 dark:text-[#94A3B8] mt-0.5">
            Daily print volume and financial collections
          </p>
        </div>

        <button
          type="button"
          className="px-3.5 py-1 rounded-full text-xs font-bold bg-[#EEF2FF] text-[#4F46E5] dark:bg-indigo-950/60 dark:text-[#A5B4FC] border border-indigo-200/80 dark:border-indigo-800/60 hover:bg-[#E0E7FF] transition-colors cursor-pointer"
        >
          ALL MONTHS
        </button>
      </div>

      {/* Card Body */}
      <div className="mimo-card-body flex-1 min-h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
            <defs>
              <linearGradient id="indigoRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366F1" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#6366F1" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.6} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#64748B', fontSize: 11, fontWeight: 600 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#64748B', fontSize: 11, fontWeight: 600 }}
              tickFormatter={(val) => `₹${val}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#172033',
                color: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)',
                fontSize: '12px',
                fontWeight: 'bold',
              }}
              formatter={(val: any) => [`₹${val}`, 'Revenue']}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#6366F1"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#indigoRevenue)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
