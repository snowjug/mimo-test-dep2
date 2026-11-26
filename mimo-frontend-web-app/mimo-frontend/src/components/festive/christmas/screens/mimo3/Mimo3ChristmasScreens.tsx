import React, { useEffect, useRef, useState } from 'react';
import { Star, Sparkle, CaretDown, TreeEvergreen } from '@phosphor-icons/react';
import type { ChristmasScreensProps } from '../ChristmasScreenDecor';
import heroPhoto from '../../../../../assets/christmas/mimo3-hero.jpg';
import candlesPhoto from '../../../../../assets/christmas/mimo3/candles.jpg';
import baublesPhoto from '../../../../../assets/christmas/mimo3/baubles.jpg';
import giftPhoto from '../../../../../assets/christmas/mimo3/gift.jpg';
import './mimo3-christmas-screens.css';

/**
 * MIMO 3.0 "Candlelight" Christmas design for code entry, printing, summary and error.
 * Decorative only (see ChristmasScreenDecor): this layer never takes pointer events and never writes to the
 * real screens. It only READS their DOM (slot contents, the displayed progress, card positions) every 200 ms
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
    const id = window.setInterval(tick, 250);
    let raf = 0;
    const page = rootRef.current?.closest('.mimo3-xmas');
    const mo = new MutationObserver((records) => {
      const own = rootRef.current;
      if (own && records.every((m) => own.contains(m.target))) return;
      if (!raf) raf = window.requestAnimationFrame(() => { raf = 0; tick(); });
    });
    if (page) mo.observe(page, { subtree: true, childList: true, characterData: true });
    return () => {
      window.clearInterval(id);
      mo.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
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

/* ───────────────────────── code entry ───────────────────────── */

type CodeReading = { vw: number; slots: (Box & { lit: boolean })[]; pill: Box | null; heading: Box | null; pad: Box | null };

const CodeEntryDecor: React.FC<{ rootRef: React.RefObject<HTMLDivElement | null> }> = ({ rootRef }) => {
  const r = useDomReading<CodeReading>(rootRef, (page, o) => {
    const one = page.querySelector('#keypad-btn-1');
    const screen = one?.closest('.h-full.w-full');
    if (!screen) return null;
    const slots = Array.from(screen.querySelectorAll('.h-\\[88px\\].w-\\[76px\\]')).map((el) => ({
      ...(rel(el, o) as Box),
      lit: (el.textContent || '').trim().length > 0,
    }));
    return {
      vw: Math.round(o.width),
      slots,
      pill: rel(screen.querySelector('.inline-flex.rounded-full.px-4'), o),
      heading: rel(screen.querySelector('h2'), o),
      pad: rel(one?.closest('.rounded-\\[36px\\]'), o),
    };
  });

  // Fire a spark burst over each slot the moment it lights.
  const prevLit = useRef<boolean[]>([]);
  const [bursts, setBursts] = useState<Record<number, number>>({});
  useEffect(() => {
    if (!r) return;
    const lit = r.slots.map((s) => s.lit);
    const fired: Record<number, number> = {};
    lit.forEach((on, i) => {
      if (on && !prevLit.current[i]) fired[i] = Date.now();
    });
    prevLit.current = lit;
    if (Object.keys(fired).length) setBursts((b) => ({ ...b, ...fired }));
  }, [r]);

  if (!r) return null;
  const litCount = r.slots.filter((s) => s.lit).length;

  // Arched photo in the gap between the instructions and the keypad.
  let arch: Box | null = null;
  if (r.pad && r.heading) {
    const gapL = Math.max(...r.slots.map((s) => s.x + s.w), r.heading.x + r.heading.w, 0) + 44;
    const gapR = r.pad.x - 44;
    const w = Math.min(240, gapR - gapL);
    if (w >= 150) {
      const h = Math.round(w * 1.42);
      arch = { x: Math.round((gapL + gapR) / 2 - w / 2), y: Math.round(r.pad.y + r.pad.h / 2 - h / 2 - 18), w, h };
    }
  }

  return (
    <>
      {r.pill && (
        <div className="x3-pill" style={{ left: r.pill.x, top: r.pill.y, height: r.pill.h }}>
          <TreeEvergreen size={18} weight="fill" />
          <span>Merry Christmas</span>
        </div>
      )}

      {arch && <ArchPhoto src={heroPhoto} box={arch} pos="62% 55%" caption="Season's greetings" />}
      {arch && (
        <Twinkles
          points={[
            { x: arch.x - 26, y: arch.y + 40, s: 16 },
            { x: arch.x + arch.w + 10, y: arch.y + 110, s: 20 },
            { x: arch.x - 10, y: arch.y + arch.h - 60, s: 14 },
            { x: arch.x + arch.w + 2, y: arch.y + arch.h - 10, s: 16 },
          ]}
        />
      )}

      {/* Each code slot is a candle: it lights as its digit is typed. */}
      {r.slots.map((s, i) => (
        <React.Fragment key={i}>
          <span className={`x3-slot-halo${s.lit ? ' is-lit' : ''}`} style={{ left: s.x + s.w / 2, top: s.y - 6 }} />
          <span className={`x3-wick${s.lit ? ' is-lit' : ''}`} style={{ left: s.x + s.w / 2, top: s.y - 9 }} />
          {s.lit && (
            <span className="x3-flame-pos" style={{ left: s.x + s.w / 2, top: s.y - 6 }}>
              <span className="x3-flame" style={{ animationDelay: `${i * 0.31}s` }} />
            </span>
          )}
          {s.lit && bursts[i] && <Burst key={bursts[i]} x={s.x + s.w / 2} y={s.y - 22} n={8} dist={40} />}
        </React.Fragment>
      ))}

      {r.pad && (
        <span className={`x3-pad-star${litCount === 4 ? ' is-ready' : ''}`} style={{ left: r.pad.x + r.pad.w / 2, top: r.pad.y }}>
          <Star size={30} weight="fill" />
        </span>
      )}
    </>
  );
};

