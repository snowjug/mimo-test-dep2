const jwt = require("jsonwebtoken");
const { SECRET_KEY } = require("../config/env");
const { db } = require("../config/firebase");

// ================= AUTH MIDDLEWARE =================
const authMiddleware = async (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) return res.status(401).json({ error: "Access Denied" });
  try {
    const verified = jwt.verify(token.replace("Bearer ", ""), SECRET_KEY);
    let userId = verified.userId || verified.id || verified.user?.id;
    if (!userId) return res.status(403).json({ error: "Invalid token payload" });
    // Resolve userId to actual Firestore doc ID
    const directDoc = await db.collection("users").doc(userId).get();
    const snap = await db.collection("users").where("id", "==", userId).get();
    if (!directDoc.exists && snap.empty) return res.status(401).json({ error: "User not found" });
    if (!directDoc.exists) {
      if (!snap.empty) userId = snap.docs[0].id;
    }
    req.user = { userId, id: userId };
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid Token" });
  }
};

// Note: /validate-coupon/:code is defined below as a public route (no auth required)
// ================= ADMIN MIDDLEWARE =================
const adminAuthMiddleware = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) return res.status(401).json({ error: "Access Denied" });
  try {
    const verified = jwt.verify(token.replace("Bearer ", ""), SECRET_KEY);
    if (!verified.isAdmin) return res.status(403).json({ error: "Forbidden: Admins only" });
    req.admin = verified;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid Token" });
  }
};

module.exports = {
  adminAuthMiddleware,
  authMiddleware,
};
