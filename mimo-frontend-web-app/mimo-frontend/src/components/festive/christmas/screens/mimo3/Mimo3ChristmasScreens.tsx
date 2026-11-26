import React, { useEffect, useRef, useState } from 'react';
import { Star, Sparkle, CaretDown } from '@phosphor-icons/react';
import type { ChristmasScreensProps } from '../ChristmasScreenDecor';
import heroPhoto from '../../../../../assets/christmas/mimo3-hero.jpg';
import candlesPhoto from '../../../../../assets/christmas/mimo3/candles.jpg';
import giftPhoto from '../../../../../assets/christmas/mimo3/gift.jpg';
import './mimo3-christmas-screens.css';

/**
 * MIMO 3.0 "Candlelight" Christmas decor for the summary and error screens. Code entry and printing render their
 * own Christmas presentation (Mimo3XmasCodeEntry / Mimo3XmasPrinting, chosen inside the real screens), so this
 * layer draws nothing there and does no DOM polling while the customer types or prints.
 * Decorative only (see ChristmasScreenDecor): this layer never takes pointer events and never writes to the
 * real screens. It only READS their DOM (slot contents, the displayed progress, card positions) about once a second and on real changes
 * so the festive visuals line up with, and stay in sync with, what the real screen shows.
 */

type Box = { x: number; y: number; w: number; h: number };

/** Layer origin in screen pixels plus the CSS scale the kiosk applies to #root (screen px per layout px). */
type Origin = { left: number; top: number; k: number; width: number; height: number };

const rel = (el: Element | null | undefined, o: Origin): Box | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: Math.round((r.left - o.left) / o.k), y: Math.round((r.top - o.top) / o.k), w: Math.round(r.width / o.k), h: Math.round(r.height / o.k) };
};

/** Poll a read-only DOM measurement; only re-render when the result actually changes. */
function useDomReading<T>(rootRef: React.RefObject<HTMLDivElement | null>, read: (page: HTMLElement, origin: Origin) => T | null): T | null {
  const [value, setValue] = useState<T | null>(null);
  const last = useRef('');
  const readRef = useRef(read);
  readRef.current = read;
  useEffect(() => {
    const tick = () => {
      const root = rootRef.current;
      const page = root?.closest('.mimo3-xmas') as HTMLElement | null;
      if (!root || !page) return;
      const rr = root.getBoundingClientRect();
      const width = root.offsetWidth || rr.width;
      const k = rr.width / width || 1;
      const next = readRef.current(page, { left: rr.left, top: rr.top, k, width, height: root.offsetHeight || rr.height / k });
      const key = JSON.stringify(next);
      if (key !== last.current) {
        last.current = key;
        setValue(next);
      }
    };
    tick();
    // A slow poll catches layout changes; a MutationObserver reacts at once when the real screen's text changes
    // (a digit typed, the progress moving). Both only read.
    // Performance (Pi): poll once a second, and react to real-screen changes at most ~5 times a second.
    const id = window.setInterval(tick, 1000);
    let raf = 0;
    let lastRun = 0;
    let pending = 0;
    const page = rootRef.current?.closest('.mimo3-xmas');
    const mo = new MutationObserver((records) => {
      const own = rootRef.current;
      if (own && records.every((m) => own.contains(m.target))) return;
      if (raf || pending) return;
      const wait = Math.max(0, 200 - (performance.now() - lastRun));
      pending = window.setTimeout(() => {
        pending = 0;
        raf = window.requestAnimationFrame(() => { raf = 0; lastRun = performance.now(); tick(); });
      }, wait);
    });
    if (page) mo.observe(page, { subtree: true, childList: true, characterData: true });
    return () => {
      window.clearInterval(id);
      mo.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
      if (pending) window.clearTimeout(pending);
    };
  }, [rootRef]);
  return value;
}

/* ───────────────────────── shared pieces ───────────────────────── */

const BULB_COLORS = ['#D3263A', '#E9B54A', '#2F7D4F', '#F08A3C', '#E9B54A'];

/** Fairy-light garland draped along the top edge (above the header buttons, never over them). */
const Garland: React.FC = () => {
  const spans = 6;
  const perSpan = 3;
  const bulbs: { x: number; y: number; r: number; c: string; d: number }[] = [];
  for (let s = 0; s < spans; s++) {
    for (let k = 1; k <= perSpan; k++) {
      const t = k / (perSpan + 1);
      const u = 2 * t - 1;
      const x = ((s + t) / spans) * 100;
      const y = 6 + 13 * Math.sqrt(1 - u * u);
      const r = Math.atan(-u * 1.1) * (180 / Math.PI) * 0.35;
      const i = s * perSpan + k;
      bulbs.push({ x, y, r, c: BULB_COLORS[i % BULB_COLORS.length], d: (i * 0.37) % 2.4 });
    }
  }
  return (
    <div className="x3-garland">
      {Array.from({ length: spans }).map((_, s) => (
        <span key={s} className="x3-wire" style={{ left: `${(s / spans) * 100}%`, width: `${100 / spans}%` }} />
      ))}
      {bulbs.map((b, i) => (
        <span
          key={i}
          className="x3-bulb"
          style={{ left: `${b.x}%`, top: b.y, transform: `rotate(${b.r}deg)`, ['--c' as string]: b.c, animationDelay: `${b.d}s` } as React.CSSProperties}
        />
      ))}
    </div>
  );
};

