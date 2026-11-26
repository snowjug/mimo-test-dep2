import React from 'react';
import type { ChristmasVariant } from '../ChristmasWelcome';
import { Mimo1ChristmasScreens } from './mimo1/Mimo1ChristmasScreens';
import { Mimo2ChristmasScreens } from './mimo2/Mimo2ChristmasScreens';
import { Mimo3ChristmasScreens } from './mimo3/Mimo3ChristmasScreens';

/**
 * Christmas design for every screen after the welcome screen (code entry, printing, summary, error,
 * maintenance), one module per machine. Rendered above the normal screens only while the kiosk theme is
 * "christmas". It is purely visual: the wrapper never takes pointer events, so every button and keypad of
 * the real screen underneath keeps working, and no print / code / payment logic lives here.
 * Each machine module restyles its own screens through CSS scoped to html.kiosk-xmas and adds decorative layers.
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
      {variant === 'mimo3' && <Mimo3ChristmasScreens screen={screen} />}
    </div>
  );
};
