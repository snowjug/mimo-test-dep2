import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { inr, int } from '../../../lib/format';

/* ─── Types ──────────────────────────────────────────────────────────── */
type JournalEntryType = 'revenue' | 'expense';
type ExpenseCategory = 'consumables' | 'maintenance' | 'electricity' | 'internet' | 'salary' | 'logistics' | 'marketing' | 'misc';
type EntryStatus = 'draft' | 'approved' | 'rejected';
type PsrStatus = 'pending' | 'generated' | 'filed';

interface JournalEntry {
  id: string;
  date: string;
  type: JournalEntryType;
  category: ExpenseCategory | 'revenue';
  description: string;
  amount: number;
  reference?: string;
  status: EntryStatus;
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

/* ─── Static seed data ───────────────────────────────────────────────── */
const SEED_ENTRIES: JournalEntry[] = [
  { id: 'je-001', date: '2026-10-01', type: 'expense', category: 'consumables', description: 'A4 Paper restock – 5 reams (Brother HL)', amount: 875, reference: 'INV-A4-001', status: 'approved', notes: 'For CV-001 and SV-002' },
  { id: 'je-002', date: '2026-10-02', type: 'expense', category: 'consumables', description: 'Black toner cartridge – 2 units', amount: 2600, reference: 'INV-TNR-002', status: 'approved' },
  { id: 'je-003', date: '2026-10-03', type: 'expense', category: 'electricity', description: 'Oct electricity – Reva Boys Hostel meter share', amount: 480, reference: 'ELEC-OCT-001', status: 'approved' },
  { id: 'je-004', date: '2026-10-04', type: 'expense', category: 'internet', description: 'Airtel SIM data pack – CV-001 Pi', amount: 199, reference: 'SIM-CV001-OCT', status: 'approved' },
  { id: 'je-005', date: '2026-10-05', type: 'expense', category: 'maintenance', description: 'Drum unit cleaning – SV-002', amount: 350, reference: 'MNT-SV002-001', status: 'draft' },
  { id: 'je-006', date: '2026-09-30', type: 'expense', category: 'consumables', description: 'Colour ink cartridges – SV-002', amount: 1800, reference: 'INV-CLR-003', status: 'approved' },
  { id: 'je-007', date: '2026-09-28', type: 'expense', category: 'salary', description: 'Oct operations staff allowance', amount: 5000, reference: 'SAL-OCT-001', status: 'draft' },
  { id: 'je-008', date: '2026-10-01', type: 'revenue', category: 'revenue', description: 'Revenue from print jobs – Oct Week 1', amount: 612.40, reference: 'REV-OCT-W1', status: 'approved' },
];

const SEED_REPORTS: ExpenseReport[] = [
  {
    id: 'er-001',
    title: 'October 2026 Expense Report',
    period: 'Oct 2026',
    createdAt: '2026-10-05',
    entries: SEED_ENTRIES.filter(e => e.type === 'expense' && e.date.startsWith('2026-10')),
    totalExpenses: SEED_ENTRIES.filter(e => e.type === 'expense' && e.date.startsWith('2026-10')).reduce((s, e) => s + e.amount, 0),
    status: 'draft',
    psrStatus: 'pending',
  },
  {
    id: 'er-002',
    title: 'September 2026 Expense Report',
    period: 'Sep 2026',
    createdAt: '2026-09-30',
    entries: SEED_ENTRIES.filter(e => e.type === 'expense' && e.date.startsWith('2026-09')),
    totalExpenses: SEED_ENTRIES.filter(e => e.type === 'expense' && e.date.startsWith('2026-09')).reduce((s, e) => s + e.amount, 0),
    status: 'approved',
    psrStatus: 'generated',
  },
];

/* ─── Category config ─────────────────────────────────────────────────── */
const EXPENSE_CATEGORIES: { id: ExpenseCategory; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'consumables',  label: 'Consumables',  icon: <Printer className="w-3.5 h-3.5" />,   color: 'bg-indigo-100 text-indigo-700' },
  { id: 'maintenance',  label: 'Maintenance',  icon: <Layers   className="w-3.5 h-3.5" />,   color: 'bg-amber-100 text-amber-700' },
  { id: 'electricity',  label: 'Electricity',  icon: <Zap      className="w-3.5 h-3.5" />,   color: 'bg-yellow-100 text-yellow-700' },
  { id: 'internet',     label: 'Internet/SIM', icon: <Wifi     className="w-3.5 h-3.5" />,   color: 'bg-sky-100 text-sky-700' },
  { id: 'salary',       label: 'Salary',       icon: <Users    className="w-3.5 h-3.5" />,   color: 'bg-purple-100 text-purple-700' },
  { id: 'logistics',    label: 'Logistics',    icon: <Package  className="w-3.5 h-3.5" />,   color: 'bg-orange-100 text-orange-700' },
  { id: 'marketing',    label: 'Marketing',    icon: <BarChart3 className="w-3.5 h-3.5" />,  color: 'bg-pink-100 text-pink-700' },
  { id: 'misc',         label: 'Miscellaneous', icon: <MoreHorizontal className="w-3.5 h-3.5" />, color: 'bg-slate-100 text-slate-700' },
];

