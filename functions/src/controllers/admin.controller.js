const axios = require("axios");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { CASHFREE_BASE_URL, getSecretKey, cashfreeHeaders } = require("../config/env");
const { admin, db } = require("../config/firebase");
const { claimRefund, releaseRefund, refundIdFor, REFUND_BLOCKED_MESSAGES } = require("../services/refund.service");
const { normalizeOrders } = require("../services/analytics.service");
const profile = require("./profile.controller");
const chat = require("./chat.controller");
const { logFinancialAudit } = require("../utils/auditLogger");
const { toPaise, toRupees } = require("../utils/money");
const { cachedCollectionGet } = require("../utils/scanCache");

// Constant-time password comparison: both sides are hashed to a fixed 32-byte SHA-256 digest first, so
// a length mismatch (almost guaranteed between a real password and an attacker's guess) can never make
// the comparison short-circuit early and leak timing information about the real password's length.
const passwordsMatch = (a, b) => {
  const ha = crypto.createHash("sha256").update(String(a || "")).digest();
  const hb = crypto.createHash("sha256").update(String(b || "")).digest();
  return crypto.timingSafeEqual(ha, hb);
};

// ================= ADMIN AUTH =================
const postAdminLogin = (req, res) => {
  const { email, username, password } = req.body;

  // Defensively strip quotes and whitespace from both env vars and user input
  const envAdminEmail    = (process.env.ADMIN_EMAIL    || "").replace(/^"|"$/g, '').trim();
  const envAdminPassword = (process.env.ADMIN_PASSWORD || "").replace(/^"|"$/g, '').trim();
  const envFinanceEmail    = (process.env.FINANCE_EMAIL    || "").replace(/^"|"$/g, '').trim();
  const envFinancePassword = (process.env.FINANCE_PASSWORD || "").replace(/^"|"$/g, '').trim();

  const reqIdentifier = (email || username || "").trim();
  const reqPassword   = (password || "").trim();

  // Admin credentials
  if (
    envAdminEmail &&
    envAdminPassword &&
    reqIdentifier.toLowerCase() === envAdminEmail.toLowerCase() &&
    passwordsMatch(reqPassword, envAdminPassword)
  ) {
    const token = jwt.sign({ isAdmin: true, role: "admin", email: reqIdentifier }, getSecretKey(), { expiresIn: "30d" });
    return res.json({ token, role: "admin", message: "Admin Login Successful" });
  }

  // Finance credentials
  if (
    envFinanceEmail &&
    envFinancePassword &&
    reqIdentifier.toLowerCase() === envFinanceEmail.toLowerCase() &&
    passwordsMatch(reqPassword, envFinancePassword)
  ) {
    const token = jwt.sign({ isAdmin: false, role: "finance", email: reqIdentifier }, getSecretKey(), { expiresIn: "30d" });
    return res.json({ token, role: "finance", message: "Finance Login Successful" });
  }

  // Never log the submitted password (or the real admin/finance email identifiers) -- a mistyped
  // password here would otherwise leak a near-real or real credential into Cloud Logging.
  console.log(`[AUTH FAILED] Login attempt for identifier length=${reqIdentifier.length}`);
  return res.status(401).json({ error: "Invalid credentials" });
};

