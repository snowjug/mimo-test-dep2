import { AnalyticsPageData } from '../types/analytics.types';

export const mockAnalyticsData: AnalyticsPageData = {
  kpis: {
    totalRevenue: 18420,
    paidPages: 4821,
    printedPages: 4762,
    fulfillmentRate: 98.8,
    avgPagesPerJob: 4.2,
    activeUsers: 840,
  },
  revenueTrends: [
    { date: '2026-08-27', displayDate: 'Aug 27', revenue: 260, paidPageVolume: 120, printedPageVolume: 118 },
    { date: '2026-08-29', displayDate: 'Aug 29', revenue: 210, paidPageVolume: 95, printedPageVolume: 94 },
    { date: '2026-08-31', displayDate: 'Aug 31', revenue: 341.7, paidPageVolume: 155, printedPageVolume: 152 },
    { date: '2026-09-02', displayDate: 'Sep 02', revenue: 280, paidPageVolume: 130, printedPageVolume: 128 },
    { date: '2026-09-04', displayDate: 'Sep 04', revenue: 682, paidPageVolume: 310, printedPageVolume: 305 },
    { date: '2026-09-06', displayDate: 'Sep 06', revenue: 840, paidPageVolume: 420, printedPageVolume: 415 },
    { date: '2026-09-08', displayDate: 'Sep 08', revenue: 310, paidPageVolume: 140, printedPageVolume: 138 },
    { date: '2026-09-10', displayDate: 'Sep 10', revenue: 760, paidPageVolume: 380, printedPageVolume: 375 },
    { date: '2026-09-12', displayDate: 'Sep 12', revenue: 890, paidPageVolume: 445, printedPageVolume: 440 },
  ],
  categoryBreakdown: [
    { category: 'Academic PDFs & Notes', pages: 2850, percentage: 59.8, color: '#10b981' },
    { category: 'Hall Tickets & Admit Cards', pages: 1120, percentage: 23.5, color: '#059669' },
    { category: 'Assignments & Reports', pages: 560, percentage: 11.8, color: '#34d399' },
    { category: 'Government & ID Proofs', pages: 232, percentage: 4.9, color: '#6ee7b7' },
  ],
  funnel: [
    { stage: 'Files Uploaded', count: 5100, percentage: 100, subtext: 'Upload success 100%' },
    { stage: 'Configured & Paid', count: 4821, percentage: 94.5, subtext: 'Payment conversion 94.5%' },
    { stage: 'Queued to CUPS', count: 4810, percentage: 94.3, subtext: 'Spool conversion 99.8%' },
    { stage: 'Physically Printed', count: 4762, percentage: 93.4, subtext: 'Final fulfillment 98.8%' },
  ],
  kioskPerformance: [
    { kioskName: 'MIMO 1 (Main Gate)', revenue: 7420, pages: 1850, successRate: 98.8 },
    { kioskName: 'MIMO 2 (Library)', revenue: 8200, pages: 2150, successRate: 97.8 },
    { kioskName: 'MIMO 3 (Cafeteria)', revenue: 2800, pages: 762, successRate: 98.8 },
  ],
};
