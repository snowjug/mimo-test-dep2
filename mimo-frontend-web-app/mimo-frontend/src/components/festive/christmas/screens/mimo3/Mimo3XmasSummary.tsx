import React from 'react';
import { CaretDown, Check, Clock, House, WarningCircle } from '@phosphor-icons/react';
import { Mimo3XmasShell } from './Mimo3XmasShell';

/**
 * MIMO 3.0 Christmas "Collect your documents" screen with the report-an-issue drawer (presentation only).
 * Mimo3SummaryScreen keeps the auto-return countdown and the report request and hands their state in here.
 */
export interface Mimo3XmasSummaryProps {
  countdown: number;
  fileName?: string;
  sheets: number;
  isReporting: boolean;
  reportSuccess: boolean;
  onDone: () => void;
  onToggleReport: () => void;
  onReport: (issue: string) => void;
}

const ISSUES = ['Paper Jam', 'Poor Quality', 'Wrong Page Count', 'Did not print'];

export const Mimo3XmasSummary: React.FC<Mimo3XmasSummaryProps> = ({ countdown, fileName, sheets, isReporting, reportSuccess, onDone, onToggleReport, onReport }) => (
  <Mimo3XmasShell frame="side">
    <header className="x3f-head">
      <div className="x3f-chip x3f-chip--good">
        <Check size={22} weight="bold" />
        <span>Print completed • Physical output ready</span>
      </div>
      <div className="x3f-chip x3f-chip--quiet">
        <Clock size={18} weight="bold" />
        <span>
          Auto return in <strong className="x3f-count">{countdown}s</strong>
        </span>
      </div>
    </header>

    <section className="x3f-side-copy">
      <p className="x3f-script">Merry Christmas!</p>
      <h2 className="x3f-title">
        Collect your
        <br />
        <span>documents</span>
      </h2>
      <p className="x3f-lead">Please take all printed sheets from the dispenser tray below the kiosk.</p>

      <dl className="x3f-facts x3f-facts--two">
        <div>
          <dt>File printed</dt>
          <dd className="x3f-ellipsis">{fileName || 'Official Printed Document'}</dd>
        </div>
        <div>
          <dt>Total pages</dt>
          <dd className="is-colour">{sheets} Sheets Completed</dd>
        </div>
      </dl>

      <div className="x3f-actions">
        <button onClick={onDone} id="summary-done-btn" className="x3f-btn x3f-btn--primary">
          <House size={28} weight="bold" />
          <span>Done / Return home</span>
        </button>
        <button onClick={onToggleReport} className={`x3f-btn x3f-btn--ghost${isReporting ? ' is-open' : ''}`}>
          <WarningCircle size={24} weight="bold" />
          <span>Report Issue</span>
        </button>
      </div>

      {isReporting && (
        <div className="x3f-report">
          {reportSuccess ? (
            <p className="x3f-report-ok">✓ Issue reported to MIMO operations support. Thank you.</p>
          ) : (
            <>
              <p className="x3f-report-q">What went wrong with your print?</p>
              <div className="x3f-report-opts">
                {ISSUES.map((opt) => (
                  <button key={opt} onClick={() => onReport(opt)} className="x3f-opt">
                    {opt}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>

    <div className="x3f-tray" aria-hidden>
      <span>Collect from the tray below</span>
      <CaretDown size={34} weight="bold" className="x3f-tray-arrow" />
    </div>

    <footer className="x3f-foot">
      <span>MIMO 3.0 • Have a wonderful day!</span>
      <span>Powered by VisionPrintt</span>
    </footer>
  </Mimo3XmasShell>
);
