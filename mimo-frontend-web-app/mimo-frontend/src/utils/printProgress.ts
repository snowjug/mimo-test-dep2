/**
 * Pure evaluation function and data contracts for print progress synchronization.
 *
 * Implements continuous, milestone-bounded progress inspired by MIMO 2.0 and adapted
 * for MIMO 1.0 (CV-001 Brother B&W Laser / SV-002 Epson Inkjet).
 *
 * Key guarantees:
 * 1. Progress moves continuously and visibly from 1% toward 100% (never freezing at 1%).
 * 2. In-flight progress is strictly capped below 100% (at milestone ceiling, e.g. 95%).
 * 3. 100% is ONLY displayed when the authoritative completion signal confirms printing is done.
 * 4. Progress is strictly monotonic: out-of-order or delayed polls can never move it backwards.
 * 5. Hardware events (piReceivedAt, sentToPrinterAt, sheetsCompleted) dynamically lift
 *    floors and ceilings in real time.
 */

export interface PrintProgressInput {
  status?: string;
  isPrinted?: boolean;
  sheetsCompleted?: number | string | null;
  totalSheets?: number | string | null;
  previousProgress: number;
  previousSheetsCompleted: number;
  pages?: number;
  copies?: number;
  doubleSided?: boolean | string;
  errorMsg?: string;
  piReceivedAt?: string | null;
  sentToPrinterAt?: string | null;
  colorMode?: 'color' | 'bw';
}

export interface PrintProgressResult {
  progress: number;
  milestoneFloor: number;
  milestoneCeiling: number;
  statusMsg: string;
  sheetsCompleted: number;
  totalSheets: number;
  isPrinting: boolean;
  isWaiting: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  errorMessage?: string;
}

export interface MilestoneBounds {
  floor: number;
  ceiling: number;
}

/**
 * Calculates milestone floor and ceiling percentages for in-flight progress presentation.
 * - Single-sheet job: floor = stageFloor (1%, 2% on piReceivedAt, 5% on sentToPrinterAt), ceiling = 95%.
 * - Multi-sheet B&W job:
 *     completed === 0: floor = stageFloor, ceiling = Math.min(95, Math.round((0.85 / N) * 95))
 *     completed > 0: floor = Math.round((k / N) * 95), ceiling = Math.min(95, Math.round(((k + 0.85) / N) * 95))
 * - Color inkjet job (Epson L3250):
 *     No hardware sheet counter telemetry exists during print; ceiling stays at 95% while pacing smoothly.
 */
export function calculateMilestoneBounds(
  completedSheets: number,
  totalSheets: number,
  colorMode: 'color' | 'bw' = 'bw',
  piReceivedAt?: string | null,
  sentToPrinterAt?: string | null
): MilestoneBounds {
  const total = Math.max(1, totalSheets);
  const completed = Math.max(0, Math.min(total, completedSheets));

  // Determine base floor from hardware stage when 0 sheets have physically completed
  let stageFloor = 1;
  if (completed === 0) {
    if (sentToPrinterAt) {
      stageFloor = 5;
    } else if (piReceivedAt) {
      stageFloor = 2;
    }
  }

  if (colorMode === 'color') {
    if (completed === total) {
      return { floor: 100, ceiling: 100 };
    }
    const floor = completed > 0 ? Math.min(95, Math.round((completed / total) * 95)) : stageFloor;
    return {
      floor,
      ceiling: 95,
    };
  }

  if (completed >= total) {
    return {
      floor: 95,
      ceiling: 95,
    };
  }

  if (total === 1) {
    return {
      floor: stageFloor,
      ceiling: 95,
    };
  }

  if (completed === 0) {
    const rawCeiling = Math.round((0.85 / total) * 95);
    const ceiling = Math.min(95, Math.max(stageFloor, rawCeiling));
    return {
      floor: stageFloor,
      ceiling,
    };
  }

  const floor = Math.min(95, Math.round((completed / total) * 95));
  const ceiling = Math.min(95, Math.round(((completed + 0.85) / total) * 95));

  return {
    floor,
    ceiling: Math.max(floor, ceiling),
  };
}

/**
 * Pure visual step progression helper.
 * Advances progress by step towards ceiling while respecting milestone bounds.
 */
export function stepVisualProgress(
  currentProgress: number,
  bounds: MilestoneBounds,
  isCompleted = false,
  isFailed = false,
  step = 1
): number {
  if (isCompleted) return 100;
  if (isFailed) return currentProgress;
  if (currentProgress < bounds.floor) return bounds.floor;
  if (currentProgress < bounds.ceiling) {
    return Math.min(bounds.ceiling, currentProgress + step);
  }
  return currentProgress;
}

/**
 * Calculates adaptive tick interval (in ms) for smooth visual progress.
 * Calibrated for Brother B&W laser (~3.5s warmup + ~2.2s/sheet) and Epson Color Inkjet.
 * For single-sheet jobs, decelerates smoothly as it nears ceiling to avoid abrupt freezing.
 */
