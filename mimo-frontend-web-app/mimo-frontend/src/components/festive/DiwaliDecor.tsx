import React, { useId } from 'react';

// Unique SVG IDs per component instance to prevent hidden screen collisions
const useSvgId = (prefix: string) => `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

export const GOLD_PRIMARY = '#D4AF37';
export const GOLD_DEEP = '#A37524';
export const GOLD_LIGHT = '#F3D088';
export const MAROON_ACCENT = '#680D1D';
export const ESPRESSO_TEXT = '#2D1E12';

/**
 * DiwaliBackdrop:
 * Master background for all Diwali operational screens (Code Entry, Printing, Summary, Error, Maintenance).
 * Soft cream and ivory gradient with radiant golden illumination, subtle arch motif, authentic temple skyline silhouette & 3D golden wave ribbons.
 */
export const DiwaliBackdrop: React.FC<{
  showRangoli?: boolean;
  showBottomDecor?: boolean;
  showZari?: boolean;
}> = ({ showRangoli = false, showBottomDecor = true, showZari = false }) => {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none"
      style={{
        background: 'linear-gradient(145deg, #FFFDF8 0%, #FAF4E8 45%, #F4EAD7 100%)',
      }}
      aria-hidden="true"
    >
      {/* Top golden ambient glow */}
      <div
        className="absolute -top-32 left-1/2 h-[420px] w-[860px] -translate-x-1/2 rounded-full blur-[110px]"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(243, 208, 136, 0.32) 0%, rgba(212, 175, 55, 0.12) 50%, transparent 80%)',
        }}
      />

      {/* Right ambient radiance */}
      <div
        className="absolute top-1/4 -right-28 h-[500px] w-[500px] rounded-full blur-[130px]"
        style={{
          background: 'radial-gradient(circle, rgba(235, 180, 85, 0.22) 0%, rgba(212, 175, 55, 0.08) 55%, transparent 75%)',
        }}
      />

      {/* Left subtle ambient radiance */}
      <div
        className="absolute bottom-10 -left-20 h-[450px] w-[450px] rounded-full blur-[120px]"
        style={{
          background: 'radial-gradient(circle, rgba(243, 208, 136, 0.20) 0%, transparent 70%)',
        }}
      />

      {/* Subtle traditional Indian jharokha arch background watermark (ultra-fine gold hairline) */}
      <svg
        className="absolute left-1/2 top-0 -translate-x-1/2 opacity-[0.14]"
        width="1100"
        height="550"
        viewBox="0 0 1100 550"
        fill="none"
      >
        <path
          d="M 150 550 L 150 240 C 150 120 320 40 550 40 C 780 40 950 120 950 240 L 950 550"
          stroke="#C59B27"
          strokeWidth="1.5"
          strokeDasharray="6 8"
        />
        <path
          d="M 200 550 L 200 250 C 200 150 350 80 550 80 C 750 80 900 150 900 250 L 900 550"
          stroke="#C59B27"
          strokeWidth="1.2"
        />
        {/* Crown finial */}
        <path
          d="M 550 20 L 556 36 L 550 40 L 544 36 Z"
          fill="#D4AF37"
        />
      </svg>

      {/* Subtle floor rangoli / mandala pattern in bottom corners */}
      {showRangoli && (
        <>
          <div className="absolute -bottom-24 -left-24 opacity-[0.10]">
            <DiwaliMandala size={440} />
          </div>
          <div className="absolute -bottom-24 -right-24 opacity-[0.10]">
            <DiwaliMandala size={440} />
          </div>
        </>
      )}

      {/* Authentic Golden Temple Silhouette & 3D Wave Ribbons from Approved References */}
      {showBottomDecor && (
        <img
          src="/diwali-bottom-decor.png"
          alt=""
          className="pointer-events-none absolute bottom-0 inset-x-0 w-full select-none object-cover h-[120px]"
          style={{
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 28%, black 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 28%, black 100%)',
          }}
        />
      )}

      {/* Royal maroon and gold embroidered Zari border at very bottom */}
      {showZari && <DiwaliZariBorder />}
    </div>
  );
};

/**
 * DiwaliDiyaIndicator:
 * 4 Circular PIN Slots matching Approved Image 2 & Image 8:
 * - Clean light cream circular background (#FFFDF8).
 * - Thin, elegant golden outline.
 * - Active slot has soft golden glow (NEVER GREY).
 * - Filled slot displays the typed digit in rich chocolate brown.
 */
export const DiwaliDiyaIndicator: React.FC<{
  size?: number;
  active?: boolean;
  digit?: string;
  isFilled?: boolean;
}> = ({ size = 54, active = false, digit, isFilled = false }) => {
  const filled = isFilled || (digit !== undefined && digit !== '');

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
        active
          ? 'border-[#D4AF37] ring-2 ring-[#ECC778]/70 shadow-[0_0_14px_rgba(212,175,55,0.45)]'
          : filled
          ? 'border-[#D4AF37]/90 shadow-[0_0_10px_rgba(212,175,55,0.25)]'
          : 'border-[#C59B27]/55 shadow-sm'
      }`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderWidth: active || filled ? '1.8px' : '1.2px',
        borderStyle: 'solid',
        backgroundColor: '#FFFDF8',
      }}
    >
      {filled && (
        <span className="font-serif text-[26px] font-bold text-[#2C1A0E] select-none leading-none">
          {digit || '•'}
        </span>
      )}
    </div>
  );
};