/** A real photo in an arched, gold-edged frame with a soft candle flicker. */
const ArchPhoto: React.FC<{ src: string; box: Box; pos?: string; caption?: string; flicker?: boolean; delay?: number }> = ({
  src,
  box,
  pos = '50% 50%',
  caption,
  flicker = true,
  delay = 0,
}) => (
  <div className="x3-arch-wrap" style={{ left: box.x, top: box.y, width: box.w, height: box.h, animationDelay: `${delay}s` }}>
    <div className="x3-arch-float" style={{ animationDelay: `${delay}s` }}>
      <span className="x3-arch-star"><Star size={26} weight="fill" /></span>
      <div className="x3-arch">
        <img className="x3-arch-img" src={src} alt="" draggable={false} style={{ objectPosition: pos }} />
        {flicker && <span className="x3-arch-flicker" />}
        <span className="x3-arch-sheen" />
      </div>
      {caption && <div className="x3-arch-caption">{caption}</div>}
    </div>
  </div>
);

/** Small warm sparkles twinkling in place. */
const Twinkles: React.FC<{ points: { x: number; y: number; s?: number }[] }> = ({ points }) => (
  <>
    {points.map((p, i) => (
      <span key={i} className="x3-twinkle" style={{ left: p.x, top: p.y, animationDelay: `${(i * 0.53) % 2.6}s` }}>
        <Sparkle size={p.s ?? 18} weight="fill" />
      </span>
    ))}
  </>
);

/** One-shot burst of sparks (re-mounted with a new key to fire again). */
const Burst: React.FC<{ x: number; y: number; n?: number; dist?: number }> = ({ x, y, n = 8, dist = 46 }) => (
  <span className="x3-burst" style={{ left: x, top: y }}>
    {Array.from({ length: n }).map((_, i) => {
      const a = (i / n) * Math.PI * 2;
      return (
        <span
          key={i}
          className="x3-spark"
          style={{ ['--dx' as string]: `${Math.cos(a) * dist}px`, ['--dy' as string]: `${Math.sin(a) * dist}px`, background: BULB_COLORS[i % 4] } as React.CSSProperties}
        />
      );
    })}
  </span>
);

const ScreenCard = (page: HTMLElement, anchorSel: string): { card: Element | null; header: Element | null } => {
  const anchor = page.querySelector(anchorSel);
  const card = anchor?.closest('.rounded-\\[36px\\]') ?? null;
  const screenRoot = anchor?.closest('.h-full.w-full') ?? null;
  return { card, header: screenRoot?.querySelector('header') ?? null };
};

/** Two arched photos either side of a centred card, if there is room. */
const sideArches = (card: Box, vw: number, height = 330) => {
  const leftSpace = card.x;
  const rightSpace = vw - (card.x + card.w);
  const w = Math.min(230, Math.round(Math.min(leftSpace, rightSpace) - 90));
  if (w < 130) return null;
  const h = Math.round(Math.min(height, w * 1.45));
  const y = Math.round(card.y + card.h / 2 - h / 2);
  return {
    left: { x: Math.round(leftSpace / 2 - w / 2), y, w, h },
    right: { x: Math.round(card.x + card.w + rightSpace / 2 - w / 2), y, w, h },
  };
};

// Performance: the static pieces re-render only when their props really change (compared by value, because
// the DOM readings hand over fresh objects).
const sameProps = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);
const GarlandM = React.memo(Garland);
const ArchPhotoM = React.memo(ArchPhoto, sameProps);
const TwinklesM = React.memo(Twinkles, sameProps);

/* ───────────────────────── summary: your pages are a gift ───────────────────────── */

type CardReading = { vw: number; vh: number; card: Box | null; header: Box | null };

const readCard = (anchor: string) => (page: HTMLElement, o: Origin): CardReading | null => {
  const { card, header } = ScreenCard(page, anchor);
  if (!card) return null;
  return { vw: Math.round(o.width), vh: Math.round(o.height), card: rel(card, o), header: rel(header, o) };
};