export function getVisualTickDelay(currentProgress: number, colorMode = 'bw', totalSheets = 1): number {
  const isColor = colorMode === 'color';
  if (totalSheets > 1) {
    if (isColor) {
      // Epson Color Inkjet: ~12s warmup + ~16s per physical sheet
      const expectedTotalMs = (12 + totalSheets * 16) * 1000;
      return Math.max(150, Math.round(expectedTotalMs / 95));
    }
    // Brother B&W Laser: ~3.5s warmup + ~2.2s per physical sheet
    const expectedTotalMs = (3.5 + totalSheets * 2.2) * 1000;
    return Math.max(40, Math.round(expectedTotalMs / 95));
  }

  if (isColor) {
    return 200;
  }

  // Single-sheet B&W Laser (~8-9s total physical print lifecycle)
  // Progressive deceleration as progress approaches the in-flight ceiling (95%)
  if (currentProgress < 50) return 60;
  if (currentProgress < 75) return 85;
  if (currentProgress < 88) return 120;
  return 160;
}

/**
 * Legacy verified share helper kept for backwards compatibility.
 */
export function verifiedPercent(completed: number, total: number): number {
  const t = Math.max(1, total);
  const c = Math.max(0, Math.min(t, completed));
  return Math.min(99, 1 + Math.floor((c / t) * 98));
}

/**
 * Pure evaluation function for print progress and status messages.
 */
export function calculatePrintProgress({
  status,
  isPrinted,
  sheetsCompleted,
  totalSheets,
  previousProgress,
  previousSheetsCompleted,
  pages = 1,
  copies = 1,
  doubleSided = false,
  errorMsg,
  piReceivedAt,
  sentToPrinterAt,
  colorMode = 'bw',
}: PrintProgressInput): PrintProgressResult {
  const isDuplex = doubleSided === true || doubleSided === 'double';
  const fallbackSheets = (isDuplex ? Math.ceil(pages / 2) : pages) * copies;
  const total = Number(totalSheets) > 0 ? Number(totalSheets) : Math.max(1, fallbackSheets);
  const base = { totalSheets: total, isPrinting: false, isWaiting: false, isCompleted: false, isFailed: false };

  if (status === 'completed' || isPrinted === true) {
    return {
      ...base,
      progress: 100,
      milestoneFloor: 100,
      milestoneCeiling: 100,
      statusMsg: 'Print Completed ✅',
      sheetsCompleted: total,
      isCompleted: true,
    };
  }

  if (status === 'failed' || status === 'refunded') {
    const message = errorMsg || 'Printer reported an error.';
    return {
      ...base,
      progress: previousProgress,
      milestoneFloor: previousProgress,
      milestoneCeiling: previousProgress,
      statusMsg: message,
      sheetsCompleted: previousSheetsCompleted,
      isFailed: true,
      errorMessage: message,
    };
  }

  if (status === 'printing') {
    const raw = Number(sheetsCompleted);
    const valid = Number.isFinite(raw) && raw >= 0 ? raw : 0;
    // Monotonic: a delayed or out-of-order response can never move the bar backwards.
    const completed = Math.min(total, Math.max(previousSheetsCompleted, valid));
    const bounds = calculateMilestoneBounds(completed, total, colorMode, piReceivedAt, sentToPrinterAt);

    // Initialise at least to floor when actively printing, clamp within [floor, ceiling]
    // Strictly preserve monotonicity: never drop below previousProgress
    const currentClamped = Math.min(
      bounds.ceiling,
      Math.max(bounds.floor, previousProgress)
    );

    let statusMsg: string;
    if (total === 1) {
      statusMsg = sentToPrinterAt
        ? 'Printing your page…'
        : piReceivedAt
        ? 'Preparing your page…'
        : 'Printing your page…';
    } else if (completed === 0) {
      statusMsg = sentToPrinterAt
        ? `Sending ${total} sheets to printer…`
        : piReceivedAt
        ? `Preparing ${total} sheets…`
        : `Printing ${total} sheets…`;
    } else {
      statusMsg = `${completed} of ${total} sheets printed…`;
    }

    return {
      ...base,
      progress: currentClamped,
      milestoneFloor: bounds.floor,
      milestoneCeiling: bounds.ceiling,
      statusMsg,
      sheetsCompleted: completed,
      isPrinting: true,
    };
  }

  // Active in-flight recovery (after reload or intermediate state)
  if (previousProgress > 0 || piReceivedAt || sentToPrinterAt) {
    const raw = Number(sheetsCompleted);
    const valid = Number.isFinite(raw) && raw >= 0 ? raw : 0;
    const completed = Math.min(total, Math.max(previousSheetsCompleted, valid));
    const bounds = calculateMilestoneBounds(completed, total, colorMode, piReceivedAt, sentToPrinterAt);
    const currentClamped = Math.min(
      bounds.ceiling,
      Math.max(bounds.floor, previousProgress)
    );

    let statusMsg: string;
    if (total === 1) {
      statusMsg = sentToPrinterAt
        ? 'Printing your page…'
        : piReceivedAt
        ? 'Preparing your page…'
        : 'Printing your page…';
    } else if (completed === 0) {
      statusMsg = sentToPrinterAt
        ? `Sending ${total} sheets to printer…`
        : piReceivedAt
        ? `Preparing ${total} sheets…`
        : `Printing ${total} sheets…`;
    } else {
      statusMsg = `${completed} of ${total} sheets printed…`;
    }

    return {
      ...base,
      progress: currentClamped,
      milestoneFloor: bounds.floor,
      milestoneCeiling: bounds.ceiling,
      statusMsg,
      sheetsCompleted: completed,
      isPrinting: true,
    };
  }

  // 'paid' (not yet started on a printer), or an unusable response: no progress is claimed.
  return {
    ...base,
    progress: 0,
    milestoneFloor: 0,
    milestoneCeiling: 0,
    statusMsg: 'Waiting for the printer to start…',
    sheetsCompleted: 0,
    isWaiting: true,
  };
}
