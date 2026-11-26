import React, { useEffect, useState } from 'react';
import type { ChristmasScreensProps } from '../ChristmasScreenDecor';
import pineImg from '../../../../../assets/christmas/mimo2/pine-branch.jpg';
import giftImg from '../../../../../assets/christmas/mimo2/gift.jpg';
import baubleImg from '../../../../../assets/christmas/mimo2/bauble.png';
import './mimo2-christmas-screens.css';

/**
 * MIMO 2.0 "First Snow" Christmas design for the screens after the welcome screen.
 * Decorative only (see ChristmasScreenDecor): nothing here takes taps or touches print / code logic.
 * The printing garland only READS the percentage the real screen already shows; it never makes up progress.
 * Pi 5 budget: real photos are static textures, motion is transform / opacity only, under 40 animated
 * elements per screen (the backdrop included, see the CSS), and everything stops under prefers-reduced-motion.
 */

/* ───────────── shared pieces ───────────── */

/** A real snowy spruce branch tucked into a top corner, swaying very slowly. */
const PineCorner: React.FC<{ side: 'left' | 'right'; size?: number }> = ({ side, size = 1 }) => (
  <div className={`m2x-pine m2x-pine--${side}`} style={{ ['--s' as string]: size }}>
    <img src={pineImg} alt="" draggable={false} />
  </div>
);

type Bulb = { x: number; y: number; c: number };
const BULB_COLORS = ['red', 'gold', 'green', 'snow'];

/** Points along a string of fairy lights hung in swags between anchors (canvas px, 1440 x 810). */
const swagBulbs = (anchors: [number, number][], sag: number, perSwag: number): { bulbs: Bulb[]; path: string } => {
  const bulbs: Bulb[] = [];
  let path = `M ${anchors[0][0]} ${anchors[0][1]}`;
  for (let s = 0; s < anchors.length - 1; s++) {
    const [x0, y0] = anchors[s];
    const [x1, y1] = anchors[s + 1];
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2 + sag * 2;
    path += ` Q ${cx} ${cy} ${x1} ${y1}`;
    for (let i = 1; i <= perSwag; i++) {
      const t = i / (perSwag + 1);
      const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
      bulbs.push({ x, y, c: bulbs.length % 4 });
    }
  }
  return { bulbs, path };
};

/** Fairy-light string: a thin wire with glass bulbs. `lit` = how many bulbs glow (all when undefined). */
const LightString: React.FC<{ anchors: [number, number][]; sag: number; perSwag: number; lit?: number; twinkleEvery?: number }> = ({
  anchors,
  sag,
  perSwag,
  lit,
  twinkleEvery = 2,
}) => {
  const { bulbs, path } = swagBulbs(anchors, sag, perSwag);
  return (
    <div className="m2x-lights">
      <svg className="m2x-wire" viewBox="0 0 1440 810" preserveAspectRatio="none">
        <path d={path} />
      </svg>
      {bulbs.map((b, i) => {
        const on = lit === undefined || i < lit;
        const fresh = lit !== undefined && i === lit - 1;
        const twinkle = lit === undefined && i % twinkleEvery === 0;
        return (
          <span
            key={i}
            className={`m2x-bulb m2x-bulb--${BULB_COLORS[b.c]} ${on ? 'is-on' : ''} ${fresh ? 'is-fresh' : ''} ${twinkle ? 'is-twinkle' : ''}`}
            style={{ left: b.x, top: b.y, ['--d' as string]: `${-((i * 0.73) % 3).toFixed(2)}s` }}
          />
        );
      })}
    </div>
  );
};

/** Real red baubles hanging on gold threads, swinging gently. */
const Baubles: React.FC<{ items: { x: number; len: number; size: number }[] }> = ({ items }) => (
  <>
    {items.map((b, i) => (
      <div
        key={i}
        className="m2x-bauble"
        style={{ left: b.x, ['--len' as string]: `${b.len}px`, width: b.size, ['--d' as string]: `${-i * 1.3}s` }}
      >
        <i className="m2x-thread" />
        <img src={baubleImg} alt="" draggable={false} />
      </div>
    ))}
  </>
);

/** Sparkles that twinkle at fixed spots (transform / opacity only). */
const Sparkles: React.FC<{ spots: [number, number, number][] }> = ({ spots }) => (
  <>
    {spots.map(([x, y, s], i) => (
      <span key={i} className="m2x-sparkle" style={{ left: x, top: y, width: s, height: s, ['--d' as string]: `${(i * 0.37) % 2.4}s` }} />
    ))}
  </>
);

