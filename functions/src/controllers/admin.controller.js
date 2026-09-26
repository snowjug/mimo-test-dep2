const axios = require("axios");
const jwt = require("jsonwebtoken");
const { CASHFREE_BASE_URL, SECRET_KEY, cashfreeHeaders } = require("../config/env");
const { admin, db } = require("../config/firebase");

// ================= ADMIN AUTH =================
const postAdminLogin = (req, res) => {
  const { email, password } = req.body;

  // Defensively strip quotes and whitespace from both env vars and user input
  const envAdminEmail    = (process.env.ADMIN_EMAIL    || "").replace(/^"|"$/g, '').trim();
  const envAdminPassword = (process.env.ADMIN_PASSWORD || "").replace(/^"|"$/g, '').trim();
  const envFinanceEmail    = (process.env.FINANCE_EMAIL    || "").replace(/^"|"$/g, '').trim();
  const envFinancePassword = (process.env.FINANCE_PASSWORD || "").replace(/^"|"$/g, '').trim();

  const reqEmail    = (email    || "").trim();
  const reqPassword = (password || "").trim();

  // Admin credentials
  if (envAdminEmail && envAdminPassword && reqEmail === envAdminEmail && reqPassword === envAdminPassword) {
    const token = jwt.sign({ isAdmin: true, role: "admin", email: reqEmail }, SECRET_KEY, { expiresIn: "24h" });
    return res.json({ token, role: "admin", message: "Admin Login Successful" });
  }

  // Finance credentials
  if (envFinanceEmail && envFinancePassword && reqEmail === envFinanceEmail && reqPassword === envFinancePassword) {
    const token = jwt.sign({ isAdmin: false, role: "finance", email: reqEmail }, SECRET_KEY, { expiresIn: "24h" });
    return res.json({ token, role: "finance", message: "Finance Login Successful" });
  }

  console.log(`[AUTH FAILED] Attempted: '${reqEmail}' / '${reqPassword}' against Admin: '${envAdminEmail}' / Finance: '${envFinanceEmail}'`);
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
    const { code, discountPercentage, expiryDate } = req.body;
    if (!code || !discountPercentage) return res.status(400).json({ error: "Missing required fields" });

    const couponRef = db.collection("coupons").doc(code.toUpperCase());
    await couponRef.set({
      code: code.toUpperCase(),
      discountPercentage: Number(discountPercentage),
      isActive: true,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ message: "Coupon created successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to create coupon" });
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
      db.collection("orders").get(),
      db.collection("users").get(),
      db.collection("print_jobs").get(),
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
// Admin manually triggers a real Cashfree refund for an order.
const postAdminRefund = async (req, res) => {
  try {
    const { orderId, refundAmount, note } = req.body;
    if (!orderId) return res.status(400).json({ error: "orderId is required" });

    // 1. Fetch the order to get the amount and userId
    let ordSnap = await db.collection("orders").where("orderId", "==", orderId).get();
    if (ordSnap.empty) {
      ordSnap = await db.collection("payment_transactions").where("orderId", "==", orderId).get();
    }
    if (ordSnap.empty) return res.status(404).json({ error: "Order not found" });

    const orderData = ordSnap.docs[0].data();
    const userId = orderData.userId;
    const originalAmount = orderData.amount || orderData.totals?.totalAmount || 0;
    const amountToRefund = refundAmount ? Number(refundAmount) : originalAmount;

    if (amountToRefund <= 0 || amountToRefund > originalAmount) {
      return res.status(400).json({ error: `Invalid refund amount. Must be between 0.01 and ${originalAmount}` });
    }

    // 2. Call Cashfree Refund API
    const refundId = `refund_${Date.now()}`;
    let cashfreeRefundResponse = null;
    try {
      const cfRefundRes = await axios.post(
        `${CASHFREE_BASE_URL}/orders/${orderId}/refunds`,
        {
          refund_amount: amountToRefund,
          refund_id: refundId,
          refund_note: note || "Refund initiated by Mimo admin",
        },
        { headers: cashfreeHeaders, timeout: 15000 }
      );
      cashfreeRefundResponse = cfRefundRes.data;
      console.log(`[ADMIN-REFUND] Cashfree refund created: ${refundId} for orderId=${orderId} amount=₹${amountToRefund}`);
    } catch (cfErr) {
      const cfError = cfErr.response?.data?.message || cfErr.message;
      console.error(`[ADMIN-REFUND] Cashfree refund API failed: ${cfError}`);
      return res.status(502).json({ error: `Cashfree refund failed: ${cfError}` });
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
    });

    // 4. Mark order as REFUNDED
    ordSnap.forEach((doc) => {
      batch.update(doc.ref, {
        status: "REFUNDED",
        orderStatus: "refunded",
        refundId,
        refundedAt: now,
        refundAmount: amountToRefund,
      });
    });

    // 5. Reset print_jobs to 'pending' if not yet printed (allows admin retry if needed)
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

    // 6. Mark pending refund_request as resolved (if one exists)
    const refReqSnap = await db.collection("refund_requests")
      .where("orderId", "==", orderId)
      .where("status", "==", "pending")
      .get();
    refReqSnap.forEach((doc) => {
      batch.update(doc.ref, {
        status: "processed",
        resolvedAt: now,
        resolvedBy: "admin",
        adminNote: note || "Refund processed",
        refundId,
      });
    });

    await batch.commit();

    res.json({
      message: `Refund of ₹${amountToRefund} initiated successfully for order ${orderId}`,
      refundId,
      cashfreeStatus: cashfreeRefundResponse?.refund_status,
    });
  } catch (err) {
    console.error("[ADMIN-REFUND] Error:", err);
    res.status(500).json({ error: "Refund processing failed" });
  }
};

