import { useEffect, useRef, useCallback } from 'react';

interface KioskIdleOptions {
  idleTimeoutSeconds: number;
  currentScreen: string;
  isSubmittingCode: boolean;
  isPrinting: boolean;
  onResetToHome: () => void;
  onTriggerScreensaver: () => void;
  onHideScreensaver: () => void;
}

const JITTER_THRESHOLD_PX = 15;
const CODE_ENTRY_RESET_TIMEOUT_MS = 20000; // 20s on code entry -> return home
const POST_PRINT_RESET_TIMEOUT_MS = 45000;  // 45s on summary/error screen -> return home

export function useKioskIdle({
  idleTimeoutSeconds,
  currentScreen,
  isSubmittingCode,
  isPrinting,
  onResetToHome,
  onTriggerScreensaver,
  onHideScreensaver,
}: KioskIdleOptions) {
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const idleTimerRef = useRef<number | null>(null);
  const homeResetTimerRef = useRef<number | null>(null);

  const clearAllTimers = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (homeResetTimerRef.current !== null) {
      window.clearTimeout(homeResetTimerRef.current);
      homeResetTimerRef.current = null;
    }
  }, []);

  const handleInteraction = useCallback(() => {
    onHideScreensaver();
    clearAllTimers();

    // Do not auto-reset if in-flight network validation or active print execution
    if (isSubmittingCode || isPrinting) {
      return;
    }

    if (currentScreen === 'main-interface') {
      const timeoutMs = Math.max(10, idleTimeoutSeconds) * 1000;
      idleTimerRef.current = window.setTimeout(() => {
        onTriggerScreensaver();
      }, timeoutMs);
    } else if (currentScreen === 'code-entry-screen') {
      homeResetTimerRef.current = window.setTimeout(() => {
        onResetToHome();
      }, CODE_ENTRY_RESET_TIMEOUT_MS);
    } else if (
      currentScreen === 'summary-screen' ||
      currentScreen === 'system-error-screen' ||
      currentScreen === 'maintenance-screen'
    ) {
      homeResetTimerRef.current = window.setTimeout(() => {
        onResetToHome();
      }, POST_PRINT_RESET_TIMEOUT_MS);
    }
  }, [
    currentScreen,
    idleTimeoutSeconds,
    isSubmittingCode,
    isPrinting,
    onHideScreensaver,
    onTriggerScreensaver,
    onResetToHome,
    clearAllTimers,
  ]);

  useEffect(() => {
    // Initial start when screen or parameters change
    handleInteraction();

    const onPointerActivity = (e: MouseEvent | PointerEvent | TouchEvent) => {
      if (e.type === 'mousemove') {
        const me = e as MouseEvent;
        const dx = Math.abs(me.clientX - lastMousePos.current.x);
        const dy = Math.abs(me.clientY - lastMousePos.current.y);
        // Suppress hardware digitizer jitter on optical/USB touch overlays
        if (dx < JITTER_THRESHOLD_PX && dy < JITTER_THRESHOLD_PX) {
          return;
        }
        lastMousePos.current = { x: me.clientX, y: me.clientY };
      }
      handleInteraction();
    };

    const onKeyboardActivity = () => {
      handleInteraction();
    };

    window.addEventListener('mousemove', onPointerActivity, { passive: true });
    window.addEventListener('pointerdown', onPointerActivity, { passive: true });
    window.addEventListener('touchstart', onPointerActivity, { passive: true });
    window.addEventListener('click', onPointerActivity, { passive: true });
    window.addEventListener('keydown', onKeyboardActivity, { passive: true });

    return () => {
      clearAllTimers();
      window.removeEventListener('mousemove', onPointerActivity);
      window.removeEventListener('pointerdown', onPointerActivity);
      window.removeEventListener('touchstart', onPointerActivity);
      window.removeEventListener('click', onPointerActivity);
      window.removeEventListener('keydown', onKeyboardActivity);
    };
  }, [handleInteraction, clearAllTimers]);

  useEffect(() => {
    (window as any).__TRIGGER_SCREENSAVER = () => onTriggerScreensaver();
    (window as any).__HIDE_SCREENSAVER = () => onHideScreensaver();
  }, [onTriggerScreensaver, onHideScreensaver]);
}
