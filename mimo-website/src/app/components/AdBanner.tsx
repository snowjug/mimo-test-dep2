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

function normalizeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

  const hasImage = Boolean(current.imageUrl);
  const hasCaption = Boolean(current.caption);

  const AdContent = (
    <div
      className="relative overflow-hidden rounded-[20px] bg-surface select-none transition-shadow"
      /* Touch */
      onTouchStart={(e) => onDragStart(e.touches[0].clientX)}
      onTouchEnd={(e) => onDragEnd(e.changedTouches[0].clientX)}
      /* Mouse */
      onMouseDown={(e) => onDragStart(e.clientX)}
      onMouseUp={(e) => onDragEnd(e.clientX)}
    >
      {/* CASE 1: Banner mode (image only, no caption) */}
      {hasImage && !hasCaption ? (
        <div className="p-2 sm:p-2.5">
          <div className="w-full overflow-hidden rounded-[14px] bg-ink-4/5 flex items-center justify-center">
            <img
              src={current.imageUrl!}
              alt="Announcement banner"
              loading="lazy"
              decoding="async"
              className="w-full max-h-56 sm:max-h-64 object-cover rounded-[14px]"
              draggable={false}
            />
          </div>
        </div>
      ) : (
        /* CASE 2: Card mode (image + caption, or caption only) */
        <div className="flex items-center gap-3.5 sm:gap-4 p-3 sm:p-3.5">
          {hasImage && (
            <div className="shrink-0 overflow-hidden rounded-[12px] bg-ink-4/10 w-24 sm:w-28 h-32 sm:h-36 flex items-center justify-center" aria-hidden="true">
              <img
                src={current.imageUrl!}
                alt=""
                width={112}
                height={144}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
                draggable={false}
              />
            </div>
          )}

          {hasCaption && (
            <div className="flex min-w-0 flex-1 flex-col py-1">
              <p className="text-[16px] sm:text-[17px] font-semibold leading-snug tracking-tight text-ink line-clamp-4">
                {current.caption}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Dot indicators (only when >1 ad) */}
      {ads.length > 1 && (
        <div
          className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 px-2 py-1 rounded-full bg-surface/85 backdrop-blur-md shadow-xs border border-ink-4/10"
          role="tablist"
          aria-label="Advertisement slides"
        >
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

  const cleanLink = normalizeUrl(current.link);

  return (
    <section aria-label="Advertisement" className="mt-8">
      <h2 className="mb-2 px-1 text-[13px] font-medium text-ink-3">Announcements</h2>

      {/* Wrap in <a> only if a link is present */}
      {cleanLink ? (
        <a
          href={cleanLink}
          target="_blank"
          rel="noopener noreferrer"
          className="block transition-transform active:scale-[0.99]"
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
