import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

export interface PaidFulfillmentDonutProps {
  fulfillmentPercent: number;
  printedPages: number;
  paidPages: number;
  size?: number;
}

export const PaidFulfillmentDonut: React.FC<PaidFulfillmentDonutProps> = ({
  fulfillmentPercent,
  size = 200,
}) => {
  const data = [
    { name: 'Fulfilled', value: fulfillmentPercent },
    { name: 'Remainder', value: Math.max(0, 100 - fulfillmentPercent) },
  ];

  return (
    <div className="mimo-card p-6 sm:p-7 flex flex-col justify-between h-full">
      {/* Card Header */}
      <div className="mimo-card-header !pb-4 !mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight">
            Paid Page Fulfillment
          </h3>
        </div>
        <span className="text-xs font-bold text-[#4F46E5] dark:text-[#A5B4FC] bg-[#EEF2FF] dark:bg-indigo-950/60 px-2.5 py-0.5 rounded-full border border-indigo-200/80 dark:border-indigo-800/60 shrink-0">
          98.8% SLA
        </span>
      </div>

      {/* Card Body with Centered Gauge Graphic */}
      <div className="mimo-card-body items-center justify-center relative flex-1 min-h-[220px]">
        <div className="relative flex items-center justify-center" style={{ height: size, width: size }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={size * 0.34}
                outerRadius={size * 0.44}
                startAngle={90}
                endAngle={-270}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={index === 0 ? '#6366F1' : '#EEF2FF'}
                    className="transition-colors duration-200"
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          {/* Centered Percentage & Label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-[#F1F5F9] leading-none">
              98.8%
            </span>
            <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 dark:text-[#8495AA] mt-1.5 text-center">
              FULFILLED
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
