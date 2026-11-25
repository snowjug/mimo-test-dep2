import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// Loaded only on SV-003 so CV-001 / SV-002 never download the MIMO 3.0 screens.
const Mimo3KioskPage = lazy(() =>
  import('./components/mimo3/Mimo3KioskPage').then((m) => ({ default: m.Mimo3KioskPage })),
)

// Same lookup order as App.tsx.
const resolveKioskId = () => {
  const fromUrl = new URLSearchParams(window.location.search).get('kioskId');
  if (fromUrl) return fromUrl;
  const host = window.location.hostname;
  if (host.includes('mimo-2') || host.includes('mimo-kiosk-app') || host.includes('sv-002')) return 'SV-002';
  try {
    const cached = localStorage.getItem('mimo_kiosk_id');
    if (cached) return cached;
  } catch {
    // ignore storage errors
  }
  return import.meta.env.VITE_KIOSK_ID;
};
const isMimo1Diwali = resolveKioskId() === 'CV-001';

// MIMO 1.0's Diwali screens are drawn on a fixed 1440x810 canvas. Every other kiosk keeps the flexible width below.
const updateMimo1DiwaliScale = () => {
  const isPortrait = window.innerWidth <= 1000 && window.innerHeight > window.innerWidth;
  const scale = isPortrait
    ? Math.min(window.innerWidth / 810, window.innerHeight / 1440)
    : Math.min(window.innerWidth / 1440, window.innerHeight / 810);
  document.documentElement.style.setProperty('--kiosk-scale', `${scale}`);
  document.documentElement.style.setProperty('--kiosk-width', '1440px');
  document.documentElement.style.setProperty('--kiosk-height', '810px');
};

const updateScale = () => {
  if (isMimo1Diwali) {
    updateMimo1DiwaliScale();
    return;
  }

  const isPortrait = window.innerWidth <= 1000;
  let scale = 1;
  let kioskWidth = 1440;

  if (isPortrait) {
    scale = Math.min(window.innerWidth / 810, window.innerHeight / 1440);
    kioskWidth = 810;
  } else {
    const screenAspect = window.innerWidth / window.innerHeight;
    const baseAspect = 1440 / 810;

    if (screenAspect >= baseAspect) {
      // Screen is wider than 16:9 (e.g. 1670x900, ultrawide, etc.)
      // Fit height to kiosk canvas (810px) and expand width dynamically so it spans 100% of the viewport width
      scale = window.innerHeight / 810;
      kioskWidth = Math.ceil(window.innerWidth / scale);
    } else {
      // Screen is narrower than 16:9
      scale = window.innerWidth / 1440;
      kioskWidth = 1440;
    }
  }

  document.documentElement.style.setProperty('--kiosk-scale', `${scale}`);
  document.documentElement.style.setProperty('--kiosk-width', `${kioskWidth}px`);
};
window.addEventListener('resize', updateScale);
window.addEventListener('orientationchange', updateScale);
updateScale();

// MIMO 3.0 (SV-003, Hanuman UI) has its own self-contained page. It is chosen only for
// ?kioskId=SV-003 / MIMO-3 or a /mimo3 path, so CV-001 and SV-002 keep rendering <App />.
const isMimo3 = (() => {
  const id = (resolveKioskId() || '').trim().toUpperCase();
  return id === 'SV-003' || id === 'MIMO-3' || window.location.pathname.startsWith('/mimo3');
})();
if (isMimo3) {
  document.documentElement.classList.add('kiosk-full-bleed');
  document.body.classList.add('theme-mimo3');
  document.getElementById('root')?.classList.add('theme-mimo3');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isMimo3 ? (
      <Suspense fallback={null}>
        <Mimo3KioskPage kioskId="SV-003" />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)

