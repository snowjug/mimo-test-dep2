import { useCallback, useEffect, useRef, useState } from 'react';

export interface LiveQueryOptions {
  /** Poll interval in ms while the tab is visible. Ignored when `live` is false. Default 30s. */
  intervalMs?: number;
  /** Poll only when true (e.g. the selected range includes today). Default true. */
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
 * Fetches `fetcher` whenever `deps` change and keeps it fresh by polling. Stale responses are discarded,
 * polling pauses while the tab is hidden, and errors are surfaced instead of being swallowed as empty data.
 */
export function useLiveQuery<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList,
  { intervalMs = 30000, live = true }: LiveQueryOptions = {}
): LiveQuery<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const seq = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async (isFirst: boolean) => {
    const mine = ++seq.current;
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

  // Poll while visible.
  useEffect(() => {
    if (!live) return;
    const tick = () => { if (document.visibilityState === 'visible') run(false); };
    const id = window.setInterval(tick, intervalMs);
    const onVisible = () => { if (document.visibilityState === 'visible') run(false); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, intervalMs, ...deps]);

  return { data, error, loading, fetching, updatedAt, refresh: () => run(false) };
}
