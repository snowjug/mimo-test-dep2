import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Printer } from '@phosphor-icons/react';
import { isFestivalActive } from '../../config/festivalConfig';
import { DiyaRow, FestiveBackdrop, Mandala, ZariBorder } from '../festive/NavaratriDecor';


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
  getVisualTickDelay,
  stepVisualProgress,
  verifiedPercent,
  type MilestoneBounds,
  type PrintProgressInput,
  type PrintProgressResult,
} from '../../utils/printProgress';
import {
  calculatePrintProgress,
  calculateMilestoneBounds,
  getVisualTickDelay,
} from '../../utils/printProgress';

// /kiosk/print moves the job to "printing" before it answers, so a job still "paid" this long after the
// printing screen opened was never started (the print request was lost or refused): say so, don't keep waiting.
const PRINT_START_GRACE_MS = 20000;
const PI_PICKUP_FALLBACK_TIMEOUT_MS = 65000; // 60s backend window + 5s slack so backend DB transition wins first

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
  const isFestiveMode = kioskId === 'CV-001' || kioskId === 'SV-002' || isFestivalActive();
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
  const milestoneFloorRef   = useRef(0);   // current milestone floor
  const milestoneCeilingRef = useRef(0);   // current milestone ceiling
  const sheetsCompletedRef  = useRef(0);   // verified sheets completed (from the printer's page counter)
  const hasStartedRef       = useRef(false); // backend has reported the job as printing at least once
  const piReachedRef        = useRef(false); // true once Pi confirms pickup (piReceivedAt / sentToPrinterAt / sheet)
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

    // 800ms celebration hold before transitioning to summary screen
    completionTimerRef.current = window.setTimeout(() => {
      onComplete();
    }, 800);
  }, [clearAllTimers, onComplete]);

  // Smooth visual progress tick: advances gradually towards the milestone ceiling
  const startSmoothTick = useCallback(() => {
    if (tickTimerRef.current) return;

    const isDuplex = doubleSided === true || doubleSided === 'double';
    const totalSheets = Math.max(1, (isDuplex ? Math.ceil(pages / 2) : pages) * copies);

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

      const delay = cv001TickMs ?? getVisualTickDelay(progressRef.current, colorMode, totalSheets);
      tickTimerRef.current = window.setTimeout(tick, delay);
    };

    // CV-001's Brother reports its page count only when the whole job has finished (listener log:
    // "page counter moved N" at completion), so per-sheet milestones would park the bar and then jump.
    // Pace it to real CV-001 job durations instead (Pi receives job -> physical finish, 2026-11-25 logs:
    // 1 sheet 26-28 s, 3 sheets 26 s, 4-6 sheets 34-35 s, 9 sheets 34 s, 12 sheets 43 s => ~22 s + 1.8 s/sheet).
    const cv001TickMs = kioskId === 'CV-001' ? Math.round(((27 + 1.8 * totalSheets) * 1000) / 95) : null; // +5 s: the screen starts ~4-5 s before the Pi receives the job (real test print 2026-11-26: 2 sheets, screen start -> physical finish 37 s)
    const initialDelay = cv001TickMs ?? getVisualTickDelay(progressRef.current, colorMode, totalSheets);
    tickTimerRef.current = window.setTimeout(tick, initialDelay);
  }, [colorMode, pages, copies, doubleSided, kioskId]);

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
        const data = await res.json().catch(() => ({}));

        // If printCode changed or screen deactivated while in flight, discard response
        if (!isActive || activePrintCodeRef.current !== printCode || isCompletingRef.current) {
          return;
        }

        // A non-2xx answer (rate limit, server error) carries no job state: keep the last verified progress and
        // retry; the 45s network-stall detector below still applies because this is not a successful poll.
        if (!res.ok) {
          const retryAfterSec = Number(res.headers.get('Retry-After'));
          schedulePoll(res.status === 429 && retryAfterSec > 0 ? retryAfterSec * 1000 : 1000);
          return;
        }

        lastSuccessfulPollTimeRef.current = Date.now();
        if (
          data.piReceivedAt ||
          data.sentToPrinterAt ||
          Number(data.sheetsCompleted) > 0 ||
          data.status === 'completed' ||
          data.isPrinted === true
        ) {
          piReachedRef.current = true;
        }

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
          piReceivedAt: data.piReceivedAt,
          sentToPrinterAt: data.sentToPrinterAt,
          colorMode,
        });

        sheetsCompletedRef.current = result.sheetsCompleted;
        milestoneFloorRef.current = result.milestoneFloor;
        // CV-001: time-paced up to 95% (see startSmoothTick); real stages/sheets still raise the floor.
        milestoneCeilingRef.current = kioskId === 'CV-001' && !result.isCompleted
          ? Math.max(result.milestoneFloor, 95)
          : result.milestoneCeiling;

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

        if (result.isPrinting || data.piReceivedAt || data.sentToPrinterAt) {
          hasStartedRef.current = true;
          if (result.progress > progressRef.current) {
            progressRef.current = result.progress;
            setProgress(result.progress);
          }
          startSmoothTick();
        } else if (
          result.isWaiting && data.status === 'paid' && !hasStartedRef.current &&
          Date.now() - startTimeRef.current >= PRINT_START_GRACE_MS
        ) {
          clearAllTimers();
          if (onError) onError('Your print could not be started. Your code has not been used — please enter it again.');
          return;
        }
        setStatusMsg(result.statusMsg);

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
  }, [printCode, isActive, pages, copies, doubleSided, onError, clearAllTimers, printTimeoutMs, colorMode, startSmoothTick, kioskId]);

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
      milestoneFloorRef.current = 0;
      milestoneCeilingRef.current = 0;
      sheetsCompletedRef.current = 0;
      hasStartedRef.current = false;
      piReachedRef.current = false;
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

    // Reset progress tracking on screen activation
    setProgress(0);
    progressRef.current = 0;
    milestoneFloorRef.current = 0;
    milestoneCeilingRef.current = 0;
    sheetsCompletedRef.current = 0;
    hasStartedRef.current = false;
    piReachedRef.current = false;
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
      // Live job: start smoothly at 1% for active visual feedback
      const isDuplex = doubleSided === true || doubleSided === 'double';
      const totalSheets = Math.max(1, (isDuplex ? Math.ceil(pages / 2) : pages) * copies);
      const initialBounds = calculateMilestoneBounds(0, totalSheets, colorMode);

      progressRef.current = 1;
      milestoneFloorRef.current = initialBounds.floor;
      milestoneCeilingRef.current = initialBounds.ceiling;
      setProgress(1);

      setStatusMsg('Sending your document to the printer…');
      startSmoothTick();
      schedulePoll(0);
    } else if (isDemoPrintCode(printCode)) {
      startDemoTick(); // Demo mode simulation ('0000' / '9999' only — never for a missing code)
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

      // Fail within ~60s if the Pi never reached/picked up the job
      if (!piReachedRef.current && elapsedMs >= PI_PICKUP_FALLBACK_TIMEOUT_MS) {
        console.warn(`[PrintingScreen] Pi did not reach job within ${elapsedMs}ms. Surfacing error.`);
        clearAllTimers();
        if (onError) {
          onError('Print job failed: Pi is not able to reach the job (timeout after 60s).');
        }
        return;
      }

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

  if (kioskId === 'CV-001') {
    if (!isActive) return null;

    // Same text production shows: statusMsg on the left, printer-verified sheet count in the ring.
    const dynamicSheetText = progress >= 100
      ? 'Ready to collect'
      : `Sheet ${sheetsCompletedRef.current + 1} of ${Math.max(1, pages * copies)}`;
    const leftStatusText = isCompleted ? '' : statusMsg;

    // Geometry of Circular Progress Indicator:
    // Center: (1132, 402), Radius: 141px, Stroke: 20px
    const arcRadius = 141;
    const arcCircumference = 2 * Math.PI * arcRadius;
    const arcOffset = arcCircumference - (progress / 100) * arcCircumference;

    // Angle of knob at tip of progress arc (starts at 12 o'clock / -90 deg)
    const knobAngleRad = (-90 + (progress / 100) * 360) * (Math.PI / 180);
    const knobX = 190 + arcRadius * Math.cos(knobAngleRad);
    const knobY = 190 + arcRadius * Math.sin(knobAngleRad);

    return (
      <div
        className="screen visible mimo1-printing-screen absolute left-1/2 top-1/2 h-[810px] w-[1440px] -translate-x-1/2 -translate-y-1/2 select-none overflow-hidden"
        style={{
          display: 'block',
          backgroundImage: 'url(/mimo1-golden-bg.png)',
          backgroundSize: '100% 100%',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundColor: '#FAF5EE',
        }}
      >
        {/* Left Side: Frosted Glass Progress Card */}
        <div
          className="absolute flex flex-col select-none"
          style={{
            left: '148px',
            top: '268px',
            width: '710px',
            height: '292px',
            padding: '46px 54px',
            borderRadius: '32px',
            background:
              'linear-gradient(180deg, rgba(255, 255, 255, 0.94) 0%, rgba(252, 248, 242, 0.86) 100%)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1.5px solid rgba(255, 255, 255, 0.95)',
            boxShadow:
              '0 18px 45px rgba(180, 140, 90, 0.14), 0 2px 6px rgba(0, 0, 0, 0.03), inset 0 2px 4px rgba(255, 255, 255, 0.95)',
            zIndex: 10,
          }}
        >
          {/* Greeting / Title */}
          <h1
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: '54px',
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: '-0.025em',
              color: '#151515',
              margin: 0,
            }}
          >
            {typedTitle || finalTitle}
          </h1>

          {/* Subtext */}
          <p
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: '22px',
              fontWeight: 500,
              lineHeight: 1.45,
              color: '#726A61',
              margin: 0,
              marginTop: '14px',
              whiteSpace: 'pre-line',
            }}
          >
            {typedSub || finalSub}
          </p>

          {/* Gold Dynamic Status Text */}
          <p
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: '22px',
              fontWeight: 700,
              lineHeight: 1.3,
              color: '#B88344',
              margin: 0,
              marginTop: '16px',
            }}
          >
            {leftStatusText}
          </p>
        </div>

        {/* Right Side: Circular Progress Indicator & Disc */}
        <div
          className="absolute flex items-center justify-center select-none"
          style={{
            left: '942px',
            top: '206px',
            width: '380px',
            height: '380px',
            borderRadius: '50%',
            background:
              'linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(250, 245, 238, 0.88) 100%)',
            boxShadow:
              '0 20px 50px rgba(180, 140, 90, 0.16), 0 2px 8px rgba(0, 0, 0, 0.03), inset 0 2px 5px rgba(255, 255, 255, 1)',
            border: '1.5px solid rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            zIndex: 10,
          }}
        >
          {/* SVG Progress Rings */}
          <svg
            width="380"
            height="380"
            viewBox="0 0 380 380"
            className="absolute inset-0 pointer-events-none"
          >
            <defs>
              {/* Soft Champagne-Gold Gradient matching luminous background light streaks */}
              <linearGradient id="mimo1ProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFF5E3" />
                <stop offset="25%" stopColor="#F7DFB2" />
                <stop offset="65%" stopColor="#E8BE68" />
                <stop offset="100%" stopColor="#D8A440" />
              </linearGradient>

              {/* Luminous Champagne-Gold Metallic Knob Gradient */}
              <radialGradient id="mimo1KnobGradient" cx="35%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#FFF8EB" />
                <stop offset="45%" stopColor="#F3D59B" />
                <stop offset="100%" stopColor="#D8A546" />
              </radialGradient>
            </defs>

            {/* Inner subtle dotted guide ring */}
            <circle
              cx="190"
              cy="190"
              r="118"
              fill="none"
              stroke="rgba(190, 160, 130, 0.3)"
              strokeWidth="1.5"
              strokeDasharray="4 6"
            />

            {/* Background circular track: Neutral Ivory */}
            <circle
              cx="190"
              cy="190"
              r={arcRadius}
              fill="none"
              stroke="rgba(226, 215, 200, 0.45)"
              strokeWidth="20"
            />

            {/* Dynamic Progress Arc: Soft Champagne Gold */}
            <circle
              cx="190"
              cy="190"
              r={arcRadius}
              fill="none"
              stroke="url(#mimo1ProgressGradient)"
              strokeWidth="20"
              strokeDasharray={arcCircumference}
              strokeDashoffset={progress >= 100 ? 0 : arcOffset}
              strokeLinecap="round"
              transform="rotate(-90 190 190)"
              style={{
                transition: 'stroke-dashoffset 0.18s linear',
                filter: 'drop-shadow(0 2px 10px rgba(220, 168, 70, 0.40)) drop-shadow(0 0 6px rgba(255, 230, 160, 0.35))',
              }}
            />

            {/* Knob at leading tip of progress arc: Warm Metallic Gold with Soft Glow */}
            {progress > 0 && progress < 100 && (
              <circle
                cx={knobX}
                cy={knobY}
                r="10"
                fill="url(#mimo1KnobGradient)"
                stroke="#FFFFFF"
                strokeWidth="2.5"
                style={{
                  filter: 'drop-shadow(0 2px 6px rgba(215, 160, 50, 0.50)) drop-shadow(0 0 4px rgba(255, 235, 180, 0.45))',
                  transition: 'cx 0.18s linear, cy 0.18s linear',
                }}
              />
            )}
          </svg>

          {/* Central Percentage and Sheet Status Readout */}
          <div className="relative flex flex-col items-center justify-center text-center select-none" style={{ zIndex: 5 }}>
            <div
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: '76px',
                fontWeight: 800,
                letterSpacing: '-0.025em',
                lineHeight: 1,
                color: '#151515',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {progress}%
            </div>
            <div
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: '17px',
                fontWeight: 500,
                color: '#6E5A4B',
                lineHeight: 1.2,
                marginTop: '10px',
                letterSpacing: '-0.01em',
              }}
            >
              {dynamicSheetText}
            </div>
          </div>
        </div>

        {/* Color print: "Collecting your pages" overlay */}
        {collectingPages && (
          <div className="absolute inset-0 z-[200] flex flex-col items-center justify-center gap-9 bg-[#FAF4E8]/95 backdrop-blur-2xl">
            <div className="relative flex items-center justify-center">
              <div
                className="flex h-36 w-36 items-center justify-center rounded-full border-2 border-[#D4AF37]/50 bg-white/90 text-[#A37524] shadow-[0_12px_32px_rgba(212,175,55,0.25)]"
                style={{ animation: 'kiosk-collect-pulse 2s ease-in-out infinite' }}
              >
                <Printer size={64} weight="regular" />
              </div>
            </div>

            <div className="max-w-2xl px-10 text-center">
              <h2 className="mb-4 font-sans text-[42px] font-bold leading-tight text-[#2D1E12]">
                Collecting your pages…
              </h2>
              <p className="text-[20px] font-medium leading-relaxed text-[#6E5A4B]">
                Your color print is being ejected.
                <br />
                <strong className="text-[#2D1E12]">Please wait at the printer</strong> for your document.
              </p>
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="flex h-[80px] w-[80px] items-center justify-center rounded-full border-4 border-[#D4AF37]/50 bg-white shadow-md tabular">
                <span className="font-sans text-[32px] font-extrabold text-[#7D1120]">{collectCountdown}</span>
              </div>
              <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[#9A6D24]">
                seconds
              </p>
            </div>
          </div>
        )}

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
            0%, 100% { box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.40); }
            50%      { box-shadow: 0 0 0 30px rgba(212, 175, 55, 0); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div
      className={`screen ${isActive ? 'visible' : ''} flex flex-row items-center justify-between gap-12 lg:gap-16 xl:gap-24 overflow-hidden px-14 lg:px-20 xl:px-24 w-full h-full ${
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
        className={`relative z-10 flex flex-1 max-w-[780px] xl:max-w-[840px] flex-col items-start gap-6 rounded-[28px] border px-12 lg:px-14 py-11 text-left backdrop-blur-xl ${
          isFestiveMode
            ? 'border-gold-600/30 bg-gradient-to-br from-white to-parchment-200 shadow-[0_20px_50px_rgba(74,45,20,0.12)]'
            : 'border-gold-600/25 bg-white/80 shadow-[0_20px_50px_rgba(74,45,20,0.06)]'
        }`}
      >
        <div className="min-h-[170px] w-full">
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
      <div className="relative z-10 flex shrink-0 items-center justify-center pr-2 lg:pr-6 xl:pr-10">
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
