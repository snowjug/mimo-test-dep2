import React from 'react';
import { FileQuestion } from 'lucide-react';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No Records Found',
  description = 'There are no items matching your current filters or query.',
  icon,
  actionText,
  onAction,
  className = '',
}) => {
  return (
    <div className={`p-12 text-center flex flex-col items-center justify-center ${className}`}>
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-[#14243A] flex items-center justify-center text-slate-400 dark:text-[#8495AA] mb-3.5 border border-slate-200 dark:border-[#1E314B]">
        {icon || <FileQuestion size={26} />}
      </div>
      <h3 className="text-base font-bold text-slate-800 dark:text-[#F1F5F9]">{title}</h3>
      <p className="text-xs text-slate-500 dark:text-[#8495AA] max-w-sm mt-1 mb-4">{description}</p>
      {actionText && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="px-4 py-2 bg-[#6366F1] hover:bg-[#4F46E5] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};
