/**
 * Pure evaluation function and data contracts for print progress synchronization.
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
}

export interface PrintProgressResult {
  progress: number;
  milestoneFloor: number;
  milestoneCeiling: number;
  statusMsg: string;
  sheetsCompleted: number;
  totalSheets: number;
  isPrinting: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  errorMessage?: string;
}

export interface MilestoneBounds {
  floor: number;
  ceiling: number;
}

/**
 * Calculates the milestone floor and ceiling percentage for in-flight progress presentation.
 * - Single-sheet job: floor = 1%, ceiling = 90% (strictly < 100% until physically confirmed).
 * - Multi-sheet job:
 *     floor = k === 0 ? 1 : Math.round((k / N) * 95)
 *     ceiling = Math.min(95, Math.round(((k + 0.85) / N) * 95))
 */
export function calculateMilestoneBounds(
  completedSheets: number,
  totalSheets: number
): MilestoneBounds {
  const total = Math.max(1, totalSheets);
  const completed = Math.max(0, Math.min(total, completedSheets));

  if (total === 1) {
    return {
      floor: 1,
      ceiling: 90,
    };
  }

  if (completed === 0) {
    const ceiling = Math.min(95, Math.max(1, Math.round((0.85 / total) * 95)));
    return {
      floor: 1,
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
 * Fast B&W laser (~3.5-4.5s per sheet): 40ms (<70%), 60ms (<85%), 100ms (<90%)
 * Color inkjet (~20-25s per sheet): 200ms
 */
export function getVisualTickDelay(currentProgress: number, colorMode = 'bw'): number {
  const isColor = colorMode === 'color';
  if (isColor) {
    return 200;
  }
  if (currentProgress < 70) return 40;
  if (currentProgress < 85) return 60;
  return 100;
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
}: PrintProgressInput): PrintProgressResult {
  const isDuplex = doubleSided === true || doubleSided === 'double';
  const fallbackSheets = (isDuplex ? Math.ceil(pages / 2) : pages) * copies;
  const total = Number(totalSheets) || Math.max(1, fallbackSheets);

  if (status === 'completed' || isPrinted === true) {
    return {
      progress: 100,
      milestoneFloor: 100,
      milestoneCeiling: 100,
      statusMsg: 'Print Completed ✅',
      sheetsCompleted: total,
      totalSheets: total,
      isPrinting: false,
      isCompleted: true,
      isFailed: false,
    };
  }

  if (status === 'failed' || status === 'refunded') {
    return {
      progress: previousProgress,
      milestoneFloor: previousProgress,
      milestoneCeiling: previousProgress,
      statusMsg: errorMsg || 'Printer reported an error.',
      sheetsCompleted: previousSheetsCompleted,
      totalSheets: total,
      isPrinting: false,
      isCompleted: false,
      isFailed: true,
      errorMessage: errorMsg || 'Printer reported an error.',
    };
  }

  if (status === 'printing') {
    const rawCompleted = Number(sheetsCompleted);
    const validRaw = !isNaN(rawCompleted) && rawCompleted >= 0 ? rawCompleted : 0;
    // Monotonic bounds: keep sheets count within [previousSheetsCompleted, total]
    const completed = Math.min(total, Math.max(previousSheetsCompleted, validRaw));
    const bounds = calculateMilestoneBounds(completed, total);

    // Initialise at least to floor when actively printing, clamp within [floor, ceiling]
    const currentClamped = Math.min(
      bounds.ceiling,
      Math.max(bounds.floor, previousProgress)
    );

    let statusMsg: string;
    if (total === 1) {
      statusMsg = 'Printing document…';
    } else if (completed === 0) {
      statusMsg = 'Warming up printer…';
    } else {
      statusMsg = `Printing sheet ${completed} of ${total}…`;
    }

    return {
      progress: currentClamped,
      milestoneFloor: bounds.floor,
      milestoneCeiling: bounds.ceiling,
      statusMsg,
      sheetsCompleted: completed,
      totalSheets: total,
      isPrinting: true,
      isCompleted: false,
      isFailed: false,
    };
  }

  // Status 'paid' or initial queue wait while job is already in flight on the printing screen
  if (previousProgress > 0) {
    const rawCompleted = Number(sheetsCompleted);
    const validRaw = !isNaN(rawCompleted) && rawCompleted >= 0 ? rawCompleted : 0;
    const completed = Math.min(total, Math.max(previousSheetsCompleted, validRaw));
    const bounds = calculateMilestoneBounds(completed, total);
    const currentClamped = Math.min(
      bounds.ceiling,
      Math.max(bounds.floor, previousProgress)
    );

    let statusMsg: string;
    if (total === 1) {
      statusMsg = 'Printing document…';
    } else if (completed === 0) {
      statusMsg = 'Warming up printer…';
    } else {
      statusMsg = `Printing sheet ${completed} of ${total}…`;
    }

    return {
      progress: currentClamped,
      milestoneFloor: bounds.floor,
      milestoneCeiling: bounds.ceiling,
      statusMsg,
      sheetsCompleted: completed,
      totalSheets: total,
      isPrinting: true,
      isCompleted: false,
      isFailed: false,
    };
  }

  // Initial queue wait before in-flight progress begins
  return {
    progress: 0,
    milestoneFloor: 0,
    milestoneCeiling: 0,
    statusMsg: 'Warming up printer…',
    sheetsCompleted: 0,
    totalSheets: total,
    isPrinting: false,
    isCompleted: false,
    isFailed: false,
  };
}
