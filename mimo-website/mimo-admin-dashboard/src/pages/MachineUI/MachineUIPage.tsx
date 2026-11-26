import React, { useCallback, useEffect, useState } from 'react';
import { Palette, Save, CheckCircle2, Loader2, RefreshCw, MonitorSmartphone, Layers } from 'lucide-react';
import api from '../../api';

/**
 * Machine UI: which look every kiosk screen shows (the normal "Default" UI or a festival UI such as Christmas),
 * for all machines at once or one by one, plus "Refresh all machines".
 *
 * Kiosks check their theme every 30 s and switch by themselves (only the look changes; codes, printing and
 * payments are untouched). "Refresh all machines" asks every kiosk to reload its screen; each kiosk does it
 * the next time it is idle on its welcome screen, so nobody in the middle of printing is interrupted.
 * Backend: GET/POST /admin/kiosk-themes and POST /admin/kiosk-themes/refresh.
 */
type Theme = 'default' | 'christmas';
const THEME_LABELS: Record<Theme, string> = { default: 'Default', christmas: 'Christmas' };
const THEME_HINT: Record<Theme, string> = {
  default: 'The normal everyday look of each machine.',
  christmas: 'Festive photos, lights and snow on every screen.',
};
const MACHINES: { kioskId: string; name: string }[] = [
  { kioskId: 'CV-001', name: 'MIMO 1.0' },
  { kioskId: 'SV-002', name: 'MIMO 2.0' },
  { kioskId: 'SV-003', name: 'MIMO 3.0' },
];

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'never');

