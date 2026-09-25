const axios = require("axios");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { v4: uuidv4 } = require("uuid");
const { CASHFREE_BASE_URL, cashfreeHeaders } = require("../config/env");
const { admin, db } = require("../config/firebase");
const { discoverStoragePaths, isProtectedTemplate, isStoragePathReferencedByOtherActiveJob } = require("../services/storage.service");
const { getTransporter } = require("../services/email.service");
const { sendWhatsAppButtons } = require("../services/whatsapp.service");

// ================= AUTO REFUND LISTENER =================
exports.autoRefundJob = onDocumentUpdated("print_jobs/{jobId}", async (event) => {
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();

  // Trigger ONLY if status changes to "failed"
  if (beforeData.status !== "failed" && afterData.status === "failed") {
    console.log(`[REFUND] Print job ${event.params.jobId} failed. Initiating auto-refund...`);
    const orderId = afterData.orderId;
    if (!orderId) {
      console.log(`[REFUND] No orderId found for job ${event.params.jobId}. Cannot refund.`);
      return;
    }

    // 1. Fetch the Order to get the actual amount paid
    let orderSnapshot = await db.collection("orders").where("orderId", "==", orderId).get();
    if (orderSnapshot.empty) {
      orderSnapshot = await db.collection("payment_transactions").where("orderId", "==", orderId).get();
    }
    if (orderSnapshot.empty) {
      console.log(`[REFUND] Order ${orderId} not found in orders or payment_transactions.`);
      return;
    }
    const orderDoc = orderSnapshot.docs[0];
    const orderData = orderDoc.data();

    // Prevent double refunds
    if (orderData.refundStatus === "SUCCESS") {
      console.log(`[REFUND] Order ${orderId} is already refunded.`);
      return;
    }

    // Skip refund if the amount is zero (100% discount or free order)
    const refundAmount = orderData.amount || orderData.totals?.totalAmount || orderData.totalCost || orderData.order_amount || orderData.price || 0;
    if (refundAmount <= 0) {
      console.log(`[REFUND] Order ${orderId} has a zero amount. Skipping Cashfree refund API call.`);
      await orderDoc.ref.update({
        refundStatus: "SUCCESS",
        refundNote: "Zero amount order, no gateway refund required",
        refundedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return;
    }

    try {
      // 2. Call Cashfree Refunds API
      const refundId = `refund_${uuidv4().replace(/-/g, "").substring(0, 10)}`;
      const response = await axios.post(
        `${CASHFREE_BASE_URL}/orders/${orderId}/refunds`,
        {
          refund_amount: refundAmount,
          refund_id: refundId,
          refund_note: `Auto-refund for failed print job ${event.params.jobId}`
        },
        { headers: cashfreeHeaders, timeout: 10000 }
      );

      console.log(`[REFUND] Cashfree API response for ${orderId}:`, response.data);

      // 3. Update Order in Firestore
      await orderDoc.ref.update({
        refundStatus: "SUCCESS",
        refundId: refundId,
        refundedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`[REFUND] Order ${orderId} successfully marked as refunded in DB.`);
    } catch (err) {
      console.error(`[REFUND ERROR] Failed to refund order ${orderId}:`, err.response?.data || err.message);
      await orderDoc.ref.update({
        refundStatus: "FAILED",
        refundError: err.response?.data?.message || err.message
      });
    }
  }
});

// ================= STORAGE AUTO-CLEANUP =================
exports.autoCleanupStorageJob = onDocumentUpdated("print_jobs/{jobId}", async (event) => {
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();

  // Trigger ONLY if status changes to "completed"
  if (beforeData.status !== "completed" && afterData.status === "completed") {
    const jobId = event.params.jobId;
    console.log(`[STORAGE] Print job ${jobId} completed. Cleaning up files...`);

    const bucket = admin.storage().bucket();
    const storagePaths = discoverStoragePaths(afterData, bucket.name);

    let allSucceeded = true;
    let failureError = null;

    for (const p of storagePaths) {
      // 1. Template protection guard
      if (isProtectedTemplate(p)) {
        console.log(`[STORAGE] Protected template skipped: ${p} for job ${jobId}`);
        continue;
      }

      // 2. Global active cross-job reference check
      const isReferenced = await isStoragePathReferencedByOtherActiveJob(db, p, jobId);
      if (isReferenced) {
        console.log(`[STORAGE] Preserving active referenced path: ${p} for job ${jobId}`);
        continue;
      }

      // 3. Physical Storage deletion
      try {
        await bucket.file(p).delete();
        console.log(`[STORAGE] Successfully deleted ${p} for job ${jobId}`);
      } catch (err) {
        if (err.code === 404) {
          console.log(`[STORAGE] Object already absent (404): ${p} for job ${jobId}`);
        } else {
          console.error(`[STORAGE ERROR] Failed to delete ${p} for job ${jobId}:`, err.message);
          allSucceeded = false;
          failureError = err.message;
        }
      }
    }

    const docRef = db.collection("print_jobs").doc(jobId);
    if (allSucceeded) {
      try {
        await docRef.update({
          fileDeleted: true,
          fileDeletedAt: admin.firestore.FieldValue.serverTimestamp(),
          cleanupState: "completed"
        });
        console.log(`[STORAGE] Print job ${jobId} cleanup metadata updated: fileDeleted=true`);
      } catch (updateErr) {
        console.error(`[STORAGE ERROR] Failed to update cleanup metadata for ${jobId}:`, updateErr.message);
      }
    } else {
      try {
        await docRef.update({
          cleanupState: "failed",
          cleanupError: failureError || "Partial immediate deletion failure"
        });
        console.log(`[STORAGE] Print job ${jobId} marked cleanupState=failed for scheduler retry`);
      } catch (_) {}
    }

    // Send WhatsApp Acknowledgement + "Need More Prints" button
    try {
      let waPhone = null;
      if (afterData.source === "whatsapp" && afterData.userId && afterData.userId.startsWith("wa_")) {
        waPhone = afterData.userId.replace("wa_", "");
      } else if (afterData.userPhone || afterData.phoneNumber) {
        waPhone = afterData.userPhone || afterData.phoneNumber;
      }

      if (waPhone) {
        let normalized = waPhone.replace(/[^\d]/g, "");
        if (normalized.length === 10) normalized = "91" + normalized;

        const machineLabel = (afterData.kioskId === "CV-001" || afterData.printDestination === "CV-001") ? "MIMO 1.0" : "MIMO 2.0";
        await sendWhatsAppButtons(
          normalized,
          `🎉 *PRINT COMPLETE!* 🎉\n\nYour document *${afterData.fileName || "document"}* was successfully printed at *${machineLabel}*! 🖨️✨\n\nNeed to print more files? Click below!`,
          [
            { id: "need_more_prints", title: "📄 Need More Prints" }
          ]
        );
        console.log(`[WHATSAPP] Sent completion acknowledgment to ${normalized}`);
      }
    } catch (waAckErr) {
      console.error("[WHATSAPP ACK ERROR]", waAckErr);
    }
  }
});

exports.sendFailureNotification = onDocumentUpdated(
  {
    document: "print_jobs/{jobId}",
    secrets: ["GMAIL_APP_PASSWORD"],
  },
  async (event) => {
    try {
      const beforeData = event.data.before?.data() || {};
      const afterData = event.data.after?.data() || {};

      // Trigger only on transition to "failed" (prevents duplicate alerts)
      if (
        beforeData.status === "failed" ||
        afterData.status !== "failed"
      ) {
        return;
      }

      const reason =
        afterData.printerStatus ||
        afterData.error ||
        "Print job failed";

      const kioskId = afterData.kioskId || afterData.printDestination || "Unknown Kiosk";
      const jobId = event.params.jobId;

      const transporter = getTransporter();

      await transporter.sendMail({
        from: '"Mimo Printing" <visionprintt@gmail.com>',
        to: "visionprintt@gmail.com",
        subject: `MIMO Print Job Failed - ${kioskId}`,
        text:
          `MIMO Kiosk Failure Alert\n\n` +
          `Kiosk: ${kioskId}\n` +
          `Job ID: ${jobId}\n` +
          `Problem: ${reason}\n\n` +
          `Please check the kiosk immediately.`,
      });

      console.log(
        `[EMAIL] Failure notification sent for kiosk ${kioskId}, job ${jobId}`
      );
    } catch (err) {
      console.error(
        "[EMAIL] Failed to send failure notification:",
        err.message || err
      );
    }
  }
);

// ================= GMAIL: PRINTER HARDWARE NOTIFICATIONS =================
exports.printerHardwareNotification = onDocumentUpdated(
  {
    document: "hardware/printers",
    secrets: ["GMAIL_APP_PASSWORD"],
  },
  async (event) => {
    try {
      const beforeData = event.data.before?.data() || {};
      const afterData = event.data.after?.data() || {};

      const isProblemStatus = (statusStr) => {
        if (!statusStr || typeof statusStr !== "string") return false;
        const s = statusStr.trim().toLowerCase();
        return (
          s === "offline" ||
          s === "disconnected" ||
          s === "unreachable" ||
          s === "power off" ||
          s === "powered off" ||
          s === "unplugged" ||
          s === "paused/error" ||
          s.includes("offline") ||
          s.includes("disconnect") ||
          s.includes("unreachable") ||
          s.includes("power off") ||
          s.includes("powered off") ||
          s.includes("unplugged")
        );
      };

      for (const [printerId, printer] of Object.entries(afterData)) {
        if (!printer || typeof printer !== "object") {
          continue;
        }

        const beforePrinter = beforeData[printerId] || {};

        const isColor =
          printer.type === "color" ||
          printerId.toLowerCase().includes("color");

        const printerName =
          printer.name ||
          printer.printerName ||
          (printerId === "CV-001" ? "Brother HL-L5210DN (CV-001)" :
            printerId === "SV-002-BW" ? "Brother HL-L2440DW (SV-002)" :
              printerId === "SV-002-COLOR" ? "Epson EcoTank L3250 (SV-002)" :
                printerId);

        const kioskId =
          printer.kioskId ||
          printer.kiosk ||
          (printerId.startsWith("CV") ? "CV-001" :
            printerId.startsWith("SV") ? "SV-002" :
              "Unknown Kiosk");

        const transporter = getTransporter();

        // ── 1. LOW PAPER ALERTS ──
        const paperLevel = Number(printer.paperLevel);
        const prevPaperLevel = Number(beforePrinter.paperLevel);

        if (Number.isFinite(paperLevel)) {
          const paperCapacity = isColor ? 100 : 250;
          const paperThreshold = isColor ? 70 : 50;

          const paperCrossed =
            paperLevel <= paperThreshold &&
            (prevPaperLevel > paperThreshold || !Number.isFinite(prevPaperLevel));

          if (paperCrossed) {
            try {
              await transporter.sendMail({
                from: '"Mimo Printing" <visionprintt@gmail.com>',
                to: "visionprintt@gmail.com",
                subject: `MIMO Low Paper Alert - ${printerName}`,
                text:
                  `MIMO Kiosk Low Paper Alert\n\n` +
                  `Alert Type: Low Paper\n` +
                  `Printer ID: ${printerId}\n` +
                  `Printer: ${printerName}\n` +
                  `Kiosk: ${kioskId}\n` +
                  `Printer Type: ${isColor ? "Colour" : "B&W"}\n` +
                  `Printer Capacity: ${paperCapacity} sheets\n` +
                  `Alert Threshold: ${paperThreshold} sheets\n` +
                  `Current Paper Level: ${paperLevel} sheets\n\n` +
                  `Recommended Action: Please refill the ${isColor ? "colour " : ""}paper tray immediately.`,
              });

              console.log(
                `[EMAIL] Low paper notification sent for ${printerId}. Current level: ${paperLevel}`
              );
            } catch (mailErr) {
              console.error(`[EMAIL ERROR] Low paper email failed for ${printerId}:`, mailErr.message || mailErr);
            }
          }
        }

        // ── 2. LOW TONER ALERT (B&W Printers) ──
        if (!isColor && printer.tonerLevel !== undefined) {
          const tonerLevel = Number(printer.tonerLevel);
          const prevTonerLevel = Number(beforePrinter.tonerLevel);

          if (Number.isFinite(tonerLevel)) {
            const tonerThreshold = 20;
            const tonerCrossed =
              tonerLevel <= tonerThreshold &&
              (prevTonerLevel > tonerThreshold || !Number.isFinite(prevTonerLevel));

            if (tonerCrossed) {
              try {
                await transporter.sendMail({
                  from: '"Mimo Printing" <visionprintt@gmail.com>',
                  to: "visionprintt@gmail.com",
                  subject: `MIMO Low Toner Alert - ${printerName}`,
                  text:
                    `MIMO Kiosk Low Toner Alert\n\n` +
                    `Alert Type: Low Toner\n` +
                    `Printer ID: ${printerId}\n` +
                    `Printer: ${printerName}\n` +
                    `Kiosk: ${kioskId}\n` +
                    `Printer Type: B&W\n` +
                    `Alert Threshold: ${tonerThreshold}%\n` +
                    `Current Toner Level: ${tonerLevel}%\n\n` +
                    `Recommended Action: Please replace or order a replacement toner cartridge.`,
                });

                console.log(
                  `[EMAIL] Low toner notification sent for ${printerId}. Current level: ${tonerLevel}%`
                );
              } catch (mailErr) {
                console.error(`[EMAIL ERROR] Low toner email failed for ${printerId}:`, mailErr.message || mailErr);
              }
            }
          }
        }

        // ── 3. LOW INK ALERT (Colour Printers) ──
        if (isColor && printer.inkLevel !== undefined) {
          const inkLevel = Number(printer.inkLevel);
          const prevInkLevel = Number(beforePrinter.inkLevel);

          if (Number.isFinite(inkLevel)) {
            const inkThreshold = 20;
            const inkCrossed =
              inkLevel <= inkThreshold &&
              (prevInkLevel > inkThreshold || !Number.isFinite(prevInkLevel));

            if (inkCrossed) {
              try {
                await transporter.sendMail({
                  from: '"Mimo Printing" <visionprintt@gmail.com>',
                  to: "visionprintt@gmail.com",
                  subject: `MIMO Low Ink Alert - ${printerName}`,
                  text:
                    `MIMO Kiosk Low Ink Alert\n\n` +
                    `Alert Type: Low Ink\n` +
                    `Printer ID: ${printerId}\n` +
                    `Printer: ${printerName}\n` +
                    `Kiosk: ${kioskId}\n` +
                    `Printer Type: Colour\n` +
                    `Alert Threshold: ${inkThreshold}%\n` +
                    `Current Ink Level: ${inkLevel}%\n\n` +
                    `Recommended Action: Please refill the colour ink tanks immediately.`,
                });

                console.log(
                  `[EMAIL] Low ink notification sent for ${printerId}. Current level: ${inkLevel}%`
                );
              } catch (mailErr) {
                console.error(`[EMAIL ERROR] Low ink email failed for ${printerId}:`, mailErr.message || mailErr);
              }
            }
          }
        }

        // ── 4. PRINTER POWER / OFFLINE / NETWORK ALERT ──
        const currentStatus = String(printer.status || "").trim();
        const prevStatus = String(beforePrinter.status || "").trim();

        if (currentStatus) {
          const isNowProblem = isProblemStatus(currentStatus);
          const wasProblem = isProblemStatus(prevStatus);

          // Trigger ONLY when transitioning from a healthy/online state to a problem state
          if (isNowProblem && !wasProblem) {
            try {
              await transporter.sendMail({
                from: '"Mimo Printing" <visionprintt@gmail.com>',
                to: "visionprintt@gmail.com",
                subject: `MIMO Printer Offline Alert - ${printerName}`,
                text:
                  `MIMO Kiosk Printer Offline Alert\n\n` +
                  `Alert Type: Printer Offline / Disconnected\n` +
                  `Printer ID: ${printerId}\n` +
                  `Printer: ${printerName}\n` +
                  `Kiosk: ${kioskId}\n` +
                  `Current Status: ${currentStatus}\n` +
                  `Previous Status: ${prevStatus || "Online"}\n\n` +
                  `Recommended Action: Please check the printer power switch, USB cable, and network connectivity at ${kioskId}.`,
              });

              console.log(
                `[EMAIL] Printer offline notification sent for ${printerId}. Status: ${currentStatus}`
              );
            } catch (mailErr) {
              console.error(`[EMAIL ERROR] Offline email failed for ${printerId}:`, mailErr.message || mailErr);
            }
          }
        }
      }
    } catch (err) {
      console.error(
        "[EMAIL] Failed to process printer hardware notification:",
        err.message || err
      );
    }
  }
);

// ================= GMAIL: COLOUR PAPER USAGE NOTIFICATION =================
exports.colourPaperUsageNotification = onDocumentUpdated(
  {
    document: "print_jobs/{jobId}",
    secrets: ["GMAIL_APP_PASSWORD"],
  },
  async (event) => {
    try {
      const before = event.data.before.data() || {};
      const after = event.data.after.data() || {};

      // Run only when a print job becomes completed
      if (before.status === "completed" || after.status !== "completed") {
        return;
      }

      // Only colour printing jobs
      const colorMode = String(after.colorMode || "").toLowerCase();

      if (colorMode !== "color" && colorMode !== "colour") {
        return;
      }

      // Actual physical sheets used by this job
      const sheetsUsed = Number(after.paperSheetsUsed);

      if (!Number.isFinite(sheetsUsed) || sheetsUsed <= 0) {
        return;
      }

      const usageRef = db
        .collection("printer_usage")
        .doc("SV-002-COLOR");

      let milestone = null;
      let totalSheets = 0;

      await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(usageRef);
        const data = snap.exists ? snap.data() : {};

        const previousTotal = Number(data.totalSheets) || 0;
        const previousMilestone = Number(data.lastAlertMilestone) || 0;

        totalSheets = previousTotal + sheetsUsed;

        const newMilestone = Math.floor(totalSheets / 50) * 50;

        if (newMilestone > previousMilestone) {
          milestone = newMilestone;
        }

        transaction.set(
          usageRef,
          {
            totalSheets: totalSheets,
            lastAlertMilestone: milestone || previousMilestone,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });

      if (!milestone) {
        console.log(
          `[EMAIL] Colour usage: ${totalSheets} sheets. No 50-sheet milestone.`
        );
        return;
      }

      if (!process.env.GMAIL_APP_PASSWORD) {
        console.error("[EMAIL] GMAIL_APP_PASSWORD is not configured.");
        return;
      }

      const transporter = getTransporter();

      await transporter.sendMail({
        from: '"Mimo Printing" <visionprintt@gmail.com>',
        to: "visionprintt@gmail.com",
        subject: `MIMO Colour Paper Usage Alert - ${milestone} Pages`,
        text:
          `MIMO Colour Paper Usage Alert\n\n` +
          `Printer: SV-002-COLOR\n` +
          `Kiosk: SV-002 (MIMO 2.0)\n\n` +
          `Total colour pages/sheets printed: ${totalSheets}\n` +
          `Milestone reached: ${milestone}\n\n` +
          `The colour printer has reached another 50-page usage milestone.`,
      });

      console.log(
        `[EMAIL] Colour usage alert sent. Total: ${totalSheets}, milestone: ${milestone}`
      );

    } catch (err) {
      console.error(
        "[EMAIL] Failed to send colour paper usage notification:",
        err.message || err
      );
    }
  }
);
