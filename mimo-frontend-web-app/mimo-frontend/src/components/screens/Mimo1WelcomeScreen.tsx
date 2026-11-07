import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Check, CaretRight } from '@phosphor-icons/react';
import { DiwaliStage, preloadDiwaliPlates } from '../festive/DiwaliStage';

interface Mimo1WelcomeScreenProps {
  onNext: () => void;
  isActive: boolean;
  kioskId?: string | null;
}

export const Mimo1WelcomeScreen: React.FC<Mimo1WelcomeScreenProps> = ({
  onNext,
  isActive,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const dragStartX = useRef<number>(0);
  const dragStartThumbX = useRef<number>(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const hasTriggeredRef = useRef<boolean>(false);

  // Exact coordinates matching the approved master artwork (1440x810 canvas):
  // Track: left 237px, top 552px, width 452px, height 74px
  // Knob: left 243px (6px relative to track), top 552px, width 84px, height 74px
  // Max travel: 452 - 6 - 84 - 6 = 356px
  const TRACK_PADDING = 6;
  const KNOB_WIDTH = 84;
  const KNOB_HEIGHT = 74;
  const MAX_DRAG = 356;

  // Complete unlock action with safe animation and transition
  const handleUnlock = useCallback(() => {
    if (isUnlocked || hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;
    setIsUnlocked(true);
    setIsDragging(false);

    // Kiosk touchscreen vibration feedback if supported
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(60);
      } catch {}
    }

    // Give user 420ms to perceive the satisfying "UNLOCKED" feedback before navigating
    setTimeout(() => {
      onNext();
      setTimeout(() => {
        setIsUnlocked(false);
        setDragX(0);
        hasTriggeredRef.current = false;
      }, 500);
    }, 420);
  }, [isUnlocked, onNext]);

  const animateToUnlock = useCallback(() => {
    if (isUnlocked || hasTriggeredRef.current) return;
    setIsDragging(false);
    setDragX(MAX_DRAG);
    handleUnlock();
  }, [isUnlocked, handleUnlock, MAX_DRAG]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isUnlocked || hasTriggeredRef.current) return;
    if (e.button !== undefined && e.button !== 0) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    dragStartX.current = e.clientX;
    dragStartThumbX.current = dragX;
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || isUnlocked || hasTriggeredRef.current || !trackRef.current) return;

    const trackRect = trackRef.current.getBoundingClientRect();
    const scale = trackRect.width / 452;
    const delta = (e.clientX - dragStartX.current) / (scale || 1);
    const newX = Math.max(0, Math.min(MAX_DRAG, dragStartThumbX.current + delta));

    setDragX(newX);

    // Threshold to unlock: 72% travel
    if (newX >= MAX_DRAG * 0.72) {
      setDragX(MAX_DRAG);
      handleUnlock();
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    if (!isDragging) return;
    setIsDragging(false);

    if (dragX >= MAX_DRAG * 0.65) {
      setDragX(MAX_DRAG);
      handleUnlock();
    } else if (!isUnlocked && !hasTriggeredRef.current) {
      // If movement was minimal (< 8px), treat as tap/click to unlock
      if (Math.abs(e.clientX - dragStartX.current) < 8) {
        animateToUnlock();
      } else {
        setDragX(0);
      }
    }
  };

  const handlePointerCancel = () => {
    if (!isUnlocked && !hasTriggeredRef.current) {
      setIsDragging(false);
      setDragX(0);
    }
  };

  // Keyboard accessibility for testing and kiosk peripherals (Enter or Spacebar triggers start)
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        animateToUnlock();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, animateToUnlock]);

  useEffect(preloadDiwaliPlates, []);

  if (!isActive) return null;

  const showActiveState = dragX > 0 || isUnlocked;

  return (
    <div className="screen visible mimo1-welcome-screen absolute inset-0 overflow-hidden bg-[#FAF4E8]" style={{ display: 'block' }}>
      <DiwaliStage plate="/mimo1-diwali-welcome.png">
      {/* =========================================================================
          INTERACTION LAYER DIRECTLY OVER THE APPROVED ARTWORK'S SWIPE TRACK
          Position: left 237px, top 552px, width 452px, height 74px
          At rest (dragX = 0): 100% transparent. Only the approved artwork is visible.
          During drag (dragX > 0): active progress fill covers resting knob and moves.
          ========================================================================= */}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        role="slider"
        aria-label="Swipe to start printing"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((dragX / MAX_DRAG) * 100)}
        tabIndex={0}
        className="absolute z-20 cursor-grab active:cursor-grabbing select-none"
        style={{
          left: '237px',
          top: '552px',
          width: '452px',
          height: '74px',
          touchAction: 'none',
        }}
      >
        {/* Active progress fill trailing the knob — covers the resting knob in artwork */}
        {showActiveState && (
          <div
            className="pointer-events-none absolute inset-y-0 rounded-full transition-all duration-300"
            style={{
              left: `${TRACK_PADDING}px`,
              width: `${Math.min(440, dragX + KNOB_WIDTH)}px`,
              background: isUnlocked
                ? 'linear-gradient(90deg, #10B981 0%, #34D399 100%)'
                : 'linear-gradient(90deg, #7D1120 0%, #A81C2E 60%, #D4AF37 100%)',
              boxShadow: isUnlocked
                ? '0 0 24px rgba(16, 185, 129, 0.45)'
                : '0 4px 14px rgba(122, 18, 30, 0.35)',
              transition: isDragging ? 'none' : 'width 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
        )}

        {/* Unlocked feedback text */}
        {isUnlocked && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center pl-4 text-[17px] font-extrabold uppercase tracking-[0.22em] text-white select-none">
            UNLOCKED
          </span>
        )}

        {/* Draggable Active Maroon Knob — only visible when dragging or unlocked */}
        {showActiveState && (
          <div
            className={`pointer-events-none absolute top-0 flex items-center justify-center rounded-full select-none shadow-[0_4px_16px_rgba(74,9,18,0.45)] ring-2 transition-all ${
              isUnlocked
                ? 'bg-gradient-to-br from-[#10B981] via-[#059669] to-[#047857] text-white ring-white/90 shadow-[0_0_24px_rgba(16,185,129,0.5)]'
                : 'bg-gradient-to-br from-[#7D1120] via-[#630917] to-[#45050E] text-[#FFF2D4] ring-[#ECC778]/90'
            }`}
            style={{
              left: `${TRACK_PADDING}px`,
              width: `${KNOB_WIDTH}px`,
              height: `${KNOB_HEIGHT}px`,
              transform: `translateX(${dragX}px)`,
              transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {isUnlocked ? (
              <Check size={32} weight="bold" className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" />
            ) : (
              <CaretRight
                size={34}
                weight="bold"
                className="translate-x-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
              />
            )}
          </div>
        )}
      </div>
      </DiwaliStage>
    </div>
  );
};