/* ───────────── code entry ───────────── */

const CODE_LIGHTS: [number, number][] = [[150, -6], [520, -6], [890, -6], [1210, -6]];

const CodeEntryDecor: React.FC = () => (
  <div className="m2x m2x--code">
    <LightString anchors={CODE_LIGHTS} sag={26} perSwag={4} twinkleEvery={2} />
    <PineCorner side="right" />
    <p className="m2x-script m2x-code-eyebrow">Merry Christmas</p>
  </div>
);

/* ───────────── printing: the garland lights up with the real progress ───────────── */

const PRINT_ANCHORS: [number, number][] = [[70, -4], [400, -4], [720, -4], [1040, -4], [1370, -4]];
const PRINT_BULBS = 20; // 4 swags x 5 bulbs: one bulb for every 5 %

/** Reads the percentage the real printing screen shows (read-only DOM poll, 250 ms). */
const useShownProgress = () => {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const read = () => {
      const el = document.querySelector('.printing-wrap.visible .circular-progress-container svg tspan');
      const n = parseInt(el?.textContent ?? '', 10);
      if (!Number.isNaN(n)) setPct(Math.max(0, Math.min(100, n)));
    };
    read();
    const id = window.setInterval(read, 250);
    return () => window.clearInterval(id);
  }, []);
  return pct;
};

const PrintingDecor: React.FC = () => {
  const pct = useShownProgress();
  const lit = Math.floor((pct / 100) * PRINT_BULBS);
  return (
    <div className={`m2x m2x--print ${pct >= 100 ? 'is-done' : ''}`}>
      <LightString anchors={PRINT_ANCHORS} sag={30} perSwag={5} lit={lit} />
      <PineCorner side="left" size={0.78} />
      <PineCorner side="right" size={0.78} />
      <div className="m2x-print-caption">
        <span className="m2x-print-caption-dot" />
        {pct >= 100 ? 'All lit up. Merry Christmas!' : 'Every light is a page on its way'}
      </div>
    </div>
  );
};

/* ───────────── summary: your pages are a gift ───────────── */

const SUMMARY_SPARKLES: [number, number, number][] = [
  [40, 120, 30], [70, 250, 20], [120, 40, 16], [430, 70, 22], [460, 190, 32], [420, 290, 18], [150, 300, 14], [370, 10, 14],
];

const SummaryDecor: React.FC = () => (
  <div className="m2x m2x--summary">
    <PineCorner side="left" size={0.9} />
    <PineCorner side="right" size={0.9} />
    <p className="m2x-script m2x-summary-script">Merry Christmas!</p>
    <div className="m2x-gift-stage">
      <div className="m2x-rays" />
      <div className="m2x-pages">
        <div className="m2x-page m2x-page--1"><i /><i /><i /></div>
        <div className="m2x-page m2x-page--2"><i /><i /><i /></div>
        <div className="m2x-page m2x-page--3"><b>Ready</b><i /><i /><i /></div>
      </div>
      <div className="m2x-gift">
        <img src={giftImg} alt="" draggable={false} />
      </div>
      <Sparkles spots={SUMMARY_SPARKLES} />
    </div>
  </div>
);

/* ───────────── error and maintenance: calm and kind ───────────── */

const CalmDecor: React.FC<{ kind: 'error' | 'maint' }> = ({ kind }) => (
  <div className={`m2x m2x--calm m2x--${kind}`}>
    <PineCorner side="right" size={0.85} />
    {kind === 'maint' && <PineCorner side="left" size={0.85} />}
    <Baubles
      items={
        kind === 'error'
          ? [{ x: 1180, len: 70, size: 64 }, { x: 1262, len: 150, size: 80 }, { x: 1345, len: 40, size: 56 }]
          : [{ x: 300, len: 90, size: 64 }, { x: 1080, len: 60, size: 56 }, { x: 1150, len: 140, size: 76 }]
      }
    />
    {kind === 'maint' && <p className="m2x-maint-note">Back soon. Happy holidays!</p>}
  </div>
);

export const Mimo2ChristmasScreens: React.FC<ChristmasScreensProps> = ({ screen }) => {
  switch (screen) {
    case 'code-entry-screen':
      return <CodeEntryDecor />;
    case 'printing-screen':
      return <PrintingDecor />;
    case 'summary-screen':
      return <SummaryDecor />;
    case 'system-error-screen':
      return <CalmDecor kind="error" />;
    case 'maintenance-screen':
      return <CalmDecor kind="maint" />;
    default:
      return null;
  }
};
