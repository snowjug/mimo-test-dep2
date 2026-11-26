import { useState, useCallback, useRef, useEffect } from 'react';
import { WarningCircle, Info, X } from '@phosphor-icons/react';
import { MainScreen } from './components/screens/MainScreen';
import { CodeEntryScreen } from './components/screens/CodeEntryScreen';
import { PrintingScreen } from './components/screens/PrintingScreen';
import { SummaryScreen } from './components/screens/SummaryScreen';
import { SystemErrorScreen } from './components/screens/SystemErrorScreen';
import { MaintenanceScreen } from './components/screens/MaintenanceScreen';
import { CV001Background } from './components/screens/CV001Background';
// MIMO 2.0 (SV-002) keeps its elegant white-lily screens (restored from 2e5bd172); every other kiosk uses the screens above.
import { MainScreen as Mimo2MainScreen } from './components/mimo2/MainScreen';
import { CodeEntryScreen as Mimo2CodeEntryScreen } from './components/mimo2/CodeEntryScreen';
import { PrintingScreen as Mimo2PrintingScreen } from './components/mimo2/PrintingScreen';
import { SummaryScreen as Mimo2SummaryScreen } from './components/mimo2/SummaryScreen';
import { SystemErrorScreen as Mimo2SystemErrorScreen } from './components/mimo2/SystemErrorScreen';
import { MaintenanceScreen as Mimo2MaintenanceScreen } from './components/mimo2/MaintenanceScreen';
import './components/mimo2/mimo2-lily.css';
import './components/mimo2/mimo2-lily-fixes.css';
import { Adds } from './components/screens/adds/Adds';
import { isFestivalActive } from './config/festivalConfig';
import { useAutoUpdate } from './hooks/useAutoUpdate';
import { useKioskIdle } from './hooks/useKioskIdle';
import { useKioskTheme } from './hooks/useKioskTheme';
import { ChristmasWelcome, ChristmasBackdrop, christmasVariantFor } from './components/festive/christmas/ChristmasWelcome';
import { ChristmasScreenDecor } from './components/festive/christmas/screens/ChristmasScreenDecor';
import { loadActivePrint, saveActivePrint, clearActivePrint, markActivePrintCompleted, type ActivePrintJob } from './utils/activePrint';


export type ScreenState =
  | 'main-interface'
  | 'code-entry-screen'
  | 'printing-screen'
  | 'summary-screen'
  | 'system-error-screen'
  | 'maintenance-screen';

const SCREENSAVER_ENABLED = false;

