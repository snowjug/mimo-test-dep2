const axios = require("axios");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { CASHFREE_BASE_URL, SECRET_KEY, cashfreeHeaders } = require("../config/env");
const { SUPPORTED_OFFICE_EXTENSIONS } = require("../services/converter.service");
const { admin, db } = require("../config/firebase");
const { sendWhatsAppMessage } = require("../services/whatsapp.service");

// ================= CREATE ORDER =================
const postCreateOrder = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { jobIds, selectedFiles, printOptions, couponCode, coinsToUse } = req.body;
    const coinsDiscount = coinsToUse ? Number(coinsToUse) * 0.5 : 0; // 1 coin = ₹0.50
    let { orderId } = req.body;
    if (!orderId) {
      orderId = `order_${uuidv4().replace(/-/g, "").substring(0, 10)}`;
    }

    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({ error: "Explicit non-empty jobIds array is required for checkout." });
    }

    // Retrieve and strictly validate every requested job document from Firestore
    const seenJobIds = new Set();
    const targetJobs = [];
    for (const rawJobId of jobIds) {
      if (typeof rawJobId !== "string" || !rawJobId.trim()) {
        return res.status(400).json({ error: "Invalid jobId format in checkout selection." });
      }
      const jobId = rawJobId.trim();
      if (seenJobIds.has(jobId)) {
        return res.status(400).json({ error: `Duplicate jobId detected in checkout request: ${jobId}` });
      }
      seenJobIds.add(jobId);

      const doc = await db.collection("print_jobs").doc(jobId).get();
      if (!doc.exists) {
        return res.status(400).json({ error: `Print job not found: ${jobId}` });
      }
      const data = doc.data();
      if (data.userId !== userId) {
        return res.status(403).json({ error: `Unauthorized access to print job: ${jobId}` });
      }
      if (data.status !== "pending") {
        return res.status(400).json({ error: `Print job ${jobId} is not in pending status (current status: ${data.status}).` });
      }
      if (data.removedByUser === true || data.fileDeleted === true) {
        return res.status(400).json({ error: `Print job ${jobId} has been removed or deleted.` });
      }
      targetJobs.push(doc);
    }

    let discountPercentage = 0;
    if (couponCode) {
      const couponDoc = await db.collection("coupons").doc(couponCode.toUpperCase()).get();
      if (couponDoc.exists) {
        const couponData = couponDoc.data();
        const now = new Date();
        if (couponData.isActive && (!couponData.expiryDate || couponData.expiryDate.toDate() > now)) {
          discountPercentage = couponData.discountPercentage;
        }
      }
    }

    let totalAmount = 0;
    const isBlankSheet = printOptions?.isBlankSheet === true || printOptions?.blankSheet === true;
    const sheetType = printOptions?.sheetType || "a4";
    const colorMode = printOptions?.colorMode || "bw";

    let pricePerPage = 2.80; // Default A4 BW simplex
    if (colorMode === "color") {
      pricePerPage = 10.00;
    } else if (isBlankSheet && sheetType === "graph") {
      pricePerPage = 2.00;
    }
    const copies = Number(printOptions?.copies || 1);

    const batchUpdate = db.batch();

    // Group all validated pending jobs into a single unified job for the printer
    const mergedFiles = [];
    let totalRawPages = 0;
    let earliestRetentionStartAt = null;

    targetJobs.forEach((doc) => {
      const data = doc.data();

      // Preserve earliest retentionStartAt across predecessor jobs
      const jobRetention = data.retentionStartAt || data.uploadedAt || data.createdAt;
      if (jobRetention) {
        if (!earliestRetentionStartAt) {
          earliestRetentionStartAt = jobRetention;
        } else {
          const candTime = (jobRetention.toDate ? jobRetention.toDate() : new Date(jobRetention)).getTime();
          const earliestTime = (earliestRetentionStartAt.toDate ? earliestRetentionStartAt.toDate() : new Date(earliestRetentionStartAt)).getTime();
          if (!isNaN(candTime) && !isNaN(earliestTime) && candTime < earliestTime) {
            earliestRetentionStartAt = jobRetention;
          }
        }
      }

      // If this document is already a merged job containing a files array, unpack its files!
      if (Array.isArray(data.files) && data.files.length > 0) {
        data.files.forEach((fileItem) => {
          const fileName = fileItem.originalFileName || fileItem.name;
          const fileConfig = printOptions?.fileConfigs?.[fileName] || printOptions?.fileConfigs?.[fileItem.name];
          let numPages = fileItem.pageCount || fileConfig?.pageCount || 1;
          const jobPageSelection = fileConfig?.pageSelection || fileConfig?.pagesToPrint || printOptions?.pageSelection || printOptions?.pagesToPrint || "all";
          const jobPageRange = fileConfig?.pageRange || fileConfig?.customPageRange || printOptions?.pageRange || printOptions?.customPageRange || "";

          // Handle custom page ranges
          if (jobPageSelection === "custom" && jobPageRange) {
            const ranges = String(jobPageRange).split(",");
            let customCount = 0;
            for (const r of ranges) {
              const parts = r.split("-").map(p => parseInt(p.trim()));
              if (parts.length === 1 && !isNaN(parts[0])) {
                if (parts[0] >= 1 && parts[0] <= numPages) customCount += 1;
              } else if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                if (parts[0] >= 1 && parts[1] <= numPages && parts[0] <= parts[1]) {
                  customCount += (parts[1] - parts[0] + 1);
                }
              }
            }
            if (customCount > 0) numPages = customCount;
          }

          totalRawPages += numPages;

          const printableName = fileItem.name;
          const originalFileUrl = fileItem.originalFileUrl || fileItem.originalUrl || null;
          const convertedStoragePath = fileItem.convertedStoragePath || null;

          mergedFiles.push({
            name: printableName,
            originalFileName: fileItem.originalFileName || fileItem.name,
            url: fileItem.url,
            originalFileUrl: originalFileUrl,
            originalUrl: originalFileUrl,
            convertedStoragePath: convertedStoragePath,
            type: fileItem.type || "application/octet-stream",
            size: fileItem.size || fileItem.fileSize || 0,
            pageCount: numPages
          });
        });
      } else {
        // Single pending file document (e.g. from /finalize-upload)
        const fileConfig = printOptions?.fileConfigs?.[data.fileName];
        let numPages = data.pageCount || fileConfig?.pageCount || 1;
        const jobPageSelection = fileConfig?.pageSelection || fileConfig?.pagesToPrint || printOptions?.pageSelection || printOptions?.pagesToPrint || "all";
        const jobPageRange = fileConfig?.pageRange || fileConfig?.customPageRange || printOptions?.pageRange || printOptions?.customPageRange || "";

        // Handle custom page ranges
        if (jobPageSelection === "custom" && jobPageRange) {
          const ranges = String(jobPageRange).split(",");
          let customCount = 0;
          for (const r of ranges) {
            const parts = r.split("-").map(p => parseInt(p.trim()));
            if (parts.length === 1 && !isNaN(parts[0])) {
              if (parts[0] >= 1 && parts[0] <= numPages) customCount += 1;
            } else if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              if (parts[0] >= 1 && parts[1] <= numPages && parts[0] <= parts[1]) {
                customCount += (parts[1] - parts[0] + 1);
              }
            }
          }
          if (customCount > 0) numPages = customCount;
        }

        totalRawPages += numPages;

        // Determine printable filename for the Pi:
        // If the file was converted to PDF (mimetype application/pdf, but original name is an Office extension),
        // provide a .pdf filename so the Raspberry Pi CUPS daemon prints the PDF directly without attempting LibreOffice.
        let printableName = data.fileName;
        const isConvertedPdf = data.convertedStoragePath || (data.mimetype === "application/pdf" && SUPPORTED_OFFICE_EXTENSIONS.has(path.extname(data.fileName || "").toLowerCase()));
        if (isConvertedPdf) {
          const baseName = path.basename(data.fileName, path.extname(data.fileName));
          printableName = `${baseName}.pdf`;
        }

        const originalFileUrl = data.originalFileUrl || data.originalUrl || null;
        const convertedStoragePath = data.convertedStoragePath || null;

        mergedFiles.push({
          name: printableName,
          originalFileName: data.fileName,
          url: data.fileUrl,
          originalFileUrl: originalFileUrl,
          originalUrl: originalFileUrl,
          convertedStoragePath: convertedStoragePath,
          type: data.mimetype || "application/octet-stream",
          size: data.size || data.fileSize || 0,
          pageCount: numPages
        });
      }

      // Delete the individual pending jobs so we can replace them with the merged group
      batchUpdate.delete(doc.ref);
    });

    // Handle N-up photo layouts on the grouped total
    let divisor = 1;
    if (printOptions?.photoLayout === "2") divisor = 2;
    if (printOptions?.photoLayout === "4") divisor = 4;
    if (printOptions?.photoLayout === "6") divisor = 6;
    if (printOptions?.photoLayout === "9") divisor = 9;

    let actualPages = Math.ceil(totalRawPages / divisor);

    // Handle double-sided
    if (printOptions?.doubleSided === "double") {
      actualPages = Math.ceil(actualPages / 2);
      if (colorMode === "bw") {
        pricePerPage = 3.30;
      }
    }

    const jobCost = actualPages * copies * pricePerPage;
    totalAmount += jobCost;

    // Create the unified merged job
    const newJobRef = db.collection("print_jobs").doc();
    batchUpdate.set(newJobRef, {
      userId,
      fileName: mergedFiles.length > 1 ? `Multiple Files (${mergedFiles.length})` : mergedFiles[0].name,
      fileUrl: mergedFiles[0].url, // legacy support for older apps
      originalFileUrl: mergedFiles[0].originalFileUrl || null,
      convertedStoragePath: mergedFiles[0].convertedStoragePath || null,
      mimetype: mergedFiles[0].type, // legacy support
      files: mergedFiles, // The full array of files to print
      size: mergedFiles.reduce((acc, f) => acc + (f.size || 0), 0),
      status: "pending",
      pageCount: totalRawPages,
      printOptions: printOptions || {},
      pricing: { pricePerPage, totalPages: actualPages, jobCost },
      orderId,
      colorMode,
      color: colorMode === "color",
      // Top-level fields for backward compat with older Pi listeners
      copies: copies,
      duplex: printOptions?.doubleSided === "double",
      finalCost: jobCost,
      totalCost: jobCost,
      kioskId: printOptions?.directKioskId || "CV-001",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      retentionStartAt: earliestRetentionStartAt || admin.firestore.FieldValue.serverTimestamp()
    });

    const finalAmountToPay = Math.max(0, totalAmount - coinsDiscount);

    await batchUpdate.commit();

    let amount = Number(finalAmountToPay.toFixed(2));
    if (discountPercentage > 0) {
      amount = Number((amount - (amount * (discountPercentage / 100))).toFixed(2));
    }

    // ─── FREE ORDER BYPASS ──────────────────────────────────────────────────────
    if (amount <= 0 || amount < 1.00) {
      const printCode = Math.floor(1000 + Math.random() * 9000).toString();
      const now = admin.firestore.FieldValue.serverTimestamp();

      await newJobRef.update({
        status: "paid",
        printCode,
        codeCreatedAt: now,
        paymentTime: now,
        retentionStartAt: now,
        isPrinted: false
      });

      // Deduct coins from user balance if coins were used
      if (coinsToUse && coinsToUse > 0) {
        await db.collection("users").doc(userId).update({
          "mimo_coins.balance": admin.firestore.FieldValue.increment(-coinsToUse),
          "mimo_coins.total_used": admin.firestore.FieldValue.increment(coinsToUse),
        });
      }

      await db.collection("orders").add({
        orderId, userId, amount: 0, totalPages: totalRawPages, totalDocs: mergedFiles.length,
        status: "PAID", orderStatus: "completed", printJobs: [newJobRef.id],
        createdAt: now, couponCode: couponCode || null, discountPercentage,
        coinsUsed: coinsToUse || 0
      });

      // Trigger Email Receipt via Nodemailer for free orders
      try {
        const userDoc = await db.collection("users").doc(userId).get();
        let userEmail = (userDoc.exists ? userDoc.data().email : null) || req.user?.email || req.user?.email_id;
        if (!userEmail) {
          try {
            const authUser = await admin.auth().getUser(userId);
            userEmail = authUser.email;
          } catch (e) {
            console.log("Could not fetch user email from admin auth:", e.message);
          }
        }

        console.log(`[EMAIL-DEBUG] Preparing to send FREE OTP to: ${userEmail}. Has Password: ${!!process.env.GMAIL_APP_PASSWORD}`);

        if (userEmail && process.env.GMAIL_APP_PASSWORD) {
          const mailOptions = {
            from: '"Mimo Printing" <visionprintt@gmail.com>',
            to: userEmail,
            subject: "Your Mimo Print Code is Ready!",
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px; text-align: center;">
                <h2 style="color: #093765;">Mimo Print Receipt</h2>
                <p style="color: #666; font-size: 16px;">Thank you for using Mimo! Your free order is ready to print.</p>
                <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 0; color: #64748b; font-size: 14px; text-transform: uppercase; font-weight: bold;">Print Code</p>
                  <p style="margin: 10px 0 0; font-size: 48px; font-weight: 900; color: #0f172a; letter-spacing: 5px;">${printCode}</p>
                </div>
                <p style="color: #666; font-size: 14px;">Go to the Mimo Kiosk and enter this code to retrieve your documents.</p>
              </div>
            `
          };
          await transporter.sendMail(mailOptions);
          console.log(`[EMAIL] Free order receipt sent to ${userEmail}`);
        }
      } catch (emailErr) {
        console.error("[EMAIL ERROR] Failed to send free order receipt:", emailErr);
      }

      // Send WhatsApp Notification for free orders (Option A)
      try {
        const waUserDoc = await db.collection("users").doc(userId).get();
        const waPhone = waUserDoc.exists ? waUserDoc.data().mobileNumber : null;
        if (waPhone) {
          await sendWhatsAppMessage(waPhone,
            `✅ *Mimo Print Ready!*\n\nYour print code is:\n*${printCode}*\n\nHead to the Mimo kiosk and enter this code to collect your prints. This code is valid until you print! 🖨️`
          );
        }
      } catch (waErr) {
        console.error("[WHATSAPP] Free order notification failed:", waErr);
      }

      return res.json({ orderId, paymentSessionId: null, amount: 0, printCode, free: true });
    }
    // ─────────────────────────────────────────────────────────────────────────

    let customerPhone = req.body?.customerPhone || "9999999999";
    let customerName = req.body?.customerName || "Mimo User";
    let customerEmail = req.body?.customerEmail || "user@printmimo.tech";
    try {
      const uDoc = await db.collection("users").doc(userId).get();
      if (uDoc.exists) {
        const uData = uDoc.data();
        if (uData.mobileNumber || uData.phone) {
          const digits = (uData.mobileNumber || uData.phone).toString().replace(/[^\d]/g, "");
          if (digits.length >= 10) customerPhone = digits.slice(-10);
        }
        if (uData.name || uData.displayName || uData.fullName || uData.username) {
          customerName = uData.name || uData.displayName || uData.fullName || uData.username;
        }
        if (uData.email) customerEmail = uData.email;
      }
    } catch (uErr) {
      console.warn("Could not fetch user details for cashfree order:", uErr);
    }

    const response = await axios.post(
      `${CASHFREE_BASE_URL}/orders`,
      {
        order_id: orderId,
        order_amount: amount,
        order_currency: "INR",
        customer_details: {
          customer_id: userId,
          customer_phone: customerPhone,
          customer_name: customerName,
          customer_email: customerEmail,
        },
        order_meta: {
          return_url: `https://printmimo.tech/payment-verify?order_id={order_id}`
        },
      },
      { headers: cashfreeHeaders, timeout: 10000 }
    );

    const paymentTxnRef = db.collection("payment_transactions").doc();
    await paymentTxnRef.set({
      orderId,
      userId,
      amount,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "INITIATED"
    });

    res.json({
      orderId,
      paymentSessionId: response.data.payment_session_id,
      amount,
    });
  } catch (err) {
    console.error("Cashfree Order Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to create payment order" });
  }
};

