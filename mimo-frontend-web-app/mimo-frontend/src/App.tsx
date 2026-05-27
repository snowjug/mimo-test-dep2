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
  const [currentScreen, setCurrentScreen] = useState<ScreenState>('main-interface');
  const [code, setCode] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [toastError, setToastError] = useState(false);
  const [printStatus, setPrintStatus] = useState<'idle' | 'printing' | 'completed'>('idle');

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
          const res = await fetch("https://p01--mimo-backend--4b94y9s4jyc5.code.run/get-documents-by-code", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ printCode: code }),
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.error || "Invalid Code");
          }

          // 📄 GET DOCUMENT
          const doc = data.documents[0];

          // 📊 SET JOB DATA
          const job = {
            userName: data.userName || "User",
            fileName: doc.file,
            pages: 1,
            copies: doc.copies,
            mode: "Black & White",
          };

          setJobData(job);
          setPrintStatus("printing");
          setCurrentScreen("printing-screen");

          // 🖨️ TRIGGER PRINT VIA PI (BACKEND INTEGRATION)
          try {
            const printRes = await fetch("https://p01--mimo-backend--4b94y9s4jyc5.code.run/kiosk/print", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ 
                printCode: code,
                kioskId: import.meta.env.VITE_KIOSK_ID || "KIOSK_1"
              }),
            });

            const printData = await printRes.json();
            
            if (!printRes.ok) {
              console.error("Print Failed", printData.error);
              showToast(printData.error || "Failed to trigger printer", true);
              setCurrentScreen("system-error-screen");
            }
          } catch (printErr: any) {
            console.error("Printer trigger error:", printErr);
            showToast(printErr.message || "Failed to communicate with printer", true);
            setCurrentScreen("system-error-screen");
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
  }, [code, showToast]);

  // ================= RESET =================
  const handleReset = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (validationTimerRef.current) clearTimeout(validationTimerRef.current);

    setCode('');
    setJobData(null);
    setPrintStatus('idle');
    setCurrentScreen('main-interface');
  }, []);

  // ================= RETRY =================
  const handleRetry = useCallback(() => {
    setCurrentScreen('printing-screen');
  }, []);

  const goToCodeEntry = useCallback(() => setCurrentScreen('code-entry-screen'), []);
  const goToSummary = useCallback(() => setCurrentScreen('summary-screen'), []);

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
        hasError={toastError && currentScreen === 'code-entry-screen'}
      />

      <PrintingScreen
        isActive={currentScreen === 'printing-screen'}
        statusTitle={
          printStatus === 'completed'
            ? 'Print Completed ✅'
            : jobData
            ? `Hello ${jobData.userName.split(' ')[0]}..!`
            : 'Printing in Progress'
        }
        statusSub={
          printStatus === 'completed'
            ? 'Your document has been printed successfully.'
            : 'Printing in progress…\nPlease wait.'
        }
        pages={jobData?.pages || 1}
        onComplete={() => {
          setPrintStatus('completed');
          goToSummary();
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