const axios = require("axios");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { CASHFREE_BASE_URL, getSecretKey, cashfreeHeaders } = require("../config/env");
const { admin, db } = require("../config/firebase");
const { OrderServiceError, createOrderForUser, fulfillPaidOrder } = require("../services/order.service");

// ================= CREATE ORDER =================
// Mission 38: the pricing/coupon/coin/Cashfree/free-order business logic now lives in
// functions/src/services/order.service.js:createOrderForUser — extracted VERBATIM from this function as it
// stood on current main (no behavior changed; see that file's own header). This handler only resolves the
// JWT identity, shapes the request for the service, and maps the result/errors back onto res.
const postCreateOrder = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { jobIds, printOptions, couponCode, coinsToUse } = req.body;
    const result = await createOrderForUser({
      db,
      userId,
      jobIds,
      printOptions,
      couponCode,
      coinsToUse,
      customer: { phone: req.body?.customerPhone, name: req.body?.customerName, email: req.body?.customerEmail },
      reqUser: req.user,
    });
    if (result.free) {
      return res.json({ orderId: result.orderId, paymentSessionId: null, amount: 0, printCode: result.printCode, free: true });
    }
    return res.json({ orderId: result.orderId, paymentSessionId: result.paymentSessionId, amount: result.amount });
  } catch (err) {
    if (err instanceof OrderServiceError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error("Cashfree Order Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to create payment order" });
  }
};

