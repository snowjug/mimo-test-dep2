import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "./app/components/ui/sonner";
import { motion, AnimatePresence } from "motion/react";
import { Printer } from "lucide-react";

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
import { DirectSuccess } from "./app/pages/direct-success";
import AdminDashboard from "./app/pages/mimo-admin-dashboard";
import LandingPage from "./app/pages/landing";

export default function App() {
  const [showSplash, setShowSplash] = useState(false);

  // Silent background ping to wake up the Firebase Cloud Function (Cold Start bypass)
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || "https://api-upqxuj7evq-uc.a.run.app";
    fetch(apiUrl).catch(() => {}); // Ignore errors, just fire and forget to wake up server
  }, []);

  return (
    <>
      <AnimatePresence>
        {showSplash && (
          <motion.div
            key="splash-screen"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="flex flex-col items-center"
            >
              <div className="bg-[#093765] p-4 rounded-3xl mb-4 shadow-xl shadow-blue-900/20">
                <Printer className="w-12 h-12 text-white" />
              </div>
              <h1 className="text-4xl font-black tracking-tight text-[#093765]">Mimo</h1>
              <p className="text-slate-500 mt-2 text-sm font-medium tracking-wide">Smart Print Kiosk</p>
              
              <div className="mt-8 flex space-x-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2.5 h-2.5 bg-blue-500 rounded-full"
                    animate={{
                      y: ["0%", "-60%", "0%"],
                    }}
                    transition={{
                      duration: 0.6,
                      repeat: Infinity,
                      delay: i * 0.15,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
          <Route path="/direct-success" element={<DirectSuccess />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/landing" element={<LandingPage />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </>
  );
}