import React from 'react';
import {
  Coins,
  FileText,
  Printer,
  Percent,
  AlertTriangle,
} from 'lucide-react';
import { useDashboard } from '../../hooks/useDashboard';
import { RecentPrintJobsCard } from '../../components/cards/RecentPrintJobsCard';
import { LoadingSkeleton } from '../../components/ui/LoadingSkeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import type { RecentPrintJob } from '../../types/dashboard';

export interface OverviewPageProps {
  onNavigateTab?: (tab: string) => void;
  searchQuery?: string;
}

const fallbackRecentJobs: RecentPrintJob[] = [
  {
    id: 'job-1',
    time: '21:45',
    customerName: 'Rahul Sharma',
    kiosk: 'M1',
    isColor: false,
    pages: 2,
    isDuplex: true,
    status: 'received',
    price: 20.0,
    couponUsed: false,
  },
  {
    id: 'job-2',
    time: '21:57',
    customerName: 'Priya Nair',
    kiosk: 'M2',
    isColor: true,
    pages: 5,
    isDuplex: false,
    status: 'not_received',
    price: 45.0,
    couponUsed: false,
  },
  {
    id: 'job-3',
    time: '22:13',
    customerName: 'Amit Verma',
    kiosk: 'M2',
    isColor: true,
    pages: 3,
    isDuplex: false,
    status: 'processing',
    price: 30.0,
    couponUsed: false,
  },
  {
    id: 'job-4',
    time: '22:28',
    customerName: 'Sneha Reddy',
    kiosk: 'M1',
    isColor: false,
    pages: 1,
    isDuplex: false,
    status: 'failed',
    price: 10.0,
    couponUsed: false,
  },
  {
    id: 'job-5',
    time: '22:41',
    customerName: 'Karan Mehta',
    kiosk: 'M2',
    isColor: true,
    pages: 4,
    isDuplex: true,
    status: 'refunded',
    price: 35.0,
    couponUsed: true,
  },
  {
    id: 'job-6',
    time: '23:05',
    customerName: 'Neha Kapoor',
    kiosk: 'M1',
    isColor: false,
    pages: 2,
    isDuplex: false,
    status: 'received',
    price: 25.0,
    couponUsed: false,
  },
];

