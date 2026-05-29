import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';

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

      // If the backend finished incredibly fast (e.g., under 4 seconds) and we're still at 15%,
      // jump ahead to 80% instantly, then rapidly tick up to 100%.
      const next = currentProgress < 80 ? 80 : currentProgress + 1;
      
      progressRef.current = next;
      setProgress(next);
      stepIndex++;

      // Super fast finish (30ms per step) because the Pi already reported success!
      const delay = 30;
      tickTimerRef.current = window.setTimeout(finish, delay);

      // Update status message as we near the end
      if (next >= 95) setStatusMsg('Almost done…');
    };
    finish();
  }, [onComplete]);

  // ─── polling ───────────────────────────────────────────────────────────────

  const schedulePoll = useCallback(() => {
    if (!printCode || printCode === '0000' || !isActive) return;

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
      const cap = (printCode && printCode !== '0000') ? 99 : 100;

      if (currentProgress >= cap) {
        if (!printCode || printCode === '0000') {
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

  // Comet tail: multiple points trailing behind the leading edge
  const cometTailPoints = useMemo(() => {
    if (progress <= 0 || progress >= 100) return [];
    const tailLength = 18; // degrees of arc the tail spans
    const points = [];
    for (let i = 0; i <= 10; i++) {
      const tailAngle = -Math.PI / 2 + ((progress / 100) * 360 - i * (tailLength / 10)) * (Math.PI / 180);
      const x = 190 + radius * Math.cos(tailAngle);
      const y = 190 + radius * Math.sin(tailAngle);
      const opacity = 1 - i / 10;
      const r = 8 - i * 0.6;
      points.push({ x, y, opacity, r, key: i });
    }
    return points;
  }, [progress, radius]);

  // Musical note characters to cycle through
  const noteChars = ['\u2669', '\u266a', '\u266b', '\u266c'];

  // Static list of note particles with pre-computed x/y orbit positions
  const noteParticles = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const angleRad = (i / 12) * 2 * Math.PI;
      // Vary orbit radius slightly per note
      const orbitR = 158 + (i % 3 === 0 ? 18 : i % 3 === 1 ? -18 : 4);
      // Pre-compute position on the orbit circle (centre is 190,190 in SVG space; 190px offset in div)
      const x = 190 + orbitR * Math.cos(angleRad); // px from left=0 of the 380px container
      const y = 190 + orbitR * Math.sin(angleRad);
      return {
        id: i,
        char: noteChars[i % noteChars.length],
        x,
        y,
        duration: 2800 + i * 350,
        delay: -(i * 280), // negative delay = start mid-cycle for staggered look
        fontSize: 16 + (i % 3) * 5,
        opacity: 0.55 + (i % 3) * 0.15,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

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
      <style>{`
        @keyframes spin-slow {
          100% { transform: rotate(360deg); }
        }
        @keyframes spin-slow-reverse {
          100% { transform: rotate(-360deg); }
        }
        @keyframes pulse-ring {
          0%   { transform: scale(0.85); opacity: 0; }
          50%  { opacity: 0.8; }
          100% { transform: scale(1.4);  opacity: 0; }
        }
        @keyframes float-note {
          0%   { transform: translate(0, 0)        scale(0.6) rotate(-10deg); opacity: 0; }
          20%  { transform: translate(40px, -25px) scale(0.8) rotate(5deg);  opacity: 0.9; }
          80%  { transform: translate(120px,-65px) scale(1)   rotate(-5deg); opacity: 0.9; }
          100% { transform: translate(160px,-90px) scale(0.6) rotate(15deg); opacity: 0; }
        }
        @keyframes text-glow-pulse {
          0%,100% { filter: drop-shadow(0 0 15px rgba(0,242,254,0.3)); }
          50%      { filter: drop-shadow(0 0 35px rgba(0,242,254,0.8)); }
        }
        .music-particle-fly {
          position: absolute;
          font-size: 52px;
          color: rgba(0,242,254,0.85);
          filter: drop-shadow(0 4px 12px rgba(0,242,254,0.45));
          animation: float-note 2.8s cubic-bezier(0.25,1,0.5,1) infinite;
        }
        .music-particle-fly.p2 { animation-delay: 0.9s;  top: 15px;  font-size: 38px; color: rgba(79,172,254,0.85); }
        .music-particle-fly.p3 { animation-delay: 1.8s;  top: -15px; font-size: 46px; }
      `}</style>
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

        {/* Flying musical notes from the left */}
        {isActive && progress < 100 && (
          <div style={{ position: 'absolute', left: '-150px', top: '50%', transform: 'translateY(-50%)', zIndex: 1, pointerEvents: 'none' }}>
            <div className="music-particle-fly">♪</div>
            <div className="music-particle-fly p2">♫</div>
            <div className="music-particle-fly p3">♬</div>
          </div>
        )}

        <div
          className="circular-progress-container"
          style={{ position: 'relative', width: '380px', height: '380px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {/* Dynamic glow background — grows with progress */}
          <div style={{
            position: 'absolute',
            width: '300px',
            height: '300px',
            borderRadius: '50%',
            background: '#00f2fe',
            filter: 'blur(70px)',
            opacity: 0.08 + (progress / 100) * 0.22,
            transition: 'opacity 0.3s',
            pointerEvents: 'none',
          }} />

          {/* Pulse-ring halos */}
          {isActive && progress < 100 && (
            <>
              <div style={{
                position: 'absolute', inset: '45px', borderRadius: '50%',
                border: '2px solid rgba(0,242,254,0.5)',
                animation: 'pulse-ring 3s cubic-bezier(0.2,0.6,0.3,1) infinite',
                pointerEvents: 'none',
              }} />
              <div style={{
                position: 'absolute', inset: '45px', borderRadius: '50%',
                border: '2px solid rgba(0,242,254,0.2)',
                animation: 'pulse-ring 3s cubic-bezier(0.2,0.6,0.3,1) infinite 1.5s',
                pointerEvents: 'none',
              }} />
            </>
          )}
          {/* ── Musical note particles ── */}
          {isActive && noteParticles.map(note => (
            <div
              key={note.id}
              className="music-note-particle"
              style={{
                // Position at pre-computed orbit point; subtract half font-size for centering
                left: `${note.x}px`,
                top: `${note.y}px`,
                fontSize: `${note.fontSize}px`,
                color: note.id % 3 === 0 ? '#00f2fe' : note.id % 3 === 1 ? '#4facfe' : '#a78bfa',
                animationName: 'noteFloat',
                animationDuration: `${note.duration}ms`,
                animationDelay: `${note.delay}ms`,
                animationTimingFunction: 'ease-in-out',
                animationIterationCount: 'infinite',
              }}
            >
              {note.char}
            </div>
          ))}

          <svg width="380" height="380" style={{ position: 'absolute', zIndex: 2, overflow: 'visible' }}>
            <defs>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stopColor="#00f2fe" />
                <stop offset="60%"  stopColor="#4facfe" />
                <stop offset="100%" stopColor="#0052d4" />
              </linearGradient>
              <filter id="neonGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="cometGlow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Outer dashed ring — slow clockwise spin */}
            <g style={{ transformOrigin: 'center', animation: isActive ? 'spin-slow 24s linear infinite' : 'none' }}>
              <circle cx="190" cy="190" r="176" fill="transparent" stroke="rgba(255,255,255,0.08)" strokeWidth="3" strokeDasharray="12 18" />
            </g>

            {/* Inner dotted ring — slow counter-clockwise spin */}
            <g style={{ transformOrigin: 'center', animation: isActive ? 'spin-slow-reverse 18s linear infinite' : 'none' }}>
              <circle cx="190" cy="190" r="105" fill="transparent" stroke="rgba(0,242,254,0.15)" strokeWidth="5" strokeDasharray="2 14" strokeLinecap="round" />
            </g>

            {/* Glassmorphic deep-teal circle background */}
            <circle cx="190" cy="190" r="130" fill="rgba(0, 35, 55, 0.6)" stroke="rgba(0,242,254,0.12)" strokeWidth="2" />

            {/* Static background track */}
            <circle cx="190" cy="190" r={radius} fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />

            {/* Center Percentage Display */}
            <text
              x="190" y="196"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                animation: isActive && progress < 100 ? 'text-glow-pulse 2s infinite alternate' : 'none',
              }}
            >
              <tspan fontSize="92px" fontWeight="800" fill="#ffffff" letterSpacing="-2px" style={{ fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>{progress}</tspan>
              <tspan fontSize="32px" fontWeight="700" fill="#00f2fe" dx="4">%</tspan>
            </text>

            {/* Rotated group for progress arc and comet tail */}
            <g style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}>
              {/* Progress arc — neon glow layer */}
              <circle
                cx="190" cy="190" r={radius}
                fill="transparent"
                stroke="url(#progressGradient)"
                strokeWidth="10"
                strokeDasharray={progress === 100 ? 'none' : circumference}
                strokeDashoffset={progress === 100 ? 0 : strokeDashoffset}
                strokeLinecap="round"
                filter="url(#neonGlow)"
                style={{ transition: 'stroke-dashoffset 0.18s linear' }}
              />

              {/* Progress arc — bright white core */}
              <circle
                cx="190" cy="190" r={radius}
                fill="transparent"
                stroke="#ffffff"
                strokeWidth="3"
                strokeDasharray={progress === 100 ? 'none' : circumference}
                strokeDashoffset={progress === 100 ? 0 : strokeDashoffset}
                strokeLinecap="round"
                opacity="0.8"
                style={{ transition: 'stroke-dashoffset 0.18s linear' }}
              />

              {/* Comet tail is rendered OUTSIDE this group — see below */}
            </g>

            {/* Comet tail — rendered in root SVG space (coordinates already account for -90° start).
                Must be outside the rotate(-90deg) group to avoid double-rotation, and placed last
                so it paints on top of the arc line. */}
            {cometTailPoints.map(pt => (
              <circle
                key={pt.key}
                cx={pt.x}
                cy={pt.y}
                r={Math.max(0.5, pt.r)}
                fill={pt.key === 0 ? '#ffffff' : '#00f2fe'}
                opacity={pt.opacity * (pt.key === 0 ? 1 : 0.55)}
                filter={pt.key <= 2 ? 'url(#cometGlow)' : undefined}
                style={{ transition: 'cx 0.18s linear, cy 0.18s linear' }}
              />
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
};