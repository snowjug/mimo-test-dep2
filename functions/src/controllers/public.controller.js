const { db } = require("../config/firebase");
const { normalizeMediaUrl } = require("../utils/mediaUrl");
const { classifyIncident } = require("../services/incidentClassifier");
const { sendWebsiteAlertEmail } = require("../services/email.service");

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
    const { kioskId } = req.query || {};

    if (kioskId) {
      const cleanKioskId = String(kioskId).trim().toUpperCase();
      const kioskDoc = await db.collection("kiosk_screensavers").doc(cleanKioskId).get();
      if (kioskDoc.exists) {
        const kData = kioskDoc.data() || {};
        const kVideos = Array.isArray(kData.videos)
          ? kData.videos.map(normalizeMediaUrl).filter(Boolean)
          : [];

        // If custom videos exist and fallback is not explicitly forced, serve kiosk-specific config
        if (!kData.useGlobalFallback && kVideos.length > 0) {
          return res.json({
            kioskId: cleanKioskId,
            videos: kVideos,
            playSound: typeof kData.playSound === "boolean" ? kData.playSound : false,
            idleTimeoutSeconds: kData.idleTimeoutSeconds || 60,
            isCustom: true
          });
        }
      }
    }

    // Fallback: Global screensaver
    const doc = await db.collection("mimo_settings").doc("screensaver").get();
    if (!doc.exists) {
      return res.json({
        kioskId: kioskId ? String(kioskId).trim().toUpperCase() : null,
        videos: [],
        playSound: true,
        idleTimeoutSeconds: 60,
        isFallback: true
      });
    }
    const data = doc.data() || {};
    const videos = Array.isArray(data.videos)
      ? data.videos.map(normalizeMediaUrl).filter(Boolean)
      : [];
    res.json({
      ...data,
      kioskId: kioskId ? String(kioskId).trim().toUpperCase() : null,
      videos,
      playSound: typeof data.playSound === "boolean" ? data.playSound : true,
      idleTimeoutSeconds: data.idleTimeoutSeconds || 60,
      isFallback: !!kioskId
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

// ================= CUSTOMER WEBSITE INCIDENT REPORTING =================
const postCustomerIncident = async (req, res) => {
  try {
    const { type, message, route, details, clientUploadId, status } = req.body || {};
    if (!message && !type) {
      return res.status(400).json({ error: "message or type required" });
    }

    // Classify whether this is a genuine technical issue or a benign user action/mistake
    const classification = classifyIncident({ type, message, details, route, status });

    const cleanRoute = String(route || "/").slice(0, 100);
    const cleanMessage = String(message || classification.reason).slice(0, 500);
    const cleanDetails = String(details || "").slice(0, 1000);

    const incidentData = {
      type: type || "client_error",
      message: cleanMessage,
      route: cleanRoute,
      details: cleanDetails,
      clientUploadId: clientUploadId || null,
      technical: classification.isTechnical,
      category: classification.category,
      severity: classification.severity,
      reason: classification.reason,
      status: classification.isTechnical ? "unresolved" : "ignored",
      createdAt: new Date(),
    };

    const docRef = await db.collection("customer_website_incidents").add(incidentData);

    // ONLY dispatch developer alert email if genuine technical issue (never for user mistakes/cancellations/wrong password/offline)
    if (classification.isTechnical) {
      try {
        await sendWebsiteAlertEmail({
          problem: cleanMessage,
          location: `Customer Frontend (${cleanRoute})`,
          details: cleanDetails || `Technical error occurred on customer website route '${cleanRoute}'`,
          category: classification.category,
          route: cleanRoute,
          severity: classification.severity,
        });
      } catch (mailErr) {
        console.warn("[CUSTOMER-INCIDENT] Alert email dispatch failed:", mailErr.message);
      }
    } else {
      console.log(`[CUSTOMER-INCIDENT] Benign event recorded (no alert email sent): [${classification.category}] ${classification.reason}`);
    }

    return res.status(classification.isTechnical ? 201 : 200).json({
      success: true,
      incidentId: docRef.id,
      technical: classification.isTechnical,
      ignored: !classification.isTechnical,
      category: classification.category,
    });
  } catch (err) {
    console.error("[CUSTOMER-INCIDENT] Failed to record:", err.message);
    return res.status(500).json({ error: "Failed to record incident" });
  }
};

module.exports = {
  getValidateCoupon,
  getApiSettings,
  getApiScreensaver,
  getApiStats,
  postCustomerIncident,
};
