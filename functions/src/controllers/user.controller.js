const { admin, db } = require("../config/firebase");

// ================= PROFILE =================
const getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const doc = await db.collection("users").doc(userId).get();
    if (!doc.exists) return res.status(404).json({ error: "User not found" });
    const user = doc.data();
    res.json({
      id: userId, username: user.username, email: user.email, photoUrl: user.photoUrl,
      mobileNumber: user.mobileNumber || "", googleUser: user.googleUser || false,
      mimo_coins: user.mimo_coins || { balance: 0, total_earned: 0, total_used: 0 }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
};

const putProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { username, mobileNumber, photoUrl } = req.body;

    const updateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (username !== undefined) updateData.username = username;
    if (mobileNumber !== undefined) updateData.mobileNumber = mobileNumber || "";
    if (photoUrl !== undefined) updateData.photoUrl = photoUrl;

    await db.collection("users").doc(userId).update(updateData);
    res.json({ message: "Profile updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error updating profile" });
  }
};

// ================= MIMO USER =================
const getMimoUser = async (req, res) => {
  try {
    const userId = req.user.userId;
    const doc = await db.collection("users").doc(userId).get();
    if (!doc.exists) return res.status(404).json({ error: "User not found" });
    const user = doc.data();
    res.json({ name: user.username, email: user.email, userId, photoUrl: user.photoUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
};

// ================= MIMO COINS =================
const getMimoCoins = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return res.json({ balance: 0, totalEarned: 0, totalUsed: 0, history: [] });
    const data = userDoc.data() || {};
    res.json({
      balance: data.mimo_coins?.balance || 0,
      totalEarned: data.mimo_coins?.total_earned || 0,
      totalUsed: data.mimo_coins?.total_used || 0,
      history: []
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch coins" });
  }
};

// ================= MIMO STATS =================
const getMimoStats = async (req, res) => {
  try {
    const userId = req.user.userId;
    const jobsSnapshot = await db.collection("print_jobs").where("userId", "==", userId).get();
    let totalDocs = 0, totalPages = 0;
    jobsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.status === "completed" || data.status === "paid") {
        totalDocs++;
        totalPages += (data.pageCount || 0) * (data.printOptions?.copies || 1);
      }
    });
    const ordersSnapshot = await db.collection("orders").where("userId", "==", userId).get();
    let totalSpent = 0;
    ordersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.status === "PAID" || data.status === "SUCCESS") totalSpent += Number(data.amount || 0);
    });
    res.json({ totalDocs, totalPages, totalSpent: Number(totalSpent.toFixed(2)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching stats" });
  }
};

// ================= PRINT HISTORY =================
const getPrintHistory = async (req, res) => {
  try {
    const userId = req.user.userId;
    const snapshot = await db.collection("print_jobs").where("userId", "==", userId).get();
    const history = snapshot.docs.map(doc => {
      const data = doc.data();
      const opts = data.printOptions || {};
      const colorMode = opts.colorMode || "bw";
      const copies = opts.copies || 1;
      const cost = (data.pageCount || 0) * copies * (colorMode === "color" ? 10.00 : (opts.doubleSided === "double" ? 3.30 : 2.80));
      const createdAtTime = data.createdAt?.toDate ? data.createdAt.toDate().getTime() : 0;
      return {
        id: doc.id, printCode: data.printCode || "-", status: data.status,
        printerStatus: data.printerStatus || "Pending", file: data.fileName,
        cost: `₹${cost.toFixed(2)}`, colorMode, copies, pageCount: data.pageCount || 1,
        date: data.createdAt?.toDate ? new Date(data.createdAt.toDate()).toLocaleString() : "N/A",
        createdAtTime,
      };
    }).filter(j => ["paid", "printing", "completed", "printed", "failed"].includes(j.status))
      .sort((a, b) => b.createdAtTime - a.createdAtTime);
    res.json(history);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch history" });
  }
};

// ================= SETTINGS =================
const getSettings = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
    res.json(userDoc.data());
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch settings" });
  }
};

const postSettings = async (req, res) => {
  try {
    const userId = req.user.userId;
    await db.collection("users").doc(userId).update({ settings: req.body, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ message: "Settings saved" });
  } catch (err) {
    res.status(500).json({ error: "Failed to save settings" });
  }
};

module.exports = {
  getProfile,
  putProfile,
  getMimoUser,
  getMimoCoins,
  getMimoStats,
  getPrintHistory,
  getSettings,
  postSettings,
};
