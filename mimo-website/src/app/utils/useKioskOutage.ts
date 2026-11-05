import { useState, useEffect, useCallback } from "react";
import api from "../api";

export interface KioskOutageData {
  allDown: boolean;
  mimo1Down: boolean;
  mimo2BwDown: boolean;
  mimo2ColorDown: boolean;
  customNotice: string;
  updatedAt: string | null;
  hasActiveOutage: boolean;
  activeNotices: string[];
}

const DEFAULT_OUTAGES: KioskOutageData = {
  allDown: false,
  mimo1Down: false,
  mimo2BwDown: false,
  mimo2ColorDown: false,
  customNotice: "",
  updatedAt: null,
  hasActiveOutage: false,
  activeNotices: [],
};

export function useKioskOutage() {
  const [outages, setOutages] = useState<KioskOutageData>(DEFAULT_OUTAGES);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribedEmail, setSubscribedEmail] = useState<string | null>(null);

  const fetchOutages = useCallback(async () => {
    try {
      const res = await api.get<KioskOutageData>("/api/kiosk-outages");
      if (res.data) {
        setOutages(res.data);
      }
    } catch (err) {
      // Gracefully fall back to normal operational state if offline
      console.warn("[USE-KIOSK-OUTAGE] Could not fetch outage status, defaulting to normal:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOutages();
    // Poll every 30s to catch admin toggles dynamically without reloading the page
    const interval = setInterval(fetchOutages, 30000);
    return () => clearInterval(interval);
  }, [fetchOutages]);

  const subscribeEmail = async (email: string, scope = "all") => {
    if (!email || !email.includes("@")) {
      throw new Error("Please enter a valid email address");
    }
    setSubscribing(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>("/api/notify-when-available", {
        email,
        scope,
      });
      setSubscribedEmail(email);
      return res.data;
    } finally {
      setSubscribing(false);
    }
  };

  return {
    outages,
    loading,
    refresh: fetchOutages,
    subscribeEmail,
    subscribing,
    subscribedEmail,
  };
}
