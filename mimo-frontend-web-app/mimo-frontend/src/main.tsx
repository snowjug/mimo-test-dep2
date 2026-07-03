import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const updateScale = () => {
  const isPortrait = window.innerWidth <= 1000;
  let scale = 1;
  if (isPortrait) {
    scale = Math.min(window.innerWidth / 810, window.innerHeight / 1440);
  } else {
    scale = Math.min(window.innerWidth / 1440, window.innerHeight / 810);
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

