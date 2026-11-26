import React from 'react';
import { Printer } from '@phosphor-icons/react';
import { Mimo3XmasShell } from './Mimo3XmasShell';

/**
 * MIMO 3.0 Christmas "Printing" screen (presentation only). Mimo3PrintingScreen keeps the demo simulation,
 * backend polling, timeout and completion logic and passes the numbers it shows in here.
 * The centrepiece is a giant percentage that follows the real progress value (it re-renders only when that
 * value changes, and each new number slides in once), ringed by 24 Christmas lights that switch on as the
 * job advances. Paper sheets drift up behind it; a light sweeps the progress bar. Transform / opacity only.
 */
export interface Mimo3XmasPrintingProps {
  progress: number;
  statusMsg: string;
  statusTitle?: string;
  pages: number;
  copies: number;
  printCode?: string;
  colorMode: 'color' | 'bw';
  kioskId?: string | null;
}

const LIGHTS = 24;
const LIGHT_COLORS = ['#D3313F', '#E9A84A', '#2F8A57', '#E9A84A'];
const RING = Array.from({ length: LIGHTS }, (_, i) => {
  const a = (i / LIGHTS) * Math.PI * 2 - Math.PI / 2;
  return { x: 50 + 46.5 * Math.cos(a), y: 50 + 46.5 * Math.sin(a), c: LIGHT_COLORS[i % LIGHT_COLORS.length] };
});

export const Mimo3XmasPrinting: React.FC<Mimo3XmasPrintingProps> = ({ progress, statusMsg, statusTitle, pages, copies, printCode, colorMode, kioskId }) => {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  const shown = Math.max(5, pct);
  const lit = Math.round((pct / 100) * LIGHTS);
  const isColour = colorMode === 'color';
  const done = pct >= 100;
  return (
    <Mimo3XmasShell frame="print">
      <header className="x3f-head">
        <div className="x3f-brand">
          <span className="x3f-brand-icon">
            <Printer size={26} weight="bold" />
          </span>
          <span>
            <span className="x3f-brand-name">MIMO 3.0 Print Station</span>
            <span className="x3f-brand-sub">Station {kioskId || 'SV-003'} • Active job</span>
          </span>
        </div>
        <div className="x3f-chip x3f-chip--live">
          <span className="x3f-live-dot" />
          <span>{progress}% Completed</span>
        </div>
      </header>

      <div className={`x3f-dial${done ? ' is-done' : ''}`} aria-hidden>
        {RING.map((l, i) => (
          <span
            key={i}
            className={`x3f-bulb${i < lit ? ' is-on' : ''}`}
            style={{ left: `${l.x}%`, top: `${l.y}%`, ['--c' as string]: l.c } as React.CSSProperties}
          />
        ))}
        <div className="x3f-dial-face">
          <span className="x3f-paper" />
          <span className="x3f-paper x3f-paper--2" />
          <span className="x3f-paper x3f-paper--3" />
          <span className="x3f-dial-label">{done ? 'Printed' : 'Printing'}</span>
          <span className="x3f-num">
            <span key={pct} className="x3f-num-val">{pct}</span>
            <span className="x3f-num-pct">%</span>
          </span>
          <span className="x3f-dial-sub">
            {pages * copies} {pages * copies === 1 ? 'sheet' : 'sheets'} · {isColour ? 'Colour' : 'B&W'}
          </span>
        </div>
      </div>

      <section className="x3f-print-copy">
        <p className="x3f-eyebrow">{done ? 'Printed' : 'Printing now'}</p>
        <h2 className="x3f-title x3f-title--print">{statusTitle || 'Printing in Progress'}</h2>
        <p className="x3f-lead">Your pages are printing. They will come out in the tray below, please don&apos;t pull the paper.</p>

        <div className="x3f-track">
          <div className="x3f-fill" style={{ transform: `translate3d(${shown - 100}%, 0, 0)` }}>
            <span className="x3f-fill-sweep" />
          </div>
        </div>
        <p className="x3f-status">
          <span className="x3f-status-dot" />
          {statusMsg}
        </p>

        <dl className="x3f-facts">
          <div>
            <dt>Quantity</dt>
            <dd>
              {pages} {pages === 1 ? 'Page' : 'Pages'} × {copies} {copies === 1 ? 'Copy' : 'Copies'}
            </dd>
          </div>
          <div>
            <dt>Print mode</dt>
            <dd className={isColour ? 'is-colour' : undefined}>{isColour ? 'Colour Print' : 'Standard B&W'}</dd>
          </div>
          <div>
            <dt>Print code</dt>
            <dd className="is-code">{printCode || '----'}</dd>
          </div>
        </dl>
      </section>

      <footer className="x3f-foot">
        <span>Do not pull paper while feeding. It will eject automatically.</span>
        <span>Powered by VisionPrintt</span>
      </footer>
    </Mimo3XmasShell>
  );
};
