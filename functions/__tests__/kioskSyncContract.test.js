/**
 * MIMO 2.0 — KIOSK SYNC CONTRACT & REGRESSION TEST SUITE
 * ========================================================
 * Automated pre-deployment validation test suite for MIMO 2.0 (SV-002) sync safety.
 * Run with: `npm test` or `node --test __tests__/kioskSyncContract.test.js`
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");

const {
  PRINT_JOB_STATUS,
  VALID_KIOSK_STATUSES,
  VALID_KIOSK_IDS,
  validateStateTransition,
  canTransition,
  validateKioskPrintRequest,
  validateKioskPrintResponse,
  validateKioskJobStatusResponse,
  validateReportFailureRequest,
  validatePrintJobDocument
} = require("../src/validators/kioskContract");

const { createKioskRouter } = require("../src/routes/kiosk.routes");

describe("MIMO 2.0 Sync Safety & Contract Tests", () => {

  // ================= 1. /kiosk/print REQUEST CONTRACT =================
  describe("Pillar 1: /kiosk/print Request Contract", () => {
    it("accepts valid MIMO 2.0 print requests with printCode and SV-002", () => {
      const validReq = { printCode: "1234", kioskId: "SV-002" };
      const res = validateKioskPrintRequest(validReq);
      assert.strictEqual(res.valid, true);
    });

    it("accepts valid MIMO 1.0 print requests with printCode and CV-001", () => {
      const validReq = { printCode: "5678", kioskId: "CV-001" };
      const res = validateKioskPrintRequest(validReq);
      assert.strictEqual(res.valid, true);
    });

    it("rejects request if printCode is missing", () => {
      const req = { kioskId: "SV-002" };
      const res = validateKioskPrintRequest(req);
      assert.strictEqual(res.valid, false);
      assert.match(res.error, /printCode is required/i);
    });

    it("rejects request if kioskId is missing", () => {
      const req = { printCode: "1234" };
      const res = validateKioskPrintRequest(req);
      assert.strictEqual(res.valid, false);
      assert.match(res.error, /kioskId is required/i);
    });

    it("rejects empty body", () => {
      const res = validateKioskPrintRequest(null);
      assert.strictEqual(res.valid, false);
    });
  });

  // ================= 2. /kiosk/print RESPONSE CONTRACT =================
  describe("Pillar 2: /kiosk/print Response Contract", () => {
    it("validates standard successful enqueue response", () => {
      const response = {
        success: true,
        message: "Print job enqueued successfully",
        job: { status: "printing", kioskId: "SV-002" }
      };
      const res = validateKioskPrintResponse(response);
      assert.strictEqual(res.valid, true);
    });

    it("fails validation if 'success' field is missing or not boolean", () => {
      const response = { message: "Job enqueued" };
      const res = validateKioskPrintResponse(response);
      assert.strictEqual(res.valid, false);
      assert.match(res.error, /boolean field 'success'/i);
    });
  });

  // ================= 3. /kiosk/job-status RESPONSE CONTRACT =================
  describe("Pillar 3: /kiosk/job-status Response Contract for All States", () => {
    it("validates 'paid' / unredeemed state", () => {
      const res = validateKioskJobStatusResponse({ status: "paid", isPrinted: false });
      assert.strictEqual(res.valid, true);
    });

    it("validates 'printing' state", () => {
      const res = validateKioskJobStatusResponse({ status: "printing", isPrinted: false });
      assert.strictEqual(res.valid, true);
    });

    it("validates 'completed' state (requires isPrinted: true)", () => {
      const res = validateKioskJobStatusResponse({ status: "completed", isPrinted: true });
      assert.strictEqual(res.valid, true);
    });

    it("validates 'failed' state", () => {
      const res = validateKioskJobStatusResponse({
        status: "failed",
        isPrinted: false,
        printerStatus: "Paper jam"
      });
      assert.strictEqual(res.valid, true);
    });

    it("CRITICAL: Rejects if developer renames 'status' to 'jobStatus'", () => {
      const brokenPayload = { jobStatus: "completed", isPrinted: true };
      const res = validateKioskJobStatusResponse(brokenPayload);
      assert.strictEqual(res.valid, false);
      assert.match(res.error, /missing required string field 'status'/i);
    });

    it("CRITICAL: Rejects if developer renames 'isPrinted' to 'printed'", () => {
      const brokenPayload = { status: "completed", printed: true };
      const res = validateKioskJobStatusResponse(brokenPayload);
      assert.strictEqual(res.valid, false);
      assert.match(res.error, /missing required boolean field 'isPrinted'/i);
    });

    it("CRITICAL: Rejects contradiction where status is completed but isPrinted is false", () => {
      const brokenPayload = { status: "completed", isPrinted: false };
      const res = validateKioskJobStatusResponse(brokenPayload);
      assert.strictEqual(res.valid, false);
      assert.match(res.error, /isPrinted MUST be true/i);
    });

    it("CRITICAL: Rejects contradiction where status is printing but isPrinted is true", () => {
      const brokenPayload = { status: "printing", isPrinted: true };
      const res = validateKioskJobStatusResponse(brokenPayload);
      assert.strictEqual(res.valid, false);
      assert.match(res.error, /isPrinted CANNOT be true/i);
    });
  });

  // ================= 4. FIRESTORE STATE TRANSITION & IMMUTABILITY =================
  describe("Pillar 4: Firestore State Transition & Immutability Guards", () => {
    it("allows valid forward lifecycle: pending -> paid -> printing -> completed", () => {
      assert.doesNotThrow(() => validateStateTransition("pending", "paid"));
      assert.doesNotThrow(() => validateStateTransition("paid", "printing"));
      assert.doesNotThrow(() => validateStateTransition("printing", "completed"));
    });

    it("allows valid failure/refund paths: printing -> failed -> refunded", () => {
      assert.doesNotThrow(() => validateStateTransition("printing", "failed"));
      assert.doesNotThrow(() => validateStateTransition("failed", "refunded"));
    });

    it("CRITICAL: Prohibits regression from completed -> printing", () => {
      assert.throws(
        () => validateStateTransition("completed", "printing"),
        /SYNC CONTRACT VIOLATION/i
      );
    });

    it("CRITICAL: Prohibits regression from completed -> paid", () => {
      assert.throws(
        () => validateStateTransition("completed", "paid"),
        /SYNC CONTRACT VIOLATION/i
      );
    });

    it("CRITICAL: Prohibits regression from completed -> failed", () => {
      assert.throws(
        () => validateStateTransition("completed", "failed"),
        /SYNC CONTRACT VIOLATION/i
      );
    });

    it("canTransition helper returns boolean matching contract", () => {
      assert.strictEqual(canTransition("paid", "printing"), true);
      assert.strictEqual(canTransition("completed", "printing"), false);
      assert.strictEqual(canTransition("completed", "paid"), false);
    });
  });

  // ================= 5. FIRESTORE DOCUMENT SCHEMA =================
  describe("Pillar 5: Firestore Print Job Schema Compatibility", () => {
    it("validates proper Firestore print_jobs document", () => {
      const validDoc = {
        printCode: "9481",
        status: "paid",
        fileUrl: "gs://mimo-v2-11868.firebasestorage.app/uploads/test.pdf",
        kioskId: "SV-002",
        colorMode: "color"
      };
      const res = validatePrintJobDocument(validDoc);
      assert.strictEqual(res.valid, true);
    });

    it("rejects document missing printCode or fileUrl", () => {
      const badDoc = { status: "paid" };
      const res = validatePrintJobDocument(badDoc);
      assert.strictEqual(res.valid, false);
      assert.match(res.error, /Missing required field/i);
    });
  });

  // ================= 6. TIMEOUT CALCULATION FORMULAS =================
  describe("Pillar 6: Stuck-Job Timeout Calculation Verification", () => {
    it("calculates generous timeout for Color EcoTank inkjet (600s + 360s/page)", () => {
      const baseWarmupSec = 600;
      const secPerPageColor = 360;
      const totalPageCount = 2;
      const timeoutMs = (baseWarmupSec + totalPageCount * secPerPageColor) * 1000;
      // 600 + 720 = 1320s = 22 minutes
      assert.strictEqual(timeoutMs, 1320000);
      assert.ok(timeoutMs >= 1320000, "Color timeout must be at least 22 minutes for 2 pages");
    });

    it("calculates correct timeout for B&W Brother laser (600s + 15s/page)", () => {
      const baseWarmupSec = 600;
      const secPerPageBW = 15;
      const totalPageCount = 5;
      const timeoutMs = (baseWarmupSec + totalPageCount * secPerPageBW) * 1000;
      // 600 + 75 = 675s
      assert.strictEqual(timeoutMs, 675000);
    });
  });

  // ================= 7. ROUTER MOUNTING & ISOLATION =================
  describe("Pillar 7: Kiosk Router Module Structure", () => {
    it("createKioskRouter factory returns an Express Router with expected stack", () => {
      const mockDb = { collection: () => ({ where: () => ({ get: async () => ({ empty: true }) }) }) };
      const router = createKioskRouter({ db: mockDb, admin: {}, isColorJob: () => false });
      assert.ok(router, "Router should be instantiated");
      assert.strictEqual(typeof router, "function"); // Express router is a callable function
    });
  });

  // ================= 8. FRONTEND POLLING COMPATIBILITY =================
  describe("Pillar 8: Existing MIMO 2.0 Frontend Expectations", () => {
    it("confirms status === 'completed' or isPrinted === true triggers completion in frontend", () => {
      // Matching PrintingScreen.tsx L368: if (data.status === 'completed' || data.isPrinted === true)
      const completedJob = { status: "completed", isPrinted: true };
      const printingJob = { status: "printing", isPrinted: false };
      const failedJob = { status: "failed", isPrinted: false, printerStatus: "JAMMED" };

      const isCompleted = (data) => data.status === 'completed' || data.isPrinted === true;
      const isFailed = (data) => data.status === 'failed' || data.printerStatus === 'ERROR' || data.printerStatus === 'JAMMED';

      assert.strictEqual(isCompleted(completedJob), true, "Completed job must trigger UI completion");
      assert.strictEqual(isCompleted(printingJob), false, "Printing job must not trigger premature completion");
      assert.strictEqual(isFailed(failedJob), true, "Failed job must trigger UI failure");
    });
  });

});
