import React from 'react';

type BadgeVariant =
  | 'success' | 'active' | 'online' | 'completed' | 'resolved'
  | 'warning' | 'attention' | 'medium' | 'maintenance'
  | 'error' | 'critical' | 'offline' | 'failed'
  | 'info' | 'processing' | 'printing' | 'in_progress'
  | 'queued' | 'pending'
  | 'high'
  | 'default';

interface StatusBadgeProps {
  variant?: BadgeVariant;
  children?: React.ReactNode;
  label?: string;
  dot?: boolean;
  pulse?: boolean;
  size?: 'sm' | 'md';
}

const VARIANTS: Record<string, { classes: string; dotClass: string }> = {
  success:    { classes: 'bg-[var(--green-bg)]  text-[var(--green-text)]  border-[var(--green-border)]',  dotClass: 'bg-green-500' },
  active:     { classes: 'bg-[var(--green-bg)]  text-[var(--green-text)]  border-[var(--green-border)]',  dotClass: 'bg-green-500' },
  online:     { classes: 'bg-[var(--green-bg)]  text-[var(--green-text)]  border-[var(--green-border)]',  dotClass: 'bg-green-500' },
  completed:  { classes: 'bg-[var(--green-bg)]  text-[var(--green-text)]  border-[var(--green-border)]',  dotClass: 'bg-green-500' },
  resolved:   { classes: 'bg-[var(--green-bg)]  text-[var(--green-text)]  border-[var(--green-border)]',  dotClass: 'bg-green-500' },

  warning:    { classes: 'bg-[var(--amber-bg)]  text-[var(--amber-text)]  border-[var(--amber-border)]',  dotClass: 'bg-amber-500' },
  attention:  { classes: 'bg-[var(--amber-bg)]  text-[var(--amber-text)]  border-[var(--amber-border)]',  dotClass: 'bg-amber-500' },
  medium:     { classes: 'bg-[var(--amber-bg)]  text-[var(--amber-text)]  border-[var(--amber-border)]',  dotClass: 'bg-amber-500' },
  maintenance:{ classes: 'bg-[var(--amber-bg)]  text-[var(--amber-text)]  border-[var(--amber-border)]',  dotClass: 'bg-amber-500' },
  high:       { classes: 'bg-[var(--amber-bg)]  text-[var(--amber-text)]  border-[var(--amber-border)]',  dotClass: 'bg-amber-500' },
  pending:    { classes: 'bg-[var(--amber-bg)]  text-[var(--amber-text)]  border-[var(--amber-border)]',  dotClass: 'bg-amber-500' },

  error:      { classes: 'bg-[var(--red-bg)]    text-[var(--red-text)]    border-[var(--red-border)]',    dotClass: 'bg-red-500' },
  critical:   { classes: 'bg-[var(--red-bg)]    text-[var(--red-text)]    border-[var(--red-border)]',    dotClass: 'bg-red-500' },
  offline:    { classes: 'bg-[var(--red-bg)]    text-[var(--red-text)]    border-[var(--red-border)]',    dotClass: 'bg-red-500' },
  failed:     { classes: 'bg-[var(--red-bg)]    text-[var(--red-text)]    border-[var(--red-border)]',    dotClass: 'bg-red-500' },

  info:       { classes: 'bg-[var(--blue-bg)]   text-[var(--blue-text)]   border-[var(--blue-border)]',   dotClass: 'bg-blue-500' },
  processing: { classes: 'bg-[var(--blue-bg)]   text-[var(--blue-text)]   border-[var(--blue-border)]',   dotClass: 'bg-blue-500 animate-pulse' },
  printing:   { classes: 'bg-[var(--blue-bg)]   text-[var(--blue-text)]   border-[var(--blue-border)]',   dotClass: 'bg-blue-500 animate-pulse' },
  in_progress:{ classes: 'bg-[var(--blue-bg)]   text-[var(--blue-text)]   border-[var(--blue-border)]',   dotClass: 'bg-blue-500 animate-pulse' },

  queued:     { classes: 'bg-[var(--primary-light)] text-[var(--primary)] border-[var(--primary-border)]', dotClass: 'bg-indigo-500' },
  default:    { classes: 'bg-[var(--surface-2)] text-[var(--text-2)] border-[var(--border)]',             dotClass: 'bg-slate-400' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  variant = 'default',
  children,
  label,
  dot = true,
  pulse = false,
  size = 'md',
}) => {
  const key = (variant as string).toLowerCase().replace(/[^a-z_]/g, '');
  const style = VARIANTS[key] ?? VARIANTS.default;
  const text  = children ?? label ?? variant;
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[10px] gap-1.5' : 'px-2.5 py-0.5 text-[11px] gap-1.5';

  return (
    <span className={`inline-flex items-center ${sizeClass} rounded-full border font-semibold tracking-wide ${style.classes}`}>
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dotClass} ${pulse ? 'animate-pulse' : ''}`} />
      )}
      <span className="leading-none">{text as React.ReactNode}</span>
    </span>
  );
};
