
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles/index.css";
import { GoogleOAuthProvider } from "@react-oauth/google";

// Hardcoded to ensure Vercel uses the correct client ID without needing a dashboard login
const GOOGLE_CLIENT_ID = "144514765704-a3nm5kgbtehioia9eki37s3t8doasfi1.apps.googleusercontent.com";

// Force light mode — no OS-level dark mode switching
document.documentElement.classList.remove("dark");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>
);