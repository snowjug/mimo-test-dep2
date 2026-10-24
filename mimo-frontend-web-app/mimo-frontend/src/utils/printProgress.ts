/**
 * Pure evaluation function and data contracts for print progress synchronization.
 *
 * Progress is driven only by what the printer has verified: the Pi reads the Brother's page counter and writes
 * `sheetsCompleted` (capped at total - 1) while paper comes out, and `completed` once the last sheet is counted.
 * Nothing here advances with elapsed time, so the bar can never run ahead of the paper.
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
}

export interface PrintProgressResult {
  progress: number;
  statusMsg: string;
  sheetsCompleted: number;
  totalSheets: number;
  isPrinting: boolean;
  /** Backend says the job has not been started on a printer (still `paid`, or no usable status). */
  isWaiting: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  errorMessage?: string;
}

/**
 * Percentage for a job the backend reports as printing, with `completed` of `total` sheets verified by the
 * printer's page counter: 1% once printing is confirmed (no sheet out yet), then each verified sheet's share of
 * 1-99%. Strictly below 100 until the job itself is reported completed: only the Pi's completion (final sheet
 * counted) may show 100%.
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
}: PrintProgressInput): PrintProgressResult {
  const isDuplex = doubleSided === true || doubleSided === 'double';
  const fallbackSheets = (isDuplex ? Math.ceil(pages / 2) : pages) * copies;
  const total = Number(totalSheets) > 0 ? Number(totalSheets) : Math.max(1, fallbackSheets);
  const base = { totalSheets: total, isPrinting: false, isWaiting: false, isCompleted: false, isFailed: false };

  if (status === 'completed' || isPrinted === true) {
    return { ...base, progress: 100, statusMsg: 'Print Completed ✅', sheetsCompleted: total, isCompleted: true };
  }

  if (status === 'failed' || status === 'refunded') {
    const message = errorMsg || 'Printer reported an error.';
    return {
      ...base,
      progress: previousProgress,
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
    let progress = Math.max(previousProgress, verifiedPercent(completed, total));

    // Staged progression before the first physical sheet exits:
    // sentToPrinterAt (CUPS accepted the job): advances to 5%
    // piReceivedAt (Pi listener acquired the job): advances to 2%
    if (completed === 0) {
      if (sentToPrinterAt) {
        progress = Math.max(progress, 5);
      } else if (piReceivedAt) {
        progress = Math.max(progress, 2);
      }
    }
    // Strictly cap below 100% until the completion signal arrives from the hardware
    progress = Math.min(99, progress);

    let statusMsg: string;
    if (total === 1) {
      statusMsg = sentToPrinterAt ? 'Printing your page…' : piReceivedAt ? 'Preparing your page…' : 'Printing your page…';
    } else if (completed === 0) {
      statusMsg = sentToPrinterAt ? `Sending ${total} sheets to printer…` : piReceivedAt ? `Preparing ${total} sheets…` : `Printing ${total} sheets…`;
    } else {
      statusMsg = `${completed} of ${total} sheets printed…`;
    }

    return { ...base, progress, statusMsg, sheetsCompleted: completed, isPrinting: true };
  }

  // 'paid' (not yet started on a printer), or an unusable response: no progress is claimed.
  return {
    ...base,
    progress: previousProgress,
    statusMsg: 'Waiting for the printer to start…',
    sheetsCompleted: previousSheetsCompleted,
    isWaiting: true,
  };
}
