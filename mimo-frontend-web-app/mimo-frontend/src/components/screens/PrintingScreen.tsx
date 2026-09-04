import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';

const BACKEND_URL = "https://api-upqxuj7evq-uc.a.run.app";

const FlowerIcon1: React.FC = () => (
  <svg 
    viewBox="0 0 24 24" 
    style={{ color: '#fff', width: '1em', height: '1em', display: 'block' }} 
    fill="currentColor"
  >
    <circle cx="12" cy="12" r="3" />
    <circle cx="12" cy="7" r="4" />
    <circle cx="7.25" cy="10.45" r="4" />
    <circle cx="9.06" cy="16.05" r="4" />
    <circle cx="14.94" cy="16.05" r="4" />
    <circle cx="16.75" cy="10.45" r="4" />
  </svg>
);

const FlowerIcon2: React.FC = () => (
  <svg 
    viewBox="0 0 24 24" 
    style={{ color: '#fff', width: '1em', height: '1em', display: 'block' }} 
    fill="currentColor"
  >
    <circle cx="12" cy="12" r="3.5" />
    <circle cx="12" cy="6.5" r="2.5" />
    <circle cx="12" cy="17.5" r="2.5" />
    <circle cx="6.5" cy="12" r="2.5" />
    <circle cx="17.5" cy="12" r="2.5" />
    <circle cx="15.89" cy="8.11" r="2.5" />
    <circle cx="8.11" cy="8.11" r="2.5" />
    <circle cx="15.89" cy="15.89" r="2.5" />
    <circle cx="8.11" cy="15.89" r="2.5" />
  </svg>
);

const MusicNoteIcon1: React.FC = () => (
  <svg viewBox="0 0 24 24" style={{ width: '1em', height: '1em', display: 'block' }} fill="currentColor">
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
  </svg>
);

