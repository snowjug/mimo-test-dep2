import React, { useState, useEffect } from 'react';

interface CodeEntryScreenProps {
  onSuccess: () => void;
  onBack: () => void;
  isActive: boolean;
  code: string;
  setCode: React.Dispatch<React.SetStateAction<string>>;
  hasError?: boolean;
}

export const CodeEntryScreen: React.FC<CodeEntryScreenProps> = ({
  onSuccess,
  onBack,
  isActive,
  code,
  setCode,
  hasError,
}) => {
  const [isShaking, setIsShaking] = useState(false);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (hasError) {
      setIsShaking(true);
      const timer = setTimeout(() => setIsShaking(false), 500);
      return () => clearTimeout(timer);
    }
  }, [hasError]);

  const handleNumClick = (val: string) => {
    if (val === 'del') {
      setCode((prev) => prev.slice(0, -1));
    } else if (code.length < 4) {
      setCode((prev) => prev + val);
    }
  };

  const handleSubmit = async () => {
    if (code.length !== 4 || loading) return;
    try {
      setLoading(true);
      await onSuccess();
    } catch (err: any) {
      console.error(err);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      setTimeout(() => setCode(''), 600);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isActive) {
      const timer = setTimeout(() => setIsShaking(false), 0);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  return (
    <div
      className={`screen code-entry-wrap ${isActive ? 'visible' : ''}`}
      style={{ display: isActive ? 'flex' : 'none' }}
    >
      {/* Botanical background shared layer */}
      <div className="kiosk-bg" />

      {/* Ambient warm glows */}
      <div className="ambient-glow glow-1" />
      <div className="ambient-glow glow-2" />

      {/* Back button */}
      <button
        onClick={onBack}
        className="kiosk-back-btn"
        aria-label="Go back to home"
      >
        <span className="material-symbols-outlined">arrow_back</span>
      </button>

      {/* Main layout */}
      <div className="keypad-layout">

        {/* LEFT: Instruction + Code Slots */}
        <div className="input-display-area">
          <div className="entry-instruction">
            <h2>Enter Your Mimo<br />Code Here</h2>
          </div>

          {/* Code slots */}
          <div className={`slots-container ${isShaking ? 'shake' : ''}`}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`code-slot
                  ${i === code.length && !isShaking ? 'active' : ''}
                  ${i < code.length ? 'filled' : ''}
                `}
                style={
                  isShaking
                    ? {
                        borderColor: 'rgba(239,68,68,0.70)',
                        backgroundColor: 'rgba(239,68,68,0.12)',
                        color: '#fca5a5',
                        boxShadow: '0 0 0 2px rgba(239,68,68,0.35)',
                      }
                    : {}
                }
              >
                {code[i] ? '●' : ''}
              </div>
            ))}
          </div>


        </div>

        {/* RIGHT: Keypad */}
        <div className="modern-keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              className="num-btn"
              onClick={() => handleNumClick(num)}
              id={`key-${num}`}
            >
              {num}
            </button>
          ))}

          {/* Delete */}
          <button
            className="num-btn accent-red"
            onClick={() => handleNumClick('del')}
            id="key-del"
          >
            <span className="material-symbols-outlined">backspace</span>
          </button>

          {/* 0 */}
          <button
            className="num-btn"
            onClick={() => handleNumClick('0')}
            id="key-0"
          >
            0
          </button>

          {/* Submit */}
          <button
            className={`num-btn submit-btn ${code.length === 4 ? 'ready' : ''}`}
            onClick={handleSubmit}
            disabled={code.length !== 4 || loading}
            id="key-submit"
          >
            {loading ? (
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  border: '3px solid rgba(255,255,255,0.25)',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  animation: 'mimo-spin 1s linear infinite',
                }}
              />
            ) : (
              <span className="material-symbols-outlined">check</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
