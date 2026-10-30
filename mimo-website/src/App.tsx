import React, { lazy, Suspense, useEffect, Component } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "./app/components/ui/sonner";
import { Login } from "./app/pages/login";
import { ScreenSkeleton } from "./app/components/mimo/screen-skeleton";
import { TourProvider } from "./app/utils/tour-context";
import { HowToPrintGuide } from "./app/components/how-to-print-guide";

// Resilient chunk loader: If a dynamic import fails due to temporary network drop
// or new deployment bundle hashes, automatically retry with a clean reload once.
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      console.warn("Dynamic import failed, attempting reload recovery:", error);
      const reloadKey = "mimo_chunk_retry_" + window.location.pathname;
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, "1");
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      sessionStorage.removeItem(reloadKey);
      throw error;
    }
  });
}

// App-level error boundary: Guarantees that any uncaught render error never results
// in a blank white screen, giving users an immediate recovery option.
interface ErrorBoundaryProps {
  children: React.ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("[MIMO APP ERROR]", error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4 py-8 text-center">
          <div className="rise-in max-w-sm rounded-[24px] bg-surface p-6 shadow-float">
            <h2 className="text-[20px] font-bold tracking-tight text-ink">Page Error</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
              An unexpected error occurred while loading this page.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="press mt-5 w-full rounded-full bg-brand py-3 text-[15px] font-semibold text-on-brand shadow-sm active:bg-brand-strong"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Every screen except the entry (login) is split into its own chunk so the first paint only
// downloads what the login screen needs.
const Register = lazyWithRetry(() => import("./app/pages/register").then((m) => ({ default: m.Register })));
const UploadFile = lazyWithRetry(() => import("./app/pages/upload-file").then((m) => ({ default: m.UploadFile })));
const PrintOptions = lazyWithRetry(() => import("./app/pages/print-options").then((m) => ({ default: m.PrintOptions })));
const Payment = lazyWithRetry(() => import("./app/pages/payment").then((m) => ({ default: m.Payment })));
const PaymentVerify = lazyWithRetry(() => import("./app/pages/payment-verify").then((m) => ({ default: m.PaymentVerify })));
const PrintCode = lazyWithRetry(() => import("./app/pages/print-code").then((m) => ({ default: m.PrintCode })));
const UserProfile = lazyWithRetry(() => import("./app/pages/user-profile").then((m) => ({ default: m.UserProfile })));
const PrinterSettings = lazyWithRetry(() => import("./app/pages/printer-settings").then((m) => ({ default: m.PrinterSettings })));
const OnboardingName = lazyWithRetry(() => import("./app/pages/onboarding-name").then((m) => ({ default: m.OnboardingName })));
const BlankPages = lazyWithRetry(() => import("./app/pages/blank-pages").then((m) => ({ default: m.BlankPages })));
const DirectSuccess = lazyWithRetry(() => import("./app/pages/direct-success").then((m) => ({ default: m.DirectSuccess })));
const AdminDashboard = lazyWithRetry(() => import("./app/pages/mimo-admin-dashboard"));
const TextEditor = lazyWithRetry(() => import("./app/pages/text-editor").then((m) => ({ default: m.TextEditor })));
const FindMachine = lazyWithRetry(() => import("./app/pages/find-machine").then((m) => ({ default: m.FindMachine })));
const DocumentScanner = lazyWithRetry(() => import("./app/pages/document-scanner").then((m) => ({ default: m.DocumentScanner })));

export default function App() {
  // Silent background ping to wake up the Firebase Cloud Function (Cold Start bypass)
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || "https://api-upqxuj7evq-uc.a.run.app";
    fetch(apiUrl).catch(() => {}); // Ignore errors, just fire and forget to wake up server
  }, []);

  return (
    <AppErrorBoundary>
      <TourProvider>
        <BrowserRouter>
          <div className="app-column">
            <Suspense fallback={<ScreenSkeleton />}>
              <Routes>
                <Route path="/" element={<Login />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/upload" element={<UploadFile />} />
                <Route path="/print-options" element={<PrintOptions />} />
                <Route path="/payment" element={<Payment />} />
                <Route path="/payment-verify" element={<PaymentVerify />} />
                <Route path="/print-code" element={<PrintCode />} />
                <Route path="/user-profile" element={<UserProfile />} />
                <Route path="/settings" element={<PrinterSettings />} />
                <Route path="/onboarding" element={<OnboardingName />} />
                <Route path="/blank-pages" element={<BlankPages />} />
                <Route path="/direct-success" element={<DirectSuccess />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/*" element={<AdminDashboard />} />
                <Route path="/finance" element={<AdminDashboard />} />
                <Route path="/finance/*" element={<AdminDashboard />} />
                <Route path="/text-editor" element={<TextEditor />} />
                <Route path="/find-machine" element={<FindMachine />} />
                <Route path="/document-scanner" element={<DocumentScanner />} />
              </Routes>
            </Suspense>
          </div>
          <HowToPrintGuide />
          <Toaster />
        </BrowserRouter>
      </TourProvider>
    </AppErrorBoundary>
  );
}
