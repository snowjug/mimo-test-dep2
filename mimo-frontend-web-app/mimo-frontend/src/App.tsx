import { useState, useCallback, useRef } from 'react';
import { MainScreen } from './components/screens/MainScreen';
import { CodeEntryScreen } from './components/screens/CodeEntryScreen';
import { PrintingScreen } from './components/screens/PrintingScreen';
import { SummaryScreen } from './components/screens/SummaryScreen';
import { SystemErrorScreen } from './components/screens/SystemErrorScreen';
import { MaintenanceScreen } from './components/screens/MaintenanceScreen';

export type ScreenState =
  | 'main-interface'
  | 'code-entry-screen'
  | 'printing-screen'
  | 'summary-screen'
  | 'system-error-screen'
  | 'maintenance-screen';

function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const currentKioskId = urlParams.get("kioskId");

  const [currentScreen, setCurrentScreen] = useState<ScreenState>('main-interface');
  const [code, setCode] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [toastError, setToastError] = useState(false);
  const [printStatus, setPrintStatus] = useState<'idle' | 'printing' | 'completed'>('idle');
  const [printError, setPrintError] = useState<string | undefined>(undefined);
  const [showRefundBanner, setShowRefundBanner] = useState(false);

  const [jobData, setJobData] = useState<{
    userName: string;
    fileName: string;
    pages: number;
    copies: number;
    mode: string;
  } | null>(null);

  const toastTimerRef = useRef<number | null>(null);
  const validationTimerRef = useRef<number | null>(null);

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
        try {
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
          } else {
            const res = await fetch("https://api-upqxuj7evq-uc.a.run.app/get-documents-by-code", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ printCode: code }),
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
          setPrintStatus("printing");
          setCurrentScreen("printing-screen");

          // 🖨️ TRIGGER PRINT VIA FIREBASE FUNCTIONS (Pi listener picks it up via Firestore)
          if (code !== "0000") {
            try {
              // Read specific Kiosk ID from URL so one Vercel deployment supports infinite kiosks!
              // Example: printmimo.tech/kiosk?kioskId=SV-002
              const dynamicKioskId = currentKioskId || import.meta.env.VITE_KIOSK_ID || "CV-001";

              const printRes = await fetch("https://api-upqxuj7evq-uc.a.run.app/kiosk/print", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ 
                  printCode: code,
                  kioskId: dynamicKioskId
                }),
              });

              const printData = await printRes.json();
              
              if (!printRes.ok) {
                // Log but don't show error - Pi listener handles printing independently
                console.warn("kiosk/print API warning:", printData.error);
              }
            } catch (printErr: any) {
              // Network error calling kiosk/print - Pi listener will still handle it
              console.warn("kiosk/print network warning:", printErr.message);
            }
          }

          resolve();
        } catch (err: any) {
          console.error("❌ CODE ERROR:", err.message);

          setCurrentScreen('code-entry-screen');
          showToast(err.message || 'Invalid Code - Access Denied', true);

          setTimeout(() => setCode(''), 600);
          reject(err);
        } finally {
          validationTimerRef.current = null;
        }
      }, 300);
    });
  }, [code, showToast, currentKioskId]);

  // ================= RESET =================
  const handleReset = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (validationTimerRef.current) clearTimeout(validationTimerRef.current);

    setCode('');
    setJobData(null);
    setPrintStatus('idle');
    setPrintError(undefined);
    setShowRefundBanner(false);
    setCurrentScreen('main-interface');
  }, []);

  // ================= RETRY =================
  const handleRetry = useCallback(() => {
    setCurrentScreen('printing-screen');
  }, []);

  const goToCodeEntry = useCallback(() => setCurrentScreen('code-entry-screen'), []);
  const goToSummary = useCallback(() => setCurrentScreen('summary-screen'), []);

  // Setup screen removed as per user request to drop URL parameters

  return (
    <>
      {/* ================= TOAST ================= */}
      {toastMsg && (
        <div className={`toast-container visible ${toastError ? 'error' : ''}`}>
          <span className="material-symbols-outlined icon-main">
            {toastError ? 'error' : 'info'}
          </span>
          <span>{toastMsg}</span>
          <div className="toast-close" onClick={() => setToastMsg('')}>
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
          </div>
        </div>
      )}

      {/* ================= SCREENS ================= */}
      <MainScreen
        isActive={currentScreen === 'main-interface'}
        onNext={goToCodeEntry}
      />

      <CodeEntryScreen
        isActive={currentScreen === 'code-entry-screen'}
        code={code}
        setCode={setCode}
        onSuccess={handleValidationSuccess}
        onBack={handleReset}
        hasError={toastError && currentScreen === 'code-entry-screen'}
      />

      <PrintingScreen
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
        colorMode={jobData?.mode?.toLowerCase().includes('color') ? 'color' : 'bw'}
        onComplete={() => {
          setPrintStatus('completed');
          goToSummary();
        }}
        onError={(errMsg?: string) => {
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

      <SummaryScreen
        isActive={currentScreen === 'summary-screen'}
        onReset={handleReset}
        jobData={jobData}
      />

      <SystemErrorScreen
        isActive={currentScreen === 'system-error-screen'}
        jobData={jobData}
        onReset={handleReset}
        onRetry={handleRetry}
        errorMsg={printError}
        showRefundBanner={showRefundBanner}
      />

      <MaintenanceScreen
        isActive={currentScreen === 'maintenance-screen'}
        onReset={handleReset}
      />

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