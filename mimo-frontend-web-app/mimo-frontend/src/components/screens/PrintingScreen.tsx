import React, { useEffect, useState, useRef, useCallback } from 'react';

const BACKEND_URL = "https://api-upqxuj7evq-uc.a.run.app";

interface PrintingScreenProps {
  isActive: boolean;
  statusTitle?: string;
  statusSub?: string;
  onComplete: () => void;
  onError?: () => void;
  pages?: number;
  copies?: number;
  printCode?: string;       // ← needed to poll real status
  manualProgress?: number;  // ← optional override for testing
}

/**
 * ARCHITECTURE:
 * 1. The progress bar animates slowly from 0 → ~85% (warm-up + simulated print pace)
 *    so the user sees real activity and the digits tick up clearly.
 * 2. Every 4 seconds we poll /kiosk/job-status?printCode=XXXX
 * 3. When the Pi finishes and the backend sets isPrinted=true, we animate
 *    the bar to 100% and call onComplete() after a 1.5s celebration hold.
 * 4. If the Pi reports a failure we surface onError().
 * 5. If printCode is not provided (demo/test mode) we just use the timed sim
 *    and complete at 100%.
 */
export const PrintingScreen: React.FC<PrintingScreenProps> = ({
  isActive,
  statusTitle,
  statusSub,
  onComplete,
  onError,
  pages = 1,
  copies = 1,
  printCode,
  manualProgress,
}) => {
  const [progress, setProgress]         = useState(0);
  const [typedTitle, setTypedTitle]     = useState('');
  const [typedSub, setTypedSub]         = useState('');
  const [printDone, setPrintDone]       = useState(false);   // true once Pi confirms
  const setStatusMsg = (_msg: string) => {};

  const progressRef         = useRef(0);   // mirror of progress for closures
  const tickTimerRef        = useRef<number | null>(null);
  const pollTimerRef        = useRef<number | null>(null);
  const completionTimerRef  = useRef<number | null>(null);
  const isCompletingRef     = useRef(false);

  const isCompleted = progress >= 100;

  // Generate stable musical note particles flowing from left text block to the circle
  const noteParticles = React.useMemo(() => {
    const chars = ['♪', '♫', '♩', '♬', '🎶', '🎵'];
    const colors = ['#00f2fe', '#4facfe', '#ffffff', '#a855f7'];
    const particles = [];
    const count = 35; // 35 flowing notes for rich visual density
    const center = 190;
    
    for (let i = 0; i < count; i++) {
      // Start positions: far left (text area) with vertical spread
      // SVG width is 380, center is 190. Left column is outside, so startX is negative.
      const startX = -500 - Math.random() * 300; // -800px to -500px (starting from the left text block area)
      const startY = 190 + (Math.random() - 0.5) * 400; // vertical spread spanning the left column height
      
      // End positions: target the left half of the circular progress track (facing the flow)
      // Angle in radians between 120 and 240 degrees (2.1 to 4.2 radians)
      const endAngle = 2.1 + Math.random() * 2.1;
      const rEnd = 138 + (Math.random() - 0.5) * 12;
      const endX = center + rEnd * Math.cos(endAngle);
      const endY = center + rEnd * Math.sin(endAngle);
      
      // Mid-point for a wavy bezier-like sine wave path
      const midX = startX + (endX - startX) * 0.5;
      const midY = (startY + endY) * 0.5 + (Math.random() - 0.5) * 200; // wavy offset up to 100px up/down
      
      const char = chars[Math.floor(Math.random() * chars.length)];
      const color = colors[Math.floor(Math.random() * colors.length)];
      const fontSize = 16 + Math.floor(Math.random() * 18); // 16px to 34px
      const duration = 3.0 + Math.random() * 2.5; // 3s to 5.5s (slower flow speed makes it look more majestic and synchronized)
      const delay = -Math.random() * duration; // Negative delay to start immediately at different phases
      const rotate = Math.floor(Math.random() * 360);
      
      particles.push({
        id: i,
        char,
        startX,
        startY,
        midX,
        midY,
        endX,
        endY,
        color,
        fontSize,
        duration,
        delay,
        rotate,
      });
    }
    return particles;
  }, []);

  const finalTitle = isCompleted
    ? "Print Completed ✅"
    : (statusTitle || "Printing in Progress");

  const finalSub = isCompleted
    ? "Your document has been printed successfully."
    : (statusSub || "Printing in progress…\nPlease wait.");

  // ─── helpers ───────────────────────────────────────────────────────────────

  const clearAllTimers = useCallback(() => {
    if (tickTimerRef.current)       clearTimeout(tickTimerRef.current);
    if (pollTimerRef.current)       clearTimeout(pollTimerRef.current);
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
    tickTimerRef.current       = null;
    pollTimerRef.current       = null;
    completionTimerRef.current = null;
  }, []);

  const animateTo100AndComplete = useCallback(() => {
    if (isCompletingRef.current) return;
    isCompletingRef.current = true;

    // Clear the slow tick — we'll drive progress ourselves now
    if (tickTimerRef.current) clearTimeout(tickTimerRef.current);
    tickTimerRef.current = null;

    setStatusMsg('Finishing up…');

    // Smooth finish: every digit from current% → 100 is shown clearly.
    // 500ms per step → 15 digits (85→100) take ~7.5 s — readable on kiosk.
    // We add a slight ease-in so early digits are a touch slower, speeding
    // gently toward 100 for a satisfying "locking in" feel.
    let stepIndex = 0;
    const finish = () => {
      const currentProgress = progressRef.current;
      if (currentProgress >= 100) {
        setStatusMsg('Print complete!');
        // Hold at 100% for 1.5 s then transition
        completionTimerRef.current = window.setTimeout(() => {
          onComplete();
        }, 1500);
        return;
      }

      const next = currentProgress + 1;
      progressRef.current = next;
      setProgress(next);
      stepIndex++;

      // Ease-in: first few steps ~600ms, tapering to ~350ms near 100
      const delay = Math.max(350, 600 - stepIndex * 18);
      tickTimerRef.current = window.setTimeout(finish, delay);

      // Update status message as we near the end
      if (next >= 95) setStatusMsg('Almost done…');
    };
    finish();
  }, [onComplete]);

  // ─── polling ───────────────────────────────────────────────────────────────

  const schedulePoll = useCallback(() => {
    if (!printCode || !isActive) return;

    pollTimerRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `${BACKEND_URL}/kiosk/job-status?printCode=${encodeURIComponent(printCode)}`,
          { cache: 'no-store' }
        );
        const data = await res.json();

        if (data.status === 'completed' || data.isPrinted === true) {
          setPrintDone(true);
          // animateTo100AndComplete will be called via the printDone effect
        } else if (data.status === 'failed') {
          setStatusMsg('Printer reported an error.');
          if (onError) onError();
        } else {
          // Still printing — poll again in 4 s
          schedulePoll();
        }
      } catch {
        // Network hiccup — retry in 5 s
        pollTimerRef.current = window.setTimeout(schedulePoll, 5000);
      }
    }, 4000); // poll every 4 seconds
  }, [printCode, isActive, onError]);

  // ─── slow progress simulation ──────────────────────────────────────────────

  const startSlowTick = useCallback(() => {
    if (manualProgress !== undefined) return;

    const totalSheets = Math.max(1, pages * copies);

    // ── Target total time for the 0→99% animation ─────────────────────────────
    // Based on a real laser printer: ~10s warmup + ~3s per page (≈20 ppm B&W)
    // This keeps 1-sheet jobs snappy (~18s) and multi-sheet jobs proportional.
    //   1 sheet  → 13 000 ms → ~131 ms/step → clamped to 200 ms → ~20 s
    //   3 sheets → 19 000 ms → ~192 ms/step →               200 ms → ~20 s
    //   5 sheets → 25 000 ms → ~252 ms/step →               252 ms → ~25 s
    //   10 sheets→ 40 000 ms → ~404 ms/step →               404 ms → ~40 s
    //   20 sheets→ 70 000 ms → ~707 ms/step →               707 ms → ~70 s
    const totalAnimMs  = 10000 + totalSheets * 3000;  // total 0→99 window (ms)
    const baseDelay    = Math.max(200, totalAnimMs / 99); // ms per 1% step

    const tick = () => {
      if (isCompletingRef.current) return;

      const currentProgress = progressRef.current;
      const cap = printCode ? 99 : 100;

      if (currentProgress >= cap) {
        if (!printCode) {
          animateTo100AndComplete();
        } else {
          setStatusMsg(
            totalSheets === 1
              ? 'Printing…'
              : `Printing page ${totalSheets} of ${totalSheets}…`
          );
        }
        return;
      }

      const next = currentProgress + 1;
      progressRef.current = next;
      setProgress(next);

      // ── Phase-based delay multipliers & status text ────────────────────────
      // All phases share baseDelay so total duration always matches the job size.
      // Multipliers only shift emphasis: warmup feels slower, spooling faster.
      let delay: number;
      if (next <= 20) {
        // Warm-up (0→20%): 1.4× — visible hesitation while drum heats up
        delay = baseDelay * 1.4;
        setStatusMsg('Warming up printer…');
      } else if (next <= 35) {
        // Spooling / RIP (20→35%): 0.75× — data transfers fast
        delay = baseDelay * 0.75;
        setStatusMsg('Spooling document…');
      } else {
        // Printing (35→99%): base pace — 1 tick per sheet-proportional interval
        delay = baseDelay;
        // Show page progress: which "page" are we on out of totalSheets
        const printingPct  = next - 35;           // 0…64
        const currentPage  = Math.min(
          totalSheets,
          Math.ceil((printingPct / 64) * totalSheets)
        );
        setStatusMsg(
          totalSheets === 1
            ? `Printing…`
            : `Printing page ${currentPage} of ${totalSheets}…`
        );
      }

      const jitter = (Math.random() - 0.5) * delay * 0.10;
      tickTimerRef.current = window.setTimeout(tick, Math.max(150, delay + jitter));
    };

    tickTimerRef.current = window.setTimeout(tick, 600);
  }, [pages, copies, printCode, manualProgress, animateTo100AndComplete]);

  // ─── main effect ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isActive) {
      clearAllTimers();
      setProgress(0);
      progressRef.current = 0;
      setTypedTitle('');
      setTypedSub('');
      setPrintDone(false);
      isCompletingRef.current = false;
      setStatusMsg('Warming up printer…');
      return;
    }

    setTypedTitle('');
    setTypedSub('');

    let titleIdx = 0;
    let subIdx   = 0;

    const titleInterval = setInterval(() => {
      setTypedTitle(finalTitle.slice(0, titleIdx + 1));
      titleIdx++;
      if (titleIdx >= finalTitle.length) clearInterval(titleInterval);
    }, 40);

    const subInterval = setInterval(() => {
      setTypedSub(finalSub.slice(0, subIdx + 1));
      subIdx++;
      if (subIdx >= finalSub.length) clearInterval(subInterval);
    }, 30);

    // Handle manualProgress mode
    if (manualProgress !== undefined) {
      setProgress(manualProgress);
      progressRef.current = manualProgress;
      if (manualProgress >= 100) {
        animateTo100AndComplete();
      }
    } else {
      startSlowTick();
      if (printCode) schedulePoll();
    }

    return () => {
      clearInterval(titleInterval);
      clearInterval(subInterval);
      clearAllTimers();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // When Pi confirms done, fast-finish the bar
  useEffect(() => {
    if (printDone && isActive && !isCompletingRef.current) {
      animateTo100AndComplete();
    }
  }, [printDone, isActive, animateTo100AndComplete]);

  // ─── SVG geometry ─────────────────────────────────────────────────────────

  const radius         = 140;
  const circumference  = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  const angle = -Math.PI / 2 + (progress / 100) * 2 * Math.PI;
  const dotX  = 190 + radius * Math.cos(angle);
  const dotY  = 190 + radius * Math.sin(angle);

  // ─── render ───────────────────────────────────────────────────────────────

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
        overflow: 'hidden',
      }}
    >
      {/* ── Left text block ── */}
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

      {/* ── Right circle ── */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
        <div
          className="circular-progress-container"
          style={{ position: 'relative', width: '380px', height: '380px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <style>{`
            @keyframes mimo-spin         { to { transform: rotate(360deg);  } }
            @keyframes mimo-spin-reverse { to { transform: rotate(-360deg); } }
            @keyframes mimo-pulse {
              0%   { transform: scale(1);    opacity: 0.95; }
              100% { transform: scale(1.03); opacity: 1;    }
            }
            @keyframes mimo-blink {
              0%, 100% { opacity: 1;   }
              50%       { opacity: 0.3; }
            }
            @keyframes note-fly-in {
              0% {
                transform: translate(var(--start-x), var(--start-y)) rotate(0deg) scale(0.4);
                opacity: 0;
              }
              15% {
                opacity: 0.85;
              }
              50% {
                transform: translate(var(--mid-x), var(--mid-y)) scale(0.9);
                opacity: 0.85;
              }
              90% {
                opacity: 0.85;
              }
              100% {
                transform: translate(var(--end-x), var(--end-y)) rotate(var(--rotate-deg)) scale(0.35);
                opacity: 0;
              }
            }
            .mimo-orb-pulse { transform-origin: center; animation: mimo-pulse 2.5s ease-in-out infinite alternate; }
          `}</style>

          <svg width="380" height="380" style={{ position: 'absolute', zIndex: 2, overflow: 'visible' }}>
            <defs>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stopColor="#00f2fe" />
                <stop offset="60%"  stopColor="#4facfe" />
                <stop offset="100%" stopColor="#0052d4" />
              </linearGradient>
              <radialGradient id="orbGradient" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="rgba(0,242,254,0.22)" />
                <stop offset="70%"  stopColor="rgba(9,55,101,0.45)"  />
                <stop offset="100%" stopColor="rgba(2,6,23,0.75)"    />
              </radialGradient>
              <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feComponentTransfer in="blur" result="glow">
                  <feFuncA type="linear" slope="0.95" />
                </feComponentTransfer>
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Non-rotated group for upright musical notes flying towards the circle */}
            {progress < 100 && (
              <g>
                {noteParticles.map((note) => (
                  <text
                    key={note.id}
                    x="0"
                    y="0"
                    fill={note.color}
                    style={{
                      fontSize: `${note.fontSize}px`,
                      fontWeight: 'bold',
                      opacity: 0,
                      animation: `note-fly-in ${note.duration}s linear infinite`,
                      animationDelay: `${note.delay}s`,
                      textShadow: `0 0 10px ${note.color}`,
                      fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
                      '--start-x': `${note.startX}px`,
                      '--start-y': `${note.startY}px`,
                      '--mid-x': `${note.midX}px`,
                      '--mid-y': `${note.midY}px`,
                      '--end-x': `${note.endX}px`,
                      '--end-y': `${note.endY}px`,
                      '--rotate-deg': `${note.rotate}deg`,
                    } as any}
                  >
                    {note.char}
                  </text>
                ))}
              </g>
            )}

            <g style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}>
              {/* Orb background */}
              <circle cx="190" cy="190" r={radius - 12} fill="url(#orbGradient)" stroke="rgba(255,255,255,0.08)" strokeWidth="2" className="mimo-orb-pulse" />

              {/* Background track */}
              <circle cx="190" cy="190" r={radius} fill="transparent" stroke="rgba(255,255,255,0.04)" strokeWidth="14" />

              {/* Outer dashed ring CW */}
              <circle cx="190" cy="190" r={radius + 18} fill="transparent" stroke="rgba(0,242,254,0.08)" strokeWidth="1.5" strokeDasharray="4 20"
                style={{ transformOrigin: 'center', animation: 'mimo-spin 30s linear infinite' }} />

              {/* Inner dashed ring CCW */}
              <circle cx="190" cy="190" r={radius - 22} fill="transparent" stroke="rgba(79,195,247,0.09)" strokeWidth="1.5" strokeDasharray="14 14"
                style={{ transformOrigin: 'center', animation: 'mimo-spin-reverse 18s linear infinite' }} />

              {/* Progress arc — wide neon glow layer */}
              <circle
                cx="190" cy="190" r={radius}
                fill="transparent"
                stroke="url(#progressGradient)"
                strokeWidth="14"
                strokeDasharray={progress === 100 ? 'none' : circumference}
                strokeDashoffset={progress === 100 ? 0 : strokeDashoffset}
                strokeLinecap="round"
                filter="url(#neonGlow)"
                style={{ transition: 'stroke-dashoffset 0.18s linear' }}
              />

              {/* Progress arc — bright white core highlight */}
              <circle
                cx="190" cy="190" r={radius}
                fill="transparent"
                stroke="#ffffff"
                strokeWidth="3.5"
                strokeDasharray={progress === 100 ? 'none' : circumference}
                strokeDashoffset={progress === 100 ? 0 : strokeDashoffset}
                strokeLinecap="round"
                opacity="0.75"
                style={{ transition: 'stroke-dashoffset 0.18s linear' }}
              />

              {/* Leading-edge spark comet */}
              {progress > 0 && progress < 100 && (
                <>
                  <circle cx={dotX} cy={dotY} r="16" fill="#00f2fe" opacity="0.35" filter="url(#neonGlow)"
                    style={{ transition: 'cx 0.18s linear, cy 0.18s linear' }} />
                  <circle cx={dotX} cy={dotY} r="8"  fill="#4facfe"
                    style={{ transition: 'cx 0.18s linear, cy 0.18s linear' }} />
                  <circle cx={dotX} cy={dotY} r="4"  fill="#ffffff"
                    style={{ transition: 'cx 0.18s linear, cy 0.18s linear' }} />
                </>
              )}
            </g>
          </svg>

          {/* Pixel-perfect centered % counter */}
          <div
            className="percentage-text"
            style={{
              position: 'absolute',
              zIndex: 10,
              top: 0,
              left: 0,
              width: '380px',
              height: '380px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'center',
            }}>
              <span style={{
                fontSize: '84px',
                fontWeight: 800,
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontFeatureSettings: '"tnum"',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-2px',
                color: '#fff',
                textShadow: '0 0 30px rgba(0,242,254,0.5)',
                lineHeight: '1',
              }}>
                {progress}
              </span>
              <span style={{
                fontSize: '32px',
                fontWeight: 700,
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                color: '#00f2fe',
                marginLeft: '4px',
                textShadow: '0 0 20px rgba(0,242,254,0.4)',
                lineHeight: '1',
              }}>
                %
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};