// ================= VERIFY PAYMENT =================
const getVerifyPayment = async (req, res) => {
  try {
    const { orderId } = req.params;

    let cashfreeStatus = null;
    let cashfreeCustomerEmail = null;
    try {
      const cfRes = await axios.get(`${CASHFREE_BASE_URL}/orders/${orderId}`, { headers: cashfreeHeaders, timeout: 10000 });
      cashfreeStatus = cfRes.data.order_status;
      cashfreeCustomerEmail = cfRes.data?.customer_details?.customer_email || null;
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

      // Ownership check: only the order's owner may poll its status / print code. Only matters once an order is
      // actually found above (an unknown orderId has no userId to check against, and reports "CREATED" below).
      if (userId && req.user.userId !== userId) {
        return res.status(403).json({ error: "Forbidden: you do not own this order." });
      }

      if (cashfreeStatus === "PAID") {
        const updateData = { status: "PAID" };
        if (cashfreeCustomerEmail && typeof cashfreeCustomerEmail === "string" && !cashfreeCustomerEmail.toLowerCase().includes("user@printmimo.tech")) {
          updateData.customerEmail = cashfreeCustomerEmail;
        }
        await orderDoc.ref.update(updateData);
      } else if (!cashfreeStatus) {
        order_status = orderDoc.data().status;
      }
    }

    let printCode = null;
    let directKioskId = null;

    if (order_status === "PAID" && userId) {
      try {
        const dummyToken = jwt.sign({ userId }, getSecretKey(), { expiresIn: "1h" });
        const existingEmail = cashfreeCustomerEmail || (orderSnapshot.empty ? null : (orderSnapshot.docs[0].data()?.customerEmail || null));
        const internalReqBody = { orderId };
        if (existingEmail && typeof existingEmail === "string" && !existingEmail.toLowerCase().includes("user@printmimo.tech")) {
          internalReqBody.customerEmail = existingEmail;
        }
        const internalRes = await axios.post(
          `http://localhost:${process.env.PORT || 8080}/payment-success`,
          internalReqBody,
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
// Cashfree signs every webhook: x-webhook-signature = base64(HMAC-SHA256(x-webhook-timestamp + rawBody, secret)).
// Under Cloud Functions the body is already parsed before Express runs, so the exact bytes come from req.rawBody
// (server.js also fills it for plain Express). The signature is ALWAYS verified; nothing is processed without it.
const isValidCashfreeSignature = (rawBody, signature, timestamp, secret) => {
  if (!signature || !timestamp || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(String(timestamp) + rawBody.toString("utf8")).digest("base64");
  const a = Buffer.from(String(signature));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const postCashfreeWebhook = async (req, res) => {
  let eventRef = null;
  try {
    const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.isBuffer(req.body) ? req.body : null;
    if (!rawBody) {
      console.warn("[WEBHOOK] rejected: request body not available");
      return res.status(400).send("Unreadable body");
    }
    if (!process.env.CASHFREE_SECRET_KEY) {
      console.error("[WEBHOOK] CASHFREE_SECRET_KEY is not configured; cannot verify webhooks");
      return res.status(500).send("Webhook not configured");
    }
    const signature = req.headers["x-webhook-signature"];
    const timestamp = req.headers["x-webhook-timestamp"];
    if (!isValidCashfreeSignature(rawBody, signature, timestamp, process.env.CASHFREE_SECRET_KEY)) {
      console.warn(`[WEBHOOK] rejected: ${signature && timestamp ? "signature mismatch" : "missing signature headers"}`);
      return res.status(403).send("Invalid signature");
    }
    const event = JSON.parse(rawBody.toString("utf8"));

    if (event.type === "PAYMENT_SUCCESS_WEBHOOK") {
      const orderId = event.data.order.order_id;
      const userId = event.data.customer_details.customer_id;
      const paidAmount = event.data.order.order_amount;
      const webhookCustomerEmail = event.data?.customer_details?.customer_email || event.data?.payment?.payment_email || null;
      const now = admin.firestore.FieldValue.serverTimestamp();

      // Idempotency: Cashfree retries and may deliver twice; revenue counters must only move once per order.
      // The marker is removed again if processing fails, so a retry can complete the work.
      eventRef = db.collection("webhook_events").doc(`cashfree_${orderId}_PAYMENT_SUCCESS`);
      try {
        await eventRef.create({ orderId, type: event.type, receivedAt: now });
      } catch (createErr) {
        eventRef = null;
        if (createErr && (createErr.code === 6 || /already exists/i.test(createErr.message || ""))) {
          console.log(`[WEBHOOK] duplicate PAYMENT_SUCCESS for ${orderId}, ignored`);
          return res.status(200).send("Duplicate webhook ignored");
        }
        throw createErr;
      }

      // Update Orders (V1 + V2 Schema)
      let orders = await db.collection("orders").where("orderId", "==", orderId).get();
      if (orders.empty) {
        orders = await db.collection("payment_transactions").where("orderId", "==", orderId).get();
      }
      const orderBatch = db.batch();
      orders.forEach((doc) => {
        const updateData = {
          status: "PAID",
          orderStatus: "completed",
          "paymentDetails.paymentStatus": "completed",
          "paymentDetails.paidAt": now
        };
        if (webhookCustomerEmail && typeof webhookCustomerEmail === "string" && !webhookCustomerEmail.toLowerCase().includes("user@printmimo.tech")) {
          updateData.customerEmail = webhookCustomerEmail;
        }
        orderBatch.update(doc.ref, updateData);
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
      // Guard: only call if no print code exists yet on THIS order's jobs (scoped by orderId, not userId --
      // otherwise a customer's second/future order would be silently skipped because an earlier order of theirs
      // already carries a printCode). postPaymentSuccess itself uses the same orderId scoping.
      const existingCodeCheck = await db.collection("print_jobs")
        .where("orderId", "==", orderId)
        .where("printCode", "!=", null)
        .limit(1)
        .get();

      if (existingCodeCheck.empty) {
        try {
          const dummyToken = jwt.sign({ userId }, getSecretKey(), { expiresIn: "1h" });
          const webhookReqBody = { orderId };
          if (webhookCustomerEmail && typeof webhookCustomerEmail === "string" && !webhookCustomerEmail.toLowerCase().includes("user@printmimo.tech")) {
            webhookReqBody.customerEmail = webhookCustomerEmail;
          }
          await axios.post(
            `http://localhost:${process.env.PORT || 8080}/payment-success`,
            webhookReqBody,
            { headers: { Authorization: `Bearer ${dummyToken}` } }
          );
        } catch (internalErr) {
          console.error("[WEBHOOK] Failed to call internal /payment-success:", internalErr.message);
        }
      } else {
        console.log(`[WEBHOOK] Print code already exists for order ${orderId}, skipping duplicate generation.`);
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
    } else if (event.type === "SETTLEMENT_SUCCESS" || event.type === "TRANSFER_SUCCESS") {
      const settlementData = event.data?.settlement || event.data?.transfer || event.data;
      if (!settlementData || (!settlementData.settlement_id && !settlementData.transfer_id && !settlementData.amount && !settlementData.settlement_amount)) {
        console.log(`[WEBHOOK] settlement event with no data, acknowledged`);
        return res.status(200).send("Webhook ignored");
      }
      const settlementId = String(settlementData.settlement_id || settlementData.transfer_id || settlementData.cf_settlement_id || Date.now());
      const now = admin.firestore.FieldValue.serverTimestamp();

      eventRef = db.collection("webhook_events").doc(`cashfree_settle_${settlementId}`);
      try {
        await eventRef.create({ settlementId, type: event.type, receivedAt: now });
      } catch (createErr) {
        eventRef = null;
        if (createErr && (createErr.code === 6 || /already exists/i.test(createErr.message || ""))) {
          console.log(`[WEBHOOK] duplicate settlement event for ${settlementId}, ignored`);
          return res.status(200).send("Duplicate webhook ignored");
        }
        throw createErr;
      }

      await db.collection("cashfree_settlements").doc(settlementId).set({
        settlementId,
        cfSettlementId: settlementData.cf_settlement_id || settlementId,
        utr: settlementData.utr || settlementData.payment_utr || null,
        settlementAmount: Number(settlementData.settlement_amount || settlementData.transfer_amount || settlementData.amount || 0),
        serviceCharge: Number(settlementData.service_charge || settlementData.fee || 0),
        serviceTax: Number(settlementData.service_tax || settlementData.tax || 0),
        settlementCurrency: settlementData.settlement_currency || settlementData.currency || "INR",
        settlementTime: settlementData.settlement_time || settlementData.transfer_time || new Date().toISOString(),
        settlementTimeMs: settlementData.settlement_time ? new Date(settlementData.settlement_time).getTime() : Date.now(),
        orderId: settlementData.order_id || null,
        reconciledStatus: "RECORDED",
        rawPayload: event,
        createdAt: now,
      }, { merge: true });

      console.log(`[WEBHOOK] Settlement ${settlementId} recorded, amount=₹${settlementData.settlement_amount || settlementData.amount}`);
      res.status(200).send("Settlement webhook processed");
    } else if (event.type === "REFUND_STATUS_WEBHOOK") {
      const refundData = event.data?.refund;
      if (!refundData || !refundData.order_id) {
        console.log(`[WEBHOOK] refund status event with no order_id, acknowledged`);
        return res.status(200).send("Webhook ignored");
      }
      const orderId = refundData.order_id;
      const cfRefundId = refundData.cf_refund_id;
      const status = refundData.refund_status || "SUCCESS";
      const now = admin.firestore.FieldValue.serverTimestamp();

      const refSnap = await db.collection("refunds").where("orderId", "==", orderId).get();
      if (!refSnap.empty) {
        await refSnap.docs[0].ref.update({
          status,
          cashfreeRefundId: cfRefundId || null,
          gatewayStatus: status,
          processedAt: refundData.processed_at || new Date().toISOString(),
          updatedAt: now,
        });
      }
      console.log(`[WEBHOOK] Refund status ${status} recorded for order ${orderId}`);
      res.status(200).send("Refund webhook processed");
    } else if (event.type === "PAYMENT_FAILED_WEBHOOK" || event.type === "PAYMENT_USER_DROPPED_WEBHOOK") {
      // Previously a no-op: the job just stayed "pending" forever, relying solely on the unrelated 24h
      // storage-age sweep to eventually notice. Flipping it to "abandoned" now makes the failure visible
      // and cleanable immediately, same status/fields upload.controller.js already uses for abandoned jobs.
      const orderId = event.data?.order?.order_id;
      if (!orderId) {
        console.log(`[WEBHOOK] ${event.type} with no order_id, acknowledged`);
        return res.status(200).send("Webhook ignored");
      }
      const now = admin.firestore.FieldValue.serverTimestamp();
      const jobs = await db.collection("print_jobs").where("orderId", "==", orderId).get();
      const jobsBatch = db.batch();
      let abandonedCount = 0;
      jobs.forEach((doc) => {
        if (doc.data().status === "pending") {
          jobsBatch.update(doc.ref, { status: "abandoned", abandonedAt: now, updatedAt: now, abandonReason: event.type });
          abandonedCount += 1;
        }
      });
      if (abandonedCount > 0) await jobsBatch.commit();
      console.log(`[WEBHOOK] ${event.type} for order ${orderId}: ${abandonedCount} job(s) marked abandoned`);
      res.status(200).send("Webhook processed");
    } else {
      // Acknowledge other events
      console.log(`[WEBHOOK] event ${event.type || "unknown"} acknowledged, no action`);
      res.status(200).send("Webhook ignored");
    }
  } catch (err) {
    console.error(err);
    if (eventRef) await eventRef.delete().catch(() => {});
    if (!res.headersSent) res.sendStatus(500);
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
// This route is reachable by any authenticated user, not just the two internal callers above (getVerifyPayment
// and the webhook handler) -- it used to accept a req.body.internalSecret that neither caller's request was ever
// actually checked against (dead code; removed). That's fine: the real protection against an attacker calling
// this directly for someone else's order is the per-job orders/payment_transactions status==="PAID" check inside
// the transaction below, which reads real payment state server-side and is independent of anything the caller sends.
// Mission 38: the transactional print-code-issuance logic now lives in
// functions/src/services/order.service.js:fulfillPaidOrder — extracted VERBATIM from this function as it
// stood on current main (no behavior changed; see that file's own header).
const postPaymentSuccess = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { orderId, customerEmail } = req.body; // Scoped to the specific order being confirmed
    const result = await fulfillPaidOrder({ db, userId, orderId, reqUser: req.user, customerEmail });
    if (result.alreadyIssued) {
      // Idempotent re-check: these jobs already had a code from an earlier call, nothing was written just
      // now, so the receipt e-mail/WhatsApp message (already sent the first time) is not sent again.
      return res.json({ printCode: result.printCode, directKioskId: result.directKioskId });
    }
    res.json({ message: "Payment success", printCode: result.printCode, directKioskId: result.directKioskId });
  } catch (err) {
    if (err instanceof OrderServiceError) {
      return res.status(err.status).json({ error: err.message });
    }
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

    // The order status above is PAID/REFUNDED, never "printing" or "completed": whether the order was printed lives on its print jobs.
    const orderJobs = await db.collection("print_jobs").where("orderId", "==", orderId).where("userId", "==", userId).get();
    const alreadyPrinted = orderJobs.docs.some((d) => {
      const job = d.data();
      return ["printing", "completed", "printed"].includes(job.status) || job.isPrinted === true;
    });
    if (alreadyPrinted) {
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
