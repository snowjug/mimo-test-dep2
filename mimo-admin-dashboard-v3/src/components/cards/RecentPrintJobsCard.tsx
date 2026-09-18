import React from 'react';
import { List, Check, X, Clock, ArrowRight } from 'lucide-react';
import type { RecentPrintJob, PrintJobStatus } from '../../types/dashboard';

/* ==========================================================================
   Reusable Sub-Components
   ========================================================================== */

export interface KioskBadgeProps {
  kiosk: 'M1' | 'M2' | string;
  isColor?: boolean;
}

export const KioskBadge: React.FC<KioskBadgeProps> = ({ kiosk, isColor = false }) => {
  // M1 is always grey (black & white only).
  // M2 is grey if B&W, blue if color.
  const isBlue = kiosk === 'M2' && isColor;

  return (
    <div
      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold select-none shadow-2xs ${
        isBlue
          ? 'bg-[#3B82F6] text-white'
          : 'bg-slate-400 dark:bg-slate-600 text-white'
      }`}
      title={`${kiosk} (${isBlue ? 'Color Print' : 'Black & White'})`}
    >
      {kiosk}
    </div>
  );
};

export interface PageBadgeProps {
  pages: number;
  isDuplex?: boolean;
}

export const PageBadge: React.FC<PageBadgeProps> = ({ pages, isDuplex = false }) => {
  if (isDuplex) {
    return (
      <div
        className="w-7 h-7 rounded-full border border-[#3B82F6] text-[#2563EB] dark:border-[#60A5FA] dark:text-[#93C5FD] font-medium text-xs flex items-center justify-center select-none"
        title={`${pages} pages (2-sided/duplex)`}
      >
        {pages}
      </div>
    );
  }

  return (
    <div
      className="w-7 h-7 flex items-center justify-center text-[14px] font-medium text-slate-700 dark:text-[#CBD5E1] select-none"
      title={`${pages} pages (1-sided)`}
    >
      {pages}
    </div>
  );
};

export interface PrintStatusIconProps {
  status: PrintJobStatus;
}

export const PrintStatusIcon: React.FC<PrintStatusIconProps> = ({ status }) => {
  switch (status) {
    case 'received':
      return (
        <div
          className="w-6 h-6 rounded-full bg-[#10B981] text-white flex items-center justify-center shadow-2xs"
          title="Paid + Print Received"
        >
          <Check size={13} strokeWidth={3} />
        </div>
      );
    case 'not_received':
      return (
        <div
          className="w-6 h-6 rounded-full bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center shadow-2xs"
          title="Paid + Print Not Received"
        >
          <Check size={13} strokeWidth={3} />
        </div>
      );
    case 'failed':
      return (
        <div
          className="w-6 h-6 rounded-full bg-[#EF4444] text-white flex items-center justify-center shadow-2xs"
          title="Failed"
        >
          <X size={13} strokeWidth={3} />
        </div>
      );
    case 'processing':
      return (
        <div
          className="w-6 h-6 rounded-full bg-amber-50 dark:bg-amber-950/60 border border-[#F59E0B] text-[#F59E0B] flex items-center justify-center shadow-2xs"
          title="Processing"
        >
          <Clock size={13} strokeWidth={2.5} />
        </div>
      );
    case 'refunded':
      return (
        <div
          className="w-6 h-6 rounded-full bg-sky-50 dark:bg-sky-950/60 border border-[#3B82F6] text-[#3B82F6] font-bold text-xs flex items-center justify-center shadow-2xs"
          title="Refunded"
        >
          ₹
        </div>
      );
    default:
      return null;
  }
};

export interface CouponPriceProps {
  price: number;
  couponUsed?: boolean;
}

export const CouponPrice: React.FC<CouponPriceProps> = ({ price, couponUsed = false }) => {
  if (couponUsed) {
    return (
      <div className="border border-indigo-200 dark:border-indigo-800 bg-[#EEF2FF]/60 dark:bg-indigo-950/40 px-2.5 py-1 rounded-md text-indigo-700 dark:text-indigo-300 font-medium text-xs inline-flex items-center gap-2 select-none">
        <span>₹{price.toFixed(2)}</span>
        <span className="text-[11px] text-indigo-500 dark:text-indigo-400 font-normal">Coupon</span>
      </div>
    );
  }

  return (
    <span className="text-sm font-medium text-slate-800 dark:text-[#F1F5F9]">
      ₹{price.toFixed(2)}
    </span>
  );
};

/* ==========================================================================
   Main Recent Print Jobs Component
   ========================================================================== */

export interface RecentPrintJobsCardProps {
  jobs: RecentPrintJob[];
  onViewAll?: () => void;
}

export const RecentPrintJobsCard: React.FC<RecentPrintJobsCardProps> = ({
  jobs,
  onViewAll,
}) => {
  return (
    <div className="mimo-card p-5 sm:p-6 lg:p-7 shadow-xs rounded-2xl">
      {/* Section Header */}
      <div className="flex items-center justify-between gap-4 pb-4 mb-1">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#EDE9FE] text-[#7C3AED] dark:bg-[#7C3AED]/20 dark:text-[#C084FC] flex items-center justify-center shrink-0 shadow-xs">
            <List size={18} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight leading-tight">
              Recent Print Jobs
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-[#94A3B8] font-normal mt-0.5">
              Latest print activities across all kiosks
            </p>
          </div>
        </div>

        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors cursor-pointer shrink-0"
          >
            <span>View All</span>
            <ArrowRight size={13} />
          </button>
        )}
      </div>

      {/* Desktop Table Container (>= 768px) */}
      <div className="hidden md:block overflow-x-auto -mx-5 sm:-mx-6 lg:-mx-7 px-5 sm:px-6 lg:px-7">
        <table className="w-full text-left border-collapse min-w-[580px]">
          <thead>
            <tr className="bg-slate-50/80 dark:bg-[#111C30]/80 border-y border-slate-100 dark:border-[#1E293B] text-[13px] sm:text-[14px] font-semibold text-slate-500 dark:text-[#8495AA] uppercase tracking-wider">
              <th className="py-3 px-4 font-semibold w-[15%]">Time</th>
              <th className="py-3 px-4 font-semibold w-[25%]">Name</th>
              <th className="py-3 px-4 font-semibold text-center w-[15%]">Kiosk</th>
              <th className="py-3 px-4 font-semibold text-center w-[15%]">Pages</th>
              <th className="py-3 px-4 font-semibold text-center w-[15%]">Status</th>
              <th className="py-3 px-4 font-semibold text-right w-[15%]">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#1E314B]/60">
            {jobs.map((job) => (
              <tr
                key={job.id}
                className="hover:bg-slate-50/80 dark:hover:bg-[#14243A]/50 transition-colors h-[50px] sm:h-[54px]"
              >
                {/* 1. Time */}
                <td className="py-3 px-4 text-[13px] sm:text-[14px] font-medium text-slate-700 dark:text-[#CBD5E1]">
                  {job.time}
                </td>

                {/* 2. Name */}
                <td className="py-3 px-4 text-[14px] sm:text-[15px] font-medium text-slate-900 dark:text-[#F8FAFC]">
                  {job.customerName}
                </td>

                {/* 3. Kiosk */}
                <td className="py-3 px-4 text-center">
                  <div className="flex justify-center items-center">
                    <KioskBadge kiosk={job.kiosk} isColor={job.isColor} />
                  </div>
                </td>

                {/* 4. Pages */}
                <td className="py-3 px-4 text-center">
                  <div className="flex justify-center items-center">
                    <PageBadge pages={job.pages} isDuplex={job.isDuplex} />
                  </div>
                </td>

                {/* 5. Status */}
                <td className="py-3 px-4 text-center">
                  <div className="flex justify-center items-center">
                    <PrintStatusIcon status={job.status} />
                  </div>
                </td>

                {/* 6. Price */}
                <td className="py-3 px-4 text-right">
                  <div className="flex justify-end items-center">
                    <CouponPrice price={job.price} couponUsed={job.couponUsed} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List (< 768px) */}
      <div className="md:hidden divide-y divide-slate-100 dark:divide-[#1E314B]/60 -mx-5 px-5">
        {jobs.map((job) => (
          <div key={job.id} className="py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 flex items-center justify-center">
                <KioskBadge kiosk={job.kiosk} isColor={job.isColor} />
              </div>
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-semibold text-slate-900 dark:text-[#F8FAFC] truncate">
                  {job.customerName}
                </p>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#8495AA]">
                  <span>{job.time}</span>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <PageBadge pages={job.pages} isDuplex={job.isDuplex} />
                    <span className="text-[11px] text-slate-400">pages</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <PrintStatusIcon status={job.status} />
              <CouponPrice price={job.price} couponUsed={job.couponUsed} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
