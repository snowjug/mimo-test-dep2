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
  PieChart as PieIcon,
  Eye,
  Search,
  Scale,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { inr } from '../../../lib/format';
import api from '../../../api';
import { insights } from '../../../services/insights.service';
import type { FinanceSheetResponse, FinanceExpenseItem } from '../../../types/insights.types';

/* ─── Types ──────────────────────────────────────────────────────────── */
type JournalEntryType = 'revenue' | 'expense';
type EntryStatus = 'draft' | 'approved' | 'rejected';
type PsrStatus = 'pending' | 'generated' | 'filed';
type LedgerViewMode = 'register' | 'ind_as_journal';

export interface JournalEntry {
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

export interface ExpenseReport {
  id: string;
  title: string;
  period: string;
  monthKey: string;
  createdAt: string;
  entries: JournalEntry[];
  totalExpenses: number;
  status: EntryStatus;
  psrStatus: PsrStatus;
}

/* ─── Standard Information Sheet Categories ──────────────────────────── */
export const EXPENSE_CATEGORIES = [
  'Printing Supplies',
  'Machine Components',
  'Machine Hardware',
  'Developer & Software',
  'Professional Services',
  'Marketing & Branding',
  'Utilities & Electrical',
  'Events & Culture',
  'Networking & Internet',
  'Transportation & Logistics',
  'Office & Stationary',
  'Mimo Xpress',
  'Investments',
  'Miscellaneous',
] as const;

export const PAID_BY_OPTIONS = [
  'Company',
  'Ankit Patel',
  'V Vishal',
] as const;

/* ─── Color Palette for Categories & Charts ─────────────────────────── */
const CATEGORY_COLORS: Record<string, { color: string; hex: string; icon: React.ReactNode }> = {
  'printing supplies': { color: 'bg-emerald-100 text-emerald-700', hex: '#10b981', icon: <Printer className="w-3.5 h-3.5" /> },
  'machine components': { color: 'bg-purple-100 text-purple-700', hex: '#8b5cf6', icon: <Layers className="w-3.5 h-3.5" /> },
  'machine hardware': { color: 'bg-blue-100 text-blue-700', hex: '#3b82f6', icon: <Layers className="w-3.5 h-3.5" /> },
  'developer & software': { color: 'bg-indigo-100 text-indigo-700', hex: '#6366f1', icon: <Briefcase className="w-3.5 h-3.5" /> },
  'professional services': { color: 'bg-amber-100 text-amber-700', hex: '#f59e0b', icon: <FileText className="w-3.5 h-3.5" /> },
  'marketing & branding': { color: 'bg-pink-100 text-pink-700', hex: '#ec4899', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  'utilities & electrical': { color: 'bg-yellow-100 text-yellow-700', hex: '#eab308', icon: <Zap className="w-3.5 h-3.5" /> },
  'events & culture': { color: 'bg-rose-100 text-rose-700', hex: '#f43f5e', icon: <Users className="w-3.5 h-3.5" /> },
  'networking & internet': { color: 'bg-sky-100 text-sky-700', hex: '#0284c7', icon: <Wifi className="w-3.5 h-3.5" /> },
  'transportation & logistics': { color: 'bg-orange-100 text-orange-700', hex: '#f97316', icon: <Package className="w-3.5 h-3.5" /> },
  'office & stationary': { color: 'bg-teal-100 text-teal-700', hex: '#14b8a6', icon: <FileText className="w-3.5 h-3.5" /> },
  'mimo xpress': { color: 'bg-cyan-100 text-cyan-700', hex: '#06b6d4', icon: <Package className="w-3.5 h-3.5" /> },
  'investments': { color: 'bg-violet-100 text-violet-700', hex: '#7c3aed', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  'miscellaneous': { color: 'bg-slate-100 text-slate-700', hex: '#64748b', icon: <MoreHorizontal className="w-3.5 h-3.5" /> },
};

const CHART_PALETTE = [
  '#10b981', '#6366f1', '#f59e0b', '#ec4899', '#8b5cf6',
  '#0284c7', '#f43f5e', '#14b8a6', '#f97316', '#3b82f6',
];

const categoryConfig = (cat: string) => {
  const key = String(cat || '').trim().toLowerCase();
  return (
    CATEGORY_COLORS[key] ?? {
      color: 'bg-slate-100 text-slate-700',
      hex: '#64748b',
      icon: <MoreHorizontal className="w-3.5 h-3.5" />,
    }
  );
};

/* ─── Indian Accounting Standards (Ind AS) Journal Entry Generator ─── */
interface IndAsEntry {
  debitAccount: string;
  creditAccount: string;
  debitAmount: number;
  creditAmount: number;
  narration: string;
  voucherNo: string;
  lf: string;
  ruleExplanation: string;
}

const toIndAsJournalEntry = (entry: JournalEntry): IndAsEntry => {
  const cat = String(entry.category || '').toLowerCase().trim();
  let debitAccount = 'General & Miscellaneous Operational Expense A/c';

  if (cat.includes('printing supplies')) debitAccount = 'Printing Consumables & Paper Stock A/c';
  else if (cat.includes('machine hardware')) debitAccount = 'Plant & Machinery (Kiosks) Capital A/c';
  else if (cat.includes('machine components')) debitAccount = 'Machine Maintenance, Spares & Repairs A/c';
  else if (cat.includes('developer') || cat.includes('software')) debitAccount = 'Software Licensing & Development A/c';
  else if (cat.includes('professional services')) debitAccount = 'Legal & Professional Charges A/c';
  else if (cat.includes('marketing') || cat.includes('branding')) debitAccount = 'Advertising & Brand Promotion A/c';
  else if (cat.includes('utilities') || cat.includes('electrical')) debitAccount = 'Electricity & Power Utility Charges A/c';
  else if (cat.includes('events') || cat.includes('culture')) debitAccount = 'Staff Welfare & Corporate Events A/c';
  else if (cat.includes('networking') || cat.includes('internet')) debitAccount = 'Internet & Communication Bandwidth A/c';
  else if (cat.includes('transportation') || cat.includes('logistics')) debitAccount = 'Freight Inward, Logistics & Conveyance A/c';
  else if (cat.includes('office') || cat.includes('stationary')) debitAccount = 'Printing & Stationery Consumables A/c';
  else if (cat.includes('mimo xpress')) debitAccount = 'Courier, Dispatch & Delivery Charges A/c';
  else if (cat.includes('investments')) debitAccount = 'Capital Assets / Founder Equity Asset A/c';

  const paid = String(entry.paidBy || '').toLowerCase().trim();
  let creditAccount = 'To HDFC Current Bank Account (Real A/c - Funds Outflow)';
  let ruleExplanation = 'Nominal A/c: Dr. all expenses & losses | Real A/c: Cr. what goes out (Bank)';

  if (paid.includes('ankit')) {
    creditAccount = 'To Partner Current A/c - Ankit Patel (Personal A/c - Founder Loan/Capital)';
    ruleExplanation = 'Nominal A/c: Dr. all expenses | Personal A/c: Cr. the giver (Ankit Patel)';
  } else if (paid.includes('vishal')) {
    creditAccount = 'To Partner Current A/c - V Vishal (Personal A/c - Founder Loan/Capital)';
    ruleExplanation = 'Nominal A/c: Dr. all expenses | Personal A/c: Cr. the giver (V Vishal)';
  }

  const cleanPaid = entry.paidBy === 'Ankit' ? 'Ankit Patel' : entry.paidBy === 'Vishal' ? 'V Vishal' : (entry.paidBy || 'Company');
  const voucher = entry.reference || `VCH-${(entry.id || '001').slice(-6).toUpperCase()}`;
  const lf = `LF-${(entry.id || '01').slice(-4).toUpperCase()}`;

  return {
    debitAccount,
    creditAccount,
    debitAmount: entry.amount,
    creditAmount: entry.amount,
    narration: `(Being expenses incurred for ${entry.description || entry.category} under ${entry.category} paid by ${cleanPaid}${entry.reference ? ` vide Ref ${entry.reference}` : ''})`,
    voucherNo: voucher,
    lf,
    ruleExplanation,
  };
};

/* ─── Robust Year & Month Extractor Helpers ─────────────────────────── */
const getEntryYear = (e: JournalEntry): number | null => {
  if (e.year) return Number(e.year);
  if (e.date) {
    const parts = e.date.split('-');
    if (parts[0].length === 4) return Number(parts[0]);
    if (parts[2]?.length === 4) return Number(parts[2]);
    const parsed = new Date(e.date).getFullYear();
    if (!isNaN(parsed)) return parsed;
  }
  return null;
};

const getEntryMonthKey = (e: JournalEntry): string | null => {
  if (e.monthKey && /^\d{4}-\d{2}$/.test(e.monthKey)) return e.monthKey;
  if (e.date) {
    const parts = e.date.split('-');
    if (parts[0].length === 4 && parts[1]) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}`;
    }
    if (parts[2]?.length === 4 && parts[1]) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}`;
    }
  }
  return null;
};

const formatIsoDate = (dateStr: string) => {
  if (!dateStr) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthIndex = parseInt(month, 10) - 1;
    return `${day} ${monthNames[monthIndex] || month} ${year}`;
  }
  return dateStr;
};