// ================= ADMIN REFUND REQUESTS LIST =================
// (ported from the legacy Express server; handler body unchanged)
// ================= ADMIN REFUND REQUESTS LIST =================
// Admin views all pending user refund requests.
const getAdminRefundRequests = async (req, res) => {
  try {
    const snap = await db.collection("refund_requests")
      .orderBy("requestedAt", "desc")
      .limit(50)
      .get();
    const requests = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ requests });
  } catch (err) {
    console.error("[ADMIN-REFUND-REQUESTS] Error:", err);
    res.status(500).json({ error: "Failed to fetch refund requests" });
  }
};

// ================= ADMIN USERS & CUSTOMER INTELLIGENCE =================
const getAdminUsers = async (req, res) => {
  try {
    const [usersSnap, ordersSnap, jobsSnap] = await Promise.all([
      db.collection("users").get(),
      db.collection("orders").get(),
      db.collection("print_jobs").get()
    ]);

    // Aggregate user spending and job statistics
    const userStats = {};
    const payingUserIds = new Set();
    let totalRevenue = 0;

    ordersSnap.forEach((doc) => {
      const ord = doc.data();
      const uid = ord.userId || ord.userEmail || "anonymous";
      const amt = ord.amount || ord.totals?.totalAmount || 0;
      if (ord.status === "PAID" || ord.status === "SUCCESS") {
        totalRevenue += amt;
        if (ord.userId) payingUserIds.add(ord.userId);
        if (!userStats[uid]) userStats[uid] = { totalSpend: 0, orderCount: 0, pagesPrinted: 0 };
        userStats[uid].totalSpend += amt;
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
        mimoCoins: u.mimo_coins?.balance || 0,
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
    const activeCustomers = payingUserIds.size;
    const conversionRate = totalUsers > 0 ? Number(((activeCustomers / totalUsers) * 100).toFixed(1)) : 0;
    const avgRevenuePerUser = totalUsers > 0 ? Number((totalRevenue / totalUsers).toFixed(2)) : 0;

    res.json({
      metrics: {
        totalUsers,
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

module.exports = {
  postAdminLogin,
  getAdminCoupons,
  postAdminCoupons,
  deleteAdminCoupons,
  getAdminSettings,
  postAdminSettings,
  getAdminScreensaver,
  postAdminScreensaver,
  getAdminHardware,
  postAdminHardware,
  getAdminMetrics,
  postAdminResetMetrics,
  getAdminRecentPrints,
  postAdminCouponsBulk,
  postAdminRefund,
  getAdminRefundRequests,
  getAdminUsers,
};

