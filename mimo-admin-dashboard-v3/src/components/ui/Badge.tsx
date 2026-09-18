import React from 'react';

export type BadgeVariant =
  | 'live'
  | 'today'
  | 'active'
  | 'printing'
  | 'warning'
  | 'critical'
  | 'completed'
  | 'queued'
  | 'neutral'
  | 'success';

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: 'xs' | 'sm' | 'md';
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'sm',
  children,
  className = '',
  dot = false,
}) => {
  const sizeStyles = {
    xs: 'text-[9px] px-1.5 py-0.5',
    sm: 'text-[11px] px-2.5 py-0.5 font-bold',
    md: 'text-xs px-3 py-1 font-bold',
  };

  const variantStyles: Record<BadgeVariant, string> = {
    live: 'bg-[#FCE7F3] text-[#DB2777] border border-[#FBCFE8] dark:bg-[#DB2777]/20 dark:text-[#F472B6] dark:border-[#DB2777]/40 font-semibold',
    today: 'bg-[#EDE9FE] text-[#7C3AED] border border-[#DDD6FE] dark:bg-[#7C3AED]/20 dark:text-[#C084FC] dark:border-[#7C3AED]/40 font-semibold',
    active: 'bg-[#EDE9FE] text-[#7C3AED] border border-[#DDD6FE] dark:bg-[#7C3AED]/25 dark:text-[#C084FC] dark:border-[#7C3AED]/40 font-bold tracking-wide uppercase',
    printing: 'bg-[#FCE7F3] text-[#DB2777] border border-[#FBCFE8] dark:bg-[#DB2777]/25 dark:text-[#F472B6] dark:border-[#DB2777]/40 font-bold uppercase',
    warning: 'bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A] dark:bg-[#D97706]/25 dark:text-[#FBBF24] dark:border-[#D97706]/40 font-bold uppercase',
    critical: 'bg-[#FFE4E6] text-[#E11D48] border border-[#FECDD3] dark:bg-[#E11D48]/25 dark:text-[#FB7185] dark:border-[#E11D48]/40 font-bold uppercase',
    completed: 'bg-[#E0F2FE] text-[#0284C7] border border-[#BAE6FD] dark:bg-[#0284C7]/25 dark:text-[#38BDF8] dark:border-[#0284C7]/40 font-bold uppercase',
    queued: 'bg-[#F3E8FF] text-[#9333EA] border border-[#E9D5FF] dark:bg-[#9333EA]/25 dark:text-[#C084FC] dark:border-[#9333EA]/40 font-bold uppercase',
    neutral: 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700 font-semibold',
    success: 'bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0] dark:bg-[#16A34A]/25 dark:text-[#4ADE80] dark:border-[#16A34A]/40 font-bold uppercase',
  };

  const dotColors: Record<BadgeVariant, string> = {
    live: 'bg-[#EC4899] animate-pulse',
    today: 'bg-[#8B5CF6]',
    active: 'bg-[#7C3AED]',
    printing: 'bg-[#EC4899] animate-pulse',
    warning: 'bg-[#F59E0B]',
    critical: 'bg-[#E11D48] animate-ping',
    completed: 'bg-[#0284C7]',
    queued: 'bg-[#9333EA]',
    neutral: 'bg-slate-400',
    success: 'bg-[#16A34A]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full transition-colors ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[variant]}`} />}
      <span>{children}</span>
    </span>
  );
};
