import React from 'react';
import { ArrowClockwise, Clock, HandHeart, House, WarningOctagon } from '@phosphor-icons/react';
import { Mimo3XmasShell } from './Mimo3XmasShell';

/**
 * MIMO 3.0 Christmas error / refund screen (presentation only). Mimo3ErrorScreen keeps the auto-return
 * countdown and the retry / home handlers and hands them in here.
 */
export interface Mimo3XmasErrorProps {
  countdown: number;
  firstName: string;
  errorMsg?: string;
  showRefundBanner: boolean;
  kioskId?: string | null;
  onRetry: () => void;
  onHome: () => void;
}

export const Mimo3XmasError: React.FC<Mimo3XmasErrorProps> = ({ countdown, firstName, errorMsg, showRefundBanner, kioskId, onRetry, onHome }) => (
  <Mimo3XmasShell frame="side">
    <header className="x3f-head">
      <div className="x3f-chip x3f-chip--warn">
        <WarningOctagon size={22} weight="bold" />
        <span>Print notification • Station {kioskId || 'SV-003'}</span>
      </div>
      <div className="x3f-chip x3f-chip--quiet">
        <Clock size={18} weight="bold" />
        <span>
          Returning home in <strong className="x3f-count">{countdown}s</strong>
        </span>
      </div>
    </header>

    <section className="x3f-side-copy">
      <p className="x3f-eyebrow">Hello {firstName},</p>
      <h2 className="x3f-title">
        We couldn&apos;t
        <br />
        <span>finish this print</span>
      </h2>
      <p className="x3f-message">{errorMsg || 'We were unable to complete your print job at this time.'}</p>

      {showRefundBanner && (
        <div className="x3f-refund">
          <span className="x3f-refund-icon">
            <HandHeart size={26} weight="bold" />
          </span>
          <span>
            <strong>Automatic Refund Guaranteed</strong>
            Because the physical printer could not produce your pages, your payment will be refunded to your original payment source within 2-4 hours. You do not need to do anything.
          </span>
        </div>
      )}

      <div className="x3f-actions">
        <button onClick={onRetry} id="error-retry-btn" className="x3f-btn x3f-btn--red">
          <ArrowClockwise size={26} weight="bold" />
          <span>Re-enter code</span>
        </button>
        <button onClick={onHome} id="error-home-btn" className="x3f-btn x3f-btn--ghost">
          <House size={26} weight="bold" />
          <span>Return to home</span>
        </button>
      </div>
    </section>

    <footer className="x3f-foot">
      <span>MIMO Customer Care Desk: 1800-MIMO-HELP (Toll-Free, 24/7)</span>
      <span>MIMO 3.0 Instant Failure Protection Active</span>
    </footer>
  </Mimo3XmasShell>
);
