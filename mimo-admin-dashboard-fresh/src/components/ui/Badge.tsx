import React from 'react';

export interface BadgeProps {
  variant?: 'active' | 'printing' | 'warning' | 'critical' | 'queued' | 'completed' | 'online' | 'offline' | 'maintenance' | 'default';
  status?: string;
  children?: React.ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant,
  status,
  children,
  size = 'md',
  className = '',
}) => {
  const effectiveVariant = (variant || status || 'default').toLowerCase();
  const label = children || status || variant || 'Status';

  const sizeClass = size === 'sm' ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs';

  let colorClass = 'bg-[#132943] text-[#8EA6BF] border border-[#1D3A59]';
  let dotColor = 'bg-[#6F89A3]';

  switch (effectiveVariant) {
    case 'active':
    case 'online':
    case 'completed':
    case 'success':
      colorClass = 'bg-[#20D3A2]/15 text-[#20D3A2] border border-[#20D3A2]/35 font-bold';
      dotColor = 'bg-[#20D3A2]';
      break;
    case 'printing':
    case 'processing':
      colorClass = 'bg-blue-500/15 text-blue-400 border border-blue-500/35 font-bold';
      dotColor = 'bg-blue-400 animate-pulse';
      break;
    case 'warning':
    case 'merge':
    case 'attention':
    case 'maintenance':
    case 'high':
      colorClass = 'bg-amber-500/15 text-amber-400 border border-amber-500/35 font-bold';
      dotColor = 'bg-amber-400';
      break;
    case 'critical':
    case 'offline':
    case 'failed':
      colorClass = 'bg-rose-500/15 text-rose-400 border border-rose-500/35 font-bold';
      dotColor = 'bg-rose-400';
      break;
    case 'queued':
    case 'spooling':
    case 'low':
      colorClass = 'bg-purple-500/15 text-purple-400 border border-purple-500/35 font-bold';
      dotColor = 'bg-purple-400';
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold tracking-wide uppercase ${sizeClass} ${colorClass} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      <span>{label}</span>
    </span>
  );
};
