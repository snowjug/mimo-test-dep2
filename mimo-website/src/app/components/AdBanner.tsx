import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

function normalizeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function AdSlide({ ad, onImageLoad }: { ad: Ad; onImageLoad?: () => void }) {
  const hasImage = Boolean(ad.imageUrl);
  const hasCaption = Boolean(ad.caption);

  return hasImage && !hasCaption ? (
    // CASE 1: Banner mode (image only, no caption) - full image shown cleanly without any cropping
    <div className="p-2 sm:p-2.5">
      <div className="w-full overflow-hidden rounded-[14px] bg-surface flex items-center justify-center">
        <img
          src={ad.imageUrl!}
          alt="Announcement banner"
          loading="eager"
          decoding="async"
          className="w-full h-auto max-h-[220px] sm:max-h-[240px] object-contain rounded-[14px] block"
          draggable={false}
          onLoad={onImageLoad}
        />
      </div>
    </div>
  ) : (
    // CASE 2: Card mode (image + caption, or caption only)
    <div className="flex items-center gap-4 p-3.5 sm:p-4">
      {hasImage && (
        <div className="shrink-0 overflow-hidden rounded-[14px] bg-surface-2 w-24 sm:w-28 h-28 sm:h-32 flex items-center justify-center" aria-hidden="true">
          <img
            src={ad.imageUrl!}
            alt=""
            width={112}
            height={128}
            loading="eager"
            decoding="async"
            className="h-full w-full object-contain"
            draggable={false}
            onLoad={onImageLoad}
          />
        </div>
      )}
      {hasCaption && (
        <div className="flex min-w-0 flex-1 flex-col py-1">
          <p className="text-[15px] sm:text-[16px] font-semibold leading-snug tracking-tight text-ink line-clamp-3">
            {ad.caption}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * AdBanner — dynamic, admin-managed replacement for the hardcoded HackathonBanner.
 *
 * - Renders nothing (no layout shift) when there are no active ads.
 * - A real sliding-track carousel: all ads sit side by side and the track animates horizontally to
 *   the active one (not an abrupt content swap), auto-advancing every 3 s.
 * - The user can control the movement three ways: dragging/swiping the track directly (live-follows
 *   the finger/pointer, not just a swipe gesture detected after the fact), tapping the prev/next
 *   arrows, or tapping a dot to jump straight to that slide. Any manual move resets the 3 s auto-timer
 *   so it doesn't fight the user's own input.
 * - Height animates smoothly between slides of different sizes (banner vs. card mode).
 * - Opens the ad link in a new tab when tapped (if a link is configured) -- suppressed after an actual
 *   drag so a swipe never accidentally triggers the link.
 */
export function AdBanner() {
  const ads = useAds();
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [trackHeight, setTrackHeight] = useState<number | undefined>(undefined);

  // Drag state: dragOffset follows the pointer live (px) while dragging, reset to 0 once released.
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef<number | null>(null);
  const didDragRef = useRef(false);

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

  // Keep the container's height in sync with whichever slide is active, animated via CSS so switching
  // between a tall banner-mode ad and a shorter card-mode one doesn't jump instantly.
  useLayoutEffect(() => {
    const el = slideRefs.current[index];
    if (!el) return;
    const update = () => setTrackHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [index, ads?.length]);

  const goTo = (i: number, count: number) => {
    setIndex(wrap(i, count));
    startTimer(count);
  };

  // ── Drag / swipe handlers — the track follows the pointer live, not just a post-hoc gesture check ──
  const onDragStart = (clientX: number) => {
    dragStartX.current = clientX;
    didDragRef.current = false;
    setIsDragging(true);
  };
  const onDragMove = (clientX: number, count: number) => {
    if (dragStartX.current === null) return;
    const delta = clientX - dragStartX.current;
    if (Math.abs(delta) > 4) didDragRef.current = true;
    // Resist dragging past the ends when there's only one slide (nothing to reveal).
    setDragOffset(count > 1 ? delta : delta * 0.2);
  };
  const onDragEnd = (count: number) => {
    if (dragStartX.current === null) return;
    if (Math.abs(dragOffset) > 40) goTo(index + (dragOffset < 0 ? 1 : -1), count);
    dragStartX.current = null;
    setDragOffset(0);
    setIsDragging(false);
  };

  // Nothing to show while loading or when there are no ads
  if (!ads || ads.length === 0) return null;

  const trackPercentOffset = -index * 100;
  const dragPercent = trackRef.current?.clientWidth ? (dragOffset / trackRef.current.clientWidth) * 100 : 0;

  const handleImageLoad = () => {
    const el = slideRefs.current[index];
    if (el) setTrackHeight(el.offsetHeight);
  };

  return (
    <section aria-label="Advertisement" className="mt-5 sm:mt-6">
      <h2 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wider text-ink-3">Announcements</h2>

      <div
        className="relative overflow-hidden rounded-[20px] bg-surface select-none border border-hairline/60 shadow-xs"
        style={{ height: trackHeight, transition: isDragging ? undefined : "height 300ms ease" }}
      >
        <div
          ref={trackRef}
          className="flex"
          style={{
            transform: `translateX(calc(${trackPercentOffset}% + ${dragPercent}%))`,
            transition: isDragging ? "none" : "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
          onTouchStart={(e) => onDragStart(e.touches[0].clientX)}
          onTouchMove={(e) => onDragMove(e.touches[0].clientX, ads.length)}
          onTouchEnd={() => onDragEnd(ads.length)}
          onMouseDown={(e) => onDragStart(e.clientX)}
          onMouseMove={(e) => { if (dragStartX.current !== null) onDragMove(e.clientX, ads.length); }}
          onMouseUp={() => onDragEnd(ads.length)}
          onMouseLeave={() => { if (dragStartX.current !== null) onDragEnd(ads.length); }}
        >
          {ads.map((ad, i) => {
            const slideLink = normalizeUrl(ad.link);
            const slide = (
              <div ref={(el) => { slideRefs.current[i] = el; }} className="w-full shrink-0">
                <AdSlide ad={ad} onImageLoad={handleImageLoad} />
              </div>
            );
            return (
              <div key={ad.id} className="w-full shrink-0">
                {slideLink ? (
                  <a
                    href={slideLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={ad.caption ?? "View announcement"}
                    // A real drag must never also fire the link navigation.
                    onClick={(e) => { if (didDragRef.current) e.preventDefault(); }}
                    draggable={false}
                  >
                    {slide}
                  </a>
                ) : (
                  slide
                )}
              </div>
            );
          })}
        </div>

        {ads.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous announcement"
              onClick={(e) => { e.stopPropagation(); goTo(index - 1, ads.length); }}
              className="press absolute left-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-surface/85 text-ink-2 shadow-xs backdrop-blur-md border border-ink-4/10 active:bg-surface"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next announcement"
              onClick={(e) => { e.stopPropagation(); goTo(index + 1, ads.length); }}
              className="press absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-surface/85 text-ink-2 shadow-xs backdrop-blur-md border border-ink-4/10 active:bg-surface"
            >
              <ChevronRight className="size-4" />
            </button>

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
                  onClick={(e) => { e.stopPropagation(); goTo(i, ads.length); }}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                    i === index ? "w-4 bg-brand" : "w-1.5 bg-ink-4 opacity-40"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
