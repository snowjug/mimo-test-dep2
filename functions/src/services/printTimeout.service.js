// Shared "how long is this print job allowed to take before we give up" formula.
// Used by both the reactive check in routes/kiosk.routes.js (runs when /kiosk/job-status
// is polled) and the proactive sweep in triggers/printTimeout.trigger.js (runs on a
// schedule, so a stuck job is still resolved even if nothing ever polls it again).

const PRINT_TIMEOUT_MESSAGE = "Print timeout: Printer not responding (check power/cable)";
const PI_PICKUP_TIMEOUT_MS = 60 * 1000;
const PI_PICKUP_TIMEOUT_MESSAGE = "Print job failed: Pi is not able to reach the job (timeout after 60s).";

// Base warmup: 600s (10 min) — covers the Pi receiving the Firestore snapshot,
// downloading, compressing and spooling to USB before the printer even starts.
const BASE_WARMUP_SEC = 600;
const SEC_PER_PAGE_COLOR = 360; // Epson EcoTank inkjet color needs ~5-6 min/page
const SEC_PER_PAGE_BW = 15;     // B&W laser ~15s/page
const FILE_SIZE_BONUS_CAP_SEC = 600;

function computePrintTimeoutMs({ totalPageCount, isColor, fileSizeBytes = 0 }) {
  const pages = Math.max(1, Number(totalPageCount) || 1);
  const secPerPage = isColor ? SEC_PER_PAGE_COLOR : SEC_PER_PAGE_BW;
  const fileSizeBonusSec = Math.min(Math.floor((Number(fileSizeBytes) || 0) / (100 * 1024)), FILE_SIZE_BONUS_CAP_SEC);
  return (BASE_WARMUP_SEC + pages * secPerPage + fileSizeBonusSec) * 1000;
}

function toTimestampMs(ts) {
  if (!ts) return 0;
  const ms = ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function hasPiReachedJob(doc) {
  if (!doc || typeof doc !== "object") return false;
  return Boolean(
    doc.piReceivedAt ||
    doc.sentToPrinterAt ||
    doc.autoResumedAt ||
    doc.isPrinted === true ||
    Number(doc.sheetsCompleted) > 0
  );
}

/**
 * Evaluates whether an in-flight "printing" job has exceeded either:
 *   1. Its full execution timeout (`computePrintTimeoutMs`), OR
 *   2. The 60-second Pi pickup window (`PI_PICKUP_TIMEOUT_MS`) when the Pi has not reached it.
 * Returns null if still within budget, or { kind, reason, elapsedMs, timeoutMs }.
 */
function evaluatePrintingJobTimeout({
  job,
  sessionDocs,
  busyKioskIds,
  isColor = false,
  totalPageCount,
  totalFileSizeBytes,
  nowMs = Date.now(),
}) {
  if (!job || job.status !== "printing") return null;

  const startMs = toTimestampMs(job.printStartedAt) || toTimestampMs(job.updatedAt);
  if (!startMs) return null;

  const elapsedMs = nowMs - startMs;
  const pages = totalPageCount ?? Math.max(1, (job.pageCount || 1) * (job.printOptions?.copies || job.copies || 1));
  const bytes = totalFileSizeBytes ?? (job.fileSize || job.fileSizeBytes || 0);
  const fullTimeoutMs = computePrintTimeoutMs({ totalPageCount: pages, isColor, fileSizeBytes: bytes });

  if (elapsedMs > fullTimeoutMs) {
    return { kind: "execution_timeout", reason: PRINT_TIMEOUT_MESSAGE, elapsedMs, timeoutMs: fullTimeoutMs };
  }

  const piReached =
    hasPiReachedJob(job) ||
    (Array.isArray(sessionDocs) && sessionDocs.some(hasPiReachedJob)) ||
    Boolean(busyKioskIds && job.kioskId && busyKioskIds.has(job.kioskId));

  if (!piReached && elapsedMs >= PI_PICKUP_TIMEOUT_MS) {
    return { kind: "pi_unreachable", reason: PI_PICKUP_TIMEOUT_MESSAGE, elapsedMs, timeoutMs: PI_PICKUP_TIMEOUT_MS };
  }

  return null;
}

module.exports = {
  computePrintTimeoutMs,
  evaluatePrintingJobTimeout,
  hasPiReachedJob,
  toTimestampMs,
  PRINT_TIMEOUT_MESSAGE,
  PI_PICKUP_TIMEOUT_MS,
  PI_PICKUP_TIMEOUT_MESSAGE,
};
