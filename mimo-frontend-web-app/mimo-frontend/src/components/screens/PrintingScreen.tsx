import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { isFestivalActive } from '../../config/festivalConfig';

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

const FestivePlaqueArtwork: React.FC = () => (
  <svg
    width="100%"
    height="100%"
    viewBox="0 0 750 340"
    preserveAspectRatio="none"
    style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      borderRadius: '28px',
      overflow: 'hidden',
      zIndex: 1,
    }}
  >
    <defs>
      {/* Rich Gold Gradient Palette for Linework */}
      <linearGradient id="plaqueGoldPrime" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFF9C4" />
        <stop offset="25%" stopColor="#F5D061" />
        <stop offset="60%" stopColor="#D4973E" />
        <stop offset="100%" stopColor="#8E5D24" />
      </linearGradient>

      {/* Center luminous spotlight keeping the HELLO text area dominant, crisp & readable */}
      <radialGradient id="centerSpotlight" cx="36%" cy="50%" r="58%">
        <stop offset="0%" stopColor="#FFFDF7" stopOpacity="0.95" />
        <stop offset="65%" stopColor="#FAF2E4" stopOpacity="0.4" />
        <stop offset="100%" stopColor="#F4E6CD" stopOpacity="0" />
      </radialGradient>

      {/* Repeating fine jaali micro-lattice for luxury parchment texture */}
      <pattern id="plaqueMicroJaali" width="36" height="36" patternUnits="userSpaceOnUse">
        <path d="M 18 0 L 36 18 L 18 36 L 0 18 Z" fill="none" stroke="#C48B36" strokeWidth="0.5" strokeOpacity="0.045" />
        <circle cx="18" cy="18" r="7" fill="none" stroke="#D4973E" strokeWidth="0.4" strokeOpacity="0.04" strokeDasharray="1 2" />
      </pattern>
    </defs>

    {/* 1. Micro Jaali Luxury Texture Layer */}
    <rect width="100%" height="100%" fill="url(#plaqueMicroJaali)" />

    {/* 2. Luminous Center Spotlight */}
    <rect width="100%" height="100%" fill="url(#centerSpotlight)" />

    {/* 3. Layered Mandala Artwork in Unused Right Space (Fading Naturally) */}
    <g transform="translate(610, 150)" stroke="url(#plaqueGoldPrime)" fill="none" opacity="0.88">
      {/* Concentric Mandala Rings & Petal Arcs */}
      <circle cx="0" cy="0" r="140" strokeWidth="0.8" strokeDasharray="3 6" opacity="0.18" />
      <circle cx="0" cy="0" r="115" strokeWidth="1" opacity="0.22" />
      <circle cx="0" cy="0" r="95" strokeWidth="0.6" strokeDasharray="2 4" opacity="0.25" />
      <circle cx="0" cy="0" r="75" strokeWidth="1.2" opacity="0.32" />
      <circle cx="0" cy="0" r="55" strokeWidth="0.8" strokeDasharray="4 4" opacity="0.35" />
      <circle cx="0" cy="0" r="35" strokeWidth="1.4" opacity="0.4" />
      <circle cx="0" cy="0" r="18" strokeWidth="1.8" opacity="0.5" />
      <circle cx="0" cy="0" r="4" fill="url(#plaqueGoldPrime)" opacity="0.6" />

      {/* 12 Radiant Lotus Petal Arcs radiating out */}
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(deg => (
        <g key={deg} transform={`rotate(${deg})`}>
          <path d="M 0 -35 C 8 -55 8 -75 0 -95 C -8 -75 -8 -55 0 -35 Z" strokeWidth="0.7" opacity="0.2" />
          <circle cx="0" cy="-75" r="1.8" fill="url(#plaqueGoldPrime)" opacity="0.35" />
          <path d="M 0 -18 Q 6 -27 0 -35 Q -6 -27 0 -18 Z" fill="url(#plaqueGoldPrime)" fillOpacity="0.08" strokeWidth="0.8" opacity="0.3" />
        </g>
      ))}
    </g>

    {/* 4. Elegant Curved Gold Ornamental Flourishes Guiding the Eye toward HELLO */}
    <g stroke="url(#plaqueGoldPrime)" fill="none" strokeLinecap="round">
      {/* Top-Left Inward Guiding Sweep */}
      <path
        d="M 28 55 C 32 32 55 28 85 28 C 120 28 145 20 170 16"
        strokeWidth="1.6"
        opacity="0.45"
      />
      <path
        d="M 38 65 C 42 45 60 40 85 40 Q 115 40 135 34"
        strokeWidth="0.9"
        strokeDasharray="2 4"
        opacity="0.3"
      />
      <circle cx="170" cy="16" r="2.2" fill="url(#plaqueGoldPrime)" opacity="0.6" />

      {/* Left Vertical Subtle Floral Spine */}
      <path
        d="M 24 100 Q 20 140 24 180 Q 28 220 24 260"
        strokeWidth="1"
        strokeDasharray="3 5"
        opacity="0.25"
      />
      <path d="M 24 140 Q 32 140 30 130 Q 24 133 24 140 Z" fill="url(#plaqueGoldPrime)" fillOpacity="0.2" opacity="0.4" />
      <path d="M 24 220 Q 32 220 30 210 Q 24 213 24 220 Z" fill="url(#plaqueGoldPrime)" fillOpacity="0.2" opacity="0.4" />

      {/* Bottom-Left Guiding Flourish */}
      <path
        d="M 28 285 C 32 308 55 312 85 312 C 130 312 170 320 210 324"
        strokeWidth="1.4"
        opacity="0.4"
      />
      <circle cx="210" cy="324" r="2" fill="url(#plaqueGoldPrime)" opacity="0.5" />
    </g>

    {/* 5. Symmetrical Architectural Inset Frame with Engraved Gold Detailing */}
    {/* Outer Inset Hairline Frame */}
    <rect
      x="12" y="12"
      width="726" height="316"
      rx="20"
      fill="none"
      stroke="url(#plaqueGoldPrime)"
      strokeWidth="1.2"
      opacity="0.38"
    />

    {/* Inner Fine Dotted Accent Frame with 3D Engraved Under-Shadow */}
    <rect
      x="18" y="18"
      width="714" height="304"
      rx="16"
      fill="none"
      stroke="url(#plaqueGoldPrime)"
      strokeWidth="0.8"
      strokeDasharray="2.5 5"
      opacity="0.25"
    />

    {/* Symmetrical Border Jewels & Diamond Accents */}
    {/* Top Center Jewel Motif */}
    <g transform="translate(375, 12)" fill="url(#plaqueGoldPrime)">
      <polygon points="0,-4 5,0 0,4 -5,0" opacity="0.6" />
      <circle cx="-16" cy="0" r="1.5" opacity="0.4" />
      <circle cx="16" cy="0" r="1.5" opacity="0.4" />
    </g>
    {/* Bottom Center Jewel Motif */}
    <g transform="translate(375, 328)" fill="url(#plaqueGoldPrime)">
      <polygon points="0,-4 5,0 0,4 -5,0" opacity="0.6" />
      <circle cx="-16" cy="0" r="1.5" opacity="0.4" />
      <circle cx="16" cy="0" r="1.5" opacity="0.4" />
    </g>
    {/* Right Mid Jewel Motif */}
    <g transform="translate(738, 170)" fill="url(#plaqueGoldPrime)">
      <polygon points="-4,0 0,5 4,0 0,-5" opacity="0.5" />
      <circle cx="0" cy="-14" r="1.5" opacity="0.35" />
      <circle cx="0" cy="14" r="1.5" opacity="0.35" />
    </g>

    {/* 6. Four Symmetrical Traditional Corner Crests */}
    {/* Top-Left Corner Crest */}
    <g transform="translate(18, 18)" stroke="url(#plaqueGoldPrime)" fill="none">
      <path d="M 0 28 L 0 8 Q 0 0 8 0 L 28 0" strokeWidth="1.8" opacity="0.5" />
      <path d="M 6 22 C 6 12 12 6 22 6" strokeWidth="1" strokeDasharray="1.5 3" opacity="0.35" />
      <circle cx="6" cy="6" r="2.5" fill="url(#plaqueGoldPrime)" opacity="0.6" />
      <path d="M 6 6 Q 16 6 16 16 Q 6 16 6 6 Z" fill="url(#plaqueGoldPrime)" fillOpacity="0.25" opacity="0.45" />
    </g>

    {/* Top-Right Corner Crest */}
    <g transform="translate(732, 18) scale(-1, 1)" stroke="url(#plaqueGoldPrime)" fill="none">
      <path d="M 0 28 L 0 8 Q 0 0 8 0 L 28 0" strokeWidth="1.8" opacity="0.5" />
      <path d="M 6 22 C 6 12 12 6 22 6" strokeWidth="1" strokeDasharray="1.5 3" opacity="0.35" />
      <circle cx="6" cy="6" r="2.5" fill="url(#plaqueGoldPrime)" opacity="0.6" />
      <path d="M 6 6 Q 16 6 16 16 Q 6 16 6 6 Z" fill="url(#plaqueGoldPrime)" fillOpacity="0.25" opacity="0.45" />
    </g>

    {/* Bottom-Left Corner Crest */}
    <g transform="translate(18, 322) scale(1, -1)" stroke="url(#plaqueGoldPrime)" fill="none">
      <path d="M 0 28 L 0 8 Q 0 0 8 0 L 28 0" strokeWidth="1.8" opacity="0.5" />
      <path d="M 6 22 C 6 12 12 6 22 6" strokeWidth="1" strokeDasharray="1.5 3" opacity="0.35" />
      <circle cx="6" cy="6" r="2.5" fill="url(#plaqueGoldPrime)" opacity="0.6" />
      <path d="M 6 6 Q 16 6 16 16 Q 6 16 6 6 Z" fill="url(#plaqueGoldPrime)" fillOpacity="0.25" opacity="0.45" />
    </g>

    {/* Bottom-Right Corner Crest */}
    <g transform="translate(732, 322) scale(-1, -1)" stroke="url(#plaqueGoldPrime)" fill="none">
      <path d="M 0 28 L 0 8 Q 0 0 8 0 L 28 0" strokeWidth="1.8" opacity="0.5" />
      <path d="M 6 22 C 6 12 12 6 22 6" strokeWidth="1" strokeDasharray="1.5 3" opacity="0.35" />
      <circle cx="6" cy="6" r="2.5" fill="url(#plaqueGoldPrime)" opacity="0.6" />
      <path d="M 6 6 Q 16 6 16 16 Q 6 16 6 6 Z" fill="url(#plaqueGoldPrime)" fillOpacity="0.25" opacity="0.45" />
    </g>
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
  const isFestiveMode = kioskId === 'CV-001' || (kioskId === 'SV-002' && isFestivalActive());
  const isSV002NonFestive = kioskId === 'SV-002' && !isFestiveMode;
  const [progress, setProgress]         = useState(1);
  const [typedTitle, setTypedTitle]     = useState('');
  const [typedSub, setTypedSub]         = useState('');
  const [printDone, setPrintDone]       = useState(false);   // true once Pi confirms
  const [statusMsg, setStatusMsg]       = useState('Warming up printer…');
  // Color hold: after 100%, inkjet needs extra time to physically eject paper
  const [collectingPages, setCollectingPages] = useState(false);
  const [collectCountdown, setCollectCountdown] = useState(0);
  const collectTimerRef = useRef<number | null>(null);

  const progressRef         = useRef(1);   // mirror of progress for closures
  const tickTimerRef        = useRef<number | null>(null);
  const pollTimerRef        = useRef<number | null>(null);
  const completionTimerRef  = useRef<number | null>(null);
  const isCompletingRef     = useRef(false);
  const stallTimerRef       = useRef<number | null>(null);   // stall detector
  const lastProgressRef     = useRef(1);                    // last recorded progress for stall check
  const startTimeRef        = useRef(Date.now());           // when the print screen was activated
  const lastSuccessfulPollTimeRef = useRef(Date.now());     // when we last successfully polled the backend

  const isCompleted = progress >= 100;



  const finalTitle = isCompleted
    ? "Print Completed ✅"
    : (isFestiveMode && statusTitle === "Print Completed ✅")
    ? "Printing in Progress"
    : (statusTitle || "Printing in Progress");

  const finalSub = isCompleted
    ? "Your document has been printed successfully."
    : (isFestiveMode && statusTitle === "Print Completed ✅")
    ? "Printing in progress…\nPlease wait."
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

    // Smooth final transition: 98% (or current) → 99% → 100%
    const currentProgress = progressRef.current;
    if (currentProgress < 99) {
      progressRef.current = 99;
      setProgress(99);
    }

    window.setTimeout(() => {
      progressRef.current = 100;
      setProgress(100);
      setStatusMsg('Print Completed ✅');

      // Hold for 1.0 second before transitioning to summary screen
      completionTimerRef.current = window.setTimeout(() => {
        onComplete();
      }, 1000);
    }, 90);
  }, [onComplete]);

  // ─── polling ───────────────────────────────────────────────────────────────

  const schedulePoll = useCallback((delayMs = 250) => {
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

        // Authoritative completion signal from backend
        if (data.status === 'completed' || data.isPrinted === true) {
          setPrintDone(true);
          // animateTo100AndComplete will be called via the printDone effect
        } else if (data.status === 'failed') {
          const errMsg = data.printerStatus || data.error || 'Printer reported an error.';
          setStatusMsg(errMsg);
          clearAllTimers();
          if (onError) onError(errMsg);
        } else {
          // Still printing or paid — continue polling every 250 ms
          schedulePoll(250);
        }
      } catch {
        // Network hiccup — retry in 2 s
        pollTimerRef.current = window.setTimeout(() => schedulePoll(250), 2000);
      }
    }, delayMs);
  }, [printCode, isActive, onError, clearAllTimers]);

  // ─── calibrated progress simulation (1% → 98% MAX) ──────────────────────

  const startSlowTick = useCallback(() => {
    if (manualProgress !== undefined) return;

    const totalSheets = Math.max(1, pages * copies);
    const isColor = colorMode === 'color';

    // ── Calibrated realistic physical print timings ─────────────────────────
    // MIMO 1.0 (CV-001):
    // Physical printed page takes ~15–18 seconds to come out of the machine.
    // Progress bar smoothly animates from 1% toward 98% over ~17 seconds,
    // holding at 98% until the real backend completion signal arrives.
    //
    // MIMO 2.0 (SV-002):
    // Color Inkjet (Epson L3250): 4.2s warmup + 9.5s per sheet (~13.7s for 1 sheet)
    // B&W Laser (Brother HL-L2440DW): 3.2s warmup + 2.2s per sheet
    const isMIMO10 = kioskId !== 'SV-002';
    const totalAnimMs = isMIMO10
      ? 17000
      : (isColor ? 4200 : 3200) + totalSheets * (isColor ? 9500 : 2200);

    // Cap estimated progress strictly at 98% while waiting for real backend completion signal
    const cap = (printCode && printCode !== '0000') ? 98 : 100;
    const totalSteps = Math.max(1, cap - 1); // 1% -> 98% is 97 steps
    const baseDelay = Math.max(40, totalAnimMs / totalSteps); // ms per 1% step

    const tick = () => {
      if (isCompletingRef.current) return;

      const currentProgress = progressRef.current;

      if (currentProgress >= cap) {
        if (!printCode || printCode === '0000') {
          animateTo100AndComplete();
        } else {
          // Strictly hold at 98% until backend confirms physical completion
          setStatusMsg(
            totalSheets > 1
              ? `Finalizing print job (${totalSheets} of ${totalSheets} sheets)…`
              : `Finalizing print job…`
          );
        }
        return;
      }

      const next = Math.min(cap, currentProgress + 1);
      progressRef.current = next;
      setProgress(next);

      // Status text updates
      if (next <= 15) {
        setStatusMsg('Warming up printer…');
      } else {
        const printProgressPct = (next - 15) / (cap - 15);
        const currentSheetEstimate = Math.min(
          totalSheets,
          Math.max(1, Math.ceil(printProgressPct * totalSheets))
        );
        setStatusMsg(
          totalSheets === 1
            ? `Printing document…`
            : `Printing sheet ${currentSheetEstimate} of ${totalSheets}…`
        );
      }

      if (next !== lastProgressRef.current) {
        lastProgressRef.current = progressRef.current;
      }

      const jitter = (Math.random() - 0.5) * baseDelay * 0.05;
      tickTimerRef.current = window.setTimeout(tick, Math.max(40, baseDelay + jitter));
    };

    tickTimerRef.current = window.setTimeout(tick, baseDelay);
  }, [pages, copies, printCode, manualProgress, colorMode, kioskId, animateTo100AndComplete]);

  // ─── main effect ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isActive) {
      clearAllTimers();
      setProgress(1);
      progressRef.current = 1;
      lastProgressRef.current = 1;
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

    // Explicitly start at 1% on screen activation
    setProgress(1);
    progressRef.current = 1;
    lastProgressRef.current = 1;
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
      if (printCode) schedulePoll(250); // First check after 250ms, then every 250ms
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
        @keyframes ladoo-group-spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes ladoo-counter-spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(-360deg); }
        }
      `}</style>

      {/* ── Color print: "Collecting your pages" overlay ── */}
      {collectingPages && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 200,
          background: isFestiveMode ? 'linear-gradient(135deg, #f5ecdc 0%, #e6cfad 100%)' : 'linear-gradient(135deg, #001a28 0%, #00101c 100%)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '36px',
          animation: 'collect-fade-in 0.5s ease',
        }}>
          {/* Printer icon + pulse ring */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              width: '140px', height: '140px', borderRadius: '50%',
              background: isFestiveMode ? 'rgba(180,123,55,0.10)' : 'rgba(0,242,254,0.08)',
              border: isFestiveMode ? '3px solid rgba(180,123,55,0.5)' : '3px solid rgba(0,242,254,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'collect-pulse 2s ease-in-out infinite',
            }}>
              <span className="material-symbols-outlined" style={{
                fontSize: '72px', color: isFestiveMode ? '#a66d2b' : '#00f2fe',
                filter: isFestiveMode ? 'drop-shadow(0 0 16px rgba(180,123,55,0.45))' : 'drop-shadow(0 0 16px rgba(0,242,254,0.7))',
              }}>print</span>
            </div>
          </div>

          {/* Main message */}
          <div style={{ textAlign: 'center', maxWidth: '700px', padding: '0 40px' }}>
            <h2 style={{
              fontSize: '62px', fontWeight: 800, letterSpacing: '-2px',
              lineHeight: 1.1, marginBottom: '20px',
              background: isFestiveMode ? 'linear-gradient(135deg, #4b2d1d, #d5a45a)' : 'linear-gradient(135deg, #00f2fe, #4facfe)',
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
              border: isFestiveMode ? '4px solid rgba(180,123,55,0.3)' : '4px solid rgba(0,242,254,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isFestiveMode ? 'rgba(180,123,55,0.08)' : 'rgba(0,242,254,0.06)',
              boxShadow: isFestiveMode ? 'inset 0 0 20px rgba(180,123,55,0.12)' : 'inset 0 0 20px rgba(0,242,254,0.1)',
            }}>
              <span style={{
                fontSize: '38px', fontWeight: 800, color: isFestiveMode ? '#8b5928' : '#00f2fe',
                fontVariantNumeric: 'tabular-nums',
                filter: isFestiveMode ? 'drop-shadow(0 0 8px rgba(180,123,55,0.45))' : 'drop-shadow(0 0 8px rgba(0,242,254,0.6))',
              }}>{collectCountdown}</span>
            </div>
            <p style={{ fontSize: '16px', color: isFestiveMode ? 'rgba(75,45,29,0.6)' : 'rgba(255,255,255,0.4)', letterSpacing: '1px', textTransform: 'uppercase' }}>
              seconds
            </p>
          </div>
        </div>
      )}

      {/* ── Left text block — Festive Traditional Card Presentation ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '30px',
        flex: 1, textAlign: 'left', maxWidth: '750px', zIndex: 10,
        position: 'relative',
        background: isSV002NonFestive
          ? 'rgba(255, 255, 255, 0.3)'
          : (isFestiveMode
            ? 'linear-gradient(145deg, rgba(255, 253, 247, 0.96) 0%, rgba(250, 242, 228, 0.91) 100%)'
            : 'rgba(0,0,0,0.22)'),
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: isSV002NonFestive
          ? '1px solid rgba(0,0,0,0.05)'
          : (isFestiveMode
            ? '1.5px solid rgba(196, 139, 54, 0.45)'
            : '1px solid rgba(255,255,255,0.14)'),
        borderRadius: '28px',
        padding: '42px 50px',
        boxShadow: isSV002NonFestive
          ? '0 10px 40px rgba(0,0,0,0.06)'
          : (isFestiveMode
            ? '0 20px 50px rgba(74, 45, 20, 0.12), 0 4px 14px rgba(74, 45, 20, 0.06), inset 0 1px 1.5px rgba(255,255,255,0.95), inset 0 0 20px rgba(212, 151, 62, 0.07)'
            : '0 8px 40px rgba(0,0,0,0.18)'),
      }}>
        {/* Unified Luxury Indian Festive Plaque Background Artwork */}
        {isFestiveMode && <FestivePlaqueArtwork />}

        <div style={{ minHeight: '180px', position: 'relative', zIndex: 2 }}>
          <h2 style={{ fontSize: isSV002NonFestive ? '80px' : '92px', fontWeight: 800, marginBottom: '20px', letterSpacing: '-2px', lineHeight: '1.05', display: 'flex', flexDirection: 'column', textShadow: isSV002NonFestive || isFestiveMode ? 'none' : '0 4px 24px rgba(0,0,0,0.4)' }}>
            <span style={{ color: isSV002NonFestive ? 'var(--text-primary)' : (isFestiveMode ? '#3C2113' : 'inherit') }}>
              {typedTitle}
            </span>
          </h2>
          <p style={{ color: isSV002NonFestive ? '#777777' : (isFestiveMode ? '#5A3D28' : 'rgba(255,255,255,0.95)'), fontSize: isSV002NonFestive ? '28px' : '36px', fontWeight: isSV002NonFestive || isFestiveMode ? 500 : 600, lineHeight: '1.5', whiteSpace: 'pre-line', marginBottom: '15px', textShadow: isSV002NonFestive || isFestiveMode ? 'none' : '0 2px 12px rgba(0,0,0,0.3)' }}>
            {typedSub}
          </p>
          {!isCompleted && (
            <p style={{ color: isSV002NonFestive ? 'var(--amber-warm)' : (isFestiveMode ? '#a66d2b' : '#FFD97D'), fontSize: '24px', fontWeight: 700, opacity: 1, letterSpacing: '0.5px', textShadow: isSV002NonFestive ? 'none' : (isFestiveMode ? '0 0 16px rgba(180,123,55,0.35)' : '0 0 16px rgba(200,134,10,0.5)'), minHeight: '36px' }}>
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
          {!isSV002NonFestive && (
            <div style={{
              position: 'absolute',
              width: '300px',
              height: '300px',
              borderRadius: '50%',
              background: isFestiveMode ? '#b47b37' : '#C8860A',
              filter: 'blur(70px)',
              opacity: 0.10 + (progress / 100) * 0.22,
              transition: 'opacity 0.3s',
              pointerEvents: 'none',
            }} />
          )}

          {/* Pulse-ring halos */}
          {isActive && progress < 100 && !isSV002NonFestive && (
            <>
              <div style={{
                position: 'absolute', inset: '45px', borderRadius: '50%',
                border: isFestiveMode ? '2px solid rgba(180,123,55,0.55)' : '2px solid rgba(232,184,109,0.6)',
                animation: 'pulse-ring 3s cubic-bezier(0.2,0.6,0.3,1) infinite',
                pointerEvents: 'none',
              }} />
              <div style={{
                position: 'absolute', inset: '45px', borderRadius: '50%',
                border: isFestiveMode ? '2px solid rgba(180,123,55,0.3)' : '2px solid rgba(200,134,10,0.28)',
                animation: 'pulse-ring 3s cubic-bezier(0.2,0.6,0.3,1) infinite 1.5s',
                pointerEvents: 'none',
              }} />
            </>
          )}
          {/* ── Floating particles (Music notes for Festive, Petals for standard) ── */}
          {isActive && !isSV002NonFestive && !isFestiveMode && noteParticles.map(note => (
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
                color: isFestiveMode ? '#80efff' : '#fff',
                filter: isFestiveMode ? 'drop-shadow(0 0 10px rgba(0, 229, 255, 0.8))' : 'drop-shadow(0 4px 12px rgba(120, 60, 0, 0.85)) drop-shadow(0 1px 3px rgba(0,0,0,0.5))',
              }}
            >
              {isFestiveMode
                ? (note.id % 2 === 0 ? <MusicNoteIcon1 /> : <MusicNoteIcon2 />)
                : (note.id % 2 === 0 ? <FlowerIcon1 /> : <FlowerIcon2 />)}
            </div>
          ))}

          {isSV002NonFestive ? (
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
              {/* 3D Spherical Gold-Orange Ladoo Radial Gradient */}
              <radialGradient id="ladoo3DGrad" cx="35%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#FFF176" />
                <stop offset="25%" stopColor="#F5A623" />
                <stop offset="65%" stopColor="#E67E22" />
                <stop offset="90%" stopColor="#D35400" />
                <stop offset="100%" stopColor="#6E3D11" />
              </radialGradient>
              {/* Boondi Texture Highlight Gradient */}
              <radialGradient id="boondiGlow" cx="40%" cy="40%" r="50%">
                <stop offset="0%" stopColor="#FFF7C2" />
                <stop offset="100%" stopColor="#F5A623" />
              </radialGradient>
              {/* Ganesha Center Aura Gradient */}
              <radialGradient id="ganeshaAuraGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FDE699" stopOpacity="0.6" />
                <stop offset="70%" stopColor="#E59866" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#FAF4E8" stopOpacity="0" />
              </radialGradient>
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
              <circle cx="190" cy="190" r="176" fill="transparent" stroke={isFestiveMode ? "rgba(180,123,55,0.22)" : "rgba(255,255,255,0.08)"} strokeWidth="3" strokeDasharray="12 18" />
            </g>

            {/* Inner dotted ring — slow counter-clockwise spin */}
            <g style={{ transformOrigin: 'center', animation: isActive ? 'spin-slow-reverse 18s linear infinite' : 'none' }}>
              <circle cx="190" cy="190" r="105" fill="transparent" stroke={isFestiveMode ? "rgba(180,123,55,0.28)" : "rgba(232,184,109,0.22)"} strokeWidth="5" strokeDasharray="2 14" strokeLinecap="round" />
            </g>

            {/* Keep the Festive Ganesha on the page surface with no painted backdrop. */}
            <circle cx="190" cy="190" r="130" fill="transparent" stroke={isFestiveMode ? "transparent" : "rgba(200,134,10,0.20)"} strokeWidth="2" />

            {/* Ganesha center artwork for Festive Mode — ultra-subtle transparent watermark behind percentage text */}
            {isFestiveMode && (
              <g id="cv001-ganesha-center" pointerEvents="none" opacity="0.15" style={{ filter: 'drop-shadow(0 1px 2px rgba(180, 123, 55, 0.08))' }}>
                <g stroke="#C48B36" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  {/* Mukut (Crown) Peak & Tiers */}
                  <path d="M190 82 L178 108 Q190 102 202 108 Z" fill="#F5D061" fillOpacity="0.12" strokeWidth="1.8" />
                  <path d="M184 94 L190 84 L196 94" strokeWidth="1.5" />
                  <path d="M168 110 Q190 96 212 110 Q190 122 168 110 Z" fill="#F5D061" fillOpacity="0.08" strokeWidth="1.8" />
                  <path d="M164 118 Q190 128 216 118" strokeWidth="1.8" />

                  {/* Left Ear */}
                  <path d="M164 119 C136 122 122 150 140 176 C148 187 159 182 168 163 L164 119 Z" fill="#D4973E" fillOpacity="0.06" strokeWidth="2.2" />
                  {/* Right Ear */}
                  <path d="M216 119 C244 122 258 150 240 176 C232 187 221 182 212 163 L216 119 Z" fill="#D4973E" fillOpacity="0.06" strokeWidth="2.2" />

                  {/* Eyes & Eyebrows */}
                  <path d="M152 148 Q163 136 177 144" strokeWidth="2.2" />
                  <path d="M203 144 Q217 136 228 148" strokeWidth="2.2" />
                  <path d="M157 156 Q164 161 171 156" strokeWidth="1.4" />
                  <path d="M209 156 Q216 161 223 156" strokeWidth="1.4" />

                  {/* Tilak Line & Crescent */}
                  <path d="M190 117 L190 130" strokeWidth="1.8" stroke="#D4973E" />
                  <path d="M184 123 Q190 128 196 123" strokeWidth="1.5" stroke="#D4973E" />

                  {/* Trunk (Sond) Graceful Curve */}
                  <path d="M178 162 C178 183 175 204 185 220 C192 232 208 236 219 225 C225 219 221 210 214 211 C207 212 205 219 211 223" strokeWidth="2.6" />
                  
                  {/* Tusk Details */}
                  <path d="M174 165 L168 168" strokeWidth="2.0" />
                  <path d="M206 165 L213 169" strokeWidth="2.0" />

                  {/* Trunk Wrinkles */}
                  <path d="M177 178 Q187 184 197 178" strokeWidth="1.4" />
                  <path d="M178 192 Q187 198 196 192" strokeWidth="1.4" />
                  <path d="M180 206 Q188 211 196 206" strokeWidth="1.4" />
                </g>
                {/* Subtle Gold Bindi/Tilak Spot */}
                <circle cx="190" cy="123" r="2.5" fill="#D4973E" stroke="none" />
              </g>
            )}

            {/* Static background track */}
            <circle cx="190" cy="190" r={radius} fill="transparent" stroke={isFestiveMode ? "rgba(180,123,55,0.15)" : "rgba(255,255,255,0.05)"} strokeWidth="10" />

            {/* Center Percentage Display */}
            <text
              x="190" y="196"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                animation: isActive && progress < 100 && !isFestiveMode ? 'text-glow-pulse 2s infinite alternate' : 'none',
              }}
            >
              <tspan fontSize="92px" fontWeight="800" fill={isFestiveMode ? "#3C2113" : "#ffffff"} letterSpacing="-2px" style={{ fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>{progress}</tspan>
              <tspan fontSize="32px" fontWeight="700" fill={isFestiveMode ? "#b47b37" : "#FFD97D"} dx="4">%</tspan>
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
                fill={pt.key === 0 ? '#ffffff' : (isFestiveMode ? '#b47b37' : '#E8B86D')}
                opacity={pt.opacity * (pt.key === 0 ? 1 : 0.65)}
                filter={pt.key <= 2 ? 'url(#cometGlow)' : undefined}
                style={{ transition: 'cx 0.14s linear, cy 0.14s linear' }}
              />
            ))}

            {/* Decorative Festive Ladoos for Festive Mode — Perfect Circular Orbit centered at (190, 190), R = 172px */}
            {isFestiveMode && (
              <g
                className="cv001-ladoo-decor-orbit"
                style={{
                  transformOrigin: '190px 190px',
                  animation: isActive ? 'ladoo-group-spin 48s linear infinite' : 'none',
                }}
              >
                {/* Orbital Dashed Guideline Ring */}
                <circle cx="190" cy="190" r="172" fill="none" stroke="rgba(180,123,55,0.22)" strokeWidth="1.5" strokeDasharray="6 14" />
                <circle cx="190" cy="190" r="182" fill="none" stroke="rgba(212,151,62,0.12)" strokeWidth="1" strokeDasharray="3 18" />

                {/* Ladoo 1: Top (~11:30 position, Angle -75deg: x=234.5, y=23.8) */}
                <g transform="translate(234.5, 23.8)">
                  <g style={{ transformOrigin: '0px 0px', animation: isActive ? 'ladoo-counter-spin 48s linear infinite' : 'none' }}>
                    <ellipse cx="0" cy="16" rx="13" ry="4" fill="rgba(74,45,20,0.28)" filter="blur(2px)" />
                    {/* Organic Ladoo 1 Shape */}
                    <path
                      d="M -15 0 C -16 -10 -8 -16 0 -16 C 9 -16 16 -8 16 0 C 16 9 8 16 0 15 C -9 15 -15 9 -15 0 Z"
                      fill="url(#ladoo3DGrad)"
                      stroke="#B77B1A"
                      strokeWidth="0.8"
                    />
                    <circle cx="-6" cy="-4" r="3.2" fill="url(#boondiGlow)" opacity="0.85" />
                    <circle cx="5" cy="-6" r="3" fill="#F5A623" opacity="0.9" />
                    <circle cx="-7" cy="4" r="2.8" fill="#D35400" opacity="0.75" />
                    <circle cx="2" cy="6" r="3.2" fill="#F39C12" opacity="0.9" />
                    <circle cx="7" cy="2" r="2.5" fill="#FDE699" opacity="0.85" />
                    <circle cx="-1" cy="-8" r="2.6" fill="#FFF7C2" opacity="0.9" />
                    <circle cx="0" cy="1" r="3" fill="#E67E22" />
                    {/* Garnishes */}
                    <ellipse cx="-2" cy="-5" rx="3.5" ry="1.6" fill="#FFFDE7" transform="rotate(-20, -2, -5)" />
                    <ellipse cx="3" cy="-4" rx="2.6" ry="1.3" fill="#27AE60" transform="rotate(35, 3, -4)" />
                    <circle cx="3" cy="-4" r="0.8" fill="#A9DFBF" />
                    <circle cx="19" cy="-8" r="2.2" fill="#F5A623" />
                    <circle cx="24" cy="-14" r="1.5" fill="#FDE699" />
                    <circle cx="-16" cy="12" r="1.8" fill="#D35400" />
                  </g>
                </g>

                {/* Ladoo 2: Top-Right (~2:15 position, Angle -25deg: x=345.9, y=117.3) */}
                <g transform="translate(345.9, 117.3)">
                  <g style={{ transformOrigin: '0px 0px', animation: isActive ? 'ladoo-counter-spin 48s linear infinite' : 'none' }}>
                    <ellipse cx="0" cy="17" rx="14" ry="4.5" fill="rgba(74,45,20,0.28)" filter="blur(2px)" />
                    {/* Organic Ladoo 2 Shape */}
                    <path
                      d="M -16 0 C -15 -9 -7 -15 1 -15 C 10 -15 17 -7 17 1 C 17 10 7 16 -1 16 C -10 16 -16 8 -16 0 Z"
                      fill="url(#ladoo3DGrad)"
                      stroke="#B77B1A"
                      strokeWidth="0.8"
                    />
                    <circle cx="-6" cy="-5" r="3.4" fill="url(#boondiGlow)" opacity="0.9" />
                    <circle cx="6" cy="-6" r="3.2" fill="#F5A623" opacity="0.9" />
                    <circle cx="-8" cy="4" r="3" fill="#D35400" opacity="0.75" />
                    <circle cx="2" cy="7" r="3.5" fill="#F39C12" opacity="0.95" />
                    <circle cx="8" cy="2" r="2.6" fill="#FDE699" opacity="0.85" />
                    <circle cx="-1" cy="-9" r="2.8" fill="#FFF7C2" opacity="0.9" />
                    <circle cx="0" cy="1" r="3.2" fill="#E67E22" />
                    <ellipse cx="-2" cy="-6" rx="3.8" ry="1.8" fill="#FFFDE7" transform="rotate(-15, -2, -6)" />
                    <ellipse cx="4" cy="-5" rx="2.8" ry="1.4" fill="#27AE60" transform="rotate(40, 4, -5)" />
                    <circle cx="4" cy="-5" r="0.8" fill="#A9DFBF" />
                    <circle cx="15" cy="16" r="2" fill="#FDE699" />
                    <circle cx="-18" cy="-14" r="1.6" fill="#F5A623" />
                  </g>
                </g>

                {/* Ladoo 3: Bottom-Right (~4:15 position, Angle 45deg: x=311.6, y=311.6) */}
                <g transform="translate(311.6, 311.6)">
                  <g style={{ transformOrigin: '0px 0px', animation: isActive ? 'ladoo-counter-spin 48s linear infinite' : 'none' }}>
                    <ellipse cx="0" cy="16" rx="13" ry="4" fill="rgba(74,45,20,0.28)" filter="blur(2px)" />
                    {/* Organic Ladoo 3 Shape */}
                    <path
                      d="M -15 -1 C -16 -9 -6 -16 1 -16 C 9 -16 16 -7 15 1 C 15 9 6 15 -2 15 C -10 15 -15 7 -15 -1 Z"
                      fill="url(#ladoo3DGrad)"
                      stroke="#B77B1A"
                      strokeWidth="0.8"
                    />
                    <circle cx="-5" cy="-4" r="3.2" fill="url(#boondiGlow)" opacity="0.85" />
                    <circle cx="5" cy="-5" r="3" fill="#F5A623" opacity="0.9" />
                    <circle cx="-7" cy="4" r="2.8" fill="#D35400" opacity="0.75" />
                    <circle cx="2" cy="6" r="3.2" fill="#F39C12" opacity="0.9" />
                    <circle cx="7" cy="2" r="2.5" fill="#FDE699" opacity="0.85" />
                    <circle cx="0" cy="1" r="3" fill="#E67E22" />
                    <ellipse cx="-2" cy="-5" rx="3.5" ry="1.6" fill="#FFFDE7" transform="rotate(-25, -2, -5)" />
                    <ellipse cx="3" cy="-4" rx="2.6" ry="1.3" fill="#27AE60" transform="rotate(30, 3, -4)" />
                    <circle cx="18" cy="12" r="2" fill="#F5A623" />
                    <circle cx="-15" cy="15" r="1.5" fill="#FDE699" />
                  </g>
                </g>

                {/* Ladoo 4: Bottom-Center (~5:45 position, Angle 105deg: x=145.5, y=356.1) */}
                <g transform="translate(145.5, 356.1)">
                  <g style={{ transformOrigin: '0px 0px', animation: isActive ? 'ladoo-counter-spin 48s linear infinite' : 'none' }}>
                    <ellipse cx="0" cy="17" rx="14" ry="4.5" fill="rgba(74,45,20,0.28)" filter="blur(2px)" />
                    {/* Organic Ladoo 4 Shape */}
                    <path
                      d="M -16 0 C -15 -10 -7 -15 0 -15 C 9 -15 16 -9 16 0 C 16 10 9 16 0 16 C -8 16 -16 8 -16 0 Z"
                      fill="url(#ladoo3DGrad)"
                      stroke="#B77B1A"
                      strokeWidth="0.8"
                    />
                    <circle cx="-6" cy="-5" r="3.4" fill="url(#boondiGlow)" opacity="0.9" />
                    <circle cx="6" cy="-6" r="3.2" fill="#F5A623" opacity="0.9" />
                    <circle cx="-8" cy="4" r="3" fill="#D35400" opacity="0.75" />
                    <circle cx="2" cy="7" r="3.5" fill="#F39C12" opacity="0.95" />
                    <circle cx="8" cy="2" r="2.6" fill="#FDE699" opacity="0.85" />
                    <circle cx="-1" cy="-9" r="2.8" fill="#FFF7C2" opacity="0.9" />
                    <circle cx="0" cy="1" r="3.2" fill="#E67E22" />
                    <ellipse cx="-2" cy="-6" rx="3.8" ry="1.8" fill="#FFFDE7" transform="rotate(-15, -2, -6)" />
                    <ellipse cx="4" cy="-5" rx="2.8" ry="1.4" fill="#27AE60" transform="rotate(40, 4, -5)" />
                    <circle cx="-18" cy="10" r="2" fill="#FDE699" />
                    <circle cx="16" cy="-12" r="1.7" fill="#F5A623" />
                  </g>
                </g>

                {/* Ladoo 5: Left-Mid (~8:45 position, Angle 195deg: x=23.8, y=145.5) */}
                <g transform="translate(23.8, 145.5)">
                  <g style={{ transformOrigin: '0px 0px', animation: isActive ? 'ladoo-counter-spin 48s linear infinite' : 'none' }}>
                    <ellipse cx="0" cy="16" rx="13" ry="4" fill="rgba(74,45,20,0.28)" filter="blur(2px)" />
                    {/* Organic Ladoo 5 Shape */}
                    <path
                      d="M -15 1 C -15 -8 -7 -16 0 -16 C 8 -16 16 -8 15 1 C 15 9 7 15 0 15 C -8 15 -15 8 -15 1 Z"
                      fill="url(#ladoo3DGrad)"
                      stroke="#B77B1A"
                      strokeWidth="0.8"
                    />
                    <circle cx="-5" cy="-4" r="3.2" fill="url(#boondiGlow)" opacity="0.85" />
                    <circle cx="5" cy="-5" r="3" fill="#F5A623" opacity="0.9" />
                    <circle cx="-7" cy="4" r="2.8" fill="#D35400" opacity="0.75" />
                    <circle cx="2" cy="6" r="3.2" fill="#F39C12" opacity="0.9" />
                    <circle cx="7" cy="2" r="2.5" fill="#FDE699" opacity="0.85" />
                    <circle cx="0" cy="1" r="3" fill="#E67E22" />
                    <ellipse cx="-2" cy="-5" rx="3.5" ry="1.6" fill="#FFFDE7" transform="rotate(-25, -2, -5)" />
                    <ellipse cx="3" cy="-4" rx="2.6" ry="1.3" fill="#27AE60" transform="rotate(30, 3, -4)" />
                    <circle cx="-14" cy="-12" r="2" fill="#F5A623" />
                    <circle cx="15" cy="14" r="1.6" fill="#FDE699" />
                  </g>
                </g>
              </g>
            )}
          </svg>
          )}
        </div>
      </div>
    </div>
  );
};