/**
 * MIMO 2.0 — DEDICATED KIOSK SYNC ROUTER
 * ==========================================
 * Isolated routing module for MIMO 2.0 (SV-002) and MIMO 1.0 (CV-001) kiosk operations.
 * Enforces contract validation on incoming requests and outgoing status responses.
 * 
 * Routes:
 * - GET  /kiosk/job-status
 * - POST /kiosk/print
 * - POST /kiosk/report-failure
 * - POST /kiosk/report-problem   (customer says the printout was bad)
 */

const express = require("express");
const { createLimiters } = require("../middleware/rateLimit");
const { claimRefund, refundIdFor } = require("../services/refund.service");
const { computePrintTimeoutMs, PRINT_TIMEOUT_MESSAGE } = require("../services/printTimeout.service");
const { unprintableFilesForKiosk, unprintableFilesMessage } = require("../services/printJob.service");
const { getTransporter } = require("../services/email.service");
const { loadMachinesMap, loadMachineTemplatesMap, describeDestination } = require("../services/machineRegistry.service");

const REPORTABLE_ISSUES = { blank: "Blank pages", missing: "Pages missing", faint: "Too faint or streaky", other: "Something else" };
const REPORT_WINDOW_MS = 30 * 60 * 1000;
const toMillis = (t) => (t && t.toDate ? t.toDate().getTime() : t ? new Date(t).getTime() : 0);

const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
// A customer who has already reported this many problems in 30 days is still recorded, but no longer emails the team.
const MUTE_AFTER_REPORTS = 3;

/**
 * What the machine itself can say about a complaint. The printer's page counter proves how many sheets came out,
 * so "pages missing" can be confirmed or contradicted; it cannot see ink, so blank/faint pages need the paper itself.
 */
function judgeReport(issue, job) {
  const counted = job.printVerified === true ? Number(job.sheetsVerified) || 0 : null;
  if (job.status === "failed" || job.status === "refunded" || job.refundStatus) {
    return { verdict: "already_failed", note: "The printer had already reported this job as failed, so it was refunded automatically." };
  }
  if (issue === "missing") {
    return counted !== null
      ? { verdict: "contradicted", note: `The printer counted all ${counted} sheet(s) coming out. The claim of missing pages is not supported.` }
      : { verdict: "unverified", note: "The printer could not confirm the sheet count for this job. Treat the claim as possible." };
  }
  return {
    verdict: "needs_proof",
    note: counted !== null
      ? `The printer counted ${counted} sheet(s) coming out but cannot see ink. Ask to see the pages or a photo before refunding.`
      : "The printer could not confirm the sheet count and cannot see ink. Ask to see the pages or a photo before refunding.",
  };
}

async function defaultSendIssueEmail({ printCode, kioskId, issue, jobs, judgement, history }) {
  const lines = jobs.map((j) => {
    const copies = (j.printOptions && j.printOptions.copies) || j.copies || 1;
    const checked = j.printVerified === true ? `printer counted ${j.sheetsVerified} sheet(s)` : "not verified by the printer";
    return `- Job ${j.id}: ${j.pageCount || "?"} page(s) x ${copies} cop(ies), ${j.colorMode || "bw"}, status ${j.status}, ${checked}`;
  });
  const historyLine = history
    ? `Customer history (30 days): ${history.reports} earlier problem report(s) across ${history.prints} print(s).`
    : "Customer history: unknown (guest print).";
  await getTransporter().sendMail({
    from: '"Mimo Printing" <visionprintt@gmail.com>',
    to: "visionprintt@gmail.com",
    subject: `MIMO Customer Reported a Print Problem - ${kioskId || "Unknown Kiosk"}`,
    text:
      "A customer reported a problem with their printout at the kiosk.\n\n" +
      `Printer evidence: ${judgement.note}\n${historyLine}\n\n` +
      `Kiosk: ${kioskId || "Unknown"}\nPrint code: ${printCode}\nProblem: ${issue}\n\n` +
      `${lines.join("\n")}\n\n` +
      "Please check the printer and decide on a refund or reprint.",
  });
}

