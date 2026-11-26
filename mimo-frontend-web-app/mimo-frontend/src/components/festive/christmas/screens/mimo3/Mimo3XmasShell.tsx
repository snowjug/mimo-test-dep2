import React from 'react';
import heroPhoto from '../../../../../assets/christmas/mimo3-hero.jpg';
import './mimo3-xmas-flow.css';

/**
 * Shared frame for the MIMO 3.0 Christmas code-entry and printing screens: a tall candle-lit photo panel on the
 * left (CC0, see assets/christmas/CREDITS.md) and the working area on the right. Bright, warm and quiet.
 * Raspberry Pi budget: the photo drifts with one compositor-only transform, a few sparkles twinkle (opacity /
 * transform only), nothing reads the DOM and nothing runs on timers.
 */
const PHOTO_POS = { code: '62% 50%', print: '16% 40%' } as const;

export const Mimo3XmasShell: React.FC<{ photo: keyof typeof PHOTO_POS; caption: string; children: React.ReactNode }> = ({ photo, caption, children }) => (
  <div className={`x3f x3f--${photo}`} data-theme="christmas">
    <aside className="x3f-photo" aria-hidden>
      <img className="x3f-photo-img" src={heroPhoto} alt="" draggable={false} style={{ objectPosition: PHOTO_POS[photo] }} />
      <span className="x3f-photo-glow" />
      <span className="x3f-photo-shade" />
      <span className="x3f-spark" style={{ left: '18%', top: '14%' }} />
      <span className="x3f-spark x3f-spark--sm" style={{ left: '78%', top: '24%', animationDelay: '1.3s' }} />
      <span className="x3f-spark" style={{ left: '64%', top: '58%', animationDelay: '2.4s' }} />
      <div className="x3f-photo-copy">
        <p className="x3f-script">Merry Christmas</p>
        <p className="x3f-photo-sub">{caption}</p>
        <p className="x3f-photo-brand">MIMO 3.0 · Self-service printing</p>
      </div>
    </aside>
    <div className="x3f-work">{children}</div>
  </div>
);
