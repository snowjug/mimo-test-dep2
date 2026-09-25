import React from 'react';

/* ── PageHeader ─────────────────────────────────────────────────────────────── */
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  badge?: { label: string; dot?: boolean; color?: 'green' | 'amber' | 'blue' };
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions, badge }) => {
  const dotColor = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    blue:  'bg-blue-500',
  }[badge?.color ?? 'green'] ?? 'bg-emerald-500';

  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-[var(--text-1)] tracking-tight">{title}</h1>
          {badge && (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
              badge.color === 'amber'
                ? 'bg-[var(--amber-bg)] text-[var(--amber-text)] border-[var(--amber-border)]'
                : badge.color === 'blue'
                ? 'bg-[var(--blue-bg)] text-[var(--blue-text)] border-[var(--blue-border)]'
                : 'bg-[var(--green-bg)] text-[var(--green-text)] border-[var(--green-border)]'
            }`}>
              {badge.dot !== false && (
                <span className={`w-1.5 h-1.5 rounded-full ${dotColor} animate-pulse`} />
              )}
              {badge.label}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-sm text-[var(--text-2)] mt-1">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
      )}
    </div>
  );
};

/* ── LoadingSkeleton ─────────────────────────────────────────────────────────── */
interface SkeletonProps {
  className?: string;
  rows?: number;
}

export const LoadingSkeleton: React.FC<SkeletonProps> = ({ className = '', rows }) => {
  if (rows) {
    return (
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="skeleton h-10 w-full" />
        ))}
      </div>
    );
  }
  return <div className={`skeleton ${className}`} />;
};

export const StatCardSkeleton: React.FC = () => (
  <div className="rounded-[var(--radius-lg)] p-5 bg-[var(--surface)] border border-[var(--border)] min-h-[120px] flex flex-col justify-between">
    <div className="skeleton h-3 w-24 rounded" />
    <div>
      <div className="skeleton h-7 w-32 rounded mt-2" />
      <div className="skeleton h-3 w-20 rounded mt-2" />
    </div>
  </div>
);

/* ── EmptyState ─────────────────────────────────────────────────────────────── */
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
    {icon && (
      <div className="w-12 h-12 rounded-xl bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-3)] mb-4">
        {icon}
      </div>
    )}
    <p className="text-sm font-semibold text-[var(--text-2)]">{title}</p>
    {description && <p className="text-xs text-[var(--text-3)] mt-1 max-w-xs">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

/* ── ErrorState ─────────────────────────────────────────────────────────────── */
interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Failed to load data',
  description = 'An error occurred while fetching data.',
  onRetry,
}) => (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
    <div className="w-10 h-10 rounded-xl bg-[var(--red-bg)] flex items-center justify-center mb-3">
      <span className="text-red-500 text-lg">!</span>
    </div>
    <p className="text-sm font-semibold text-[var(--text-1)]">{title}</p>
    <p className="text-xs text-[var(--text-3)] mt-1">{description}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="mt-4 px-4 py-1.5 text-xs font-semibold rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors"
      >
        Try again
      </button>
    )}
  </div>
);

/* ── ConfirmDialog ─────────────────────────────────────────────────────────── */
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-2xl p-6 w-full max-w-sm animate-fadeIn">
        <h3 className="text-base font-semibold text-[var(--text-1)]">{title}</h3>
        {description && <p className="text-sm text-[var(--text-2)] mt-2">{description}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-2)] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-semibold rounded-lg text-white transition-colors disabled:opacity-60 ${
              danger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[var(--primary)] hover:bg-[var(--primary-hover)]'
            }`}
          >
            {loading ? 'Loading…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Btn helpers ─────────────────────────────────────────────────────────────── */
interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
  leftIcon?: React.ReactNode;
}

export const Btn: React.FC<BtnProps> = ({
  variant = 'secondary',
  size = 'md',
  loading,
  leftIcon,
  children,
  className = '',
  disabled,
  ...rest
}) => {
  const base = 'inline-flex items-center gap-1.5 font-semibold rounded-lg transition-colors focus-visible:outline-none disabled:opacity-60 cursor-pointer';
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
  };
  const variants = {
    primary:   'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] shadow-sm',
    secondary: 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:border-[var(--border-2)]',
    ghost:     'text-[var(--text-2)] hover:bg-[var(--surface-2)]',
    danger:    'bg-red-600 text-white hover:bg-red-700',
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} disabled={disabled || loading} {...rest}>
      {loading
        ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        : leftIcon}
      {children}
    </button>
  );
};

/* ── SearchInput ─────────────────────────────────────────────────────────────── */
interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search…',
  className = '',
}) => (
  <div className={`relative ${className}`}>
    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-3)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="8" strokeWidth="2" />
      <path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
    </svg>
    <input
      type="search"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pl-9 pr-3 py-2 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--primary)] transition-colors"
    />
  </div>
);

/* ── Select ──────────────────────────────────────────────────────────────────── */
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const Select: React.FC<SelectProps> = ({ label, className = '', ...rest }) => (
  <div className="flex flex-col gap-1">
    {label && <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider">{label}</label>}
    <select
      className={`px-3 py-2 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)] transition-colors cursor-pointer ${className}`}
      {...rest}
    />
  </div>
);

/* ── Card ───────────────────────────────────────────────────────────────────── */
interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', padding = true }) => (
  <div className={`bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-sm ${padding ? 'p-5' : ''} ${className}`}>
    {children}
  </div>
);

/* ── SectionHeader ───────────────────────────────────────────────────────────── */
interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, subtitle, action }) => (
  <div className="flex items-start justify-between gap-4 mb-4">
    <div>
      <h2 className="text-sm font-semibold text-[var(--text-1)]">{title}</h2>
      {subtitle && <p className="text-xs text-[var(--text-3)] mt-0.5">{subtitle}</p>}
    </div>
    {action}
  </div>
);

/* ── LevelBar ───────────────────────────────────────────────────────────────── */
interface LevelBarProps {
  value: number;
  max?: number;
  label?: string;
  color?: string;
}

export const LevelBar: React.FC<LevelBarProps> = ({ value, max = 100, label, color }) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const barColor = color ?? (pct < 15 ? 'bg-red-500' : pct < 25 ? 'bg-amber-500' : 'bg-emerald-500');
  return (
    <div>
      {label && (
        <div className="flex justify-between mb-1">
          <span className="text-[11px] text-[var(--text-3)]">{label}</span>
          <span className="text-[11px] font-semibold text-[var(--text-2)]">{value}{max === 100 ? '%' : `/${max}`}</span>
        </div>
      )}
      <div className="h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};
