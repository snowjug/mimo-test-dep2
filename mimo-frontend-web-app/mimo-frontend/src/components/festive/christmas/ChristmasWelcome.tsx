import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check } from '@phosphor-icons/react';
import mimo1Hero from '../../../assets/christmas/mimo1-hero.jpg';
import mimo2Hero from '../../../assets/christmas/mimo2-hero.jpg';
import mimo3Hero from '../../../assets/christmas/mimo3-hero.jpg';
import './christmas.css';

/**
 * Christmas theme for MIMO 1.0 (CV-001), 2.0 (SV-002) and 3.0 (SV-003): a different photographic welcome
 * screen per machine, plus ChristmasBackdrop / ChristmasSnow which give every other screen the same festive
 * look. Turned on per machine from the admin dashboard (see hooks/useKioskTheme.ts).
 * Photos: CC0 / public domain (src/assets/christmas/CREDITS.md). Raspberry Pi friendly: no runtime blur or
 * filters (inner-screen photos are pre-blurred), animations only use transform and opacity, and everything is
 * still under prefers-reduced-motion.
 */

export type ChristmasVariant = 'mimo1' | 'mimo2' | 'mimo3';
export const christmasVariantFor = (kioskId?: string | null): ChristmasVariant =>
  kioskId === 'SV-003' || kioskId === 'MIMO-3' ? 'mimo3' : kioskId === 'SV-002' ? 'mimo2' : 'mimo1';

/* ─────────────── falling snow (three depths) and gold dust ─────────────── */

const makeFlakes = (count: number, seed: number) =>
  Array.from({ length: count }, (_, i) => {
    const n = i + seed * 31;
    return {
      left: (n * 37 + 11) % 100,
      delay: -((n * 17) % 18),
      drift: (n % 2 ? 1 : -1) * (12 + ((n * 7) % 30)),
    };
  });
const LAYERS = [
  { flakes: makeFlakes(14, 1), size: 3, duration: 18, opacity: 0.55 },
  { flakes: makeFlakes(10, 2), size: 5, duration: 13, opacity: 0.75 },
  { flakes: makeFlakes(6, 3), size: 8, duration: 9, opacity: 0.9 },
];

export const ChristmasSnow: React.FC<{ color?: string; dense?: boolean }> = ({ color = '#FFFFFF', dense = true }) => (
  <div className="xmas-snow" aria-hidden>
    {(dense ? LAYERS : LAYERS.slice(0, 2)).map((layer, li) =>
      layer.flakes.map((f, i) => (
        <span
          key={`${li}-${i}`}
          className="xmas-flake"
          style={{
            left: `${f.left}%`,
            width: layer.size,
            height: layer.size,
            background: color,
            opacity: layer.opacity,
            animationDuration: `${layer.duration + (i % 4)}s`,
            animationDelay: `${f.delay}s`,
            ['--drift' as string]: `${f.drift}px`,
          }}
        />
      ))
    )}
  </div>
);

const GoldDust: React.FC = () => (
  <div className="xmas-dust" aria-hidden>
    {Array.from({ length: 18 }, (_, i) => (
      <span
        key={i}
        className="xmas-mote"
        style={{
          left: `${(i * 53 + 7) % 100}%`,
          top: `${(i * 29 + 13) % 100}%`,
          animationDelay: `${-((i * 7) % 11)}s`,
          animationDuration: `${8 + (i % 5) * 2}s`,
        }}
      />
    ))}
  </div>
);

/* Fairy-light bokeh: soft out-of-focus lights that drift and twinkle around the edges (never behind the
   content in the middle), plus one slow sweep of light across the screen. transform/opacity only. */
