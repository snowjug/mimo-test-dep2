import { useEffect, useState } from 'react';

/**
 * Which UI this kiosk shows: its normal ("default") UI or a festival UI.
 *
 * The admin dashboard (Configuration → Kiosk Theme) saves the choice per machine; the backend serves it at
 * GET /api/kiosk-theme?kioskId=... and this hook polls it every 30 s, so turning a theme on or off in the
 * dashboard changes the screen within ~30 s with no reload, deploy or visit. The last answer is cached so an
 * offline kiosk keeps its theme; anything unknown, missing or failing means "default".
 * Preview any theme without touching the dashboard: add ?theme=christmas to the kiosk link.
 */
export type KioskTheme = 'default' | 'christmas';
const KNOWN_THEMES: KioskTheme[] = ['default', 'christmas'];
const BACKEND_URL = 'https://api-upqxuj7evq-uc.a.run.app';
const CACHE_KEY = 'mimo_kiosk_theme';
const POLL_MS = 30000;

const asTheme = (value: unknown): KioskTheme =>
  KNOWN_THEMES.includes(value as KioskTheme) ? (value as KioskTheme) : 'default';

function forcedTheme(): KioskTheme | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('theme');
  return raw && KNOWN_THEMES.includes(raw as KioskTheme) ? (raw as KioskTheme) : null;
}

export function useKioskTheme(kioskId?: string | null): KioskTheme {
  const forced = forcedTheme();
  const [theme, setTheme] = useState<KioskTheme>(() => {
    if (forced) return forced;
    try {
      return asTheme(localStorage.getItem(CACHE_KEY));
    } catch {
      return 'default';
    }
  });

  useEffect(() => {
    if (forced || !kioskId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/kiosk-theme?kioskId=${encodeURIComponent(kioskId)}`, { cache: 'no-store' });
        if (!res.ok) return; // keep the current theme on any server error
        const data = await res.json();
        const next = asTheme(data && data.theme);
        if (cancelled) return;
        setTheme(next);
        try {
          localStorage.setItem(CACHE_KEY, next);
        } catch {
          // ignore storage errors
        }
      } catch {
        // offline: keep the current/cached theme
      }
    };
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [kioskId, forced]);

  const active = forced ?? theme;
  // Page-level switch for the festive overrides in components/festive/christmas/christmas.css.
  useEffect(() => {
    document.documentElement.classList.toggle('kiosk-xmas', active === 'christmas');
  }, [active]);
  return active;
}