const categoryConfig = (cat: ExpenseCategory | 'revenue') => {
  if (cat === 'revenue') return { label: 'Revenue', icon: <IndianRupee className="w-3.5 h-3.5" />, color: 'bg-emerald-100 text-emerald-700' };
  return EXPENSE_CATEGORIES.find(c => c.id === cat) ?? { label: cat, icon: <MoreHorizontal className="w-3.5 h-3.5" />, color: 'bg-slate-100 text-slate-700' };
};

const statusBadge = (s: EntryStatus) => {
  if (s === 'approved')  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-2.5 h-2.5" />Approved</span>;
  if (s === 'rejected')  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700"><AlertTriangle className="w-2.5 h-2.5" />Rejected</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700"><Clock className="w-2.5 h-2.5" />Draft</span>;
};

const psrBadge = (s: PsrStatus) => {
  if (s === 'filed')     return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-2.5 h-2.5" />PSR Filed</span>;
  if (s === 'generated') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700"><FileText className="w-2.5 h-2.5" />PSR Ready</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500"><Clock className="w-2.5 h-2.5" />Pending</span>;
};

/* ─── Component ──────────────────────────────────────────────────────── */
export const FinanceExpensesPage: React.FC = () => {
  type Tab = 'journal' | 'reports' | 'psr';
  const [activeTab, setActiveTab] = useState<Tab>('journal');
  const [entries, setEntries] = useState<JournalEntry[]>(SEED_ENTRIES);
  const [reports, setReports] = useState<ExpenseReport[]>(SEED_REPORTS);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'revenue' | 'expense'>('all');
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);

  // New entry form state
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: 'expense' as JournalEntryType,
    category: 'consumables' as ExpenseCategory | 'revenue',
    description: '',
    amount: '',
    reference: '',
    notes: '',
  });

  /* ── Derived stats ── */
  const totalRevenue  = useMemo(() => entries.filter(e => e.type === 'revenue').reduce((s, e) => s + e.amount, 0), [entries]);
  const totalExpenses = useMemo(() => entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0), [entries]);
  const netPL         = totalRevenue - totalExpenses;

  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    entries.filter(e => e.type === 'expense').forEach(e => {
      map[e.category] = (map[e.category] || 0) + e.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const filteredEntries = useMemo(() =>
    filterType === 'all' ? entries : entries.filter(e => e.type === filterType),
  [entries, filterType]);

  /* ── Add entry ── */
  const addEntry = () => {
    if (!form.description || !form.amount) return;
    const entry: JournalEntry = {
      id: `je-${Date.now()}`,
      date: form.date,
      type: form.type,
      category: form.type === 'revenue' ? 'revenue' : form.category as ExpenseCategory,
      description: form.description,
      amount: parseFloat(form.amount),
      reference: form.reference || undefined,
      notes: form.notes || undefined,
      status: 'draft',
    };
    setEntries(prev => [entry, ...prev]);
    setForm({ date: new Date().toISOString().slice(0, 10), type: 'expense', category: 'consumables', description: '', amount: '', reference: '', notes: '' });
    setShowAddEntry(false);
  };

  const deleteEntry = (id: string) => setEntries(prev => prev.filter(e => e.id !== id));
  const approveEntry = (id: string) => setEntries(prev => prev.map(e => e.id === id ? { ...e, status: 'approved' } : e));

  /* ── Generate Expense Report ── */
  const generateReport = () => {
    const now  = new Date();
    const period = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const expEntries = entries.filter(e => e.type === 'expense');
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
    setReports(prev => [report, ...prev]);
    setActiveTab('reports');
  };

  /* ── Generate PSR (Periodic Status Report) ── */
  const generatePsr = (reportId: string) => {
    setReports(prev => prev.map(r => r.id === reportId ? { ...r, psrStatus: 'generated', status: 'approved' } : r));
  };

  const exportCsv = () => {
    const rows = [
      ['Date', 'Type', 'Category', 'Description', 'Amount (INR)', 'Reference', 'Status'],
      ...filteredEntries.map(e => [e.date, e.type, e.category, e.description, e.amount.toFixed(2), e.reference || '', e.status]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `MIMO_Journal_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-5 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">Revenue &amp; Expense Tracker</h1>
          <p className="text-xs text-slate-400 mt-0.5">Manual journal entries → Expense reports → PSR (Periodic Status Report)</p>
        </div>
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <button type="button" onClick={exportCsv}
            className="flex-1 sm:flex-initial flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-all cursor-pointer">
            <Download className="w-3.5 h-3.5 text-emerald-600" />CSV
          </button>
          <button type="button" onClick={() => { setShowAddEntry(true); setEditingEntry(null); }}
            className="flex-1 sm:flex-initial flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#093765] hover:bg-[#062A4E] text-white px-3.5 text-xs font-bold shadow-md transition-all cursor-pointer">
            <Plus className="w-3.5 h-3.5" />Add Entry
          </button>
        </div>
      </div>

      {/* Automation Pipeline Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50 via-violet-50 to-purple-50 border border-indigo-200/60 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-indigo-700 flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" />Pipeline:</span>
            {[
              { label: 'Journal Entry', icon: <Pencil className="w-3 h-3" /> },
              { label: 'Expense Report', icon: <FileText className="w-3 h-3" /> },
              { label: 'PSR Report',  icon: <Receipt className="w-3 h-3" /> },
            ].map((step, i) => (
              <React.Fragment key={step.label}>
                <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 text-[11px]">
                  {step.icon}{step.label}
                </span>
                {i < 2 && <ArrowRight className="w-3 h-3 text-indigo-400" />}
              </React.Fragment>
            ))}
          </div>
          <button type="button" onClick={generateReport}
            className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold text-[11px] hover:bg-indigo-700 cursor-pointer transition-all self-start sm:self-auto shadow-xs">
            <ChevronRight className="w-3.5 h-3.5" />Generate Report
          </button>
        </div>
      </div>

      {/* P&L Summary row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 sm:p-4 rounded-2xl bg-emerald-50 border border-emerald-200/60 shadow-2xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase text-emerald-600">Total Revenue (Logged)</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black font-mono text-emerald-700">{inr(totalRevenue)}</p>
        </div>
        <div className="p-3.5 sm:p-4 rounded-2xl bg-rose-50 border border-rose-200/60 shadow-2xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase text-rose-600">Total Expenses</span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black font-mono text-rose-700">{inr(totalExpenses)}</p>
        </div>
        <div className={`p-3.5 sm:p-4 rounded-2xl border shadow-2xs ${netPL >= 0 ? 'bg-indigo-50 border-indigo-200/60' : 'bg-amber-50 border-amber-200/60'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className={`text-[10px] sm:text-[11px] font-bold uppercase ${netPL >= 0 ? 'text-indigo-600' : 'text-amber-600'}`}>Net P&amp;L</span>
            <IndianRupee className={`w-4 h-4 ${netPL >= 0 ? 'text-indigo-500' : 'text-amber-500'}`} />
          </div>
          <p className={`text-xl sm:text-2xl font-black font-mono ${netPL >= 0 ? 'text-indigo-700' : 'text-amber-700'}`}>{netPL >= 0 ? '' : '-'}{inr(Math.abs(netPL))}</p>
        </div>
      </div>

      {/* Expense category breakdown */}
      {expenseByCategory.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs min-w-0 overflow-hidden">
          <h3 className="text-xs font-bold text-slate-700 mb-3 uppercase tracking-wider">Expense Breakdown by Category</h3>
          <div className="space-y-2">
            {expenseByCategory.map(([cat, amt]) => {
              const cfg = categoryConfig(cat as ExpenseCategory);
              const pct = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0;
              return (
                <div key={cat} className="flex items-center gap-2 sm:gap-3 text-xs">
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold ${cfg.color} min-w-[105px] sm:min-w-[120px] truncate`}>
                    {cfg.icon}{cfg.label}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-700 min-w-[65px] text-right">{inr(amt)}</span>
                  <span className="text-[10px] sm:text-[11px] text-slate-400 min-w-[32px] text-right">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Inner Tab Navigation ─── */}
      <div className="grid grid-cols-3 sm:flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 w-full sm:w-fit">
        {([['journal', 'Journal'], ['reports', 'Reports'], ['psr', 'PSR Automation']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} type="button" onClick={() => setActiveTab(t)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center ${
              activeTab === t ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ─── Journal Entries Tab ─── */}
      {activeTab === 'journal' && (
        <div className="space-y-3">
          {/* Add Entry Form */}
          {showAddEntry && (
            <div className="p-5 rounded-2xl bg-white border border-indigo-200 shadow-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm text-slate-900">New Journal Entry</h3>
                <button type="button" onClick={() => setShowAddEntry(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Date</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as JournalEntryType, category: e.target.value === 'revenue' ? 'revenue' : 'consumables' }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="expense">Expense</option>
                    <option value="revenue">Revenue</option>
                  </select>
                </div>
                {form.type === 'expense' && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Category</label>
                    <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as ExpenseCategory }))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      {EXPENSE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                )}
                <div className="sm:col-span-2 lg:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Description *</label>
                  <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. A4 paper restock – 5 reams"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Amount (₹) *</label>
                  <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Invoice / Ref No.</label>
                  <input type="text" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="INV-001"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="sm:col-span-2 lg:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Notes</label>
                  <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setShowAddEntry(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer transition-all">Cancel</button>
                <button type="button" onClick={addEntry}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer transition-all">
                  Add Entry
                </button>
              </div>
            </div>
          )}

          {/* Filter + Table */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100">
                {(['all', 'revenue', 'expense'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setFilterType(t)}
                    className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer capitalize ${
                      filterType === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    {t === 'all' ? 'All Entries' : t === 'revenue' ? 'Revenue' : 'Expenses'}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-slate-400">{filteredEntries.length} entries</span>
            </div>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold text-[10px] uppercase">
                    {['Date','Type / Category','Description','Reference','Amount','Status','Actions'].map(h => (
                      <th key={h} className="text-left py-2.5 px-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredEntries.length === 0 && (
                    <tr><td colSpan={7} className="py-12 text-center text-xs font-semibold text-slate-400">No entries yet. Add your first journal entry above.</td></tr>
                  )}
                  {filteredEntries.map((e) => {
                    const cfg = categoryConfig(e.category);
                    return (
                      <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">{e.date}</td>
                        <td className="py-3 px-3">
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${cfg.color} w-fit`}>
                            {cfg.icon}{cfg.label}
                          </span>
                          <span className={`text-[10px] font-semibold mt-0.5 block ${e.type === 'revenue' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {e.type.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-800 font-semibold max-w-[220px]">
                          <p className="truncate">{e.description}</p>
                          {e.notes && <p className="text-[10px] text-slate-400 truncate">{e.notes}</p>}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-500 whitespace-nowrap">{e.reference || '—'}</td>
                        <td className={`py-3 px-3 font-mono font-black whitespace-nowrap ${e.type === 'revenue' ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {e.type === 'expense' ? '-' : '+'}{inr(e.amount)}
                        </td>
                        <td className="py-3 px-3">{statusBadge(e.status)}</td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1">
                            {e.status === 'draft' && (
                              <button type="button" onClick={() => approveEntry(e.id)} title="Approve"
                                className="p-1 text-slate-400 hover:text-emerald-600 cursor-pointer transition-colors">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button type="button" onClick={() => deleteEntry(e.id)} title="Delete"
                              className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
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
            <p className="text-xs text-slate-500">{reports.length} expense report{reports.length !== 1 ? 's' : ''} generated</p>
            <button type="button" onClick={generateReport}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer transition-all">
              <Plus className="w-3.5 h-3.5" />Generate New Report
            </button>
          </div>
          {reports.length === 0 && (
            <div className="py-20 text-center text-xs font-semibold text-slate-400 bg-white rounded-2xl border border-slate-200">
              No expense reports yet. Use "Generate Expense Report" to create one from your journal entries.
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
                  <p className="text-[11px] text-slate-400">Created: {r.createdAt} · {r.entries.length} expense line items</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] text-slate-400 uppercase font-bold">Total Expenses</p>
                  <p className="text-lg font-black font-mono text-rose-700">-{inr(r.totalExpenses)}</p>
                </div>
              </div>
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold text-[10px] uppercase">
                      {['Date','Category','Description','Reference','Amount'].map(h => (
                        <th key={h} className="text-left py-2 px-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {r.entries.map((e) => {
                      const cfg = categoryConfig(e.category);
                      return (
                        <tr key={e.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">{e.date}</td>
                          <td className="py-2.5 px-3">
                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${cfg.color} w-fit`}>{cfg.icon}{cfg.label}</span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 font-semibold max-w-[200px] truncate">{e.description}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-500">{e.reference || '—'}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-rose-700 whitespace-nowrap">-{inr(e.amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 font-black text-slate-900 bg-slate-50">
                      <td className="py-2.5 px-3" colSpan={4}>Total</td>
                      <td className="py-2.5 px-3 font-mono text-rose-700">-{inr(r.totalExpenses)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                <p className="text-[11px] text-slate-400">
                  {r.psrStatus === 'pending' && 'Approve this report and generate a PSR for filing.'}
                  {r.psrStatus === 'generated' && 'PSR generated — ready for periodic filing.'}
                  {r.psrStatus === 'filed' && 'PSR filed with finance records.'}
                </p>
                <div className="flex items-center gap-2">
                  {r.psrStatus === 'pending' && (
                    <button type="button" onClick={() => generatePsr(r.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-700 cursor-pointer">
                      <ChevronRight className="w-3.5 h-3.5" />Generate PSR
                    </button>
                  )}
                  {r.psrStatus === 'generated' && (
                    <button type="button" onClick={() => setReports(prev => prev.map(rr => rr.id === r.id ? { ...rr, psrStatus: 'filed' } : rr))}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 cursor-pointer">
                      <CheckCircle2 className="w-3.5 h-3.5" />Mark as Filed
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
            <h3 className="font-bold text-sm text-slate-900 mb-1">PSR Automation Pipeline</h3>
            <p className="text-xs text-slate-400 mb-4">Periodic Status Reports are auto-generated from approved Expense Reports. Track the pipeline below.</p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200/60 text-center">
                <p className="text-2xl font-black text-amber-700">{reports.filter(r => r.psrStatus === 'pending').length}</p>
                <p className="text-xs font-bold text-amber-600 mt-0.5">Pending PSR</p>
              </div>
              <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200/60 text-center">
                <p className="text-2xl font-black text-indigo-700">{reports.filter(r => r.psrStatus === 'generated').length}</p>
                <p className="text-xs font-bold text-indigo-600 mt-0.5">PSR Ready to File</p>
              </div>
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200/60 text-center">
                <p className="text-2xl font-black text-emerald-700">{reports.filter(r => r.psrStatus === 'filed').length}</p>
                <p className="text-xs font-bold text-emerald-600 mt-0.5">PSR Filed</p>
              </div>
            </div>

            <div className="space-y-3">
              {reports.map((r) => (
                <div key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      r.psrStatus === 'filed' ? 'bg-emerald-100 text-emerald-600' :
                      r.psrStatus === 'generated' ? 'bg-indigo-100 text-indigo-600' :
                      'bg-amber-100 text-amber-600'
                    }`}>
                      <Receipt className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">{r.title}</p>
                      <p className="text-[11px] text-slate-400">{r.period} · {inr(r.totalExpenses)} total expenses</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {statusBadge(r.status)}
                    {psrBadge(r.psrStatus)}
                    {r.psrStatus === 'pending' && (
                      <button type="button" onClick={() => generatePsr(r.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 cursor-pointer">
                        Generate PSR
                      </button>
                    )}
                    {r.psrStatus === 'generated' && (
                      <button type="button" onClick={() => setReports(prev => prev.map(rr => rr.id === r.id ? { ...rr, psrStatus: 'filed' } : rr))}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700 cursor-pointer">
                        File PSR
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {reports.length === 0 && (
                <p className="py-12 text-center text-xs font-semibold text-slate-400">No reports in the pipeline yet. Generate an expense report first.</p>
              )}
            </div>
          </div>

          {/* PSR format preview */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-[#093765] text-white">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-indigo-300" />
              <h3 className="font-bold text-sm">PSR Format Preview</h3>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 font-mono text-[11px] text-slate-300 space-y-1">
              <p className="font-bold text-white">MIMO OPERATIONS — PERIODIC STATUS REPORT</p>
              <p className="text-slate-400">Period: October 2026 | FY: 2026-27 Q3</p>
              <p className="mt-2 text-slate-400">──────────────────────────────────</p>
              <p>REVENUE SECTION</p>
              <p className="pl-4">Gross Collections:  ₹ 1,409.60</p>
              <p className="pl-4">Refunds Issued:     ₹ -35.00</p>
              <p className="pl-4 font-bold text-emerald-300">Net Settled:        ₹ 1,374.60</p>
              <p className="mt-1 text-slate-400">──────────────────────────────────</p>
              <p>EXPENSE SECTION</p>
              <p className="pl-4">Consumables:        ₹ -5,275.00</p>
              <p className="pl-4">Electricity:        ₹ -480.00</p>
              <p className="pl-4">Internet/SIM:       ₹ -199.00</p>
              <p className="pl-4">Maintenance:        ₹ -350.00</p>
              <p className="pl-4 font-bold text-rose-300">Total Expenses:     ₹ -6,304.00</p>
              <p className="mt-1 text-slate-400">──────────────────────────────────</p>
              <p className="font-bold text-amber-300">NET P&amp;L:             ₹ -4,929.40</p>
              <p className="mt-2 text-slate-500 text-[10px]">Generated by MIMO Finance System · {new Date().toLocaleDateString('en-IN')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
