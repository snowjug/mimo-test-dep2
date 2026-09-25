import React from 'react';

export interface FinanceChartCardProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const FinanceChartCard: React.FC<FinanceChartCardProps> = ({
  title,
  subtitle,
  action,
  children,
  icon,
  className = '',
}) => {
  return (
    <div className={`bg-white border border-slate-150/80 rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2.5">
          {icon && (
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-[#6D35E8]">
              {icon}
            </div>
          )}
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-slate-400 font-normal">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action && (
          <div className="flex items-center gap-2">
            {action}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 w-full">
        {children}
      </div>
    </div>
  );
};
