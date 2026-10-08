import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const kioskIdParam = new URLSearchParams(window.location.search).get('kioskId');
const host = window.location.hostname;
const kioskId =
  kioskIdParam ||
  import.meta.env.VITE_KIOSK_ID ||
  (host.includes('mimo-2-0') || host.includes('mimo-kiosk-app') ? 'SV-002' : undefined);
// SV-002's screen is wider than the 16:9 canvas; widen the canvas instead of letterboxing it.
const isFullBleed = kioskId === 'SV-002';
if (isFullBleed) document.documentElement.classList.add('kiosk-full-bleed');

const updateScale = () => {
  const isPortrait = window.innerWidth <= 1000;
  let scale = 1;
  if (isPortrait) {
    scale = Math.min(window.innerWidth / 810, window.innerHeight / 1440);
  } else {
    scale = Math.min(window.innerWidth / 1440, window.innerHeight / 810);
  }
  document.documentElement.style.setProperty('--kiosk-scale', `${scale}`);
  if (isFullBleed) {
    const screenWidth = isPortrait ? window.innerHeight : window.innerWidth;
    document.documentElement.style.setProperty('--kiosk-width', `${screenWidth / scale}px`);
  }
};
window.addEventListener('resize', updateScale);
window.addEventListener('orientationchange', updateScale);
updateScale();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

