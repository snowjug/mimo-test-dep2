import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus,
  Trash2,
  FileText,
  Download,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Pencil,
  X,
  Receipt,
  TrendingUp,
  TrendingDown,
  IndianRupee,
  BookOpen,
  ArrowRight,
  Layers,
  Printer,
  Wifi,
  Zap,
  Package,
  Users,
  MoreHorizontal,
  BarChart3,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  FileSpreadsheet,
  Calendar,
  Briefcase,
  PieChart,
} from 'lucide-react';
import { inr } from '../../../lib/format';
import { insights } from '../../../services/insights.service';
import type { FinanceSheetResponse, FinanceExpenseItem } from '../../../types/insights.types';

/* ─── Types ──────────────────────────────────────────────────────────── */
type JournalEntryType = 'revenue' | 'expense';
type EntryStatus = 'draft' | 'approved' | 'rejected';
type PsrStatus = 'pending' | 'generated' | 'filed';

interface JournalEntry {
  id: string;
  date: string;
  type: JournalEntryType;
  category: string;
  description: string;
  amount: number;
  paidBy?: string;
  reference?: string;
  year?: number;
  monthKey?: string;
  monthName?: string;
  status: EntryStatus;
  isFromSheet?: boolean;
  notes?: string;
}

interface ExpenseReport {
  id: string;
  title: string;
  period: string;
  createdAt: string;
  entries: JournalEntry[];
  totalExpenses: number;
  status: EntryStatus;
  psrStatus: PsrStatus;
}