const BOKEH_SPOTS = [
  [4, 8], [14, 22], [8, 70], [3, 90], [22, 88], [88, 6], [95, 24], [80, 16], [92, 66], [86, 90], [70, 94], [30, 4], [62, 6], [50, 96],
];
const BOKEH_COLORS: Record<ChristmasVariant, string[]> = {
  mimo1: ['255,214,120', '255,190,90', '255,236,180', '240,170,70'],
  mimo2: ['255,255,255', '214,232,255', '255,120,130', '255,244,214'],
  mimo3: ['255,196,110', '255,170,90', '255,226,170', '255,140,70'],
};
export const ChristmasLights: React.FC<{ variant: ChristmasVariant; sweep?: boolean }> = ({ variant, sweep = true }) => (
  <div className="xmas-lights" aria-hidden>
    {BOKEH_SPOTS.map(([x, y], i) => {
      const size = 70 + ((i * 37) % 110);
      const rgb = BOKEH_COLORS[variant][i % 4];
      return (
        <span
          key={i}
          className="xmas-bokeh"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: size,
            height: size,
            marginLeft: -size / 2,
            marginTop: -size / 2,
            background: `radial-gradient(circle, rgba(${rgb},.85) 0%, rgba(${rgb},.35) 38%, rgba(${rgb},0) 70%)`,
            animationDuration: `${7 + (i % 5) * 2.2}s, ${2.6 + (i % 4) * 0.9}s`,
            animationDelay: `${-((i * 1.7) % 9)}s, ${-((i * 0.9) % 4)}s`,
          }}
        />
      );
    })}
    {sweep && <span className="xmas-sweep" />}
  </div>
);

/* ─────────────── swipe to start (same interaction as the default screens) ─────────────── */

