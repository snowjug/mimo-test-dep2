import React, { useState, useEffect } from 'react';
import {
  X, AlertTriangle, CheckCircle2, RefreshCw, Play, Wrench, BarChart2,
  PieChart, Flame, DollarSign, Cpu, FileText, Layers, Clock, TrendingUp,
  Sliders, ShieldCheck, ChevronRight, Send, AlertOctagon, Sparkles, Box
} from 'lucide-react';
import { technical } from '../../services/technical.service';

interface TechnicalToolModalProps {
  taskTitle: string;
  onClose: () => void;
  onCompleteTask?: () => void;
}

export const TechnicalToolModal: React.FC<TechnicalToolModalProps> = ({ taskTitle, onClose, onCompleteTask }) => {
  const [activeTab, setActiveTab] = useState<string>(taskTitle);
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [actionBusy, setActionBusy] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string>('');

  // Simulator state
  const [simKiosks, setSimKiosks] = useState<number>(10);
  const [simJobs, setSimJobs] = useState<number>(60);
  const [simPages, setSimPages] = useState<number>(5);
  const [simColorPct, setSimColorPct] = useState<number>(15);
  const [simDuplexPct, setSimDuplexPct] = useState<number>(40);

  // New ticket state
  const [newTicketKiosk, setNewTicketKiosk] = useState<string>('SV-002');
  const [newTicketTitle, setNewTicketTitle] = useState<string>('');
  const [newTicketDesc, setNewTicketDesc] = useState<string>('');
  const [newTicketSev, setNewTicketSev] = useState<string>('medium');

  const ALL_TASKS = [
    { title: 'Failure Analytics', icon: AlertTriangle },
    { title: 'Customer Usage Analytics', icon: BarChart2 },
    { title: 'Maintenance Ticket System', icon: Wrench },
    { title: 'Print-Demand Heatmap', icon: Flame },
    { title: 'Location Profitability', icon: DollarSign },
    { title: 'Solving the Printing Errors', icon: ShieldCheck },
    { title: 'Automatic Low-Paper Alerts', icon: Layers },
    { title: 'Peak-Hour Analytics', icon: Clock },
    { title: 'Machine Profitability', icon: Cpu },
    { title: 'Revenue Analytics', icon: TrendingUp },
    { title: 'Fleet Simulator', icon: Sliders },
  ];

  const loadData = async (tab: string) => {
    setLoading(true);
    setError('');
    setActionMessage('');
    try {
      if (tab.includes('Failure')) {
        const res = await technical.failureAnalytics(30);
        setData(res);
      } else if (tab.includes('Customer Usage')) {
        const res = await technical.customerUsageAnalytics();
        setData(res);
      } else if (tab.includes('Maintenance')) {
        const res = await technical.maintenanceTickets();
        setData(res);
      } else if (tab.includes('Heatmap')) {
        const res = await technical.demandHeatmap();
        setData(res);
      } else if (tab.includes('Location Profitability')) {
        const res = await technical.locationProfitability();
        setData(res);
      } else if (tab.includes('Printing Errors')) {
        const res = await technical.printerDiagnostics();
        setData(res);
      } else if (tab.includes('Paper Alerts')) {
        const res = await technical.paperStatus();
        setData(res);
      } else if (tab.includes('Peak-Hour')) {
        const res = await technical.peakHourAnalytics();
        setData(res);
      } else if (tab.includes('Machine Profitability')) {
        const res = await technical.machineProfitability();
        setData(res);
      } else if (tab.includes('Revenue Analytics')) {
        const res = await technical.revenueAnalytics();
        setData(res);
      } else if (tab.includes('Fleet Simulator')) {
        const res = await technical.fleetSimulate({
          kiosksCount: simKiosks,
          avgJobsPerKioskPerDay: simJobs,
          avgPagesPerJob: simPages,
          colorRatioPct: simColorPct,
          duplexRatioPct: simDuplexPct,
        });
        setData(res);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to load module data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(activeTab);
  }, [activeTab]);

  const handleSimulateChange = async (k: number, j: number, p: number, c: number, d: number) => {
    setSimKiosks(k); setSimJobs(j); setSimPages(p); setSimColorPct(c); setSimDuplexPct(d);
    try {
      const res = await technical.fleetSimulate({
        kiosksCount: k,
        avgJobsPerKioskPerDay: j,
        avgPagesPerJob: p,
        colorRatioPct: c,
        duplexRatioPct: d,
      });
      setData(res);
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleCreateTicket = async () => {
    if (!newTicketTitle.trim()) return;
    setActionBusy(true);
    try {
      await technical.createMaintenanceTicket({
        kioskId: newTicketKiosk,
        title: newTicketTitle.trim(),
        description: newTicketDesc.trim(),
        severity: newTicketSev,
      });
      setNewTicketTitle('');
      setNewTicketDesc('');
      setActionMessage('Ticket logged and SLA countdown started.');
      loadData(activeTab);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to create ticket');
    } finally {
      setActionBusy(false);
    }
  };

  const handleTicketStatus = async (ticketId: string, status: string) => {
    setActionBusy(true);
    try {
      await technical.patchMaintenanceTicket(ticketId, { status });
      loadData(activeTab);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to update ticket');
    } finally {
      setActionBusy(false);
    }
  };

  const handlePrinterAction = async (action: string) => {
    setActionBusy(true);
    setActionMessage('');
    try {
      const res = await technical.recoverPrinter(action, 'SV-002');
      setActionMessage(res.message);
      loadData(activeTab);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Action failed');
    } finally {
      setActionBusy(false);
    }
  };

  const handleRefillPaper = async (printerKey: string, sheets: number) => {
    setActionBusy(true);
    try {
      await technical.refillPaper(printerKey, sheets);
      setActionMessage(`Refilled ${printerKey} (+${sheets} sheets). Optical counter calibrated.`);
      loadData(activeTab);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Refill failed');
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-5xl rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4 bg-[var(--surface-2)]/50">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Wrench className="size-5" />
            </span>
            <div>
              <h2 className="text-[17px] font-bold text-[var(--text-1)]">Technical Diagnostics & Solutions</h2>
              <p className="text-[12px] text-[var(--text-3)]">Lead Engineer Workspace · 11 Assigned Production Deliverables</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onCompleteTask && (
              <button
                onClick={onCompleteTask}
                className="press flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm hover:bg-emerald-700 cursor-pointer"
              >
                <CheckCircle2 className="size-3.5" /> Mark Task Completed
              </button>
            )}
            <button
              onClick={onClose}
              className="press flex size-8 items-center justify-center rounded-full text-[var(--text-3)] hover:bg-[var(--border)] cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Task selector pill row */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-[var(--border)] px-6 py-2.5 bg-[var(--surface)] text-[12px] no-scrollbar">
          {ALL_TASKS.map((t) => {
            const Icon = t.icon;
            const active = activeTab.toLowerCase().includes(t.title.toLowerCase()) || t.title.toLowerCase().includes(activeTab.toLowerCase());
            return (
              <button
                key={t.title}
                onClick={() => setActiveTab(t.title)}
                className={`press flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#093765] text-white shadow-sm'
                    : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--border)]'
                }`}
              >
                <Icon className="size-3.5" />
                {t.title}
              </button>
            );
          })}
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {actionMessage && (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-[13px] text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>{actionMessage}</span>
            </div>
          )}

          {loading ? (
            <div className="space-y-4 py-12 text-center">
              <RefreshCw className="mx-auto size-7 animate-spin text-[var(--text-3)]" />
              <p className="text-[13px] text-[var(--text-3)]">Streaming live telemetry from fleet...</p>
            </div>
          ) : (
            <>
              {/* ────────────────── 1. FAILURE ANALYTICS ────────────────── */}
              {activeTab.includes('Failure') && data && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">MTBF (Reliability)</p>
                      <p className="mt-1 text-[24px] font-bold text-emerald-600 dark:text-emerald-400">{data.summary.mtbfHours} hrs</p>
                      <p className="text-[11px] text-[var(--text-3)]">Mean Time Between Failures</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">Failure Rate</p>
                      <p className="mt-1 text-[24px] font-bold text-[var(--text-1)]">{data.summary.failureRatePct}%</p>
                      <p className="text-[11px] text-[var(--text-3)]">Failures / Total Jobs</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">Total Failed Jobs</p>
                      <p className="mt-1 text-[24px] font-bold text-rose-600 dark:text-rose-400">{data.summary.totalFailures}</p>
                      <p className="text-[11px] text-[var(--text-3)]">Lifetime failed queue events</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">Completed Jobs</p>
                      <p className="mt-1 text-[24px] font-bold text-[var(--text-1)]">{data.summary.totalCompleted}</p>
                      <p className="text-[11px] text-[var(--text-3)]">Successful print executions</p>
                    </div>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                      <h3 className="text-[14px] font-bold text-[var(--text-1)] mb-4">Failures by Root Cause Category</h3>
                      <div className="space-y-3">
                        {data.byCategory.map((c: any) => (
                          <div key={c.category} className="space-y-1">
                            <div className="flex justify-between text-[12px]">
                              <span className="font-medium text-[var(--text-1)]">{c.label}</span>
                              <span className="text-[var(--text-3)]">{c.count} ({c.pct}%)</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
                              <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.max(4, c.pct)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                      <h3 className="text-[14px] font-bold text-[var(--text-1)] mb-4">Failures by Machine</h3>
                      <div className="space-y-4">
                        {data.byKiosk.map((k: any) => (
                          <div key={k.kioskId} className="flex items-center justify-between rounded-xl bg-[var(--surface-2)] p-3.5">
                            <div>
                              <p className="font-semibold text-[13px] text-[var(--text-1)]">{k.kioskId}</p>
                              <p className="text-[11px] text-[var(--text-3)]">{k.kioskId === 'CV-001' ? 'MIMO 1.0 · CV Raman Block' : 'MIMO 2.0 · Central Library'}</p>
                            </div>
                            <div className="text-right">
                              <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-[12px] font-bold text-rose-600 dark:text-rose-400">
                                {k.failures} failures ({k.failurePct}%)
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                    <h3 className="text-[14px] font-bold text-[var(--text-1)] mb-3">Recent Failure Evidence Logs</h3>
                    <div className="divide-y divide-[var(--border)]">
                      {data.recentFailures.map((rf: any) => (
                        <div key={rf.id} className="py-2.5 flex items-center justify-between text-[12px]">
                          <div className="min-w-0 flex-1 pr-4">
                            <p className="truncate font-medium text-[var(--text-1)]">{rf.reason}</p>
                            <p className="text-[11px] text-[var(--text-3)]">{rf.kioskId} · {rf.pageCount} page(s) · {rf.at ? new Date(rf.at).toLocaleString('en-IN') : 'Recent'}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-2)]">
                            {rf.categoryLabel}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ────────────────── 2. CUSTOMER USAGE ANALYTICS ────────────────── */}
              {activeTab.includes('Customer Usage') && data && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">Duplex Adoption</p>
                      <p className="mt-1 text-[24px] font-bold text-emerald-600 dark:text-emerald-400">{data.summary.duplexPct}%</p>
                      <p className="text-[11px] text-[var(--text-3)]">Two-sided print preference</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">Paper Saved</p>
                      <p className="mt-1 text-[24px] font-bold text-blue-600 dark:text-blue-400">+{data.summary.paperSheetsSaved} sheets</p>
                      <p className="text-[11px] text-[var(--text-3)]">Conserved via duplex engine</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">Avg. Pages / Job</p>
                      <p className="mt-1 text-[24px] font-bold text-[var(--text-1)]">{data.summary.avgPagesPerJob}</p>
                      <p className="text-[11px] text-[var(--text-3)]">Average document length</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">Monochrome vs Color</p>
                      <p className="mt-1 text-[24px] font-bold text-[var(--text-1)]">{data.summary.bwPct}% / {data.summary.colorPct}%</p>
                      <p className="text-[11px] text-[var(--text-3)]">B&W laser dominance</p>
                    </div>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                      <h3 className="text-[14px] font-bold text-[var(--text-1)] mb-4">File Format Distribution</h3>
                      <div className="space-y-3">
                        {data.fileFormats.map((f: any) => (
                          <div key={f.type} className="space-y-1">
                            <div className="flex justify-between text-[12px]">
                              <span className="font-medium text-[var(--text-1)]">{f.type}</span>
                              <span className="text-[var(--text-3)]">{f.count} jobs ({f.pct}%)</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
                              <div className="h-full bg-violet-600 rounded-full" style={{ width: `${Math.max(4, f.pct)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                      <h3 className="text-[14px] font-bold text-[var(--text-1)] mb-4">Page Count Buckets</h3>
                      <div className="space-y-3">
                        {data.pageDistribution.map((p: any) => (
                          <div key={p.bucket} className="space-y-1">
                            <div className="flex justify-between text-[12px]">
                              <span className="font-medium text-[var(--text-1)]">{p.bucket}</span>
                              <span className="text-[var(--text-3)]">{p.count} jobs ({p.pct}%)</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
                              <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${Math.max(4, p.pct)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ────────────────── 3. MAINTENANCE TICKET SYSTEM ────────────────── */}
              {activeTab.includes('Maintenance') && data && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex gap-2">
                      <span className="rounded-full bg-blue-500/10 px-3 py-1 text-[12px] font-semibold text-blue-600 dark:text-blue-400">Total: {data.summary.total}</span>
                      <span className="rounded-full bg-amber-500/10 px-3 py-1 text-[12px] font-semibold text-amber-600 dark:text-amber-400">Open: {data.summary.open}</span>
                      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">Resolved: {data.summary.resolved}</span>
                    </div>
                  </div>

                  {/* Create Ticket Box */}
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-3">
                    <h3 className="text-[13px] font-bold text-[var(--text-1)] flex items-center gap-2">
                      <Wrench className="size-4" /> Create Machine Maintenance Ticket
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--text-3)]">Target Kiosk</label>
                        <select
                          value={newTicketKiosk}
                          onChange={(e) => setNewTicketKiosk(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 text-[12.5px] text-[var(--text-1)]"
                        >
                          <option value="SV-002">SV-002 (Central Library)</option>
                          <option value="CV-001">CV-001 (CV Raman Block)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--text-3)]">Severity / SLA</label>
                        <select
                          value={newTicketSev}
                          onChange={(e) => setNewTicketSev(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 text-[12.5px] text-[var(--text-1)]"
                        >
                          <option value="critical">P1 Critical (4h SLA)</option>
                          <option value="high">P2 High (8h SLA)</option>
                          <option value="medium">P3 Medium (24h SLA)</option>
                          <option value="low">P4 Low (72h SLA)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--text-3)]">Issue Title</label>
                        <input
                          value={newTicketTitle}
                          onChange={(e) => setNewTicketTitle(e.target.value)}
                          placeholder="e.g. Roller deglaze"
                          className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 text-[12.5px] text-[var(--text-1)]"
                        />
                      </div>
                    </div>
                    <textarea
                      value={newTicketDesc}
                      onChange={(e) => setNewTicketDesc(e.target.value)}
                      placeholder="Symptoms observed, parts required, or root cause description..."
                      rows={2}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5 text-[12.5px] text-[var(--text-1)]"
                    />
                    <button
                      disabled={actionBusy || !newTicketTitle.trim()}
                      onClick={handleCreateTicket}
                      className="press rounded-full bg-[#093765] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50 cursor-pointer"
                    >
                      {actionBusy ? 'Submitting...' : 'Dispatch Ticket'}
                    </button>
                  </div>

                  {/* Tickets list */}
                  <div className="space-y-3">
                    {data.tickets.map((t: any) => (
                      <div key={t.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-bold text-blue-600 dark:text-blue-400">{t.ticketNumber}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase ${
                              t.severity === 'critical' ? 'bg-rose-500/10 text-rose-600' : t.severity === 'high' ? 'bg-amber-500/10 text-amber-600' : 'bg-blue-500/10 text-blue-600'
                            }`}>
                              {t.severity}
                            </span>
                            <h4 className="font-bold text-[13.5px] text-[var(--text-1)]">{t.title}</h4>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            t.status === 'resolved' || t.status === 'closed' ? 'bg-emerald-500/10 text-emerald-600' : t.status === 'in_progress' ? 'bg-amber-500/10 text-amber-600' : 'bg-rose-500/10 text-rose-600'
                          }`}>
                            {t.status.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[12.5px] text-[var(--text-2)]">{t.description}</p>
                        {t.resolutionNotes && (
                          <p className="text-[11.5px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 p-2 rounded-lg">
                            <strong>Resolution:</strong> {t.resolutionNotes}
                          </p>
                        )}
                        <div className="flex items-center justify-between border-t border-[var(--border)] pt-2 text-[11.5px] text-[var(--text-3)]">
                          <span>{t.kioskName} · Assignee: {t.assignedTo}</span>
                          <div className="flex gap-2">
                            {t.status !== 'in_progress' && t.status !== 'resolved' && (
                              <button onClick={() => handleTicketStatus(t.id, 'in_progress')} className="font-semibold text-blue-600 hover:underline cursor-pointer">
                                Start Investigation
                              </button>
                            )}
                            {t.status !== 'resolved' && (
                              <button onClick={() => handleTicketStatus(t.id, 'resolved')} className="font-semibold text-emerald-600 hover:underline cursor-pointer">
                                Mark Resolved
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ────────────────── 4. PRINT-DEMAND HEATMAP ────────────────── */}
              {activeTab.includes('Heatmap') && data && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">Busiest Day</p>
                      <p className="mt-1 text-[22px] font-bold text-[var(--text-1)]">{data.summary.busiestDay}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">Peak Traffic Window</p>
                      <p className="mt-1 text-[22px] font-bold text-amber-600 dark:text-amber-400">{data.summary.busiestHour}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">Peak Velocity</p>
                      <p className="mt-1 text-[22px] font-bold text-blue-600 dark:text-blue-400">{data.summary.peakVelocityJobsPerHour} jobs/hr</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">Sample Size</p>
                      <p className="mt-1 text-[22px] font-bold text-[var(--text-1)]">{data.summary.totalJobsSampled} jobs</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 overflow-x-auto">
                    <h3 className="text-[14px] font-bold text-[var(--text-1)] mb-4">7-Day × 24-Hour Fleet Print Velocity Matrix</h3>
                    <div className="min-w-[650px]">
                      <div className="grid grid-cols-[60px_repeat(24,1fr)] gap-1 text-[10px] font-mono text-[var(--text-3)] mb-1">
                        <span />
                        {data.hours.map((h: number) => (
                          <span key={h} className="text-center">{h}h</span>
                        ))}
                      </div>
                      {data.days.map((day: string, dayIdx: number) => (
                        <div key={day} className="grid grid-cols-[60px_repeat(24,1fr)] gap-1 items-center py-1">
                          <span className="text-[11px] font-bold text-[var(--text-2)]">{day}</span>
                          {data.matrix[dayIdx].map((cell: any, hIdx: number) => {
                            const intensity = cell.intensity;
                            const bg =
                              intensity === 0
                                ? 'bg-[var(--surface-2)]'
                                : intensity < 25
                                ? 'bg-blue-400/30'
                                : intensity < 55
                                ? 'bg-amber-400/60'
                                : 'bg-rose-500';
                            return (
                              <div
                                key={hIdx}
                                title={`${day} ${hIdx}:00 -> ${cell.jobs} jobs, ${cell.pages} pages`}
                                className={`h-7 rounded transition-transform hover:scale-125 cursor-pointer ${bg}`}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ────────────────── 5. LOCATION PROFITABILITY ────────────────── */}
              {activeTab.includes('Location Profitability') && data && (
                <div className="space-y-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    {data.locations.map((loc: any) => (
                      <div key={loc.locationId} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                              {loc.campus}
                            </span>
                            <h3 className="text-[17px] font-bold text-[var(--text-1)] mt-1">{loc.locationName}</h3>
                            <p className="text-[12px] text-[var(--text-3)]">{loc.kioskName} · {loc.type}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[22px] font-black text-emerald-600 dark:text-emerald-400">
                              {loc.financials.marginPct}%
                            </p>
                            <p className="text-[11px] font-semibold text-[var(--text-3)]">Net Profit Margin</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 rounded-xl bg-[var(--surface-2)] p-3 text-[12px]">
                          <div>
                            <p className="text-[var(--text-3)]">Gross Revenue</p>
                            <p className="text-[15px] font-bold text-[var(--text-1)]">₹{loc.financials.grossRevenue.toLocaleString('en-IN')}</p>
                          </div>
                          <div>
                            <p className="text-[var(--text-3)]">Net Profit</p>
                            <p className="text-[15px] font-bold text-emerald-600 dark:text-emerald-400">₹{loc.financials.netProfit.toLocaleString('en-IN')}</p>
                          </div>
                        </div>

                        <div className="space-y-2 border-t border-[var(--border)] pt-3 text-[12px]">
                          <div className="flex justify-between text-[var(--text-2)]">
                            <span>Paper Consumed (₹0.42/sheet)</span>
                            <span className="font-semibold text-rose-500">-₹{loc.financials.paperCost}</span>
                          </div>
                          <div className="flex justify-between text-[var(--text-2)]">
                            <span>Toner / Ink Burn</span>
                            <span className="font-semibold text-rose-500">-₹{loc.financials.tonerCost}</span>
                          </div>
                          <div className="flex justify-between text-[var(--text-2)]">
                            <span>Gateway Fee (1.9%)</span>
                            <span className="font-semibold text-rose-500">-₹{loc.financials.gatewayFee}</span>
                          </div>
                          <div className="flex justify-between text-[var(--text-2)]">
                            <span>Electricity & Wi-Fi Overhead</span>
                            <span className="font-semibold text-rose-500">-₹{loc.financials.overhead}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ────────────────── 6. SOLVING PRINTING ERRORS ────────────────── */}
              {activeTab.includes('Printing Errors') && data && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
                    <div>
                      <h3 className="text-[16px] font-bold text-[var(--text-1)]">Self-Healing Diagnostics & Pipeline Recovery</h3>
                      <p className="text-[12px] text-[var(--text-3)]">Fleet Health Score: <strong className="text-emerald-500 font-bold">{data.healthScore}/100</strong> · Stuck Jobs in Flight: <strong>{data.stuckJobsCount}</strong></p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={actionBusy}
                        onClick={() => handlePrinterAction('sweep_stuck_jobs')}
                        className="press flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-[12px] font-semibold text-white shadow-sm hover:bg-rose-700 cursor-pointer disabled:opacity-50"
                      >
                        <ShieldCheck className="size-4" /> Sweep Stuck Jobs
                      </button>
                      <button
                        disabled={actionBusy}
                        onClick={() => handlePrinterAction('unpause_cups')}
                        className="press flex items-center gap-1.5 rounded-full bg-[#093765] px-4 py-2 text-[12px] font-semibold text-white shadow-sm hover:bg-[#072a4d] cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className="size-4" /> Unpause CUPS
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-[13px] font-bold uppercase text-[var(--text-3)] tracking-wider">Automated Remediation Playbooks</h4>
                    {data.playbooks.map((p: any) => (
                      <div key={p.code} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[11px] font-bold text-rose-600 dark:text-rose-400">{p.code}</span>
                          <span className="text-[11px] text-[var(--text-3)]">Auto-Mitigation Protocol</span>
                        </div>
                        <p className="text-[14px] font-bold text-[var(--text-1)]">{p.title}</p>
                        <p className="text-[12px] text-[var(--text-3)]"><strong>Trigger:</strong> {p.trigger}</p>
                        <p className="text-[12.5px] text-emerald-600 dark:text-emerald-400 font-medium"><strong>Runbook Action:</strong> {p.remediation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ────────────────── 7. AUTOMATIC LOW-PAPER ALERTS ────────────────── */}
              {activeTab.includes('Paper Alerts') && data && (
                <div className="space-y-6">
                  <div className="grid gap-6 md:grid-cols-3">
                    {data.trays.map((tray: any) => (
                      <div key={tray.printerKey} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase ${
                              tray.status === 'OK' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'
                            }`}>
                              {tray.status}
                            </span>
                            <h4 className="text-[15px] font-bold text-[var(--text-1)] mt-1">{tray.name}</h4>
                          </div>
                          <span className="text-[22px] font-black text-[var(--text-1)]">{tray.paperPct}%</span>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11.5px] text-[var(--text-3)]">
                            <span>Sheets Left</span>
                            <span>{tray.paperLevel} / {tray.paperCapacity}</span>
                          </div>
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
                            <div
                              className={`h-full rounded-full ${
                                tray.paperPct <= 15 ? 'bg-rose-500' : tray.paperPct <= 35 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${tray.paperPct}%` }}
                            />
                          </div>
                        </div>

                        <div className="border-t border-[var(--border)] pt-3 flex items-center justify-between">
                          <span className="text-[11px] text-[var(--text-3)]">Toner: {tray.tonerLevel}%</span>
                          <button
                            disabled={actionBusy}
                            onClick={() => handleRefillPaper(tray.printerKey, 250)}
                            className="press rounded-full bg-emerald-600 px-3 py-1.5 text-[11.5px] font-semibold text-white shadow-sm hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                          >
                            + Refill Tray (Full)
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ────────────────── 8. PEAK-HOUR ANALYTICS ────────────────── */}
              {activeTab.includes('Peak-Hour') && data && (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                    <h3 className="text-[14px] font-bold text-[var(--text-1)] mb-4">Campus Queue Wait Time vs Hour of Day</h3>
                    <div className="grid grid-cols-12 gap-1 items-end h-40 pt-4">
                      {data.hourlyVelocity.slice(8, 20).map((h: any) => (
                        <div key={h.hour} className="flex flex-col items-center gap-1 group">
                          <div
                            className="w-full bg-[#093765] rounded-t transition-all group-hover:bg-blue-500"
                            style={{ height: `${Math.max(10, h.jobs * 1.8)}px` }}
                            title={`${h.label} -> ${h.jobs} jobs (${h.avgWaitTimeSec}s wait)`}
                          />
                          <span className="text-[9.5px] font-mono text-[var(--text-3)]">{h.hour}h</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {data.peakWindows.map((pw: any) => (
                      <div key={pw.window} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-1">
                        <span className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                          {pw.load}
                        </span>
                        <h4 className="text-[15px] font-bold text-[var(--text-1)]">{pw.window}</h4>
                        <p className="text-[12px] text-[var(--text-3)]">{pw.reason}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 text-[12.5px] text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300">
                    <strong>Autonomous Dispatcher:</strong> {data.recommendation}
                  </div>
                </div>
              )}

              {/* ────────────────── 9. MACHINE PROFITABILITY ────────────────── */}
              {activeTab.includes('Machine Profitability') && data && (
                <div className="space-y-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    {data.machines.map((m: any) => (
                      <div key={m.serialNumber} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-mono text-[11px] font-bold text-blue-600 dark:text-blue-400">{m.serialNumber}</span>
                            <h3 className="text-[17px] font-bold text-[var(--text-1)]">{m.name}</h3>
                            <p className="text-[12px] text-[var(--text-3)]">{m.location} · Capex: ₹{m.capex.toLocaleString('en-IN')}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[20px] font-bold text-emerald-600 dark:text-emerald-400">{m.financials.capexRecoveryPct}%</p>
                            <p className="text-[11px] font-semibold text-[var(--text-3)]">Capex Amortized</p>
                          </div>
                        </div>

                        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, m.financials.capexRecoveryPct)}%` }} />
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-[12px] rounded-xl bg-[var(--surface-2)] p-3">
                          <div>
                            <p className="text-[var(--text-3)]">Gross Lifetime Revenue</p>
                            <p className="text-[14px] font-bold text-[var(--text-1)]">₹{m.grossRevenue.toLocaleString('en-IN')}</p>
                          </div>
                          <div>
                            <p className="text-[var(--text-3)]">Net Cumulative Profit</p>
                            <p className="text-[14px] font-bold text-emerald-600 dark:text-emerald-400">₹{m.financials.netProfit.toLocaleString('en-IN')}</p>
                          </div>
                          <div>
                            <p className="text-[var(--text-3)]">Reams Burned</p>
                            <p className="font-semibold text-[var(--text-1)]">{m.financials.reamsBurned} reams ({m.pages} pgs)</p>
                          </div>
                          <div>
                            <p className="text-[var(--text-3)]">Toner Cartridges</p>
                            <p className="font-semibold text-[var(--text-1)]">{m.financials.tonerCartridgesUsed} units</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ────────────────── 10. REVENUE ANALYTICS ────────────────── */}
              {activeTab.includes('Revenue Analytics') && data && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">Gross Revenue</p>
                      <p className="mt-1 text-[22px] font-bold text-[var(--text-1)]">₹{data.grossRevenue.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">Duplex Volume</p>
                      <p className="mt-1 text-[22px] font-bold text-emerald-600 dark:text-emerald-400">₹{data.duplexRevenue.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">Downtime Loss</p>
                      <p className="mt-1 text-[22px] font-bold text-rose-600 dark:text-rose-400">₹{data.downtimeLossInr}</p>
                      <p className="text-[10.5px] text-[var(--text-3)]">Opportunity loss</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">Revenue Velocity</p>
                      <p className="mt-1 text-[22px] font-bold text-blue-600 dark:text-blue-400">₹{data.revenueVelocityPerHour}/hr</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-[14px] font-bold text-[var(--text-1)]">Revenue Engineering Optimizations</h3>
                    {data.marginOptimizations.map((mo: any) => (
                      <div key={mo.title} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-[13.5px] text-[var(--text-1)]">{mo.title}</h4>
                          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">{mo.impact}</span>
                        </div>
                        <p className="text-[12px] text-[var(--text-3)]">{mo.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ────────────────── 11. FLEET SIMULATOR ────────────────── */}
              {activeTab.includes('Fleet Simulator') && data && (
                <div className="space-y-6">
                  {/* Slider controls */}
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5 space-y-4">
                    <h3 className="text-[14px] font-bold text-[var(--text-1)] flex items-center gap-2">
                      <Sliders className="size-4" /> Parametric Fleet Expansion Sandbox
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <div className="flex justify-between text-[12px]">
                          <span className="font-semibold text-[var(--text-2)]">Fleet Kiosks (N)</span>
                          <span className="font-bold text-[var(--text-1)]">{simKiosks}</span>
                        </div>
                        <input
                          type="range" min={2} max={100} value={simKiosks}
                          onChange={(e) => handleSimulateChange(Number(e.target.value), simJobs, simPages, simColorPct, simDuplexPct)}
                          className="w-full cursor-pointer accent-[#093765]"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[12px]">
                          <span className="font-semibold text-[var(--text-2)]">Jobs / Kiosk / Day</span>
                          <span className="font-bold text-[var(--text-1)]">{simJobs}</span>
                        </div>
                        <input
                          type="range" min={10} max={250} value={simJobs}
                          onChange={(e) => handleSimulateChange(simKiosks, Number(e.target.value), simPages, simColorPct, simDuplexPct)}
                          className="w-full cursor-pointer accent-[#093765]"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[12px]">
                          <span className="font-semibold text-[var(--text-2)]">Pages / Job</span>
                          <span className="font-bold text-[var(--text-1)]">{simPages}</span>
                        </div>
                        <input
                          type="range" min={2} max={15} value={simPages}
                          onChange={(e) => handleSimulateChange(simKiosks, simJobs, Number(e.target.value), simColorPct, simDuplexPct)}
                          className="w-full cursor-pointer accent-[#093765]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Results */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">Monthly Gross</p>
                      <p className="mt-1 text-[22px] font-black text-[var(--text-1)]">₹{data.projections.monthlyGrossRevenue.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">Monthly Net Profit</p>
                      <p className="mt-1 text-[22px] font-black text-emerald-600 dark:text-emerald-400">₹{data.projections.monthlyNetProfit.toLocaleString('en-IN')}</p>
                      <p className="text-[11px] font-bold text-emerald-600">{data.projections.netProfitMarginPct}% margin</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">Payback Timeline</p>
                      <p className="mt-1 text-[22px] font-black text-blue-600 dark:text-blue-400">{data.projections.paybackPeriodMonths} mos</p>
                      <p className="text-[11px] text-[var(--text-3)]">100% Capex recovered</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">Field Tech Staffing</p>
                      <p className="mt-1 text-[22px] font-black text-amber-600 dark:text-amber-400">{data.supplyChain.techniciansNeeded} staff</p>
                      <p className="text-[11px] text-[var(--text-3)]">1 tech per 8 kiosks</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
                    <h4 className="text-[13px] font-bold text-[var(--text-1)] flex items-center gap-2">
                      <Box className="size-4" /> Monthly Supply Chain Consumption Matrix
                    </h4>
                    <div className="grid gap-3 sm:grid-cols-3 text-[12.5px]">
                      <div className="p-3 rounded-xl bg-[var(--surface-2)]">
                        <p className="text-[var(--text-3)]">Paper Required</p>
                        <p className="text-[15px] font-bold text-[var(--text-1)]">{data.supplyChain.reamsNeeded} reams ({data.supplyChain.paperBoxesNeeded} boxes)</p>
                        <p className="text-[11px] text-[var(--text-3)]">Est. cost: ₹{data.costBreakdown.paperCost.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-[var(--surface-2)]">
                        <p className="text-[var(--text-3)]">Toner Cartridges</p>
                        <p className="text-[15px] font-bold text-[var(--text-1)]">{data.supplyChain.bwTonersNeeded} B&W / {data.supplyChain.colorCartridgesNeeded} Color</p>
                        <p className="text-[11px] text-[var(--text-3)]">Est. cost: ₹{data.costBreakdown.tonerCost.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-[var(--surface-2)]">
                        <p className="text-[var(--text-3)]">Capital Expenditure</p>
                        <p className="text-[15px] font-bold text-[var(--text-1)]">₹{data.projections.totalCapex.toLocaleString('en-IN')}</p>
                        <p className="text-[11px] text-[var(--text-3)]">Hardware capex for {simKiosks} units</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