export const OverviewPage: React.FC<OverviewPageProps> = ({ onNavigateTab }) => {
  const { data, loading, error, refresh } = useDashboard();

  if (loading) {
    return <LoadingSkeleton rows={4} />;
  }

  if (error || !data) {
    return (
      <EmptyState
        title="Failed to Load Overview"
        description={error || 'An error occurred while loading dashboard telemetry.'}
        actionText="Try Again"
        onAction={refresh}
      />
    );
  }

  const recentJobs = data.recentJobs && data.recentJobs.length > 0 ? data.recentJobs : fallbackRecentJobs;

  return (
    <div className="flex flex-col gap-3 sm:gap-3.5 lg:gap-4 animate-in fade-in duration-200 font-sans">
      {/* Page Header with Live Telemetry Active Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <h1 className="text-3xl sm:text-[32px] font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight leading-tight">
            Overview
          </h1>
          <p className="text-sm sm:text-[15px] text-slate-500 dark:text-[#94A3B8] font-normal mt-1">
            Real-time insights and key metrics for your print network
          </p>
        </div>

        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#EDE9FE] dark:bg-[#7C3AED]/20 border border-[#DDD6FE] dark:border-[#7C3AED]/30 text-xs font-semibold text-[#7C3AED] dark:text-[#C084FC] shrink-0 self-start sm:self-center shadow-xs">
          <span className="w-2 h-2 rounded-full bg-[#7C3AED] dark:bg-[#C084FC] animate-pulse" />
          <span>LIVE TELEMETRY ACTIVE</span>
        </div>
      </div>

      {/* Row 1: 5 Main KPI Cards - Controlled by Global Design System */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-3.5 lg:gap-4 items-start">
        {/* Card 1: TOTAL REVENUE */}
        <div className="mimo-card mimo-card-kpi">
          <div className="w-8 h-8 rounded-xl bg-[#EEF2FF] dark:bg-[#818CF8]/20 text-[#4F46E5] dark:text-[#818CF8] flex items-center justify-center shrink-0 shadow-2xs">
            <Coins size={17} />
          </div>
          <span className="mimo-card-label">
            Total Revenue
          </span>
          <div className="my-auto py-0.5 w-full flex items-center justify-center">
            <span className="mimo-card-metric text-slate-900 dark:text-[#F1F5F9]">
              ₹14,250.00
            </span>
          </div>
          <p className="mimo-card-desc">
            Daily print billing
          </p>
        </div>

        {/* Card 2: PAID PAGES */}
        <div className="mimo-card mimo-card-kpi">
          <div className="w-8 h-8 rounded-xl bg-[#E0F2FE] dark:bg-[#0284C7]/20 text-[#0284C7] dark:text-[#38BDF8] flex items-center justify-center shrink-0 shadow-2xs">
            <FileText size={17} />
          </div>
          <span className="mimo-card-label">
            Paid Pages
          </span>
          <div className="my-auto py-0.5 w-full flex items-center justify-center">
            <span className="mimo-card-metric text-slate-900 dark:text-[#F1F5F9]">
              {data.kpis.paidPages || 4821}
            </span>
          </div>
          <p className="mimo-card-desc">
            184 free pages
          </p>
        </div>

        {/* Card 3: PRINTED PAGES */}
        <div className="mimo-card mimo-card-kpi">
          <div className="w-8 h-8 rounded-xl bg-[#F3E8FF] dark:bg-[#9333EA]/20 text-[#7C3AED] dark:text-[#C084FC] flex items-center justify-center shrink-0 shadow-2xs">
            <Printer size={17} />
          </div>
          <span className="mimo-card-label">
            Printed Pages
          </span>
          <div className="my-auto py-0.5 w-full flex items-center justify-center">
            <span className="mimo-card-metric text-slate-900 dark:text-[#F1F5F9]">
              {data.kpis.printedPages || 4762}
            </span>
          </div>
          <p className="mimo-card-desc">
            lifetime: 4946
          </p>
        </div>

        {/* Card 4: SUCCESS RATE */}
        <div className="mimo-card mimo-card-kpi">
          <div className="w-8 h-8 rounded-xl bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#4F46E5] dark:text-[#A5B4FC] flex items-center justify-center shrink-0 shadow-2xs">
            <Percent size={15} />
          </div>
          <span className="mimo-card-label">
            Success Rate
          </span>
          <div className="my-auto py-0.5 w-full flex items-center justify-center">
            <span className="mimo-card-metric text-slate-900 dark:text-[#F1F5F9]">
              {data.kpis.printSuccessPercent || 98.8}%
            </span>
          </div>
          <p className="mimo-card-desc">
            Across all nodes
          </p>
        </div>

        {/* Card 5: INCIDENTS */}
        <div className="mimo-card mimo-card-kpi">
          <div className="w-8 h-8 rounded-xl bg-[#FCE7F3] dark:bg-[#E11D48]/20 text-[#E11D48] dark:text-[#FB7185] flex items-center justify-center shrink-0 shadow-2xs">
            <AlertTriangle size={17} />
          </div>
          <span className="mimo-card-label">
            Incidents
          </span>
          <div className="my-auto py-0.5 w-full flex items-center justify-center">
            <span className="mimo-card-metric text-slate-900 dark:text-[#F1F5F9]">
              {data.kpis.unresolvedRiskCount || 2}
            </span>
          </div>
          <p className="mimo-card-desc">
            Requires attention
          </p>
        </div>
      </div>

      {/* Row 2: Recent Print Jobs Section */}
      <RecentPrintJobsCard
        jobs={recentJobs}
        onViewAll={onNavigateTab ? () => onNavigateTab('operations') : undefined}
      />
    </div>
  );
};

