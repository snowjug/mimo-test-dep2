import React, { useState, useEffect } from 'react';
import {
  Cpu,
  RefreshCw,
  Printer,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import api from '../../api';
import { useTheme } from '../../context/ThemeContext';

interface KioskHardwareInfo {
  type?: string;
  tonerLevel?: number;
  inkLevel?: number;
  paperLevel?: number;
  status?: string;
  location?: string;
  printerModel?: string;
}

const DEFAULT_KIOSKS: Record<string, KioskHardwareInfo> = {
  'CV-001': {
    type: 'bw',
    tonerLevel: 88,
    paperLevel: 420,
    status: 'Online',
    location: 'Central Library (Ground Floor)',
    printerModel: 'HP LaserJet Enterprise M608',
  },
  'SV-002': {
    type: 'color',
    inkLevel: 75,
    paperLevel: 380,
    status: 'Online',
    location: 'Academic & Admin Block',
    printerModel: 'Canon Color imageRUNNER C3226',
  },
};

export const KiosksPage: React.FC = () => {
  const { isDark } = useTheme();
  const [hardware, setHardware] = useState<Record<string, KioskHardwareInfo>>(DEFAULT_KIOSKS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingCode, setUpdatingCode] = useState<string | null>(null);

  const fetchHardware = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get('/admin/hardware');
      if (res.data && Object.keys(res.data).length > 0) {
        setHardware(res.data);
      } else {
        setHardware(DEFAULT_KIOSKS);
      }
    } catch (err) {
      console.error('Failed to load hardware status:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHardware();
  }, []);

  const handleUpdate = async (kioskCode: string, patch: Partial<KioskHardwareInfo>) => {
    setUpdatingCode(kioskCode);
    try {
      const updatedItem = { ...(hardware[kioskCode] || DEFAULT_KIOSKS[kioskCode] || {}), ...patch };
      await api.post('/admin/hardware', {
        updates: {
          [kioskCode]: updatedItem,
        },
      });
      setHardware(prev => ({
        ...prev,
        [kioskCode]: updatedItem,
      }));
    } catch (err) {
      alert('Failed to update kiosk hardware state.');
    } finally {
      setUpdatingCode(null);
    }
  };

  const kioskList = Object.entries(hardware).filter(([code]) => code === 'CV-001' || code === 'SV-002' || code.includes('CV') || code.includes('SV'));
  const activeList = kioskList.length > 0 ? kioskList : Object.entries(DEFAULT_KIOSKS);

  return (
    <div className="space-y-6 animate-fadeIn font-sans select-none">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className={`text-2xl sm:text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Kiosk Network
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              2 Active Machines
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-2)] mt-1">
            Real-time telemetry, paper capacity, toner ink reserves, and maintenance controls for all campus terminals.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchHardware(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[var(--surface)] border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)] transition-all cursor-pointer shadow-xs disabled:opacity-50"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Sync Hardware
        </button>
      </div>

      {/* ── Kiosk Node Grid (2 Machines) ────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] h-64 skeleton" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {activeList.map(([code, info]) => {
            const isOnline = (info.status || 'Online') === 'Online';
            const toner = info.tonerLevel ?? info.inkLevel ?? 85;
            const paper = info.paperLevel ?? 420;
            const isBusy = updatingCode === code;
            const isColor = info.type === 'color' || code.includes('COLOR') || code === 'SV-002';

            return (
              <div
                key={code}
                className="p-5 sm:p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col justify-between space-y-4 hover:border-indigo-500/40 transition-all"
              >
                {/* Node Header */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold text-sm">
                        <Printer size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-base text-[var(--text-1)]">{code}</h3>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                            isColor
                              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}>
                            {isColor ? 'Color Duplex' : 'Monochrome'}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-3)] font-medium">
                          {info.location || (code === 'CV-001' ? 'Central Library (Ground Floor)' : 'Academic & Admin Block')}
                        </p>
                      </div>
                    </div>

                    {/* Online / Offline Status Toggle */}
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleUpdate(code, { status: isOnline ? 'Maintenance' : 'Online' })}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                        isOnline
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                      {info.status || 'Online'}
                    </button>
                  </div>
                </div>

                {/* Telemetry Progress Bars */}
                <div className="space-y-3 p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                  {/* Toner / Ink */}
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-[var(--text-2)]">{isColor ? 'Color Ink Reserve' : 'Black Toner'}</span>
                      <span className={toner < 20 ? 'text-amber-500' : 'text-indigo-500'}>{toner}%</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          toner < 20 ? 'bg-amber-500' : 'bg-gradient-to-r from-indigo-500 to-violet-500'
                        }`}
                        style={{ width: `${toner}%` }}
                      />
                    </div>
                  </div>

                  {/* Paper Tray */}
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-[var(--text-2)]">Paper Tray 1 (A4)</span>
                      <span className={paper < 80 ? 'text-rose-500' : 'text-emerald-500'}>{paper} / 500 sheets</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          paper < 80 ? 'bg-rose-500' : 'bg-gradient-to-r from-emerald-500 to-teal-500'
                        }`}
                        style={{ width: `${Math.min(100, (paper / 500) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Maintenance Action Buttons */}
                <div className="pt-2 flex items-center justify-between gap-2 border-t border-[var(--border)]">
                  <span className="text-[11px] text-[var(--text-3)] font-mono">
                    Node: {code}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleUpdate(code, { tonerLevel: 100, inkLevel: 100 })}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)] transition-all cursor-pointer"
                    >
                      {isBusy ? <Loader2 size={12} className="animate-spin" /> : 'Refill Toner (100%)'}
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleUpdate(code, { paperLevel: 500 })}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 transition-all cursor-pointer"
                    >
                      Load Paper (500)
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