// ================= VERIFY PAYMENT =================
const getVerifyPayment = async (req, res) => {
  try {
    const { orderId } = req.params;

    let cashfreeStatus = null;
    try {
      const cfRes = await axios.get(`${CASHFREE_BASE_URL}/orders/${orderId}`, { headers: cashfreeHeaders, timeout: 10000 });
      cashfreeStatus = cfRes.data.order_status;
      console.log(`[VERIFY-PAYMENT] Cashfree status for ${orderId}: ${cashfreeStatus}`);
    } catch (cfErr) {
      console.warn("[VERIFY-PAYMENT] Cashfree API failed, falling back to Firestore:", cfErr.message);
    }

    let orderSnapshot = await db.collection("orders").where("orderId", "==", orderId).get();
    if (orderSnapshot.empty) {
      orderSnapshot = await db.collection("payment_transactions").where("orderId", "==", orderId).get();
    }
    let userId = null;
    let order_status = cashfreeStatus || "CREATED";

    if (!orderSnapshot.empty) {
      const orderDoc = orderSnapshot.docs[0];
      userId = orderDoc.data().userId;
      if (cashfreeStatus === "PAID") {
        await orderDoc.ref.update({ status: "PAID" });
      } else if (!cashfreeStatus) {
        order_status = orderDoc.data().status;
      }
    }

    let printCode = null;
    let directKioskId = null;

    if (order_status === "PAID" && userId) {
      try {
        const dummyToken = jwt.sign({ userId }, SECRET_KEY, { expiresIn: "1h" });
        const internalRes = await axios.post(
          `http://localhost:${process.env.PORT || 8080}/payment-success`,
          { internalSecret: process.env.INTERNAL_WEBHOOK_SECRET, orderId },
          { headers: { Authorization: `Bearer ${dummyToken}` } }
        );
        printCode = internalRes.data.printCode;
        directKioskId = internalRes.data.directKioskId;
      } catch (internalErr) {
        console.error("[VERIFY-PAYMENT] Internal /payment-success failed:", internalErr.response?.data || internalErr.message);
      }
    }

    res.json({ order_status, printCode, directKioskId });
  } catch (err) {
    console.error(err);
    res.status(500).send("Verification failed");
  }
};

