import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const updateScale = () => {
  const isPortrait = window.innerWidth <= 1000;
  let scale = 1;
  if (isPortrait) {
    scale = Math.min(window.innerWidth / 794, window.innerHeight / 1333);
  } else {
    scale = Math.min(window.innerWidth / 1333, window.innerHeight / 794);
  }
  document.documentElement.style.setProperty('--kiosk-scale', `${scale}`);
};
window.addEventListener('resize', updateScale);
window.addEventListener('orientationchange', updateScale);
updateScale();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

