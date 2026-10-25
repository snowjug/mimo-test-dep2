import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const updateScale = () => {
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