const formatMonthLabel = (monthKey: string) => {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || '—';
  const [year, month] = monthKey.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIndex = parseInt(month, 10) - 1;
  return `${monthNames[monthIndex] || month} ${year}`;
};

const statusBadge = (s: EntryStatus, rawStatus?: string) => {
  if (s === 'approved') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
        <CheckCircle2 className="w-2.5 h-2.5" />
        {rawStatus || 'Approved'}
      </span>
    );
  }
  if (s === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
        <AlertTriangle className="w-2.5 h-2.5" />
        Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
      <Clock className="w-2.5 h-2.5" />
      Draft
    </span>
  );
};

const psrBadge = (s: PsrStatus) => {
  if (s === 'filed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
        <CheckCircle2 className="w-2.5 h-2.5" />
        PSR Filed
      </span>
    );
  }
  if (s === 'generated') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
        <FileText className="w-2.5 h-2.5" />
        PSR Ready
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
      <Clock className="w-2.5 h-2.5" />
      Pending
    </span>
  );
};

/* ─── Main Component ─────────────────────────────────────────────────── */
export const FinanceExpensesPage: React.FC = () => {
  type Tab = 'journal' | 'reports' | 'psr';
  const [activeTab, setActiveTab] = useState<Tab>('journal');
  const [ledgerView, setLedgerView] = useState<LedgerViewMode>('register');

  // Sheet data & sync state
  const [sheetData, setSheetData] = useState<FinanceSheetResponse | null>(null);
  const [persistedEntries, setPersistedEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modals & form state
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [reportTargetMonth, setReportTargetMonth] = useState('2026-10');
  const [reports, setReports] = useState<ExpenseReport[]>([]);
  const [inspectingEntry, setInspectingEntry] = useState<JournalEntry | null>(null);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Filtering state
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

  /* ── Fetch Persistent Expense Ledger from Firestore backend ── */
  const loadPersistedExpenses = useCallback(async () => {
    try {
      setIsLoadingExpenses(true);
      const res = await api.get<{ expenses: any[]; totalAmount: number }>('/admin/expenses');
      if (res.data?.expenses) {
        setPersistedEntries(
          res.data.expenses.map((e: any) => ({
            id: e.id,
            date: e.date,
            type: 'expense' as JournalEntryType,
            category: e.category,
            description: e.description,
            amount: e.amount,
            paidBy: e.paidBy,
            reference: e.reference,
            year: e.year,
            monthKey: e.monthKey,
            monthName: e.monthKey ? formatMonthLabel(e.monthKey) : undefined,
            status: e.status || 'approved',
            isFromSheet: false,
            notes: e.notes,
          }))
        );
      }
    } catch (err) {
      console.error('[FINANCE-EXPENSES] Failed to load persistent expense ledger:', err);
    } finally {
      setIsLoadingExpenses(false);
    }
  }, []);

  /* ── Sync data from backend Google Sheets integration ── */
  const syncSpreadsheetData = useCallback(async (force = false) => {
    try {
      setIsSyncing(true);
      const [sheetDataResult] = await Promise.all([
        insights.financeSheet(force),
        loadPersistedExpenses(),
      ]);
      setSheetData(sheetDataResult);
      setLastSyncedAt(sheetDataResult.lastSyncedAt || new Date().toISOString());
      setSyncError(sheetDataResult.syncError || null);
    } catch (err: any) {
      console.error('[FINANCE-SHEET-SYNC] Error fetching sheet data:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to connect to Google Sheets backend';
      setSyncError(msg);
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, [loadPersistedExpenses]);

  // Initial load & automatic 5-minute background refresh
  useEffect(() => {
    syncSpreadsheetData(false);
    loadPersistedExpenses();
    const interval = setInterval(() => {
      syncSpreadsheetData(false);
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [syncSpreadsheetData, loadPersistedExpenses]);

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

  /* ── Combine spreadsheet entries with persistent database ledger entries ── */
  const allEntries = useMemo(() => {
    const combined = [...spreadsheetEntries, ...persistedEntries];
    return combined.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  }, [spreadsheetEntries, persistedEntries]);

  /* ── Extract available month buckets from spreadsheet & persistent records ── */
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    if (sheetData?.expenses?.monthlyTotals) {
      Object.keys(sheetData.expenses.monthlyTotals).forEach((m) => months.add(m));
    }
    allEntries.forEach((e) => {
      const m = getEntryMonthKey(e);
      if (m) months.add(m);
    });
    return Array.from(months).sort((a, b) => (b > a ? 1 : b < a ? -1 : 0));
  }, [sheetData, allEntries]);

  /* ── Filtered entries based on Month & Type filters (Fixes 2025 Year bug) ── */
  const filteredEntries = useMemo(() => {
    return allEntries.filter((e) => {
      // 1. Year Filter: Strictly match entry year
      if (selectedYear !== 'all') {
        const itemYear = getEntryYear(e);
        if (String(itemYear) !== String(selectedYear)) {
          return false;
        }
      }
      // 2. Month Filter: Strictly match month key
      if (selectedMonth !== 'all') {
        const itemMonthKey = getEntryMonthKey(e);
        if (itemMonthKey !== selectedMonth) {
          return false;
        }
      }
      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchDesc = (e.description || '').toLowerCase().includes(q);
        const matchCat = (e.category || '').toLowerCase().includes(q);
        const matchPaid = (e.paidBy || '').toLowerCase().includes(q);
        const matchRef = (e.reference || '').toLowerCase().includes(q);
        if (!matchDesc && !matchCat && !matchPaid && !matchRef) return false;
      }
      // 4. Type filter
      if (filterType !== 'all' && e.type !== filterType) {
        return false;
      }
      return true;
    });
  }, [allEntries, selectedYear, selectedMonth, searchQuery, filterType]);

  /* ── Derived totals ── */
  const currentMonthExpenses = useMemo(() => {
    return filteredEntries.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
  }, [filteredEntries]);

  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filteredEntries.filter((e) => e.type === 'expense').forEach((e) => {
      map[e.category] = (map[e.category] || 0) + e.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filteredEntries]);

  /* ── Auto-slide to Add Expense Entry Form ── */
  const handleAddExpenseClick = () => {
    setShowAddEntry(true);
    setActiveTab('journal');
    setTimeout(() => {
      const el = document.getElementById('expense-entry-form-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);
  };

  /* ── Add persistent journal entry to Firestore ledger ── */
  const addEntry = async () => {
    if (!form.description || !form.amount) {
      alert('Please provide a description and amount.');
      return;
    }
    try {
      setIsSubmitting(true);
      const [y, m] = form.date.split('-');
      const year = parseInt(y, 10);
      const monthKey = `${y}-${m}`;

      const payload = {
        date: form.date,
        type: form.type,
        category: form.category,
        description: form.description.trim(),
        amount: parseFloat(form.amount) || 0,
        paidBy: form.paidBy || 'Company',
        reference: form.reference?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
        status: 'approved',
        year,
        monthKey,
      };

      const res = await api.post('/admin/expenses', payload);
      const created = res.data;

      const newEntry: JournalEntry = {
        id: created.id || `exp_${Date.now()}`,
        date: created.date || form.date,
        type: 'expense',
        category: created.category || form.category,
        description: created.description || form.description,
        amount: created.amount !== undefined ? created.amount : parseFloat(form.amount),
        paidBy: created.paidBy || form.paidBy,
        reference: created.reference || form.reference,
        year: created.year || year,
        monthKey: created.monthKey || monthKey,
        monthName: formatMonthLabel(created.monthKey || monthKey),
        status: 'approved',
        isFromSheet: false,
        notes: created.notes || form.notes,
      };

      setPersistedEntries((prev) => [newEntry, ...prev]);
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
    } catch (err: any) {
      console.error('[FINANCE-EXPENSES] Error creating expense:', err);
      alert(err.response?.data?.error || 'Failed to save expense to ledger');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── Save Edited Expense Entry ── */
  const saveEditedEntry = async () => {
    if (!editingEntry) return;
    try {
      setIsSubmitting(true);
      const [y, m] = editingEntry.date.split('-');
      const year = parseInt(y, 10);
      const monthKey = `${y}-${m}`;

      const updatedPayload = {
        date: editingEntry.date,
        category: editingEntry.category,
        description: editingEntry.description,
        amount: Number(editingEntry.amount),
        paidBy: editingEntry.paidBy || 'Company',
        reference: editingEntry.reference || null,
        notes: editingEntry.notes || null,
        year,
        monthKey,
      };

      if (!editingEntry.isFromSheet) {
        await api.patch(`/admin/expenses/${editingEntry.id}`, updatedPayload);
      }

      const updatedEntry: JournalEntry = {
        ...editingEntry,
        ...updatedPayload,
        monthName: formatMonthLabel(monthKey),
      };

      setPersistedEntries((prev) =>
        prev.map((e) => (e.id === editingEntry.id ? updatedEntry : e))
      );
      if (inspectingEntry?.id === editingEntry.id) {
        setInspectingEntry(updatedEntry);
      }
      setEditingEntry(null);
    } catch (err: any) {
      console.error('[FINANCE-EXPENSES] Error editing expense:', err);
      alert(err.response?.data?.error || 'Failed to update expense entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteEntry = async (id: string) => {
    if (!window.confirm('Are you sure you want to reverse this ledger expense? This action creates an audit trail entry.')) {
      return;
    }
    try {
      await api.delete(`/admin/expenses/${id}`);
      setPersistedEntries((prev) => prev.filter((e) => e.id !== id));
      if (inspectingEntry?.id === id) setInspectingEntry(null);
    } catch (err: any) {
      console.error('[FINANCE-EXPENSES] Error reversing expense:', err);
      alert(err.response?.data?.error || 'Failed to reverse expense');
    }
  };

  /* ── Strictly Month-Isolated Expense Report Generator ── */
  const triggerGenerateReport = (monthKey: string) => {
    const targetKey = monthKey || (selectedMonth !== 'all' ? selectedMonth : '2026-10');
    const period = formatMonthLabel(targetKey);

    // CRITICAL: Strictly isolate ONLY entries for this specific month!
    const monthExpenses = allEntries.filter((e) => {
      if (e.type !== 'expense') return false;
      const mKey = getEntryMonthKey(e);
      return mKey === targetKey;
    });

    const report: ExpenseReport = {
      id: `er-${targetKey}-${Date.now()}`,
      title: `${period} Expense Report`,
      period,
      monthKey: targetKey,
      createdAt: new Date().toISOString().slice(0, 10),
      entries: monthExpenses,
      totalExpenses: monthExpenses.reduce((s, e) => s + e.amount, 0),
      status: 'draft',
      psrStatus: 'pending',
    };

    setReports((prev) => [report, ...prev]);
    setActiveTab('reports');
    setShowGenerateModal(false);
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
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              Revenue &amp; Expense Tracker
            </h1>
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
            onClick={handleAddExpenseClick}
            className="flex-1 sm:flex-initial flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#093765] hover:bg-[#062A4E] text-white px-3.5 text-xs font-bold shadow-md transition-all cursor-pointer hover:shadow-lg"
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
            onClick={() => setShowGenerateModal(true)}
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
              Total Expenses ({selectedYear !== 'all' ? selectedYear : 'All-Time'})
            </span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black font-mono text-rose-800">
            {isLoading ? '...' : inr(currentMonthExpenses)}
          </p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-rose-800/80">
            <span>{selectedMonth !== 'all' ? formatMonthLabel(selectedMonth) : 'All Filtered Periods'}</span>
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
            <PieIcon className="w-4 h-4 text-emerald-600" />
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
            Operational Spend Breakdown by Category ({selectedYear !== 'all' ? selectedYear : 'All-Time'})
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
          {/* Add Entry Form Modal/Card with Auto-scroll ID */}
          {showAddEntry && (
            <div
              id="expense-entry-form-section"
              className="p-5 rounded-2xl bg-white border-2 border-indigo-500/80 shadow-lg ring-4 ring-indigo-500/10 transition-all animate-fadeIn"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    New Expense Ledger Entry
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Log operational expenses locally with Indian Accounting Standards dual-entry ledger mapping.
                  </p>
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
                {/* Date */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Date *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Category Dropdown (Referenced from Information Sheet) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Category *</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Paid By Dropdown (Exactly 3 Options: Company, Ankit Patel, V Vishal) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Paid By *</label>
                  <select
                    value={form.paidBy}
                    onChange={(e) => setForm((f) => ({ ...f, paidBy: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {PAID_BY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Description */}
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

                {/* Amount */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Invoice Reference */}
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

                {/* Notes */}
                <div className="sm:col-span-2 lg:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Notes / Remarks</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Costed more because of transportation delays"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Ind AS Preview inside Add form */}
              {form.description && form.amount && (
                <div className="mt-3.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                    <Scale className="w-3 h-3 text-indigo-600" />
                    Indian Accounting Standards (Ind AS) Automated Journal Mapping:
                  </p>
                  <p className="font-mono text-[11px] text-slate-800">
                    Dr. {toIndAsJournalEntry({ ...form, id: 'preview', amount: parseFloat(form.amount) || 0, status: 'approved' }).debitAccount} ₹{form.amount}
                  </p>
                  <p className="font-mono text-[11px] text-slate-700 pl-4">
                    {toIndAsJournalEntry({ ...form, id: 'preview', amount: parseFloat(form.amount) || 0, status: 'approved' }).creditAccount} ₹{form.amount}
                  </p>
                </div>
              )}

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
                  disabled={isSubmitting || !form.description.trim() || !form.amount}
                  onClick={addEntry}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Adding...' : 'Add Entry'}
                </button>
              </div>
            </div>
          )}

          {/* Table Card */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
            {/* Filters Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                {/* Year Filter: Strictly Isolates by Year */}
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100">
                  {(['all', '2026', '2025'] as const).map((y) => (
                    <button
                      key={y}
                      type="button"
                      onClick={() => {
                        setSelectedYear(y);
                        setSelectedMonth('all');
                      }}
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
                      {availableMonths
                        .filter((m) => selectedYear === 'all' || m.startsWith(selectedYear))
                        .map((m) => (
                          <option key={m} value={m}>
                            {formatMonthLabel(m)}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {/* View Mode Toggle: Register vs Ind AS Journal Book */}
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-indigo-50 border border-indigo-100">
                  <button
                    type="button"
                    onClick={() => setLedgerView('register')}
                    className={`px-2.5 py-1 text-[10.5px] font-bold rounded-md transition-all cursor-pointer ${
                      ledgerView === 'register' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-indigo-700 hover:bg-white/60'
                    }`}
                  >
                    Register View
                  </button>
                  <button
                    type="button"
                    onClick={() => setLedgerView('ind_as_journal')}
                    className={`px-2.5 py-1 text-[10.5px] font-bold rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                      ledgerView === 'ind_as_journal' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-indigo-700 hover:bg-white/60'
                    }`}
                  >
                    <Scale className="w-3 h-3" />
                    Ind AS Journal Book
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search ledgers..."
                    className="h-8 pl-8 pr-2.5 text-[11px] rounded-lg border border-slate-200 bg-slate-50 focus:bg-white outline-none w-44 sm:w-56"
                  />
                </div>
                <span className="text-[11px] text-slate-400 whitespace-nowrap">{filteredEntries.length} records</span>
              </div>
            </div>

            {/* View 1: Standard Register Table */}
            {ledgerView === 'register' && (
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
                          No financial records found for {selectedYear !== 'all' ? selectedYear : 'the selected filter'}.
                        </td>
                      </tr>
                    )}
                    {filteredEntries.map((e) => {
                      const cfg = categoryConfig(e.category);
                      const cleanPaid = e.paidBy === 'Ankit' ? 'Ankit Patel' : e.paidBy === 'Vishal' ? 'V Vishal' : (e.paidBy || 'Company');
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
                            {cleanPaid}
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
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                <BookOpen className="w-3 h-3 text-blue-600" />
                                Database Ledger
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setInspectingEntry(e)}
                                title="Inspect entry & Ind AS Journal"
                                className="p-1 text-slate-400 hover:text-indigo-600 cursor-pointer transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingEntry(e)}
                                title="Edit Entry"
                                className="p-1 text-slate-400 hover:text-amber-600 cursor-pointer transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {!e.isFromSheet && (
                                <button
                                  type="button"
                                  onClick={() => deleteEntry(e.id)}
                                  title="Delete Entry"
                                  className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* View 2: Automated Indian Accounting Standards (Ind AS) Journal Book */}
            {ledgerView === 'ind_as_journal' && (
              <div className="mt-3 space-y-3">
                <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 flex items-center justify-between text-xs text-indigo-900">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-indigo-600" />
                    <div>
                      <p className="font-bold">Automated Ind AS General Journal Book</p>
                      <p className="text-[11px] text-indigo-700">
                        Formal dual-entry accounting as per Indian Accounting Standards (Ind AS 1 &amp; Ind AS 24 Related Party Disclosures).
                      </p>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-xs bg-white px-2.5 py-1 rounded-lg border border-indigo-200">
                    Balanced: Total Debits = Total Credits ({inr(currentMonthExpenses)})
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[10.5px] uppercase">
                      <tr>
                        <th className="py-2.5 px-3 text-left w-24">Date</th>
                        <th className="py-2.5 px-3 text-left">Particulars (Debit / Credit Heads &amp; Narration)</th>
                        <th className="py-2.5 px-3 text-left w-20">Vouch No</th>
                        <th className="py-2.5 px-3 text-left w-14">L.F.</th>
                        <th className="py-2.5 px-3 text-right w-28">Debit (₹)</th>
                        <th className="py-2.5 px-3 text-right w-28">Credit (₹)</th>
                        <th className="py-2.5 px-3 text-center w-16">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredEntries.map((e) => {
                        const indAs = toIndAsJournalEntry(e);
                        return (
                          <React.Fragment key={e.id}>
                            <tr className="hover:bg-slate-50/70">
                              <td className="py-2.5 px-3 font-mono text-slate-500 align-top whitespace-nowrap">
                                {formatIsoDate(e.date)}
                              </td>
                              <td className="py-2.5 px-3">
                                <p className="font-bold text-slate-900 flex items-center gap-1.5">
                                  <span>{indAs.debitAccount}</span>
                                  <span className="text-[10px] text-indigo-600 font-mono font-semibold">... Dr.</span>
                                </p>
                                <p className="font-semibold text-slate-700 pl-6 mt-0.5">
                                  {indAs.creditAccount}
                                </p>
                                <p className="text-[11px] text-slate-500 italic pl-6 mt-1 font-sans">
                                  {indAs.narration}
                                </p>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 align-top">
                                {indAs.voucherNo}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 align-top">
                                {indAs.lf}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-900 text-right align-top">
                                {inr(indAs.debitAmount)}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-700 text-right align-top">
                                {inr(indAs.creditAmount)}
                              </td>
                              <td className="py-2.5 px-3 text-center align-top">
                                <button
                                  type="button"
                                  onClick={() => setInspectingEntry(e)}
                                  className="p-1 text-slate-400 hover:text-indigo-600 cursor-pointer"
                                  title="Inspect Voucher"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-black text-slate-900">
                      <tr>
                        <td colSpan={4} className="py-2.5 px-3 text-right uppercase text-[11px]">
                          Total Balancing Debits &amp; Credits:
                        </td>
                        <td className="py-2.5 px-3 font-mono text-right text-indigo-700">
                          {inr(currentMonthExpenses)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-right text-indigo-700">
                          {inr(currentMonthExpenses)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Expense Reports Tab (With Rich Visualizations) ─── */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-900">
                {reports.length} Periodic Expense Report{reports.length !== 1 ? 's' : ''} Generated
              </p>
              <p className="text-[11px] text-slate-400">
                Visualized category compositions, monthly growth velocity, and itemized compliance filing drafts.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowGenerateModal(true)}
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
              <p className="text-[11px] text-slate-400 max-w-md mx-auto mb-3">
                Click below to select a target month and compile a strictly month-isolated report with charts.
              </p>
              <button
                type="button"
                onClick={() => setShowGenerateModal(true)}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs"
              >
                Generate Report
              </button>
            </div>
          )}

          {/* Render Visualized Reports */}
          {reports.map((r) => {
            // Category distribution for donut chart
            const catMap: Record<string, number> = {};
            r.entries.forEach((e) => {
              catMap[e.category] = (catMap[e.category] || 0) + e.amount;
            });
            const pieData = Object.entries(catMap)
              .sort((a, b) => b[1] - a[1])
              .map(([name, value], i) => ({
                name,
                value,
                color: CHART_PALETTE[i % CHART_PALETTE.length],
              }));

            // Monthly comparison data for growth trend
            // Compare past 5 months leading to this report's month
            const monthList = availableMonths.slice(0, 5).reverse();
            const barData = monthList.map((mKey) => {
              const monthSum = allEntries
                .filter((e) => e.type === 'expense' && getEntryMonthKey(e) === mKey)
                .reduce((s, e) => s + e.amount, 0);
              return {
                month: formatMonthLabel(mKey).split(' ')[0],
                amount: Math.round(monthSum),
                isCurrent: mKey === r.monthKey,
              };
            });

            // Paid by breakdown
            let companyPaid = 0;
            let ankitPaid = 0;
            let vishalPaid = 0;
            r.entries.forEach((e) => {
              const p = String(e.paidBy || '').toLowerCase();
              if (p.includes('ankit')) ankitPaid += e.amount;
              else if (p.includes('vishal')) vishalPaid += e.amount;
              else companyPaid += e.amount;
            });

            return (
              <div key={r.id} className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
                {/* Report Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-base text-slate-900">{r.title}</h3>
                      {statusBadge(r.status)}
                      {psrBadge(r.psrStatus)}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Period: <strong className="text-slate-700">{r.period}</strong> &middot; Created {r.createdAt} &middot;{' '}
                      <span className="font-semibold text-emerald-600">{r.entries.length} Month-Isolated line items</span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-slate-400 uppercase font-bold">Total Monthly Expenses</p>
                    <p className="text-xl sm:text-2xl font-black font-mono text-rose-700">-{inr(r.totalExpenses)}</p>
                  </div>
                </div>

                {/* KPI Metrics Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Top Expense Driver</p>
                    <p className="text-xs font-bold text-slate-800 truncate mt-0.5">
                      {pieData[0]?.name || '—'}
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono">
                      {pieData[0] ? inr(pieData[0].value) : '—'} ({pieData[0] && r.totalExpenses ? Math.round((pieData[0].value / r.totalExpenses) * 100) : 0}%)
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Company Paid</p>
                    <p className="text-xs font-bold text-slate-800 font-mono mt-0.5">{inr(companyPaid)}</p>
                    <p className="text-[10px] text-slate-500">Bank Outflow ({r.totalExpenses ? Math.round((companyPaid / r.totalExpenses) * 100) : 0}%)</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Ankit Patel</p>
                    <p className="text-xs font-bold text-slate-800 font-mono mt-0.5">{inr(ankitPaid)}</p>
                    <p className="text-[10px] text-slate-500">Founder Loan ({r.totalExpenses ? Math.round((ankitPaid / r.totalExpenses) * 100) : 0}%)</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">V Vishal</p>
                    <p className="text-xs font-bold text-slate-800 font-mono mt-0.5">{inr(vishalPaid)}</p>
                    <p className="text-[10px] text-slate-500">Founder Loan ({r.totalExpenses ? Math.round((vishalPaid / r.totalExpenses) * 100) : 0}%)</p>
                  </div>
                </div>

                {/* ── Visual Charts: Donut Category Breakdown & Monthly Growth ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Donut Chart: Categories */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                    <p className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                      <PieIcon className="w-3.5 h-3.5 text-indigo-600" />
                      Category Composition (Donut Breakdown)
                    </p>
                    {pieData.length > 0 ? (
                      <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="h-44 w-44 shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={42}
                                outerRadius={68}
                                paddingAngle={2}
                                dataKey="value"
                              >
                                {pieData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <RechartsTooltip
                                formatter={(val: any) => [inr(Number(val)), 'Amount']}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex-1 space-y-1.5 max-h-44 overflow-y-auto w-full text-xs pr-1">
                          {pieData.map((d) => (
                            <div key={d.name} className="flex items-center justify-between text-[11px]">
                              <span className="flex items-center gap-1.5 truncate max-w-[150px]">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                                <span className="truncate">{d.name}</span>
                              </span>
                              <span className="font-mono font-bold text-slate-700">
                                {inr(d.value)} <span className="text-[10px] text-slate-400 font-normal">({r.totalExpenses ? Math.round((d.value / r.totalExpenses) * 100) : 0}%)</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 text-center py-8">No expenses logged for this month.</p>
                    )}
                  </div>

                  {/* Growth Rate / Comparison vs Previous Months */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                    <p className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                      Monthly Expense Velocity &amp; Prior Trend
                    </p>
                    <div className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                          <RechartsTooltip formatter={(val: any) => [inr(Number(val)), 'Expenses']} />
                          <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]}>
                            {barData.map((entry, index) => (
                              <Cell
                                key={`bar-${index}`}
                                fill={entry.isCurrent ? '#4338ca' : '#cbd5e1'}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Itemized Entries Table */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-slate-700 uppercase">
                      Itemized Line Items ({r.entries.length})
                    </p>
                    <span className="text-[11px] text-slate-400">Strictly isolated to {r.period}</span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[10px] uppercase">
                          {['Date', 'Category', 'Description', 'Paid By', 'Amount (INR)'].map((h) => (
                            <th key={h} className="text-left py-2 px-3 whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {r.entries.map((e) => {
                          const cfg = categoryConfig(e.category);
                          const cleanPaid = e.paidBy === 'Ankit' ? 'Ankit Patel' : e.paidBy === 'Vishal' ? 'V Vishal' : (e.paidBy || 'Company');
                          return (
                            <tr key={e.id} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">{formatIsoDate(e.date)}</td>
                              <td className="py-2.5 px-3">
                                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${cfg.color} w-fit`}>
                                  {cfg.icon}
                                  {e.category}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-700 font-semibold max-w-[220px] truncate">{e.description}</td>
                              <td className="py-2.5 px-3 text-slate-600">{cleanPaid}</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-rose-700 whitespace-nowrap">-{inr(e.amount)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 font-black text-slate-900 bg-slate-50">
                          <td className="py-2.5 px-3" colSpan={4}>
                            Month Total
                          </td>
                          <td className="py-2.5 px-3 font-mono text-rose-700">-{inr(r.totalExpenses)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
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
            );
          })}
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
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal 1: Select Month for Report Generation ─── */}
      {showGenerateModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn"
          onClick={() => setShowGenerateModal(false)}
        >
          <div
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  Generate Expense Report
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select month to compile with charts and strict month isolation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGenerateModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Target Period / Month
              </label>
              <select
                value={reportTargetMonth}
                onChange={(e) => setReportTargetMonth(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthLabel(m)}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1.5">
                Only expenses incurred in {formatMonthLabel(reportTargetMonth)} will be included.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowGenerateModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => triggerGenerateReport(reportTargetMonth)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md cursor-pointer"
              >
                Compile &amp; Generate Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal 2: Inspect Entry & Ind AS Journal Details ─── */}
      {inspectingEntry && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn"
          onClick={() => setInspectingEntry(null)}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                  Transaction Details
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">{inspectingEntry.description}</h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectingEntry(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* General Info Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Date</span>
                <p className="font-semibold text-slate-800">{formatIsoDate(inspectingEntry.date)}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Amount</span>
                <p className="font-mono font-bold text-rose-700 text-sm">-{inr(inspectingEntry.amount)}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Category</span>
                <p className="font-semibold text-slate-800">{inspectingEntry.category}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Paid By</span>
                <p className="font-semibold text-slate-800">
                  {inspectingEntry.paidBy === 'Ankit' ? 'Ankit Patel' : inspectingEntry.paidBy === 'Vishal' ? 'V Vishal' : (inspectingEntry.paidBy || 'Company')}
                </p>
              </div>
              {inspectingEntry.reference && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Ref / Invoice</span>
                  <p className="font-mono text-slate-700">{inspectingEntry.reference}</p>
                </div>
              )}
              {inspectingEntry.notes && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Notes</span>
                  <p className="text-slate-600">{inspectingEntry.notes}</p>
                </div>
              )}
            </div>

            {/* Indian Accounting Standards Journal Voucher */}
            {(() => {
              const indAs = toIndAsJournalEntry(inspectingEntry);
              return (
                <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200/80 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-900 border-b border-indigo-200/60 pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Scale className="w-3.5 h-3.5 text-indigo-600" />
                      Ind AS Automated Journal Voucher
                    </span>
                    <span className="font-mono text-[10px] text-indigo-700">{indAs.voucherNo}</span>
                  </div>
                  <div className="space-y-1 font-mono text-xs">
                    <div className="flex justify-between text-slate-900 font-bold">
                      <span>Dr. {indAs.debitAccount}</span>
                      <span>{inr(indAs.debitAmount)}</span>
                    </div>
                    <div className="flex justify-between text-slate-700 pl-4 font-semibold">
                      <span>{indAs.creditAccount}</span>
                      <span>{inr(indAs.creditAmount)}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 italic font-sans pt-1">
                    {indAs.narration}
                  </p>
                  <p className="text-[10px] text-indigo-800/80 font-medium pt-0.5">
                    Rule: {indAs.ruleExplanation}
                  </p>
                </div>
              );
            })()}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setEditingEntry(inspectingEntry);
                  setInspectingEntry(null);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal 3: Edit Entry ─── */}
      {editingEntry && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn"
          onClick={() => setEditingEntry(null)}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                  <Pencil className="w-4 h-4 text-indigo-600" />
                  Edit Expense Ledger Entry
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Update details and recalculate journal entries.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Date</label>
                <input
                  type="date"
                  value={editingEntry.date}
                  onChange={(e) => setEditingEntry((prev) => prev ? { ...prev, date: e.target.value } : null)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editingEntry.amount}
                  onChange={(e) => setEditingEntry((prev) => prev ? { ...prev, amount: parseFloat(e.target.value) || 0 } : null)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Category (Information Sheet)</label>
                <select
                  value={editingEntry.category}
                  onChange={(e) => setEditingEntry((prev) => prev ? { ...prev, category: e.target.value } : null)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Paid By</label>
                <select
                  value={editingEntry.paidBy || 'Company'}
                  onChange={(e) => setEditingEntry((prev) => prev ? { ...prev, paidBy: e.target.value } : null)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold"
                >
                  {PAID_BY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Description</label>
                <input
                  type="text"
                  value={editingEntry.description}
                  onChange={(e) => setEditingEntry((prev) => prev ? { ...prev, description: e.target.value } : null)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Reference / Invoice</label>
                <input
                  type="text"
                  value={editingEntry.reference || ''}
                  onChange={(e) => setEditingEntry((prev) => prev ? { ...prev, reference: e.target.value } : null)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Notes</label>
                <input
                  type="text"
                  value={editingEntry.notes || ''}
                  onChange={(e) => setEditingEntry((prev) => prev ? { ...prev, notes: e.target.value } : null)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting || !editingEntry.description.trim()}
                onClick={saveEditedEntry}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
