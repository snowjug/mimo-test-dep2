import React from 'react';
import { Printer } from '@phosphor-icons/react';
import { Mimo3XmasShell } from './Mimo3XmasShell';

/**
 * MIMO 3.0 Christmas "Printing" screen (presentation only). Mimo3PrintingScreen keeps the demo simulation,
 * backend polling, timeout and completion logic and passes the numbers it shows in here.
 * Motion: a sheet sliding out of the printer, a soft light sweeping the progress bar, a blinking status lamp.
 * The bar moves with transform (no width animation, no layout).
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

export const Mimo3XmasPrinting: React.FC<Mimo3XmasPrintingProps> = ({ progress, statusMsg, statusTitle, pages, copies, printCode, colorMode, kioskId }) => {
  const shown = Math.max(5, Math.min(100, progress));
  const isColour = colorMode === 'color';
  return (
    <Mimo3XmasShell photo="print" caption="Your pages are on their way">
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

      <main className="x3f-print">
        <div className="x3f-printer" aria-hidden>
          <span className="x3f-printer-halo" />
          <span className="x3f-printer-feed" />
          <div className="x3f-printer-body">
            <span className="x3f-printer-lamp" />
            <span className="x3f-printer-panel" />
            <span className="x3f-printer-slot" />
          </div>
          <div className="x3f-printer-out">
            <span className={`x3f-sheet${isColour ? ' is-colour' : ''}`}>
              <span className="x3f-sheet-head" />
              <span className="x3f-sheet-lines" />
            </span>
          </div>
          <span className="x3f-printer-tray" />
        </div>

        <section className="x3f-print-copy">
          <p className="x3f-eyebrow">{progress >= 100 ? 'Printed' : 'Printing now'}</p>
          <h2 className="x3f-title x3f-title--print">{statusTitle || 'Printing in Progress'}</h2>
          <p className="x3f-lead">Your pages are printing. They will come out in the tray below, please don&apos;t pull the paper.</p>

          <div className="x3f-progress">
            <div className="x3f-progress-top">
              <span>Progress</span>
              <span className="x3f-progress-num">{progress}%</span>
            </div>
            <div className="x3f-track">
              <div className="x3f-fill" style={{ transform: `translate3d(${shown - 100}%, 0, 0)` }}>
                <span className="x3f-fill-sweep" />
              </div>
            </div>
            <p className="x3f-status">
              <span className="x3f-status-dot" />
              {statusMsg}
            </p>
          </div>

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
      </main>

      <footer className="x3f-foot">
        <span>Do not pull paper while feeding. It will eject automatically.</span>
        <span>Having trouble? Call Helpline 1800-MIMO-HELP</span>
      </footer>
    </Mimo3XmasShell>
  );
};
