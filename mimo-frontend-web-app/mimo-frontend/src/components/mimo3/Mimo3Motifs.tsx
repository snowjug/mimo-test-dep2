import React from 'react';

/**
 * MIMO 3.0 Sacred Temple Motifs (Clean White & Warm Saffron/Gold Aesthetic)
 * Lightweight SVG vector elements inspired by Indian temple architecture:
 * - Subtle geometric mandala watermark for clean white backdrops
 * - Jharokha (carved stone arch)
 * - Polished Brass Diya with animated flame
 * - Antique gold zari border
 */

export const SacredMandala: React.FC<{ size?: number; className?: string; opacity?: number }> = ({
  size = 600,
  className = '',
  opacity = 0.06,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 600 600"
    className={`pointer-events-none select-none ${className}`}
    style={{ opacity }}
    aria-hidden="true"
  >
    <defs>
      <radialGradient id="mandalaGold" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#D97706" stopOpacity="0.8" />
        <stop offset="40%" stopColor="#F59E0B" stopOpacity="0.5" />
        <stop offset="80%" stopColor="#B45309" stopOpacity="0.25" />
        <stop offset="100%" stopColor="#78350F" stopOpacity="0" />
      </radialGradient>
    </defs>

    {/* Concentric rings */}
    <circle cx="300" cy="300" r="280" fill="none" stroke="url(#mandalaGold)" strokeWidth="1.5" strokeDasharray="4 6" />
    <circle cx="300" cy="300" r="250" fill="none" stroke="url(#mandalaGold)" strokeWidth="2" />
    <circle cx="300" cy="300" r="220" fill="none" stroke="url(#mandalaGold)" strokeWidth="1" strokeDasharray="2 4" />
    <circle cx="300" cy="300" r="180" fill="none" stroke="url(#mandalaGold)" strokeWidth="1.5" />
    <circle cx="300" cy="300" r="120" fill="none" stroke="url(#mandalaGold)" strokeWidth="1.5" />
    <circle cx="300" cy="300" r="60" fill="none" stroke="url(#mandalaGold)" strokeWidth="2" />

    {/* 16-Petal Star & Lotus Geometry */}
    {[...Array(16)].map((_, i) => (
      <g key={i} transform={`rotate(${i * 22.5} 300 300)`}>
        <path
          d="M300 50 Q315 120 300 180 Q285 120 300 50 Z"
          fill="none"
          stroke="url(#mandalaGold)"
          strokeWidth="1.2"
        />
        <circle cx="300" cy="80" r="3" fill="#D97706" />
        <path
          d="M300 180 Q310 220 300 250 Q290 220 300 180 Z"
          fill="none"
          stroke="url(#mandalaGold)"
          strokeWidth="1"
        />
        <line x1="300" y1="20" x2="300" y2="40" stroke="url(#mandalaGold)" strokeWidth="1.5" />
      </g>
    ))}

    {/* Central Flower of Life core */}
    {[...Array(8)].map((_, i) => (
      <circle
        key={`core-${i}`}
        cx={300 + 40 * Math.cos((i * Math.PI) / 4)}
        cy={300 + 40 * Math.sin((i * Math.PI) / 4)}
        r="40"
        fill="none"
        stroke="url(#mandalaGold)"
        strokeWidth="1"
      />
    ))}
  </svg>
);

export const JharokhaArch: React.FC<{
  width?: number | string;
  height?: number | string;
  className?: string;
  children?: React.ReactNode;
}> = ({ width = '100%', height = '100%', className = '', children }) => (
  <div className={`relative overflow-hidden ${className}`} style={{ width, height }}>
    {/* Temple arch top border */}
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center">
      <svg width="280" height="32" viewBox="0 0 280 32" fill="none" className="drop-shadow-[0_2px_6px_rgba(217,119,6,0.25)]">
        <path
          d="M0 0 H100 C115 0 125 12 140 12 C155 12 165 0 180 0 H280"
          stroke="url(#goldGrad)"
          strokeWidth="2.5"
          fill="none"
        />
        <circle cx="140" cy="18" r="4" fill="#EA580C" stroke="#D97706" strokeWidth="1" />
        <defs>
          <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#B45309" />
            <stop offset="30%" stopColor="#D97706" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="70%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>
        </defs>
      </svg>
    </div>

    {children}
  </div>
);

export const TempleZariBorder: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`relative h-2 w-full bg-repeat-x border-b border-[#F1E5D1] ${className}`}
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='8' viewBox='0 0 24 8'%3E%3Cpath d='M0 4 L6 0 L12 4 L18 0 L24 4 L18 8 L12 4 L6 8 Z' fill='%23D97706' fill-opacity='0.45'/%3E%3Ccircle cx='12' cy='4' r='1.5' fill='%23EA580C'/%3E%3C/svg%3E")`,
      backgroundSize: '24px 8px',
    }}
    aria-hidden="true"
  />
);

export const DiyaLamp: React.FC<{ size?: number; className?: string }> = ({ size = 32, className = '' }) => (
  <div className={`relative inline-flex flex-col items-center ${className}`} style={{ width: size, height: size * 1.2 }}>
    {/* Animated flame */}
    <div
      className="h-3 w-2 rounded-full bg-gradient-to-t from-[#EA580C] via-[#FBBF24] to-[#FFFBEB] shadow-[0_0_12px_#F59E0B]"
      style={{
        animation: 'devotionalFlame 1.8s ease-in-out infinite alternate',
      }}
    />
    {/* Brass bowl */}
    <svg width={size} height={size * 0.5} viewBox="0 0 32 16" fill="none">
      <path
        d="M2 3 Q16 16 30 3 Q24 15 8 15 Q4 15 2 3 Z"
        fill="url(#brassGrad)"
        stroke="#92400E"
        strokeWidth="1"
      />
      <ellipse cx="16" cy="3" rx="14" ry="2.5" fill="#F59E0B" />
      <defs>
        <linearGradient id="brassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="50%" stopColor="#D97706" />
          <stop offset="100%" stopColor="#78350F" />
        </linearGradient>
      </defs>
    </svg>
  </div>
);
