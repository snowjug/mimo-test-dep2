import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "./app/components/ui/sonner";
import { Login } from "./app/pages/login";
import { ScreenSkeleton } from "./app/components/mimo/screen-skeleton";

// Every screen except the entry (login) is split into its own chunk so the first paint only
// downloads what the login screen needs. pdf-lib, Firebase Storage and the text editor load on demand.
const Register = lazy(() => import("./app/pages/register").then((m) => ({ default: m.Register })));
const UploadFile = lazy(() => import("./app/pages/upload-file").then((m) => ({ default: m.UploadFile })));
const PrintOptions = lazy(() => import("./app/pages/print-options").then((m) => ({ default: m.PrintOptions })));
const Payment = lazy(() => import("./app/pages/payment").then((m) => ({ default: m.Payment })));
const PaymentVerify = lazy(() => import("./app/pages/payment-verify").then((m) => ({ default: m.PaymentVerify })));
const PrintCode = lazy(() => import("./app/pages/print-code").then((m) => ({ default: m.PrintCode })));
const UserProfile = lazy(() => import("./app/pages/user-profile").then((m) => ({ default: m.UserProfile })));
const PrinterSettings = lazy(() => import("./app/pages/printer-settings").then((m) => ({ default: m.PrinterSettings })));
const OnboardingName = lazy(() => import("./app/pages/onboarding-name").then((m) => ({ default: m.OnboardingName })));
const BlankPages = lazy(() => import("./app/pages/blank-pages").then((m) => ({ default: m.BlankPages })));
const DirectSuccess = lazy(() => import("./app/pages/direct-success").then((m) => ({ default: m.DirectSuccess })));
const AdminDashboard = lazy(() => import("./app/pages/mimo-admin-dashboard"));
const TextEditor = lazy(() => import("./app/pages/text-editor").then((m) => ({ default: m.TextEditor })));
const FindMachine = lazy(() => import("./app/pages/find-machine").then((m) => ({ default: m.FindMachine })));

export default function App() {
  // Silent background ping to wake up the Firebase Cloud Function (Cold Start bypass)
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || "https://api-upqxuj7evq-uc.a.run.app";
    fetch(apiUrl).catch(() => {}); // Ignore errors, just fire and forget to wake up server
  }, []);

  return (
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
            <Route path="/text-editor" element={<TextEditor />} />
            <Route path="/find-machine" element={<FindMachine />} />
          </Routes>
        </Suspense>
      </div>
      <Toaster />
    </BrowserRouter>
  );
}