// ================= ADMIN COUPONS =================
const getAdminCoupons = async (req, res) => {
  try {
    const snapshot = await db.collection("coupons").get();
    const coupons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
};

const postAdminCoupons = async (req, res) => {
  try {
    const { code, discountPercentage, expiryDate, isActive, maxUses } = req.body;
    if (!code || discountPercentage === undefined) return res.status(400).json({ error: "Missing required fields" });

    const couponRef = db.collection("coupons").doc(code.toUpperCase().trim());
    const data = {
      code: code.toUpperCase().trim(),
      discountPercentage: Number(discountPercentage),
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (maxUses !== undefined && maxUses !== null && maxUses !== '') {
      data.maxUses = Number(maxUses);
    }
    await couponRef.set(data, { merge: true });

    res.json({ message: "Coupon saved successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to save coupon" });
  }
};

const deleteAdminCoupons = async (req, res) => {
  try {
    await db.collection("coupons").doc(req.params.code).delete();
    res.json({ message: "Coupon deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete coupon" });
  }
};

const getAdminSettings = async (req, res) => {
  try {
    const doc = await db.collection("mimo_settings").doc("pricing").get();
    res.json(doc.exists ? doc.data() : { pricePerPageBW: 2.80, pricePerPageColor: 10.00, pricePerPageA4: 2.80, pricePerPageBWDuplex: 3.30, pricePerPageGraph: 2.00 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const postAdminSettings = async (req, res) => {
  try {
    const { pricePerPageBW, pricePerPageColor, pricePerPageA4, pricePerPageGraph, pricePerPageBWDuplex } = req.body;
    await db.collection("mimo_settings").doc("pricing").set({
      pricePerPageBW: Number(pricePerPageBW),
      pricePerPageColor: Number(pricePerPageColor),
      pricePerPageA4: Number(pricePerPageA4 || 2.80),
      pricePerPageBWDuplex: Number(pricePerPageBWDuplex || 3.30),
      pricePerPageGraph: Number(pricePerPageGraph || 2.00)
    }, { merge: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getAdminScreensaver = async (req, res) => {
  try {
    const doc = await db.collection("mimo_settings").doc("screensaver").get();
    res.json(doc.exists ? doc.data() : {
      videos: [
        "/vidssave.com Apple Education_ Ready for every learning opportunity 5 1080P.mp4",
        "/second_video.mp4",
        "/3_video.mp4",
        "/4_video.mp4"
      ],
      playSound: true,
      idleTimeoutSeconds: 60
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Admin-only equivalent of postGetUploadUrl (upload.controller.js) for the two admin-managed, public-READ
// asset prefixes (screensaver/, ads/) -- see F-01: the bucket no longer grants public WRITE, so even these
// staff-only uploads need a server-minted, short-lived signed URL rather than a direct client-SDK write.
const ADMIN_UPLOAD_PREFIXES = { screensaver: "screensaver", ads: "ads" };
const postGetAdminUploadUrl = async (req, res) => {
  try {
    const { fileName, contentType, purpose } = req.body || {};
    const prefix = ADMIN_UPLOAD_PREFIXES[purpose];
    if (!prefix) {
      return res.status(400).json({ error: `purpose must be one of: ${Object.keys(ADMIN_UPLOAD_PREFIXES).join(", ")}` });
    }
    if (typeof admin.storage !== "function") {
      return res.status(500).json({ error: "Storage is not configured." });
    }
    const safeName = String(fileName || "file").split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150) || "file";
    const objectPath = `${prefix}/${Date.now()}_${safeName}`;
    const bucket = admin.storage().bucket();
    const [uploadUrl] = await bucket.file(objectPath).getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000,
      contentType: contentType || "application/octet-stream",
    });
    res.json({
      uploadUrl,
      contentType: contentType || "application/octet-stream",
      fileUrl: `https://storage.googleapis.com/${bucket.name}/${objectPath}`,
      expiresInSeconds: 900,
    });
  } catch (err) {
    console.error("[ADMIN-UPLOAD-URL] Failed to mint signed upload URL:", err.message);
    res.status(500).json({ error: "Could not prepare the upload. Please try again." });
  }
};

const postAdminScreensaver = async (req, res) => {
  try {
    const { videos, playSound, idleTimeoutSeconds } = req.body;
    await db.collection("mimo_settings").doc("screensaver").set({
      videos: Array.isArray(videos) ? videos : [
        "/vidssave.com Apple Education_ Ready for every learning opportunity 5 1080P.mp4",
        "/second_video.mp4",
        "/3_video.mp4",
        "/4_video.mp4"
      ],
      playSound: Boolean(playSound),
      idleTimeoutSeconds: Number(idleTimeoutSeconds || 60)
    }, { merge: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getAdminHardware = async (req, res) => {
  try {
    const doc = await db.collection("hardware").doc("printers").get();
    if (!doc.exists) {
      const defaultData = {
        "CV-001": { type: "bw", tonerLevel: 100, paperLevel: 500, status: "Online" },
        "SV-002-COLOR": { type: "color", inkLevel: 100, paperLevel: 500, status: "Online" }
      };
      await db.collection("hardware").doc("printers").set(defaultData);
      return res.json(defaultData);
    }
    res.json(doc.data());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const postAdminHardware = async (req, res) => {
  try {
    const { updates } = req.body;
    await db.collection("hardware").doc("printers").set(updates, { merge: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getAdminMetrics = async (req, res) => {
  try {
    const [ordersSnap, usersSnap, jobsSnap, metricsDoc] = await Promise.all([
      cachedCollectionGet(db, "orders"),
      cachedCollectionGet(db, "users"),
      cachedCollectionGet(db, "print_jobs"),
      db.collection("system").doc("metrics").get()
    ]);

    let totalRevenue = 0;
    let totalPages = 0;

    ordersSnap.forEach((doc) => {
      const data = doc.data();
      if (data.status === "PAID" || data.status === "SUCCESS") {
        totalRevenue += data.amount || 0;
      }
    });

    jobsSnap.forEach((doc) => {
      const data = doc.data();
      if (data.status === "paid" || data.status === "completed" || data.status === "printed") {
        totalPages += (data.pageCount || 0) * (data.printOptions?.copies || 1);
      }
    });

    let totalFreePagesPrinted = 0;
    let pagesByPrice = { free: 0, paid: 0 };
    if (metricsDoc.exists) {
      totalFreePagesPrinted = metricsDoc.data().totalFreePagesPrinted || 0;
      pagesByPrice = metricsDoc.data().pagesByPrice || { free: 0, paid: 0 };
    }

    res.json({
      totalRevenue,
      totalPages,
      totalFreePagesPrinted,
      pagesByPrice,
      totalOrders: ordersSnap.size,
      activeUsers: usersSnap.size
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
};

const postAdminResetMetrics = async (req, res) => {
  try {
    await db.collection("system").doc("metrics").set({
      totalRevenue: 0,
      totalOrders: 0,
      totalPagesPrinted: 0,
      totalFreePagesPrinted: 0,
      pagesByPrice: { free: 0, paid: 0 },
      dailyRevenue: {},
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true, message: "Metrics reset successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getAdminRecentPrints = async (req, res) => {
  try {
    const jobsSnapshot = await db.collection("print_jobs")
      .orderBy("createdAt", "desc")
      .limit(30)
      .get();

    const recentPrints = [];
    for (const doc of jobsSnapshot.docs) {
      const data = doc.data();
      let userEmail = data.userEmail || "Guest User";

      try {
        if (!data.userEmail && data.userId && data.source !== "whatsapp") {
          const userDoc = await db.collection("users").doc(data.userId).get();
          if (userDoc.exists) userEmail = userDoc.data().email || "Guest User";
        }
      } catch (e) { }

      let dateStr = "";
      if (data.createdAt) {
        dateStr = data.createdAt.toDate ? data.createdAt.toDate().toISOString() : new Date(data.createdAt).toISOString();
      }

      recentPrints.push({
        id: doc.id,
        createdAt: dateStr,
        userEmail: data.source === "whatsapp" ? data.userId || "WA User" : userEmail,
        userPhone: data.userPhone || data.phoneNumber || null,
        file: data.fileName || "Unknown File",
        status: data.status || "completed",
        cost: data.totalCost || data.amount || 0,
        copies: data.copies || 1,
        pageCount: data.pageCount || 1,
        colorMode: data.colorMode || "bw",
        destination: data.printDestination || data.kioskId || "Any",
        orderId: data.orderId || null,
        refundStatus: data.refundStatus || null,
        refundAmount: data.refundAmount || null
      });
    }

    res.json(recentPrints);
  } catch (err) {
    console.error("Recent prints error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ================= ADMIN: BULK COUPONS =================
// (ported from the legacy Express server; handler body unchanged)
// expiryDate is stored as a Firestore Timestamp (the legacy server stored an ISO string), because
// /validate-coupon and /create-order call expiryDate.toDate().
const postAdminCouponsBulk = async (req, res) => {
  try {
    const { prefix, count, discountPercentage, expiryDate } = req.body;
    const batch = db.batch();
    const generatedCodes = [];
    
    for(let i = 0; i < Number(count); i++) {
      const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
      const code = `${prefix.toUpperCase()}-${randomStr}`;
      generatedCodes.push(code);
      const ref = db.collection("coupons").doc(code);
      batch.set(ref, {
        discountPercentage: Number(discountPercentage),
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        isActive: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isBulk: true
      });
    }
    await batch.commit();
    res.json({ success: true, count: generatedCodes.length, codes: generatedCodes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ================= ADMIN REFUND =================
// (ported from the legacy Express server; handler body unchanged)
// ================= ADMIN REFUND =================
// Core refund logic used by single and bulk admin refunds
async function executeOrderRefund({ orderId, refundAmount, note, actor = {} }) {
  if (!orderId) throw Object.assign(new Error("orderId is required"), { status: 400 });

  // 1. Fetch the order to get the amount and userId
  let ordSnap = await db.collection("orders").where("orderId", "==", orderId).get();
  if (ordSnap.empty) {
    ordSnap = await db.collection("payment_transactions").where("orderId", "==", orderId).get();
  }
  if (ordSnap.empty) throw Object.assign(new Error("Order not found"), { status: 404 });

  const orderData = ordSnap.docs[0].data();
  const userId = orderData.userId;
  const originalAmount = orderData.amount || orderData.totals?.totalAmount || 0;
  const amountToRefund = refundAmount ? Number(refundAmount) : originalAmount;

  if (amountToRefund <= 0 || amountToRefund > originalAmount) {
    throw Object.assign(new Error(`Invalid refund amount. Must be between 0.01 and ${originalAmount}`), { status: 400 });
  }

  // 2. Claim the refund
  const orderRef = ordSnap.docs[0].ref;
  const claim = await claimRefund(db, orderRef);
  if (!claim.claimed) {
    throw Object.assign(new Error(REFUND_BLOCKED_MESSAGES[claim.reason] || "Refund not allowed."), { status: 409 });
  }

  const refundId = refundIdFor("refund_adm", orderId);
  let cashfreeRefundResponse = null;
  try {
    const cfRefundRes = await axios.post(
      `${CASHFREE_BASE_URL}/orders/${orderId}/refunds`,
      {
        refund_amount: amountToRefund,
        refund_id: refundId,
        refund_note: note || "Refund initiated by Mimo admin/finance",
      },
      { headers: cashfreeHeaders, timeout: 15000 }
    );
    cashfreeRefundResponse = cfRefundRes.data;
    console.log(`[ADMIN-REFUND] Cashfree refund created: ${refundId} for orderId=${orderId} amount=₹${amountToRefund}`);
  } catch (cfErr) {
    const cfError = cfErr.response?.data?.message || cfErr.message;
    console.error(`[ADMIN-REFUND] Cashfree refund API failed: ${cfError}`);
    await releaseRefund(orderRef, claim.previousRefundStatus, admin.firestore.FieldValue);
    throw Object.assign(new Error(`Cashfree refund failed: ${cfError}`), { status: 502 });
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  // 3. Record refund in Firestore `refunds` collection
  const refundDocRef = db.collection("refunds").doc(refundId);
  batch.set(refundDocRef, {
    refundId,
    orderId,
    userId,
    refundAmount: amountToRefund,
    originalAmount,
    status: cashfreeRefundResponse?.refund_status || "PENDING",
    cashfreeRefundId: cashfreeRefundResponse?.cf_refund_id || null,
    note: note || null,
    initiatedAt: now,
    cashfreeResponse: cashfreeRefundResponse,
    approvedBy: actor.email || "finance",
  });

  // 4. Mark order as REFUNDED
  ordSnap.forEach((doc) => {
    batch.update(doc.ref, {
      status: "REFUNDED",
      orderStatus: "refunded",
      refundStatus: "SUCCESS",
      refundClaimedAt: admin.firestore.FieldValue.delete(),
      refundId,
      refundedAt: now,
      refundAmount: amountToRefund,
    });
  });

  // 5. Reset print_jobs to 'pending' if not yet printed
  const jobsSnap = await db.collection("print_jobs")
    .where("userId", "==", userId)
    .where("orderId", "==", orderId)
    .get();
  jobsSnap.forEach((doc) => {
    const data = doc.data();
    if (!["printing", "completed"].includes(data.status)) {
      batch.update(doc.ref, {
        status: "refunded",
        "paymentStatus.status": "refunded",
        refundId,
        refundedAt: now,
      });
    }
  });

  // 6. Mark pending refund_request as resolved
  const refReqSnap = await db.collection("refund_requests")
    .where("orderId", "==", orderId)
    .where("status", "==", "pending")
    .get();
  refReqSnap.forEach((doc) => {
    batch.update(doc.ref, {
      status: "processed",
      resolvedAt: now,
      resolvedBy: actor.email || "finance",
      adminNote: note || "Refund processed",
      refundId,
    });
  });

  await batch.commit();

  await logFinancialAudit({
    action: "REFUND_EXECUTE",
    actor,
    targetId: orderId,
    details: { refundId, amountToRefund, originalAmount, note },
    status: "SUCCESS",
  });

  return {
    refundId,
    amountToRefund,
    cashfreeStatus: cashfreeRefundResponse?.refund_status,
  };
}

// Admin manually triggers a real Cashfree refund for an order.
const postAdminRefund = async (req, res) => {
  try {
    const { orderId, refundAmount, note } = req.body;
    const actor = req.admin || req.staff || { email: "admin" };
    const result = await executeOrderRefund({ orderId, refundAmount, note, actor });

    res.json({
      message: `Refund of ₹${result.amountToRefund} initiated successfully for order ${orderId}`,
      refundId: result.refundId,
      cashfreeStatus: result.cashfreeStatus,
    });
  } catch (err) {
    console.error("[ADMIN-REFUND] Error:", err.message);
    res.status(err.status || 500).json({ error: err.message || "Refund processing failed" });
  }
};

// Bulk refund approval endpoint with per-item outcomes and claim locking
const postAdminBulkRefund = async (req, res) => {
  try {
    const { orderIds = [], note } = req.body;
    if (!Array.isArray(orderIds) || !orderIds.length) {
      return res.status(400).json({ error: "orderIds must be a non-empty array" });
    }

    const actor = req.admin || req.staff || { email: "finance" };
    const results = [];
    let successfulCount = 0;
    let failedCount = 0;

    for (const orderId of orderIds) {
      try {
        const result = await executeOrderRefund({
          orderId,
          note: note || "Bulk refund approved by finance team",
          actor,
        });
        successfulCount++;
        results.push({ orderId, status: "SUCCESS", refundId: result.refundId, amount: result.amountToRefund });
      } catch (itemErr) {
        failedCount++;
        results.push({ orderId, status: "FAILED", error: itemErr.message });
      }
    }

    await logFinancialAudit({
      action: "REFUND_BULK_APPROVE",
      actor,
      targetId: `${orderIds.length}_orders`,
      details: { total: orderIds.length, successfulCount, failedCount, note },
      status: failedCount === 0 ? "SUCCESS" : "PARTIAL",
    });

    res.json({
      message: `Bulk refund completed: ${successfulCount} approved, ${failedCount} failed`,
      total: orderIds.length,
      successfulCount,
      failedCount,
      results,
    });
  } catch (err) {
    console.error("[ADMIN-BULK-REFUND] Error:", err.message);
    res.status(500).json({ error: "Bulk refund execution failed" });
  }
};

// ================= ADMIN REFUND REQUESTS LIST =================
// Admin views all user refund requests and processed refunds.
const getAdminRefundRequests = async (req, res) => {
  try {
    const [reqSnap, refundsSnap, ordersSnap] = await Promise.all([
      db.collection("refund_requests").limit(100).get().catch(() => ({ docs: [] })),
      db.collection("refunds").limit(100).get().catch(() => ({ docs: [] })),
      db.collection("orders").where("status", "==", "REFUNDED").limit(100).get().catch(() => ({ docs: [] })),
    ]);

    const seenOrders = new Set();
    const requests = [];

    // 1. Explicit refund requests from students / users
    reqSnap.docs.forEach((doc) => {
      const data = doc.data();
      const orderId = data.orderId || doc.id;
      seenOrders.add(orderId);
      const reqDate = data.requestedAt?.toDate ? data.requestedAt.toDate().toISOString() : data.requestedAt || data.createdAt || new Date().toISOString();
      requests.push({
        id: doc.id,
        orderId: orderId,
        userId: data.userId || null,
        userEmail: data.userEmail || null,
        amount: Number(data.amount || data.refundAmount || 0),
        refundAmount: Number(data.refundAmount || data.amount || 0),
        reason: data.reason || data.note || "Hardware paper jam / print error",
        status: String(data.status || "pending").toLowerCase(),
        requestedAt: reqDate,
        createdAt: reqDate,
      });
    });

    // 2. Processed refunds from `refunds` collection
    refundsSnap.docs.forEach((doc) => {
      const data = doc.data();
      const orderId = data.orderId || doc.id;
      if (!seenOrders.has(orderId)) {
        seenOrders.add(orderId);
        const refDate = data.initiatedAt?.toDate ? data.initiatedAt.toDate().toISOString() : data.initiatedAt || new Date().toISOString();
        requests.push({
          id: doc.id,
          orderId: orderId,
          userId: data.userId || null,
          userEmail: data.userEmail || null,
          amount: Number(data.refundAmount || data.amount || data.originalAmount || 0),
          refundAmount: Number(data.refundAmount || data.amount || 0),
          reason: data.note || "Admin processed refund",
          // A `refunds` doc exists only after the gateway accepted the refund. Its own `status` is Cashfree's
          // refund_status (PENDING / SUCCESS / ...), where PENDING just means "in flight at the bank". Showing
          // that as the request status made finished refunds look approvable, and every "approve" then failed
          // with "already refunded". The request is always processed; the gateway state is kept separately.
          status: "processed",
          gatewayStatus: data.status ? String(data.status).toUpperCase() : null,
          requestedAt: refDate,
          createdAt: refDate,
        });
      }
    });

    // 3. Orders marked REFUNDED
    ordersSnap.docs.forEach((doc) => {
      const data = doc.data();
      const orderId = data.orderId || doc.id;
      if (!seenOrders.has(orderId)) {
        seenOrders.add(orderId);
        const ordDate = data.refundedAt?.toDate ? data.refundedAt.toDate().toISOString() : data.refundedAt || data.createdAt || new Date().toISOString();
        requests.push({
          id: doc.id,
          orderId: orderId,
          userId: data.userId || null,
          userEmail: data.userEmail || null,
          amount: Number(data.refundAmount || data.amount || 0),
          refundAmount: Number(data.refundAmount || data.amount || 0),
          reason: data.refundReason || data.reason || "Kiosk print failure",
          status: "processed",
          requestedAt: ordDate,
          createdAt: ordDate,
        });
      }
    });

    // Sort descending by date
    requests.sort((a, b) => new Date(b.requestedAt || b.createdAt).getTime() - new Date(a.requestedAt || a.createdAt).getTime());

    const { from, to } = req.query;
    let filteredRequests = requests;
    if (from || to) {
      const fromMs = from ? new Date(from).getTime() : 0;
      const toMs = to ? new Date(to).getTime() : Infinity;
      filteredRequests = requests.filter((r) => {
        const t = new Date(r.requestedAt || r.createdAt).getTime();
        return t >= fromMs && t < toMs;
      });
    }

    res.json({ requests: filteredRequests, total: requests.length });
  } catch (err) {
    console.error("[ADMIN-REFUND-REQUESTS] Error:", err);
    res.status(500).json({ error: "Failed to fetch refund requests", requests: [] });
  }
};


// ================= ADMIN USERS & CUSTOMER INTELLIGENCE =================
const getAdminUsers = async (req, res) => {
  try {
    const [usersSnap, ordersSnap, txnSnap, jobsSnap] = await Promise.all([
      cachedCollectionGet(db, "users"),
      cachedCollectionGet(db, "orders"),
      cachedCollectionGet(db, "payment_transactions"),
      cachedCollectionGet(db, "print_jobs")
    ]);

    // Aggregate user spending and job statistics. Merging orders + payment_transactions (the same helper
    // the Finance revenue dashboard relies on) matters here specifically: a real, non-free paid order is
    // written to payment_transactions, not orders (see payment.controller.js's postCreateOrder) — reading
    // orders alone silently undercounts every real customer's spend and the conversion rate below it.
    const userStats = {};
    const payingUserIds = new Set();
    let totalRevenue = 0;

    const mergedOrders = normalizeOrders(
      ordersSnap.docs.map((d) => d.data()),
      txnSnap.docs.map((d) => d.data())
    );
    mergedOrders.forEach((ord) => {
      const uid = ord.userId || "anonymous";
      if (ord.status === "PAID") {
        totalRevenue += ord.amount;
        if (ord.userId) payingUserIds.add(ord.userId);
        if (!userStats[uid]) userStats[uid] = { totalSpend: 0, orderCount: 0, pagesPrinted: 0 };
        userStats[uid].totalSpend += ord.amount;
        userStats[uid].orderCount += 1;
      }
    });

    jobsSnap.forEach((doc) => {
      const job = doc.data();
      const uid = job.userId || job.userEmail || "anonymous";
      const pages = (job.pageCount || 0) * (job.copies || 1);
      if (!userStats[uid]) userStats[uid] = { totalSpend: 0, orderCount: 0, pagesPrinted: 0 };
      userStats[uid].pagesPrinted += pages;
    });

    const userList = [];
    usersSnap.forEach((doc) => {
      const u = doc.data();
      const uid = doc.id;
      const stats = userStats[uid] || userStats[u.email] || { totalSpend: 0, orderCount: 0, pagesPrinted: 0 };

      let joinedAt = "";
      if (u.createdAt) {
        joinedAt = u.createdAt.toDate ? u.createdAt.toDate().toISOString() : new Date(u.createdAt).toISOString();
      }

      userList.push({
        id: uid,
        username: u.username || u.name || "Mimo User",
        email: u.email || "No Email",
        mobileNumber: u.mobileNumber || u.phoneNumber || "—",
        googleUser: Boolean(u.googleUser),
        isGuest: Boolean(u.isGuest),
        mimoCoins: null,
        totalSpend: Number(stats.totalSpend.toFixed(2)),
        orderCount: stats.orderCount,
        pagesPrinted: stats.pagesPrinted,
        isPayingCustomer: stats.orderCount > 0,
        joinedAt: joinedAt || new Date().toISOString()
      });
    });

    // Sort users by total spend or join date
    userList.sort((a, b) => b.totalSpend - a.totalSpend);

    const totalUsers = usersSnap.size;
    const guestUsers = userList.filter((u) => u.isGuest).length;
    const registeredUsers = totalUsers - guestUsers;
    const activeCustomers = payingUserIds.size;
    // Conversion is measured against people who actually registered, not the walk-up guest count
    // (a guest who never creates an account was never a conversion candidate in the first place).
    const conversionRate = registeredUsers > 0 ? Number(((activeCustomers / registeredUsers) * 100).toFixed(1)) : 0;
    const avgRevenuePerUser = totalUsers > 0 ? Number((totalRevenue / totalUsers).toFixed(2)) : 0;

    res.json({
      metrics: {
        totalUsers,
        registeredUsers,
        guestUsers,
        activeCustomers,
        conversionRate,
        avgRevenuePerUser,
        totalRevenue: Number(totalRevenue.toFixed(2))
      },
      users: userList
    });
  } catch (err) {
    console.error("[ADMIN-USERS] Error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

const getStaffProfile = async (req, res) => {
  try {
    res.json({ profile: await profile.getRoleProfile(req.staff.role) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const postStaffProfileDocument = async (req, res) => {
  try {
    const result = await profile.uploadRoleDocument(req, req.staff.role, req.params.docType);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

const patchStaffProfile = async (req, res) => {
  try {
    const result = await profile.updateRoleProfile(req, req.staff.role);
    res.json({ profile: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

const getStaffChatMessages = async (req, res) => {
  try {
    res.json({ messages: await chat.getChatMessages(req.staff.role) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const postStaffChatMessage = async (req, res) => {
  try {
    const roleProfile = await profile.getRoleProfile(req.staff.role);
    const senderName = roleProfile.name || (req.staff.role === "admin" ? "Admin" : "Finance");
    const message = await chat.postChatMessage(req, req.staff.role, {
      id: req.staff.role,
      name: senderName,
      avatarUrl: roleProfile.avatarUrl || null,
    });
    res.json({ message });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

// ================= FINANCIAL AUDIT LOGS =================
const getAdminFinancialAuditLogs = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const snap = await db.collection("financial_audit_logs")
      .orderBy("timestampMs", "desc")
      .limit(limit)
      .get()
      .catch(() => ({ docs: [] }));
    const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ logs });
  } catch (err) {
    console.error("[AUDIT-LOGS] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
};

// ================= COUPON ANALYTICS =================
const getAdminCouponsAnalytics = async (req, res) => {
  try {
    const [couponSnap, ordersSnap] = await Promise.all([
      db.collection("coupons").get().catch(() => ({ docs: [] })),
      db.collection("orders").where("couponCode", "!=", null).limit(1000).get().catch(() => ({ docs: [] })),
    ]);

    const stats = new Map();
    couponSnap.docs.forEach((doc) => {
      const data = doc.data();
      const code = (data.code || doc.id).toUpperCase().trim();
      stats.set(code, {
        code,
        discountPercentage: data.discountPercentage || 0,
        active: data.active !== false,
        expiresAt: data.expiresAt || null,
        redemptionCount: 0,
        totalDiscountINR: 0,
        uniqueUsers: new Set(),
        orders: [],
        lastRedeemedAt: null,
      });
    });

    ordersSnap.docs.forEach((doc) => {
      const d = doc.data();
      if (!d.couponCode) return;
      const code = String(d.couponCode).toUpperCase().trim();
      let entry = stats.get(code);
      if (!entry) {
        entry = {
          code,
          discountPercentage: d.discountPercentage || 0,
          active: true,
          expiresAt: null,
          redemptionCount: 0,
          totalDiscountINR: 0,
          uniqueUsers: new Set(),
          orders: [],
          lastRedeemedAt: null,
        };
        stats.set(code, entry);
      }
      entry.redemptionCount += 1;
      if (d.userId) entry.uniqueUsers.add(d.userId);
      entry.orders.push(d.orderId || doc.id);

      const gross = Number(d.gross || d.totalCost || d.amount || 0);
      const paid = Number(d.amount || 0);
      const discount = Math.max(0, gross - paid);
      entry.totalDiscountINR += discount;

      const orderTime = d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : d.createdAt || null;
      if (orderTime && (!entry.lastRedeemedAt || orderTime > entry.lastRedeemedAt)) {
        entry.lastRedeemedAt = orderTime;
      }
    });

    const couponAnalytics = [...stats.values()].map((c) => ({
      ...c,
      uniqueUsersCount: c.uniqueUsers.size,
      uniqueUsers: undefined,
      totalDiscountINR: Math.round(c.totalDiscountINR * 100) / 100,
    }));

    res.json({ couponAnalytics });
  } catch (err) {
    console.error("[COUPON-ANALYTICS] Error:", err.message);
    res.status(500).json({ error: "Failed to load coupon analytics" });
  }
};

// ================= PERSISTENT EXPENSES =================
const getAdminExpenses = async (req, res) => {
  try {
    const { category, monthKey, year } = req.query;
    let query = db.collection("expense_ledger");
    if (category) query = query.where("category", "==", category);
    if (monthKey) query = query.where("monthKey", "==", monthKey);
    if (year) query = query.where("year", "==", Number(year));

    const snap = await query.limit(500).get().catch(() => ({ docs: [] }));
    const expenses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    expenses.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const totalAmount = expenses
      .filter((e) => !e.isReversed)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    res.json({ expenses, totalAmount: Math.round(totalAmount * 100) / 100 });
  } catch (err) {
    console.error("[EXPENSES] Error fetching expenses:", err.message);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
};

const postAdminExpense = async (req, res) => {
  try {
    const { date, category, description, amount, paidBy, reference, notes, status = "approved" } = req.body;
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: "A valid positive amount is required" });
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "Date must be in YYYY-MM-DD format" });
    }
    if (!category || !String(category).trim()) {
      return res.status(400).json({ error: "Category is required" });
    }

    const actor = req.admin || req.staff || { email: "finance" };
    const [y, m] = date.split("-");
    const monthKey = `${y}-${m}`;
    const year = parseInt(y, 10);
    const id = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const entry = {
      id,
      date,
      category: String(category).trim(),
      description: String(description || "").trim(),
      amount: Math.round(numAmount * 100) / 100,
      amountPaise: Math.round(numAmount * 100),
      currency: "INR",
      paidBy: String(paidBy || "Company").trim(),
      reference: String(reference || "").trim() || null,
      notes: String(notes || "").trim() || null,
      status: status === "draft" ? "draft" : "approved",
      year,
      monthKey,
      createdBy: { email: actor.email || "finance", role: actor.role || "finance" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isReversed: false,
    };

    await db.collection("expense_ledger").doc(id).set(entry);

    await logFinancialAudit({
      action: "EXPENSE_CREATE",
      actor,
      targetId: id,
      details: { category: entry.category, amount: entry.amount, date: entry.date },
      status: "SUCCESS",
    });

    res.status(201).json(entry);
  } catch (err) {
    console.error("[EXPENSES] Error creating expense:", err.message);
    res.status(500).json({ error: "Failed to create expense" });
  }
};

const deleteAdminExpense = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Expense id is required" });

    const docRef = db.collection("expense_ledger").doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Expense not found" });

    const actor = req.admin || req.staff || { email: "finance" };
    await docRef.update({
      isReversed: true,
      status: "rejected",
      reversedBy: actor.email || "finance",
      reversedAt: new Date().toISOString(),
    });

    await logFinancialAudit({
      action: "EXPENSE_DELETE",
      actor,
      targetId: id,
      details: { previousData: doc.data() },
      status: "SUCCESS",
    });

    res.json({ message: "Expense record reversed successfully", id });
  } catch (err) {
    console.error("[EXPENSES] Error deleting expense:", err.message);
    res.status(500).json({ error: "Failed to reverse expense" });
  }
};

const patchAdminExpense = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Expense id is required" });

    const docRef = db.collection("expense_ledger").doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Expense not found" });

    const existing = doc.data();
    const { date, category, description, amount, paidBy, reference, notes, status } = req.body;

    const updates = { updatedAt: new Date().toISOString() };
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      updates.date = date;
      const [y, m] = date.split("-");
      updates.year = parseInt(y, 10);
      updates.monthKey = `${y}-${m}`;
    }
    if (category) updates.category = String(category).trim();
    if (description !== undefined) updates.description = String(description).trim();
    if (amount !== undefined) {
      const numAmount = Number(amount);
      if (!Number.isFinite(numAmount) || numAmount <= 0) {
        return res.status(400).json({ error: "A valid positive amount is required" });
      }
      updates.amount = Math.round(numAmount * 100) / 100;
      updates.amountPaise = Math.round(numAmount * 100);
    }
    if (paidBy !== undefined) updates.paidBy = String(paidBy).trim();
    if (reference !== undefined) updates.reference = String(reference).trim() || null;
    if (notes !== undefined) updates.notes = String(notes).trim() || null;
    if (status !== undefined) updates.status = status;

    await docRef.update(updates);

    const updated = { ...existing, ...updates };

    const actor = req.admin || req.staff || { email: "finance" };
    await logFinancialAudit({
      action: "EXPENSE_UPDATE",
      actor,
      targetId: id,
      details: { previous: existing, updated: updates },
      status: "SUCCESS",
    });

    res.json(updated);
  } catch (err) {
    console.error("[EXPENSES] Error updating expense:", err.message);
    res.status(500).json({ error: "Failed to update expense" });
  }
};

module.exports = {
  postAdminLogin,
  getAdminCoupons,
  postAdminCoupons,
  deleteAdminCoupons,
  getAdminSettings,
  postAdminSettings,
  getAdminScreensaver,
  postAdminScreensaver,
  postGetAdminUploadUrl,
  getAdminHardware,
  postAdminHardware,
  getAdminMetrics,
  postAdminResetMetrics,
  getAdminRecentPrints,
  postAdminCouponsBulk,
  postAdminRefund,
  postAdminBulkRefund,
  getAdminRefundRequests,
  getAdminUsers,
  getAdminFinancialAuditLogs,
  getAdminCouponsAnalytics,
  getAdminExpenses,
  postAdminExpense,
  patchAdminExpense,
  deleteAdminExpense,
  getStaffProfile,
  patchStaffProfile,
  postStaffProfileDocument,
  getStaffChatMessages,
  postStaffChatMessage,
};

