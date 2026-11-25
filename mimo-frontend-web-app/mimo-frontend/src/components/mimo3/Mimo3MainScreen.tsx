import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import hanumanArt from '../../assets/hanuman-lineart-bright.png';

interface Mimo3MainScreenProps {
  isActive: boolean;
  onNext: () => void;
  kioskId?: string | null;
  onOmTap?: () => void;
  onOpenScreensaver?: () => void;
  isOnline?: boolean;
}

// Fraction of the track the thumb must travel before the swipe counts (same feel as MIMO 1.0 / 2.0).
const UNLOCK_AT = 0.82;
const TRACK_PAD = 8;
const THUMB_SIZE = 68;

/**
 * MIMO 3.0 (SV-003) welcome screen: Hanuman devotional theme on warm ivory, with the same
 * swipe-to-start interaction as MIMO 1.0 and 2.0. Pointer events cover touch, pen and mouse.
 */
export const Mimo3MainScreen: React.FC<Mimo3MainScreenProps> = ({
  isActive,
  onNext,
  kioskId = 'SV-003',
  onOmTap,
  isOnline = true,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ pointerX: number; thumbX: number } | null>(null);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);
  const [now, setNow] = useState(() => new Date());

  const displayKioskId = kioskId || 'SV-003';

  // Reset the slider whenever the welcome screen is shown again.
  useEffect(() => {
    if (!isActive) return;
    setDragX(0);
    setIsUnlocked(false);
    setIsDragging(false);
    dragStart.current = null;
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    const t = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(t);
  }, [isActive]);

  // Track width in layout pixels (the kiosk canvas can be CSS-scaled).
  useEffect(() => {
    if (!isActive || !trackRef.current) return;
    const el = trackRef.current;
    const measure = () => setTrackWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isActive]);

  const maxTravel = Math.max(0, trackWidth - THUMB_SIZE - TRACK_PAD * 2);
  const progress = maxTravel > 0 ? dragX / maxTravel : 0;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isUnlocked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { pointerX: e.clientX, thumbX: dragX };
    setIsDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current || isUnlocked) return;
    const track = trackRef.current;
    const scale = track && track.clientWidth ? track.getBoundingClientRect().width / track.clientWidth : 1;
    const delta = (e.clientX - dragStart.current.pointerX) / (scale || 1);
    setDragX(Math.min(maxTravel, Math.max(0, dragStart.current.thumbX + delta)));
  };

  const finishDrag = useCallback(() => {
    if (!dragStart.current || isUnlocked) return;
    dragStart.current = null;
    setIsDragging(false);
    if (maxTravel > 0 && dragX >= maxTravel * UNLOCK_AT) {
      setDragX(maxTravel);
      setIsUnlocked(true);
      window.setTimeout(onNext, 320);
    } else {
      setDragX(0);
    }
  }, [dragX, isUnlocked, maxTravel, onNext]);

  if (!isActive) return null;

  const time = now.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  const date = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const ease = 'cubic-bezier(0.16, 1, 0.3, 1)';

  return (
    <div className="relative flex h-full w-full select-none overflow-hidden bg-[#FFFBF3] font-sans text-[#2A1606]">
      {/* Warm ivory backdrop with a soft saffron dawn behind the figure */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 55% 75% at 74% 52%, rgba(251, 191, 36, 0.20) 0%, rgba(253, 230, 138, 0.10) 38%, transparent 70%),' +
            'radial-gradient(ellipse 45% 60% at 10% 90%, rgba(234, 88, 12, 0.06) 0%, transparent 70%),' +
            'linear-gradient(180deg, #FFFDF8 0%, #FFF8EC 100%)',
        }}
      />
      {/* Temple border along the top edge */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[6px] opacity-85"
        style={{
          background:
            'repeating-linear-gradient(90deg, #EA580C 0 14px, #F59E0B 14px 22px, #FDE68A 22px 26px, #F59E0B 26px 34px)',
        }}
      />

      {/* ── Top bar: Om (diagnostics tap) · clock · status ── */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-start justify-between px-[4.5%] pt-[3.2%]">
        <button
          onClick={onOmTap}
          title="MIMO 3.0"
          aria-label="MIMO 3.0"
          className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-2xl border border-[#F59E0B]/40 bg-white/80 text-[30px] leading-none text-[#EA580C] shadow-[0_6px_20px_rgba(234,88,12,0.12)] backdrop-blur-sm transition-transform active:scale-95"
          style={{ fontFamily: "'Tiro Devanagari Hindi', serif" }}
        >
          ॐ
        </button>
        <div className="flex flex-col items-end gap-1.5 text-right">
          <span className="text-[34px] font-bold uppercase leading-none tracking-tight text-[#2A1606]">{time}</span>
          <span className="text-[14px] font-medium text-[#8A6A4A]">{date}</span>
          <span className="mt-1 inline-flex items-center gap-2 rounded-full border border-[#F59E0B]/30 bg-white/70 px-3 py-1 text-[12px] font-semibold text-[#7A5A3A]">
            <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {isOnline ? 'Ready' : 'Offline'} · {displayKioskId}
          </span>
        </div>
      </header>

      {/* ── Left: welcome + swipe ── */}
      <main className="relative z-10 flex h-full w-[56%] flex-col justify-center pl-[6.5%] pr-[2%]">
        <p className="text-[15px] font-bold uppercase tracking-[0.55em] text-[#B45309]">Welcome to</p>

        <div className="mt-3 flex items-baseline leading-none">
          <h1
            className="text-[124px] font-black tracking-[-0.035em]"
            style={{
              background: 'linear-gradient(160deg, #C2410C 0%, #EA580C 45%, #D97706 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 6px 18px rgba(234, 88, 12, 0.18))',
            }}
          >
            MIMO
          </h1>
          <span className="ml-3 text-[48px] font-extrabold text-[#D97706]">3.0</span>
        </div>

        <h2 className="mt-3 text-[34px] font-semibold tracking-tight text-[#2A1606]">Self-Service Printing Kiosk</h2>

        <div className="my-6 h-[2px] w-[150px] bg-gradient-to-r from-[#EA580C] via-[#F59E0B] to-transparent" />

        <p className="text-[30px] leading-snug text-[#B45309]" style={{ fontFamily: "'Tiro Devanagari Hindi', serif" }}>
          ॥ ॐ श्री हनुमते नमः ॥
        </p>
        <p className="mt-2 text-[18px] font-medium text-[#7A5A3A]">
          B&amp;W and colour printing · enter your 4-digit MIMO code
        </p>

        {/* Swipe to start — same interaction as MIMO 1.0 / 2.0 */}
        <div
          ref={trackRef}
          className="mimo3-swipe-track relative mt-12 h-[84px] w-full max-w-[520px] overflow-hidden rounded-full border border-[#F59E0B]/35 bg-white/85 shadow-[0_14px_40px_rgba(180,83,9,0.12),inset_0_1px_0_rgba(255,255,255,0.9)]"
          style={{ touchAction: 'none' }}
        >
          {/* Saffron fill that follows the thumb */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#FDBA74]/60 to-[#FB923C]/50"
            style={{
              width: `${dragX + THUMB_SIZE + TRACK_PAD * 2}px`,
              transition: isDragging ? 'none' : `width 0.35s ${ease}`,
            }}
          />
          {/* Hint text + chevrons */}
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center gap-3 pl-[70px] text-[18px] font-bold uppercase tracking-[0.22em] text-[#9A5B1E]"
            style={{ opacity: Math.max(0, 1 - progress * 1.6) }}
          >
            Swipe to start
            <span className="flex gap-0.5 text-[#F59E0B]">
              {[0, 1, 2].map((i) => (
                <ArrowRight
                  key={i}
                  size={18}
                  strokeWidth={3}
                  className="animate-pulse"
                  style={{ animationDelay: `${i * 0.2}s`, opacity: 0.45 + i * 0.25 }}
                />
              ))}
            </span>
          </div>
          {/* Thumb */}
          <div
            role="slider"
            aria-label="Swipe to start"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            className="mimo3-swipe-thumb absolute flex cursor-grab items-center justify-center rounded-full text-white shadow-[0_8px_22px_rgba(194,65,12,0.35)] active:cursor-grabbing"
            style={{
              top: `${TRACK_PAD}px`,
              left: `${TRACK_PAD}px`,
              width: `${THUMB_SIZE}px`,
              height: `${THUMB_SIZE}px`,
              transform: `translateX(${dragX}px)`,
              transition: isDragging ? 'none' : `transform 0.35s ${ease}`,
              background: isUnlocked
                ? 'linear-gradient(135deg, #16A34A, #15803D)'
                : 'linear-gradient(135deg, #F97316, #EA580C)',
            }}
          >
            {isUnlocked ? <Check size={30} strokeWidth={3} /> : <ArrowRight size={30} strokeWidth={2.75} />}
          </div>
        </div>
      </main>

      {/* ── Right: Hanuman ── */}
      <div className="pointer-events-none absolute bottom-0 right-[3%] top-[6%] z-0 flex w-[42%] items-end justify-center">
        <div
          className="absolute bottom-[14%] left-1/2 h-[62%] w-[78%] -translate-x-1/2 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(251, 191, 36, 0.28) 0%, rgba(253, 186, 116, 0.12) 45%, transparent 72%)',
            animation: 'divineAuraPulse 6s ease-in-out infinite',
          }}
        />
        <img
          src={hanumanArt}
          alt=""
          draggable={false}
          className="relative h-[94%] w-auto object-contain"
          style={{ filter: 'drop-shadow(0 10px 30px rgba(234, 88, 12, 0.18))' }}
        />
      </div>

      {/* ── Footer ── */}
      <footer className="absolute bottom-[3.5%] left-[6.5%] z-10 text-[13px] font-medium text-[#9A7B5B]">
        &copy; 2026 <strong className="font-semibold text-[#7A5A3A]">VisionPrintt</strong>. All rights reserved.
      </footer>
    </div>
  );
};
