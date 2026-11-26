import React, { useEffect } from 'react';
import './mimo1-xmas-friend.css';

/**
 * MIMO 1.0 (CV-001) Christmas screens: code entry, printing, summary and error, re-implemented from the design the
 * owner's friend built (github.com/Saketsasanka30/MIMO, used with permission; see assets/christmas/mimo1/friend/CREDITS.md).
 * Presentation only: the real 1.0 screens (CodeEntryScreen, PrintingScreen, SummaryScreen, SystemErrorScreen) keep all
 * state, timers, polling and handlers and hand them in here, exactly like the default screens use them.
 * Laid out on the 1.0 1440x810 canvas (the friend's 1000 px landscape stage x 0.81). The tree photo is painted on the
 * page behind the canvas (html.m1f-inner, see the CSS) so it fills the whole screen on any tablet aspect ratio.
 * Pi / tablet budget: no backdrop-filter, no blur, motion is transform / opacity only.
 */

/** While a 1.0 Christmas inner screen is up, the page behind the canvas shows the full-screen tree photo. */
function useInnerBackground() {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('m1f-inner');
    return () => html.classList.remove('m1f-inner');
  }, []);
}

/** Life on top of the friend's design: a light snowfall and three twinkling stars (transform / opacity only). */
const FLAKES = [
  { l: '6%', s: 9, d: '0s', t: '13s', o: 0.55 },
  { l: '17%', s: 16, d: '-4s', t: '15s', o: 0.5, c: true },
  { l: '31%', s: 8, d: '-7s', t: '12s', o: 0.5 },
  { l: '66%', s: 17, d: '-2.5s', t: '14.5s', o: 0.45, c: true },
  { l: '79%', s: 9, d: '-6s', t: '12.5s', o: 0.55 },
  { l: '91%', s: 14, d: '-9s', t: '15s', o: 0.45, c: true },
];
const Atmosphere: React.FC = () => (
  <div className="m1f-atmo" aria-hidden="true">
    {FLAKES.map((f, i) => (
      <span key={i} className={`m1f-flake${f.c ? ' is-crystal' : ''}`} style={{ left: f.l, width: f.s, height: f.s, opacity: f.o, animationDelay: f.d, animationDuration: f.t }}>
        {f.c && (
          <svg viewBox="0 0 24 24" width={f.s} height={f.s} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9L4.9 19.1" />
          </svg>
        )}
      </span>
    ))}
    <span className="m1f-twinkle" style={{ left: '12%', top: '16%' }} />
    <span className="m1f-twinkle m1f-twinkle--b" style={{ left: '88%', top: '18%' }} />
    <span className="m1f-twinkle m1f-twinkle--c" style={{ left: '86%', top: '76%' }} />
  </div>
);

const GoldCheck: React.FC<{ size: number }> = ({ size }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 13l4 4L19 7" />
  </svg>
);

/* ─────────────────────────── code entry ─────────────────────────── */

