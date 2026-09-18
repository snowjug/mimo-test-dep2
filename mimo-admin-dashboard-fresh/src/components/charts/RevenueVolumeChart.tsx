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
import type { RevenueTrendPoint } from '../../types/dashboard.types';

interface RevenueVolumeChartProps {
  data: RevenueTrendPoint[];
  height?: number;
}

export const RevenueVolumeChart: React.FC<RevenueVolumeChartProps> = ({
  data,
  height = 280,
}) => {
  return (
    <div className="w-full bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl flex flex-col justify-between">
      {/* Chart Title & Legend Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-[#F5F7FA]">
            Revenue & Print Volume
          </h3>
          <p className="text-xs text-[#8EA6BF] mt-0.5">
            Daily throughput plotted with gross billing
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-semibold text-[#8EA6BF]">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#20D3A2]" />
            <span>Revenue</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#059669]" />
            <span>Paid pages</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#6F89A3]" />
            <span>Printed pages</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#20D3A2" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#20D3A2" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="volumeGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#059669" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1D3A59" vertical={false} />
            <XAxis
              dataKey="displayDate"
              stroke="#6F89A3"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#1D3A59' }}
            />
            <YAxis
              stroke="#6F89A3"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `₹${v}`}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload as RevenueTrendPoint;
                  return (
                    <div className="bg-[#0A1728] border border-[#20D3A2]/40 rounded-xl p-3 shadow-2xl text-xs">
                      <p className="font-bold text-[#F5F7FA] mb-1">{d.date}</p>
                      <p className="text-[#20D3A2] font-semibold">
                        Revenue: ₹{d.revenue.toFixed(2)}
                      </p>
                      <p className="text-[#CAD7E6]">Paid Pages: {d.paidPageVolume}</p>
                      <p className="text-[#8EA6BF]">Printed: {d.printedPageVolume}</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#20D3A2"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#revenueGlow)"
            />
            <Area
              type="monotone"
              dataKey="paidPageVolume"
              stroke="#059669"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#volumeGlow)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
