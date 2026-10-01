import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Analytics } from '../types/insights.types';
import type { AdminUserItem } from '../types/user.types';
import { inr, int, pct } from './format';

/**
 * Generates an executive, branded PDF report for MIMO Analytics & Reports.
 */
export function exportAnalyticsPdf(a: Analytics, rangeDescription: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // ── HEADER & BRANDING ──────────────────────────────────────────
  doc.setFillColor(9, 55, 101); // #093765 MIMO Navy
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('MIMO', 14, 13);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 220, 245);
  doc.text('EXECUTIVE ANALYTICS & REPORTS', 14, 21);

  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 13, { align: 'right' });
  doc.text(`Period: ${rangeDescription}`, pageWidth - 14, 21, { align: 'right' });

  // ── KEY METRICS SUMMARY CARDS ──────────────────────────────────
  let y = 36;
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Performance Summary', 14, y);
  y += 5;

  const cardWidth = (pageWidth - 28 - 9) / 4;
  const cards = [
    { label: 'TOTAL REVENUE', value: inr(a.current.revenue) },
    { label: 'PAGES PRINTED', value: `${int(a.current.pages)} pgs` },
    { label: 'PRINT SUCCESS', value: pct(a.current.successRate) },
    { label: 'AVG ORDER VALUE', value: inr(a.current.avgOrderValue) },
  ];

  cards.forEach((c, idx) => {
    const x = 14 + idx * (cardWidth + 3);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, cardWidth, 18, 2, 2, 'FD');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(c.label, x + 4, y + 6);

    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(c.value, x + 4, y + 14);
  });

  y += 24;

  // ── MACHINES BREAKDOWN TABLE ───────────────────────────────────
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Kiosk Fleet Breakdown', 14, y);
  y += 2;

  const kioskRows = a.byKiosk.map((k) => [
    k.name,
    k.kioskId,
    int(k.pages),
    inr(k.revenue),
    String(k.failed),
    k.pages > 0 ? pct(Math.max(0, (k.pages - k.failed) / k.pages * 100)) : '100%',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Machine Name', 'Kiosk ID', 'Pages Printed', 'Revenue Generated', 'Failures', 'Success Rate']],
    body: kioskRows,
    theme: 'grid',
    headStyles: { fillColor: [9, 55, 101], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: [51, 65, 85] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  // @ts-expect-error autoTable adds lastAutoTable to jsPDF instance
  y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : y + 40;

  // ── PERIOD TIME-SERIES TABLE ───────────────────────────────────
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Timeline Activity & Revenue Stream', 14, y);
  y += 2;

  const seriesRows = a.series.map((s) => [
    s.key,
    inr(s.revenue),
    inr(s.refunds),
    int(s.orders),
    int(s.jobs),
    int(s.pages),
    int(s.failed),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Period / Date', 'Revenue', 'Refunds', 'Orders', 'Jobs', 'Pages', 'Failed']],
    body: seriesRows,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7.5, textColor: [51, 65, 85] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  // ── FOOTER ─────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'MIMO Confidential · Automated Platform Analytics',
      14,
      doc.internal.pageSize.getHeight() - 8
    );
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - 14,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'right' }
    );
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  doc.save(`mimo-analytics-report_${dateStr}.pdf`);
}

/**
 * Generates an executive, branded PDF report of Customers / Users.
 */
export function exportUsersPdf(users: AdminUserItem[]) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // ── HEADER & BRANDING ──────────────────────────────────────────
  doc.setFillColor(9, 55, 101); // #093765 MIMO Navy
  doc.rect(0, 0, pageWidth, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('MIMO', 14, 12);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 220, 245);
  doc.text('CUSTOMER INTELLIGENCE & ROSTER REPORT', 14, 20);

  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 12, { align: 'right' });
  doc.text(`Total Customers: ${users.length}`, pageWidth - 14, 20, { align: 'right' });

  // ── METRICS SUMMARY ───────────────────────────────────────────
  let y = 34;
  const paying = users.filter((u) => u.isPayingCustomer).length;
  const totalRevenue = users.reduce((acc, u) => acc + (u.totalSpend || 0), 0);
  const totalPages = users.reduce((acc, u) => acc + (u.pagesPrinted || 0), 0);

  const cardWidth = (pageWidth - 28 - 9) / 4;
  const cards = [
    { label: 'REGISTERED USERS', value: String(users.length) },
    { label: 'PAYING CUSTOMERS', value: `${paying} (${users.length ? Math.round((paying / users.length) * 100) : 0}%)` },
    { label: 'TOTAL SPEND (INR)', value: inr(totalRevenue) },
    { label: 'TOTAL PAGES PRINTED', value: `${int(totalPages)} pgs` },
  ];

  cards.forEach((c, idx) => {
    const x = 14 + idx * (cardWidth + 3);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, cardWidth, 16, 2, 2, 'FD');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(c.label, x + 4, y + 5.5);

    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(c.value, x + 4, y + 12.5);
  });

  y += 22;

  // ── CUSTOMERS TABLE ───────────────────────────────────────────
  const userRows = users.map((u, idx) => [
    String(idx + 1),
    u.username || 'Anonymous',
    u.email || '—',
    u.mobileNumber || '—',
    u.isPayingCustomer ? 'Paying Customer' : 'Free User',
    String(u.orderCount || 0),
    String(u.pagesPrinted || 0),
    inr(u.totalSpend || 0),
    u.joinedAt ? new Date(u.joinedAt).toLocaleDateString() : '—',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Customer Name', 'Email', 'Mobile', 'Type', 'Orders', 'Pages', 'Total Spend', 'Joined Date']],
    body: userRows,
    theme: 'grid',
    headStyles: { fillColor: [9, 55, 101], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { fontSize: 7, textColor: [51, 65, 85] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  // ── FOOTER ─────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'MIMO Confidential · Customer Roster & Intelligence Report',
      14,
      doc.internal.pageSize.getHeight() - 8
    );
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - 14,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'right' }
    );
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  doc.save(`mimo-customers-roster_${dateStr}.pdf`);
}

