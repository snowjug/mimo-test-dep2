
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles/index.css";
import { ThemeProvider } from "./app/components/theme-provider.tsx";
import { GoogleOAuthProvider } from "@react-oauth/google";

// Hardcoded to ensure Vercel uses the correct client ID without needing a dashboard login
const GOOGLE_CLIENT_ID = "144514765704-a3nm5kgbtehioia9eki37s3t8doasfi1.apps.googleusercontent.com";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      {/* Follows the phone's light/dark setting. The old key never applied a class, so a new key starts everyone on "system". */}
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="mimo-theme">
        <App />
      </ThemeProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>
);