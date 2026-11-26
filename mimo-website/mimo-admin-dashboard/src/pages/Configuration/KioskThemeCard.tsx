import React, { useCallback, useEffect, useState } from 'react';
import { Palette, Save, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import api from '../../api';

/**
 * Kiosk Theme (festival UI) per machine. "Default" is each machine's normal UI; a festival theme (Christmas)
 * replaces only the welcome screen. Saved to the backend (POST /admin/kiosk-themes); every kiosk checks its
 * theme every 30 s and switches by itself — no reload, deploy or visit needed.
 */
type Theme = 'default' | 'christmas';
const THEME_LABELS: Record<Theme, string> = { default: 'Default', christmas: 'Christmas' };
const MACHINES: { kioskId: string; name: string }[] = [
  { kioskId: 'CV-001', name: 'MIMO 1.0' },
  { kioskId: 'SV-002', name: 'MIMO 2.0' },
  { kioskId: 'SV-003', name: 'MIMO 3.0' },
];

export const KioskThemeCard: React.FC = () => {
  const [saved, setSaved] = useState<Record<string, Theme>>({});
  const [draft, setDraft] = useState<Record<string, Theme>>({});
  const [available, setAvailable] = useState<Theme[]>(['default', 'christmas']);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/kiosk-themes');
      const themes = (res.data && res.data.themes) || {};
      setSaved(themes);
      setDraft(themes);
      if (Array.isArray(res.data?.available)) setAvailable(res.data.available);
      setUpdatedAt(res.data?.updatedAt || null);
    } catch (err) {
      console.error('Failed to load kiosk themes:', err);
      setError('Could not load the current themes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changed = MACHINES.filter((m) => draft[m.kioskId] && draft[m.kioskId] !== saved[m.kioskId]);

  const save = async () => {
    if (changed.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const themes = Object.fromEntries(changed.map((m) => [m.kioskId, draft[m.kioskId]]));
      const res = await api.post('/admin/kiosk-themes', { themes });
      const next = (res.data && res.data.themes) || { ...saved, ...themes };
      setSaved(next);
      setDraft(next);
      setUpdatedAt(res.data?.updatedAt || new Date().toISOString());
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 4000);
    } catch (err) {
      console.error('Failed to save kiosk themes:', err);
      setError('Could not save. Nothing was changed on the machines.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col justify-between space-y-5">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-bold text-base text-[var(--text-1)]">Kiosk Theme (Festival UI)</h2>
            <p className="text-xs text-[var(--text-3)]">Choose the welcome screen each machine shows. Default is the normal UI.</p>
          </div>
          <div className="w-8 h-8 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center">
            <Palette size={16} />
          </div>
        </div>

        <div className="space-y-2.5">
          {MACHINES.map((m) => {
            const current = draft[m.kioskId] || 'default';
            return (
              <div key={m.kioskId} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                <div>
                  <div className="text-sm font-bold text-[var(--text-1)]">{m.name}</div>
                  <div className="text-[11px] font-mono text-[var(--text-3)]">
                    {m.kioskId} · live: {THEME_LABELS[(saved[m.kioskId] as Theme) || 'default']}
                  </div>
                </div>
                <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                  {available.map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={loading || saving}
                      onClick={() => setDraft((d) => ({ ...d, [m.kioskId]: t }))}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                        current === t
                          ? t === 'christmas'
                            ? 'bg-red-600 text-white shadow-xs'
                            : 'bg-[var(--text-1)] text-[var(--surface)] shadow-xs'
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

        <p className="text-[11px] text-[var(--text-3)] mt-3">
          Only the welcome screen changes; codes, printing and payments work exactly the same. Machines switch by
          themselves within about 30 seconds of saving.
          {updatedAt ? ` Last changed ${new Date(updatedAt).toLocaleString()}.` : ''}
        </p>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={load}
          disabled={loading || saving}
          className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text-1)] cursor-pointer"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || changed.length === 0}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            changed.length === 0 ? 'bg-[var(--surface-2)] text-[var(--text-3)] cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700 cursor-pointer'
          }`}
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : justSaved ? <CheckCircle2 size={15} /> : <Save size={15} />}
          {saving ? 'Applying…' : justSaved ? 'Applied' : changed.length ? `Apply to ${changed.length} machine${changed.length > 1 ? 's' : ''}` : 'No changes'}
        </button>
      </div>
    </div>
  );
};