// ================= CASHFREE WEBHOOK =================
const postCashfreeWebhook = async (req, res) => {
  try {
    let event;
    if (Buffer.isBuffer(req.body)) {
      const rawBody = req.body.toString("utf8");
      const receivedSignature = req.headers["x-webhook-signature"];
      const timestamp = req.headers["x-webhook-timestamp"];

      if (receivedSignature && timestamp) {
        const signedPayload = timestamp + rawBody;
        const expectedSignature = crypto
          .createHmac("sha256", process.env.CASHFREE_SECRET_KEY)
          .update(signedPayload)
          .digest("base64");
        if (receivedSignature !== expectedSignature) {
          console.warn("Webhook signature mismatch");
          return res.status(403).send("Invalid signature");
        }
      }
      event = JSON.parse(rawBody);
    } else {
      // Body already parsed by express.json()
      event = req.body;
    }

    if (event.type === "PAYMENT_SUCCESS_WEBHOOK") {
      const orderId = event.data.order.order_id;
      const userId = event.data.customer_details.customer_id;
      const paidAmount = event.data.order.order_amount;
      const now = admin.firestore.FieldValue.serverTimestamp();

      // Update Orders (V1 + V2 Schema)
      let orders = await db.collection("orders").where("orderId", "==", orderId).get();
      if (orders.empty) {
        orders = await db.collection("payment_transactions").where("orderId", "==", orderId).get();
      }
      const orderBatch = db.batch();
      orders.forEach((doc) => {
        orderBatch.update(doc.ref, {
          status: "PAID",
          orderStatus: "completed",
          "paymentDetails.paymentStatus": "completed",
          "paymentDetails.paidAt": now
        });
      });
      await orderBatch.commit();

      // Update Print Jobs (V1 + V2 Schema)
      const jobs = await db
        .collection("print_jobs")
        .where("orderId", "==", orderId)
        .get();

      const jobsBatch = db.batch();
      let newTotalPages = 0;

      jobs.forEach((doc) => {
        const pages = doc.data().pageCount || 0;
        newTotalPages += pages;
        jobsBatch.update(doc.ref, {
          status: "paid",
          "paymentStatus.status": "completed",
          "paymentStatus.paidAt": now,
          paymentTime: now
        });
      });
      await jobsBatch.commit();

      // ✅ Call /payment-success internally to generate the print code
      // Guard: only call if no print code exists yet on these jobs
      const existingCodeCheck = await db.collection("print_jobs")
        .where("userId", "==", userId)
        .where("status", "==", "paid")
        .where("printCode", "!=", null)
        .limit(1)
        .get();

      if (existingCodeCheck.empty) {
        try {
          const dummyToken = jwt.sign({ userId }, SECRET_KEY, { expiresIn: "1h" });
          await axios.post(
            `http://localhost:${process.env.PORT || 8080}/payment-success`,
            { internalSecret: process.env.INTERNAL_WEBHOOK_SECRET, orderId },
            { headers: { Authorization: `Bearer ${dummyToken}` } }
          );
        } catch (internalErr) {
          console.error("[WEBHOOK] Failed to call internal /payment-success:", internalErr.message);
        }
      } else {
        console.log(`[WEBHOOK] Print code already exists for user ${userId}, skipping duplicate generation.`);
      }

      // Update User Statistics (V2 Schema)
      const userRef = db.collection("users").doc(userId);
      await userRef.update({
        totalSpent: admin.firestore.FieldValue.increment(paidAmount),
        totalPagesPrinted: admin.firestore.FieldValue.increment(newTotalPages)
      });

      // Update Payment Transactions Audit (V2 Schema)
      const txnSnapshot = await db.collection("payment_transactions").where("orderId", "==", orderId).get();
      if (!txnSnapshot.empty) {
        const paymentData = event.data.payment || {};
        await txnSnapshot.docs[0].ref.update({
          "transactionStatus.status": "completed",
          "transactionStatus.gatewayStatus": paymentData.payment_status || "SUCCESS",
          "transactionStatus.completedAt": now,
          cashfreePaymentId: paymentData.cf_payment_id || null,
          paymentMethod: paymentData.payment_group || "unknown",
          paymentCurrency: paymentData.payment_currency || "INR",
          paymentMessage: paymentData.payment_message || "Success",
          paymentTime: paymentData.payment_time || now
        });
      }

      // ✅ Update Global Admin Metrics ONLY on Real Payments
      const dateString = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const metricsRef = db.collection("system").doc("metrics");
      await metricsRef.set({
        totalRevenue: admin.firestore.FieldValue.increment(paidAmount),
        totalOrders: admin.firestore.FieldValue.increment(1),
        totalPagesPrinted: admin.firestore.FieldValue.increment(newTotalPages),
        [`dailyRevenue.${dateString}`]: admin.firestore.FieldValue.increment(paidAmount),
        lastUpdatedAt: now
      }, { merge: true });

      res.status(200).send("Webhook received");
    }
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
};

// ================= CHECK JOB STATUS =================
const postCheckStatus = async (req, res) => {
  try {
    const { printCode } = req.body;
    if (!printCode) return res.status(400).json({ error: "printCode required" });

    const snapshot = await db.collection("print_jobs")
      .where("printCode", "==", printCode)
      .get();

    if (snapshot.empty) return res.status(404).json({ error: "No jobs found" });

    let allCompleted = true;
    let anyRealFailed = false;  // Only real Pi print failures, not URL-validation cancellations
    let anyPrinting = false;
    let hasValidJob = false;

    snapshot.forEach((doc) => {
      const data = doc.data();
      const printerStatus = data.printerStatus || "";

      // Auto-cancelled jobs (bad URL) are NOT real failures - ignore them for status
      const isAutoCancelled = data.status === "failed" && (
        printerStatus.includes("Invalid file URL") ||
        printerStatus.includes("invalid file path") ||
        printerStatus.includes("Cancelled")
      );

      if (isAutoCancelled) return; // skip — these are not real jobs

      hasValidJob = true;
      if (data.status === "failed") anyRealFailed = true;
      if (data.status === "printing") anyPrinting = true;
      if (!["completed", "printed"].includes(data.status) && data.isPrinted !== true) {
        allCompleted = false;
      }
    });

    // If ONLY auto-cancelled jobs exist, treat as invalid code
    if (!hasValidJob) return res.status(404).json({ error: "No valid jobs found for this code" });

    if (anyRealFailed) return res.json({ status: "failed", isPrinted: false });
    if (allCompleted) return res.json({ status: "completed", isPrinted: true });
    if (anyPrinting) return res.json({ status: "printing", isPrinted: false });

    return res.json({ status: "paid", isPrinted: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Status check failed" });
  }
};

// ================= PAYMENT SUCCESS (Generates Print Code) =================
const postPaymentSuccess = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { orderId } = req.body; // Scoped to the specific order being confirmed
    const now = new Date();

    let queryRef = db.collection("print_jobs")
      .where("userId", "==", userId)
      .where("status", "in", ["pending", "paid"]);

    // If orderId provided, narrow query to only jobs from this order
    if (orderId) {
      queryRef = queryRef.where("orderId", "==", orderId);
    }

    const snapshot = await queryRef.get();

    if (snapshot.empty) {
      return res.status(400).json({ error: "No pending jobs found" });
    }

    let jobsToUpdate = snapshot.docs.filter(doc => !doc.data().printCode);

    if (jobsToUpdate.length === 0) {
      const recentJob = snapshot.docs.find(doc => doc.data().printCode);
      if (recentJob) {
        const jobData = recentJob.data();
        const directKioskId = jobData.printOptions?.directKioskId || jobData.settings?.directKioskId || jobData.kioskId || null;
        return res.json({ printCode: recentJob.data().printCode, directKioskId });
      }
      return res.status(400).json({ error: "No pending jobs without code" });
    }

    const printCode = Math.floor(1000 + Math.random() * 9000).toString();
    let directKioskId = null;

    const batch = db.batch();
    jobsToUpdate.forEach((doc) => {
      const data = doc.data();
      const jobKioskId = data.printOptions?.directKioskId || data.settings?.directKioskId || data.kioskId;
      const targetKiosk = jobKioskId || "CV-001";
      if (jobKioskId) {
        directKioskId = jobKioskId;
      }
      batch.update(doc.ref, {
        status: "paid",
        kioskId: targetKiosk,
        paymentTime: admin.firestore.FieldValue.serverTimestamp(),
        printCode,
        codeCreatedAt: now,
        retentionStartAt: now,
        isPrinted: false,
      });
    });
    await batch.commit();

    // Trigger Email Receipt via Nodemailer
    try {
      // Use Firestore (not Firebase Auth) to get user email - avoids admin.auth() errors
      const userDoc = await db.collection("users").doc(userId).get();
      let userEmail = (userDoc.exists ? userDoc.data().email : null) || req.user?.email || req.user?.email_id;
      if (!userEmail) {
        try {
          const authUser = await admin.auth().getUser(userId);
          userEmail = authUser.email;
        } catch (e) {
          console.log("Could not fetch user email from admin auth:", e.message);
        }
      }

      console.log(`[EMAIL-DEBUG] Preparing to send OTP to: ${userEmail}. Has Password: ${!!process.env.GMAIL_APP_PASSWORD}`);

      if (userEmail && process.env.GMAIL_APP_PASSWORD) {
        const mailOptions = {
          from: '"Mimo Printing" <visionprintt@gmail.com>',
          to: userEmail,
          subject: "Your Mimo Print Code is Ready!",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px; text-align: center;">
              <h2 style="color: #093765;">Mimo Print Receipt</h2>
              <p style="color: #666; font-size: 16px;">Thank you for using Mimo! Your document is ready to print.</p>
              <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #64748b; font-size: 14px; text-transform: uppercase; font-weight: bold;">Print Code</p>
                <p style="margin: 10px 0 0; font-size: 48px; font-weight: 900; color: #0f172a; letter-spacing: 5px;">${printCode}</p>
              </div>
              <p style="color: #666; font-size: 14px;">Go to the Mimo iPad Kiosk and scan this code to retrieve your documents.</p>
              <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;" />
              <p style="color: #94a3b8; font-size: 12px;">This code is permanently valid until it is successfully printed.</p>
            </div>
          `
        };
        await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] Receipt sent to ${userEmail}`);
      }
    } catch (emailErr) {
      console.error("[EMAIL ERROR] Failed to send receipt:", emailErr);
    }

    // Send WhatsApp Notification for paid orders (Option A)
    try {
      const waUserDoc = await db.collection("users").doc(userId).get();
      const waPhone = waUserDoc.exists ? waUserDoc.data().mobileNumber : null;
      if (waPhone) {
        await sendWhatsAppMessage(waPhone,
          `✅ *Mimo Print Ready!*\n\nPayment confirmed! Your print code is:\n*${printCode}*\n\nHead to the Mimo kiosk and enter this code to collect your prints. 🖨️`
        );
      }
    } catch (waErr) {
      console.error("[WHATSAPP] Paid order notification failed:", waErr);
    }

    res.json({ message: "Payment success", printCode, directKioskId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Payment update failed" });
  }
};

// ================= USER REFUND REQUEST =================
// (ported from the legacy Express server; handler body unchanged)
// ================= USER REFUND REQUEST =================
// Lets an authenticated user flag a failed/unprinted paid order for admin review.
const postRequestRefund = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { orderId, reason } = req.body;
    if (!orderId) return res.status(400).json({ error: "orderId is required" });

    // Verify the order belongs to this user
    let ordSnap = await db.collection("orders").where("orderId", "==", orderId).where("userId", "==", userId).get();
    if (ordSnap.empty) {
      ordSnap = await db.collection("payment_transactions").where("orderId", "==", orderId).where("userId", "==", userId).get();
    }
    if (ordSnap.empty) return res.status(404).json({ error: "Order not found or does not belong to you" });

    const orderData = ordSnap.docs[0].data();
    const orderStatus = orderData.status || orderData.orderStatus || "";

    // Only allow refund requests for FAILED or PAID-but-unprinted orders
    const isPrintedOrPrinting = orderStatus === "printing" || orderStatus === "completed" || orderStatus === "PRINTED";
    if (isPrintedOrPrinting) {
      return res.status(400).json({ error: "Cannot request refund for an order that has been printed." });
    }

    // Check for duplicate request
    const existingReq = await db.collection("refund_requests")
      .where("orderId", "==", orderId)
      .where("userId", "==", userId)
      .get();
    if (!existingReq.empty) {
      return res.status(409).json({ error: "A refund request already exists for this order.", status: existingReq.docs[0].data().status });
    }

    const refundReqRef = await db.collection("refund_requests").add({
      userId,
      orderId,
      orderStatus,
      amount: orderData.amount || orderData.totals?.totalAmount || 0,
      reason: reason || "User requested refund",
      status: "pending",        // pending → approved → processed | rejected
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      resolvedAt: null,
      resolvedBy: null,
      adminNote: null,
    });

    console.log(`[REQUEST-REFUND] Created refund_request ${refundReqRef.id} for orderId=${orderId} userId=${userId}`);
    res.json({ message: "Refund request submitted. Our team will review it within 24–48 hours.", requestId: refundReqRef.id });
  } catch (err) {
    console.error("[REQUEST-REFUND] Error:", err);
    res.status(500).json({ error: "Failed to submit refund request" });
  }
};

module.exports = {
  postCreateOrder,
  getVerifyPayment,
  postCashfreeWebhook,
  postCheckStatus,
  postPaymentSuccess,
  postRequestRefund,
};
