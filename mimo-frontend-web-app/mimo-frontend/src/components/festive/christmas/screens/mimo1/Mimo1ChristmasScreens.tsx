import React, { useEffect, useRef, useState } from 'react';
import { Check, Snowflake, Sparkle, Star } from '@phosphor-icons/react';
import type { ChristmasScreensProps } from '../ChristmasScreenDecor';
import baubleImg from '../../../../../assets/christmas/mimo1/bauble.jpg';
import firBowImg from '../../../../../assets/christmas/mimo1/fir-bow.jpg';
import giftImg from '../../../../../assets/christmas/mimo1/gift.jpg';
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

/** Reads a value from the real screen's DOM every `everyMs` (read-only). */
function useDomValue<T>(read: () => T, everyMs: number): T {
  const readRef = useRef(read);
  readRef.current = read;
  const [value, setValue] = useState<T>(() => read());
  useEffect(() => {
    const tick = () => setValue(readRef.current());
    tick();
    const id = window.setInterval(tick, everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return value;
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

/** A satin bow tied from CSS ribbon (loops, knot, tails), for the ribbon on the printing card. */
const RibbonBow: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <div className="m1x-cssbow" style={{ left: x, top: y }}>
    <span className="m1x-cssbow-tail is-l" />
    <span className="m1x-cssbow-tail is-r" />
    <span className="m1x-cssbow-loop is-l" />
    <span className="m1x-cssbow-loop is-r" />
    <span className="m1x-cssbow-knot" />
  </div>
);

const Script: React.FC<{ x: number; y: number; children: React.ReactNode; center?: boolean }> = ({ x, y, children, center }) => (
  <p className={`m1x-script m1x-rise${center ? ' is-center' : ''}`} style={{ left: x, top: y }}>
    {children}
  </p>
);

/* ─────────────── code entry ─────────────── */

const CodeEntryDecor: React.FC<{ stage: React.RefObject<HTMLDivElement | null> }> = ({ stage }) => {
  const heading = useAnchor(stage, '.mimo1-code-entry-screen h1');
  const slots = useAnchor(stage, '.mimo1-code-entry-screen h1 + div');
  const filled = useDomValue(
    () => document.querySelectorAll('.mimo1-code-entry-screen h1 + div > div > span').length,
    120,
  );
  const slotW = slots ? (slots.w - 3 * 20) / 4 : 88;
  return (
    <>
      <Spray corner="tr" img={firBowImg} size={300} pos="62% 30%" />
      <Spray corner="bl" img={spruceImg} size={330} />
      <Spray corner="br" img={spruceImg} size={230} pos="80% 70%" />
      <LightString x1={232} x2={1440} y={-6} sag={64} count={18} />
      <Bauble x={724} len={118} size={88} />
      <Bauble x={822} len={206} size={62} delay={-1.6} />
      {heading && <Script x={heading.x + 2} y={heading.y - 64}>Merry Christmas</Script>}
      {slots &&
        filled > 0 && (
          <div
            key={filled}
            className="m1x-burst"
            style={{ left: slots.x + (filled - 1) * (slotW + 20) + slotW / 2, top: slots.y + slots.h / 2 }}
          >
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className="m1x-burst-ray" style={{ transform: `rotate(${i * 60 + 15}deg)` }}>
                <Sparkle size={16} weight="fill" />
              </span>
            ))}
          </div>
        )}
    </>
  );
};

/* ─────────────── printing ─────────────── */

const RING_BULBS = 24;

