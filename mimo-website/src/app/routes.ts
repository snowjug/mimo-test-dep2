import { createBrowserRouter } from "react-router";
import { Login } from "./pages/login";
import { Register } from "./pages/register";
import { DashboardLayout } from "./components/dashboard-layout";
import { UploadFile } from "./pages/upload-file";
import { PrintOptions } from "./pages/print-options";
import { PrinterSettings } from "./pages/printer-settings";
import { UserProfile } from "./pages/user-profile";
import { Payment } from "./pages/payment";
import { PrintCode } from "./pages/print-code";
import { OnboardingName } from "./pages/onboarding-name";

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/register",
    Component: Register,
  },
  {
    path: "/onboarding",
    Component: OnboardingName,
  },
  {
    path: "/",
    Component: DashboardLayout,
    children: [
      { index: true, Component: UploadFile },
      { path: "print-options", Component: PrintOptions },
      { path: "settings", Component: PrinterSettings },
      { path: "profile", Component: UserProfile },
      { path: "payment", Component: Payment },
      { path: "print-code", Component: PrintCode },
    ],
  },
]);