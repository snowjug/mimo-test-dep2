import React, { useEffect, useRef, useState } from 'react';
import { Calendar, Check, ChevronDown } from 'lucide-react';
import {
  DateRangeValue,
  PRESETS,
  RangePresetId,
  describeRange,
  presetRange,
  rangeDays,
  toDateKey,
} from '../../lib/dateRange';

interface Props {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  /** Colour scheme: the admin dashboard (indigo, light/dark) or the finance portal (purple, light). */
  tone?: 'admin' | 'finance';
  className?: string;
}

const MAX_DAYS = 400;

const TONES = {
  admin: {
    trigger:
      'border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800',
    panel: 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200',
    item: 'hover:bg-slate-100 dark:hover:bg-slate-800',
    active: 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
    icon: 'text-indigo-600 dark:text-indigo-400',
    input: 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100',
    apply: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    divider: 'border-slate-200 dark:border-slate-800',
  },
  finance: {
    trigger: 'border border-[#EDE9FE] bg-[#FAF9FD] text-slate-700 hover:bg-[#F3EFFF]',
    panel: 'bg-white border border-[#EDE9FE] text-slate-700',
    item: 'hover:bg-[#F5F2FF]',
    active: 'bg-[#EDE8FF] text-[#5b29c9]',
    icon: 'text-[#6D35E8]',
    input: 'border border-[#EDE9FE] bg-white text-slate-900',
    apply: 'bg-[#6D35E8] hover:bg-[#5b29c9] text-white',
    divider: 'border-[#EDE9FE]',
  },
} as const;

export const DateRangePicker: React.FC<Props> = ({ value, onChange, tone = 'admin', className = '' }) => {
  const t = TONES[tone];
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const today = toDateKey(new Date());

  useEffect(() => { setFrom(value.from); setTo(value.to); setError(''); }, [value.from, value.to, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const pick = (id: Exclude<RangePresetId, 'custom'>) => { onChange(presetRange(id)); setOpen(false); };

  const applyCustom = () => {
    if (!from || !to) return setError('Choose both dates');
    if (from > to) return setError('Start date must be on or before the end date');
    if (to > today) return setError('End date cannot be in the future');
    const next: DateRangeValue = { preset: 'custom', from, to };
    if (rangeDays(next) > MAX_DAYS) return setError(`Range cannot exceed ${MAX_DAYS} days`);
    onChange(next);
    setOpen(false);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`inline-flex items-center gap-2 h-9 px-3 rounded-xl text-xs font-bold transition-colors cursor-pointer ${t.trigger}`}
      >
        <Calendar size={14} className={t.icon} />
        <span className="whitespace-nowrap">{describeRange(value)}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div role="dialog" aria-label="Select date range" className={`absolute right-0 top-11 z-50 w-72 rounded-2xl shadow-xl p-2 ${t.panel}`}>
          <ul className="space-y-0.5">
            {PRESETS.map((p) => {
              const active = value.preset === p.id;
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => pick(p.id as Exclude<RangePresetId, 'custom'>)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer ${active ? t.active : t.item}`}>
                    {p.label}
                    {active && <Check size={14} />}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className={`mt-2 pt-3 px-2 pb-1 border-t ${t.divider}`}>
            <p className="text-[10px] font-black uppercase tracking-wider opacity-60 mb-2">Custom range</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] font-bold opacity-70">
                From
                <input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)}
                  className={`mt-1 w-full h-9 rounded-lg px-2 text-xs font-medium ${t.input}`} />
              </label>
              <label className="text-[10px] font-bold opacity-70">
                To
                <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)}
                  className={`mt-1 w-full h-9 rounded-lg px-2 text-xs font-medium ${t.input}`} />
              </label>
            </div>
            {error && <p role="alert" className="mt-2 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
            <button type="button" onClick={applyCustom}
              className={`mt-3 w-full h-9 rounded-xl text-xs font-bold cursor-pointer ${t.apply}`}>
              Apply range
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