const PrintingDecor: React.FC<{ stage: React.RefObject<HTMLDivElement | null> }> = ({ stage }) => {
  const card = useAnchor(stage, '.mimo1-printing-screen > div:nth-child(1)');
  const ring = useAnchor(stage, '.mimo1-printing-screen > div:nth-child(2)');
  // The real % the ring shows (read-only). Never invented: no reading, no lit bulbs.
  const pct = useDomValue(() => {
    const el = document.querySelector('.mimo1-printing-screen > div:nth-child(2)');
    const m = el && /(\d{1,3})\s*%/.exec(el.textContent || '');
    return m ? Math.min(100, Number(m[1])) : 0;
  }, 250);
  const collecting = useDomValue(() => !!document.querySelector('.mimo1-printing-screen > .absolute.inset-0'), 400);
  if (collecting) return null;

  const cx = ring ? ring.x + ring.w / 2 : 0;
  const cy = ring ? ring.y + ring.h / 2 : 0;
  const R = ring ? ring.w / 2 + 20 : 0;
  const done = pct >= 100;
  return (
    <>
      <Spray corner="tl" img={spruceImg} size={250} pos="30% 40%" />
      <Spray corner="br" img={firBowImg} size={290} pos="100% 92%" zoom={260} />
      <LightString x1={0} x2={1440} y={-8} sag={58} count={16} />
      <Bauble x={560} len={150} size={74} delay={-0.8} />
      <Bauble x={668} len={96} size={56} delay={-2.1} />
      {card && <Script x={card.x + 6} y={card.y - 66}>Merry Christmas</Script>}
      {card && (
        <div className="m1x-ribbon" style={{ left: card.x + card.w - 44, top: card.y + 2, height: card.h - 6 }}>
          <span className="m1x-ribbon-shine" />
        </div>
      )}
      {card && <RibbonBow x={card.x + card.w - 31} y={card.y + 4} />}
      {ring && (
        <div className="m1x-wreath" style={{ left: cx, top: cy }}>
          <span className="m1x-wreath-wire" style={{ width: R * 2, height: R * 2, marginLeft: -R, marginTop: -R }} />
          {Array.from({ length: RING_BULBS }, (_, i) => {
            const lit = pct > (i / RING_BULBS) * 100;
            const deg = (i / RING_BULBS) * 360;
            const color = BULB_COLORS[i % 4];
            return (
              <span key={i} className={`m1x-ring-bulb${lit ? ' is-lit' : ''}`} style={{ transform: `rotate(${deg}deg) translate3d(0, ${-R}px, 0) rotate(180deg)` }}>
                {lit && i % 2 === 0 && (
                  <i
                    className={`m1x-halo m1x-c-${color} m1x-twinkle`}
                    style={{ animationDelay: `${-((i * 0.61) % 2.4).toFixed(2)}s` }}
                  />
                )}
                <i className="m1x-bulb m1x-glass" />
                <i className={`m1x-bulb m1x-c-${color} m1x-lit-glass`} />
              </span>
            );
          })}
          <span className={`m1x-ring-star${done ? ' is-done' : ''}`} style={{ top: -R }}>
            <i className="m1x-ring-star-glow" />
            <Star size={44} weight="fill" />
          </span>
          {done && (
            <div className="m1x-burst m1x-burst--big" style={{ left: 0, top: 0 }}>
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i} className="m1x-burst-ray" style={{ transform: `rotate(${i * 45 + 22}deg)` }}>
                  <Sparkle size={22} weight="fill" />
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
};

/* ─────────────── summary: your pages are a gift ─────────────── */

const SummaryDecor: React.FC<{ stage: React.RefObject<HTMLDivElement | null> }> = ({ stage }) => {
  const heading = useAnchor(stage, '.mimo1-summary-screen h1');
  const stageRect = useAnchor(stage, '.mimo1-summary-screen h1 + div.relative');
  return (
    <>
      <Spray corner="tr" img={firBowImg} size={300} pos="62% 30%" />
      <Spray corner="bl" img={spruceImg} size={300} />
      <LightString x1={0} x2={1440} y={-8} sag={58} count={18} />
      <Bauble x={206} len={150} size={86} delay={-0.4} />
      <Bauble x={300} len={74} size={58} delay={-1.9} />
      <Bauble x={1232} len={132} size={80} delay={-1.2} />
      {heading && (
        <Script x={W / 2} y={heading.y - 74} center>
          Merry Christmas!
        </Script>
      )}
      {stageRect && <GiftScene r={stageRect} />}
    </>
  );
};

const GiftScene: React.FC<{ r: Rect }> = ({ r }) => {
  const cx = r.x + r.w / 2;
  const giftSize = 236;
  const giftTop = r.y + r.h - giftSize + 6;
  return (
    <div className="m1x-gift-scene">
      <div className="m1x-rays" style={{ left: cx - 260, top: r.y + r.h / 2 - 260 }} />
      <div className="m1x-glow" style={{ left: cx - 230, top: r.y + r.h / 2 - 200 }} />
      {[
        { dx: -78, rot: -13, lift: 128, delay: 0.95 },
        { dx: 74, rot: 11, lift: 122, delay: 1.1 },
        { dx: 0, rot: -1, lift: 150, delay: 1.25 },
      ].map((s, i) => (
        <div
          key={i}
          className="m1x-sheet-rise"
          style={{ left: cx - 66 + s.dx, top: giftTop + 40 - s.lift, ['--m1x-lift' as string]: `${s.lift}px`, animationDelay: `${s.delay}s` }}
        >
          <div className="m1x-sheet" style={{ transform: `rotate(${s.rot}deg)`, animationDelay: `${-i * 1.3}s` }}>
            {i === 2 && (
              <span className="m1x-sheet-badge">
                <Check size={18} weight="bold" />
              </span>
            )}
            <span className="m1x-line" style={{ width: '78%' }} />
            <span className="m1x-line" style={{ width: '62%' }} />
            <span className="m1x-line" style={{ width: '70%' }} />
            <span className="m1x-line" style={{ width: '48%' }} />
          </div>
        </div>
      ))}
      <div className="m1x-gift" style={{ left: cx - giftSize / 2 - 8, top: giftTop, width: giftSize, height: giftSize, backgroundImage: `url(${giftImg})` }} />
      <div className="m1x-burst m1x-burst--gift" style={{ left: cx, top: giftTop + 20 }}>
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className="m1x-burst-ray" style={{ transform: `rotate(${i * 45 - 8}deg)` }}>
            <Sparkle size={i % 2 ? 18 : 26} weight="fill" />
          </span>
        ))}
      </div>
      {[
        { x: -188, y: 40, s: 20, d: 0 },
        { x: 182, y: 22, s: 16, d: -0.9 },
        { x: -150, y: 186, s: 14, d: -1.7 },
        { x: 210, y: 150, s: 22, d: -2.4 },
        { x: -40, y: -14, s: 12, d: -1.2 },
      ].map((t, i) => (
        <span key={i} className="m1x-star m1x-twinkle-star" style={{ left: cx + t.x, top: r.y + t.y, animationDelay: `${t.d}s` }}>
          <Sparkle size={t.s} weight="fill" />
        </span>
      ))}
      <div className="m1x-tag" style={{ left: cx + 96, top: giftTop + 92 }}>
        <span className="m1x-tag-hole" />
        <span className="m1x-tag-text">
          Your pages are
          <br />
          ready below
        </span>
      </div>
    </div>
  );
};

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

const ErrorDecor: React.FC = () => (
  <>
    <Spray corner="tr" img={spruceImg} size={240} pos="70% 30%" />
    <Spray corner="bl" img={spruceImg} size={260} />
    <LightString x1={0} x2={590} y={-10} sag={52} count={9} />
    <LightString x1={850} x2={1440} y={-10} sag={52} count={9} />
    <Bauble x={1300} len={120} size={70} delay={-1} />
    <SnowGlobe x={1318} y={440} size={156} />
  </>
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
      {isMimo1 && screen === 'code-entry-screen' && <CodeEntryDecor stage={stage} />}
      {isMimo1 && screen === 'printing-screen' && <PrintingDecor stage={stage} />}
      {isMimo1 && screen === 'summary-screen' && <SummaryDecor stage={stage} />}
      {isMimo1 && screen === 'system-error-screen' && <ErrorDecor />}
      {isMimo1 && screen === 'maintenance-screen' && <MaintenanceDecor stage={stage} />}
    </div>
  );
};