export const MachineUIPage: React.FC = () => {
  const [saved, setSaved] = useState<Record<string, Theme>>({});
  const [draft, setDraft] = useState<Record<string, Theme>>({});
  const [available, setAvailable] = useState<Theme[]>(['default', 'christmas']);
  const [allChoice, setAllChoice] = useState<Theme>('christmas');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [refreshAt, setRefreshAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<'' | 'load' | 'all' | 'one' | 'refresh'>('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setBusy('load');
    try {
      const res = await api.get('/admin/kiosk-themes');
      const themes = (res.data && res.data.themes) || {};
      setSaved(themes);
      setDraft(themes);
      if (Array.isArray(res.data?.available)) setAvailable(res.data.available);
      setUpdatedAt(res.data?.updatedAt || null);
      setRefreshAt(res.data?.refreshAt || null);
    } catch (err) {
      console.error('Failed to load machine UI settings:', err);
      setNotice({ ok: false, text: 'Could not load the current machine UI.' });
    } finally {
      setBusy('');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (ok: boolean, text: string) => {
    setNotice({ ok, text });
    window.setTimeout(() => setNotice(null), 6000);
  };

  const applyThemes = async (themes: Record<string, Theme>, mode: 'all' | 'one') => {
    setBusy(mode);
    try {
      const res = await api.post('/admin/kiosk-themes', { themes });
      const next = (res.data && res.data.themes) || { ...saved, ...themes };
      setSaved(next);
      setDraft(next);
      setUpdatedAt(res.data?.updatedAt || new Date().toISOString());
      flash(true, 'Saved. The machines will switch by themselves within about 30 seconds.');
    } catch (err) {
      console.error('Failed to save machine UI:', err);
      flash(false, 'Could not save. Nothing was changed on the machines.');
    } finally {
      setBusy('');
    }
  };

  const applyAll = () => applyThemes(Object.fromEntries(MACHINES.map((m) => [m.kioskId, allChoice])), 'all');
  const changed = MACHINES.filter((m) => draft[m.kioskId] && draft[m.kioskId] !== saved[m.kioskId]);
  const applyChanged = () => applyThemes(Object.fromEntries(changed.map((m) => [m.kioskId, draft[m.kioskId]])), 'one');

  const refreshAll = async () => {
    setBusy('refresh');
    try {
      const res = await api.post('/admin/kiosk-themes/refresh', {});
      setRefreshAt(res.data?.refreshAt || new Date().toISOString());
      flash(true, 'Refresh sent. Each machine reloads within about 30 seconds, as soon as nobody is using it.');
    } catch (err) {
      console.error('Failed to refresh machines:', err);
      flash(false, 'Could not send the refresh.');
    } finally {
      setBusy('');
    }
  };

  const allSame = MACHINES.every((m) => (saved[m.kioskId] || 'default') === (saved[MACHINES[0].kioskId] || 'default'));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-1)]">Machine UI</h1>
        <p className="text-xs sm:text-sm text-[var(--text-2)] mt-1">
          Choose the look of every kiosk screen. Only the look changes; codes, printing and payments work the same.
        </p>
      </div>

      {notice && (
        <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${notice.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300'}`}>
          {notice.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* All machines at once */}
        <section className="p-5 sm:p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-base text-[var(--text-1)]">All machines at once</h2>
              <p className="text-xs text-[var(--text-3)]">
                Now: {allSame ? `${THEME_LABELS[(saved[MACHINES[0].kioskId] as Theme) || 'default']} on every machine` : 'mixed (see below)'}
              </p>
            </div>
            <div className="w-8 h-8 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center"><Layers size={16} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {available.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setAllChoice(t)}
                className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
                  allChoice === t ? (t === 'christmas' ? 'border-red-500 bg-red-500/10' : 'border-[var(--text-1)] bg-[var(--surface-2)]') : 'border-[var(--border)] hover:border-[var(--text-3)]'
                }`}
              >
                <div className="text-sm font-bold text-[var(--text-1)]">{THEME_LABELS[t]}</div>
                <div className="text-[11px] text-[var(--text-3)] mt-1">{THEME_HINT[t]}</div>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={applyAll}
            disabled={!!busy}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 cursor-pointer"
          >
            {busy === 'all' ? <Loader2 size={16} className="animate-spin" /> : <Palette size={16} />}
            Apply {THEME_LABELS[allChoice]} to all machines
          </button>
        </section>

        {/* Refresh */}
        <section className="p-5 sm:p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-base text-[var(--text-1)]">Refresh machine screens</h2>
              <p className="text-xs text-[var(--text-3)]">Last refresh: {when(refreshAt)}</p>
            </div>
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center"><MonitorSmartphone size={16} /></div>
          </div>
          <p className="text-sm text-[var(--text-2)]">
            Reloads the screen on every machine, for example after an update. Each machine waits until nobody is using it,
            so a print in progress is never interrupted.
          </p>
          <button
            type="button"
            onClick={refreshAll}
            disabled={!!busy}
            className="mt-auto flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-1)] hover:border-[var(--text-3)] disabled:opacity-60 cursor-pointer"
          >
            {busy === 'refresh' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh all machines
          </button>
        </section>
      </div>

      {/* One machine at a time */}
      <section className="p-5 sm:p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-base text-[var(--text-1)]">Each machine</h2>
            <p className="text-xs text-[var(--text-3)]">Last changed: {when(updatedAt)}</p>
          </div>
          <button type="button" onClick={load} disabled={!!busy} className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text-1)] cursor-pointer">
            <RefreshCw size={13} className={busy === 'load' ? 'animate-spin' : ''} /> Reload
          </button>
        </div>
        <div className="space-y-2.5">
          {MACHINES.map((m) => {
            const current = draft[m.kioskId] || 'default';
            return (
              <div key={m.kioskId} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                <div>
                  <div className="text-sm font-bold text-[var(--text-1)]">{m.name}</div>
                  <div className="text-[11px] font-mono text-[var(--text-3)]">
                    {m.kioskId} · showing: {THEME_LABELS[(saved[m.kioskId] as Theme) || 'default']}
                  </div>
                </div>
                <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                  {available.map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={!!busy}
                      onClick={() => setDraft((d) => ({ ...d, [m.kioskId]: t }))}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                        current === t
                          ? t === 'christmas' ? 'bg-red-600 text-white shadow-xs' : 'bg-[var(--text-1)] text-[var(--surface)] shadow-xs'
                          : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
                      }`}
                    >
                      {THEME_LABELS[t] || t}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={applyChanged}
            disabled={!!busy || changed.length === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              changed.length === 0 ? 'bg-[var(--surface-2)] text-[var(--text-3)] cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700 cursor-pointer'
            }`}
          >
            {busy === 'one' ? <Loader2 size={15} className="animate-spin" /> : changed.length ? <Save size={15} /> : <CheckCircle2 size={15} />}
            {changed.length ? `Apply to ${changed.length} machine${changed.length > 1 ? 's' : ''}` : 'Up to date'}
          </button>
        </div>
      </section>
    </div>
  );
};
