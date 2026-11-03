import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Every dashboard query re-runs Firestore reads on the backend, and Firestore bills per document read: 20-30 s
 * polling on a few open tabs ran to millions of reads a day. So data refreshes on its own at most every 20 min;
 * anything fresher comes from the page's Refresh button (`refresh()`).
 */
export const AUTO_REFRESH_MS = 20 * 60 * 1000;

export interface LiveQueryOptions {
  /** Auto-refresh (every AUTO_REFRESH_MS while the tab is visible) only when true, e.g. the range includes today. Default true. */
  live?: boolean;
}

export interface LiveQuery<T> {
  data: T | null;
  error: string | null;
  /** True only for the first load of a given query (skeletons). */
  loading: boolean;
  /** True during any in-flight request, including background polls. */
  fetching: boolean;
  updatedAt: Date | null;
  refresh: () => void;
}

/** Turns an axios/Error into a message that is worth showing to an admin. */
export const errorMessage = (err: unknown): string => {
  const e = err as { response?: { status?: number; data?: { error?: string } }; message?: string };
  if (e?.response?.data?.error) return e.response.data.error;
  if (e?.response?.status === 404) return 'The API does not have this endpoint yet — the backend running at this address is out of date (restart the local server, or deploy the latest functions/).';
  if (e?.response?.status) return `Server responded ${e.response.status}`;
  if (e?.message === 'Network Error') return 'Cannot reach the MIMO API. Check your connection and try again.';
  return e?.message || 'Something went wrong';
};

/**
 * Fetches `fetcher` whenever `deps` change and refreshes it every AUTO_REFRESH_MS. Stale responses are discarded,
 * auto-refresh pauses while the tab is hidden, and errors are surfaced instead of being swallowed as empty data.
 */
export function useLiveQuery<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList,
  { live = true }: LiveQueryOptions = {}
): LiveQuery<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const seq = useRef(0);
  const lastRunAt = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async (isFirst: boolean) => {
    const mine = ++seq.current;
    lastRunAt.current = Date.now();
    setFetching(true);
    if (isFirst) setLoading(true);
    try {
      const result = await fetcherRef.current();
      if (mine !== seq.current) return;
      setData(result);
      setError(null);
      setUpdatedAt(new Date());
    } catch (err) {
      if (mine !== seq.current) return;
      setError(errorMessage(err));
    } finally {
      if (mine === seq.current) {
        setFetching(false);
        setLoading(false);
      }
    }
  }, []);

  // (Re)load when the query changes.
  useEffect(() => {
    setData(null);
    run(true);
    return () => { seq.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Auto-refresh while visible, once the data is AUTO_REFRESH_MS old. The once-a-minute check sends nothing
  // until then, and returning to the tab refetches only stale data, so switching tabs costs nothing.
  useEffect(() => {
    if (!live) return;
    const refreshIfStale = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastRunAt.current < AUTO_REFRESH_MS) return;
      run(false);
    };
    const id = window.setInterval(refreshIfStale, 60 * 1000);
    document.addEventListener('visibilitychange', refreshIfStale);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', refreshIfStale); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, ...deps]);

  return { data, error, loading, fetching, updatedAt, refresh: () => run(false) };
}
