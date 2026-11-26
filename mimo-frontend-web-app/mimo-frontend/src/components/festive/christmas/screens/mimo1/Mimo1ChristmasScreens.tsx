import React, { useEffect, useRef, useState } from 'react';
import { Snowflake } from '@phosphor-icons/react';
import type { ChristmasScreensProps } from '../ChristmasScreenDecor';
import baubleImg from '../../../../../assets/christmas/mimo1/bauble.jpg';
import firBowImg from '../../../../../assets/christmas/mimo1/fir-bow.jpg';
import spruceImg from '../../../../../assets/christmas/mimo1/spruce.jpg';
import './mimo1-christmas-screens.css';

/**
 * MIMO 1.0 (CV-001) Christmas design for every screen after the welcome screen: "Golden Eve".
 * Cream and champagne gold with Christmas red and pine green accents, real photos (CC0 / public domain,
 * see assets/christmas/mimo1/CREDITS.md).
 *
 * Purely decorative. This layer sits above the real screens with pointer events off, and it only READS the
 * real screen (where its elements sit, how many code digits are typed, which % the printing ring shows) so
 * the decorations follow it. It never writes to the real screens or changes their behaviour.
 * Motion is transform / opacity only, and everything stops under prefers-reduced-motion (see the CSS).
 */

const W = 1440;
const H = 810;

type Rect = { x: number; y: number; w: number; h: number };

/** CV-001 is the only kiosk that renders the MIMO 1.0 screens this layer is laid out for. */
function useIsMimo1Screens(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const check = () => setOn(!!document.getElementById('root')?.classList.contains('theme-mimo1-diwali'));
    check();
    const id = window.setInterval(check, 1000);
    return () => window.clearInterval(id);
  }, []);
  return on;
}

/** Where a real-screen element sits, in the 1440x810 kiosk canvas (read-only, re-measured a few times a second). */
function useAnchor(stage: React.RefObject<HTMLDivElement | null>, selector: string | null, everyMs = 400): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const measure = () => {
      const s = stage.current;
      const el = document.querySelector(selector);
      if (!s || !el) {
        setRect((prev) => (prev === null ? prev : null));
        return;
      }
      const a = s.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      if (!a.width || !b.width) return;
      const k = W / a.width;
      const next = {
        x: Math.round((b.left - a.left) * k),
        y: Math.round((b.top - a.top) * k),
        w: Math.round(b.width * k),
        h: Math.round(b.height * k),
      };
      setRect((prev) =>
        prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next,
      );
    };
    measure();
    const id = window.setInterval(measure, everyMs);
    window.addEventListener('resize', measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', measure);
    };
  }, [stage, selector, everyMs]);
  return rect;
}

/* ─────────────── shared pieces ─────────────── */

const BULB_COLORS = ['red', 'gold', 'green', 'warm'] as const;

/** A string of fairy lights draped between two points (a gentle sag), each bulb twinkling on its own. */
const LightString: React.FC<{ x1: number; x2: number; y: number; sag: number; count: number }> = ({ x1, x2, y, sag, count }) => {
  const pts = Array.from({ length: count }, (_, i) => {
    const t = (i + 0.5) / count;
    const u = 2 * t - 1;
    const px = x1 + (x2 - x1) * t;
    const py = y + sag * (1 - u * u);
    const slope = (-2 * sag * u * 2) / (x2 - x1); // dy/dx of the sag curve
    return { x: px, y: py, deg: (Math.atan(slope) * 180) / Math.PI };
  });
  const wire = [{ x: x1, y }, ...pts, { x: x2, y }];
  return (
    <div className="m1x-lights">
      {wire.slice(1).map((p, i) => {
        const a = wire[i];
        const len = Math.hypot(p.x - a.x, p.y - a.y);
        const deg = (Math.atan2(p.y - a.y, p.x - a.x) * 180) / Math.PI;
        return <span key={`w${i}`} className="m1x-wire" style={{ left: a.x, top: a.y, width: len + 1, transform: `rotate(${deg}deg)` }} />;
      })}
      {pts.map((p, i) => (
        <span key={i} className="m1x-bulb-wrap" style={{ left: p.x, top: p.y, transform: `rotate(${p.deg}deg)` }}>
          <i
            className={`m1x-halo m1x-c-${BULB_COLORS[i % 4]} m1x-twinkle`}
            style={{ animationDelay: `${-((i * 0.73) % 2.6).toFixed(2)}s`, animationDuration: `${2.2 + ((i * 37) % 10) / 10}s` }}
          />
          <i className={`m1x-bulb m1x-c-${BULB_COLORS[i % 4]}`} />
        </span>
      ))}
    </div>
  );
};