/**
 * Generates an executive, CFO-ready PDF financial report for MIMO Finance.
 */
export function exportFinancePdf(
  a: Analytics,
  rangeDescription: string,
  extra: {
    totalGross: number;
    totalRefunded: number;
    netRevenue: number;
    estimatedCogs: number;
    grossProfit: number;
    grossMarginPct: number;
    refundRequestsCount: number;
  }
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // ── HEADER & BRANDING ──────────────────────────────────────────
  doc.setFillColor(9, 55, 101); // #093765 MIMO Navy
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('MIMO', 14, 13);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 220, 245);
  doc.text('EXECUTIVE FINANCIAL & OPERATING STATEMENT', 14, 21);

  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 13, { align: 'right' });
  doc.text(`Period: ${rangeDescription}`, pageWidth - 14, 21, { align: 'right' });

  // ── KEY FINANCIAL KPI CARDS ────────────────────────────────────
  let y = 36;
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Financial KPI Overview', 14, y);
  y += 5;

  const cardWidth = (pageWidth - 28 - 9) / 4;
  const cards = [
    { label: 'GROSS BILLINGS', value: inr(extra.totalGross) },
    { label: 'REFUNDS DEDUCTED', value: inr(extra.totalRefunded) },
    { label: 'NET REALIZED REV', value: inr(extra.netRevenue) },
    { label: 'GROSS MARGIN %', value: `${extra.grossMarginPct.toFixed(1)}%` },
  ];

  cards.forEach((c, idx) => {
    const x = 14 + idx * (cardWidth + 3);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, cardWidth, 18, 2, 2, 'FD');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(c.label, x + 4, y + 6);

    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(c.value, x + 4, y + 14);
  });

  y += 24;

  // ── PROFIT & LOSS STATEMENT ────────────────────────────────────
  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59);
  doc.text('Operating Profit & Loss Breakdown', 14, y);
  y += 4;

  const pnlRows = [
    ['Gross Customer Billings', inr(extra.totalGross), '100.0%'],
    ['Less: Refunds & Dispute Reversals', `-${inr(extra.totalRefunded)}`, `${extra.totalGross > 0 ? ((extra.totalRefunded / extra.totalGross) * 100).toFixed(1) : 0}%`],
    ['Net Operating Revenue', inr(extra.netRevenue), `${extra.totalGross > 0 ? ((extra.netRevenue / extra.totalGross) * 100).toFixed(1) : 100}%`],
    ['Estimated Consumables COGS (Paper + Toner)', `-${inr(extra.estimatedCogs)}`, `${extra.netRevenue > 0 ? ((extra.estimatedCogs / extra.netRevenue) * 100).toFixed(1) : 0}%`],
    ['Estimated Gross Profit', inr(extra.grossProfit), `${extra.grossMarginPct.toFixed(1)}%`],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Line Item', 'Amount (INR)', '% of Revenue']],
    body: pnlRows,
    theme: 'grid',
    headStyles: { fillColor: [9, 55, 101], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7.5, textColor: [51, 65, 85] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // ── KIOSK REVENUE & PRINT MODE BREAKDOWN ────────────────────────
  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59);
  doc.text('Kiosk Revenue & Unit Economics', 14, y);
  y += 4;

  const kioskRows = (a.byKiosk || []).map((k) => [
    k.name || k.kioskId,
    k.kioskId,
    String(k.completed || 0),
    `${int(k.pages || 0)} pgs`,
    inr(k.revenue || 0),
    extra.totalGross > 0 ? `${Math.round(((k.revenue || 0) / extra.totalGross) * 100)}%` : '0%',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Machine Name', 'Terminal ID', 'Successful Prints', 'Total Pages', 'Gross Revenue', 'Share']],
    body: kioskRows,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7.5, textColor: [51, 65, 85] },
    margin: { left: 14, right: 14 },
  });

  // ── FOOTER ─────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'MIMO Confidential · Executive Financial & Audit Statement',
      14,
      doc.internal.pageSize.getHeight() - 8
    );
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - 14,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'right' }
    );
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  doc.save(`mimo-financial-statement_${dateStr}.pdf`);
}