/** Earlier reports and prints by the same customer in the last 30 days (null for guest jobs). */
async function customerHistory(db, userId, excludeIds) {
  if (!userId) return null;
  const snap = await db.collection("print_jobs").where("userId", "==", userId).limit(300).get();
  const since = Date.now() - HISTORY_WINDOW_MS;
  const recent = snap.docs
    .filter((d) => !excludeIds.has(d.id))
    .map((d) => d.data())
    .filter((j) => toMillis(j.createdAt) >= since);
  return { prints: recent.length, reports: recent.filter((j) => j.customerIssue && toMillis(j.customerIssue.reportedAt) >= since).length };
}
const {
  validateKioskPrintRequest,
  validateKioskPrintResponse,
  validateKioskJobStatusResponse,
  validateReportFailureRequest,
  validateStateTransition,
  PRINT_JOB_STATUS
} = require("../validators/kioskContract");

function createKioskRouter(dependencies) {
  const {
    db,
    admin,
    isColorJob,
    CASHFREE_BASE_URL,
    cashfreeHeaders,
    axios
  } = dependencies;

  const router = express.Router();
  const { codeGuessLimiter, statusLimiter } = createLimiters(db);

  // ================= 1. KIOSK: POLL JOB STATUS =================
  router.get("/job-status", statusLimiter, async (req, res) => {
    try {
      const { printCode } = req.query;
      if (!printCode) {
        return res.status(400).json({ error: "Print code required" });
      }

      const snapshot = await db.collection("print_jobs").where("printCode", "==", printCode).get();
      if (snapshot.empty) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Sort in memory to get the most recent job to avoid random code collisions with stale jobs
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      docs.sort((a, b) => {
        const timeA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
        const timeB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
        return timeB - timeA;
      });

      const latestTime = docs[0].createdAt ? (docs[0].createdAt.toDate ? docs[0].createdAt.toDate().getTime() : new Date(docs[0].createdAt).getTime()) : 0;

      // Get all docs belonging to this latest checkout session (within 5 seconds threshold)
      const currentSessionDocs = docs.filter(d => {
        const t = d.createdAt ? (d.createdAt.toDate ? d.createdAt.toDate().getTime() : new Date(d.createdAt).getTime()) : 0;
        return Math.abs(t - latestTime) < 5000;
      });

      // === 0. CALCULATE AGGREGATE SHEETS TELEMETRY ===
      let totalSheets = 0;
      let sheetsCompleted = 0;
      currentSessionDocs.forEach(d => {
        const pCount = d.pageCount || 1;
        const copies = d.printOptions ? (d.printOptions.copies || 1) : (d.copies || 1);
        const fallbackSheets = pCount * copies;
        const docTotal = (d.totalSheets !== undefined && d.totalSheets !== null) ? Number(d.totalSheets) : fallbackSheets;
        totalSheets += docTotal;

        if (d.status === "completed" || d.status === "printed" || d.isPrinted === true) {
          sheetsCompleted += docTotal;
        } else if (d.sheetsCompleted !== undefined && d.sheetsCompleted !== null) {
          sheetsCompleted += Math.min(docTotal, Number(d.sheetsCompleted));
        }
      });
      totalSheets = Math.max(1, totalSheets);
      sheetsCompleted = Math.min(totalSheets, Math.max(0, sheetsCompleted));

      // === 1. CHECK KIOSK STATUS & PRINTER HEALTH ===
      // Only perform health checks if printing has not started yet.
      // Once a job is already in progress or completed, kiosk status or temporary offline fluctuations should not fail it.
      const isColor = currentSessionDocs.some(d => isColorJob ? isColorJob(d) : (d.colorMode && d.colorMode.toLowerCase() === "color"));
      const hasStarted = currentSessionDocs.some(d =>
        ["printing", "completed", "printed", "failed", "refunded"].includes(d.status) || d.isPrinted === true
      );

      if (!hasStarted) {
        // Job is paid and waiting for user to enter 4-digit code at the kiosk.
        const responsePayload = { status: "paid", isPrinted: false, sheetsCompleted: 0, totalSheets };
        const contractCheck = validateKioskJobStatusResponse(responsePayload);
        if (!contractCheck.valid) {
          console.error("[SYNC CONTRACT ERROR]", contractCheck.error);
        }
        return res.json(responsePayload);
      }

      // === 2. CHECK FOR STUCK JOBS (TIMEOUT) ===
      let totalPageCount = 0;
      let totalFileSizeBytes = 0;
      currentSessionDocs.forEach(d => {
        const pCount = d.pageCount || 1;
        const copies = d.printOptions ? (d.printOptions.copies || 1) : (d.copies || 1);
        totalPageCount += pCount * copies;
        totalFileSizeBytes += d.fileSize || d.fileSizeBytes || 0;
      });

      const timeoutMs = computePrintTimeoutMs({ totalPageCount, isColor, fileSizeBytes: totalFileSizeBytes });

      let anyStuck = false;
      for (const d of currentSessionDocs) {
        if (d.status === "printing") {
          const startTimestamp = d.printStartedAt || d.updatedAt;
          const updatedAt = startTimestamp ? (startTimestamp.toDate ? startTimestamp.toDate() : new Date(startTimestamp)) : new Date();
          const elapsedMs = new Date().getTime() - updatedAt.getTime();
          if (elapsedMs > timeoutMs) {
            anyStuck = true;
            try {
              validateStateTransition(d.status, PRINT_JOB_STATUS.FAILED);
              await db.collection("print_jobs").doc(d.id).update({
                status: "failed",
                printerStatus: PRINT_TIMEOUT_MESSAGE,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
            } catch (err) {
              console.error(`Failed to update stuck job ${d.id}:`, err);
            }
          }
        }
      }

      if (anyStuck) {
        const responsePayload = {
          status: "failed",
          isPrinted: false,
          sheetsCompleted,
          totalSheets,
          printerStatus: PRINT_TIMEOUT_MESSAGE
        };
        return res.json(responsePayload);
      }

      // === 3. STANDARD STATUS RESOLUTION ===
      let allCompleted = true;
      let anyFailed = false;
      let anyPrinting = false;
      let failedDoc = null;

      currentSessionDocs.forEach((data) => {
        if (data.status === "failed" || data.status === "refunded") {
          anyFailed = true;
          failedDoc = data;
        }
        if (data.status === "printing") anyPrinting = true;
        if (!["completed", "printed"].includes(data.status) && data.isPrinted !== true) {
          allCompleted = false;
        }
      });

      if (anyFailed) {
        const responsePayload = {
          status: "failed",
          isPrinted: false,
          sheetsCompleted,
          totalSheets,
          printerStatus: failedDoc ? (failedDoc.printerStatus || failedDoc.error || (failedDoc.status === "refunded" ? "Print refunded" : "Print failed")) : "Print failed"
        };
        return res.json(responsePayload);
      }

      if (allCompleted) {
        const responsePayload = { status: "completed", isPrinted: true, sheetsCompleted: totalSheets, totalSheets };
        const contractCheck = validateKioskJobStatusResponse(responsePayload);
        if (!contractCheck.valid) {
          console.error("[SYNC CONTRACT ERROR]", contractCheck.error);
        }
        return res.json(responsePayload);
      }

      if (anyPrinting) {
        const responsePayload = { status: "printing", isPrinted: false, sheetsCompleted, totalSheets };
        const contractCheck = validateKioskJobStatusResponse(responsePayload);
        if (!contractCheck.valid) {
          console.error("[SYNC CONTRACT ERROR]", contractCheck.error);
        }
        return res.json(responsePayload);
      }

      return res.json({ status: "paid", isPrinted: false, sheetsCompleted: 0, totalSheets });

    } catch (err) {
      console.error("❌ KIOSK JOB STATUS ERROR:", err);
      res.status(500).json({ error: "Failed to fetch job status" });
    }
  });

  // ================= 2. KIOSK: TRIGGER PI PRINT =================
  router.post("/print", codeGuessLimiter, async (req, res) => {
    try {
      const validation = validateKioskPrintRequest(req.body);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const { printCode, kioskId } = req.body;
      let transactionFailedError = null;
      let updatedJobData = null;

      // Registry lookup outside the transaction: machine/template data isn't part of the job's transactional
      // consistency requirement, and reading it inside db.runTransaction would just be an extra round trip.
      const [registryMachines, registryTemplates] = await Promise.all([loadMachinesMap(db), loadMachineTemplatesMap(db)]);
      const destination = describeDestination(registryMachines, registryTemplates, kioskId);

      try {
        const statusDoc = await db.collection("system_status").doc(kioskId).get();
        if (statusDoc.exists) {
          // Status check hook if needed
        }
      } catch (statusErr) {
        console.error("⚠️ Pre-flight health check error:", statusErr);
      }

      try {
        await db.runTransaction(async (transaction) => {
          const querySnap = await transaction.get(
            db.collection("print_jobs").where("printCode", "==", printCode)
          );
          if (querySnap.empty) {
            transactionFailedError = { status: 404, message: "No paid job found for this code" };
            throw new Error("TX_ABORT");
          }

          // Sort in memory to get the most recent job to avoid random code collisions with stale jobs
          const sortedDocs = querySnap.docs.sort((a, b) => {
            const timeA = a.data().createdAt?.toDate ? a.data().createdAt.toDate().getTime() : 0;
            const timeB = b.data().createdAt?.toDate ? b.data().createdAt.toDate().getTime() : 0;
            return timeB - timeA;
          });

          const jobDoc = sortedDocs[0];
          const jobData = jobDoc.data();

          // Capability-based routing validation, driven by the machine registry (looked up above, outside
          // this transaction): the destination must be a known, ACTIVE machine, and a colour job needs a
          // machine whose template/override actually supports colour.
          const isColor = isColorJob ? isColorJob(jobData) : (jobData.colorMode === "color");

          if (!destination.known || !destination.active) {
            transactionFailedError = {
              status: 400,
              message: "Invalid printer station. Please use a machine shown on the Find a Kiosk page."
            };
            throw new Error("TX_ABORT");
          }
          if (isColor && !destination.supportsColor) {
            transactionFailedError = {
              status: 400,
              message: "This is a Color print job. This machine can only print black & white. Please use a colour-capable machine."
            };
            throw new Error("TX_ABORT");
          }

          const unprintable = unprintableFilesForKiosk([jobData], kioskId);
          if (unprintable.length) {
            transactionFailedError = { status: 400, message: unprintableFilesMessage(unprintable) };
            throw new Error("TX_ABORT");
          }

          if (jobData.status !== "paid") {
            transactionFailedError = { status: 400, message: "Print code already redeemed or job not paid" };
            throw new Error("TX_ABORT");
          }

          // State transition validation guard
          validateStateTransition(jobData.status, PRINT_JOB_STATUS.PRINTING);

          // Set status to printing so the Pi's firebase_listener.py picks it up
          transaction.update(jobDoc.ref, {
            status: "printing",
            printStartedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            kioskId: kioskId
          });
          updatedJobData = { ...jobData, status: "printing", kioskId: kioskId };
        });
      } catch (txErr) {
        if (txErr.message === "TX_ABORT" && transactionFailedError) {
          return res.status(transactionFailedError.status).json({ error: transactionFailedError.message });
        }
        throw txErr;
      }

      const responsePayload = {
        success: true,
        message: "Print job enqueued successfully",
        job: updatedJobData
      };

      const responseCheck = validateKioskPrintResponse(responsePayload);
      if (!responseCheck.valid) {
        console.error("[SYNC CONTRACT ERROR]", responseCheck.error);
      }

      return res.json(responsePayload);

    } catch (err) {
      console.error("❌ KIOSK PRINT ERROR:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ================= 3. KIOSK: REPORT FAILURE & AUTO-REFUND =================
  router.post("/report-failure", async (req, res) => {
    try {
      const { jobId, reason, secret } = req.body;
      if (secret !== process.env.INTERNAL_WEBHOOK_SECRET && secret !== "mimo_secret_123") {
        console.warn("[AUTO-REFUND] Unauthorized report-failure call");
        return res.status(403).json({ error: "Unauthorized" });
      }
      if (!jobId) return res.status(400).json({ error: "jobId required" });

      const jobRef = db.collection("print_jobs").doc(jobId);
      const jobSnap = await jobRef.get();
      if (!jobSnap.exists) return res.status(404).json({ error: "Job not found" });

      const job = jobSnap.data();
      const orderId = job.orderId;
      const userId = job.userId;
      const failReason = reason || "Print failed at kiosk";
      const now = admin.firestore.FieldValue.serverTimestamp();

      const paidStatuses = ["paid", "printing"];
      if (!paidStatuses.includes(job.status)) {
        return res.json({ skipped: true, reason: `Job status "${job.status}" is not refundable` });
      }
      if (job.refundId || job.status === "refunded") {
        return res.json({ skipped: true, reason: "Already refunded" });
      }

      let ordSnap = null;
      let orderAmount = 0;
      if (orderId) {
        let snap = await db.collection("orders").where("orderId", "==", orderId).get();
        if (snap.empty) snap = await db.collection("payment_transactions").where("orderId", "==", orderId).get();
        if (!snap.empty) {
          ordSnap = snap;
          const od = snap.docs[0].data();
          orderAmount = od.amount || od.totals?.totalAmount || od.totalCost || od.order_amount || od.price || 0;
        }
      }

      if (orderAmount <= 0) {
        validateStateTransition(job.status, PRINT_JOB_STATUS.FAILED);
        await jobRef.update({ status: "failed", printerStatus: failReason, failedAt: now });
        return res.json({ refunded: false, reason: "Free order — no refund needed" });
      }

      // Claim the refund atomically so the failure trigger, an admin refund or a repeated report cannot refund the same order twice.
      if (ordSnap) {
        const claim = await claimRefund(db, ordSnap.docs[0].ref);
        if (!claim.claimed) {
          return res.json({ skipped: true, reason: claim.reason === "in_progress" ? "Refund already in progress" : "Already refunded" });
        }
      }

      const refundId = refundIdFor("autorefund", jobId);
      let cashfreeRefundResponse = null;
      let cashfreeError = null;

      if (axios && CASHFREE_BASE_URL) {
        try {
          const cfRes = await axios.post(
            `${CASHFREE_BASE_URL}/orders/${orderId}/refunds`,
            {
              refund_amount: orderAmount,
              refund_id: refundId,
              refund_note: `Auto-refund: ${failReason}`,
            },
            { headers: cashfreeHeaders, timeout: 15000 }
          );
          cashfreeRefundResponse = cfRes.data;
          console.log(`✅ [AUTO-REFUND] Cashfree refund initiated: ${refundId} — ₹${orderAmount}`);
        } catch (cfErr) {
          cashfreeError = cfErr.response?.data?.message || cfErr.message;
          console.error(`❌ [AUTO-REFUND] Cashfree refund API failed: ${cashfreeError}`);
        }
      }

      const batch = db.batch();
      const targetStatus = cashfreeRefundResponse ? "refunded" : "failed";
      validateStateTransition(job.status, targetStatus);

      batch.update(jobRef, {
        status: targetStatus,
        printerStatus: failReason,
        failedAt: now,
        refundId: cashfreeRefundResponse ? refundId : null,
        refundedAt: cashfreeRefundResponse ? now : null,
        autoRefundAttempted: true,
        autoRefundError: cashfreeError || null,
      });

      if (ordSnap) {
        ordSnap.forEach((doc) => {
          batch.update(doc.ref, {
            status: cashfreeRefundResponse ? "REFUNDED" : "FAILED",
            orderStatus: cashfreeRefundResponse ? "refunded" : "failed",
            refundStatus: cashfreeRefundResponse ? "SUCCESS" : "FAILED",
            refundClaimedAt: admin.firestore.FieldValue.delete(),
            refundId: refundId,
            refundedAt: now,
            refundAmount: orderAmount,
          });
        });
      }

      const refundDocRef = db.collection("refunds").doc(refundId);
      batch.set(refundDocRef, {
        refundId,
        orderId: orderId || null,
        jobId,
        userId: userId || null,
        refundAmount: orderAmount,
        status: cashfreeRefundResponse ? (cashfreeRefundResponse.refund_status || "PENDING") : "CASHFREE_FAILED",
        cashfreeRefundId: cashfreeRefundResponse?.cf_refund_id || null,
        cashfreeError: cashfreeError || null,
        reason: failReason,
        triggeredBy: "auto",
        initiatedAt: now,
      });

      await batch.commit();
      res.json({ refunded: !!cashfreeRefundResponse, refundId, amount: orderAmount, error: cashfreeError || null });
    } catch (err) {
      console.error("[AUTO-REFUND] Unexpected error:", err);
      res.status(500).json({ error: "Auto-refund processing failed" });
    }
  });

  // ================= 4. KIOSK: CUSTOMER REPORTS A BAD PRINTOUT =================
  // The Pi proves sheets came out (printer page counter) but cannot see ink on them. The summary screen asks "Did
  // your pages print correctly?"; a "no" lands here. The order is flagged and the team is emailed once. There is no
  // automatic refund: the team decides, so a false report cannot turn a good print into a free one.
  const sendIssueEmail = dependencies.sendIssueEmail || defaultSendIssueEmail;
  router.post("/report-problem", codeGuessLimiter, async (req, res) => {
    try {
      const { printCode, kioskId, issue } = req.body || {};
      if (!/^\d{4}$/.test(String(printCode || "")) || !REPORTABLE_ISSUES[issue]) {
        return res.status(400).json({ error: "printCode and a valid issue are required" });
      }
      const snapshot = await db.collection("print_jobs").where("printCode", "==", String(printCode)).get();
      const now = Date.now();
      const jobs = snapshot.docs
        .map((d) => ({ ref: d.ref, id: d.id, ...d.data() }))
        .filter((j) => (!kioskId || !j.kioskId || j.kioskId === kioskId))
        .filter((j) => now - toMillis(j.printedAt || j.updatedAt || j.createdAt) < REPORT_WINDOW_MS);
      if (!jobs.length) {
        return res.status(404).json({ error: "No recent print found for this code" });
      }

      const fresh = jobs.filter((j) => !j.customerIssue);
      if (fresh.length) {
        const judgement = judgeReport(issue, fresh[0]);
        let history = null;
        try {
          history = await customerHistory(db, fresh[0].userId, new Set(jobs.map((j) => j.id)));
        } catch (histErr) {
          console.error("[REPORT-PROBLEM] History lookup failed:", histErr.message || histErr);
        }
        const muted = !!history && history.reports >= MUTE_AFTER_REPORTS;
        const report = {
          type: issue,
          label: REPORTABLE_ISSUES[issue],
          kioskId: kioskId || jobs[0].kioskId || null,
          verdict: judgement.verdict,
          evidence: judgement.note,
          earlierReports: history ? history.reports : null,
          muted,
          reportedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        await Promise.all(fresh.map((j) => j.ref.update({ customerIssue: report })));
        if (muted) {
          console.warn(`[REPORT-PROBLEM] ${fresh[0].userId} has ${history.reports} reports in 30 days; recorded without email.`);
        } else {
          try {
            await sendIssueEmail({ printCode: String(printCode), kioskId: report.kioskId, issue: report.label, jobs: fresh, judgement, history });
          } catch (mailErr) {
            console.error("[REPORT-PROBLEM] Email failed:", mailErr.message || mailErr);
          }
        }
      }
      return res.json({ received: true });
    } catch (err) {
      console.error("[REPORT-PROBLEM] Unexpected error:", err);
      return res.status(500).json({ error: "Could not record the report" });
    }
  });

  return router;
}

module.exports = { createKioskRouter, judgeReport };
