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
import { RevenueTrendPoint } from '../../types/dashboard.types';

interface RevenueVolumeAreaChartProps {
  data: RevenueTrendPoint[];
  height?: number;
}

export const RevenueVolumeAreaChart: React.FC<RevenueVolumeAreaChartProps> = ({
  data,
  height = 290,
}) => {
  return (
    <div className="w-full bg-[#10223A] rounded-2xl border border-[#1D3A59] p-6 sm:p-7 shadow-xl flex flex-col justify-between">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-[#F5F7FA] tracking-tight">
            Revenue Trends
          </h2>
          <p className="text-xs sm:text-sm text-[#8EA6BF] font-medium mt-0.5">
            Daily print volume and financial collections
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#0A1728] border border-[#1D3A59] text-[#20D3A2]">
            All Months
          </span>
          <div className="hidden sm:flex items-center gap-3 text-xs font-semibold text-[#8EA6BF]">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#20D3A2]" />
              <span>Revenue</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#06b6d4]" />
              <span>Paid volume</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="darkColorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#20D3A2" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#20D3A2" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="darkColorPaid" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1D3A59" />
            <XAxis
              dataKey="displayDate"
              tickLine={false}
              axisLine={{ stroke: '#1D3A59' }}
              tick={{ fill: '#8EA6BF', fontSize: 12, fontWeight: 500 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => `₹${val}`}
              tick={{ fill: '#8EA6BF', fontSize: 12, fontWeight: 500 }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload as RevenueTrendPoint;
                  return (
                    <div className="bg-[#07111F] text-[#F5F7FA] p-3.5 rounded-xl shadow-2xl text-xs space-y-1.5 border border-[#1D3A59] font-sans">
                      <p className="font-bold text-[#8EA6BF]">{d.date}</p>
                      <p className="text-[#20D3A2] font-black text-sm">Revenue: ₹{d.revenue.toFixed(2)}</p>
                      <p className="text-[#06b6d4] font-semibold">Paid: {d.paidPageVolume} pages</p>
                      <p className="text-[#8EA6BF]">Printed: {d.printedPageVolume} pages</p>
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
              fill="url(#darkColorRevenue)"
            />
            <Area
              type="monotone"
              dataKey="paidPageVolume"
              stroke="#06b6d4"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#darkColorPaid)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
