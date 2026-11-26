import React from 'react';
import heroPhoto from '../../../../../assets/christmas/mimo3-hero.jpg';
import './mimo3-xmas-flow.css';

/**
 * Full-screen frame for every MIMO 3.0 Christmas screen after the welcome (code entry, printing, summary, error):
 * the candle-lit house photo (CC0, see assets/christmas/CREDITS.md) fills the whole screen as the background,
 * with a bright cream wash where the content sits so text stays readable. Each screen frames the photo
 * differently (the house between text and keypad, close-up candlelight while printing, the house on the right).
 * Raspberry Pi budget: the photo drifts with one compositor-only transform, one glow breathes, three sparkles
 * twinkle (opacity / transform only). Nothing reads the DOM, nothing runs on timers.
 */
export type Mimo3XmasFrame = 'code' | 'print' | 'side';

export const Mimo3XmasShell: React.FC<{ frame: Mimo3XmasFrame; children: React.ReactNode }> = ({ frame, children }) => (
  <div className={`x3f x3f--${frame}`} data-theme="christmas">
    <div className="x3f-bg" aria-hidden>
      <div className="x3f-bg-frame">
        <img className="x3f-bg-img" src={heroPhoto} alt="" draggable={false} />
      </div>
      <span className="x3f-bg-glow" />
      <span className="x3f-bg-wash" />
      <span className="x3f-spark" />
      <span className="x3f-spark x3f-spark--sm" />
      <span className="x3f-spark x3f-spark--3" />
    </div>
    {children}
  </div>
);
