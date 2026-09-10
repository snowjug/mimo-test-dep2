import React from 'react';

const SingleGoldenBell: React.FC = () => (
  <svg width="150" height="375" viewBox="0 0 150 330" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
    <defs>
      {/* Rich Metallic Brass/Gold Gradient */}
      <linearGradient id="bellBrassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFF9C4" />
        <stop offset="18%" stopColor="#F5D061" />
        <stop offset="48%" stopColor="#D4973E" />
        <stop offset="78%" stopColor="#9E6B1F" />
        <stop offset="100%" stopColor="#5D3A08" />
      </linearGradient>

      {/* Radiant Golden Surface Highlight */}
      <linearGradient id="bellHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
        <stop offset="40%" stopColor="#FFE082" stopOpacity="0.5" />
        <stop offset="100%" stopColor="#D4973E" stopOpacity="0" />
      </linearGradient>

      {/* Secondary Rim Shine */}
      <linearGradient id="rimShine" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#9E6B1F" />
        <stop offset="30%" stopColor="#FFF9C4" />
        <stop offset="60%" stopColor="#F5D061" />
        <stop offset="100%" stopColor="#5D3A08" />
      </linearGradient>

      {/* Localized Soft Warm Radiant Glow (Not Page-Wide) */}
      <radialGradient id="bellLocalizedGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#FFE082" stopOpacity="0.42" />
        <stop offset="55%" stopColor="#D4973E" stopOpacity="0.14" />
        <stop offset="100%" stopColor="#FAF4E8" stopOpacity="0" />
      </radialGradient>
    </defs>

    {/* Localized Soft Warm Aura around each bell (Not Page-Wide) */}
    <circle cx="75" cy="195" r="105" fill="url(#bellLocalizedGlow)" />

    {/* Hanging Metallic Chain — Extended Length (7 interlocking links) */}
    <g stroke="url(#bellBrassGrad)" strokeWidth="3.8" fill="none">
      <line x1="75" y1="0" x2="75" y2="25" strokeWidth="4" />
      <ellipse cx="75" cy="32" rx="4.8" ry="8.5" />
      <ellipse cx="75" cy="46" rx="4.8" ry="8.5" />
      <ellipse cx="75" cy="60" rx="4.8" ry="8.5" />
      <ellipse cx="75" cy="74" rx="4.8" ry="8.5" />
      <ellipse cx="75" cy="88" rx="4.8" ry="8.5" />
      <ellipse cx="75" cy="102" rx="4.8" ry="8.5" />
      <ellipse cx="75" cy="116" rx="4.8" ry="8.5" />
    </g>

    <g style={{ filter: 'drop-shadow(0 15px 24px rgba(74, 45, 20, 0.28))' }}>
      {/* Top Mounting Loop Ring */}
      <circle cx="75" cy="129" r="8" fill="none" stroke="url(#bellBrassGrad)" strokeWidth="4.2" />

      {/* Crown Cap Collar */}
      <path d="M 60 136 C 67 133 83 133 90 136 L 88 145 L 62 145 Z" fill="url(#bellBrassGrad)" />
      <ellipse cx="75" cy="145" rx="13" ry="2.5" fill="#5D3A08" opacity="0.4" />

      {/* Upper Ornamental Mold Ring */}
      <ellipse cx="75" cy="150" rx="16" ry="3" fill="url(#bellBrassGrad)" />

      {/* Bell Main Body Dome — Slightly Longer Flared Temple Curve */}
      <path
        d="M 62 150 
           C 54 166 44 192 30 228 
           C 24 243 18 252 14 254
           C 36 264 114 264 136 254
           C 132 252 126 243 120 228
           C 106 192 96 166 88 150 Z"
        fill="url(#bellBrassGrad)"
      />

      {/* 3D Radiant Highlight Curve */}
      <path
        d="M 67 152 C 61 168 53 192 41 228 C 38 236 35 244 33 250 C 51 258 99 258 117 250 C 115 244 112 236 109 228 C 97 192 89 168 83 152 Z"
        fill="url(#bellHighlight)"
        opacity="0.38"
      />

      {/* Horizontal Decorative Groove Lines */}
      <path d="M 39 208 Q 75 216 111 208" fill="none" stroke="#5D3A08" strokeWidth="1.2" opacity="0.45" />
      <path d="M 34 224 Q 75 232 116 224" fill="none" stroke="#FFF9C4" strokeWidth="1.2" opacity="0.6" />

      {/* Bottom Flared Rim Band */}
      <path
        d="M 14 254 
           C 12 258 20 266 30 268
           C 55 273 95 273 120 268
           C 130 266 138 258 136 254
           C 114 260 36 260 14 254 Z"
        fill="url(#rimShine)"
      />
      <ellipse cx="75" cy="260" rx="61" ry="8" fill="none" stroke="#5D3A08" strokeWidth="1.5" opacity="0.6" />

      {/* Clapper / Tongue Hanging Bead — Extended Reach */}
      <line x1="75" y1="260" x2="75" y2="296" stroke="url(#bellBrassGrad)" strokeWidth="3.8" />
      <circle cx="75" cy="298" r="8.5" fill="url(#bellBrassGrad)" />
      <circle cx="73" cy="296" r="3.2" fill="#FFF9C4" opacity="0.88" />
    </g>
  </svg>
);

export const CV001BellsDecor: React.FC = () => {
  return (
    <>
      <style>{`
        @keyframes gentleBellSwayLeft {
          0%, 100% { transform: rotate(0deg); }
          50%      { transform: rotate(1.4deg); }
        }
        @keyframes gentleBellSwayRight {
          0%, 100% { transform: rotate(0deg); }
          50%      { transform: rotate(-1.4deg); }
        }
      `}</style>
      <div
        className="cv001-bells-decor-wrap"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 5,
          overflow: 'hidden',
        }}
      >
        {/* Top Left Symmetrical Golden Bell */}
        <div style={{ position: 'absolute', top: 0, left: '50px', transformOrigin: 'top center', animation: 'gentleBellSwayLeft 6s ease-in-out infinite' }}>
          <SingleGoldenBell />
        </div>

        {/* Top Right Symmetrical Golden Bell */}
        <div style={{ position: 'absolute', top: 0, right: '50px', transformOrigin: 'top center', animation: 'gentleBellSwayRight 6s ease-in-out infinite 0.5s' }}>
          <SingleGoldenBell />
        </div>
      </div>
    </>
  );
};