const MusicNoteIcon2: React.FC = () => (
  <svg viewBox="0 0 24 24" style={{ width: '1em', height: '1em', display: 'block' }} fill="currentColor">
    <path d="M21 3H10v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h9V10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V3z"/>
  </svg>
);

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
  kioskId?: string | null;
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
  kioskId,
}) => {
  const isCV001 = kioskId === 'CV-001';
  const isSV002 = kioskId === 'SV-002';
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
  const startTimeRef        = useRef(Date.now());           // when the print screen was activated
  const lastSuccessfulPollTimeRef = useRef(Date.now());     // when we last successfully polled the backend

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

  const animateTo100AndComplete = useCallback((_fast = false) => {
    if (isCompletingRef.current) return;
    isCompletingRef.current = true;

    // Clear timers
    if (tickTimerRef.current) clearTimeout(tickTimerRef.current);
    if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    tickTimerRef.current = null;
    stallTimerRef.current = null;

    // Snap progress directly to 100% and display clear confirmation
    progressRef.current = 100;
    setProgress(100);
    setStatusMsg('Print Completed ✅');

    // Hold for 1.0 second before transitioning to summary screen
    completionTimerRef.current = window.setTimeout(() => {
      onComplete();
    }, 1000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onComplete, colorMode]);

  // ─── polling ───────────────────────────────────────────────────────────────

  const schedulePoll = useCallback((delayMs = 1000) => {
    if (!printCode || printCode === '0000' || !isActive) return;

    pollTimerRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `${BACKEND_URL}/kiosk/job-status?printCode=${encodeURIComponent(printCode)}`,
          { cache: 'no-store' }
        );
        const data = await res.json();

        // Reset last successful poll timestamp — the network is alive
        lastSuccessfulPollTimeRef.current = Date.now();

        if (data.status === 'completed' || data.isPrinted === true) {
          setPrintDone(true);
          // animateTo100AndComplete will be called via the printDone effect
        } else if (data.status === 'failed') {
          const errMsg = data.printerStatus || data.error || 'Printer reported an error.';
          setStatusMsg(errMsg);
          clearAllTimers();
          if (onError) onError(errMsg);
        } else {
          // Still printing — poll again in 1 s for immediate completion sync
          schedulePoll(1000);
        }
      } catch {
        // Network hiccup — retry in 2 s
        pollTimerRef.current = window.setTimeout(() => schedulePoll(1000), 2000);
      }
    }, delayMs);
  }, [printCode, isActive, onError, clearAllTimers]);

  // ─── slow progress simulation ──────────────────────────────────────────────

  const startSlowTick = useCallback(() => {
    if (manualProgress !== undefined) return;

    const totalSheets = Math.max(1, pages * copies);

    // ── Target total time for the 0→99% animation ─────────────────────────────
    // Calibrated to match actual physical printer speeds so progress reaches
    // ~95% exactly as the physical paper emerges from the machine.
    // B&W laser:    ~1.5s per sheet (Brother HL-L2440DW prints at 32 ppm)
    // Color inkjet: ~60s per sheet (Epson L3250 EcoTank 150 DPI fast color print speed)
    const isColor = colorMode === 'color';
    const baseWarmup  = isColor ? 3000 : 2000;
    const speedFactor = isColor ? 60000 : 1500;
    const totalAnimMs = baseWarmup + totalSheets * speedFactor;
    const baseDelay   = Math.max(40, totalAnimMs / 99); // ms per 1% step

    const tick = () => {
      if (isCompletingRef.current) return;

      const currentProgress = progressRef.current;
      const cap = (printCode && printCode !== '0000') ? 85 : 100;

      if (currentProgress >= cap) {
        if (!printCode || printCode === '0000') {
          animateTo100AndComplete();
        } else {
          // Creep very slowly above 85% so it never looks frozen
          const nextCreep = Math.min(94, currentProgress + 1);
          progressRef.current = nextCreep;
          setProgress(nextCreep);
          setStatusMsg(
            totalSheets > 1
              ? `Ejecting paper (${totalSheets} of ${totalSheets})…`
              : `Ejecting paper into tray…`
          );
          tickTimerRef.current = window.setTimeout(tick, 8000); // 8 seconds per 1% creep
        }
        return;
      }

      const next = Math.min(cap, currentProgress + 1);
      progressRef.current = next;
      setProgress(next);

      // ── Phase-based delay multipliers & status text ────────────────────────
      let delay: number;
      if (next <= 20) {
        // Warm-up (0→20%): 1.1× — warm-up & feed
        delay = baseDelay * 1.1;
        setStatusMsg('Warming up printer…');
      } else if (next <= 50) {
        // Normal pace (20→50%): 0.85× — active spooling and print start
        delay = baseDelay * 0.85;
        const printingPct = next - 20; // 0…30
        const currentPage = Math.min(
          totalSheets,
          Math.ceil((printingPct / 30) * Math.ceil(totalSheets / 2))
        );
        setStatusMsg(
          totalSheets === 1
            ? `Printing document…`
            : `Printing page ${currentPage} of ${totalSheets}…`
        );
      } else {
        // Slowing pace (50→85%): 1.6× to 2.8× — physical paper passage
        const slowFactor = 1.6 + ((next - 50) / 35) * 1.2;
        delay = baseDelay * slowFactor;
        const currentPage = Math.min(
          totalSheets,
          Math.ceil(((next - 20) / 65) * totalSheets)
        );
        setStatusMsg(
          totalSheets === 1
            ? `Printing document…`
            : `Printing page ${currentPage} of ${totalSheets}…`
        );
      }

      if (next !== lastProgressRef.current) {
        lastProgressRef.current = progressRef.current;
      }

      const jitter = (Math.random() - 0.5) * delay * 0.05;
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
      startTimeRef.current = Date.now();
      lastSuccessfulPollTimeRef.current = Date.now();
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
    startTimeRef.current = Date.now();
    lastSuccessfulPollTimeRef.current = Date.now();

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

  // ── Stall & Timeout detector ──────────────────────────────────────────────
  // Fires every 5 seconds.
  // 1. Connection Stall Check: If we haven't received a successful poll response
  //    for > 45 seconds, we assume network connectivity is lost.
  // 2. Physical Printing Timeout Check: Based on page count and color mode,
  //    we calculate a generous print time limit (matching the backend). If the
  //    total elapsed time exceeds this limit, we time out.
  useEffect(() => {
    if (!isActive || !printCode || printCode === '0000') return;

    const totalSheets = Math.max(1, pages * copies);
    const isColor = colorMode === 'color';
    const baseWarmupSec = 600; // 600 seconds (10 min) base warmup/spooling/rendering time
    const secPerPage = isColor ? 360 : 20; // 360s (6 min) per color page for EcoTank inkjet; 20s/page for B&W laser
    // Timeout matching backend plus a 30 seconds buffer to prioritize backend failure message/refund trigger
    const printTimeoutMs = (baseWarmupSec + totalSheets * secPerPage + 30) * 1000;
    const networkStallThresholdMs = 90000; // 90 seconds with no network response (for large rendering operations)

    const checkTimeout = () => {
      if (isCompletingRef.current) return; // already finishing — no action needed

      const elapsedMs = Date.now() - startTimeRef.current;
      const msSinceLastPoll = Date.now() - lastSuccessfulPollTimeRef.current;

      // Check for total print timeout
      if (elapsedMs > printTimeoutMs) {
        console.warn(`[PrintingScreen] Print timeout exceeded: ${elapsedMs}ms > ${printTimeoutMs}ms. Surfacing error.`);
        clearAllTimers();
        if (onError) {
          onError('Print timed out. If you were charged, your refund will be processed automatically.');
        }
        return;
      }

      // Check for network connectivity stall
      if (msSinceLastPoll > networkStallThresholdMs) {
        console.warn(`[PrintingScreen] Network connection lost: no successful poll for ${msSinceLastPoll}ms. Surfacing error.`);
        clearAllTimers();
        if (onError) {
          onError('Connection to printer server was lost. Please check your network and try again.');
        }
        return;
      }

      stallTimerRef.current = window.setTimeout(checkTimeout, 5000);
    };

    // Start checking after 10s
    stallTimerRef.current = window.setTimeout(checkTimeout, 10000);

    return () => {
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    };
  }, [isActive, printCode, pages, copies, colorMode, clearAllTimers, onError]);

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
        @keyframes text-glow-pulse-cyan {
          0%,100% { filter: drop-shadow(0 0 15px rgba(0,229,255,0.4)); }
          50%      { filter: drop-shadow(0 0 35px rgba(0,229,255,0.9)); }
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
          background: isCV001 ? 'linear-gradient(135deg, #f5ecdc 0%, #e6cfad 100%)' : 'linear-gradient(135deg, #001a28 0%, #00101c 100%)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '36px',
          animation: 'collect-fade-in 0.5s ease',
        }}>
          {/* Printer icon + pulse ring */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              width: '140px', height: '140px', borderRadius: '50%',
              background: isCV001 ? 'rgba(180,123,55,0.10)' : 'rgba(0,242,254,0.08)',
              border: isCV001 ? '3px solid rgba(180,123,55,0.5)' : '3px solid rgba(0,242,254,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'collect-pulse 2s ease-in-out infinite',
            }}>
              <span className="material-symbols-outlined" style={{
                fontSize: '72px', color: isCV001 ? '#a66d2b' : '#00f2fe',
                filter: isCV001 ? 'drop-shadow(0 0 16px rgba(180,123,55,0.45))' : 'drop-shadow(0 0 16px rgba(0,242,254,0.7))',
              }}>print</span>
            </div>
          </div>

          {/* Main message */}
          <div style={{ textAlign: 'center', maxWidth: '700px', padding: '0 40px' }}>
            <h2 style={{
              fontSize: '62px', fontWeight: 800, letterSpacing: '-2px',
              lineHeight: 1.1, marginBottom: '20px',
              background: isCV001 ? 'linear-gradient(135deg, #4b2d1d, #d5a45a)' : 'linear-gradient(135deg, #00f2fe, #4facfe)',
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
              border: isCV001 ? '4px solid rgba(180,123,55,0.3)' : '4px solid rgba(0,242,254,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isCV001 ? 'rgba(180,123,55,0.08)' : 'rgba(0,242,254,0.06)',
              boxShadow: isCV001 ? 'inset 0 0 20px rgba(180,123,55,0.12)' : 'inset 0 0 20px rgba(0,242,254,0.1)',
            }}>
              <span style={{
                fontSize: '38px', fontWeight: 800, color: isCV001 ? '#8b5928' : '#00f2fe',
                fontVariantNumeric: 'tabular-nums',
                filter: isCV001 ? 'drop-shadow(0 0 8px rgba(180,123,55,0.45))' : 'drop-shadow(0 0 8px rgba(0,242,254,0.6))',
              }}>{collectCountdown}</span>
            </div>
            <p style={{ fontSize: '16px', color: isCV001 ? 'rgba(75,45,29,0.6)' : 'rgba(255,255,255,0.4)', letterSpacing: '1px', textTransform: 'uppercase' }}>
              seconds
            </p>
          </div>
        </div>
      )}

      {/* ── Left text block — glass card for readability on amber bg ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '30px',
        flex: 1, textAlign: 'left', maxWidth: '750px', zIndex: 10,
          background: isSV002 ? 'rgba(255, 255, 255, 0.3)' : (isCV001 ? 'rgba(255,249,235,0.66)' : 'rgba(0,0,0,0.22)'),
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
          border: isSV002 ? '1px solid rgba(0,0,0,0.05)' : (isCV001 ? '1px solid rgba(139,93,42,0.22)' : '1px solid rgba(255,255,255,0.14)'),
        borderRadius: '28px',
        padding: '40px 48px',
          boxShadow: isSV002 ? '0 10px 40px rgba(0,0,0,0.06)' : (isCV001 ? '0 12px 38px rgba(89,52,23,0.16)' : '0 8px 40px rgba(0,0,0,0.18)'),
      }}>
        <div style={{ minHeight: '180px' }}>
          <h2 style={{ fontSize: isSV002 ? '80px' : '92px', fontWeight: 800, marginBottom: '20px', letterSpacing: '-2px', lineHeight: '1.05', display: 'flex', flexDirection: 'column', textShadow: isSV002 ? 'none' : '0 4px 24px rgba(0,0,0,0.4)' }}>
            <span style={{ color: isSV002 ? 'var(--text-primary)' : 'inherit' }}>
              {typedTitle}
            </span>
          </h2>
          <p style={{ color: isSV002 ? '#777777' : 'rgba(255,255,255,0.95)', fontSize: isSV002 ? '28px' : '36px', fontWeight: isSV002 ? 500 : 600, lineHeight: '1.5', whiteSpace: 'pre-line', marginBottom: '15px', textShadow: isSV002 ? 'none' : '0 2px 12px rgba(0,0,0,0.3)' }}>
            {typedSub}
          </p>
          {!isCompleted && (
            <p style={{ color: isSV002 ? 'var(--amber-warm)' : (isCV001 ? '#a66d2b' : '#FFD97D'), fontSize: '24px', fontWeight: 700, opacity: 1, letterSpacing: '0.5px', textShadow: isSV002 ? 'none' : (isCV001 ? '0 0 16px rgba(180,123,55,0.35)' : '0 0 16px rgba(200,134,10,0.5)'), minHeight: '36px' }}>
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
          {/* Glow background — grows with progress */}
          {!isSV002 && (
            <div style={{
              position: 'absolute',
              width: '300px',
              height: '300px',
              borderRadius: '50%',
              background: isCV001 ? '#b47b37' : '#C8860A',
              filter: 'blur(70px)',
              opacity: 0.10 + (progress / 100) * 0.22,
              transition: 'opacity 0.3s',
              pointerEvents: 'none',
            }} />
          )}

          {/* Pulse-ring halos */}
          {isActive && progress < 100 && !isSV002 && (
            <>
              <div style={{
                position: 'absolute', inset: '45px', borderRadius: '50%',
                border: isCV001 ? '2px solid rgba(180,123,55,0.55)' : '2px solid rgba(232,184,109,0.6)',
                animation: 'pulse-ring 3s cubic-bezier(0.2,0.6,0.3,1) infinite',
                pointerEvents: 'none',
              }} />
              <div style={{
                position: 'absolute', inset: '45px', borderRadius: '50%',
                border: isCV001 ? '2px solid rgba(180,123,55,0.3)' : '2px solid rgba(200,134,10,0.28)',
                animation: 'pulse-ring 3s cubic-bezier(0.2,0.6,0.3,1) infinite 1.5s',
                pointerEvents: 'none',
              }} />
            </>
          )}
          {/* ── Floating particles (Music notes for CV-001, Petals for standard) ── */}
          {isActive && !isSV002 && !isCV001 && noteParticles.map(note => (
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
                color: isCV001 ? '#80efff' : '#fff',
                filter: isCV001 ? 'drop-shadow(0 0 10px rgba(0, 229, 255, 0.8))' : 'drop-shadow(0 4px 12px rgba(120, 60, 0, 0.85)) drop-shadow(0 1px 3px rgba(0,0,0,0.5))',
              }}
            >
              {isCV001 
                ? (note.id % 2 === 0 ? <MusicNoteIcon1 /> : <MusicNoteIcon2 />)
                : (note.id % 2 === 0 ? <FlowerIcon1 /> : <FlowerIcon2 />)}
            </div>
          ))}

          {isSV002 ? (
            <svg width="380" height="380" style={{ position: 'absolute', zIndex: 2, overflow: 'visible' }}>
              <circle cx="190" cy="190" r="190" fill="#ffffff" opacity="0.95" />
              
              <circle cx="190" cy="190" r={radius} fill="transparent" stroke="#f0ede6" strokeWidth="14" />
              
              <circle cx="190" cy="190" r={radius - 24} fill="transparent" stroke="#e0d5c1" strokeWidth="2" strokeDasharray="4 16" />
              
              <text x="190" y="175" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                <tspan fontSize="88px" fontWeight="700" fill="#111111" letterSpacing="-2px">{progress}</tspan>
                <tspan fontSize="52px" fontWeight="600" fill="#111111">%</tspan>
              </text>
              <text x="190" y="245" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '18px', fontWeight: 500, fill: '#666666' }}>
                {statusMsg}
              </text>

              <g style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}>
                <circle
                  cx="190" cy="190" r={radius}
                  fill="transparent"
                  stroke="#ba924b"
                  strokeWidth="14"
                  strokeDasharray={progress === 100 ? 'none' : circumference}
                  strokeDashoffset={progress === 100 ? 0 : strokeDashoffset}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.14s linear' }}
                />
              </g>

              {progress > 0 && progress < 100 && cometTailPoints[0] && (
                <circle
                  cx={cometTailPoints[0].x}
                  cy={cometTailPoints[0].y}
                  r="12"
                  fill="#ba924b"
                  stroke="#ffffff"
                  strokeWidth="4"
                  style={{ transition: 'cx 0.18s linear, cy 0.18s linear', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}
                />
              )}
            </svg>
          ) : (
            <svg width="380" height="380" style={{ position: 'absolute', zIndex: 2, overflow: 'visible' }}>
            <defs>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stopColor="#FFD97D" />
                <stop offset="50%"  stopColor="#E8B86D" />
                <stop offset="100%" stopColor="#C8860A" />
              </linearGradient>
              <linearGradient id="progressGradientCyber" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stopColor="#ffffff" />
                <stop offset="50%"  stopColor="#80efff" />
                <stop offset="100%" stopColor="#00b4d8" />
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
              <circle cx="190" cy="190" r="176" fill="transparent" stroke={isCV001 ? "rgba(180,123,55,0.18)" : "rgba(255,255,255,0.08)"} strokeWidth="3" strokeDasharray="12 18" />
            </g>

            {/* Inner dotted ring — slow counter-clockwise spin */}
            <g style={{ transformOrigin: 'center', animation: isActive ? 'spin-slow-reverse 18s linear infinite' : 'none' }}>
              <circle cx="190" cy="190" r="105" fill="transparent" stroke={isCV001 ? "rgba(180,123,55,0.28)" : "rgba(232,184,109,0.22)"} strokeWidth="5" strokeDasharray="2 14" strokeLinecap="round" />
            </g>

            {/* Glassmorphic center circle background */}
            <circle cx="190" cy="190" r="130" fill={isCV001 ? "rgba(255,249,235,0.9)" : "rgba(30, 18, 0, 0.62)"} stroke={isCV001 ? "rgba(180,123,55,0.3)" : "rgba(200,134,10,0.20)"} strokeWidth="2" />

            {/* Static background track */}
            <circle cx="190" cy="190" r={radius} fill="transparent" stroke={isCV001 ? "rgba(180,123,55,0.12)" : "rgba(255,255,255,0.05)"} strokeWidth="10" />

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
              <tspan fontSize="32px" fontWeight="700" fill={isCV001 ? "#b47b37" : "#FFD97D"} dx="4">%</tspan>
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
                style={{ transition: 'stroke-dashoffset 0.14s linear' }}
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
            </g>

            {/* Comet tail */}
            {cometTailPoints.map(pt => (
              <circle
                key={pt.key}
                cx={pt.x}
                cy={pt.y}
                r={Math.max(0.5, pt.r)}
                fill={pt.key === 0 ? '#ffffff' : (isCV001 ? '#b47b37' : '#E8B86D')}
                opacity={pt.opacity * (pt.key === 0 ? 1 : 0.65)}
                filter={pt.key <= 2 ? 'url(#cometGlow)' : undefined}
                style={{ transition: 'cx 0.14s linear, cy 0.14s linear' }}
              />
            ))}
          </svg>
          )}
        </div>
      </div>
    </div>
  );
};