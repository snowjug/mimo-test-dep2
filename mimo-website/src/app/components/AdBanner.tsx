import { useEffect, useRef, useState } from "react";
import api from "../api";

interface Ad {
  id: string;
  imageUrl: string | null;
  link: string | null;
  caption: string | null;
}

const AUTO_SLIDE_MS = 3000;

/** Returns null while loading, [] if none, or the ad list. */
function useAds(): Ad[] | null {
  const [ads, setAds] = useState<Ad[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.get<{ ads: Ad[] }>("/api/ads")
      .then((r) => { if (!cancelled) setAds(r.data.ads ?? []); })
      .catch(() => { if (!cancelled) setAds([]); });
    return () => { cancelled = true; };
  }, []);
  return ads;
}

/** Wraps around using modulo so it never goes out of bounds. */
function wrap(n: number, len: number) {
  return ((n % len) + len) % len;
}

/**
 * AdBanner — dynamic, admin-managed replacement for the hardcoded HackathonBanner.
 *
 * - Renders nothing (no layout shift) when there are no active ads.
 * - Auto-slides every 3 s when there are multiple ads.
 * - Supports touch/mouse swipe to navigate.
 * - Opens the ad link in a new tab when tapped (if a link is configured).
 */
export function AdBanner() {
  const ads = useAds();
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Touch/mouse swipe state
  const dragStartX = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const startTimer = (count: number) => {
    clearTimer();
    if (count < 2) return;
    timerRef.current = setInterval(() => {
      setIndex((i) => wrap(i + 1, count));
    }, AUTO_SLIDE_MS);
  };

  useEffect(() => {
    if (!ads || ads.length === 0) return;
    setIndex(0);
    startTimer(ads.length);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ads?.length]);

  // Nothing to show while loading or when there are no ads
  if (!ads || ads.length === 0) return null;

  const current = ads[wrap(index, ads.length)];

  const goTo = (i: number) => {
    setIndex(wrap(i, ads.length));
    startTimer(ads.length);
  };

  // ── Drag / swipe handlers ──────────────────────────────────────────────────
  const onDragStart = (clientX: number) => {
    dragStartX.current = clientX;
  };
  const onDragEnd = (clientX: number) => {
    if (dragStartX.current === null) return;
    const delta = dragStartX.current - clientX;
    if (Math.abs(delta) > 40) goTo(index + (delta > 0 ? 1 : -1));
    dragStartX.current = null;
  };

  const AdContent = (
    <div
      className="flex gap-4 overflow-hidden rounded-[20px] bg-surface p-3 relative select-none"
      /* Touch */
      onTouchStart={(e) => onDragStart(e.touches[0].clientX)}
      onTouchEnd={(e) => onDragEnd(e.changedTouches[0].clientX)}
      /* Mouse */
      onMouseDown={(e) => onDragStart(e.clientX)}
      onMouseUp={(e) => onDragEnd(e.clientX)}
    >
      {/* Image */}
      {current.imageUrl && (
        <div className="shrink-0 overflow-hidden rounded-[12px]" aria-hidden="true">
          <img
            src={current.imageUrl}
            alt=""
            width={96}
            height={144}
            loading="lazy"
            decoding="async"
            className="h-36 w-24 object-cover"
            draggable={false}
          />
        </div>
      )}

      {/* Caption */}
      {current.caption && (
        <div className="flex min-w-0 flex-1 flex-col py-1">
          <p className="mt-0.5 text-[17px] font-semibold leading-tight tracking-tight text-ink">
            {current.caption}
          </p>
        </div>
      )}

      {/* Dot indicators (only when >1 ad) */}
      {ads.length > 1 && (
        <div className="absolute bottom-3 right-3 flex gap-1.5" role="tablist" aria-label="Advertisement slides">
          {ads.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Slide ${i + 1}`}
              onClick={(e) => { e.stopPropagation(); goTo(i); }}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                i === index ? "w-4 bg-brand" : "w-1.5 bg-ink-4 opacity-40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <section aria-label="Advertisement" className="mt-8">
      <h2 className="mb-2 px-1 text-[13px] font-medium text-ink-3">Announcements</h2>

      {/* Wrap in <a> only if a link is present */}
      {current.link ? (
        <a
          href={current.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
          aria-label={current.caption ?? "View announcement"}
        >
          {AdContent}
        </a>
      ) : (
        AdContent
      )}
    </section>
  );
}
