import React, { useState } from 'react';
import {
  Cpu,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  TrendingUp,
  Power,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface KioskNode {
  id: string;
  name: string;
  code: string;
  location: string;
  status: 'Online' | 'Attention' | 'Offline';
  type: 'B&W' | 'Color';
  printerModel: string;
  uptime: string;
  inkLevel: number;
  paperLevel: number;
  pagesToday: number;
  revenueToday: number;
  successRate: number;
}

const INITIAL_KIOSKS: KioskNode[] = [
  {
    id: 'kiosk-1',
    name: 'MIMO 1',
    code: 'CV-001',
    location: 'Central Library, Ground Floor',
    status: 'Online',
    type: 'B&W',
    printerModel: 'HP LaserJet Enterprise M608',
    uptime: '99.8%',
    inkLevel: 88,
    paperLevel: 420,
    pagesToday: 350,
    revenueToday: 840,
    successRate: 98.8,
  },
  {
    id: 'kiosk-2',
    name: 'MIMO 2',
    code: 'SV-002',
    location: 'Admin Block, Academic Wing',
    status: 'Online',
    type: 'Color',
    printerModel: 'Canon Color imageRUNNER C3226',
    uptime: '98.6%',
    inkLevel: 62,
    paperLevel: 70,
    pagesToday: 614,
    revenueToday: 1480,
    successRate: 97.8,
  },
  {
    id: 'kiosk-3',
    name: 'MIMO 3',
    code: 'SV-003',
    location: 'Student Cafeteria & Lounge',
    status: 'Attention',
    type: 'B&W',
    printerModel: 'Brother HL-L6400DW',
    uptime: '96.2%',
    inkLevel: 18,
    paperLevel: 390,
    pagesToday: 350,
    revenueToday: 840,
    successRate: 94.2,
  },
  {
    id: 'kiosk-4',
    name: 'MIMO 4',
    code: 'SV-004',
    location: 'Hostel Block 3, Lobby',
    status: 'Online',
    type: 'B&W',
    printerModel: 'HP LaserJet Pro M404dn',
    uptime: '99.4%',
    inkLevel: 94,
    paperLevel: 480,
    pagesToday: 190,
    revenueToday: 456,
    successRate: 99.1,
  },
];

export const KiosksPage: React.FC = () => {
  const { isDark } = useTheme();
  const [kiosks, setKiosks] = useState<KioskNode[]>(INITIAL_KIOSKS);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Online' | 'Attention' | 'Offline'>('All');

  const handleRefillInk = (id: string) => {
    setKiosks((prev) =>
      prev.map((k) => (k.id === id ? { ...k, inkLevel: 100, status: k.paperLevel > 100 ? 'Online' : k.status } : k))
    );
  };

  const handleAddPaper = (id: string) => {
    setKiosks((prev) =>
      prev.map((k) => (k.id === id ? { ...k, paperLevel: 500, status: k.inkLevel > 20 ? 'Online' : k.status } : k))
    );
  };

  const handleReboot = (id: string, name: string) => {
    alert(`Sending remote restart signal to ${name}...`);
  };

  const filteredKiosks = kiosks.filter((k) => {
    const matchesSearch =
      k.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.location.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (filterStatus !== 'All' && k.status !== filterStatus) return false;
    return true;
  });

  const totalNodes = kiosks.length;
  const onlineNodes = kiosks.filter((k) => k.status === 'Online').length;
  const attentionNodes = kiosks.filter((k) => k.status === 'Attention').length;
  const totalDailyPages = kiosks.reduce((acc, k) => acc + k.pagesToday, 0);

  return (
    <div className="w-full space-y-6 pb-12 select-none font-sans">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className={`text-2xl sm:text-3xl font-black tracking-tight ${
            isDark ? 'text-white' : 'text-[#1e1b4b]'
          }`}>
            Kiosk Network
          </h1>
          <p className={`text-xs sm:text-sm font-medium mt-0.5 ${
            isDark ? 'text-slate-400' : 'text-gray-500'
          }`}>
            Autonomous edge printing nodes, hardware telemetry, paper/ink levels, and maintenance status
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="px-3.5 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-sm flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {onlineNodes}/{totalNodes} NODES ONLINE
          </span>
        </div>
      </div>

      {/* KPI Metric Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`border rounded-2xl p-5 shadow-sm ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">TOTAL NODES</span>
            <div className="w-7 h-7 rounded-lg bg-purple-500/15 text-[#a78bfa] flex items-center justify-center">
              <Cpu size={15} />
            </div>
          </div>
          <div className="mt-3">
            <div className={`text-3xl font-black ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>{totalNodes}</div>
            <p className="text-xs text-gray-400 mt-0.5">Campus edge mesh</p>
          </div>
        </div>

        <div className={`border rounded-2xl p-5 shadow-sm ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">ONLINE & READY</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 size={15} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-emerald-500">{onlineNodes}</div>
            <p className="text-xs text-gray-400 mt-0.5">Dispatch latency &lt;1.2s</p>
          </div>
        </div>

        <div className={`border rounded-2xl p-5 shadow-sm ${
          isDark ? 'bg-[#1e293b] border-amber-500/30' : 'bg-white border-amber-200/80'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">ATTENTION NEEDED</span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <AlertTriangle size={15} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-amber-500">{attentionNodes}</div>
            <p className="text-xs text-gray-400 mt-0.5">Low paper or ink alert</p>
          </div>
        </div>

        <div className={`border rounded-2xl p-5 shadow-sm ${
          isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">PRINT VOLUME TODAY</span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center">
              <TrendingUp size={15} />
            </div>
          </div>
          <div className="mt-3">
            <div className={`text-3xl font-black ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>{totalDailyPages.toLocaleString()}</div>
            <p className="text-xs text-gray-400 mt-0.5">Total sheets printed</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className={`border rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 ${
        isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
      }`}>
        <div className={`flex items-center gap-1.5 p-1 rounded-xl border self-start md:self-auto ${
          isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-gray-50 border-gray-200'
        }`}>
          {['All', 'Online', 'Attention', 'Offline'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st as any)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterStatus === st
                  ? isDark ? 'bg-purple-950/80 text-[#a78bfa]' : 'bg-white text-[#7c3aed] shadow-xs'
                  : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-80">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search kiosk by name, code, or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl transition-all focus:outline-none ${
              isDark
                ? 'bg-slate-800/80 border border-slate-700 text-white placeholder-slate-400 focus:border-[#8b5cf6]'
                : 'bg-gray-50 border border-gray-200 text-[#1e1b4b] placeholder-gray-400 focus:border-[#7c3aed] focus:bg-white'
            }`}
          />
        </div>
      </div>

      {/* Kiosk Fleet Grid (Spacious Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredKiosks.map((kiosk) => {
          const paperPercent = Math.min(100, Math.round((kiosk.paperLevel / 500) * 100));
          return (
            <div
              key={kiosk.id}
              className={`border rounded-2xl p-6 shadow-sm transition-all flex flex-col justify-between ${
                isDark ? 'bg-[#1e293b] border-[#334155] hover:border-purple-500/50' : 'bg-white border-[#ede9fe] hover:border-purple-200'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xl font-black ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>{kiosk.name}</span>
                    <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded-md border ${
                      isDark ? 'bg-purple-950/60 text-[#a78bfa] border-purple-800/40' : 'bg-purple-50 text-[#7c3aed] border-purple-100'
                    }`}>
                      {kiosk.code}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                      isDark ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {kiosk.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
                    <MapPin size={13} />
                    <span>{kiosk.location}</span>
                  </div>
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide border ${
                    kiosk.status === 'Online'
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : kiosk.status === 'Attention'
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse'
                      : 'bg-red-500/15 text-red-400 border-red-500/30'
                  }`}
                >
                  {kiosk.status}
                </span>
              </div>

              {/* Progress Bars (Toner/Ink & Paper) */}
              <div className={`space-y-3.5 my-3 p-4 rounded-xl border ${
                isDark ? 'bg-slate-800/60 border-slate-700/60' : 'bg-gray-50/70 border-gray-100'
              }`}>
                {/* Ink / Toner */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-gray-400 mb-1.5">
                    <span>{kiosk.type === 'Color' ? 'Color Ink Cartridge' : 'Black Toner Cartridge'}</span>
                    <span className={kiosk.inkLevel < 20 ? 'text-amber-500' : (isDark ? 'text-white' : 'text-[#1e1b4b]')}>
                      {kiosk.inkLevel}%
                    </span>
                  </div>
                  <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`}>
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        kiosk.inkLevel < 20 ? 'bg-amber-500' : 'bg-[#7c3aed]'
                      }`}
                      style={{ width: `${kiosk.inkLevel}%` }}
                    />
                  </div>
                </div>

                {/* Paper Tray */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-gray-400 mb-1.5">
                    <span>Paper Tray Capacity</span>
                    <span className={paperPercent < 20 ? 'text-amber-500' : (isDark ? 'text-white' : 'text-[#1e1b4b]')}>
                      {kiosk.paperLevel} / 500 ({paperPercent}%)
                    </span>
                  </div>
                  <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`}>
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        paperPercent < 20 ? 'bg-amber-500' : 'bg-[#7c3aed]'
                      }`}
                      style={{ width: `${paperPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Telemetry Row */}
              <div className={`grid grid-cols-3 gap-2 py-3 border-t border-b text-center my-2 ${
                isDark ? 'border-slate-700/60' : 'border-gray-100'
              }`}>
                <div>
                  <div className="text-[10px] font-bold uppercase text-gray-400">Pages Today</div>
                  <div className={`text-base font-black mt-0.5 ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>{kiosk.pagesToday}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-gray-400">Revenue</div>
                  <div className={`text-base font-black mt-0.5 ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>₹{kiosk.revenueToday}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-gray-400">Uptime / SLA</div>
                  <div className="text-base font-black text-emerald-400 mt-0.5">{kiosk.uptime}</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-3">
                <button
                  onClick={() => handleRefillInk(kiosk.id)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
                    isDark
                      ? 'bg-purple-950/60 hover:bg-purple-900/60 text-[#a78bfa] border-purple-800/40'
                      : 'bg-purple-50 hover:bg-purple-100 text-[#7c3aed] border-purple-100'
                  }`}
                >
                  Refill Ink/Toner
                </button>
                <button
                  onClick={() => handleAddPaper(kiosk.id)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
                    isDark
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                      : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                  }`}
                >
                  Add Paper Tray
                </button>
                <button
                  onClick={() => handleReboot(kiosk.id, kiosk.name)}
                  title="Remote Node Restart"
                  className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                    isDark
                      ? 'bg-slate-800 hover:bg-red-950/40 text-slate-400 hover:text-red-400 border-slate-700'
                      : 'bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-600 border-gray-200'
                  }`}
                >
                  <Power size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
