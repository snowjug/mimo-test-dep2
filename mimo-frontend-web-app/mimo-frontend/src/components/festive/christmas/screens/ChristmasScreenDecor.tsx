import React from 'react';
import type { ChristmasVariant } from '../ChristmasWelcome';
import { Mimo1ChristmasScreens } from './mimo1/Mimo1ChristmasScreens';
import { Mimo2ChristmasScreens } from './mimo2/Mimo2ChristmasScreens';

/**
 * Christmas design for every screen after the welcome screen (code entry, printing, summary, error,
 * maintenance), one module per machine. Rendered above the normal screens only while the kiosk theme is
 * "christmas". It is purely visual: the wrapper never takes pointer events, so every button and keypad of
 * the real screen underneath keeps working, and no print / code / payment logic lives here.
 * Each machine module restyles its own screens through CSS scoped to html.kiosk-xmas and adds decorative layers.
 * MIMO 3.0 needs no overlay: its screens render their own full-screen Christmas design (screens/mimo3/Mimo3Xmas*.tsx).
 */
export type KioskScreen =
  | 'main-interface'
  | 'code-entry-screen'
  | 'printing-screen'
  | 'summary-screen'
  | 'system-error-screen'
  | 'maintenance-screen';

export interface ChristmasScreensProps {
  screen: KioskScreen | string;
}

export const ChristmasScreenDecor: React.FC<{ variant: ChristmasVariant; screen: KioskScreen | string }> = ({ variant, screen }) => {
  if (screen === 'main-interface') return null; // the welcome screen has its own Christmas design
  return (
    <div className={`xmas-decor xmas-decor--${variant}`} data-screen={screen} aria-hidden>
      {variant === 'mimo1' && <Mimo1ChristmasScreens screen={screen} />}
      {variant === 'mimo2' && <Mimo2ChristmasScreens screen={screen} />}
    </div>
  );
};
