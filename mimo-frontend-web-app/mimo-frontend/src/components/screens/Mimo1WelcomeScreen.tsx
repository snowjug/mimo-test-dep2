import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowRight, Check } from '@phosphor-icons/react';

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

  // Exact coordinates matching the 1440x810 canonical design
  const TRACK_WIDTH = 464;
  const TRACK_HEIGHT = 78;
  const KNOB_DIAMETER = 68;
  const TRACK_PADDING = 5;
  const MAX_DRAG = TRACK_WIDTH - (TRACK_PADDING * 2) - KNOB_DIAMETER; // 386px

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
    const scale = trackRect.width / TRACK_WIDTH;
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

  if (!isActive) return null;

  return (
    <div
      className="screen visible mimo1-welcome-screen absolute left-1/2 top-1/2 h-[810px] w-[1440px] -translate-x-1/2 -translate-y-1/2 select-none overflow-hidden"
      style={{
        display: isActive ? 'block' : 'none',
        backgroundImage: 'url(/mimo1-golden-bg.png)',
        backgroundSize: '100% 100%',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#FAF5EE',
      }}
    >
      {/* Centered Main Brand Content */}
      <main className="absolute inset-0 flex flex-col items-center justify-center select-none pt-4">
        {/* WELCOME TO Tagline */}
        <p
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: '18px',
            fontWeight: 500,
            letterSpacing: '0.36em',
            color: '#2E2823',
            textTransform: 'uppercase',
            marginBottom: '12px',
          }}
        >
          WELCOME TO
        </p>

        {/* MIMO 1.0 Brand Row */}
        <div
          className="relative flex items-baseline justify-center"
          style={{ marginBottom: '10px' }}
        >
          {/* MIMO Word */}
          <div className="relative inline-flex items-baseline">
            <span
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: '124px',
                fontWeight: 900,
                letterSpacing: '-0.025em',
                color: '#1A1A1A',
                lineHeight: 1,
              }}
            >
              MIMO
            </span>
          </div>

          {/* 1.0 in Warm Caramel Gold */}
          <span
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: '94px',
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: '#C48D4D',
              marginLeft: '20px',
              lineHeight: 1,
            }}
          >
            1.0
          </span>
        </div>

        {/* Self-Service Printing Kiosk Subheading */}
        <h2
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: '36px',
            fontWeight: 500,
            letterSpacing: '-0.015em',
            color: '#342D27',
            margin: '0 0 46px 0',
            textAlign: 'center',
          }}
        >
          Self-Service Printing Kiosk
        </h2>

        {/* Swipe-to-Start Pill Interaction Container */}
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
          className="relative flex items-center justify-center select-none"
          style={{
            width: `${TRACK_WIDTH}px`,
            height: `${TRACK_HEIGHT}px`,
            borderRadius: '9999px',
            background:
              'linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 243, 237, 0.92) 100%)',
            boxShadow:
              '0 10px 32px rgba(180, 140, 90, 0.18), 0 2px 6px rgba(0, 0, 0, 0.04), inset 0 1px 2px rgba(255, 255, 255, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.95)',
            touchAction: 'none',
            cursor: isUnlocked ? 'default' : (isDragging ? 'grabbing' : 'grab'),
          }}
        >
          {/* Active progress fill trailing behind the knob */}
          {(dragX > 0 || isUnlocked) && (
            <div
              className="pointer-events-none absolute inset-y-0 rounded-full"
              style={{
                left: `${TRACK_PADDING}px`,
                width: `${Math.min(TRACK_WIDTH - (TRACK_PADDING * 2), dragX + KNOB_DIAMETER)}px`,
                background: isUnlocked
                  ? 'linear-gradient(90deg, #10B981 0%, #34D399 100%)'
                  : 'linear-gradient(90deg, #D4AF37 0%, #E5C365 70%, #F5DF8E 100%)',
                boxShadow: isUnlocked
                  ? '0 0 24px rgba(16, 185, 129, 0.45)'
                  : '0 2px 10px rgba(212, 175, 55, 0.35)',
                transition: isDragging ? 'none' : 'width 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            />
          )}

          {/* Swipe Track Text */}
          <span
            className="pointer-events-none select-none text-center"
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: '14.5px',
              fontWeight: 700,
              letterSpacing: '0.28em',
              color: isUnlocked ? '#FFFFFF' : '#2E2823',
              textTransform: 'uppercase',
              paddingLeft: '56px',
              opacity: isUnlocked ? 1 : Math.max(0.15, 1 - (dragX / (MAX_DRAG * 0.55))),
              transition: isDragging ? 'none' : 'opacity 0.25s ease',
            }}
          >
            {isUnlocked ? 'UNLOCKED' : 'SWIPE TO START'}
          </span>

          {/* Draggable Circular Knob */}
          <div
            className="pointer-events-none absolute flex items-center justify-center rounded-full select-none"
            style={{
              left: `${TRACK_PADDING}px`,
              top: `${TRACK_PADDING}px`,
              width: `${KNOB_DIAMETER}px`,
              height: `${KNOB_DIAMETER}px`,
              transform: `translateX(${dragX}px)`,
              background: isUnlocked
                ? 'radial-gradient(circle at 35% 35%, #10B981 0%, #047857 100%)'
                : 'radial-gradient(circle at 35% 35%, #423A33 0%, #1F1B18 100%)',
              boxShadow: isUnlocked
                ? '0 0 24px rgba(16, 185, 129, 0.6), 0 4px 12px rgba(0, 0, 0, 0.3)'
                : '0 0 22px rgba(220, 160, 75, 0.75), 0 4px 12px rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(255, 230, 180, 0.45)',
              transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {isUnlocked ? (
              <Check size={30} weight="bold" color="#FFFFFF" />
            ) : (
              <ArrowRight size={28} weight="bold" color="#FFFFFF" />
            )}
          </div>
        </div>

        {/* Footer Copyright */}
        <footer
          style={{
            position: 'absolute',
            bottom: '48px',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: '13.5px',
            fontWeight: 500,
            letterSpacing: '0.01em',
            color: '#585049',
            textAlign: 'center',
          }}
        >
          &copy; 2026 VisionPrintt. All rights reserved.
        </footer>
      </main>
    </div>
  );
};