/* ─── Category config & color palette ────────────────────────────────── */
const CATEGORY_COLORS: Record<string, { color: string; icon: React.ReactNode }> = {
  'machine hardware': { color: 'bg-blue-100 text-blue-700', icon: <Layers className="w-3.5 h-3.5" /> },
  'developer & software': { color: 'bg-indigo-100 text-indigo-700', icon: <Briefcase className="w-3.5 h-3.5" /> },
  'machine components': { color: 'bg-purple-100 text-purple-700', icon: <Layers className="w-3.5 h-3.5" /> },
  'printing supplies': { color: 'bg-emerald-100 text-emerald-700', icon: <Printer className="w-3.5 h-3.5" /> },
  'professional services': { color: 'bg-amber-100 text-amber-700', icon: <FileText className="w-3.5 h-3.5" /> },
  'marketing & branding': { color: 'bg-pink-100 text-pink-700', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  'investments': { color: 'bg-violet-100 text-violet-700', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  'utilities & electrical': { color: 'bg-yellow-100 text-yellow-700', icon: <Zap className="w-3.5 h-3.5" /> },
  'events & culture': { color: 'bg-rose-100 text-rose-700', icon: <Users className="w-3.5 h-3.5" /> },
  'networking & internet': { color: 'bg-sky-100 text-sky-700', icon: <Wifi className="w-3.5 h-3.5" /> },
  'transportation & logistics': { color: 'bg-orange-100 text-orange-700', icon: <Package className="w-3.5 h-3.5" /> },
  'office & stationary': { color: 'bg-teal-100 text-teal-700', icon: <FileText className="w-3.5 h-3.5" /> },
  'mimo xpress': { color: 'bg-cyan-100 text-cyan-700', icon: <Package className="w-3.5 h-3.5" /> },
  'miscellaneous': { color: 'bg-slate-100 text-slate-700', icon: <MoreHorizontal className="w-3.5 h-3.5" /> },
};

const categoryConfig = (cat: string) => {
  const key = String(cat || '').trim().toLowerCase();
  if (key === 'revenue') {
    return { label: 'Revenue / Settlement', icon: <IndianRupee className="w-3.5 h-3.5" />, color: 'bg-emerald-100 text-emerald-700' };
  }
  return (
    CATEGORY_COLORS[key] ?? {
      color: 'bg-slate-100 text-slate-700',
      icon: <MoreHorizontal className="w-3.5 h-3.5" />,
    }
  );
};

const statusBadge = (s: EntryStatus, rawStatus?: string) => {
  if (s === 'approved') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-2.5 h-2.5" />{rawStatus || 'Approved'}</span>;
  if (s === 'rejected') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700"><AlertTriangle className="w-2.5 h-2.5" />Rejected</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700"><Clock className="w-2.5 h-2.5" />Draft</span>;
};

const psrBadge = (s: PsrStatus) => {
  if (s === 'filed') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-2.5 h-2.5" />PSR Filed</span>;
  if (s === 'generated') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700"><FileText className="w-2.5 h-2.5" />PSR Ready</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500"><Clock className="w-2.5 h-2.5" />Pending</span>;
};

/** Formats YYYY-MM-DD cleanly without local timezone shifts */
const formatIsoDate = (dateStr: string) => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || '—';
  const [year, month, day] = dateStr.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIndex = parseInt(month, 10) - 1;
  const monthName = monthNames[monthIndex] || month;
  return `${day} ${monthName} ${year}`;
};

/** Formats YYYY-MM to Month Year e.g. Oct 2026 */
const formatMonthLabel = (monthKey: string) => {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey;
  const [year, month] = monthKey.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIndex = parseInt(month, 10) - 1;
  return `${monthNames[monthIndex] || month} ${year}`;
};

/* ─── Component ──────────────────────────────────────────────────────── */
export const FinanceExpensesPage: React.FC = () => {
  type Tab = 'journal' | 'reports' | 'psr';
  const [activeTab, setActiveTab] = useState<Tab>('journal');

  // Sheet data & sync state
  const [sheetData, setSheetData] = useState<FinanceSheetResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Manual entries and reports state (starts empty)
  const [manualEntries, setManualEntries] = useState<JournalEntry[]>([]);
  const [reports, setReports] = useState<ExpenseReport[]>([]);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'revenue' | 'expense'>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');

  // New entry form state
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: 'expense' as JournalEntryType,
    category: 'Printing Supplies',
    description: '',
    amount: '',
    paidBy: 'Company',
    reference: '',
    notes: '',
  });

  /* ── Sync data from backend Google Sheets integration ── */
  const syncSpreadsheetData = useCallback(async (force = false) => {
    try {
      setIsSyncing(true);
      const data = await insights.financeSheet(force);
      setSheetData(data);
      setLastSyncedAt(data.lastSyncedAt || new Date().toISOString());
      setSyncError(data.syncError || null);
    } catch (err: any) {
      console.error('[FINANCE-SHEET-SYNC] Error fetching sheet data:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to connect to Google Sheets backend';
      setSyncError(msg);
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, []);

  // Initial load & automatic 5-minute background refresh
  useEffect(() => {
    syncSpreadsheetData(false);
    const interval = setInterval(() => {
      syncSpreadsheetData(false);
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [syncSpreadsheetData]);

  /* ── Convert spreadsheet expense items into journal entries ── */
  const spreadsheetEntries: JournalEntry[] = useMemo(() => {
    if (!sheetData?.expenses?.items) return [];
    return sheetData.expenses.items.map((item: FinanceExpenseItem) => ({
      id: item.id,
      date: item.date,
      type: 'expense',
      category: item.category,
      description: item.description,
      amount: item.amount,
      paidBy: item.paidBy,
      reference: item.reference,
      year: item.year,
      monthKey: item.monthKey,
      monthName: item.monthName,
      status: item.status,
      isFromSheet: true,
      notes: item.notes,
    }));
  }, [sheetData]);

  /* ── Combine spreadsheet entries with manual draft entries ── */
  const allEntries = useMemo(() => {
    const combined = [...spreadsheetEntries, ...manualEntries];
    return combined.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  }, [spreadsheetEntries, manualEntries]);

  /* ── Extract available month buckets from spreadsheet & manual records ── */
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    if (sheetData?.expenses?.monthlyTotals) {
      Object.keys(sheetData.expenses.monthlyTotals).forEach((m) => months.add(m));
    }
    manualEntries.forEach((e) => {
      if (e.date && e.date.length >= 7) months.add(e.date.slice(0, 7));
    });
    return Array.from(months).sort((a, b) => (b > a ? 1 : b < a ? -1 : 0));
  }, [sheetData, manualEntries]);

  /* ── Filtered entries based on Month & Type filters ── */
  const filteredEntries = useMemo(() => {
    return allEntries.filter((e) => {
      if (selectedYear !== 'all' && e.year && String(e.year) !== selectedYear) {
        return false;
      }
      if (selectedMonth !== 'all' && !e.date.startsWith(selectedMonth)) {
        return false;
      }
      if (filterType !== 'all' && e.type !== filterType) {
        return false;
      }
      return true;
    });
  }, [allEntries, selectedYear, selectedMonth, filterType]);

  /* ── Derived totals ── */
  const currentMonthExpenses = useMemo(() => {
    if (selectedMonth !== 'all') {
      return filteredEntries.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
    }
    return sheetData?.expenses?.totalExpenses ?? filteredEntries.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
  }, [selectedMonth, filteredEntries, sheetData]);

  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filteredEntries.filter((e) => e.type === 'expense').forEach((e) => {
      map[e.category] = (map[e.category] || 0) + e.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filteredEntries]);

  /* ── Add manual journal entry ── */
  const addEntry = () => {
    if (!form.description || !form.amount) return;
    const entry: JournalEntry = {
      id: `manual-je-${Date.now()}`,
      date: form.date,
      type: form.type,
      category: form.category,
      description: form.description,
      amount: parseFloat(form.amount) || 0,
      paidBy: form.paidBy || 'Company',
      reference: form.reference || undefined,
      notes: form.notes || undefined,
      status: 'draft',
      isFromSheet: false,
    };
    setManualEntries((prev) => [entry, ...prev]);
    setForm({
      date: new Date().toISOString().slice(0, 10),
      type: 'expense',
      category: 'Printing Supplies',
      description: '',
      amount: '',
      paidBy: 'Company',
      reference: '',
      notes: '',
    });
    setShowAddEntry(false);
  };

  const deleteEntry = (id: string) => {
    setManualEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const approveEntry = (id: string) => {
    setManualEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: 'approved' } : e))
    );
  };

  /* ── Generate Expense Report from entries ── */
  const generateReport = () => {
    const now = new Date();
    const period = selectedMonth !== 'all' ? formatMonthLabel(selectedMonth) : now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const expEntries = filteredEntries.filter((e) => e.type === 'expense');
    const report: ExpenseReport = {
      id: `er-${Date.now()}`,
      title: `${period} Expense Report`,
      period,
      createdAt: now.toISOString().slice(0, 10),
      entries: expEntries,
      totalExpenses: expEntries.reduce((s, e) => s + e.amount, 0),
      status: 'draft',
      psrStatus: 'pending',
    };
    setReports((prev) => [report, ...prev]);
    setActiveTab('reports');
  };

  /* ── Generate PSR ── */
  const generatePsr = (reportId: string) => {
    setReports((prev) =>
      prev.map((r) => (r.id === reportId ? { ...r, psrStatus: 'generated', status: 'approved' } : r))
    );
  };

  /* ── CSV Export ── */
  const exportCsv = () => {
    const rows = [
      [
        'Date',
        'Type',
        'Category',
        'Description',
        'Paid By',
        'Amount (INR)',
        'Status',
        'Reference',
        'Source',
      ],
      ...filteredEntries.map((e) => [
        e.date,
        e.type,
        e.category,
        e.description,
        e.paidBy || 'Company',
        e.amount.toFixed(2),
        e.status,
        e.reference || '',
        e.isFromSheet ? 'Google Sheets' : 'Manual Entry',
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `MIMO_Expense_Export_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-5 animate-fadeIn pb-12">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">Revenue &amp; Expense Tracker</h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Sheets Sync
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Operational expenses and founder investments synchronized automatically from the MIMO Google Sheet.
          </p>
        </div>
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <button
            type="button"
            onClick={() => syncSpreadsheetData(true)}
            disabled={isSyncing}
            className="flex-1 sm:flex-initial flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-all cursor-pointer disabled:opacity-60"
            title="Force immediate refresh from Google Sheets"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="flex-1 sm:flex-initial flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            CSV
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAddEntry(true);
            }}
            className="flex-1 sm:flex-initial flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#093765] hover:bg-[#062A4E] text-white px-3.5 text-xs font-bold shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Expense Entry
          </button>
        </div>
      </div>

      {/* Sync Status Banner */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900 text-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-emerald-400 shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold text-white">Google Sheet Source of Truth</p>
              <a
                href="https://docs.google.com/spreadsheets/d/18ZDXG0nQZ6z7kUx7lShOFyOQ9gNOq2nc3iXfrYLrlfI/edit?usp=drivesdk"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-indigo-200 font-medium underline"
              >
                View Sheet <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-[11px] text-slate-400">
              Auto-refreshes every 5 mins · {sheetData?.expenses?.count !== undefined ? `${sheetData.expenses.count} expense entries` : 'Expenses'} &amp; {sheetData?.journal?.count !== undefined ? `${sheetData.journal.count} journal ledgers` : 'journal ledgers'} loaded
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto text-[11px] font-mono text-slate-300">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>Last sync: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Pending...'}</span>
          {sheetData?.cached && <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-slate-300">Cached</span>}
        </div>
      </div>

      {/* Sync Warning if Refresh Failed */}
      {syncError && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="font-bold">Sync Notice</p>
            <p className="text-[11px] text-amber-800">{syncError}</p>
          </div>
        </div>
      )}

      {/* Pipeline Guide Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50 via-violet-50 to-purple-50 border border-indigo-200/60 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-indigo-700 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              Pipeline:
            </span>
            {[
              { label: 'Expense Ledgers', icon: <Pencil className="w-3 h-3" /> },
              { label: 'Expense Report', icon: <FileText className="w-3 h-3" /> },
              { label: 'PSR Filing', icon: <Receipt className="w-3 h-3" /> },
            ].map((step, i) => (
              <React.Fragment key={step.label}>
                <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 text-[11px]">
                  {step.icon}
                  {step.label}
                </span>
                {i < 2 && <ArrowRight className="w-3 h-3 text-indigo-400" />}
              </React.Fragment>
            ))}
          </div>
          <button
            type="button"
            onClick={generateReport}
            className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold text-[11px] hover:bg-indigo-700 cursor-pointer transition-all self-start sm:self-auto shadow-xs"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            Generate Report
          </button>
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {/* Total Operational Expenses */}
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200/60 shadow-2xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase text-rose-700">
              Total Expenses (Verified)
            </span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black font-mono text-rose-800">
            {isLoading ? '...' : inr(currentMonthExpenses)}
          </p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-rose-800/80">
            <span>{selectedMonth !== 'all' ? formatMonthLabel(selectedMonth) : 'All-Time Logged'}</span>
            <span className="font-semibold text-[10px] bg-rose-200/60 text-rose-800 px-1.5 py-0.5 rounded">Google Sheets</span>
          </div>
        </div>

        {/* 2026 Year-to-Date Expenses */}
        <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200/60 shadow-2xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase text-indigo-700">
              2026 Expenses (YTD)
            </span>
            <Layers className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black font-mono text-indigo-800">
            {isLoading ? '...' : sheetData?.expenses?.totalExpenses2026 !== undefined ? inr(sheetData.expenses.totalExpenses2026) : '—'}
          </p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-indigo-800/80">
            <span>{sheetData?.expenses?.items ? `${sheetData.expenses.items.filter((i) => i.year === 2026).length} Line Items (Jan–Oct)` : '2026 Line Items'}</span>
            <span className="font-semibold text-[10px] bg-indigo-200/60 text-indigo-800 px-1.5 py-0.5 rounded">2026 Report</span>
          </div>
        </div>

        {/* 2025 Historical Expenses */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase text-slate-600">
              2025 Expenses (Historical)
            </span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-xl sm:text-2xl font-black font-mono text-slate-700">
            {isLoading ? '...' : sheetData?.expenses?.totalExpenses2025 !== undefined ? inr(sheetData.expenses.totalExpenses2025) : '—'}
          </p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>{sheetData?.expenses?.items ? `${sheetData.expenses.items.filter((i) => i.year === 2025).length} Line Items (Mar–Dec)` : '2025 Line Items'}</span>
            <span className="font-semibold text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">2025 Report</span>
          </div>
        </div>

        {/* Founder Capital Investment */}
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200/60 shadow-2xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase text-emerald-700">
              Total Founder Investment
            </span>
            <PieChart className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl sm:text-2xl font-black font-mono text-emerald-800">
            {isLoading ? '...' : sheetData?.psr?.totalInvestment !== undefined ? inr(sheetData.psr.totalInvestment) : '—'}
          </p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-emerald-800/80">
            <span>PSR Capital Structure</span>
            <span className="font-semibold text-[10px] bg-emerald-200/60 text-emerald-800 px-1.5 py-0.5 rounded">Vishal &amp; Ankit</span>
          </div>
        </div>
      </div>

      {/* Expense category breakdown */}
      {expenseByCategory.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs min-w-0 overflow-hidden">
          <h3 className="text-xs font-bold text-slate-700 mb-3 uppercase tracking-wider">
            Operational Spend Breakdown by Category
          </h3>
          <div className="space-y-2">
            {expenseByCategory.slice(0, 8).map(([cat, amt]) => {
              const cfg = categoryConfig(cat);
              const total = currentMonthExpenses || 1;
              const pct = (amt / total) * 100;
              return (
                <div key={cat} className="flex items-center gap-2 sm:gap-3 text-xs">
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold ${cfg.color} min-w-[140px] sm:min-w-[160px] truncate`}>
                    {cfg.icon}
                    {cat}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-700 min-w-[75px] text-right">{inr(amt)}</span>
                  <span className="text-[10px] sm:text-[11px] text-slate-400 min-w-[32px] text-right">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Inner Tab Navigation */}
      <div className="grid grid-cols-3 sm:flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 w-full sm:w-fit">
        {([['journal', 'Expense Ledgers'], ['reports', 'Expense Reports'], ['psr', 'Founder Capital & PSR']] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTab(t)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center ${
              activeTab === t ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ─── Expense Ledgers Tab ─── */}
      {activeTab === 'journal' && (
        <div className="space-y-3">
          {/* Add Entry Form Modal/Card */}
          {showAddEntry && (
            <div className="p-5 rounded-2xl bg-white border border-indigo-200 shadow-md">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">New Expense Ledger Entry</h3>
                  <p className="text-[11px] text-slate-400">Log operational expenses locally into the audit pipeline.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddEntry(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Category</label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="e.g. Printing Supplies"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Paid By</label>
                  <input
                    type="text"
                    value={form.paidBy}
                    onChange={(e) => setForm((f) => ({ ...f, paidBy: e.target.value }))}
                    placeholder="e.g. Company, Vishal, Ankit"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Description *</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="e.g. A4 Paper restock – 5 reams (Brother HL)"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Invoice / Ref No.</label>
                  <input
                    type="text"
                    value={form.reference}
                    onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                    placeholder="INV-001"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Notes</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Optional notes"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setShowAddEntry(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={addEntry}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer transition-all"
                >
                  Add Entry
                </button>
              </div>
            </div>
          )}

          {/* Table Card */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
            {/* Filters Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                {/* Year Filter */}
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100">
                  {(['all', '2026', '2025'] as const).map((y) => (
                    <button
                      key={y}
                      type="button"
                      onClick={() => setSelectedYear(y)}
                      className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                        selectedYear === y ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {y === 'all' ? 'All Years' : y}
                    </button>
                  ))}
                </div>

                {/* Month Filter */}
                {availableMonths.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="all">All Months</option>
                      {availableMonths.map((m) => (
                        <option key={m} value={m}>
                          {formatMonthLabel(m)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span>{filteredEntries.length} records shown</span>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold text-[10px] uppercase">
                    {['Date', 'Category', 'Description', 'Paid By', 'Reference', 'Amount (INR)', 'Source', 'Actions'].map(
                      (h) => (
                        <th key={h} className="text-left py-2.5 px-3 whitespace-nowrap">
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {isLoading && filteredEntries.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-xs font-semibold text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <RefreshCw className="w-5 h-5 text-indigo-500 animate-spin" />
                          <span>Loading spreadsheet data...</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {!isLoading && filteredEntries.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-xs font-semibold text-slate-400">
                        No financial records found for the selected filter.
                      </td>
                    </tr>
                  )}
                  {filteredEntries.map((e) => {
                    const cfg = categoryConfig(e.category);
                    return (
                      <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">
                          {formatIsoDate(e.date)}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${cfg.color} w-fit`}>
                            {cfg.icon}
                            {e.category}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-800 font-semibold max-w-[280px]">
                          <p className="truncate">{e.description}</p>
                          {e.notes && <p className="text-[10px] text-slate-400 truncate mt-0.5">{e.notes}</p>}
                        </td>
                        <td className="py-3 px-3 text-slate-600 whitespace-nowrap text-[11px]">
                          {e.paidBy || 'Company'}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-500 whitespace-nowrap text-[11px]">
                          {e.reference || '—'}
                        </td>
                        <td className="py-3 px-3 font-mono font-black text-rose-700 whitespace-nowrap">
                          -{inr(e.amount)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {e.isFromSheet ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              Sheet Verified
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              Manual Draft
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {!e.isFromSheet ? (
                            <div className="flex items-center gap-1">
                              {e.status === 'draft' && (
                                <button
                                  type="button"
                                  onClick={() => approveEntry(e.id)}
                                  title="Approve Draft"
                                  className="p-1 text-slate-400 hover:text-emerald-600 cursor-pointer transition-colors"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => deleteEntry(e.id)}
                                title="Delete Entry"
                                className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-300 font-mono">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── Expense Reports Tab ─── */}
      {activeTab === 'reports' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-900">
                {reports.length} expense report{reports.length !== 1 ? 's' : ''} generated
              </p>
              <p className="text-[11px] text-slate-400">
                Reports aggregate operational expenses into periodic filing drafts.
              </p>
            </div>
            <button
              type="button"
              onClick={generateReport}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer transition-all shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Generate New Report
            </button>
          </div>

          {reports.length === 0 && (
            <div className="py-16 text-center text-xs font-semibold text-slate-400 bg-white rounded-2xl border border-slate-200">
              <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-600 font-bold mb-1">No Custom Expense Reports Generated Yet</p>
              <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                Filter your desired period in the Expense Ledgers and click "Generate Report" above to compile a periodic summary.
              </p>
            </div>
          )}

          {reports.map((r) => (
            <div key={r.id} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-bold text-sm text-slate-900">{r.title}</h3>
                    {statusBadge(r.status)}
                    {psrBadge(r.psrStatus)}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Created: {r.createdAt} · {r.entries.length} expense line items
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] text-slate-400 uppercase font-bold">Total Expenses</p>
                  <p className="text-lg font-black font-mono text-rose-700">-{inr(r.totalExpenses)}</p>
                </div>
              </div>

              {r.entries.length > 0 ? (
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-bold text-[10px] uppercase">
                        {['Date', 'Category', 'Description', 'Paid By', 'Amount'].map((h) => (
                          <th key={h} className="text-left py-2 px-3 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {r.entries.map((e) => {
                        const cfg = categoryConfig(e.category);
                        return (
                          <tr key={e.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">{formatIsoDate(e.date)}</td>
                            <td className="py-2.5 px-3">
                              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${cfg.color} w-fit`}>
                                {cfg.icon}
                                {e.category}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 font-semibold max-w-[200px] truncate">{e.description}</td>
                            <td className="py-2.5 px-3 text-slate-500">{e.paidBy || 'Company'}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-rose-700 whitespace-nowrap">-{inr(e.amount)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 font-black text-slate-900 bg-slate-50">
                        <td className="py-2.5 px-3" colSpan={4}>
                          Total
                        </td>
                        <td className="py-2.5 px-3 font-mono text-rose-700">-{inr(r.totalExpenses)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <p className="py-6 text-center text-xs text-slate-400">
                  No expense line items included in this draft.
                </p>
              )}

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                <p className="text-[11px] text-slate-400">
                  {r.psrStatus === 'pending' && 'Approve this report and generate a PSR for filing.'}
                  {r.psrStatus === 'generated' && 'PSR generated — ready for periodic filing.'}
                  {r.psrStatus === 'filed' && 'PSR filed with finance records.'}
                </p>
                <div className="flex items-center gap-2">
                  {r.psrStatus === 'pending' && (
                    <button
                      type="button"
                      onClick={() => generatePsr(r.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-700 cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                      Generate PSR
                    </button>
                  )}
                  {r.psrStatus === 'generated' && (
                    <button
                      type="button"
                      onClick={() =>
                        setReports((prev) =>
                          prev.map((rr) => (rr.id === r.id ? { ...rr, psrStatus: 'filed' } : rr))
                        )
                      }
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Mark as Filed
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── PSR Automation Tab ─── */}
      {activeTab === 'psr' && (
        <div className="space-y-4">
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <h3 className="font-bold text-sm text-slate-900 mb-1">Founder Capital Structure &amp; Profit Sharing Ratio (PSR)</h3>
            <p className="text-xs text-slate-400 mb-4">
              Synchronized directly from the Google Sheet PSR tab (`gid=1895235794`).
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {sheetData?.psr?.founders?.map((f) => {
                const founderName = f.name || (f as any).founder || 'Founder';
                const ownership = typeof f.ownershipPct === 'number' ? f.ownershipPct : (typeof (f as any).ownershipPercentage === 'number' ? (f as any).ownershipPercentage : null);
                const profitShare = typeof f.profitSharePct === 'number' ? f.profitSharePct : (typeof (f as any).sharePercentage === 'number' ? (f as any).sharePercentage : ownership);
                const totalInvested = typeof f.totalInvestment === 'number' ? f.totalInvestment : (typeof (f as any).totalInvested === 'number' ? (f as any).totalInvested : 0);
                const netInvested = typeof f.netInvestment === 'number' ? f.netInvestment : totalInvested;
                const withdrawn = Math.max(0, totalInvested - netInvested);

                return (
                  <div key={founderName} className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-800 text-sm">{founderName}</span>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
                        {profitShare !== null ? `${profitShare.toFixed(2)}% Profit Share` : '—'}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Equity Ownership:</span>
                        <span className="font-mono font-semibold">{ownership !== null ? `${ownership.toFixed(2)}%` : '—'}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Total Invested:</span>
                        <span className="font-mono font-semibold">{inr(totalInvested)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Withdrawn:</span>
                        <span className="font-mono font-semibold">{inr(withdrawn)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-200">
                        <span>Net Investment:</span>
                        <span className="font-mono text-emerald-700">{inr(netInvested)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200/60 flex flex-col justify-between">
                <span className="text-xs font-bold uppercase text-emerald-700">Total Net Capital Pool</span>
                <p className="text-2xl font-black font-mono text-emerald-900 mt-2">
                  {sheetData?.psr?.totalInvestment !== undefined ? inr(sheetData.psr.totalInvestment) : '—'}
                </p>
                <span className="text-[11px] text-emerald-700 mt-1">100% Equity Allocated</span>
              </div>
            </div>

            {/* PSR Live Format Preview */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-[#093765] text-white">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-indigo-300" />
                <h3 className="font-bold text-sm">PSR Financial Summary Format</h3>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-4 font-mono text-[11px] text-slate-300 space-y-1">
                <p className="font-bold text-white">MIMO OPERATIONS — PERIODIC STATUS REPORT</p>
                <p className="text-slate-400">
                  Source: Google Sheets (ID: 18ZDXG0nQZ6z7kUx7lShOFyOQ9gNOq2nc3iXfrYLrlfI)
                </p>
                <p className="mt-2 text-slate-400">────────────────────────────────────────</p>
                <p className="font-bold text-slate-200">1. CAPITAL &amp; EQUITY ALLOCATION</p>
                {sheetData?.psr?.founders?.map((f) => {
                  const founderName = f.name || (f as any).founder || 'Founder';
                  const psrRatio = typeof f.profitSharePct === 'number' ? f.profitSharePct : (typeof (f as any).sharePercentage === 'number' ? (f as any).sharePercentage : 0);
                  const netInvested = typeof f.netInvestment === 'number' ? f.netInvestment : (f.totalInvestment ?? 0);
                  return (
                    <p key={founderName} className="pl-4">
                      {founderName.padEnd(16, ' ')} PSR: {psrRatio.toFixed(2)}% | Net Capital: {inr(netInvested)}
                    </p>
                  );
                })}
                <p className="pl-4 font-bold text-emerald-300">
                  Total Capital Pool: {sheetData?.psr?.totalInvestment !== undefined ? inr(sheetData.psr.totalInvestment) : '—'}
                </p>
                <p className="mt-2 text-slate-400">────────────────────────────────────────</p>
                <p className="font-bold text-slate-200">2. EXPENDITURE OVERVIEW</p>
                <p className="pl-4">2026 YTD Operational Expenses:  {sheetData?.expenses?.totalExpenses2026 !== undefined ? inr(sheetData.expenses.totalExpenses2026) : '—'}</p>
                <p className="pl-4">2025 Historical Expenses:       {sheetData?.expenses?.totalExpenses2025 !== undefined ? inr(sheetData.expenses.totalExpenses2025) : '—'}</p>
                <p className="pl-4 font-bold text-rose-300">
                  All-Time Total Expenses:        {sheetData?.expenses?.totalExpenses !== undefined ? inr(sheetData.expenses.totalExpenses) : '—'}
                </p>
                <p className="mt-2 text-slate-400">────────────────────────────────────────</p>
                <p className="font-bold text-amber-300">
                  Status: Reconciled with Google Sheet Live Data
                </p>
                <p className="mt-2 text-slate-500 text-[10px]">
                  Last Synced: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString('en-IN') : 'Pending'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
