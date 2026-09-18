import React from 'react';

export interface LoadingSkeletonProps {
  rows?: number;
  className?: string;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  rows = 3,
  className = '',
}) => {
  return (
    <div className={`space-y-4 animate-pulse p-4 ${className}`}>
      <div className="h-8 bg-slate-200 dark:bg-[#14243A] rounded-xl w-1/3" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-slate-200 dark:bg-[#14243A] rounded-2xl border border-transparent dark:border-[#1E314B]" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-16 bg-slate-200 dark:bg-[#14243A] rounded-xl border border-transparent dark:border-[#1E314B]" />
        ))}
      </div>
    </div>
  );
};
