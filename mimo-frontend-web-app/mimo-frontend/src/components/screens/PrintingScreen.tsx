import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';

const BACKEND_URL = "https://api-upqxuj7evq-uc.a.run.app";

interface PrintingScreenProps {
  isActive: boolean;
  statusTitle?: string;
  statusSub?: string;
  onComplete: () => void;
  onError?: (errorMsg?: string) => void;
  pages?: number;
  copies?: number;
  printCode?: string;       // ← needed to poll real status
  manualProgress?: number;  // ← optional override for testing
  colorMode?: 'color' | 'bw';
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
  colorMode = 'bw',
}) => {
  const [progress, setProgress]         = useState(0);
  const [typedTitle, setTypedTitle]     = useState('');
  const [typedSub, setTypedSub]         = useState('');
  const [printDone, setPrintDone]       = useState(false);   // true once Pi confirms
  const [statusMsg, setStatusMsg]       = useState('Warming up printer…');
  // Color hold: after 100%, inkjet needs extra time to physically eject paper
  const [collectingPages, setCollectingPages] = useState(false);
  const [collectCountdown, setCollectCountdown] = useState(0);
  const collectTimerRef = useRef<number | null>(null);

  const progressRef         = useRef(0);   // mirror of progress for closures
  const tickTimerRef        = useRef<number | null>(null);
  const pollTimerRef        = useRef<number | null>(null);
  const completionTimerRef  = useRef<number | null>(null);
  const isCompletingRef     = useRef(false);
  const stallTimerRef       = useRef<number | null>(null);   // stall detector
  const lastProgressRef     = useRef(0);                    // last recorded progress for stall check
  const lastProgressTimeRef = useRef(Date.now());           // when progress last changed

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
    if (stallTimerRef.current)      clearTimeout(stallTimerRef.current);
    if (collectTimerRef.current)    clearTimeout(collectTimerRef.current);
    tickTimerRef.current       = null;
    pollTimerRef.current       = null;
    completionTimerRef.current = null;
    stallTimerRef.current      = null;
    collectTimerRef.current    = null;
  }, []);

  const animateTo100AndComplete = useCallback((fast = false) => {
    if (isCompletingRef.current) return;
    isCompletingRef.current = true;

    // Clear the slow tick — we'll drive progress ourselves now
    if (tickTimerRef.current) clearTimeout(tickTimerRef.current);
    tickTimerRef.current = null;

    setStatusMsg('Finishing up…');

    const finish = () => {
      const currentProgress = progressRef.current;
      if (currentProgress >= 100) {
        setStatusMsg('Print complete!');

        // Proceed to completion immediately for all print types
        completionTimerRef.current = window.setTimeout(() => {
          onComplete();
        }, fast ? 500 : 1500);
        return;
      }

      const next = currentProgress + 1;
      progressRef.current = next;
      setProgress(next);

      // If fast mode, animate at 10ms per step. Otherwise 400ms.
      const delay = fast ? 10 : 400;
      tickTimerRef.current = window.setTimeout(finish, delay);

      // Update status message as we near the end
      if (next >= 95) setStatusMsg('Almost done…');
    };
    finish();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onComplete, colorMode]);

  // ─── polling ───────────────────────────────────────────────────────────────

  const schedulePoll = useCallback((delayMs = 2000) => {
    if (!printCode || printCode === '0000' || !isActive) return;

    pollTimerRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `${BACKEND_URL}/kiosk/job-status?printCode=${encodeURIComponent(printCode)}`,
          { cache: 'no-store' }
        );
        const data = await res.json();

        // Reset stall timer on every successful poll response — the network is alive
        lastProgressTimeRef.current = Date.now();

        if (data.status === 'completed' || data.isPrinted === true) {
          setPrintDone(true);
          // animateTo100AndComplete will be called via the printDone effect
        } else if (data.status === 'failed') {
          const errMsg = data.printerStatus || data.error || 'Printer reported an error.';
          setStatusMsg(errMsg);
          clearAllTimers();
          if (onError) onError(errMsg);
        } else {
          // Still printing — poll again in 2 s (fast enough to catch physical completion)
          schedulePoll(2000);
        }
      } catch {
        // Network hiccup — retry in 4 s but do NOT reset stall timer
        pollTimerRef.current = window.setTimeout(() => schedulePoll(2000), 4000);
      }
    }, delayMs);
  }, [printCode, isActive, onError, clearAllTimers]);

  // ─── slow progress simulation ──────────────────────────────────────────────

  const startSlowTick = useCallback(() => {
    if (manualProgress !== undefined) return;

    const totalSheets = Math.max(1, pages * copies);

    // ── Target total time for the 0→99% animation ─────────────────────────────
    // Progress is intentionally smooth & reasonably quick so the user sees real
    // activity. When the Pi confirms completion, animateTo100AndComplete(true)
    // snaps the bar to 100% at 10ms/step, giving a satisfying rush at the end.
    // B&W laser:    ~25s total (base 15s + 8s per sheet)
    // Color inkjet: ~50s total (base 15s + 30s per sheet)
    const isColor = colorMode === 'color';
    const baseWarmup  = 15000;
    const speedFactor = isColor ? 30000 : 8000;
    const totalAnimMs = baseWarmup + totalSheets * speedFactor;
    const baseDelay   = Math.max(80, totalAnimMs / 99); // ms per 1% step

    const tick = () => {
      if (isCompletingRef.current) return;

      const currentProgress = progressRef.current;
      const cap = (printCode && printCode !== '0000') ? 99 : 100;

      if (currentProgress >= cap) {
        if (!printCode || printCode === '0000') {
          animateTo100AndComplete();
        } else {
          setStatusMsg('Completing print job…');
        }
        return;
      }

      const next = currentProgress + 1;
      progressRef.current = next;
      setProgress(next);

      // ── Phase-based delay multipliers & status text ────────────────────────
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
        // Printing (35→99%): base pace
        delay = baseDelay;
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

      // Gentle deceleration from 85% onward so the bar waits for the Pi's signal
      // without feeling completely frozen. Exponent kept low so it doesn't stall.
      if (next > 85 && next < 99) {
        const factor = 1 + Math.pow((next - 85) / 7, 1.6);
        delay = delay * factor;
        setStatusMsg(
          totalSheets === 1
            ? `Finishing print…`
            : `Ejecting page ${totalSheets} of ${totalSheets}…`
        );
      }

      // ── Stall detector: reset timestamp whenever progress actually moves ────
      if (next !== lastProgressRef.current) {
        lastProgressRef.current  = next;
        lastProgressTimeRef.current = Date.now();
      }

      const jitter = (Math.random() - 0.5) * delay * 0.08;
      tickTimerRef.current = window.setTimeout(tick, Math.max(100, delay + jitter));
    };

    tickTimerRef.current = window.setTimeout(tick, 600);
  }, [pages, copies, printCode, manualProgress, colorMode, animateTo100AndComplete]);

  // ─── main effect ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isActive) {
      clearAllTimers();
      setProgress(0);
      progressRef.current = 0;
      lastProgressRef.current = 0;
      lastProgressTimeRef.current = Date.now();
      setTypedTitle('');
      setTypedSub('');
      setPrintDone(false);
      setCollectingPages(false);
      setCollectCountdown(0);
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
      if (printCode) schedulePoll(1000); // First check after 1s, then every 2s
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
      animateTo100AndComplete(true); // Pass true to fast-finish the progress bar
    }
  }, [printDone, isActive, animateTo100AndComplete]);

  // ── Stall detector ────────────────────────────────────────────────────────
  // Fires every 5 seconds and checks how long ago the progress bar last moved.
  // If it hasn't moved in 20 seconds and the print isn't completing, we surface
  // an immediate error instead of waiting for the bar to crawl to 99%.
  // This catches the "printer offline" scenario quickly regardless of position.
  useEffect(() => {
    if (!isActive || !printCode || printCode === '0000') return;

    // Reset tracking whenever we mount/activate
    lastProgressRef.current  = progressRef.current;
    lastProgressTimeRef.current = Date.now();

    const STALL_THRESHOLD_MS = 20000; // 20 s with no progress movement = stall

    const checkStall = () => {
      if (isCompletingRef.current) return; // already finishing — no action needed
      const msSinceMove = Date.now() - lastProgressTimeRef.current;
      if (msSinceMove >= STALL_THRESHOLD_MS) {
        console.warn('[PrintingScreen] Stall detected — progress frozen for', msSinceMove, 'ms. Surfacing error.');
        clearAllTimers();
        if (onError) {
          onError('Printer is not responding. If you were charged, your refund will be processed automatically.');
        }
        return; // don't reschedule
      }
      stallTimerRef.current = window.setTimeout(checkStall, 5000);
    };

    // Start the first stall check after the initial warmup period (10 s)
    stallTimerRef.current = window.setTimeout(checkStall, 10000);

    return () => {
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    };
  }, [isActive, printCode, clearAllTimers, onError]);

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
      {/* Botanical background */}
      <div className="kiosk-bg" />
      <div className="ambient-glow glow-1" />
      <div className="ambient-glow glow-2" />
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
        @keyframes petal-float {
          0%   { transform: translate(0, 0)        rotate(0deg)   scale(0.7); opacity: 0; }
          15%  { opacity: 0.85; }
          60%  { transform: translate(50px, -55px) rotate(120deg) scale(1.0); opacity: 0.70; }
          100% { transform: translate(80px, -110px) rotate(220deg) scale(0.5); opacity: 0; }
        }
        @keyframes petal-float-2 {
          0%   { transform: translate(0, 0)         rotate(0deg)   scale(0.6); opacity: 0; }
          15%  { opacity: 0.75; }
          60%  { transform: translate(-40px, -70px) rotate(-140deg) scale(1.0); opacity: 0.60; }
          100% { transform: translate(-65px,-130px) rotate(-260deg) scale(0.4); opacity: 0; }
        }
        @keyframes text-glow-pulse {
          0%,100% { filter: drop-shadow(0 0 15px rgba(200,134,10,0.4)); }
          50%      { filter: drop-shadow(0 0 35px rgba(232,184,109,0.9)); }
        }
        .petal-fly {
          position: absolute;
          font-size: 28px;
          animation: petal-float 3.2s cubic-bezier(0.25,1,0.5,1) infinite;
          pointer-events: none;
          /* Strip colour from emoji — renders as white petals */
          filter: grayscale(1) brightness(8) drop-shadow(0 2px 8px rgba(255,255,255,0.5));
        }
        .petal-fly.p2 { animation: petal-float-2 2.8s cubic-bezier(0.25,1,0.5,1) infinite 1.1s; top: 20px; font-size: 22px; }
        .petal-fly.p3 { animation: petal-float 3.6s cubic-bezier(0.25,1,0.5,1) infinite 2.0s; top: -20px; font-size: 24px; }
        @keyframes collect-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(76,175,80,0.4); }
          50%      { box-shadow: 0 0 0 30px rgba(76,175,80,0); }
        }
        @keyframes collect-fade-in {
          from { opacity: 0; transform: scale(0.94); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes petal-orbit {
          0%   { opacity: 0;   transform: translateY(0px)   scale(0.7) rotate(0deg); }
          15%  { opacity: 0.9; }
          50%  { opacity: 0.6; transform: translateY(-20px) scale(1.1) rotate(180deg); }
          100% { opacity: 0;   transform: translateY(-40px) scale(0.6) rotate(360deg); }
        }
      `}</style>

      {/* ── Color print: "Collecting your pages" overlay ── */}
      {collectingPages && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 200,
          background: 'linear-gradient(135deg, #001a28 0%, #00101c 100%)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '36px',
          animation: 'collect-fade-in 0.5s ease',
        }}>
          {/* Printer icon + pulse ring */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              width: '140px', height: '140px', borderRadius: '50%',
              background: 'rgba(0,242,254,0.08)',
              border: '3px solid rgba(0,242,254,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'collect-pulse 2s ease-in-out infinite',
            }}>
              <span className="material-symbols-outlined" style={{
                fontSize: '72px', color: '#00f2fe',
                filter: 'drop-shadow(0 0 16px rgba(0,242,254,0.7))',
              }}>print</span>
            </div>
          </div>

          {/* Main message */}
          <div style={{ textAlign: 'center', maxWidth: '700px', padding: '0 40px' }}>
            <h2 style={{
              fontSize: '62px', fontWeight: 800, letterSpacing: '-2px',
              lineHeight: 1.1, marginBottom: '20px',
              background: 'linear-gradient(135deg, #00f2fe, #4facfe)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              🖨️ Collecting your pages…
            </h2>
            <p style={{
              fontSize: '28px', fontWeight: 500, color: 'rgba(255,255,255,0.75)',
              lineHeight: 1.5,
            }}>
              Your color print is being ejected.<br />
              <strong style={{ color: '#fff' }}>Please wait at the printer</strong> for your document.
            </p>
          </div>

          {/* Countdown ring */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
          }}>
            <div style={{
              width: '90px', height: '90px', borderRadius: '50%',
              border: '4px solid rgba(0,242,254,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,242,254,0.06)',
              boxShadow: 'inset 0 0 20px rgba(0,242,254,0.1)',
            }}>
              <span style={{
                fontSize: '38px', fontWeight: 800, color: '#00f2fe',
                fontVariantNumeric: 'tabular-nums',
                filter: 'drop-shadow(0 0 8px rgba(0,242,254,0.6))',
              }}>{collectCountdown}</span>
            </div>
            <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.4)', letterSpacing: '1px', textTransform: 'uppercase' }}>
              seconds
            </p>
          </div>
        </div>
      )}

      {/* ── Left text block — glass card for readability on amber bg ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '30px',
        flex: 1, textAlign: 'left', maxWidth: '750px', zIndex: 10,
        background: 'rgba(0,0,0,0.22)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '28px',
        padding: '40px 48px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
      }}>
        <div style={{ minHeight: '180px' }}>
          <h2 style={{ fontSize: '92px', fontWeight: 800, marginBottom: '20px', letterSpacing: '-3px', lineHeight: '1.05', display: 'flex', textShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
            <span className={isActive ? "data-text-highlight" : ""}>{typedTitle}</span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: '36px', fontWeight: 600, lineHeight: '1.4', whiteSpace: 'pre-line', marginBottom: '15px', textShadow: '0 2px 12px rgba(0,0,0,0.3)' }}>
            {typedSub}
          </p>
          {!isCompleted && (
            <p style={{ color: '#FFD97D', fontSize: '24px', fontWeight: 700, opacity: 1, letterSpacing: '0.5px', textShadow: '0 0 16px rgba(200,134,10,0.5)', minHeight: '36px' }}>
              {statusMsg}
            </p>
          )}
        </div>
      </div>

      {/* ── Right circle ── */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>



        <div
          className="circular-progress-container"
          style={{ position: 'relative', width: '380px', height: '380px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {/* Gold glow background — grows with progress */}
          <div style={{
            position: 'absolute',
            width: '300px',
            height: '300px',
            borderRadius: '50%',
            background: '#C8860A',
            filter: 'blur(70px)',
            opacity: 0.10 + (progress / 100) * 0.22,
            transition: 'opacity 0.3s',
            pointerEvents: 'none',
          }} />

          {/* Gold pulse-ring halos */}
          {isActive && progress < 100 && (
            <>
              <div style={{
                position: 'absolute', inset: '45px', borderRadius: '50%',
                border: '2px solid rgba(232,184,109,0.6)',
                animation: 'pulse-ring 3s cubic-bezier(0.2,0.6,0.3,1) infinite',
                pointerEvents: 'none',
              }} />
              <div style={{
                position: 'absolute', inset: '45px', borderRadius: '50%',
                border: '2px solid rgba(200,134,10,0.28)',
                animation: 'pulse-ring 3s cubic-bezier(0.2,0.6,0.3,1) infinite 1.5s',
                pointerEvents: 'none',
              }} />
            </>
          )}
          {/* ── Floating petal orbit particles — white ── */}
          {isActive && noteParticles.map(note => (
            <div
              key={note.id}
              className="music-note-particle"
              style={{
                left: `${note.x}px`,
                top: `${note.y}px`,
                fontSize: `${note.fontSize - 4}px`,
                animationName: 'petal-orbit',
                animationDuration: `${note.duration}ms`,
                animationDelay: `${note.delay}ms`,
                animationTimingFunction: 'ease-in-out',
                animationIterationCount: 'infinite',
                textShadow: 'none',
                /* Strip emoji colour → white petals with dark amber shadow for high visibility */
                filter: 'grayscale(1) brightness(8) drop-shadow(0 4px 12px rgba(120, 60, 0, 0.85)) drop-shadow(0 1px 3px rgba(0,0,0,0.5))',
              }}
            >
              {note.id % 4 === 0 ? '🌸' : note.id % 4 === 1 ? '🌺' : note.id % 4 === 2 ? '🌼' : '🌷'}
            </div>
          ))}

          <svg width="380" height="380" style={{ position: 'absolute', zIndex: 2, overflow: 'visible' }}>
            <defs>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stopColor="#FFD97D" />
                <stop offset="50%"  stopColor="#E8B86D" />
                <stop offset="100%" stopColor="#C8860A" />
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

            {/* Inner dotted ring — slow counter-clockwise spin, gold */}
            <g style={{ transformOrigin: 'center', animation: isActive ? 'spin-slow-reverse 18s linear infinite' : 'none' }}>
              <circle cx="190" cy="190" r="105" fill="transparent" stroke="rgba(232,184,109,0.22)" strokeWidth="5" strokeDasharray="2 14" strokeLinecap="round" />
            </g>

            {/* Glassmorphic warm-dark circle background */}
            <circle cx="190" cy="190" r="130" fill="rgba(30, 18, 0, 0.62)" stroke="rgba(200,134,10,0.20)" strokeWidth="2" />

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
              <tspan fontSize="32px" fontWeight="700" fill="#FFD97D" dx="4">%</tspan>
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
                fill={pt.key === 0 ? '#ffffff' : '#E8B86D'}
                opacity={pt.opacity * (pt.key === 0 ? 1 : 0.65)}
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