export interface Mimo1XmasCodeEntryProps {
  code: string;
  isShaking: boolean;
  loading: boolean;
  hasError?: boolean;
  onKey: (val: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export const Mimo1XmasCodeEntry: React.FC<Mimo1XmasCodeEntryProps> = ({ code, isShaking, loading, hasError, onKey, onSubmit, onBack }) => {
  useInnerBackground();
  const ready = code.length === 4 && !loading;
  return (
    <div className="screen visible m1f m1f-code" style={{ display: 'block' }}>
      <Atmosphere />
      <button type="button" className="m1f-back" onClick={onBack} aria-label="Return to home screen" disabled={loading}>
        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
      </button>

      <section className="m1f-card m1f-code-card" aria-label="Enter Mimo Code">
        <h1 className="m1f-heading m1f-code-title">Enter Your Mimo Code Here</h1>

        <div className={`m1f-slots${isShaking ? ' is-shaking' : ''}${hasError ? ' is-error' : ''}`}>
          {[0, 1, 2, 3].map((i) => {
            const ch = code[i];
            return (
              <div key={i} className={`m1f-slot${ch ? ' is-filled' : ''}${i === code.length ? ' is-active' : ''}`}>
                {ch && <span key={`${i}${ch}`} className="m1f-slot-digit">{ch}</span>}
              </div>
            );
          })}
        </div>

        <div className="m1f-feedback" aria-live="polite">
          {loading ? (
            <span className="m1f-feedback-verifying">Verifying code…</span>
          ) : hasError ? (
            <span className="m1f-feedback-error" role="alert">⚠ Invalid code, please try again</span>
          ) : null}
        </div>

        <div className="m1f-keypad" role="group" aria-label="Numeric keypad">
          {DIGITS.map((d) => (
            <button key={d} type="button" id={`key-${d}`} aria-label={d} className="m1f-key" disabled={loading} onClick={() => onKey(d)}>
              {d}
            </button>
          ))}
          <button type="button" id="key-del" aria-label="Delete last digit" className="m1f-key m1f-key--backspace" disabled={loading} onClick={() => onKey('del')}>
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
              <path d="M18 9l-6 6" />
              <path d="M12 9l6 6" />
            </svg>
          </button>
          <button type="button" id="key-0" aria-label="0" className="m1f-key" disabled={loading} onClick={() => onKey('0')}>
            0
          </button>
          <button
            type="button"
            id="key-submit"
            aria-label="Submit Mimo code"
            className={`m1f-key m1f-key--confirm${ready ? ' is-ready' : ''}`}
            disabled={!ready}
            onClick={onSubmit}
          >
            {loading ? <span className="m1f-spinner" aria-hidden="true" /> : <GoldCheck size={34} />}
          </button>
        </div>
      </section>
    </div>
  );
};

/* ─────────────────────────── printing ─────────────────────────── */

/** The friend's status line under the dial, chosen from the progress the real screen shows. */
const stageLabel = (p: number) => (p <= 15 ? 'Warming up printer…' : p <= 35 ? 'Preparing pages…' : p <= 90 ? 'Printing documents…' : 'Finishing up…');

/* Dial geometry (viewBox 200, radius 80, 320 degree sweep with the gap at the bottom), from the friend's CometDial. */
const R = 80;
const SWEEP = 320;
const START = 90 + (360 - SWEEP) / 2;
const pointAt = (deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [100 + Math.cos(a) * R, 100 + Math.sin(a) * R];
};
const TRACK = (() => {
  const [x0, y0] = pointAt(START);
  const [x1, y1] = pointAt(START + SWEEP);
  return `M ${x0.toFixed(3)} ${y0.toFixed(3)} A ${R} ${R} 0 1 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`;
})();
const [HEAD_X, HEAD_Y] = pointAt(START);

export interface Mimo1XmasPrintingProps {
  title: string;
  sub: string;
  statusMsg: string;
  progress: number;
  pageText: string;
  collectingPages: boolean;
  collectCountdown: number;
}

export const Mimo1XmasPrinting: React.FC<Mimo1XmasPrintingProps> = ({ title, sub, statusMsg, progress, pageText, collectingPages, collectCountdown }) => {
  useInnerBackground();
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  const hello = /^Hello (.+)\.\.!$/.exec(title);
  const subLines = sub.split('\n').filter(Boolean);
  const label = stageLabel(pct);
  return (
    <div className="screen visible m1f m1f-print" style={{ display: 'block' }}>
      <Atmosphere />
      <section className="m1f-print-stack" aria-label="Printing in Progress">
        <div className="m1f-card m1f-print-info">
          <h1 className="m1f-heading m1f-print-greeting">
            {hello ? (
              <>
                Hello <span className="m1f-gold">{hello[1]}</span>..!
              </>
            ) : (
              title
            )}
          </h1>
          {subLines.map((line, i) => (
            <p key={i} className="m1f-print-subline">
              {line}
            </p>
          ))}
          {pct < 100 && statusMsg && (
            <p className="m1f-print-stage" role="status" aria-live="polite">
              {statusMsg}
            </p>
          )}
        </div>

        <div className="m1f-card m1f-print-dialcard">
          <div className="m1f-dial" role="progressbar" aria-label="Printing progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <svg viewBox="0 0 200 200" className="m1f-dial-ring" aria-hidden="true">
              <path className="m1f-dial-track" d={TRACK} />
              <path className="m1f-dial-lit" d={TRACK} pathLength={100} style={{ strokeDasharray: `${pct} 100` }} />
              <g className="m1f-dial-head-rot" style={{ transform: `rotate(${(pct / 100) * SWEEP}deg)` }}>
                <circle className="m1f-dial-head" cx={HEAD_X} cy={HEAD_Y} r={16.2 / 2 + 3} />
              </g>
            </svg>
            <div className="m1f-dial-readout">
              <span className="m1f-dial-value">
                {pct}
                <span className="m1f-dial-unit">%</span>
              </span>
            </div>
            <span className="m1f-dial-stage">{label}</span>
          </div>
          <p className="m1f-print-pages">{pageText}</p>
        </div>
      </section>

      <p className="m1f-print-notice">Please do not remove paper while printing</p>

      {collectingPages && (
        <div className="m1f-collect">
          <div className="m1f-card m1f-collect-card">
            <h2 className="m1f-heading m1f-collect-title">Collecting your pages…</h2>
            <p className="m1f-collect-text">
              Your color print is being ejected.
              <br />
              <strong>Please wait at the printer</strong> for your document.
            </p>
            <div className="m1f-collect-count">{collectCountdown}</div>
            <p className="m1f-collect-unit">seconds</p>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────── summary ─────────────────────────── */

export type Mimo1ReportState = 'ask' | 'choose' | 'sending' | 'sent' | 'failed';

export interface Mimo1XmasSummaryProps {
  firstName: string;
  report: Mimo1ReportState;
  issues: { id: string; label: string }[];
  printCode?: string;
  onDone: () => void;
  onReportProblem: () => void;
  onCancelReport: () => void;
  onSendReport: (issueId: string) => void;
}

export const Mimo1XmasSummary: React.FC<Mimo1XmasSummaryProps> = ({ firstName, report, issues, printCode, onDone, onReportProblem, onCancelReport, onSendReport }) => {
  useInnerBackground();
  return (
    <div className="screen visible m1f m1f-summary" style={{ display: 'block' }}>
      <Atmosphere />
      <section className="m1f-card m1f-summary-card" aria-label="Documents Ready">
        <span className="m1f-confetti" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => {
            const a = (i / 14) * Math.PI * 2;
            const d = 170 + (i % 4) * 70;
            return (
              <i
                key={i}
                className={`m1f-confetti-bit m1f-tone-${i % 5}${i % 2 ? '' : ' is-ribbon'}`}
                style={{ ['--tx' as string]: `${Math.round(Math.cos(a) * d)}px`, ['--ty' as string]: `${Math.round(Math.sin(a) * d - 60)}px`, ['--rot' as string]: `${(i * 42) % 360}deg`, animationDelay: `${(i % 5) * 50}ms` } as React.CSSProperties}
              />
            );
          })}
        </span>
        <h1 className="m1f-heading m1f-summary-title">
          <span className="m1f-gold">{firstName.toUpperCase()}</span>, your documents are ready.
        </h1>

        {report === 'ask' && (
          <>
            <div className="m1f-dispenser" aria-hidden="true">
              <div className="m1f-dispenser-slot">
                <div className="m1f-dispenser-mouth" />
              </div>
              <div className="m1f-sheet">
                <span className="m1f-sheet-badge">
                  <svg viewBox="0 0 24 24" width="23" height="23" fill="none">
                    <path d="M6 12.5l4 4L18 8.5" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="m1f-sheet-line" style={{ width: '100%' }} />
                <span className="m1f-sheet-line" style={{ width: '82%' }} />
                <span className="m1f-sheet-line" style={{ width: '66%' }} />
                <span className="m1f-sheet-foot">
                  <i className="m1f-sheet-stamp" />
                  <i className="m1f-sheet-sig" />
                </span>
              </div>
            </div>

            <p className="m1f-collect-line">
              <span className="m1f-arrow" aria-hidden="true">↓</span>
              <span>PLEASE COLLECT YOUR DOCUMENTS FROM BELOW</span>
              <span className="m1f-arrow" aria-hidden="true">↓</span>
            </p>

            <div className="m1f-actions">
              <button type="button" className="m1f-btn m1f-btn--primary m1f-done" onClick={onDone} aria-label="Yes, done">
                <span>DONE</span>
                <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9.5" />
                  <path d="M8.5 12.5l2.5 2.5 4.8-5.2" />
                </svg>
              </button>
              <button type="button" className="m1f-btn m1f-btn--ghost" onClick={onReportProblem} aria-label="Report a problem">
                Report a problem
              </button>
            </div>
          </>
        )}

        {(report === 'choose' || report === 'sending') && (
          <>
            <p className="m1f-summary-q">What went wrong with your print?</p>
            <div className="m1f-issues">
              {issues.map((issue) => (
                <button key={issue.id} type="button" className="m1f-btn m1f-btn--ghost m1f-issue" disabled={report === 'sending'} onClick={() => onSendReport(issue.id)} aria-label={issue.label}>
                  {issue.label}
                </button>
              ))}
            </div>
            <button type="button" className="m1f-link" disabled={report === 'sending'} onClick={onCancelReport} aria-label="Cancel">
              Cancel
            </button>
          </>
        )}

        {(report === 'sent' || report === 'failed') && (
          <>
            <p className="m1f-summary-msg">
              {report === 'sent'
                ? 'Thank you. The MIMO team has been told. Please keep the pages, the team may ask to see them.'
                : `We could not send your report. Please tell the staff your code ${printCode ?? ''}.`}
            </p>
            <button type="button" className="m1f-btn m1f-btn--primary m1f-done" onClick={onDone} aria-label="Done">
              <span>DONE</span>
            </button>
          </>
        )}
      </section>
    </div>
  );
};

/* ─────────────────────────── system error ─────────────────────────── */

export interface Mimo1XmasErrorProps {
  firstName: string;
  errorMsg?: string;
  showRefundBanner?: boolean;
  countdown: number;
  onRetry: () => void;
  onHome: () => void;
}

export const Mimo1XmasError: React.FC<Mimo1XmasErrorProps> = ({ firstName, errorMsg, showRefundBanner, countdown, onRetry, onHome }) => {
  useInnerBackground();
  return (
    <div className="screen visible m1f m1f-error" style={{ display: 'block' }}>
      <Atmosphere />
      <section className="m1f-card m1f-error-card" aria-label="System Error">
        <div className="m1f-error-emblem" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="58" height="58" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="7.5" x2="12" y2="13" />
            <circle cx="12" cy="16.5" r="0.8" fill="currentColor" stroke="none" />
          </svg>
        </div>
        <div className="m1f-error-copy">
          <span className="m1f-error-badge">PRINTING NOTICE</span>
          <h1 className="m1f-heading m1f-error-title">
            Hey <span className="m1f-gold">{firstName}</span>, we encountered an issue.
          </h1>
          <p className="m1f-error-message">{errorMsg || 'A momentary printing or paper issue occurred while processing your document.'}</p>
        </div>
        {showRefundBanner && (
          <div className="m1f-error-details">
            <div className="m1f-error-row">
              <span className="m1f-error-label">Your payment is completely safe</span>
            </div>
            <p className="m1f-error-refund">
              Since your document could not be completed, an automatic refund has been initiated to your original payment method.
            </p>
          </div>
        )}
        <div className="m1f-actions">
          <button type="button" className="m1f-btn m1f-btn--primary m1f-error-btn" onClick={onRetry}>
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            <span>TRY AGAIN</span>
          </button>
          <button type="button" className="m1f-btn m1f-btn--ghost m1f-error-btn" onClick={onHome}>
            <span>RETURN TO HOME</span>
          </button>
        </div>
      </section>
      <p className="m1f-error-footer">
        Returning to home in <strong>{countdown}s</strong> · Need help? Call 1800-MIMO-HELP
      </p>
    </div>
  );
};
