// Shared "how long is this print job allowed to take before we give up" formula.
// Used by both the reactive check in routes/kiosk.routes.js (runs when /kiosk/job-status
// is polled) and the proactive sweep in triggers/printTimeout.trigger.js (runs on a
// schedule, so a stuck job is still resolved even if nothing ever polls it again).

const PRINT_TIMEOUT_MESSAGE = "Print timeout: Printer not responding (check power/cable)";

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

module.exports = { computePrintTimeoutMs, PRINT_TIMEOUT_MESSAGE };
