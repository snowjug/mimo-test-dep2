import React from 'react';
import festiveHangingAsset from '../../assets/festive-corner-hanging-transparent.png';

export const CV001FestiveDecor: React.FC = () => {
  return (
    <div
      className="cv001-festive-decor-wrap"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 5,
        overflow: 'hidden',
      }}
    >
      {/* AMBIENT MANDALA LINE ART MOTIFS */}
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1440 810"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        {/* Left Side Mandala Motif Line Art */}
        <g transform="translate(40, 405)" opacity="0.12">
          <circle cx="0" cy="0" r="240" fill="none" stroke="#A86F2B" strokeWidth="1" strokeDasharray="4 4" />
          <circle cx="0" cy="0" r="180" fill="none" stroke="#A86F2B" strokeWidth="1.5" />
          <circle cx="0" cy="0" r="120" fill="none" stroke="#A86F2B" strokeWidth="1" strokeDasharray="6 3" />
          <circle cx="0" cy="0" r="60" fill="none" stroke="#A86F2B" strokeWidth="1.5" />
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
            <line
              key={deg}
              x1="0"
              y1="0"
              x2={240 * Math.cos((deg * Math.PI) / 180)}
              y2={240 * Math.sin((deg * Math.PI) / 180)}
              stroke="#A86F2B"
              strokeWidth="0.8"
            />
          ))}
        </g>

        {/* Right Side Mandala Motif Line Art */}
        <g transform="translate(1400, 405)" opacity="0.12">
          <circle cx="0" cy="0" r="240" fill="none" stroke="#A86F2B" strokeWidth="1" strokeDasharray="4 4" />
          <circle cx="0" cy="0" r="180" fill="none" stroke="#A86F2B" strokeWidth="1.5" />
          <circle cx="0" cy="0" r="120" fill="none" stroke="#A86F2B" strokeWidth="1" strokeDasharray="6 3" />
          <circle cx="0" cy="0" r="60" fill="none" stroke="#A86F2B" strokeWidth="1.5" />
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
            <line
              key={deg}
              x1="0"
              y1="0"
              x2={240 * Math.cos((deg * Math.PI) / 180)}
              y2={240 * Math.sin((deg * Math.PI) / 180)}
              stroke="#A86F2B"
              strokeWidth="0.8"
            />
          ))}
        </g>

        {/* SOFT FLOATING MARIGOLD PETALS */}
        <g transform="translate(210, 120) rotate(28)">
          <path d="M 0 -8 C 5 -4 6 3 0 8 C -6 3 -5 -4 0 -8 Z" fill="#E65100" opacity="0.75" />
        </g>
        <g transform="translate(1220, 130) rotate(-22)">
          <path d="M 0 -8 C 5 -4 6 3 0 8 C -6 3 -5 -4 0 -8 Z" fill="#F57F17" opacity="0.8" />
        </g>
        <g transform="translate(160, 520) rotate(42)">
          <path d="M 0 -9 C 6 -4 7 3 0 9 C -7 3 -6 -4 0 -9 Z" fill="#E65100" opacity="0.7" />
        </g>
        <g transform="translate(1250, 500) rotate(-35)">
          <path d="M 0 -9 C 6 -4 7 3 0 9 C -7 3 -6 -4 0 -9 Z" fill="#F57F17" opacity="0.75" />
        </g>
        <g transform="translate(230, 710) rotate(15)">
          <path d="M 0 -7 C 4 -3 5 2 0 7 C -5 2 -4 -3 0 -7 Z" fill="#E65100" opacity="0.65" />
        </g>
        <g transform="translate(1190, 720) rotate(-48)">
          <path d="M 0 -7 C 4 -3 5 2 0 7 C -5 2 -4 -3 0 -7 Z" fill="#F57F17" opacity="0.7" />
        </g>
      </svg>

      {/* TOP-LEFT FESTIVE CORNER HANGING */}
      <div
        className="festive-hanging-decor left-hanging"
        style={{
          position: 'absolute',
          top: 0,
          left: '10px',
          width: '240px',
          height: '350px',
          pointerEvents: 'none',
          filter: 'drop-shadow(0 6px 14px rgba(45, 22, 6, 0.28))',
        }}
      >
        <img
          src={festiveHangingAsset}
          alt="Festive Ganesh Chaturthi Top Left Hanging"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            objectPosition: 'top center',
            display: 'block',
          }}
        />
      </div>

      {/* TOP-RIGHT FESTIVE CORNER HANGING (EXACT MIRRORED COUNTERPART) */}
      <div
        className="festive-hanging-decor right-hanging"
        style={{
          position: 'absolute',
          top: 0,
          right: '10px',
          width: '240px',
          height: '350px',
          pointerEvents: 'none',
          transform: 'scaleX(-1)',
          filter: 'drop-shadow(0 6px 14px rgba(45, 22, 6, 0.28))',
        }}
      >
        <img
          src={festiveHangingAsset}
          alt="Festive Ganesh Chaturthi Top Right Hanging"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            objectPosition: 'top center',
            display: 'block',
          }}
        />
      </div>
    </div>
  );
};
