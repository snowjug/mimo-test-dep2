import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import '@google/model-viewer';

declare global {
  namespace React.JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          alt?: string;
          'auto-rotate'?: boolean | string;
          'rotation-per-second'?: string;
          'camera-controls'?: boolean | string;
          'shadow-intensity'?: string;
          'shadow-softness'?: string;
          'exposure'?: string;
          'camera-orbit'?: string;
          'camera-target'?: string;
          'field-of-view'?: string;
          'min-camera-orbit'?: string;
          'max-camera-orbit'?: string;
          'interaction-prompt'?: string;
          'disable-zoom'?: boolean | string;
          'disable-pan'?: boolean | string;
          'disable-tap'?: boolean | string;
          autoplay?: boolean | string;
          loading?: 'auto' | 'lazy' | 'eager';
          reveal?: 'auto' | 'manual';
          style?: React.CSSProperties;
          class?: string;
          className?: string;
          poster?: string;
        },
        HTMLElement
      >;
    }
  }
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          alt?: string;
          'auto-rotate'?: boolean | string;
          'rotation-per-second'?: string;
          'camera-controls'?: boolean | string;
          'shadow-intensity'?: string;
          'shadow-softness'?: string;
          'exposure'?: string;
          'camera-orbit'?: string;
          'camera-target'?: string;
          'field-of-view'?: string;
          'min-camera-orbit'?: string;
          'max-camera-orbit'?: string;
          'interaction-prompt'?: string;
          'disable-zoom'?: boolean | string;
          'disable-pan'?: boolean | string;
          'disable-tap'?: boolean | string;
          autoplay?: boolean | string;
          loading?: 'auto' | 'lazy' | 'eager';
          reveal?: 'auto' | 'manual';
          style?: React.CSSProperties;
          class?: string;
          className?: string;
          poster?: string;
        },
        HTMLElement
      >;
    }
  }
}

interface MimoCharacter3DProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  isInteracting?: boolean;
  isFestive?: boolean;
  isActive?: boolean;
}

export const MimoCharacter3D: React.FC<MimoCharacter3DProps> = ({
  className = '',
  size = 'md',
  isInteracting = false,
  isFestive = false,
  isActive = true,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [speechText, setSpeechText] = useState<string | null>(null);
  const modelViewerRef = useRef<HTMLElement | null>(null);

  // Size mapping for responsive kiosk displays
  const sizeStyles = {
    sm: 'w-[160px] h-[160px]',
    md: 'w-[210px] h-[210px]',
    lg: 'w-[260px] h-[260px]',
    hero: 'w-[300px] h-[300px]',
  }[size];

  // Handle Model Loading
  useEffect(() => {
    const el = modelViewerRef.current;
    if (!el) return;

    const handleLoad = () => {
      setIsLoaded(true);
      setHasError(false);
    };

    const handleError = () => {
      setHasError(true);
      setIsLoaded(false);
    };

    el.addEventListener('load', handleLoad);
    el.addEventListener('error', handleError);

    return () => {
      el.removeEventListener('load', handleLoad);
      el.removeEventListener('error', handleError);
    };
  }, []);

  // Speech Sequence
  useEffect(() => {
    if (!isActive) {
      setSpeechText(null);
      return;
    }

    // Step 1: Greeting at ~0.5s
    const timer1 = window.setTimeout(() => {
      setSpeechText('Hi! 👋');
    }, 500);

    // Step 2: Prompt at ~2.5s
    const timer2 = window.setTimeout(() => {
      setSpeechText('Ready to print? ✨');
    }, 2500);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isActive]);

  // When user begins interaction, update bubble
  const currentBubbleText = isInteracting ? "Let's go! 🚀" : speechText;

  if (hasError) {
    // Graceful fallback - keep layout stable without breaking the UI
    return null;
  }

  return (
    <div
      className={`relative flex flex-col items-center justify-center select-none ${className}`}
      style={{ pointerEvents: 'none' }}
    >
      {/* Interactive Speech Bubble */}
      <div className="relative h-[44px] w-full flex items-center justify-center pointer-events-none mb-1">
        <AnimatePresence mode="wait">
          {currentBubbleText && (
            <motion.div
              key={currentBubbleText}
              initial={{ opacity: 0, scale: 0.85, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -4 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className={`relative z-20 flex items-center gap-1.5 px-4 py-1.5 rounded-full border shadow-lg backdrop-blur-md ${
                isFestive
                  ? 'bg-white/90 border-gold-500/40 text-mahogany-900 shadow-[0_4px_16px_rgba(122,18,48,0.15)]'
                  : 'bg-ink-950/85 border-gold-400/30 text-gold-300 shadow-[0_4px_20px_rgba(0,0,0,0.4)]'
              }`}
            >
              <span className="text-[14px] font-bold tracking-wide whitespace-nowrap">
                {currentBubbleText}
              </span>

              {/* Small speech bubble arrow */}
              <span
                className={`absolute -bottom-[6px] left-1/2 -translate-x-1/2 w-0 h-0 border-x-[6px] border-x-transparent border-t-[6px] ${
                  isFestive ? 'border-t-white/90' : 'border-t-ink-950/85'
                }`}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating Mascot Container */}
      <motion.div
        animate={
          isInteracting
            ? {
                y: [0, -14, 0],
                scale: [1, 1.08, 1],
                transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
              }
            : {
                y: [0, -8, 0],
                transition: {
                  duration: 3.2,
                  repeat: Infinity,
                  repeatType: 'reverse',
                  ease: 'easeInOut',
                },
              }
        }
        className={`relative flex items-center justify-center ${sizeStyles}`}
      >
        {/* Soft Ambient Mascot Glow */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[40px] opacity-40 transition-opacity duration-500"
          style={{
            width: '180px',
            height: '180px',
            background: isFestive
              ? 'radial-gradient(circle, rgba(201,151,62,0.3), transparent 70%)'
              : 'radial-gradient(circle, rgba(217,165,68,0.25), transparent 70%)',
          }}
        />

        {/* 3D Model Viewer */}
        <model-viewer
          ref={modelViewerRef}
          src="./models/MIMO_FINAL.glb"
          alt="3D MIMO Character Mascot"
          shadow-intensity="0.5"
          shadow-softness="0.8"
          exposure="1.05"
          camera-orbit="0deg 82deg 105%"
          field-of-view="32deg"
          interaction-prompt="none"
          disable-zoom="true"
          disable-pan="true"
          loading="eager"
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: 'transparent',
            outline: 'none',
            opacity: isLoaded ? 1 : 0,
            transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
            pointerEvents: 'none',
          }}
        />
      </motion.div>
    </div>
  );
};