const SummaryDecor: React.FC<{ rootRef: React.RefObject<HTMLDivElement | null> }> = ({ rootRef }) => {
  const r = useDomReading<CardReading>(rootRef, readCard('#summary-done-btn'));
  if (!r || !r.card) return null;
  const c = r.card;
  const headerBottom = r.header ? r.header.y + r.header.h : 0;
  const bannerSpace = c.y - headerBottom - 10;
  const bannerScale = Math.max(0.5, Math.min(1, bannerSpace / 104));
  const leftSpace = c.x;
  const rightSpace = r.vw - (c.x + c.w);
  const giftW = Math.min(360, leftSpace - 24);
  const showGift = giftW >= 180;
  const giftX = Math.round(leftSpace / 2 - giftW / 2);
  const giftH = Math.round(giftW * 1.0);
  const giftY = Math.round(Math.max(headerBottom + 40, c.y + c.h / 2 - giftH / 2 + 20));
  const arches = sideArches(c, r.vw);
  const belowSpace = r.vh - (c.y + c.h);

  return (
    <>
      {bannerSpace > 56 && (
        <div className="x3-banner" style={{ left: 0, right: 0, top: headerBottom, height: bannerSpace }}>
          <div className="x3-banner-inner" style={{ transform: `scale(${bannerScale})` }}>
            <div className="x3-banner-script">Merry Christmas!</div>
            <div className="x3-banner-sub">Your pages are ready below.</div>
          </div>
        </div>
      )}
      {bannerSpace > 56 && <Burst x={r.vw / 2} y={headerBottom + bannerSpace * 0.42} n={14} dist={260} />}

      {showGift && (
        <div className="x3-gift" style={{ left: giftX, top: giftY, width: giftW, height: giftH }}>
          <span className="x3-gift-rays" />
          <span className="x3-gift-halo" />
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className="x3-page"
              style={{ ['--px' as string]: `${(i - 2) * 34}px`, ['--pr' as string]: `${(i - 2) * 9}deg`, animationDelay: `${0.35 + i * 0.7}s` } as React.CSSProperties}
            >
              <span className="x3-page-lines" />
            </span>
          ))}
          <div className="x3-gift-photo">
            <img src={giftPhoto} alt="" draggable={false} />
          </div>
          <TwinklesM
            points={[
              { x: giftW * 0.12, y: giftH * 0.18, s: 22 },
              { x: giftW * 0.86, y: giftH * 0.1, s: 18 },
              { x: giftW * 0.92, y: giftH * 0.55, s: 14 },
              { x: giftW * 0.05, y: giftH * 0.62, s: 16 },
            ]}
          />
        </div>
      )}

      {arches && rightSpace > 300 && (
        <ArchPhotoM src={heroPhoto} box={{ ...arches.right, y: Math.max(headerBottom + 30, arches.right.y + 20) }} pos="62% 55%" caption="Happy holidays" />
      )}

      {belowSpace > 90 && (
        <div className="x3-collect" style={{ left: r.vw / 2, top: c.y + c.h + 14, height: belowSpace - 60 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="x3-chev" style={{ animationDelay: `${i * 0.22}s` }}>
              <CaretDown size={34} weight="bold" />
            </span>
          ))}
        </div>
      )}
    </>
  );
};

/* ───────────────────────── error: calm and kind ───────────────────────── */

const ErrorDecor: React.FC<{ rootRef: React.RefObject<HTMLDivElement | null> }> = ({ rootRef }) => {
  const r = useDomReading<CardReading>(rootRef, readCard('#error-retry-btn'));
  if (!r || !r.card) return null;
  const c = r.card;
  const headerBottom = r.header ? r.header.y + r.header.h : 0;
  const bannerSpace = c.y - headerBottom;
  const arches = sideArches(c, r.vw, 310);
  const flakes = Array.from({ length: 16 }).map((_, i) => {
    const side = i % 2 === 0;
    const span = side ? c.x - 40 : r.vw - (c.x + c.w) - 40;
    const x = side ? 20 + ((i * 97) % Math.max(40, span)) : c.x + c.w + 20 + ((i * 89) % Math.max(40, span));
    return { x, size: 5 + (i % 4) * 2, dur: 11 + (i % 5) * 2.2, delay: -((i * 1.7) % 12) };
  });
  return (
    <>
      {bannerSpace > 70 && (
        <div className="x3-banner x3-banner--calm" style={{ left: 0, right: 0, top: headerBottom, height: bannerSpace }}>
          <div className="x3-banner-inner" style={{ transform: `scale(${Math.max(0.6, Math.min(1, bannerSpace / 150))})` }}>
            <div className="x3-banner-script x3-banner-script--calm">{"Don't worry, we're here to help"}</div>
          </div>
        </div>
      )}
      {flakes.map((f, i) => (
        <span
          key={i}
          className="x3-flake"
          style={{ left: f.x, width: f.size, height: f.size, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s` }}
        />
      ))}
      {arches && <ArchPhotoM src={heroPhoto} box={arches.left} pos="30% 40%" caption="Warm wishes" />}
      {arches && <ArchPhotoM src={candlesPhoto} box={arches.right} pos="50% 30%" delay={1.4} caption="Thank you for your patience" />}
    </>
  );
};

/* ───────────────────────── entry ───────────────────────── */

export const Mimo3ChristmasScreens: React.FC<ChristmasScreensProps> = ({ screen }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  if (screen === 'code-entry-screen' || screen === 'printing-screen') return null;
  return (
    <div className="x3" data-screen={screen} ref={rootRef}>
      <GarlandM />
      {screen === 'summary-screen' && <SummaryDecor rootRef={rootRef} />}
      {screen === 'system-error-screen' && <ErrorDecor rootRef={rootRef} />}
    </div>
  );
};
