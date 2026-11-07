import React from 'react';

/**
 * Fixed 1440x810 canvas showing a Diwali plate, with screens drawing only their live parts on top.
 * --diwali-stage-scale (main.tsx) grows it to fill kiosk screens wider than 16:9, such as 1670x900.
 */
const PLATES = [
  '/diwali-plate-code-entry.png',
  '/diwali-plate-printing.png',
  '/diwali-plate-complete.png',
  '/diwali-plate-report.png',
  '/diwali-plate-report-clear.png',
  '/diwali-sprite-slot.png',
  '/diwali-sprite-slot-active.png',
  '/diwali-sprite-diya-lit.png',
];

/** Decode ahead of time so moving between screens never flashes, but only once the welcome art is in. */
let preloaded = false;
export const preloadDiwaliPlates = () => {
  if (preloaded) return;
  preloaded = true;
  const welcomeArt = new Image();
  welcomeArt.onload = welcomeArt.onerror = () => {
    PLATES.forEach((src) => {
      new Image().src = src;
    });
  };
  welcomeArt.src = '/mimo1-diwali-welcome.png';
};

export const DiwaliStage: React.FC<{ plate: string; children: React.ReactNode }> = ({ plate, children }) => (
  <div
    className="absolute left-1/2 top-1/2 h-[810px] w-[1440px] -translate-x-1/2 -translate-y-1/2 select-none overflow-hidden"
  >
    <img
      src={plate}
      alt=""
      draggable={false}
      className="pointer-events-none absolute inset-0 block h-[810px] w-[1440px]"
    />
    {children}
  </div>
);

interface DiwaliHotspotProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  box: { left: number; top: number; width: number; height: number };
  pressTint?: string;
}

/** Invisible touch target over a control that is part of the plate; tints only while pressed. */
export const DiwaliHotspot: React.FC<DiwaliHotspotProps> = ({ box, pressTint = 'active:bg-[#7A4A12]/15', className = '', ...rest }) => (
  <button
    {...rest}
    style={{ ...box, position: 'absolute', zIndex: 20 }}
    className={`flex cursor-pointer items-center justify-center rounded-full bg-transparent transition-colors disabled:cursor-default ${pressTint} ${className}`}
  />
);