/** A real glass bauble (photo) hanging on a gold thread, swinging slowly. */
const Bauble: React.FC<{ x: number; len: number; size: number; delay?: number }> = ({ x, len, size, delay = 0 }) => (
  <div className="m1x-bauble m1x-swing" style={{ left: x, height: len + size, animationDelay: `${delay}s` }}>
    <span className="m1x-thread" style={{ height: len - 6 }} />
    <span className="m1x-cap" style={{ top: len - 8 }} />
    <span className="m1x-ball" style={{ top: len, width: size, height: size, marginLeft: -size / 2, backgroundImage: `url(${baubleImg})` }} />
  </div>
);

/** A photo of real pine / bow / pine cones, faded softly out of a screen corner. */
const Spray: React.FC<{ corner: 'tr' | 'bl' | 'br' | 'tl'; img: string; size: number; pos?: string; zoom?: number }> = ({ corner, img, size, pos, zoom }) => (
  <div
    className={`m1x-spray m1x-spray--${corner}`}
    style={{ width: size, height: size, backgroundImage: `url(${img})`, backgroundPosition: pos ?? 'center', backgroundSize: zoom ? `${zoom}% auto` : undefined }}
  />
);

/* ─────────────── system error and maintenance: calm snow globe ─────────────── */

const SnowGlobe: React.FC<{ x: number; y: number; size: number }> = ({ x, y, size }) => (
  <div className="m1x-globe m1x-rise" style={{ left: x - size / 2, top: y - size / 2, width: size }}>
    <div className="m1x-globe-glass" style={{ width: size, height: size, backgroundImage: `url(${spruceImg})` }}>
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className="m1x-globe-flake"
          style={{ left: `${10 + ((i * 37) % 80)}%`, animationDelay: `${-((i * 1.37) % 6).toFixed(2)}s`, animationDuration: `${5 + (i % 3)}s` }}
        />
      ))}
      <span className="m1x-globe-shine" />
    </div>
    <div className="m1x-globe-base" />
  </div>
);

const MaintenanceDecor: React.FC<{ stage: React.RefObject<HTMLDivElement | null> }> = ({ stage }) => {
  const icon = useAnchor(stage, '.maint-screen .relative.z-10 > .mb-4');
  return (
    <>
      <Spray corner="tr" img={firBowImg} size={280} pos="62% 30%" />
      <Spray corner="bl" img={spruceImg} size={280} />
      <LightString x1={0} x2={1440} y={-10} sag={52} count={20} />
      <Bauble x={1226} len={150} size={80} delay={-0.6} />
      <Bauble x={1326} len={84} size={56} delay={-2} />
      <SnowGlobe x={196} y={430} size={170} />
      {icon && (
        <span className="m1x-maint-star" style={{ left: icon.x + icon.w / 2, top: icon.y + icon.h / 2 }}>
          <Snowflake size={46} weight="duotone" />
        </span>
      )}
    </>
  );
};

/* ─────────────── entry ─────────────── */

export const Mimo1ChristmasScreens: React.FC<ChristmasScreensProps> = ({ screen }) => {
  const stage = useRef<HTMLDivElement>(null);
  const isMimo1 = useIsMimo1Screens();
  return (
    <div ref={stage} className="m1x-stage" data-screen={screen} style={{ width: W, height: H }}>
      {/* Code entry, printing, summary and error render their own Christmas design on CV-001 (Mimo1XmasScreens.tsx). */}
      {isMimo1 && screen === 'maintenance-screen' && <MaintenanceDecor stage={stage} />}
    </div>
  );
};
