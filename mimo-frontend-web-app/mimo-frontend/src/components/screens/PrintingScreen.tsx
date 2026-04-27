import React, { useEffect, useState, useRef } from 'react';

interface PrintingScreenProps {
  isActive: boolean;
  statusTitle?: string;
  statusSub?: string;
  onComplete: () => void;
  pages?: number;
  manualProgress?: number;
}

export const PrintingScreen: React.FC<PrintingScreenProps> = ({ 
  isActive, 
  statusTitle, 
  statusSub, 
  onComplete,
  pages = 1,
  manualProgress 
}) => {
  const [progress, setProgress] = useState(0);
  const [typedTitle, setTypedTitle] = useState('');
  const [typedSub, setTypedSub] = useState('');
  const intervalRef = useRef<number | null>(null);
  const completionTimerRef = useRef<number | null>(null);

  // ✅ COMPLETION STATE
  const isCompleted = progress >= 100;

  const finalTitle = isCompleted
    ? "Print Completed ✅"
    : (statusTitle || "Printing in Progress");

  const finalSub = isCompleted
    ? "Your document has been printed successfully."
    : (statusSub || "Preparing your documents...");

  // Sync with manualProgress if provided
  useEffect(() => {
    if (manualProgress !== undefined) {
      setProgress(manualProgress);
      if (manualProgress >= 100 && isActive) {
        if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
        completionTimerRef.current = window.setTimeout(() => {
          onComplete();
          completionTimerRef.current = null;
        }, 1500);
      }
    }
  }, [manualProgress, onComplete, isActive]);

  useEffect(() => {
    if (!isActive) {
      setProgress(0);
      setTypedTitle('');
      setTypedSub('');
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
      return;
    }

    // ✅ Typing effect uses FINAL TEXT
    setTypedTitle('');
    setTypedSub('');

    const targetTitle = finalTitle;
    const targetSub = finalSub;

    let titleIdx = 0;
    let subIdx = 0;

    const titleInterval = setInterval(() => {
      setTypedTitle(targetTitle.slice(0, titleIdx + 1));
      titleIdx++;
      if (titleIdx >= targetTitle.length) clearInterval(titleInterval);
    }, 40);

    const subInterval = setInterval(() => {
      setTypedSub(targetSub.slice(0, subIdx + 1));
      subIdx++;
      if (subIdx >= targetSub.length) clearInterval(subInterval);
    }, 30);

    // Dynamic Mock Loop
    if (!intervalRef.current && manualProgress === undefined) {
      const speedPerPage = 2500; 
      const totalTime = pages * speedPerPage;
      const stepTime = totalTime / 100;

      intervalRef.current = window.setInterval(() => {
        setProgress((prev) => {
          const next = prev + 1;
          if (next >= 100) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            completionTimerRef.current = window.setTimeout(() => {
              onComplete();
              completionTimerRef.current = null;
            }, 1500);
            return 100;
          }
          return next;
        });
      }, stepTime);
    }
    
    return () => {
      clearInterval(titleInterval);
      clearInterval(subInterval);
    };
  }, [
    isActive, 
    onComplete, 
    pages, 
    manualProgress, 
    finalTitle,   // ✅ important
    finalSub      // ✅ important
  ]);

  const radius = 140;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div 
        className={`screen printing-wrap ${isActive ? 'visible' : ''}`} 
        style={{ 
            display: isActive ? 'flex' : 'none', 
            flexDirection: 'row', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: '100px', 
            padding: '0 100px',
            position: 'relative',
            overflow: 'hidden'
        }}
    >
        {/* ✅ YOUR UI — NOT CHANGED AT ALL BELOW */}

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '30px', flex: 1, textAlign: 'left', maxWidth: '750px', zIndex: 10 }}>
            <div style={{ minHeight: '180px' }}>
                <h2 style={{ fontSize: '92px', fontWeight: 800, marginBottom: '20px', letterSpacing: '-3px', lineHeight: '1.05', display: 'flex' }}>
                    <span className={isActive ? "data-text-highlight" : ""}>{typedTitle}</span>
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '36px', fontWeight: 500, lineHeight: '1.4', whiteSpace: 'pre-line' }}>
                    {typedSub}
                </p>
            </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
            <div className="circular-progress-container" style={{ position: 'relative', width: '380px', height: '380px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                
                <svg width="380" height="380" style={{ position: 'absolute', zIndex: 2 }}>
                    <g style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}>
                        <circle 
                          cx="190" cy="190" r={radius} 
                          fill="transparent" 
                          stroke="rgba(255,255,255,0.06)" 
                          strokeWidth="24" 
                        />
                        <circle 
                          cx="190" cy="190" r={radius} 
                          fill="transparent" 
                          stroke="url(#progressGradient)" 
                          strokeWidth="24" 
                          strokeDasharray={progress === 100 ? 'none' : circumference} 
                          strokeDashoffset={progress === 100 ? 0 : strokeDashoffset} 
                          strokeLinecap={progress === 100 ? "square" : "round"}
                        />
                    </g>
                </svg>

                <div className="percentage-text">
                    {progress}%
                </div>
            </div>
        </div>
    </div>
  );
};