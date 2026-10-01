const { db } = require("../config/firebase");

// ================= VALIDATE COUPON (Public) =================
const getValidateCoupon = async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const couponDoc = await db.collection("coupons").doc(code).get();

    if (!couponDoc.exists) {
      return res.status(404).json({ error: "Invalid promo code" });
    }

    const couponData = couponDoc.data();
    const now = new Date();

    if (!couponData.isActive) {
      return res.status(400).json({ error: "Promo code is disabled" });
    }

    if (couponData.expiryDate && couponData.expiryDate.toDate() < now) {
      return res.status(400).json({ error: "Promo code has expired" });
    }

    res.json({ discountPercentage: couponData.discountPercentage });
  } catch (err) {
    res.status(500).json({ error: "Failed to validate coupon" });
  }
};

// ================= ADVANCED ADMIN & HARDWARE =================
const getApiSettings = async (req, res) => {
  try {
    const doc = await db.collection("mimo_settings").doc("pricing").get();
    res.json(doc.exists ? doc.data() : { pricePerPageBW: 2.80, pricePerPageColor: 10.00, pricePerPageA4: 2.80, pricePerPageBWDuplex: 3.30, pricePerPageGraph: 2.00 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getApiScreensaver = async (req, res) => {
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

const getApiStats = async (req, res) => {
  try {
    const pricingDoc = await db.collection("mimo_settings").doc("pricing").get();
    if (pricingDoc.exists && pricingDoc.data().totalPagesPrinted && pricingDoc.data().totalStudents) {
      const data = pricingDoc.data();
      return res.json({
        totalPagesPrinted: data.totalPagesPrinted,
        totalStudents: data.totalStudents || data.totalUsers,
        activeKiosks: 2
      });
    }

    const [usersSnap, jobsSnap, metricsDoc] = await Promise.all([
      db.collection("users").get(),
      db.collection("print_jobs").get(),
      db.collection("system").doc("metrics").get()
    ]);

    let totalPages = 0;
    jobsSnap.forEach((d) => {
      const data = d.data();
      if (data.status === "paid" || data.status === "completed" || data.status === "printed") {
        totalPages += (data.pageCount || 0) * (data.printOptions?.copies || 1);
      }
    });

    if (metricsDoc.exists) {
      totalPages += (metricsDoc.data().totalFreePagesPrinted || 0);
    }

    res.json({
      totalPagesPrinted: totalPages,
      totalStudents: usersSnap.size,
      activeKiosks: 2
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
};

module.exports = {
  getValidateCoupon,
  getApiSettings,
  getApiScreensaver,
  getApiStats,
};
