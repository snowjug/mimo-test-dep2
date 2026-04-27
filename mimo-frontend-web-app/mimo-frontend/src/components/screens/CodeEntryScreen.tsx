import React, { useState, useEffect } from 'react';

interface CodeEntryScreenProps {
  onSuccess: () => void;
  isActive: boolean;
  code: string;
  setCode: React.Dispatch<React.SetStateAction<string>>;
  hasError?: boolean;
}

export const CodeEntryScreen: React.FC<CodeEntryScreenProps> = ({ onSuccess, isActive, code, setCode, hasError }) => {
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

      await onSuccess(); // backend call

    } catch (err: any) {
      console.error(err);

      // 👇 Trigger shake animation
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);

      // 👇 Optional: clear code
      setTimeout(() => setCode(''), 600);

    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isActive) {
      const timer = setTimeout(() => {
        setCode('');  
        setIsShaking(false);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isActive, setCode]);

  return (
    <div 
        className={`screen code-entry-wrap ${isActive ? 'visible' : ''}`}
        style={{ display: isActive ? 'flex' : 'none' }}
    >
      <div className="keypad-layout">
        <div className="input-display-area">
          <div className="entry-instruction">
            <h2>Enter Your Mimo <br /> Code Here</h2>
            <p>Enter your 4-digit code provided to you.</p>
          </div>
          <div className={`slots-container ${isShaking ? 'shake error' : ''}`}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`code-slot ${i === code.length && !isShaking ? 'active' : ''} ${i < code.length ? 'filled' : ''} ${isShaking ? 'error-box' : ''}`}
                style={isShaking ? { borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5' } : {}}
              >
                {code[i] || ''}
              </div>
            ))}
          </div>
        </div>
        <div className="modern-keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
            <button key={num} className="num-btn" onClick={() => handleNumClick(num)}>{num}</button>
          ))}

          <button className="num-btn accent-red" onClick={() => handleNumClick('del')}>
            <span className="material-symbols-outlined">backspace</span>
          </button>
          <button className="num-btn" onClick={() => handleNumClick('0')}>0</button>
          <button
            className={`num-btn submit-btn ${code.length === 4 ? 'ready' : ''}`}
            onClick={handleSubmit}
            disabled={code.length !== 4 || loading}
          >
            <span className="material-symbols-outlined">
              {loading ? "hourglass_empty" : "check"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
