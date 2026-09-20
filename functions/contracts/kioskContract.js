/**
 * MIMO 2.0 — KIOSK API & FIRESTORE SYNC CONTRACT
 * ===================================================
 * This file defines the immutable contract for MIMO 2.0 (SV-002) print synchronization.
 * 
 * CRITICAL RULE:
 * Any change to field names or response types here will break MIMO 2.0 kiosk frontend
 * or Raspberry Pi listener synchronization.
 */

// ================= 1. ENUMS & ALLOWED STATUS VALUES =================
const PRINT_JOB_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  PRINTING: "printing",
  COMPLETED: "completed",
  FAILED: "failed",
  REFUNDED: "refunded",
  CANCELLED: "cancelled"
};

const VALID_KIOSK_STATUSES = new Set([
  PRINT_JOB_STATUS.PAID,
  PRINT_JOB_STATUS.PRINTING,
  PRINT_JOB_STATUS.COMPLETED,
  PRINT_JOB_STATUS.FAILED,
  PRINT_JOB_STATUS.REFUNDED
]);

const VALID_KIOSK_IDS = new Set(["SV-002", "CV-001"]);

// ================= 2. STATE MACHINE TRANSITION RULES =================
// Maps a current status to the set of valid next statuses
const ALLOWED_TRANSITIONS = {
  [PRINT_JOB_STATUS.PENDING]: new Set([PRINT_JOB_STATUS.PAID, PRINT_JOB_STATUS.FAILED, PRINT_JOB_STATUS.CANCELLED]),
  [PRINT_JOB_STATUS.PAID]: new Set([PRINT_JOB_STATUS.PRINTING, PRINT_JOB_STATUS.REFUNDED, PRINT_JOB_STATUS.FAILED, PRINT_JOB_STATUS.CANCELLED]),
  [PRINT_JOB_STATUS.PRINTING]: new Set([PRINT_JOB_STATUS.COMPLETED, PRINT_JOB_STATUS.FAILED, PRINT_JOB_STATUS.REFUNDED]),
  [PRINT_JOB_STATUS.FAILED]: new Set([PRINT_JOB_STATUS.REFUNDED]),
  // Terminal states - CANNOT regress
  [PRINT_JOB_STATUS.COMPLETED]: new Set(), // Immutable!
  [PRINT_JOB_STATUS.REFUNDED]: new Set(),  // Immutable!
  [PRINT_JOB_STATUS.CANCELLED]: new Set()  // Immutable!
};

/**
 * Validates whether a status transition is permitted.
 * Throws an Error if the transition is invalid or regressive.
 */
function validateStateTransition(currentStatus, nextStatus) {
  if (!currentStatus) return true; // Initial creation
  if (currentStatus === nextStatus) return true; // No-op update

  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.has(nextStatus)) {
    throw new Error(
      `[SYNC CONTRACT VIOLATION] Invalid state transition: cannot transition print job from "${currentStatus}" to "${nextStatus}". Completed and terminal states are protected.`
    );
  }
  return true;
}

function canTransition(currentStatus, nextStatus) {
  try {
    return validateStateTransition(currentStatus, nextStatus);
  } catch {
    return false;
  }
}

// ================= 3. CONTRACT VALIDATORS =================

/**
 * Validates /kiosk/print request payload.
 */
function validateKioskPrintRequest(body) {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }
  if (!body.printCode || typeof body.printCode !== "string" || body.printCode.trim() === "") {
    return { valid: false, error: "printCode is required and must be a non-empty string" };
  }
  if (!body.kioskId || typeof body.kioskId !== "string" || body.kioskId.trim() === "") {
    return { valid: false, error: "kioskId is required and must be a non-empty string" };
  }
  return { valid: true };
}

/**
 * Validates /kiosk/print response payload against frontend contract.
 */
function validateKioskPrintResponse(payload) {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Response payload must be an object" };
  }
  if (typeof payload.success !== "boolean") {
    return { valid: false, error: "Response must contain boolean field 'success'" };
  }
  if (payload.success && (!payload.message || typeof payload.message !== "string")) {
    return { valid: false, error: "Successful response must contain string field 'message'" };
  }
  return { valid: true };
}

/**
 * Validates /kiosk/job-status response payload against MIMO 2.0 frontend contract.
 * Frontend explicitly expects:
 * - status: "paid" | "printing" | "completed" | "failed"
 * - isPrinted: boolean
 */
function validateKioskJobStatusResponse(payload) {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Job status response must be a JSON object" };
  }
  if (!payload.status || typeof payload.status !== "string") {
    return { valid: false, error: "Job status response missing required string field 'status'" };
  }
  if (!VALID_KIOSK_STATUSES.has(payload.status)) {
    return { valid: false, error: `Invalid status "${payload.status}". Must be one of: ${Array.from(VALID_KIOSK_STATUSES).join(", ")}` };
  }
  if (typeof payload.isPrinted !== "boolean") {
    return { valid: false, error: "Job status response missing required boolean field 'isPrinted'" };
  }

  // Contract Consistency Checks:
  if (payload.status === PRINT_JOB_STATUS.COMPLETED && payload.isPrinted !== true) {
    return { valid: false, error: "When status is 'completed', isPrinted MUST be true" };
  }
  if (payload.status === PRINT_JOB_STATUS.PRINTING && payload.isPrinted === true) {
    return { valid: false, error: "When status is 'printing', isPrinted CANNOT be true" };
  }

  return { valid: true };
}

/**
 * Validates /kiosk/report-failure request payload.
 */
function validateReportFailureRequest(body) {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }
  if (!body.jobId || typeof body.jobId !== "string" || body.jobId.trim() === "") {
    return { valid: false, error: "jobId is required and must be a non-empty string" };
  }
  return { valid: true };
}

/**
 * Validates required Firestore fields for print_jobs document compatibility.
 */
function validatePrintJobDocument(docData) {
  if (!docData || typeof docData !== "object") {
    return { valid: false, error: "Document data must be an object" };
  }
  const requiredFields = ["printCode", "status", "fileUrl"];
  for (const field of requiredFields) {
    if (docData[field] === undefined || docData[field] === null) {
      return { valid: false, error: `Missing required field '${field}' on print_jobs document` };
    }
  }
  return { valid: true };
}

module.exports = {
  PRINT_JOB_STATUS,
  VALID_KIOSK_STATUSES,
  VALID_KIOSK_IDS,
  ALLOWED_TRANSITIONS,
  validateStateTransition,
  canTransition,
  validateKioskPrintRequest,
  validateKioskPrintResponse,
  validateKioskJobStatusResponse,
  validateReportFailureRequest,
  validatePrintJobDocument
};
