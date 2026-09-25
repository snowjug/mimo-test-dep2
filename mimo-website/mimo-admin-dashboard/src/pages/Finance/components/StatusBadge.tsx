import React from 'react';

export type FinanceStatus = 
  | 'SUCCESS' 
  | 'PAID' 
  | 'COMPLETED'
  | 'PENDING' 
  | 'PROCESSING'
  | 'FAILED' 
  | 'REFUNDED' 
  | 'REJECTED'
  | 'APPROVED'
  | 'ACTIVE'
  | 'EXPIRED'
  | string;

export interface StatusBadgeProps {
  status: FinanceStatus;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'sm' }) => {
  const norm = String(status || '').toUpperCase().trim();

  let styles = 'bg-slate-100 text-slate-700 border-slate-200';
  let dotColor = 'bg-slate-400';
  let displayLabel = norm || 'UNKNOWN';

  switch (norm) {
    case 'SUCCESS':
    case 'PAID':
    case 'COMPLETED':
    case 'APPROVED':
    case 'ACTIVE':
    case 'PRINTED':
      styles = 'bg-emerald-50/90 text-emerald-700 border-emerald-200';
      dotColor = 'bg-emerald-500';
      displayLabel = norm === 'PAID' || norm === 'COMPLETED' ? 'Success' : norm === 'ACTIVE' ? 'Active' : 'Approved';
      break;

    case 'PENDING':
    case 'PROCESSING':
    case 'QUEUED':
      styles = 'bg-amber-50/90 text-amber-700 border-amber-200';
      dotColor = 'bg-amber-500';
      displayLabel = norm === 'PROCESSING' ? 'Processing' : 'Pending';
      break;

    case 'FAILED':
    case 'ERROR':
    case 'REJECTED':
      styles = 'bg-rose-50/90 text-rose-700 border-rose-200';
      dotColor = 'bg-rose-500';
      displayLabel = norm === 'REJECTED' ? 'Rejected' : 'Failed';
      break;

    case 'REFUNDED':
    case 'REFUND_SUCCESS':
      styles = 'bg-purple-50 text-purple-700 border-purple-200';
      dotColor = 'bg-[#6D35E8]';
      displayLabel = 'Refunded';
      break;

    case 'EXPIRED':
      styles = 'bg-slate-100 text-slate-500 border-slate-200';
      dotColor = 'bg-slate-400';
      displayLabel = 'Expired';
      break;

    default:
      styles = 'bg-slate-100 text-slate-700 border-slate-200';
      dotColor = 'bg-slate-400';
      displayLabel = norm;
  }

  const padding = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${styles} ${padding} tracking-tight whitespace-nowrap`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {displayLabel}
    </span>
  );
};
