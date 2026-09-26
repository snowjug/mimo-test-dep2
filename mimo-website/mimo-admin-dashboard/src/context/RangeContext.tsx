import React, { createContext, useContext, useMemo, useState } from 'react';
import { DateRangeValue, defaultRange, isLiveRange, resolveRange } from '../lib/dateRange';

interface RangeCtx {
  range: DateRangeValue;
  setRange: (r: DateRangeValue) => void;
  /** Range with presets re-evaluated against the clock now (so "Today" rolls over at midnight). */
  current: () => DateRangeValue;
  /** True when the selected range includes today (data is live and gets polled). */
  live: boolean;
}

const Ctx = createContext<RangeCtx | null>(null);

/** One date-range selection shared by every page of an app. Defaults to today. */
export const RangeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [range, setRange] = useState<DateRangeValue>(defaultRange);
  const value = useMemo<RangeCtx>(
    () => ({ range, setRange, current: () => resolveRange(range), live: isLiveRange(resolveRange(range)) }),
    [range]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useRange = (): RangeCtx => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRange must be used inside <RangeProvider>');
  return v;
};
