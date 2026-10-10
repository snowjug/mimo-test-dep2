import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Printer } from '@phosphor-icons/react';
import { isFestivalActive } from '../../config/festivalConfig';
import { DiyaRow, FestiveBackdrop, Mandala, Toran, ZariBorder } from '../festive/NavaratriDecor';

const BACKEND_URL = "https://api-upqxuj7evq-uc.a.run.app";
// '0000' and '9999' are both faked entirely client-side in App.tsx (no print_jobs doc is ever created for
// them), so neither can ever be found by a real backend poll. '9999' used to be missing from this list here,
// so it would poll job-status for a job that doesn't exist, sit on "Warming up printer…" forever, and only
// ever resolve by hitting the print timeout and showing an error — looking exactly like "doesn't work".
const isDemoPrintCode = (code?: string) => code === '0000' || code === '9999';

interface PrintingScreenProps {
  isActive: boolean;
  statusTitle?: string;
  statusSub?: string;
  onComplete: () => void;
  onError?: (errorMsg?: string) => void;
  pages?: number;
  copies?: number;
  doubleSided?: boolean | string;
  printCode?: string;       // ← needed to poll real status
  manualProgress?: number;  // ← optional override for testing
  colorMode?: 'color' | 'bw';
  kioskId?: string | null;
}

export {
  calculatePrintProgress,
  calculateMilestoneBounds,
  stepVisualProgress,
  getVisualTickDelay,
  type PrintProgressInput,
  type PrintProgressResult,
  type MilestoneBounds,
} from '../../utils/printProgress';
import { calculatePrintProgress, calculateMilestoneBounds, getVisualTickDelay } from '../../utils/printProgress';

