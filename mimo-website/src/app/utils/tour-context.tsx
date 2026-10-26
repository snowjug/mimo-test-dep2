import { createContext, useCallback, useContext, useState } from "react";
import { GUIDE_STEPS } from "./how-to-print-steps";

// Open/closed and current-step state of the "How to print" guide (components/how-to-print-guide.tsx).
const COMPLETED_KEY = "mimo_tour_completed";

export function hasTourCompleted() {
  try {
    return localStorage.getItem(COMPLETED_KEY) === "1";
  } catch {
    return false;
  }
}

type TourContextValue = {
  active: boolean;
  stepIndex: number;
  start: () => void;
  next: () => void;
  prev: () => void;
  close: () => void;
};

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
  }, []);

  const next = useCallback(() => setStepIndex((i) => Math.min(i + 1, GUIDE_STEPS.length - 1)), []);
  const prev = useCallback(() => setStepIndex((i) => Math.max(0, i - 1)), []);

  // Closing in any way (X, Escape, tapping outside, or finishing) counts as seen, so the guide is never
  // offered again unprompted. The header's "How to print" button always reopens it.
  const close = useCallback(() => {
    setActive(false);
    try {
      localStorage.setItem(COMPLETED_KEY, "1");
    } catch {
      // Storage can be unavailable (private mode); the guide may then be offered again next visit.
    }
  }, []);

  return <TourContext.Provider value={{ active, stepIndex, start, next, prev, close }}>{children}</TourContext.Provider>;
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within a TourProvider");
  return ctx;
}
