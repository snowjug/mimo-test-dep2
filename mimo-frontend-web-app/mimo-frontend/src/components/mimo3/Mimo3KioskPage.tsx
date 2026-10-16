import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WarningCircle, Info, X, Wrench, WifiSlash } from '@phosphor-icons/react';
import { Mimo3Screensaver } from './Mimo3Screensaver';
import { Mimo3MainScreen } from './Mimo3MainScreen';
import { Mimo3CodeEntry } from './Mimo3CodeEntry';
import { Mimo3PrintingScreen } from './Mimo3PrintingScreen';
import { Mimo3SummaryScreen } from './Mimo3SummaryScreen';
import { Mimo3ErrorScreen } from './Mimo3ErrorScreen';

export type Mimo3ScreenState =
  | 'main-interface'
  | 'code-entry-screen'
  | 'printing-screen'
  | 'summary-screen'
  | 'system-error-screen';

interface JobData {
  userName: string;
  fileName: string;
  pages: number;
  copies: number;
  mode: string;
}

interface Mimo3KioskPageProps {
  kioskId?: string | null;
}

const BACKEND_URL = 'https://api-upqxuj7evq-uc.a.run.app';

/**
 * Synthesizes a crisp, subtle mechanical click sound via Web Audio API.
 * Provides instant tactile feedback on physical capacitive touchscreens.
 */
function playTactileClick() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.02);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.02);
  } catch {
    // Graceful fallback if audio context is blocked
  }
}

