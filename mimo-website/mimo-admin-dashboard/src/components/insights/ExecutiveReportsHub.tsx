import React, { useState, useEffect } from 'react';
import {
  DollarSign, Sliders, Flame, Clock, BarChart2, AlertTriangle,
  RefreshCw, TrendingUp, Cpu, Layers, CheckCircle2, Box, Sparkles, ChevronRight
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell
} from 'recharts';
import api from '../../api';

export const ExecutiveReportsHub: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'profitability' | 'simulator' | 'heatmap' | 'peakHours' | 'usageFailures'>('profitability');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Data states
  const [locData, setLocData] = useState<any>(null);
  const [machineData, setMachineData] = useState<any>(null);
  const [simData, setSimData] = useState<any>(null);
  const [heatmapData, setHeatmapData] = useState<any>(null);
  const [peakData, setPeakData] = useState<any>(null);
  const [usageData, setUsageData] = useState<any>(null);
  const [failureData, setFailureData] = useState<any>(null);
  const [revData, setRevData] = useState<any>(null);

  // Simulator controls
  const [simKiosks, setSimKiosks] = useState<number>(10);
  const [simJobs, setSimJobs] = useState<number>(60);
  const [simPages, setSimPages] = useState<number>(5);
  const [simColorPct, setSimColorPct] = useState<number>(15);
  const [simDuplexPct, setSimDuplexPct] = useState<number>(40);

  const fetchTabContent = async (tab: string) => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'profitability') {
        const [locRes, mRes] = await Promise.all([
          api.get('/admin/analytics/location-profitability').then((r) => r.data),
          api.get('/admin/analytics/machine-profitability').then((r) => r.data),
        ]);
        setLocData(locRes);
        setMachineData(mRes);
      } else if (tab === 'simulator') {
        const res = await api.post('/admin/analytics/fleet-simulate', {
          kiosksCount: simKiosks,
          avgJobsPerKioskPerDay: simJobs,
          avgPagesPerJob: simPages,
          colorRatioPct: simColorPct,
          duplexRatioPct: simDuplexPct,
        }).then((r) => r.data);
        setSimData(res);
      } else if (tab === 'heatmap') {
        const res = await api.get('/admin/analytics/demand-heatmap').then((r) => r.data);
        setHeatmapData(res);
      } else if (tab === 'peakHours') {
        const res = await api.get('/admin/analytics/peak-hours').then((r) => r.data);
        setPeakData(res);
      } else if (tab === 'usageFailures') {
        const [uRes, fRes, rRes] = await Promise.all([
          api.get('/admin/analytics/customer-usage').then((r) => r.data),
          api.get('/admin/analytics/failures').then((r) => r.data),
          api.get('/admin/analytics/revenue-analytics').then((r) => r.data),
        ]);
        setUsageData(uRes);
        setFailureData(fRes);
        setRevData(rRes);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTabContent(activeTab);
  }, [activeTab]);

  const handleSimulateChange = async (k: number, j: number, p: number, c: number, d: number) => {
    setSimKiosks(k); setSimJobs(j); setSimPages(p); setSimColorPct(c); setSimDuplexPct(d);
    try {
      const res = await api.post('/admin/analytics/fleet-simulate', {
        kiosksCount: k,
        avgJobsPerKioskPerDay: j,
        avgPagesPerJob: p,
        colorRatioPct: c,
        duplexRatioPct: d,
      }).then((r) => r.data);
      setSimData(res);
    } catch (e: any) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]/60 p-1.5 text-[12.5px] no-scrollbar">
        <button
          onClick={() => setActiveTab('profitability')}
          className={`press flex items-center gap-2 rounded-xl px-4 py-2 font-semibold transition-all cursor-pointer ${
            activeTab === 'profitability'
              ? 'bg-[#093765] text-white shadow-sm'
              : 'text-[var(--text-2)] hover:bg-[var(--border)]'
          }`}
        >
          <DollarSign className="size-4" /> Location & Machine Profitability
        </button>

        <button
          onClick={() => setActiveTab('simulator')}
          className={`press flex items-center gap-2 rounded-xl px-4 py-2 font-semibold transition-all cursor-pointer ${
            activeTab === 'simulator'
              ? 'bg-[#093765] text-white shadow-sm'
              : 'text-[var(--text-2)] hover:bg-[var(--border)]'
          }`}
        >
          <Sliders className="size-4" /> Fleet Growth Simulator
        </button>

        <button
          onClick={() => setActiveTab('heatmap')}
          className={`press flex items-center gap-2 rounded-xl px-4 py-2 font-semibold transition-all cursor-pointer ${
            activeTab === 'heatmap'
              ? 'bg-[#093765] text-white shadow-sm'
              : 'text-[var(--text-2)] hover:bg-[var(--border)]'
          }`}
        >
          <Flame className="size-4" /> Print-Demand Heatmap
        </button>

        <button
          onClick={() => setActiveTab('peakHours')}
          className={`press flex items-center gap-2 rounded-xl px-4 py-2 font-semibold transition-all cursor-pointer ${
            activeTab === 'peakHours'
              ? 'bg-[#093765] text-white shadow-sm'
              : 'text-[var(--text-2)] hover:bg-[var(--border)]'
          }`}
        >
          <Clock className="size-4" /> Peak-Hour Velocity
        </button>

        <button
          onClick={() => setActiveTab('usageFailures')}
          className={`press flex items-center gap-2 rounded-xl px-4 py-2 font-semibold transition-all cursor-pointer ${
            activeTab === 'usageFailures'
              ? 'bg-[#093765] text-white shadow-sm'
              : 'text-[var(--text-2)] hover:bg-[var(--border)]'
          }`}
        >
          <BarChart2 className="size-4" /> Customer Usage & Failure Audits
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-4 py-16 text-center">
          <RefreshCw className="mx-auto size-7 animate-spin text-[var(--text-3)]" />
          <p className="text-[13px] text-[var(--text-3)] font-medium">Computing financial and operational intelligence reports...</p>
        </div>
      ) : (
        <>
          {/* ───────────────── 1. PROFITABILITY REPORT ───────────────── */}
          {activeTab === 'profitability' && locData && machineData && (
            <div className="space-y-6">
              <div>
                <h2 className="text-[16px] font-bold text-[var(--text-1)]">Campus Location Unit Economics & P&L</h2>
                <p className="text-[12px] text-[var(--text-3)]">Reconciled cost of goods sold (paper, toner, gateway fees) per campus installation</p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {locData.locations.map((loc: any) => (
                  <div key={loc.locationId} className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-5 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                          {loc.campus}
                        </span>
                        <h3 className="text-[19px] font-bold text-[var(--text-1)] mt-1.5">{loc.locationName}</h3>
                        <p className="text-[12px] text-[var(--text-3)]">{loc.kioskName} · {loc.type}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[26px] font-black text-emerald-600 dark:text-emerald-400">
                          {loc.financials.marginPct}%
                        </p>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-3)]">Net Profit Margin</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 rounded-2xl bg-[var(--surface-2)] p-4 text-[12.5px]">
                      <div>
                        <p className="text-[var(--text-3)] font-medium">Gross Collections</p>
                        <p className="text-[17px] font-bold text-[var(--text-1)]">₹{loc.financials.grossRevenue.toLocaleString('en-IN')}</p>
                        <p className="text-[11px] text-[var(--text-3)]">{loc.jobs} orders · {loc.pages} pages</p>
                      </div>
                      <div>
                        <p className="text-[var(--text-3)] font-medium">Net Realized Profit</p>
                        <p className="text-[17px] font-bold text-emerald-600 dark:text-emerald-400">₹{loc.financials.netProfit.toLocaleString('en-IN')}</p>
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">After all COGS & Opex</p>
                      </div>
                    </div>

                    <div className="space-y-2.5 border-t border-[var(--border)] pt-4 text-[12px]">
                      <div className="flex justify-between text-[var(--text-2)]">
                        <span>Paper Consumables (₹0.42/sheet)</span>
                        <span className="font-semibold text-rose-500">-₹{loc.financials.paperCost}</span>
                      </div>
                      <div className="flex justify-between text-[var(--text-2)]">
                        <span>Toner & Ink Depletion</span>
                        <span className="font-semibold text-rose-500">-₹{loc.financials.tonerCost}</span>
                      </div>
                      <div className="flex justify-between text-[var(--text-2)]">
                        <span>Payment Gateway MDR (1.9%)</span>
                        <span className="font-semibold text-rose-500">-₹{loc.financials.gatewayFee}</span>
                      </div>
                      <div className="flex justify-between text-[var(--text-2)]">
                        <span>Campus Electricity & Wi-Fi Allocation</span>
                        <span className="font-semibold text-rose-500">-₹{loc.financials.overhead}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <h2 className="text-[16px] font-bold text-[var(--text-1)] mt-8">Machine Unit Economics & Capex Amortization</h2>
                <p className="text-[12px] text-[var(--text-3)]">Capital payback progress and hardware asset efficiency</p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {machineData.machines.map((m: any) => (
                  <div key={m.serialNumber} className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono text-[11px] font-bold text-blue-600 dark:text-blue-400">{m.serialNumber}</span>
                        <h3 className="text-[18px] font-bold text-[var(--text-1)]">{m.name}</h3>
                        <p className="text-[12px] text-[var(--text-3)]">{m.location} · Capex: ₹{m.capex.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[22px] font-black text-emerald-600 dark:text-emerald-400">{m.financials.capexRecoveryPct}%</p>
                        <p className="text-[11px] font-bold uppercase text-[var(--text-3)]">Capex Recovered</p>
                      </div>
                    </div>

                    <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--border)]">
                      <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, m.financials.capexRecoveryPct)}%` }} />
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-[12.5px] rounded-2xl bg-[var(--surface-2)] p-4">
                      <div>
                        <p className="text-[var(--text-3)]">Gross Lifetime Revenue</p>
                        <p className="text-[15px] font-bold text-[var(--text-1)]">₹{m.grossRevenue.toLocaleString('en-IN')}</p>
                      </div>
                      <div>
                        <p className="text-[var(--text-3)]">Net Cumulative Profit</p>
                        <p className="text-[15px] font-bold text-emerald-600 dark:text-emerald-400">₹{m.financials.netProfit.toLocaleString('en-IN')}</p>
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

          {/* ───────────────── 2. FLEET SIMULATOR ───────────────── */}
          {activeTab === 'simulator' && simData && (
            <div className="space-y-6">
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)]/70 p-6 space-y-5">
                <div>
                  <h3 className="text-[16px] font-bold text-[var(--text-1)] flex items-center gap-2">
                    <Sliders className="size-5 text-blue-600" /> Interactive Fleet Expansion Simulator
                  </h3>
                  <p className="text-[12px] text-[var(--text-3)]">Model monthly revenue, supply chain consumables, technician staffing, and ROI timelines</p>
                </div>

                <div className="grid gap-6 sm:grid-cols-3">
                  <div className="space-y-2">
                    <div className="flex justify-between text-[12.5px]">
                      <span className="font-semibold text-[var(--text-2)]">Fleet Kiosks (N)</span>
                      <span className="font-bold text-[var(--text-1)] text-[14px]">{simKiosks} kiosks</span>
                    </div>
                    <input
                      type="range" min={2} max={100} value={simKiosks}
                      onChange={(e) => handleSimulateChange(Number(e.target.value), simJobs, simPages, simColorPct, simDuplexPct)}
                      className="w-full cursor-pointer accent-[#093765]"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-[12.5px]">
                      <span className="font-semibold text-[var(--text-2)]">Avg. Orders / Kiosk / Day</span>
                      <span className="font-bold text-[var(--text-1)] text-[14px]">{simJobs} orders</span>
                    </div>
                    <input
                      type="range" min={10} max={250} value={simJobs}
                      onChange={(e) => handleSimulateChange(simKiosks, Number(e.target.value), simPages, simColorPct, simDuplexPct)}
                      className="w-full cursor-pointer accent-[#093765]"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-[12.5px]">
                      <span className="font-semibold text-[var(--text-2)]">Avg. Pages / Job</span>
                      <span className="font-bold text-[var(--text-1)] text-[14px]">{simPages} pages</span>
                    </div>
                    <input
                      type="range" min={2} max={15} value={simPages}
                      onChange={(e) => handleSimulateChange(simKiosks, simJobs, Number(e.target.value), simColorPct, simDuplexPct)}
                      className="w-full cursor-pointer accent-[#093765]"
                    />
                  </div>
                </div>
              </div>

              {/* Simulation Result KPIs */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <p className="text-[11px] font-bold uppercase text-[var(--text-3)]">Monthly Gross Revenue</p>
                  <p className="mt-1 text-[24px] font-black text-[var(--text-1)]">₹{simData.projections.monthlyGrossRevenue.toLocaleString('en-IN')}</p>
                  <p className="text-[11.5px] text-[var(--text-3)]">{simData.projections.monthlyTotalPages.toLocaleString('en-IN')} pages/mo</p>
                </div>

                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <p className="text-[11px] font-bold uppercase text-[var(--text-3)]">Monthly Net Profit</p>
                  <p className="mt-1 text-[24px] font-black text-emerald-600 dark:text-emerald-400">₹{simData.projections.monthlyNetProfit.toLocaleString('en-IN')}</p>
                  <p className="text-[11.5px] font-bold text-emerald-600">{simData.projections.netProfitMarginPct}% profit margin</p>
                </div>

                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <p className="text-[11px] font-bold uppercase text-[var(--text-3)]">Payback Timeline</p>
                  <p className="mt-1 text-[24px] font-black text-blue-600 dark:text-blue-400">{simData.projections.paybackPeriodMonths} mos</p>
                  <p className="text-[11.5px] text-[var(--text-3)]">100% Capex break-even</p>
                </div>

                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <p className="text-[11px] font-bold uppercase text-[var(--text-3)]">Field Tech Staffing</p>
                  <p className="mt-1 text-[24px] font-black text-amber-600 dark:text-amber-400">{simData.supplyChain.techniciansNeeded} staff</p>
                  <p className="text-[11.5px] text-[var(--text-3)]">1 tech per 8 kiosks</p>
                </div>
              </div>

              {/* Supply chain box */}
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
                <h4 className="text-[14px] font-bold text-[var(--text-1)] flex items-center gap-2">
                  <Box className="size-4 text-blue-600" /> Monthly Consumable Supply Chain & Opex Budget
                </h4>
                <div className="grid gap-4 sm:grid-cols-3 text-[13px]">
                  <div className="p-4 rounded-2xl bg-[var(--surface-2)]">
                    <p className="text-[var(--text-3)] font-medium">A4 Paper Required</p>
                    <p className="text-[17px] font-bold text-[var(--text-1)] mt-0.5">{simData.supplyChain.reamsNeeded} reams ({simData.supplyChain.paperBoxesNeeded} boxes)</p>
                    <p className="text-[11.5px] text-[var(--text-3)] mt-1">Paper cost: ₹{simData.costBreakdown.paperCost.toLocaleString('en-IN')}/mo</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-[var(--surface-2)]">
                    <p className="text-[var(--text-3)] font-medium">Toner Cartridges</p>
                    <p className="text-[17px] font-bold text-[var(--text-1)] mt-0.5">{simData.supplyChain.bwTonersNeeded} B&W / {simData.supplyChain.colorCartridgesNeeded} Color</p>
                    <p className="text-[11.5px] text-[var(--text-3)] mt-1">Toner cost: ₹{simData.costBreakdown.tonerCost.toLocaleString('en-IN')}/mo</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-[var(--surface-2)]">
                    <p className="text-[var(--text-3)] font-medium">Total Capital Required</p>
                    <p className="text-[17px] font-bold text-[var(--text-1)] mt-0.5">₹{simData.projections.totalCapex.toLocaleString('en-IN')}</p>
                    <p className="text-[11.5px] text-[var(--text-3)] mt-1">Hardware deployment for {simKiosks} kiosks</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ───────────────── 3. DEMAND HEATMAP ───────────────── */}
          {activeTab === 'heatmap' && heatmapData && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <p className="text-[11px] font-bold uppercase text-[var(--text-3)]">Busiest Day</p>
                  <p className="mt-1 text-[22px] font-black text-[var(--text-1)]">{heatmapData.summary.busiestDay}</p>
                </div>
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <p className="text-[11px] font-bold uppercase text-[var(--text-3)]">Peak Traffic Window</p>
                  <p className="mt-1 text-[22px] font-black text-amber-600 dark:text-amber-400">{heatmapData.summary.busiestHour}</p>
                </div>
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <p className="text-[11px] font-bold uppercase text-[var(--text-3)]">Peak Velocity</p>
                  <p className="mt-1 text-[22px] font-black text-blue-600 dark:text-blue-400">{heatmapData.summary.peakVelocityJobsPerHour} jobs/hr</p>
                </div>
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <p className="text-[11px] font-bold uppercase text-[var(--text-3)]">Sampled Print Jobs</p>
                  <p className="mt-1 text-[22px] font-black text-[var(--text-1)]">{heatmapData.summary.totalJobsSampled} jobs</p>
                </div>
              </div>

              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 overflow-x-auto shadow-xs">
                <h3 className="text-[15px] font-bold text-[var(--text-1)] mb-4">7-Day × 24-Hour Fleet Print Velocity Matrix</h3>
                <div className="min-w-[700px]">
                  <div className="grid grid-cols-[60px_repeat(24,1fr)] gap-1 text-[10px] font-mono text-[var(--text-3)] mb-1">
                    <span />
                    {heatmapData.hours.map((h: number) => (
                      <span key={h} className="text-center">{h}h</span>
                    ))}
                  </div>
                  {heatmapData.days.map((day: string, dayIdx: number) => (
                    <div key={day} className="grid grid-cols-[60px_repeat(24,1fr)] gap-1 items-center py-1">
                      <span className="text-[12px] font-bold text-[var(--text-2)]">{day}</span>
                      {heatmapData.matrix[dayIdx].map((cell: any, hIdx: number) => {
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

          {/* ───────────────── 4. PEAK HOURS ───────────────── */}
          {activeTab === 'peakHours' && peakData && (
            <div className="space-y-6">
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xs overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-[16px] font-bold text-[var(--text-1)]">Hourly Print Velocity (08:00 – 20:00)</h3>
                    <p className="text-[12px] text-[var(--text-3)]">Fleet print volume and operational load throughout business hours</p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-semibold text-[var(--text-3)]">
                    <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#093765]" /> Normal</span>
                    <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-amber-500" /> High</span>
                    <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-rose-500" /> Peak</span>
                  </div>
                </div>

                <div style={{ height: 250, width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={peakData.hourlyVelocity.slice(8, 20).map((h: any) => ({
                        ...h,
                        hourDisplay: `${h.hour % 12 === 0 ? 12 : h.hour % 12}${h.hour < 12 ? 'a' : 'p'}`,
                      }))}
                      margin={{ top: 15, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b833" />
                      <XAxis dataKey="hourDisplay" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          fontSize: 12,
                          background: 'var(--surface)',
                          borderColor: 'var(--border)',
                          color: 'var(--text-1)',
                        }}
                        formatter={(val: number) => [`${val} jobs`, 'Print Jobs']}
                        labelFormatter={(lbl) => `Time: ${lbl}`}
                      />
                      <Bar dataKey="jobs" fill="#093765" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                        {peakData.hourlyVelocity.slice(8, 20).map((entry: any, index: number) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.jobs >= 150 ? '#f43f5e' : entry.jobs >= 100 ? '#f59e0b' : '#093765'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {peakData.peakWindows.map((pw: any) => (
                  <div key={pw.window} className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-2 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                        {pw.load}
                      </span>
                      <span className="text-[11px] font-semibold text-[var(--text-3)]">High Traffic Window</span>
                    </div>
                    <h4 className="text-[16px] font-bold text-[var(--text-1)]">{pw.window}</h4>
                    <p className="text-[12.5px] text-[var(--text-3)] leading-relaxed">{pw.reason}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-[13px] text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300 flex items-start gap-3">
                <Sparkles className="size-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div>
                  <strong className="font-bold">Dynamic Queue Balancer:</strong>
                  <span className="ml-1.5">{peakData.recommendation}</span>
                </div>
              </div>
            </div>
          )}

          {/* ───────────────── 5. USAGE & FAILURE AUDITS ───────────────── */}
          {activeTab === 'usageFailures' && usageData && failureData && revData && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <p className="text-[11px] font-bold uppercase text-[var(--text-3)]">MTBF (Reliability)</p>
                  <p className="mt-1 text-[24px] font-black text-emerald-600 dark:text-emerald-400">{failureData.summary.mtbfHours} hrs</p>
                  <p className="text-[11.5px] text-[var(--text-3)]">Fleet Mean Time Between Failures</p>
                </div>
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <p className="text-[11px] font-bold uppercase text-[var(--text-3)]">Paper Saved by Duplex</p>
                  <p className="mt-1 text-[24px] font-black text-blue-600 dark:text-blue-400">+{usageData.summary.paperSheetsSaved} sheets</p>
                  <p className="text-[11.5px] text-[var(--text-3)]">{usageData.summary.duplexPct}% 2-sided print adoption</p>
                </div>
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <p className="text-[11px] font-bold uppercase text-[var(--text-3)]">Downtime Loss</p>
                  <p className="mt-1 text-[24px] font-black text-rose-600 dark:text-rose-400">₹{revData.downtimeLossInr}</p>
                  <p className="text-[11.5px] text-[var(--text-3)]">Opportunity cost of kiosk offline hrs</p>
                </div>
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <p className="text-[11px] font-bold uppercase text-[var(--text-3)]">Avg. Pages / Order</p>
                  <p className="mt-1 text-[24px] font-black text-[var(--text-1)]">{usageData.summary.avgPagesPerJob}</p>
                  <p className="text-[11.5px] text-[var(--text-3)]">Based on {usageData.summary.totalJobsAnalyzed} jobs</p>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-3">
                  <h3 className="text-[15px] font-bold text-[var(--text-1)]">Customer File Types</h3>
                  {usageData.fileFormats.map((f: any) => (
                    <div key={f.type} className="space-y-1">
                      <div className="flex justify-between text-[12px]">
                        <span className="font-semibold text-[var(--text-1)]">{f.type}</span>
                        <span className="text-[var(--text-3)]">{f.count} jobs ({f.pct}%)</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
                        <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.max(4, f.pct)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-3">
                  <h3 className="text-[15px] font-bold text-[var(--text-1)]">Failure Root Cause Categorization</h3>
                  {failureData.byCategory.map((c: any) => (
                    <div key={c.category} className="space-y-1">
                      <div className="flex justify-between text-[12px]">
                        <span className="font-semibold text-[var(--text-1)]">{c.label}</span>
                        <span className="text-[var(--text-3)]">{c.count} ({c.pct}%)</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
                        <div className="h-full bg-rose-500 rounded-full" style={{ width: `${Math.max(4, c.pct)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