export const PrintingScreen: React.FC<PrintingScreenProps> = ({
  isActive,
  statusTitle,
  statusSub,
  onComplete,
  onError,
  pages = 1,
  copies = 1,
  doubleSided = false,
  printCode,
  manualProgress,
  colorMode = 'bw',
  kioskId,
}) => {
  const isFestiveMode = kioskId === 'CV-001' || (kioskId === 'SV-002' && isFestivalActive());
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
  const sheetsCompletedRef  = useRef(0);   // tracked sheets completed
  const milestoneFloorRef   = useRef(0);   // presentation milestone floor
  const milestoneCeilingRef = useRef(0);   // presentation milestone ceiling
  const activePrintCodeRef  = useRef(printCode);
  const isPollingRef        = useRef(false);
  const tickTimerRef        = useRef<number | null>(null);
  const pollTimerRef        = useRef<number | null>(null);
  const completionTimerRef  = useRef<number | null>(null);
  const isCompletingRef     = useRef(false);
  const stallTimerRef       = useRef<number | null>(null);   // stall detector
  const lastProgressRef     = useRef(0);                    // last recorded progress for stall check
  const startTimeRef        = useRef(Date.now());           // when the print screen was activated
  const lastSuccessfulPollTimeRef = useRef(Date.now());     // when we last successfully polled the backend

  useEffect(() => {
    activePrintCodeRef.current = printCode;
  }, [printCode]);

  const isCompleted = progress >= 100;

  // Print duration budget: mirrors the backend/Pi's own per-sheet timing — the colour inkjet
  // genuinely needs far longer per sheet than the B&W laser (see pi_scripts/firebase_listener.py's
  // own cups_timeout, and pi-listener's per-colour-mode calibration) — plus a 30s buffer so a
  // backend timeout (which triggers an auto-refund) wins the race over this screen giving up first.
  const printTimeoutMs = useMemo(() => {
    const totalSheets = Math.max(1, pages * copies);
    const isColor = colorMode === 'color';
    const baseWarmupSec = 600; // 10 min base warmup/spooling/rendering time
    const secPerPage = isColor ? 360 : 20; // 360s/page colour inkjet, 20s/page B&W laser
    return (baseWarmupSec + totalSheets * secPerPage + 30) * 1000;
  }, [pages, copies, colorMode]);

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
    clearAllTimers();

    // Immediate 100% completion upon physical hardware verification confirmation
    progressRef.current = 100;
    milestoneFloorRef.current = 100;
    milestoneCeilingRef.current = 100;
    setProgress(100);
    setStatusMsg('Print Completed ✅');

    // 400ms celebration hold before transitioning to summary screen
    completionTimerRef.current = window.setTimeout(() => {
      onComplete();
    }, 400);
  }, [clearAllTimers, onComplete]);

  // Smooth visual progress tick: advances gradually towards the milestone ceiling
  const startSmoothTick = useCallback(() => {
    if (tickTimerRef.current) return;

    const tick = () => {
      if (isCompletingRef.current) return;

      const currentProgress = progressRef.current;
      const ceiling = milestoneCeilingRef.current;
      const floor = milestoneFloorRef.current;

      if (currentProgress < floor) {
        progressRef.current = floor;
        setProgress(floor);
      } else if (currentProgress < ceiling) {
        const next = Math.min(ceiling, currentProgress + 1);
        progressRef.current = next;
        setProgress(next);
      }

      const delay = getVisualTickDelay(progressRef.current, colorMode);
      tickTimerRef.current = window.setTimeout(tick, delay);
    };

    const initialDelay = getVisualTickDelay(progressRef.current, colorMode);
    tickTimerRef.current = window.setTimeout(tick, initialDelay);
  }, [colorMode]);

  // ─── polling ───────────────────────────────────────────────────────────────

  const schedulePoll = useCallback((delayMs = 200) => {
    if (!printCode || isDemoPrintCode(printCode) || !isActive) return;

    pollTimerRef.current = window.setTimeout(async () => {
      // Enforce the colour/page-aware print deadline from the start of printing
      if (Date.now() - startTimeRef.current >= printTimeoutMs) {
        if (!isCompletingRef.current) {
          clearAllTimers();
          if (onError) onError('Print timed out. If your document was not printed, please contact support.');
        }
        return;
      }

      if (isPollingRef.current || isCompletingRef.current) return;
      isPollingRef.current = true;

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 5000);

      try {
        const res = await fetch(
          `${BACKEND_URL}/kiosk/job-status?printCode=${encodeURIComponent(printCode)}`,
          { cache: 'no-store', signal: controller.signal }
        );
        window.clearTimeout(timeoutId);
        const data = await res.json();

        // If printCode changed or screen deactivated while in flight, discard response
        if (!isActive || activePrintCodeRef.current !== printCode || isCompletingRef.current) {
          return;
        }

        lastSuccessfulPollTimeRef.current = Date.now();

        const errMsg = data.printerStatus || data.error || (data.status === 'refunded' ? 'Print refunded' : 'Printer reported an error.');
        const result = calculatePrintProgress({
          status: data.status,
          isPrinted: data.isPrinted,
          sheetsCompleted: data.sheetsCompleted,
          totalSheets: data.totalSheets,
          previousProgress: progressRef.current,
          previousSheetsCompleted: sheetsCompletedRef.current,
          pages,
          copies,
          doubleSided,
          errorMsg: errMsg,
        });

        sheetsCompletedRef.current = result.sheetsCompleted;
        milestoneFloorRef.current = result.milestoneFloor;
        milestoneCeilingRef.current = result.milestoneCeiling;

        if (result.isCompleted) {
          setPrintDone(true);
          return;
        }

        if (result.isFailed) {
          setStatusMsg(result.statusMsg);
          clearAllTimers();
          if (onError) onError(result.errorMessage || errMsg);
          return;
        }

        if (result.isPrinting) {
          if (result.progress > progressRef.current) {
            progressRef.current = result.progress;
            setProgress(result.progress);
          }
          setStatusMsg(result.statusMsg);
          startSmoothTick();
        } else {
          setStatusMsg(result.statusMsg);
        }

        schedulePoll(200);
      } catch {
        window.clearTimeout(timeoutId);
        if (isActive && !isCompletingRef.current && activePrintCodeRef.current === printCode) {
          pollTimerRef.current = window.setTimeout(() => schedulePoll(200), 2000);
        }
      } finally {
        isPollingRef.current = false;
      }
    }, delayMs);
  }, [printCode, isActive, pages, copies, doubleSided, onError, clearAllTimers, printTimeoutMs, startSmoothTick]);

  // ─── demo mode fallback (used ONLY when printCode is '0000'/'9999' or missing) ──

  const startDemoTick = useCallback(() => {
    if (manualProgress !== undefined) return;

    const totalSheets = Math.max(1, pages * copies);
    const cap = 100;
    const baseDelay = 150;

    // Start at 1% for active visual feedback
    if (progressRef.current === 0) {
      progressRef.current = 1;
      setProgress(1);
    }

    const tick = () => {
      if (isCompletingRef.current) return;

      const currentProgress = progressRef.current;

      if (currentProgress >= cap) {
        animateTo100AndComplete();
        return;
      }

      const next = Math.min(cap, currentProgress + 1);
      progressRef.current = next;
      setProgress(next);

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

      tickTimerRef.current = window.setTimeout(tick, baseDelay);
    };

    tickTimerRef.current = window.setTimeout(tick, baseDelay);
  }, [pages, copies, manualProgress, animateTo100AndComplete]);

  // ─── main effect ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isActive) {
      clearAllTimers();
      setProgress(0);
      progressRef.current = 0;
      sheetsCompletedRef.current = 0;
      milestoneFloorRef.current = 0;
      milestoneCeilingRef.current = 0;
      isPollingRef.current = false;
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

    // Explicitly start at 0% on screen activation
    setProgress(0);
    progressRef.current = 0;
    sheetsCompletedRef.current = 0;
    milestoneFloorRef.current = 0;
    milestoneCeilingRef.current = 0;
    isPollingRef.current = false;
    isCompletingRef.current = false;
    lastProgressRef.current = 0;
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

    // Handle manualProgress mode vs live polling vs demo mode
    if (manualProgress !== undefined) {
      setProgress(manualProgress);
      progressRef.current = manualProgress;
      if (manualProgress >= 100) {
        animateTo100AndComplete();
      }
    } else if (printCode && !isDemoPrintCode(printCode)) {
      // Initialize in-flight milestone bounds for active printing immediately
      const isDuplex = doubleSided === true || doubleSided === 'double';
      const fallbackSheets = (isDuplex ? Math.ceil(pages / 2) : pages) * copies;
      const initialTotal = Math.max(1, fallbackSheets);
      const initialBounds = calculateMilestoneBounds(0, initialTotal);

      milestoneFloorRef.current = initialBounds.floor;
      milestoneCeilingRef.current = initialBounds.ceiling;
      progressRef.current = initialBounds.floor;
      setProgress(initialBounds.floor);
      setStatusMsg(initialTotal === 1 ? 'Printing document…' : 'Warming up printer…');

      startSmoothTick();
      schedulePoll(200); // Live polling driven by backend sheet progress
    } else {
      startDemoTick(); // Demo mode simulation
    }

    return () => {
      clearInterval(titleInterval);
      clearInterval(subInterval);
      clearAllTimers();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // When Pi confirms done, finish the bar promptly to 100%
  useEffect(() => {
    if (printDone && isActive && !isCompletingRef.current) {
      animateTo100AndComplete(true);
    }
  }, [printDone, isActive, animateTo100AndComplete]);

  // ── Stall & Timeout detector ──────────────────────────────────────────────
  // Fires every 1 second.
  // 1. Print Timeout: colour/page-aware cutoff (printTimeoutMs above) from the moment the print
  //    screen activates — NOT a flat number, so a genuinely slow colour job isn't killed early.
  // 2. Network Stall Check: If no poll response received for > 45 seconds, assume network loss.
  useEffect(() => {
    if (!isActive || !printCode || isDemoPrintCode(printCode)) return;

    const networkStallThresholdMs = 45000; // 45 seconds with no network response

    const checkTimeout = () => {
      if (isCompletingRef.current) return; // already finishing — no action needed

      const elapsedMs = Date.now() - startTimeRef.current;
      const msSinceLastPoll = Date.now() - lastSuccessfulPollTimeRef.current;

      // Enforce the colour/page-aware print deadline from start of printing
      if (elapsedMs >= printTimeoutMs) {
        console.warn(`[PrintingScreen] Print timeout reached (${elapsedMs}ms / ${printTimeoutMs}ms budget). Surfacing error.`);
        clearAllTimers();
        if (onError) {
          onError('Print timed out. Please contact support if your document was not printed.');
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

      stallTimerRef.current = window.setTimeout(checkTimeout, 1000);
    };

    stallTimerRef.current = window.setTimeout(checkTimeout, 1000);

    return () => {
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    };
  }, [isActive, printCode, clearAllTimers, onError, printTimeoutMs]);

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

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div
      className={`screen ${isActive ? 'visible' : ''} flex flex-row items-center justify-center gap-24 overflow-hidden px-24 ${
        isFestiveMode ? 'bg-parchment-100' : 'bg-[#FAFAF8]'
      }`}
      style={{ display: isActive ? 'flex' : 'none' }}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[150px]"
        style={{
          background: isFestiveMode
            ? 'radial-gradient(closest-side, rgba(201,151,62,0.14), transparent)'
            : 'radial-gradient(closest-side, rgba(217,165,68,0.12), transparent)',
        }}
      />

      {isFestiveMode && (
        <>
          <FestiveBackdrop />
          <Toran compact />
          <ZariBorder />
        </>
      )}

      {/* ── Color print: "Collecting your pages" overlay ── */}
      {collectingPages && (
        <div
          className={`absolute inset-0 z-[200] flex flex-col items-center justify-center gap-9 ${
            isFestiveMode ? 'bg-gradient-to-br from-parchment-100 to-parchment-200' : 'bg-gradient-to-br from-white via-[#FAF6EE] to-white'
          }`}
        >
          <div className="relative flex items-center justify-center">
            <div
              className={`flex h-36 w-36 items-center justify-center rounded-full border-2 ${
                isFestiveMode ? 'border-gold-600/40 bg-gold-500/10 text-gold-600' : 'border-gold-500/35 bg-gold-500/10 text-gold-600 shadow-lg'
              }`}
              style={{ animation: 'kiosk-collect-pulse 2s ease-in-out infinite' }}
            >
              <Printer size={64} weight="regular" />
            </div>
          </div>

          <div className="max-w-2xl px-10 text-center">
            <h2 className={`mb-4 text-[50px] font-extrabold leading-tight ${isFestiveMode ? 'text-mahogany-800' : 'text-[#1A1714]'}`}>
              Collecting your pages…
            </h2>
            <p className={`text-[24px] font-medium leading-relaxed ${isFestiveMode ? 'text-mahogany-800/70' : 'text-[#5C544B]'}`}>
              Your color print is being ejected.
              <br />
              <strong className={isFestiveMode ? 'text-mahogany-800' : 'text-[#1A1714]'}>Please wait at the printer</strong> for your document.
            </p>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div
              className={`flex h-[84px] w-[84px] items-center justify-center rounded-full border-4 tabular ${
                isFestiveMode ? 'border-gold-600/30 bg-gold-500/10 text-gold-600' : 'border-gold-500/30 bg-gold-500/10 text-gold-700'
              }`}
            >
              <span className="text-[34px] font-extrabold">{collectCountdown}</span>
            </div>
            <p className={`text-[13px] font-semibold uppercase tracking-[0.2em] ${isFestiveMode ? 'text-mahogany-800/45' : 'text-[#8C8072]'}`}>
              seconds
            </p>
          </div>
        </div>
      )}

      {/* ── Left text card ── */}
      <div
        className={`relative z-10 flex max-w-[720px] flex-1 flex-col items-start gap-6 rounded-[28px] border px-14 py-11 text-left backdrop-blur-xl ${
          isFestiveMode
            ? 'border-gold-600/30 bg-gradient-to-br from-white to-parchment-200 shadow-[0_20px_50px_rgba(74,45,20,0.12)]'
            : 'border-gold-600/25 bg-white/80 shadow-[0_20px_50px_rgba(74,45,20,0.06)]'
        }`}
      >
        <div className="min-h-[170px]">
          <h2 className={`mb-5 text-[64px] font-extrabold leading-[1.06] tracking-tight ${isFestiveMode ? 'text-mahogany-800' : 'text-[#1A1714]'}`}>
            {typedTitle}
          </h2>
          <p className={`mb-4 whitespace-pre-line text-[28px] font-medium leading-snug ${isFestiveMode ? 'text-mahogany-800/70' : 'text-[#5C544B]'}`}>
            {typedSub}
          </p>
          {!isCompleted && (
            <p className={`min-h-[32px] text-[21px] font-bold tracking-wide ${isFestiveMode ? 'text-gold-600' : 'text-gold-700'}`}>
              {statusMsg}
            </p>
          )}
          {isFestiveMode && (
            <div className="mt-7">
              <DiyaRow count={9} size={34} gap={16} litCount={Math.floor((progress * 9) / 100)} />
            </div>
          )}
        </div>
      </div>

      {/* ── Right: circular progress ── */}
      <div className="relative z-10 flex items-center justify-center">
        <div className="relative flex h-[380px] w-[380px] items-center justify-center">
          {isFestiveMode && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.22]">
              <Mandala size={540} />
            </div>
          )}
          <div
            className="pointer-events-none absolute h-[300px] w-[300px] rounded-full blur-[70px] transition-opacity duration-300"
            style={{
              background: isFestiveMode ? 'var(--color-mahogany-600)' : 'var(--color-gold-500)',
              opacity: 0.1 + (progress / 100) * 0.2,
            }}
          />

          {isActive && progress < 100 && (
            <>
              <span
                className={`pointer-events-none absolute inset-[45px] rounded-full border-2 ${
                  isFestiveMode ? 'border-gold-600/40' : 'border-gold-500/30'
                }`}
                style={{ animation: 'kiosk-pulse-ring 3s cubic-bezier(0.2,0.6,0.3,1) infinite' }}
              />
              <span
                className={`pointer-events-none absolute inset-[45px] rounded-full border-2 ${
                  isFestiveMode ? 'border-gold-600/20' : 'border-gold-500/15'
                }`}
                style={{ animation: 'kiosk-pulse-ring 3s cubic-bezier(0.2,0.6,0.3,1) infinite 1.5s' }}
              />
            </>
          )}

          <svg width="380" height="380" style={{ position: 'absolute', zIndex: 2, overflow: 'visible' }}>
            <defs>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={isFestiveMode ? '#F5D061' : '#FFD97D'} />
                <stop offset="50%" stopColor={isFestiveMode ? '#D4973E' : '#E8B86D'} />
                <stop offset="100%" stopColor={isFestiveMode ? '#8E5D24' : '#C8860A'} />
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

            {/* Slow outer dashed ring */}
            <g style={{ transformOrigin: 'center', animation: isActive ? 'kiosk-spin-slow 26s linear infinite' : 'none' }}>
              <circle cx="190" cy="190" r="172" fill="transparent" stroke={isFestiveMode ? 'rgba(180,123,55,0.18)' : 'rgba(200,134,10,0.20)'} strokeWidth="2" strokeDasharray="10 16" />
            </g>

            {/* Static background track */}
            <circle cx="190" cy="190" r={radius} fill="transparent" stroke={isFestiveMode ? 'rgba(180,123,55,0.15)' : 'rgba(200,134,10,0.12)'} strokeWidth="10" />

            {/* Center percentage */}
            <text x="190" y="196" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              <tspan
                fontSize="92px"
                fontWeight="800"
                fill={isFestiveMode ? '#3C2113' : '#1A1714'}
                letterSpacing="-2px"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {progress}
              </tspan>
              <tspan fontSize="32px" fontWeight="700" fill={isFestiveMode ? '#b47b37' : '#C8860A'} dx="4">%</tspan>
            </text>

            <g style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}>
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
              <circle
                cx="190" cy="190" r={radius}
                fill="transparent"
                stroke="#ffffff"
                strokeWidth="3"
                strokeDasharray={progress === 100 ? 'none' : circumference}
                strokeDashoffset={progress === 100 ? 0 : strokeDashoffset}
                strokeLinecap="round"
                opacity="0.75"
                style={{ transition: 'stroke-dashoffset 0.18s linear' }}
              />
            </g>

            {cometTailPoints.map(pt => (
              <circle
                key={pt.key}
                cx={pt.x}
                cy={pt.y}
                r={Math.max(0.5, pt.r)}
                fill={pt.key === 0 ? '#ffffff' : isFestiveMode ? '#b47b37' : '#E8B86D'}
                opacity={pt.opacity * (pt.key === 0 ? 1 : 0.65)}
                filter={pt.key <= 2 ? 'url(#cometGlow)' : undefined}
                style={{ transition: 'cx 0.14s linear, cy 0.14s linear' }}
              />
            ))}
          </svg>
        </div>
      </div>

      <style>{`
        @keyframes kiosk-spin-slow {
          100% { transform: rotate(360deg); }
        }
        @keyframes kiosk-pulse-ring {
          0%   { transform: scale(0.85); opacity: 0; }
          50%  { opacity: 0.8; }
          100% { transform: scale(1.4);  opacity: 0; }
        }
        @keyframes kiosk-collect-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(217,165,68,0.35); }
          50%      { box-shadow: 0 0 0 30px rgba(217,165,68,0); }
        }
      `}</style>
    </div>
  );
};
