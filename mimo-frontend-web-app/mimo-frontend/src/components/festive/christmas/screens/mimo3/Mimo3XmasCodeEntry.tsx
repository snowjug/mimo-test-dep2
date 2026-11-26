import React from 'react';
import { ArrowLeft, Backspace, CircleNotch, Printer, ShieldCheck } from '@phosphor-icons/react';
import { Mimo3XmasShell } from './Mimo3XmasShell';

/**
 * MIMO 3.0 Christmas "Enter code" screen (presentation only). Mimo3CodeEntry owns every piece of state and
 * behaviour (digits, validation, shake, loading) and hands it in here, so the keypad works exactly as the
 * default screen does. Keeps the same button ids as the default keypad (#keypad-btn-0..9, -del, -submit).
 */
export interface Mimo3XmasCodeEntryProps {
  code: string;
  isShaking: boolean;
  loading: boolean;
  hasError?: boolean;
  kioskId?: string | null;
  onKey: (val: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export const Mimo3XmasCodeEntry: React.FC<Mimo3XmasCodeEntryProps> = ({ code, isShaking, loading, hasError, kioskId, onKey, onSubmit, onBack }) => {
  const ready = code.length === 4 && !loading;
  return (
    <Mimo3XmasShell frame="code">
      <header className="x3f-head">
        <button onClick={onBack} id="code-entry-back-btn" aria-label="Back to main screen" className="x3f-chip x3f-back">
          <ArrowLeft size={22} weight="bold" />
          <span>Back</span>
        </button>
        <div className="x3f-chip x3f-chip--quiet">
          <ShieldCheck size={20} weight="fill" className="x3f-ok" />
          <span>Secure Verification Station {kioskId || 'SV-003'}</span>
        </div>
      </header>

      <section className="x3f-code-copy">
        <p className="x3f-script">Merry Christmas</p>
        <h2 className="x3f-title">
          Enter your
          <br />
          <span>print code</span>
        </h2>
        <p className="x3f-lead">Type the 4-digit code sent to your phone, or shown on the MIMO website after payment.</p>

        <div className={`x3f-slots${isShaking ? ' is-shaking' : ''}${hasError ? ' is-error' : ''}`}>
          {[0, 1, 2, 3].map((idx) => {
            const char = code[idx];
            const isCurrent = code.length === idx;
            return (
              <div key={idx} className={`x3f-slot${char ? ' is-filled' : isCurrent ? ' is-current' : ''}`}>
                {char ? (
                  <>
                    <span key={`d${char}`} className="x3f-digit">{char}</span>
                    <span key={`r${char}`} className="x3f-slot-ring" />
                  </>
                ) : isCurrent ? (
                  <span className="x3f-caret" />
                ) : (
                  <span className="x3f-dot" />
                )}
              </div>
            );
          })}
        </div>

        {hasError ? (
          <p className="x3f-note x3f-note--error" role="alert">Invalid or expired print code. Please re-enter.</p>
        ) : (
          <p className="x3f-note">
            <span className="x3f-note-i">i</span>
            Test codes: 0000 (B&amp;W demo) • 9999 (Colour demo)
          </p>
        )}
      </section>

      <section className="x3f-pad" aria-label="Keypad">
        {KEYS.map((k) => (
          <button key={k} onClick={() => onKey(k)} id={`keypad-btn-${k}`} className="x3f-key">
            {k}
          </button>
        ))}
        <button onClick={() => onKey('del')} id="keypad-btn-del" aria-label="Delete last digit" className="x3f-key x3f-key--del">
          <Backspace size={44} weight="bold" />
        </button>
        <button onClick={() => onKey('0')} id="keypad-btn-0" className="x3f-key">
          0
        </button>
        <button
          onClick={onSubmit}
          id="keypad-btn-submit"
          disabled={!ready}
          aria-label="Submit print code"
          className={`x3f-key x3f-key--go${ready ? ' is-ready' : ''}`}
        >
          {loading ? (
            <CircleNotch size={40} className="x3f-spin" />
          ) : (
            <>
              <Printer size={34} weight="bold" />
              <span className="x3f-go-label">Print</span>
            </>
          )}
        </button>
      </section>

      <footer className="x3f-foot">
        <span>MIMO Secure Automated Spooler</span>
        <span>Having trouble? Call Helpline 1800-MIMO-HELP</span>
      </footer>
    </Mimo3XmasShell>
  );
};
