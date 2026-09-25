const jwt = require("jsonwebtoken");
const { SECRET_KEY } = require("../config/env");
const { admin, db } = require("../config/firebase");

// ================= ADMIN AUTH =================
const postAdminLogin = (req, res) => {
  const { email, password } = req.body;

  // Defensively strip quotes and whitespace from both env vars and user input
  const envEmail = (process.env.ADMIN_EMAIL || "").replace(/^"|"$/g, '').trim();
  const envPassword = (process.env.ADMIN_PASSWORD || "").replace(/^"|"$/g, '').trim();

  const reqEmail = (email || "").trim();
  const reqPassword = (password || "").trim();

  if (envEmail && envPassword && reqEmail === envEmail && reqPassword === envPassword) {
    const token = jwt.sign({ isAdmin: true, email: reqEmail }, SECRET_KEY, { expiresIn: "24h" });
    return res.json({ token, message: "Admin Login Successful" });
  }

  console.log(`[AUTH FAILED] Attempted: '${reqEmail}' / '${reqPassword}' against Env: '${envEmail}' / '${envPassword}'`);
  return res.status(401).json({ error: "Invalid admin credentials" });
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
};