const ChristmasSwipe: React.FC<{ onNext: () => void; isActive: boolean; tone: 'gold' | 'snow' | 'ember'; width?: number }> = ({
  onNext,
  isActive,
  tone,
  width = 500,
}) => {
  const THUMB = 70;
  const PAD = 8;
  const trackRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; base: number } | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState(false);
  const [trackW, setTrackW] = useState(width);

  useEffect(() => {
    if (!isActive) return;
    setDragX(0);
    setDone(false);
    setDragging(false);
    start.current = null;
    if (trackRef.current) setTrackW(trackRef.current.clientWidth);
  }, [isActive]);

  const max = Math.max(0, trackW - THUMB - PAD * 2);
  const progress = max > 0 ? dragX / max : 0;

  const finish = useCallback(() => {
    if (!start.current || done) return;
    start.current = null;
    setDragging(false);
    if (max > 0 && dragX >= max * 0.82) {
      setDragX(max);
      setDone(true);
      window.setTimeout(onNext, 320);
    } else {
      setDragX(0);
    }
  }, [done, dragX, max, onNext]);

  const ease = 'cubic-bezier(0.16, 1, 0.3, 1)';
  return (
    <div ref={trackRef} className={`xmas-swipe xmas-swipe--${tone}`} style={{ width, height: THUMB + PAD * 2, touchAction: 'none' }}>
      <div className="xmas-swipe-fill" style={{ width: dragX + THUMB + PAD * 2, transition: dragging ? 'none' : `width .35s ${ease}` }} />
      <div className="xmas-swipe-label" style={{ opacity: Math.max(0, 1 - progress * 1.6) }}>
        Swipe to start
      </div>
      <div
        role="slider"
        aria-label="Swipe to start"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        className={`xmas-swipe-thumb ${done ? 'is-done' : ''}`}
        onPointerDown={(e) => {
          if (done) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          start.current = { x: e.clientX, base: dragX };
          setDragging(true);
        }}
        onPointerMove={(e) => {
          if (!start.current || done) return;
          const el = trackRef.current;
          const scale = el && el.clientWidth ? el.getBoundingClientRect().width / el.clientWidth : 1;
          setDragX(Math.min(max, Math.max(0, start.current.base + (e.clientX - start.current.x) / (scale || 1))));
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        style={{ width: THUMB, height: THUMB, top: PAD, left: PAD, transform: `translateX(${dragX}px)`, transition: dragging ? 'none' : `transform .35s ${ease}` }}
      >
        {done ? <Check size={30} weight="bold" /> : <ArrowRight size={30} weight="bold" />}
      </div>
    </div>
  );
};

const Footer: React.FC<{ className?: string }> = ({ className = '' }) => (
  <footer className={`xmas-footer ${className}`}>
    © 2026 <strong>VisionPrintt</strong>. All rights reserved.
  </footer>
);

/* ─────────────── the three welcome screens ─────────────── */

interface ChristmasWelcomeProps {
  isActive: boolean;
  onNext: () => void;
  kioskId?: string | null;
}

export const ChristmasWelcome: React.FC<ChristmasWelcomeProps> = ({ isActive, onNext, kioskId }) => {
  if (!isActive) return null;
  const variant = christmasVariantFor(kioskId);

  // MIMO 1.0 - "Golden Eve": gold baubles full-bleed, warm dark fade on the left, text left-aligned.
  if (variant === 'mimo1') {
    return (
      <div className="xmas-screen xmas-1" data-theme="christmas">
        <img className="xmas-photo xmas-kenburns" src={mimo1Hero} alt="" draggable={false} />
        <div className="xmas-1-scrim" />
        <ChristmasLights variant="mimo1" />
        <GoldDust />
        <main className="xmas-1-copy">
          <p className="xmas-script xmas-reveal" style={{ ['--i' as string]: 0 }}>Merry Christmas</p>
          <h1 className="xmas-1-title xmas-reveal" style={{ ['--i' as string]: 1 }}>
            MIMO <span>1.0</span>
          </h1>
          <h2 className="xmas-1-sub xmas-reveal" style={{ ['--i' as string]: 2 }}>Self-Service Printing Kiosk</h2>
          <div className="xmas-reveal" style={{ ['--i' as string]: 3 }}>
            <ChristmasSwipe isActive={isActive} onNext={onNext} tone="gold" width={470} />
          </div>
        </main>
        <Footer className="xmas-1-footer" />
      </div>
    );
  }

  // MIMO 2.0 - "First Snow": a snowy pine forest, centred like the lily screen, three depths of falling snow.
  if (variant === 'mimo2') {
    return (
      <div className="xmas-screen xmas-2" data-theme="christmas">
        <img className="xmas-photo xmas-pan" src={mimo2Hero} alt="" draggable={false} />
        <div className="xmas-2-veil" />
        <ChristmasLights variant="mimo2" />
        <ChristmasSnow />
        <main className="xmas-2-copy">
          <p className="xmas-2-eyebrow xmas-reveal" style={{ ['--i' as string]: 0 }}>Welcome to</p>
          <h1 className="xmas-2-title xmas-reveal" style={{ ['--i' as string]: 1 }}>
            MIMO<sup>2.0</sup>
          </h1>
          <h2 className="xmas-2-sub xmas-reveal" style={{ ['--i' as string]: 2 }}>Self-Service Printing Kiosk</h2>
          <p className="xmas-script xmas-2-script xmas-reveal" style={{ ['--i' as string]: 3 }}>Merry Christmas</p>
        </main>
        <div className="xmas-2-swipe xmas-reveal" style={{ ['--i' as string]: 4 }}>
          <ChristmasSwipe isActive={isActive} onNext={onNext} tone="snow" width={560} />
        </div>
        <Footer className="xmas-2-footer" />
      </div>
    );
  }

  // MIMO 3.0 - "Candlelight": text on warm ivory at the left, the candle-lit photo fading in from the right.
  return (
    <div className="xmas-screen xmas-3" data-theme="christmas">
      <div className="xmas-3-photo">
        <img className="xmas-photo xmas-kenburns" src={mimo3Hero} alt="" draggable={false} />
        <div className="xmas-3-flicker" />
      </div>
      <div className="xmas-3-fade" />
      <ChristmasLights variant="mimo3" sweep={false} />
      <ChristmasSnow color="#E9D9C2" dense={false} />
      <main className="xmas-3-copy">
        <p className="xmas-script xmas-3-script xmas-reveal" style={{ ['--i' as string]: 0 }}>Merry Christmas</p>
        <h1 className="xmas-3-title xmas-reveal" style={{ ['--i' as string]: 1 }}>
          MIMO <span>3.0</span>
        </h1>
        <h2 className="xmas-3-sub xmas-reveal" style={{ ['--i' as string]: 2 }}>Self-Service Printing Kiosk</h2>
        <p className="xmas-3-note xmas-reveal" style={{ ['--i' as string]: 3 }}>Black and white or colour, with your 4-digit MIMO code.</p>
        <div className="xmas-reveal" style={{ ['--i' as string]: 4 }}>
          <ChristmasSwipe isActive={isActive} onNext={onNext} tone="ember" width={520} />
        </div>
      </main>
      <Footer className="xmas-3-footer" />
    </div>
  );
};

/**
 * Festive background for every non-welcome screen while the Christmas theme is on: the machine's photo,
 * pre-blurred and lightened so the screens' existing text stays readable, plus light snow.
 */
export const ChristmasBackdrop: React.FC<{ variant: ChristmasVariant }> = ({ variant }) => (
  <div className={`xmas-backdrop xmas-backdrop--${variant}`} aria-hidden>
    <ChristmasLights variant={variant} />
    <ChristmasSnow color={variant === 'mimo1' ? '#FFF3D6' : variant === 'mimo3' ? '#E9D9C2' : '#FFFFFF'} dense={false} />
  </div>
);
