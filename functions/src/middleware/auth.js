const jwt = require("jsonwebtoken");
const { SECRET_KEY } = require("../config/env");
const { db } = require("../config/firebase");

// ================= AUTH MIDDLEWARE =================
const authMiddleware = async (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) return res.status(401).json({ error: "Access Denied" });
  try {
    const verified = jwt.verify(token.replace("Bearer ", ""), SECRET_KEY, { algorithms: ["HS256"] });
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
    const verified = jwt.verify(token.replace("Bearer ", ""), SECRET_KEY, { algorithms: ["HS256"] });
    if (!verified.isAdmin) return res.status(403).json({ error: "Forbidden: Admins only" });
    req.admin = verified;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid Token" });
  }
};

// ================= TECHNICAL TEAM MIDDLEWARE =================
// Separate from adminAuthMiddleware on purpose: a technical team member's identity (who they are,
// which tasks are theirs) matters for this system, not just "is this an admin". The JWT carries only
// technicalMemberId; the member's current role/status is always re-read from Firestore here so a
// deactivated member or a role change takes effect immediately, not only at their next login.
const technicalAuthMiddleware = async (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) return res.status(401).json({ error: "Access Denied" });
  try {
    const verified = jwt.verify(token.replace("Bearer ", ""), SECRET_KEY, { algorithms: ["HS256"] });
    const memberId = verified.technicalMemberId;
    if (!memberId) return res.status(403).json({ error: "Invalid token payload" });
    const doc = await db.collection("technical_team").doc(memberId).get();
    if (!doc.exists) return res.status(401).json({ error: "Team member not found" });
    const data = doc.data();
    if (data.status === "inactive") return res.status(403).json({ error: "This account has been deactivated" });
    req.technicalMember = { id: memberId, name: data.name, role: data.role, email: data.email };
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid Token" });
  }
};

/** Gate for actions only the Technical Lead may perform (create/assign/reassign tasks, post announcements). */
const technicalLeadOnly = (req, res, next) => {
  if (req.technicalMember?.role !== "tech_lead") {
    return res.status(403).json({ error: "Forbidden: Technical Lead only" });
  }
  next();
};

module.exports = {
  adminAuthMiddleware,
  authMiddleware,
  technicalAuthMiddleware,
  technicalLeadOnly,
};
