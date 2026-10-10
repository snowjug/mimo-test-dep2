import { useEffect, useLayoutEffect, useRef, useCallback } from 'react';

export interface UseAutoUpdateOptions {
  /**
   * True ONLY when the kiosk is in a fully verified, non-active idle state.
   */
  isIdle: boolean;
  /**
   * Polling frequency in milliseconds. Defaults to 60,000 ms (60 seconds).
   */
  checkIntervalMs?: number;
}

/**
 * Pure evaluation logic for update decisions — exported for comprehensive unit testing.
 */
export function evaluateUpdateDecision({
  localVersion,
  remoteVersion,
  isIdle,
  updateAlreadyPending,
}: {
  localVersion: string;
  remoteVersion: string | null;
  isIdle: boolean;
  updateAlreadyPending: boolean;
}): { shouldReload: boolean; shouldSetPending: boolean } {
  if (
    !remoteVersion ||
    remoteVersion === localVersion ||
    remoteVersion === 'dev' ||
    localVersion === 'dev'
  ) {
    return { shouldReload: false, shouldSetPending: updateAlreadyPending };
  }

  // Version has changed
  if (isIdle) {
    return { shouldReload: true, shouldSetPending: true };
  } else {
    return { shouldReload: false, shouldSetPending: true };
  }
}

export function useAutoUpdate({
  isIdle,
  checkIntervalMs = 60000,
}: UseAutoUpdateOptions) {
  const localVersion = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev';
  const updatePendingRef = useRef(false);
  const isCheckingRef = useRef(false);
  const isReloadingRef = useRef(false);
  const isIdleRef = useRef(isIdle);

  // Synchronously update the ref during render to eliminate any microtask race
  isIdleRef.current = isIdle;

  // Use useLayoutEffect so that state transitions (idle -> active) are committed
  // synchronously before browser paint and before any pending fetch microtasks run.
  useLayoutEffect(() => {
    isIdleRef.current = isIdle;
  }, [isIdle]);

  const triggerSafeReload = useCallback(() => {
    // Reload lock: ensure only one reload can ever be triggered
    if (isReloadingRef.current) return;
    isReloadingRef.current = true;

    try {
      console.info('[AutoUpdate] New deployment detected and kiosk is verified idle. Refreshing page...');
      // window.location.reload() preserves full URL, protocol, hostname, and query parameters (?kioskId=CV-001)
      window.location.reload();
    } catch (e) {
      console.error('[AutoUpdate] Reload attempt failed:', e);
      isReloadingRef.current = false;
    }
  }, []);

  const checkForUpdate = useCallback(async () => {
    // Avoid duplicate in-flight checks, dev mode runs, or checking after reload is initiated
    if (isCheckingRef.current || localVersion === 'dev' || isReloadingRef.current) {
      return;
    }

    isCheckingRef.current = true;
    try {
      // Use cache-busting timestamp parameter and strict no-cache headers
      const res = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });

      if (!res.ok) {
        // Non-200 response (e.g. 404/500/offline) — silently wait for next interval
        return;
      }

      const data = await res.json();
      const remoteVersion = data && typeof data.version === 'string' ? data.version : null;

      const decision = evaluateUpdateDecision({
        localVersion,
        remoteVersion,
        isIdle: isIdleRef.current,
        updateAlreadyPending: updatePendingRef.current,
      });

      if (decision.shouldSetPending) {
        updatePendingRef.current = true;
      }

      if (decision.shouldReload) {
        triggerSafeReload();
      } else if (decision.shouldSetPending && !isIdleRef.current) {
        console.info('[AutoUpdate] Version change detected during active session. Deferring reload until return to idle.');
      }
    } catch {
      // Network failure, DNS issue, or offline state — silently ignore and wait for next interval
    } finally {
      isCheckingRef.current = false;
    }
  }, [localVersion, triggerSafeReload]);

  // When returning to idle (e.g., after customer finishes job or timeout resets to attract screen),
  // execute any deferred pending update, or trigger an immediate version poll.
  useEffect(() => {
    if (isIdle) {
      if (updatePendingRef.current) {
        triggerSafeReload();
      } else {
        checkForUpdate();
      }
    }
  }, [isIdle, triggerSafeReload, checkForUpdate]);

  // Periodic polling interval
  useEffect(() => {
    const interval = window.setInterval(() => {
      checkForUpdate();
    }, Math.max(10000, checkIntervalMs));

    return () => {
      window.clearInterval(interval);
    };
  }, [checkForUpdate, checkIntervalMs]);
}
