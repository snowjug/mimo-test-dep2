import React from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: string;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  badge,
  actions,
  breadcrumb,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
      <div className="space-y-1">
        {breadcrumb && (
          <div className="text-xs font-semibold text-slate-500 dark:text-[#94A3B8] mb-1">
            {breadcrumb}
          </div>
        )}
        <div className="flex items-center gap-3">
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-[#F8FAFC] tracking-tight leading-tight">
            {title}
          </h1>
          {badge && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#EDE9FE] text-[#7C3AED] dark:bg-[#7C3AED]/20 dark:text-[#DDD6FE] dark:border dark:border-[#7C3AED]/40">
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p className="text-sm sm:text-base text-slate-500 dark:text-[#94A3B8] font-medium leading-relaxed max-w-3xl">
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-3 shrink-0 self-start sm:self-center flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
};