function App() {
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const currentKioskId = urlParams.get("kioskId");

  if (currentKioskId && typeof window !== 'undefined') {
    try {
      localStorage.setItem('mimo_kiosk_id', currentKioskId);
    } catch {
      // ignore storage errors
    }
  }

  const cachedKioskId = typeof window !== 'undefined' ? localStorage.getItem('mimo_kiosk_id') : null;
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const defaultKioskFromHost = (host.includes('mimo-2-0') || host.includes('mimo-2') || host.includes('mimo-kiosk-app') || host.includes('sv-002')) ? 'SV-002' : undefined;
  const dynamicKioskId = currentKioskId || defaultKioskFromHost || cachedKioskId || import.meta.env.VITE_KIOSK_ID;
  const isFestive = isFestivalActive();
  // SV-002 never uses a festival theme: it always shows the white-lily screens.
  const isMimo2Lily = dynamicKioskId === 'SV-002';
  const isFestiveForKiosk = dynamicKioskId === 'CV-001' || (!isMimo2Lily && isFestive);
  const kioskTheme = useKioskTheme(dynamicKioskId);

  useEffect(() => {
    const rootEl = document.getElementById('root');
    // Clear themes first
    document.body.classList.remove('theme-cv001', 'theme-sv002', 'theme-sv002-lily', 'theme-mimo1-diwali');
    rootEl?.classList.remove('theme-cv001', 'theme-sv002', 'theme-sv002-lily', 'theme-mimo1-diwali');

    if (dynamicKioskId === 'CV-001') {
      // The theme-cv001 stylesheet rules are the old dark look and would repaint the Diwali screens.
      document.body.classList.add('theme-mimo1-diwali');
      rootEl?.classList.add('theme-mimo1-diwali');
    } else if (isMimo2Lily) {
      document.body.classList.add('theme-sv002-lily');
      rootEl?.classList.add('theme-sv002-lily');
    } else if (isFestiveForKiosk) {
      document.body.classList.add('theme-cv001');
      rootEl?.classList.add('theme-cv001');
    }
  }, [dynamicKioskId, isFestiveForKiosk, isMimo2Lily]);

  // A print this kiosk started before the page was reloaded (see utils/activePrint.ts): reopen its printing screen
  // instead of the home screen, and let the backend job status finish the flow.
  // A completed one reopens the summary screen it was showing.
  const [resumedPrint] = useState(() => loadActivePrint(dynamicKioskId));
  const resumedDone = resumedPrint?.completedAt !== undefined;
  const [currentScreen, setCurrentScreen] = useState<ScreenState>(
    resumedPrint ? (resumedDone ? 'summary-screen' : 'printing-screen') : 'main-interface');
  const [code, setCode] = useState(resumedPrint?.code ?? '');
  const [toastMsg, setToastMsg] = useState('');
  const [toastError, setToastError] = useState(false);
  const [printStatus, setPrintStatus] = useState<'idle' | 'printing' | 'completed'>(
    resumedPrint ? (resumedDone ? 'completed' : 'printing') : 'idle');
  const [printError, setPrintError] = useState<string | undefined>(undefined);
  const [showRefundBanner, setShowRefundBanner] = useState(false);
  // True once /kiosk/print accepted the job (or gave no answer); false when it refused it.
  const [canResumePrint, setCanResumePrint] = useState(!!resumedPrint);
  const [showScreensaver, setShowScreensaver] = useState(false);
  const [idleTimeout, setIdleTimeout] = useState(60);
  // True while a submitted code is being verified/triggered on the backend. The idle timer must not
  // reset to the home screen mid-request — that races the network round trip and silently discards
  // an in-flight print, showing the customer nothing but a jump back to home.
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);

  const [jobData, setJobData] = useState<ActivePrintJob | null>(resumedPrint?.job ?? null);

  const [hardwareAlert, setHardwareAlert] = useState<{
    hasIssue: boolean;
    problem: string | null;
    message: string | null;
    suggestedMachine: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchOutages = async () => {
      try {
        const res = await fetch("https://api-upqxuj7evq-uc.a.run.app/api/kiosk-outages");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const alerts = data.hardwareAlerts;
        if (!alerts) return;

        if (dynamicKioskId === "CV-001") {
          if (alerts.mimo1?.hasIssue) {
            setHardwareAlert(alerts.mimo1);
          } else {
            setHardwareAlert(null);
          }
        } else if (dynamicKioskId === "SV-002") {
          if (alerts.mimo2_bw?.hasIssue) {
            setHardwareAlert(alerts.mimo2_bw);
          } else if (alerts.mimo2_color?.hasIssue) {
            setHardwareAlert(alerts.mimo2_color);
          } else {
            setHardwareAlert(null);
          }
        } else {
          setHardwareAlert(null);
        }
      } catch {
        // non-blocking
      }
    };

    fetchOutages();
    const interval = setInterval(fetchOutages, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [dynamicKioskId]);

  const toastTimerRef = useRef<number | null>(null);
  const validationTimerRef = useRef<number | null>(null);

  // Strictly verified idle state: Kiosk is on main-interface, no entered code,
  // no loaded job data, no in-flight network validation, no printing in progress,
  // no active error/refund screens, no pending validation timers, and no active toast notifications.
  const isKioskIdle =
    currentScreen === 'main-interface' &&
    code === '' &&
    jobData === null &&
    !isSubmittingCode &&
    printStatus === 'idle' &&
    printError === undefined &&
    !showRefundBanner &&
    validationTimerRef.current === null &&
    toastMsg === '';

  useAutoUpdate({
    isIdle: isKioskIdle,
    checkIntervalMs: 60000,
  });

  useEffect(() => {
    (window as any).__TRIGGER_SCREENSAVER = () => setShowScreensaver(true);
    (window as any).__HIDE_SCREENSAVER = () => setShowScreensaver(false);
  }, []);

  // ================= TOAST =================
  const showToast = useCallback((msg: string, isError: boolean = false) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);

    setToastMsg(msg);
    setToastError(isError);

    toastTimerRef.current = window.setTimeout(() => {
      setToastMsg('');
      toastTimerRef.current = null;
    }, 3000);
  }, []);

  // ================= VALIDATION + DOWNLOAD =================
  const handleValidationSuccess = useCallback(async () => {
    if (validationTimerRef.current) clearTimeout(validationTimerRef.current);

    return new Promise<void>((resolve, reject) => {
      validationTimerRef.current = window.setTimeout(async () => {
        setIsSubmittingCode(true);
        try {
          if (!dynamicKioskId && code !== "0000" && code !== "9999") {
            throw new Error("Kiosk ID not configured on this device (?kioskId= missing)");
          }

          // 🔐 VERIFY CODE
          let data;
          if (code === "0000") {
            data = {
              userName: "Demo User",
              documents: [
                {
                  file: "demo_print_file.pdf",
                  pages: 3,
                  copies: 1
                }
              ]
            };
          } else if (code === "9999") {
            // 🧪 Developer test code — simulates a color print demo, no backend calls
            data = {
              userName: "Dev Tester",
              documents: [
                {
                  file: "test_color_demo.pdf",
                  pages: 2,
                  copies: 1,
                  colorMode: "color"
                }
              ]
            };
          } else {
            const res = await fetch("https://api-upqxuj7evq-uc.a.run.app/get-documents-by-code", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ printCode: code, kioskId: dynamicKioskId }),
            });

            data = await res.json();

            if (!res.ok) {
              throw new Error(data.error || "Invalid Code");
            }
          }

          // 📄 GET DOCUMENT
          const doc = data.documents && data.documents[0] ? data.documents[0] : { file: data.fileName || "Document", pages: data.pageCount || 1, copies: 1 };

          // 📊 SET JOB DATA
          const job = {
            userName: data.userName || data.name || "User",
            fileName: doc.file || doc.fileName || "Document",
            pages: doc.pages || doc.pageCount || 1,
            copies: doc.copies || 1,
            mode: doc.colorMode || data.colorMode || "Black & White",
          };

          setJobData(job);

          // 🖨️ TRIGGER PRINT VIA FIREBASE FUNCTIONS FIRST (pre-flight health check & enqueue)
          if (code !== "0000" && code !== "9999") {
            let printRes: Response | null = null;
            try {
              printRes = await fetch("https://api-upqxuj7evq-uc.a.run.app/kiosk/print", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  printCode: code,
                  kioskId: dynamicKioskId
                }),
              });
            } catch (printErr: any) {
              // No answer at all: the job may or may not have been started. The printing screen polls the real
              // job status and reports "could not be started" if it is still unprinted after a short grace period.
              console.warn("kiosk/print network warning:", printErr.message);
            }

            // Any HTTP refusal (400 wrong machine / already redeemed, 403 restricted, 409 code collision, 429, 5xx)
            // means this kiosk did not start the job: never show the printing screen or a success for it.
            if (printRes && !printRes.ok) {
              const printData = await printRes.json().catch(() => ({}));
              console.warn("kiosk/print refused:", printRes.status, printData.error);
              setCanResumePrint(false);
              setPrintError(printData.error || "This print could not be started. Please try again or contact support.");
              setCurrentScreen("system-error-screen");
              resolve();
              return;
            }
          }
          setCanResumePrint(true);
          if (code !== "0000" && code !== "9999" && dynamicKioskId) {
            saveActivePrint({ code, kioskId: dynamicKioskId, job, startedAt: Date.now() });
          }

          setPrintStatus("printing");
          setCurrentScreen("printing-screen");

          resolve();
        } catch (err: any) {
          console.error("❌ CODE ERROR:", err.message);

          setCurrentScreen('code-entry-screen');
          showToast(err.message || 'Invalid Code - Access Denied', true);

          setTimeout(() => setCode(''), 600);
          reject(err);
        } finally {
          validationTimerRef.current = null;
          setIsSubmittingCode(false);
        }
      }, 300);
    });
  }, [code, showToast, dynamicKioskId]);

  // ================= RESET =================
  const handleReset = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (validationTimerRef.current) clearTimeout(validationTimerRef.current);

    clearActivePrint();
    setCode('');
    setJobData(null);
    setPrintStatus('idle');
    setPrintError(undefined);
    setShowRefundBanner(false);
    setCurrentScreen('main-interface');
  }, []);

  // ================= HARDWARE-SAFE IDLE & SCREENSAVER DETECTION =================
  // These must be stable: useKioskIdle restarts its idle timer whenever they change, so inline arrows
  // (new on every render) let the 30s outage poll keep resetting the 60s timer and the screensaver never showed.
  // Screensaver switched off on MIMO 1.0 / 2.0 (owner's decision, 2026-11-26): idle kiosks stay on the normal
  // welcome screen. Idle resets of the code-entry / summary screens in useKioskIdle are unaffected.
  // To re-enable, set SCREENSAVER_ENABLED back to true.
  const triggerScreensaver = useCallback(() => { if (SCREENSAVER_ENABLED) setShowScreensaver(true); }, []);
  const hideScreensaver = useCallback(() => setShowScreensaver(false), []);
  const handleIdleTimeoutChange = useCallback((sec: number) => setIdleTimeout(sec), []);
  // Pause the (hidden) screens' animations while the opaque screensaver covers them — see index.css.
  useEffect(() => {
    document.documentElement.classList.toggle('kiosk-screensaver-on', showScreensaver);
  }, [showScreensaver]);
  useKioskIdle({
    idleTimeoutSeconds: idleTimeout,
    currentScreen,
    isSubmittingCode,
    isPrinting: printStatus === 'printing',
    onResetToHome: handleReset,
    onTriggerScreensaver: triggerScreensaver,
    onHideScreensaver: hideScreensaver,
  });

  // ================= RETRY =================
  // Only a job this kiosk actually started can be resumed (re-polled). Otherwise go back to code entry: re-polling
  // a refused or cleared code could show another kiosk's or a demo completion as this customer's success.
  const handleRetry = useCallback(() => {
    if (canResumePrint && code) {
      setCurrentScreen('printing-screen');
      return;
    }
    setCode('');
    setPrintError(undefined);
    setShowRefundBanner(false);
    setCurrentScreen('code-entry-screen');
  }, [canResumePrint, code]);

  const goToCodeEntry = useCallback(() => setCurrentScreen('code-entry-screen'), []);
  const goToSummary = useCallback(() => setCurrentScreen('summary-screen'), []);

  // Setup screen removed as per user request to drop URL parameters
  // Festival UI chosen in the admin dashboard (Configuration → Kiosk Theme); 'default' keeps the normal screens.
  const MainScreenView = kioskTheme === 'christmas' ? ChristmasWelcome : isMimo2Lily ? Mimo2MainScreen : MainScreen;
  const CodeEntryScreenView = isMimo2Lily ? Mimo2CodeEntryScreen : CodeEntryScreen;
  const PrintingScreenView = isMimo2Lily ? Mimo2PrintingScreen : PrintingScreen;
  const SummaryScreenView = isMimo2Lily ? Mimo2SummaryScreen : SummaryScreen;
  const SystemErrorScreenView = isMimo2Lily ? Mimo2SystemErrorScreen : SystemErrorScreen;
  const MaintenanceScreenView = isMimo2Lily ? Mimo2MaintenanceScreen : MaintenanceScreen;

  return (
    <>
      {/* ================= TOAST ================= */}
      {toastMsg && (
        <div
          className={`fixed left-1/2 top-9 z-[1000] flex -translate-x-1/2 items-center gap-4 rounded-2xl border px-7 py-4 shadow-2xl backdrop-blur-xl ${
            dynamicKioskId === 'CV-001'
              ? toastError
                ? 'border-[#D4AF37]/60 bg-gradient-to-r from-[#7D1120] to-[#540915] text-[#FFF9EA] shadow-[0_12px_36px_rgba(80,10,20,0.40)]'
                : 'border-[#D4AF37]/50 bg-white/95 text-[#2D1E12] shadow-[0_12px_36px_rgba(80,50,20,0.12)]'
              : toastError
              ? 'border-danger-500/30 bg-danger-600/95 text-white'
              : 'border-gold-500/30 bg-white/95 text-[#1A1714]'
          }`}
        >
          {toastError ? <WarningCircle size={22} weight="fill" /> : <Info size={22} weight="fill" className="text-gold-600" />}
          <span className="text-[17px] font-semibold">{toastMsg}</span>
          <button
            onClick={() => setToastMsg('')}
            className={`ml-1 flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
              toastError
                ? 'text-white/70 hover:bg-white/10 hover:text-white'
                : 'text-[#8C8072] hover:bg-black/5 hover:text-[#1A1714]'
            }`}
          >
            <X size={16} weight="bold" />
          </button>
        </div>
      )}

      {/* ================= SCREENSAVER ================= */}
      <Adds 
        isActive={showScreensaver} 
        kioskId={dynamicKioskId} 
        onTap={hideScreensaver}
        onTimeoutChange={handleIdleTimeoutChange}
      />

      {/* ================= HARDWARE ALERT BANNER ================= */}
      {hardwareAlert?.hasIssue && (currentScreen === 'main-interface' || currentScreen === 'code-entry-screen') && (
        <div
          className={`fixed left-1/2 top-4 z-[999] flex w-[92%] max-w-[850px] -translate-x-1/2 items-center gap-3.5 rounded-2xl border px-6 py-3.5 shadow-2xl backdrop-blur-xl ${
            dynamicKioskId === 'CV-001'
              ? 'border-[#D4AF37]/80 bg-[#7D1120]/95 text-[#FFF9EA]'
              : 'border-amber-400/80 bg-amber-700/95 text-white'
          }`}
        >
          <WarningCircle size={28} weight="fill" className="shrink-0 text-amber-300" />
          <div className="flex-1 text-left">
            <span className="block text-[15px] font-bold uppercase tracking-wider text-amber-200">
              Notice: {hardwareAlert.problem}
            </span>
            <span className="text-[14px] font-medium leading-snug">
              {hardwareAlert.message}
            </span>
          </div>
        </div>
      )}

      {/* ================= SCREENS ================= */}
      {isFestiveForKiosk && <CV001Background />}
      {kioskTheme === 'christmas' && <ChristmasBackdrop variant={christmasVariantFor(dynamicKioskId)} />}

      <MainScreenView
        isActive={currentScreen === 'main-interface'}
        onNext={goToCodeEntry}
        kioskId={dynamicKioskId}
      />

      <CodeEntryScreenView
        isActive={currentScreen === 'code-entry-screen'}
        code={code}
        setCode={setCode}
        onSuccess={handleValidationSuccess}
        onBack={handleReset}
        hasError={toastError && currentScreen === 'code-entry-screen'}
        kioskId={dynamicKioskId}
      />

      <PrintingScreenView
        isActive={currentScreen === 'printing-screen'}
        statusTitle={
          printStatus === 'completed'
            ? 'Print Completed ✅'
            : (jobData && jobData.userName)
            ? `Hello ${jobData.userName.split(' ')[0]}..!`
            : 'Printing in Progress'
        }
        statusSub={
          printStatus === 'completed'
            ? 'Your document has been printed successfully.'
            : 'Printing in progress…\nPlease wait.'
        }
        pages={jobData?.pages || 1}
        copies={jobData?.copies || 1}
        printCode={code}
        colorMode={jobData?.mode?.toLowerCase().match(/color|colour/) ? 'color' : 'bw'}
        kioskId={dynamicKioskId}
        onComplete={() => {
          markActivePrintCompleted();
          setPrintStatus('completed');
          goToSummary();
        }}
        onError={(errMsg?: string) => {
          clearActivePrint();
          setPrintStatus('idle');
          setCode('');
          // Determine if this is a print failure that may involve a refund
          const isRefundCase = !!(errMsg && (
            errMsg.toLowerCase().includes('refund') ||
            errMsg.toLowerCase().includes('timed out') ||
            errMsg.toLowerCase().includes('timeout') ||
            errMsg.toLowerCase().includes('charged')
          ));
          setPrintError(errMsg || 'Something went wrong while printing your document.');
          setShowRefundBanner(isRefundCase);
          setCurrentScreen('system-error-screen');
        }}
      />

      <SummaryScreenView
        isActive={currentScreen === 'summary-screen'}
        onReset={handleReset}
        jobData={jobData}
        kioskId={dynamicKioskId}
        printCode={code}
      />

      <SystemErrorScreenView
        isActive={currentScreen === 'system-error-screen'}
        jobData={jobData}
        onReset={handleReset}
        onRetry={handleRetry}
        errorMsg={printError}
        showRefundBanner={showRefundBanner}
        kioskId={dynamicKioskId}
      />

      <MaintenanceScreenView
        isActive={currentScreen === 'maintenance-screen'}
        onReset={handleReset}
        kioskId={dynamicKioskId}
      />

      {kioskTheme === 'christmas' && <ChristmasScreenDecor variant={christmasVariantFor(dynamicKioskId)} screen={currentScreen} />}

      {/* DEBUG BUTTON */}
      <div
        onClick={() => setCurrentScreen('system-error-screen')}
        style={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          width: '40px',
          height: '40px',
          opacity: 0,
          zIndex: 10000,
          cursor: 'pointer'
        }}
      ></div>
    </>
  );
}

export default App;