/* ───────────────────────── printing ───────────────────────── */

type PrintReading = { vw: number; progress: number | null; card: Box | null; header: Box | null; track: Box | null; fillPct: number | null };
const LIGHTS = 12;

const PrintingDecor: React.FC<{ rootRef: React.RefObject<HTMLDivElement | null> }> = ({ rootRef }) => {
  const r = useDomReading<PrintReading>(rootRef, (page, o) => {
    const track = page.querySelector('.h-6.w-full.overflow-hidden.rounded-full');
    if (!track) return null;
    const { card, header } = ScreenCard(page, '.h-6.w-full.overflow-hidden.rounded-full');
    // The progress the real screen is showing (its "NN% Completed" pill); never invented here.
    let progress: number | null = null;
    const pct = header?.textContent?.match(/(\d{1,3})% Completed/);
    if (pct) progress = Math.max(0, Math.min(100, Number(pct[1])));
    // The bar's target width (its inline style), so the star glides with the bar's own 300 ms transition.
    const w = (track.firstElementChild as HTMLElement | null)?.style.width ?? '';
    const fillPct = /%$/.test(w) ? Math.max(0, Math.min(100, parseFloat(w))) : null;
    return { vw: Math.round(o.width), progress, card: rel(card, o), header: rel(header, o), track: rel(track, o), fillPct };
  });
  if (!r || !r.card) return null;

  const lit = r.progress === null ? 0 : Math.floor((r.progress / 100) * LIGHTS + 1e-6);
  const c = r.card;
  const headerBottom = r.header ? r.header.y + r.header.h : 0;
  const anchorY = Math.max(headerBottom + 16, c.y - 120);
  const sagY = c.y - 34;
  const x0 = c.x - 40;
  const x1 = c.x + c.w + 40;
  const sag = sagY - anchorY;
  // Bulbs sit on the lower half of an ellipse, the same curve the string is drawn with.
  const lights = Array.from({ length: LIGHTS }).map((_, i) => {
    const t = (i + 0.5) / LIGHTS;
    const u = 2 * t - 1;
    const root = Math.sqrt(1 - u * u);
    const x = x0 + (x1 - x0) * t;
    const y = anchorY + sag * root;
    const slope = (sag * (-u / root) * 2) / (x1 - x0);
    const rot = Math.max(-38, Math.min(38, Math.atan(slope) * (180 / Math.PI)));
    return { x, y, rot, color: BULB_COLORS[i % BULB_COLORS.length] };
  });
  const arches = sideArches(c, r.vw);

  return (
    <>
      {sag > 20 && (
        <div className="x3-string" style={{ left: x0, top: anchorY, width: x1 - x0, height: sag + 2 }}>
          <span className="x3-string-curve" style={{ height: sag * 2, top: -sag }} />
        </div>
      )}
      {lights.map((l, i) => {
        const on = i < lit;
        return (
          <span key={i} className="x3-plight" style={{ left: l.x, top: l.y, transform: `rotate(${l.rot}deg)` }}>
            <span className="x3-plight-cap" />
            <span className={`x3-plight-glass${on ? ' is-on' : ''}`} style={{ ['--c' as string]: l.color, animationDelay: `${(i * 0.41) % 2}s` } as React.CSSProperties}>
              {on && <span className="x3-plight-pop" />}
            </span>
          </span>
        );
      })}

      {r.track && r.fillPct !== null && r.progress !== null && (
        <span
          className="x3-rider"
          style={{ transform: `translate3d(${r.track.x + 5 + ((r.track.w - 10) * r.fillPct) / 100}px, ${r.track.y + r.track.h / 2}px, 0)` }}
        >
          <span className="x3-rider-glow" />
          <span className="x3-rider-star"><Star size={30} weight="fill" /></span>
        </span>
      )}

      {arches && <ArchPhoto src={candlesPhoto} box={arches.left} pos="50% 30%" caption="Lighting up your pages" />}
      {arches && <ArchPhoto src={baublesPhoto} box={arches.right} pos="50% 40%" flicker={false} delay={1.2} caption="Wrapped with care" />}
    </>
  );
};

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
          <Twinkles
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
        <ArchPhoto src={heroPhoto} box={{ ...arches.right, y: Math.max(headerBottom + 30, arches.right.y + 20) }} pos="62% 55%" caption="Happy holidays" />
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
      {arches && <ArchPhoto src={heroPhoto} box={arches.left} pos="30% 40%" caption="Warm wishes" />}
      {arches && <ArchPhoto src={candlesPhoto} box={arches.right} pos="50% 30%" delay={1.4} caption="Thank you for your patience" />}
    </>
  );
};

/* ───────────────────────── entry ───────────────────────── */

export const Mimo3ChristmasScreens: React.FC<ChristmasScreensProps> = ({ screen }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <div className="x3" data-screen={screen} ref={rootRef}>
      <Garland />
      {screen === 'code-entry-screen' && <CodeEntryDecor rootRef={rootRef} />}
      {screen === 'printing-screen' && <PrintingDecor rootRef={rootRef} />}
      {screen === 'summary-screen' && <SummaryDecor rootRef={rootRef} />}
      {screen === 'system-error-screen' && <ErrorDecor rootRef={rootRef} />}
    </div>
  );
};