/**
 * DiwaliDiya:
 * Clean standalone traditional oil lamp for progress tracking rows and floor rows (matching Images 2 & 3).
 * Contains bowl, rim, beaded garland, and flame. No extra dots.
 */
export const DiwaliDiya: React.FC<{
  size?: number;
  lit?: boolean;
  delay?: number;
  className?: string;
}> = ({ size = 36, lit = true, delay = 0, className = '' }) => {
  const idPrefix = useSvgId('standalone-diya');

  return (
    <svg
      width={size}
      height={size * (48 / 60)}
      viewBox="0 0 60 48"
      className={`overflow-visible select-none pointer-events-none ${className}`}
    >
      <defs>
        <radialGradient id={`${idPrefix}-halo`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFD666" stopOpacity="0.7" />
          <stop offset="50%" stopColor="#F59E0B" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
        </radialGradient>

        <linearGradient id={`${idPrefix}-flame`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#E65100" />
          <stop offset="25%" stopColor="#FF9800" />
          <stop offset="65%" stopColor="#FFD54F" />
          <stop offset="92%" stopColor="#FFFDE7" />
          <stop offset="100%" stopColor="#FFFFFF" />
        </linearGradient>

        <linearGradient id={`${idPrefix}-bowl`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C97538" />
          <stop offset="40%" stopColor="#A85720" />
          <stop offset="100%" stopColor="#753510" />
        </linearGradient>

        <linearGradient id={`${idPrefix}-rim`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#680D1D" />
          <stop offset="50%" stopColor="#8A1726" />
          <stop offset="100%" stopColor="#680D1D" />
        </linearGradient>
      </defs>

      {/* Flame when lit */}
      {lit && (
        <>
          <circle cx="30" cy="16" r="14" fill={`url(#${idPrefix}-halo)`} />
          <g
            style={{
              animation: `diwali-flicker-anim 1.8s ease-in-out infinite alternate ${delay}s`,
              transformOrigin: '30px 24px',
            }}
          >
            {/* Outer flame */}
            <path
              d="M 30 4 C 34 11 35 17 30 25 C 25 17 26 11 30 4 Z"
              fill={`url(#${idPrefix}-flame)`}
            />
            {/* Inner intense flame core */}
            <path
              d="M 30 11 C 32 15 32.5 19 30 23.5 C 27.5 19 28 15 30 11 Z"
              fill="#FFFFFF"
              fillOpacity="0.95"
            />
          </g>
        </>
      )}

      {/* Diya Bowl */}
      <path
        d="M 8 26 Q 30 28 52 26 Q 48 44 30 45.5 Q 12 44 8 26 Z"
        fill={`url(#${idPrefix}-bowl)`}
      />

      {/* Inner Maroon Rim */}
      <ellipse
        cx="30"
        cy="26"
        rx="21"
        ry="3.2"
        fill={`url(#${idPrefix}-rim)`}
        stroke="#ECC778"
        strokeWidth="0.8"
      />

      {/* Beaded gold garland */}
      <path
        d="M 14 34 Q 30 39 46 34"
        fill="none"
        stroke="#ECC778"
        strokeWidth="0.8"
        strokeDasharray="1 2"
        strokeLinecap="round"
      />
      <polygon points="30,37.5 31.2,39 30,40.5 28.8,39" fill="#FFE082" />

      <style>{`
        @keyframes diwali-flicker-anim {
          0% { transform: scale(0.96) rotate(-1deg); }
          50% { transform: scale(1.04) rotate(1deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
      `}</style>
    </svg>
  );
};

/**
 * DiwaliDiyaRow:
 * Horizontal sequence of glowing diyas for tracking sheets printed (Images 2 & 3).
 */
export const DiwaliDiyaRow: React.FC<{
  count?: number;
  litCount?: number;
  size?: number;
  gap?: number;
}> = ({ count = 9, litCount = count, size = 32, gap = 16 }) => {
  return (
    <div className="flex items-end justify-center select-none" style={{ gap: `${gap}px` }}>
      {Array.from({ length: count }, (_, i) => (
        <DiwaliDiya key={i} size={size} lit={i < litCount} delay={i * 0.15} />
      ))}
    </div>
  );
};

/**
 * DiwaliLotus:
 * 5-petal gold lotus emblem for headers and decorative accents (Image 3).
 */
export const DiwaliLotus: React.FC<{ size?: number; className?: string }> = ({
  size = 28,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size * (18 / 28)}
      viewBox="0 0 28 18"
      fill="none"
      className={`select-none pointer-events-none ${className}`}
    >
      <path d="M 14 0 C 16 5 16.5 9 14 17 C 11.5 9 12 5 14 0 Z" fill="#D4AF37" />
      <path d="M 14 17 C 17 9 20 7 23 8 C 21.5 12 18.5 15.5 14 17 Z" fill="#C59B27" />
      <path d="M 14 17 C 11 9 8 7 5 8 C 6.5 12 9.5 15.5 14 17 Z" fill="#C59B27" />
      <path d="M 14 17 C 19 13 23.5 12 27 14.5 C 23.5 17.5 19 17.5 14 17 Z" fill="#A37524" />
      <path d="M 14 17 C 9 13 4.5 12 1 14.5 C 4.5 17.5 9 17.5 14 17 Z" fill="#A37524" />
    </svg>
  );
};

/**
 * DiwaliLotusDivider:
 * Fine gold horizontal hairline with 5-petal gold lotus flanked by two gold diamond rhombuses (Image 1).
 */
export const DiwaliLotusDivider: React.FC<{ width?: number | string; className?: string }> = ({
  width = 240,
  className = '',
}) => {
  return (
    <div
      className={`flex items-center justify-center gap-3 select-none pointer-events-none ${className}`}
      style={{ width: typeof width === 'number' ? `${width}px` : width }}
    >
      <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-[#C59B27]/50 to-[#C59B27]" />
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rotate-45 bg-[#D4AF37] shadow-[0_0_4px_rgba(212,175,55,0.4)]" />
        <svg width="24" height="14" viewBox="0 0 24 14" fill="#C59B27">
          <path d="M 12 0 C 13.5 4 14 7 12 13 C 10 7 10.5 4 12 0 Z" />
          <path d="M 12 13 C 14.5 7 17 5 19 6 C 18 9 15.5 12 12 13 Z" opacity="0.9" />
          <path d="M 12 13 C 9.5 7 7 5 5 6 C 6 9 8.5 12 12 13 Z" opacity="0.9" />
          <path d="M 12 13 C 16 10 19.5 9 22 11 C 19 13.5 15.5 13.5 12 13 Z" opacity="0.8" />
          <path d="M 12 13 C 8 10 4.5 9 2 11 C 5 13.5 8.5 13.5 12 13 Z" opacity="0.8" />
        </svg>
        <span className="h-1.5 w-1.5 rotate-45 bg-[#D4AF37] shadow-[0_0_4px_rgba(212,175,55,0.4)]" />
      </div>
      <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent via-[#C59B27]/50 to-[#C59B27]" />
    </div>
  );
};

export const DiwaliGoldDivider = DiwaliLotusDivider;

/**
 * DiwaliDiamondDivider:
 * Fine gold horizontal hairline with a single diamond rhombus in center (Image 1 top divider).
 */
export const DiwaliDiamondDivider: React.FC<{ width?: number | string; className?: string }> = ({
  width = 180,
  className = '',
}) => {
  return (
    <div
      className={`flex items-center justify-center gap-2 select-none pointer-events-none ${className}`}
      style={{ width: typeof width === 'number' ? `${width}px` : width }}
    >
      <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-[#C59B27]/80" />
      <span className="h-2 w-2 rotate-45 bg-[#D4AF37] shadow-[0_0_4px_rgba(212,175,55,0.4)]" />
      <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-[#C59B27]/80" />
    </div>
  );
};

/**
 * DiwaliCardCorners:
 * Authentic golden corner filigree flourish accents for cards (matching Images 1, 2, and 3).
 */
export const DiwaliCardCorners: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <>
    <img
      src="/diwali-corner-filigree.png"
      alt=""
      className="pointer-events-none absolute left-2 top-2 select-none"
      style={{ width: `${size}px`, height: `${size}px` }}
    />
    <img
      src="/diwali-corner-filigree.png"
      alt=""
      className="pointer-events-none absolute right-2 top-2 select-none"
      style={{ width: `${size}px`, height: `${size}px`, transform: 'scaleX(-1)' }}
    />
    <img
      src="/diwali-corner-filigree.png"
      alt=""
      className="pointer-events-none absolute left-2 bottom-2 select-none"
      style={{ width: `${size}px`, height: `${size}px`, transform: 'scaleY(-1)' }}
    />
    <img
      src="/diwali-corner-filigree.png"
      alt=""
      className="pointer-events-none absolute right-2 bottom-2 select-none"
      style={{ width: `${size}px`, height: `${size}px`, transform: 'scale(-1, -1)' }}
    />
  </>
);

/**
 * DiwaliFloatingPetals:
 * Delicate pink lotus petals scattered floating gracefully across the screen (matching Images 1, 2, and 3).
 */
export const DiwaliFloatingPetals: React.FC = () => {
  return (
    <div className="pointer-events-none absolute inset-0 z-[1] select-none overflow-hidden" aria-hidden="true">
      <span className="absolute left-[3%] top-[56%] h-3.5 w-2 rounded-[50%_50%_50%_50%/60%_60%_40%_40%] bg-gradient-to-br from-[#F48FB1] to-[#D81B60] opacity-75 shadow-sm rotate-[25deg]" />
      <span className="absolute left-[6%] top-[62%] h-2.5 w-1.5 rounded-[50%_50%_50%_50%/60%_60%_40%_40%] bg-gradient-to-br from-[#F48FB1] to-[#C2185B] opacity-65 shadow-sm -rotate-[15deg]" />
      <span className="absolute left-[24%] bottom-[12%] h-3 w-2 rounded-[50%_50%_50%_50%/60%_60%_40%_40%] bg-gradient-to-br from-[#F48FB1] to-[#D81B60] opacity-70 shadow-sm rotate-[45deg]" />
      <span className="absolute right-[4%] top-[28%] h-3 w-1.5 rounded-[50%_50%_50%_50%/60%_60%_40%_40%] bg-gradient-to-br from-[#F48FB1] to-[#D81B60] opacity-70 shadow-sm -rotate-[35deg]" />
      <span className="absolute right-[10%] top-[38%] h-2.5 w-1.5 rounded-[50%_50%_50%_50%/60%_60%_40%_40%] bg-gradient-to-br from-[#F48FB1] to-[#C2185B] opacity-60 shadow-sm rotate-[10deg]" />
      <span className="absolute right-[9%] bottom-[22%] h-3.5 w-2 rounded-[50%_50%_50%_50%/60%_60%_40%_40%] bg-gradient-to-br from-[#F48FB1] to-[#D81B60] opacity-75 shadow-sm -rotate-[20deg]" />
    </div>
  );
};

/**
 * DiwaliZariBorder:
 * Full-width royal maroon and gold embroidered ribbon border at bottom of screen (Images 2 & 3).
 */
export const DiwaliZariBorder: React.FC = () => {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-7 select-none overflow-hidden"
      style={{
        backgroundImage: 'url(/diwali-zari-border.png)',
        backgroundRepeat: 'repeat-x',
        backgroundPosition: 'bottom center',
        backgroundSize: 'auto 100%',
        boxShadow: '0 -2px 10px rgba(122, 18, 30, 0.15)',
      }}
    />
  );
};

/**
 * DiwaliHangingDiyas:
 * Staggered hanging brass diyas on chains from top corners (Image 1).
 */
export const DiwaliHangingDiyas: React.FC = () => {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden">
      {/* Left Hanging Diyas */}
      <div className="absolute left-6 top-0 flex gap-6">
        {/* Diya 1 (lower) */}
        <div className="flex flex-col items-center">
          <div className="w-[1.5px] h-32 bg-gradient-to-b from-[#C59B27]/40 to-[#D4AF37]" />
          <DiwaliDiya size={34} lit={true} />
        </div>
        {/* Diya 2 (higher) */}
        <div className="flex flex-col items-center">
          <div className="w-[1.5px] h-20 bg-gradient-to-b from-[#C59B27]/40 to-[#D4AF37]" />
          <DiwaliDiya size={30} lit={true} />
        </div>
      </div>

      {/* Right Hanging Diyas */}
      <div className="absolute right-6 top-0 flex gap-6">
        {/* Diya 3 (higher) */}
        <div className="flex flex-col items-center">
          <div className="w-[1.5px] h-20 bg-gradient-to-b from-[#C59B27]/40 to-[#D4AF37]" />
          <DiwaliDiya size={30} lit={true} />
        </div>
        {/* Diya 4 (lower) */}
        <div className="flex flex-col items-center">
          <div className="w-[1.5px] h-32 bg-gradient-to-b from-[#C59B27]/40 to-[#D4AF37]" />
          <DiwaliDiya size={34} lit={true} />
        </div>
      </div>
    </div>
  );
};

/**
 * DiwaliMandala:
 * Intricate sacred lotus mandala in gold line work.
 */
export const DiwaliMandala: React.FC<{
  size: number;
  spin?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ size, spin = false, className = '', style }) => {
  const petal = (inner: number, outer: number, width: number) =>
    `M0 ${-inner} C ${width} ${-(inner + (outer - inner) * 0.35)} ${width * 0.85} ${-(inner + (outer - inner) * 0.8)} 0 ${-outer} C ${-width * 0.85} ${-(inner + (outer - inner) * 0.8)} ${-width} ${-(inner + (outer - inner) * 0.35)} 0 ${-inner} Z`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="-320 -320 640 640"
      className={`pointer-events-none select-none ${className}`}
      style={{
        ...style,
        animation: spin ? 'diwali-mandala-spin 48s linear infinite' : undefined,
      }}
    >
      <g stroke="#C59B27" fill="none" strokeWidth="1.2">
        <circle r="300" strokeWidth="1.6" strokeDasharray="3 6" />
        <circle r="280" strokeWidth="0.8" />
        {Array.from({ length: 16 }, (_, i) => (
          <path
            key={`outer-${i}`}
            d={petal(190, 275, 42)}
            transform={`rotate(${i * 22.5})`}
            fill="rgba(243, 208, 136, 0.08)"
          />
        ))}
        <circle r="185" strokeWidth="1.2" />
        {Array.from({ length: 32 }, (_, i) => (
          <circle
            key={`dot-${i}`}
            cy="-185"
            r="2.2"
            transform={`rotate(${i * 11.25})`}
            fill="#D4AF37"
          />
        ))}
        <circle r="105" strokeWidth="1" />
        {Array.from({ length: 8 }, (_, i) => (
          <path
            key={`inner-${i}`}
            d={petal(45, 100, 26)}
            transform={`rotate(${i * 45})`}
            fill="rgba(243, 208, 136, 0.18)"
          />
        ))}
        <circle r="42" strokeWidth="1.4" fill="rgba(243, 208, 136, 0.25)" />
        <circle r="22" fill="#D4AF37" fillOpacity="0.4" />
        <circle r="8" fill="#FFF2B8" />
      </g>
      <style>{`
        @keyframes diwali-mandala-spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  );
};
