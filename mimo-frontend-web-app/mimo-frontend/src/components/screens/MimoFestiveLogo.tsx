import React from 'react';

export const MimoFestiveLogo: React.FC = () => {
  return (
    <div
      className="mimo-festive-logo-wrap"
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        margin: '2px 0',
      }}
    >
      <svg
        width="820"
        height="195"
        viewBox="0 0 820 195"
        style={{
          overflow: 'visible',
          filter: 'drop-shadow(0 14px 28px rgba(74, 45, 20, 0.38))',
        }}
      >
        <defs>
          {/* Multi-Stop Rich Antique 3D Gold Metallic Gradient */}
          <linearGradient id="festive3DGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4A260F" />
            <stop offset="15%" stopColor="#8C5C18" />
            <stop offset="35%" stopColor="#D49B3F" />
            <stop offset="55%" stopColor="#FDE699" />
            <stop offset="75%" stopColor="#C88E33" />
            <stop offset="90%" stopColor="#8C5C18" />
            <stop offset="100%" stopColor="#3B1C0B" />
          </linearGradient>

          {/* Shimmer Highlight Gradient for Petals & Swooshes */}
          <linearGradient id="festiveShimmerGold" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFF7C2" />
            <stop offset="40%" stopColor="#F5A623" />
            <stop offset="100%" stopColor="#C97510" />
          </linearGradient>

          {/* Crimson Tilak Gradient */}
          <linearGradient id="festiveTilakRed" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#E74C3C" />
            <stop offset="100%" stopColor="#900C3F" />
          </linearGradient>

          {/* Leaf Accent Gradient */}
          <linearGradient id="festiveLeafGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FDE699" />
            <stop offset="50%" stopColor="#D49B3F" />
            <stop offset="100%" stopColor="#6E3D11" />
          </linearGradient>

          {/* Soft Bevel Inner Shadow Filter */}
          <filter id="logoDepthShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="2" dy="8" stdDeviation="5" floodColor="#261205" floodOpacity="0.45" />
          </filter>
        </defs>

        <g filter="url(#logoDepthShadow)">
          {/* ========================================================
              LETTER 1: 'M' (Bold Gold with Top-Left Sprouting Leaves)
             ======================================================== */}
          <g id="letter-M1">
            {/* Top-Left Sprouting Leaf Branch Motif */}
            <g id="m1-leaf-branch">
              {/* Main upward leaf */}
              <path
                d="M 52 68 C 22 45 12 25 26 18 C 40 14 48 38 58 60 Z"
                fill="url(#festiveLeafGold)"
                stroke="#6E3D11"
                strokeWidth="0.8"
              />
              {/* Secondary outward leaf */}
              <path
                d="M 46 78 C 16 68 5 56 14 46 C 24 38 40 60 50 74 Z"
                fill="url(#festiveShimmerGold)"
                stroke="#6E3D11"
                strokeWidth="0.8"
              />
              {/* Third smaller leaf */}
              <path
                d="M 58 60 C 38 44 32 30 42 28 C 50 26 54 44 60 54 Z"
                fill="url(#festive3DGold)"
              />
            </g>

            {/* Main M1 Letter Body */}
            <path
              d="M 54 175 L 54 58 L 84 58 L 132 135 L 180 58 L 210 58 L 210 175 L 180 175 L 180 92 L 140 156 L 124 156 L 84 92 L 84 175 Z"
              fill="url(#festive3DGold)"
              stroke="#FDE699"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />

            {/* Base Lotus Petal Accents on M1 */}
            {/* Left Foot Lotus */}
            <g transform="translate(69, 175)">
              <path d="M 0 0 C -10 -12 -12 -24 0 -30 C 12 -24 10 -12 0 0 Z" fill="url(#festiveShimmerGold)" />
              <path d="M -3 -2 C -15 -8 -18 -18 -10 -24 C -4 -18 2 -8 -3 -2 Z" fill="url(#festive3DGold)" />
              <path d="M 3 -2 C 15 -8 18 -18 10 -24 C 4 -18 -2 -8 3 -2 Z" fill="url(#festive3DGold)" />
            </g>
            {/* Center V Lotus */}
            <g transform="translate(132, 156)">
              <path d="M 0 0 C -8 -10 -10 -20 0 -25 C 10 -20 8 -10 0 0 Z" fill="url(#festiveShimmerGold)" />
              <path d="M -2 -2 C -12 -7 -14 -15 -8 -20 C -3 -15 2 -7 -2 -2 Z" fill="url(#festive3DGold)" />
              <path d="M 2 -2 C 12 -7 14 -15 8 -20 C 3 -15 -2 -7 2 -2 Z" fill="url(#festive3DGold)" />
            </g>
            {/* Right Foot Lotus */}
            <g transform="translate(195, 175)">
              <path d="M 0 0 C -10 -12 -12 -24 0 -30 C 12 -24 10 -12 0 0 Z" fill="url(#festiveShimmerGold)" />
              <path d="M -3 -2 C -15 -8 -18 -18 -10 -24 C -4 -18 2 -8 -3 -2 Z" fill="url(#festive3DGold)" />
              <path d="M 3 -2 C 15 -8 18 -18 10 -24 C 4 -18 -2 -8 3 -2 Z" fill="url(#festive3DGold)" />
            </g>
          </g>

          {/* ========================================================
              LETTER 2: 'I' (Lord Ganesha Mukut, Tilak & Trunk Profile)
             ======================================================== */}
          <g id="letter-I-ganesha" transform="translate(235, 0)">
            {/* 5-Petal Golden Ganesha Crown (Mukut) at Top */}
            <g id="ganesha-crown" transform="translate(42, 22)">
              {/* Center Tall Crown Petal */}
              <path d="M 0 0 C -6 12 -8 26 0 34 C 8 26 6 12 0 0 Z" fill="url(#festiveShimmerGold)" />
              {/* Mid Left Petal */}
              <path d="M 0 34 C -12 20 -24 12 -20 6 C -12 4 -4 20 0 34 Z" fill="url(#festive3DGold)" />
              {/* Mid Right Petal */}
              <path d="M 0 34 C 12 20 24 12 20 6 C 12 4 4 20 0 34 Z" fill="url(#festive3DGold)" />
              {/* Outer Left Petal */}
              <path d="M 0 34 C -20 28 -32 24 -28 18 C -22 16 -10 26 0 34 Z" fill="url(#festiveLeafGold)" />
              {/* Outer Right Petal */}
              <path d="M 0 34 C 20 28 32 24 28 18 C 22 16 10 26 0 34 Z" fill="url(#festiveLeafGold)" />
              {/* Crown Base Band */}
              <path d="M -26 34 Q 0 40 26 34 Q 26 39 0 44 Q -26 39 -26 34 Z" fill="url(#festiveShimmerGold)" />
            </g>

            {/* Crimson Tilak & Dot */}
            <circle cx="42" cy="62" r="3.5" fill="url(#festiveTilakRed)" />
            <path d="M 42 67 C 37 76 39 85 42 89 C 45 85 47 76 42 67 Z" fill="url(#festiveTilakRed)" />
            <path d="M 28 87 Q 42 93 56 87" stroke="#FDE699" strokeWidth="2" fill="none" />

            {/* Main Stem of 'I' combining Ganesha Ear, Face & Trunk */}
            {/* Ganesha Left Ear & Stem Body */}
            <path
              d="M 28 92 
                 C 2 98 -5 138 28 148 
                 C 30 162 25 175 42 175 
                 C 59 175 54 162 56 148 
                 C 88 138 82 98 56 92 Z"
              fill="url(#festive3DGold)"
              stroke="#FDE699"
              strokeWidth="1.2"
            />

            {/* Graceful Ganesha Trunk Swoop to the Right */}
            <path
              d="M 52 115 
                 C 72 120 85 138 72 158 
                 C 64 170 48 175 58 185 
                 C 68 190 82 182 78 170 
                 C 74 162 65 165 62 155 
                 C 68 145 78 135 68 120 Z"
              fill="url(#festiveShimmerGold)"
              stroke="#6E3D11"
              strokeWidth="0.8"
            />

            {/* Eye of Lord Ganesha */}
            <ellipse cx="50" cy="108" rx="2.5" ry="4" fill="#3B1C0B" />
            <circle cx="49" cy="107" r="1" fill="#FFF7C2" />
          </g>

          {/* ========================================================
              LETTER 3: 'M' (Second Bold Gold M with Base Lotus Accents)
             ======================================================== */}
          <g id="letter-M2" transform="translate(340, 0)">
            <path
              d="M 54 175 L 54 58 L 84 58 L 132 135 L 180 58 L 210 58 L 210 175 L 180 175 L 180 92 L 140 156 L 124 156 L 84 92 L 84 175 Z"
              fill="url(#festive3DGold)"
              stroke="#FDE699"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />

            {/* Base Lotus Petal Accents on M2 */}
            <g transform="translate(69, 175)">
              <path d="M 0 0 C -10 -12 -12 -24 0 -30 C 12 -24 10 -12 0 0 Z" fill="url(#festiveShimmerGold)" />
              <path d="M -3 -2 C -15 -8 -18 -18 -10 -24 C -4 -18 2 -8 -3 -2 Z" fill="url(#festive3DGold)" />
              <path d="M 3 -2 C 15 -8 18 -18 10 -24 C 4 -18 -2 -8 3 -2 Z" fill="url(#festive3DGold)" />
            </g>
            <g transform="translate(132, 156)">
              <path d="M 0 0 C -8 -10 -10 -20 0 -25 C 10 -20 8 -10 0 0 Z" fill="url(#festiveShimmerGold)" />
              <path d="M -2 -2 C -12 -7 -14 -15 -8 -20 C -3 -15 2 -7 -2 -2 Z" fill="url(#festive3DGold)" />
              <path d="M 2 -2 C 12 -7 14 -15 8 -20 C 3 -15 -2 -7 2 -2 Z" fill="url(#festive3DGold)" />
            </g>
            <g transform="translate(195, 175)">
              <path d="M 0 0 C -10 -12 -12 -24 0 -30 C 12 -24 10 -12 0 0 Z" fill="url(#festiveShimmerGold)" />
              <path d="M -3 -2 C -15 -8 -18 -18 -10 -24 C -4 -18 2 -8 -3 -2 Z" fill="url(#festive3DGold)" />
              <path d="M 3 -2 C 15 -8 18 -18 10 -24 C 4 -18 -2 -8 3 -2 Z" fill="url(#festive3DGold)" />
            </g>
          </g>

          {/* ========================================================
              LETTER 4: 'O' (Golden Ring with Crescent & Inner Lotus)
             ======================================================== */}
          <g id="letter-O" transform="translate(565, 0)">
            {/* Outer Golden Crescent Accent Swoosh Wrapping Top-Left */}
            <path
              d="M 25 110 C 15 65 55 42 105 45 C 72 43 32 68 35 118 Z"
              fill="url(#festiveShimmerGold)"
            />

            {/* Main Thick Golden O Ring */}
            <path
              d="M 102 55 
                 C 142 55 168 80 168 115 
                 C 168 150 142 175 102 175 
                 C 62 175 36 150 36 115 
                 C 36 80 62 55 102 55 Z
                 M 102 82 
                 C 78 82 64 96 64 115 
                 C 64 134 78 148 102 148 
                 C 126 148 140 134 140 115 
                 C 140 96 126 82 102 82 Z"
              fill="url(#festive3DGold)"
              stroke="#FDE699"
              strokeWidth="1.2"
            />

            {/* Inner Golden Lotus Bloom inside 'O' */}
            <g transform="translate(102, 148)">
              {/* Center lotus petal */}
              <path d="M 0 0 C -12 -16 -14 -36 0 -48 C 14 -36 12 -16 0 0 Z" fill="url(#festiveShimmerGold)" />
              {/* Left lotus petal */}
              <path d="M -4 -2 C -22 -12 -28 -28 -18 -38 C -8 -30 2 -12 -4 -2 Z" fill="url(#festive3DGold)" />
              {/* Right lotus petal */}
              <path d="M 4 -2 C 22 -12 28 -28 18 -38 C 8 -30 -2 -12 4 -2 Z" fill="url(#festive3DGold)" />
            </g>
          </g>

          {/* ========================================================
              SUPERSCRIPT TAG: '1.0' (Matching Gold Typography)
             ======================================================== */}
          <g id="tag-1.0" transform="translate(735, 38)">
            <text
              x="0"
              y="45"
              fill="url(#festiveShimmerGold)"
              stroke="#3B1C0B"
              strokeWidth="1.5"
              paintOrder="stroke fill"
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: '66px',
                fontWeight: 900,
                letterSpacing: '1px',
                filter: 'drop-shadow(0 4px 10px rgba(74, 45, 20, 0.45))',
              }}
            >
              1.0
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
};
