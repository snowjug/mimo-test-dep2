import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "./app/components/ui/sonner";
import { Login } from "./app/pages/login";
import { Register } from "./app/pages/register";
import { UploadFile } from "./app/pages/upload-file";
import { PrintOptions } from "./app/pages/print-options";
import { Payment } from "./app/pages/payment";
import { PaymentVerify } from "./app/pages/payment-verify";
import { PrintCode } from "./app/pages/print-code";
import { UserProfile } from "./app/pages/user-profile";
import { PrinterSettings } from "./app/pages/printer-settings";
import { OnboardingName } from "./app/pages/onboarding-name";
import { BlankPages } from "./app/pages/blank-pages";


export default function App() {
  return (
    <BrowserRouter>
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
      </Routes>

      <Toaster />
    </BrowserRouter>
  );
}