export const Mimo3KioskPage: React.FC<Mimo3KioskPageProps> = ({ kioskId = 'SV-003' }) => {
  const activeKioskId = kioskId || 'SV-003';

  // Navigation & Screen State
  const [currentScreen, setCurrentScreen] = useState<Mimo3ScreenState>('main-interface');
  const [showScreensaver, setShowScreensaver] = useState(true);
  const [code, setCode] = useState('');
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [printStatus, setPrintStatus] = useState<'idle' | 'printing' | 'completed'>('idle');
  const [printError, setPrintError] = useState<string | undefined>(undefined);
  const [showRefundBanner, setShowRefundBanner] = useState(false);

  // Network & System Health
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const omTapRef = useRef(0);

  // Toast State
  const [toastMsg, setToastMsg] = useState('');
  const [toastError, setToastError] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  // Idle timer settings
  const idleTimeoutSec = 60;
  const isSubmittingRef = useRef(false);

  // Show Toast helper
  const showToast = useCallback((msg: string, isErr: boolean = false) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMsg(msg);
    setToastError(isErr);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMsg('');
      toastTimerRef.current = null;
    }, 3500);
  }, []);

  // Online / Offline listener
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('Kiosk reconnected to print server.');
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('Network disconnected. Operating in local mode.', true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showToast]);

  useEffect(() => {
    (window as any).__TRIGGER_MIMO3_SCREENSAVER = () => setShowScreensaver(true);
    (window as any).__HIDE_MIMO3_SCREENSAVER = () => setShowScreensaver(false);
  }, []);

  // Global Idle Reset & Screensaver Activation
  useEffect(() => {
    let idleTimer: number;

    const onUserActivity = () => {
      clearTimeout(idleTimer);

      if (currentScreen === 'code-entry-screen' && !isSubmittingRef.current) {
        // Return to main screen after 20s of inactivity on keypad
        idleTimer = window.setTimeout(() => {
          setCurrentScreen('main-interface');
          setCode('');
        }, 20000);
      } else if (currentScreen === 'main-interface' && !showScreensaver) {
        // Activate screensaver after 60s of inactivity on home screen
        idleTimer = window.setTimeout(() => {
          setShowScreensaver(true);
        }, idleTimeoutSec * 1000);
      }
    };

    window.addEventListener('mousemove', onUserActivity);
    window.addEventListener('touchstart', onUserActivity);
    window.addEventListener('click', onUserActivity);
    window.addEventListener('keydown', onUserActivity);

    onUserActivity();

    return () => {
      clearTimeout(idleTimer);
      window.removeEventListener('mousemove', onUserActivity);
      window.removeEventListener('touchstart', onUserActivity);
      window.removeEventListener('click', onUserActivity);
      window.removeEventListener('keydown', onUserActivity);
    };
  }, [currentScreen, showScreensaver, idleTimeoutSec]);

  // Global Physical Keyboard Support (for debugging & accessibility)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showScreensaver) {
        setShowScreensaver(false);
        return;
      }

      if (currentScreen === 'code-entry-screen') {
        if (e.key >= '0' && e.key <= '9') {
          playTactileClick();
          setCode((prev) => (prev.length < 4 ? prev + e.key : prev));
        } else if (e.key === 'Backspace') {
          playTactileClick();
          setCode((prev) => prev.slice(0, -1));
        } else if (e.key === 'Escape') {
          handleReset();
        }
      } else if (currentScreen === 'main-interface' && (e.key === 'Enter' || e.key === ' ')) {
        playTactileClick();
        setCurrentScreen('code-entry-screen');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentScreen, showScreensaver]);

  // Reset to Clean Main State
  const handleReset = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setCode('');
    setJobData(null);
    setPrintStatus('idle');
    setPrintError(undefined);
    setShowRefundBanner(false);
    setCurrentScreen('main-interface');
  }, []);

  // Staff / Technician 5-Tap Diagnostic Access
  const handleOmTap = () => {
    playTactileClick();
    omTapRef.current += 1;
    if (omTapRef.current >= 5) {
      omTapRef.current = 0;
      setShowDiagnostics(true);
    }
  };

  // Code Validation & Print Dispatch
  const handleValidationSuccess = useCallback(async () => {
    isSubmittingRef.current = true;
    try {
      let data: any;

      if (code === '0000') {
        // Safe Client-Side Simulation: Black & White Document
        data = {
          userName: 'Demo Student',
          documents: [
            {
              file: 'assignment_final_v2.pdf',
              pages: 3,
              copies: 1,
              colorMode: 'Black & White',
            },
          ],
        };
      } else if (code === '9999') {
        // Safe Client-Side Simulation: Full Color Document
        data = {
          userName: 'Staff Member',
          documents: [
            {
              file: 'presentation_color_deck.pdf',
              pages: 2,
              copies: 1,
              colorMode: 'Full Color',
            },
          ],
        };
      } else {
        // Real Cloud Run Backend Verification
        const res = await fetch(`${BACKEND_URL}/get-documents-by-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ printCode: code, kioskId: activeKioskId }),
        });

        data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Invalid 4-digit code. Please verify and try again.');
        }

        // Trigger safe print enqueue
        try {
          const printRes = await fetch(`${BACKEND_URL}/kiosk/print`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ printCode: code, kioskId: activeKioskId }),
          });
          const printData = await printRes.json();
          if (!printRes.ok && printData.error) {
            if (
              printData.error.toLowerCase().includes('not working') ||
              printData.error.toLowerCase().includes('offline')
            ) {
              setPrintError(printData.error);
              setCurrentScreen('system-error-screen');
              return;
            }
          }
        } catch (err: any) {
          console.warn('Print trigger network warning:', err.message);
        }
      }

      const doc =
        data.documents && data.documents[0]
          ? data.documents[0]
          : { file: data.fileName || 'Document', pages: data.pageCount || 1, copies: 1 };

      setJobData({
        userName: data.userName || data.name || 'Customer',
        fileName: doc.file || doc.fileName || 'Document',
        pages: doc.pages || doc.pageCount || 1,
        copies: doc.copies || 1,
        mode: doc.colorMode || data.colorMode || 'Black & White',
      });

      setPrintStatus('printing');
      setCurrentScreen('printing-screen');
    } catch (err: any) {
      setCurrentScreen('code-entry-screen');
      showToast(err.message || 'Invalid Code - Access Denied', true);
      setTimeout(() => setCode(''), 600);
      throw err;
    } finally {
      isSubmittingRef.current = false;
    }
  }, [code, activeKioskId, showToast]);

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-gradient-to-br from-[#FAFAF9] via-[#F8FAFC] to-[#F1F5F9] font-sans text-[#0F172A]">
      {/* ================= TOAST NOTIFICATION ================= */}
      {toastMsg && (
        <div
          className={`fixed left-1/2 top-9 z-[1000] flex -translate-x-1/2 items-center gap-4 rounded-2xl border px-7 py-4 shadow-xl backdrop-blur-xl transition-all ${
            toastError
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-[#FDE68A] bg-white text-[#0F172A]'
          }`}
        >
          {toastError ? (
            <WarningCircle size={22} weight="fill" className="text-red-500" />
          ) : (
            <Info size={22} weight="fill" className="text-[#EA580C]" />
          )}
          <span className="text-[17px] font-semibold">{toastMsg}</span>
          <button
            onClick={() => setToastMsg('')}
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
      )}

      {/* ================= OFFLINE WARNING BANNER ================= */}
      {!isOnline && (
        <div className="fixed top-0 inset-x-0 z-[998] flex items-center justify-center gap-3 bg-amber-100 py-2 text-[14px] font-bold text-amber-900 border-b border-amber-200 shadow-sm">
          <WifiSlash size={18} weight="bold" />
          <span>Campus Network Offline • Local Spooler &amp; Demo Self-Tests Active</span>
        </div>
      )}

      {/* ================= STEP 1: IDLE SCREENSAVER ================= */}
      <Mimo3Screensaver
        isActive={showScreensaver}
        onTap={() => {
          playTactileClick();
          setShowScreensaver(false);
        }}
        kioskId={activeKioskId}
      />

      {/* ================= STEP 2: MAIN WELCOME SCREEN ================= */}
      <Mimo3MainScreen
        isActive={currentScreen === 'main-interface'}
        onNext={() => {
          playTactileClick();
          setCurrentScreen('code-entry-screen');
        }}
        kioskId={activeKioskId}
        onOmTap={handleOmTap}
        onOpenScreensaver={() => {
          playTactileClick();
          setShowScreensaver(true);
        }}
        isOnline={isOnline}
      />

      {/* ================= STEP 3: CODE ENTRY SCREEN ================= */}
      <Mimo3CodeEntry
        isActive={currentScreen === 'code-entry-screen'}
        code={code}
        setCode={setCode}
        onSuccess={handleValidationSuccess}
        onBack={() => {
          playTactileClick();
          handleReset();
        }}
        hasError={toastError && currentScreen === 'code-entry-screen'}
        kioskId={activeKioskId}
      />

      {/* ================= STEP 4: PRINT PROGRESS SCREEN ================= */}
      <Mimo3PrintingScreen
        isActive={currentScreen === 'printing-screen'}
        statusTitle={
          printStatus === 'completed'
            ? 'Print Completed ✅'
            : jobData && jobData.userName
            ? `Hello ${jobData.userName.split(' ')[0]}..!`
            : 'Printing in Progress'
        }
        pages={jobData?.pages || 1}
        copies={jobData?.copies || 1}
        printCode={code}
        colorMode={jobData?.mode?.toLowerCase().match(/color|colour/) ? 'color' : 'bw'}
        kioskId={activeKioskId}
        onComplete={() => {
          setPrintStatus('completed');
          setCurrentScreen('summary-screen');
        }}
        onError={(errMsg?: string) => {
          setPrintStatus('idle');
          setCode('');
          const isRefundCase = !!(
            errMsg &&
            (errMsg.toLowerCase().includes('refund') ||
              errMsg.toLowerCase().includes('timed out') ||
              errMsg.toLowerCase().includes('timeout') ||
              errMsg.toLowerCase().includes('charged'))
          );
          setPrintError(errMsg || 'Something went wrong while printing your document.');
          setShowRefundBanner(isRefundCase);
          setCurrentScreen('system-error-screen');
        }}
      />

      {/* ================= STEP 5: OUTPUT SUMMARY SCREEN ================= */}
      <Mimo3SummaryScreen
        isActive={currentScreen === 'summary-screen'}
        onReset={() => {
          playTactileClick();
          handleReset();
        }}
        jobData={jobData}
        kioskId={activeKioskId}
        printCode={code}
      />

      {/* ================= ERROR & GUARDED REFUND SCREEN ================= */}
      <Mimo3ErrorScreen
        isActive={currentScreen === 'system-error-screen'}
        jobData={jobData}
        onReset={() => {
          playTactileClick();
          handleReset();
        }}
        onRetry={() => {
          playTactileClick();
          setCurrentScreen('code-entry-screen');
        }}
        errorMsg={printError}
        showRefundBanner={showRefundBanner}
        kioskId={activeKioskId}
      />

      {/* ================= SECRET DIAGNOSTIC MODAL TRIGGER ================= */}
      {/* Tapping the top-left corner 5 times triggers the technician diagnostic overlay */}
      <div
        onClick={handleOmTap}
        aria-hidden="true"
        className="fixed top-0 left-0 h-24 w-32 z-[990] cursor-pointer opacity-0"
        title="Diagnostic Hotspot"
      />

      {/* ================= TECHNICIAN DIAGNOSTIC MODAL ================= */}
      {showDiagnostics && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/50 backdrop-blur-md p-8">
          <div className="relative w-full max-w-[680px] rounded-[32px] border border-[#E2E8F0] bg-white p-8 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
              <div className="flex items-center gap-3">
                <Wrench size={26} className="text-[#EA580C]" />
                <h3 className="text-[22px] font-black tracking-wide text-[#0F172A]">
                  MIMO 3.0 Hardware Diagnostics
                </h3>
              </div>
              <button
                id="diag-close-btn"
                onClick={() => setShowDiagnostics(false)}
                className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"
              >
                <X size={20} />
              </button>
            </div>

            <div className="my-6 space-y-3 text-[15px]">
              <div className="flex justify-between rounded-xl border border-[#E2E8F0] bg-[#FAFAF9] px-4 py-2.5">
                <span className="text-[#64748B]">Appliance Identifier:</span>
                <strong className="text-[#EA580C]">{activeKioskId}</strong>
              </div>
              <div className="flex justify-between rounded-xl border border-[#E2E8F0] bg-[#FAFAF9] px-4 py-2.5">
                <span className="text-[#64748B]">Network Status:</span>
                <strong className={isOnline ? 'text-emerald-600' : 'text-red-500'}>
                  {isOnline ? 'Online (Connected)' : 'Offline'}
                </strong>
              </div>
              <div className="flex justify-between rounded-xl border border-[#E2E8F0] bg-[#FAFAF9] px-4 py-2.5">
                <span className="text-[#64748B]">Current Screen State:</span>
                <strong className="text-[#0F172A]">{currentScreen}</strong>
              </div>
              <div className="flex justify-between rounded-xl border border-[#E2E8F0] bg-[#FAFAF9] px-4 py-2.5">
                <span className="text-[#64748B]">Target Architecture:</span>
                <strong className="text-[#0F172A]">Raspberry Pi 5 (Debian 13 Trixie) • Cage Kiosk</strong>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => {
                  setShowDiagnostics(false);
                  setCode('0000');
                  handleValidationSuccess();
                }}
                className="rounded-xl border border-[#FDE68A] bg-[#FFFDF7] py-3 text-[14px] font-bold text-[#B45309] hover:bg-[#FEF3C7]"
              >
                Test B&amp;W Simulation (0000)
              </button>
              <button
                onClick={() => {
                  setShowDiagnostics(false);
                  setCode('9999');
                  handleValidationSuccess();
                }}
                className="rounded-xl border border-[#FDE68A] bg-[#FFFDF7] py-3 text-[14px] font-bold text-[#B45309] hover:bg-[#FEF3C7]"
              >
                Test Color Simulation (9999)
              </button>
              <button
                id="diag-force-screensaver-btn"
                onClick={() => {
                  setShowDiagnostics(false);
                  setShowScreensaver(true);
                }}
                className="rounded-xl border border-[#E2E8F0] bg-[#FAFAF9] py-3 text-[14px] font-bold text-[#0F172A] hover:bg-slate-100"
              >
                Force Idle Screensaver
              </button>
              <button
                onClick={() => {
                  setShowDiagnostics(false);
                  setPrintError('CUPS paper jam simulation (Diagnostic Test)');
                  setShowRefundBanner(true);
                  setCurrentScreen('system-error-screen');
                }}
                className="rounded-xl border border-red-200 bg-red-50 py-3 text-[14px] font-bold text-red-600 hover:bg-red-100"
              >
                Test Error Screen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
