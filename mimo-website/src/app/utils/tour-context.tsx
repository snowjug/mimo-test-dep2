import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { TOUR_STEPS, type TourStep } from "./tour-steps";

const COMPLETED_KEY = "mimo_tour_completed";
const PROGRESS_KEY = "mimo_tour_progress";

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
  steps: TourStep[];
  start: () => void;
  next: () => void;
  prev: () => void;
  skip: () => void;
  close: () => void;
};

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Resume an in-progress tour across a refresh (sessionStorage: survives a reload, not a new day/tab).
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(PROGRESS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.active) {
          setActive(true);
          setStepIndex(parsed.stepIndex || 0);
        }
      }
    } catch {
      // sessionStorage can throw (private mode, blocked storage) -- the tour just starts fresh.
    }
  }, []);

  useEffect(() => {
    try {
      if (active) sessionStorage.setItem(PROGRESS_KEY, JSON.stringify({ active, stepIndex }));
      else sessionStorage.removeItem(PROGRESS_KEY);
    } catch {
      // Best-effort only; losing resume state is not a functional failure.
    }
  }, [active, stepIndex]);

  const finish = useCallback(() => {
    setActive(false);
    try {
      localStorage.setItem(COMPLETED_KEY, "1");
    } catch {
      // If storage is unavailable the tour may re-offer itself next visit -- acceptable degradation.
    }
  }, []);

  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
  }, []);

  const next = useCallback(() => {
    setStepIndex((i) => {
      if (i + 1 >= TOUR_STEPS.length) {
        finish();
        return i;
      }
      return i + 1;
    });
  }, [finish]);

  const prev = useCallback(() => setStepIndex((i) => Math.max(0, i - 1)), []);
  const skip = useCallback(() => finish(), [finish]);
  const close = useCallback(() => finish(), [finish]);

  return (
    <TourContext.Provider value={{ active, stepIndex, steps: TOUR_STEPS, start, next, prev, skip, close }}>
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within a TourProvider");
  return ctx;
}
