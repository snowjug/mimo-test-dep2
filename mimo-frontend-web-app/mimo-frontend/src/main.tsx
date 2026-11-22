import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

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

// MIMO 1.0 (CV-001) responsive scaling: preserves 1440px base width, expands height to fill viewport on non-16:9 screens (e.g. Lenovo Tab M9 1340x800)
const updateMimo1DiwaliScale = () => {
  const isPortrait = window.innerWidth <= 1000 && window.innerHeight > window.innerWidth;
  let scale = 1;
  let kioskWidth = 1440;
  let kioskHeight = 810;

  if (isPortrait) {
    scale = Math.min(window.innerWidth / 810, window.innerHeight / 1440);
    kioskWidth = 810;
    kioskHeight = window.innerHeight / scale;
  } else {
    const screenAspect = window.innerWidth / window.innerHeight;
    const baseAspect = 1440 / 810;

    if (screenAspect >= baseAspect) {
      // Screen is wider than 16:9
      scale = window.innerHeight / 810;
      kioskWidth = window.innerWidth / scale;
      kioskHeight = 810;
    } else {
      // Screen is narrower than 16:9 (e.g. Lenovo Tab M9 1340x800)
      scale = window.innerWidth / 1440;
      kioskWidth = 1440;
      kioskHeight = window.innerHeight / scale;
    }
  }

  document.documentElement.style.setProperty('--kiosk-scale', `${scale}`);
  document.documentElement.style.setProperty('--kiosk-width', `${kioskWidth}px`);
  document.documentElement.style.setProperty('--kiosk-height', `${kioskHeight}px`);
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

