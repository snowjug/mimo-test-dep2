const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const { OAuth2Client } = require("google-auth-library");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { PDFDocument } = require("pdf-lib");

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "visionprintt@gmail.com",
    pass: process.env.GMAIL_APP_PASSWORD || "placeholder_pass" // Expected from Firebase config
  }
});

// ================= WHATSAPP CONFIG =================
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || "943206795552432";
const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN || "EAAkN2tEVOeMBRiZBa3iQBcB241gbQTJ1GXi0ZBufsJTIHA0hkCSZC9fuc4YqAKOcHkUneoPyPRZC3WuUARywUHdAVxXzy7hdN6IeBXyl5lj6xsnr69L5b4aC4F6ZBywQmOMWuZB31FkCmbopBX1ZCo0zhofMjprpsQ5CaHPi86VVq9MSRR4j9yulQzViz7pYaHYZAgZDZD";
const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || "mimo_webhook_verify_2024";
const { AsyncLocalStorage } = require('async_hooks');
const waContext = new AsyncLocalStorage();
function getWaApiUrl() {
  const store = waContext.getStore();
  const id = store?.phoneNumberId || WA_PHONE_NUMBER_ID;
  return `https://graph.facebook.com/v19.0/${id}/messages`;
}

/**
 * Send a WhatsApp text message via Meta Cloud API.
 * @param {string} to - Phone number in international format e.g. "919876543210"
 * @param {string} message - Text to send
 */
async function sendWhatsAppMessage(to, message) {
  try {
    const normalized = to.replace(/[^\d]/g, "");
    await axios.post(getWaApiUrl(), {
      messaging_product: "whatsapp",
      to: normalized,
      type: "text",
      text: { body: message }
    }, {
      headers: {
        Authorization: `Bearer ${WA_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    });
    console.log(`[WHATSAPP] Message sent to ${normalized}`);
  } catch (err) {
    console.error(`[WHATSAPP ERROR] Failed to send to ${to}:`, err.response?.data || err.message);
  }
}

/**
 * Send a WhatsApp interactive button message.
 * @param {string} to - Phone number
 * @param {string} bodyText - The main message body
 * @param {Array} buttons - Array of {id, title} objects (max 3)
 * @param {string} [headerText] - Optional header text
 */
async function sendWhatsAppButtons(to, bodyText, buttons, headerText = null) {
  try {
    const normalized = to.replace(/[^\d]/g, "");
    const payload = {
      messaging_product: "whatsapp",
      to: normalized,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: {
          buttons: buttons.map(b => ({
            type: "reply",
            reply: { id: b.id, title: b.title.substring(0, 20) }
          }))
        }
      }
    };
    if (headerText) payload.interactive.header = { type: "text", text: headerText };
    await axios.post(getWaApiUrl(), payload, {
      headers: {
        Authorization: `Bearer ${WA_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    });
    console.log(`[WHATSAPP] Button message sent to ${normalized}`);
  } catch (err) {
    console.error(`[WHATSAPP ERROR] Failed to send buttons to ${to}:`, err.response?.data || err.message);
  }
}

/**
 * Send a WhatsApp CTA URL button (opens link in browser).
 * @param {string} to - Phone number
 * @param {string} bodyText - The main message body
 * @param {string} buttonText - The button label
 * @param {string} url - The URL to open
 */
async function sendWhatsAppCTAButton(to, bodyText, buttonText, url) {
  try {
    const normalized = to.replace(/[^\d]/g, "");
    await axios.post(getWaApiUrl(), {
      messaging_product: "whatsapp",
      to: normalized,
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: bodyText },
        action: {
          name: "cta_url",
          parameters: {
            display_text: buttonText.substring(0, 20),
            url: url
          }
        }
      }
    }, {
      headers: {
        Authorization: `Bearer ${WA_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    });
    console.log(`[WHATSAPP] CTA button sent to ${normalized}`);
  } catch (err) {
    // Fallback to plain text if CTA button fails (sandbox limitation)
    console.error(`[WHATSAPP] CTA button failed, falling back to text:`, err.response?.data?.error?.message);
    await sendWhatsAppMessage(to, `${bodyText}\n\n👉 ${buttonText}:\n${url}`);
  }
}

// Initialize Firebase Admin (must be done before using it)
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

const app = express();
app.set("trust proxy", 1);

app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => res.send("Mimo Firebase Serverless is LIVE 🚀"));

const SECRET_KEY = process.env.JWT_SECRET || "fallback_secret_key_change_me_in_prod";
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || "144514765704-a3nm5kgbtehioia9eki37s3t8doasfi1.apps.googleusercontent.com");

const CASHFREE_BASE_URL = process.env.CASHFREE_ENV === "production" 
  ? "https://api.cashfree.com/pg" 
  : "https://sandbox.cashfree.com/pg";

const cashfreeHeaders = {
  "Content-Type": "application/json",
  "x-client-id": process.env.CASHFREE_APP_ID || "test_app_id",
  "x-client-secret": process.env.CASHFREE_SECRET_KEY || "test_secret_key",
  "x-api-version": "2023-08-01",
};

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

// ================= REGISTER =================
app.post("/register", async (req, res) => {
  try {
    const { username, password, email, mobileNumber } = req.body;
    const existing = await db.collection("users").where("email", "==", email).get();
    if (!existing.empty) return res.status(400).json({ error: "User already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const userRef = await db.collection("users").add({
      username, email, mobileNumber: mobileNumber || "", password: hashedPassword,
      googleUser: false, createdAt: now, updatedAt: now, accountStatus: "active",
      totalSpent: 0, totalPagesPrinted: 0, isVerified: true,
      mimo_coins: { balance: 0, total_earned: 0, total_used: 0 },
    });
    await userRef.update({ id: userRef.id });
    const token = jwt.sign({ userId: userRef.id }, SECRET_KEY, { expiresIn: "30d" });
    res.json({ jwtToken: token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error registering user" });
  }
});

// ================= LOGIN =================
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const snapshot = await db.collection("users").where("email", "==", email).get();
    if (snapshot.empty) return res.status(400).json({ error: "User not found" });
    const doc = snapshot.docs[0];
    const user = doc.data();
    if (user.googleUser) return res.status(400).json({ error: "Use Google login" });
    const storedPassword = user.password || user.passwordHash;
    if (!storedPassword) return res.status(500).json({ error: "Password missing" });
    const valid = await bcrypt.compare(password, storedPassword);
    if (!valid) return res.status(400).json({ error: "Wrong password" });
    await doc.ref.update({ lastLoginAt: admin.firestore.FieldValue.serverTimestamp() });
    const token = jwt.sign({ userId: doc.id }, SECRET_KEY, { expiresIn: "30d" });
    res.json({ jwtToken: token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// ================= GOOGLE LOGIN =================
app.post("/google-login", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token missing" });
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID || "144514765704-a3nm5kgbtehioia9eki37s3t8doasfi1.apps.googleusercontent.com",
    });
    const payload = ticket.getPayload();
    const email = payload.email;
    const name = payload.name;
    const snapshot = await db.collection("users").where("email", "==", email).get();
    let mobileNumber = "";
    const now = admin.firestore.FieldValue.serverTimestamp();
    let userId;
    if (snapshot.empty) {
      const userRef = await db.collection("users").add({
        username: name, email, mobileNumber: "", password: null, googleUser: true,
        createdAt: now, updatedAt: now, accountStatus: "active",
        totalSpent: 0, totalPagesPrinted: 0, isVerified: true,
        mimo_coins: { balance: 0, total_earned: 0, total_used: 0 },
      });
      userId = userRef.id;
      await userRef.update({ id: userId });
    } else {
      userId = snapshot.docs[0].id;
      mobileNumber = snapshot.docs[0].data().mobileNumber || "";
      await snapshot.docs[0].ref.update({ lastLoginAt: now });
    }
    const jwtToken = jwt.sign({ userId }, SECRET_KEY, { expiresIn: "30d" });
    res.json({ jwtToken, name, email, userId, mobileNumber });
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: "Google login failed" });
  }
});

// ================= ONBOARDING =================
app.post("/onboarding", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { username, mobileNumber } = req.body;
    if (!username) return res.status(400).json({ error: "Name required" });
    await db.collection("users").doc(userId).update({ username, mobileNumber: mobileNumber || "", onboardingCompleted: true });
    res.json({ message: "Onboarding complete" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Onboarding failed" });
  }
});

// ================= PROFILE =================
app.get("/profile", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const doc = await db.collection("users").doc(userId).get();
    if (!doc.exists) return res.status(404).json({ error: "User not found" });
    const user = doc.data();
    res.json({ id: userId, username: user.username, email: user.email, photoUrl: user.photoUrl,
      mobileNumber: user.mobileNumber || "", googleUser: user.googleUser || false,
      mimo_coins: user.mimo_coins || { balance: 0, total_earned: 0, total_used: 0 } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

app.put("/profile", authMiddleware, async (req, res) => {
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
});

// ================= MIMO USER =================
app.get("/mimo/user", authMiddleware, async (req, res) => {
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
});

// ================= MIMO COINS =================
app.get("/mimo/coins", authMiddleware, async (req, res) => {
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
});

// ================= MIMO STATS =================
app.get("/mimo/stats", authMiddleware, async (req, res) => {
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
});

// ================= PRINT HISTORY =================
app.get("/print-history", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const snapshot = await db.collection("print_jobs").where("userId", "==", userId).get();
    const history = snapshot.docs.map(doc => {
      const data = doc.data();
      const opts = data.printOptions || {};
      const colorMode = opts.colorMode || "bw";
      const copies = opts.copies || 1;
      const cost = (data.pageCount || 0) * copies * (colorMode === "color" ? 9.2 : 2.3);
      return {
        id: doc.id, printCode: data.printCode || "-", status: data.status,
        printerStatus: data.printerStatus || "Pending", file: data.fileName,
        cost: `₹${cost.toFixed(2)}`, colorMode, copies,
        date: data.createdAt?.toDate ? new Date(data.createdAt.toDate()).toLocaleString() : "N/A",
      };
    }).filter(j => ["paid","printing","completed","printed","failed"].includes(j.status))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    res.json(history);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// ================= SETTINGS =================
app.get("/settings", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
    res.json(userDoc.data());
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

app.post("/settings", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    await db.collection("users").doc(userId).update({ settings: req.body, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ message: "Settings saved" });
  } catch (err) {
    res.status(500).json({ error: "Failed to save settings" });
  }
});

// ================= NEW FINAL UPLOAD (Serverless) =================
app.post("/finalize-upload", authMiddleware, async (req, res) => {
  try {
    const { files } = req.body;
    if (!files || files.length === 0) return res.status(400).json({ error: "No files provided" });

    // Validate all files have real URLs before touching the database
    for (const f of files) {
      if (!f.url || f.url === "undefined" || !f.url.startsWith("http")) {
        console.error("Invalid fileUrl received:", f.url, "for file:", f.name);
        return res.status(400).json({ error: `Missing or invalid file URL for ${f.name}. Please re-upload.` });
      }
    }

    let totalPages = 0;
    const userId = req.user.id || req.user.userId;

    // Clear old pending jobs to prevent ghost cart pricing discrepancies
    const staleJobs = await db.collection("print_jobs").where("userId", "==", userId).where("status", "==", "pending").get();
    const deleteBatch = db.batch();
    staleJobs.forEach(doc => deleteBatch.delete(doc.ref));
    await deleteBatch.commit();

    const batch = db.batch();
    
    // Process files directly - no conversion loop, Pi handles it!
    for (const f of files) {
      const docRef = db.collection("print_jobs").doc();
      batch.set(docRef, {
        userId: req.user.id || req.user.userId,
        fileName: f.name,
        fileUrl: f.url,
        mimetype: f.type,
        size: f.size,
        status: "pending", // Direct to pending, bypassing 'pending_conversion'
        pageCount: f.pageCount || 1, // Handled on frontend
        uploadedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      totalPages += (f.pageCount || 1);
    }
    
    await batch.commit();

    res.json({
      message: "Jobs created successfully.",
      amount: totalPages * 2,
      totalPages: totalPages
    });
  } catch (err) {
    console.error("Error finalizing upload:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= CREATE BLANK JOB =================
app.post("/create-blank-job", authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { type, pageCount } = req.body; // "a4" or "graph"
    
    // 1. Clear abandoned jobs to prevent overcharging
    const existingJobs = await db.collection("print_jobs")
      .where("userId", "==", userId)
      .where("status", "==", "pending")
      .get();
      
    if (!existingJobs.empty) {
      const deleteBatch = db.batch();
      existingJobs.forEach(doc => deleteBatch.delete(doc.ref));
      await deleteBatch.commit();
    }

    // 2. Create the blank job
    const isGraph = type === "graph";
    const fileName = isGraph ? "mimo_graph.pdf" : "blank_a4.pdf";
    const actualUrl = isGraph 
      ? "https://storage.googleapis.com/mimo-v2-11868.firebasestorage.app/templates%2Fmimo_graph.pdf" 
      : "https://storage.googleapis.com/mimo-v2-11868.firebasestorage.app/templates%2Fblank_a4.pdf";
    
    // Determine exact size based on uploaded files
    const fileSize = isGraph ? 1806 : 583;
    const now = admin.firestore.FieldValue.serverTimestamp();

    await db.collection("print_jobs").add({
      userId,
      fileName,
      documentUrl: actualUrl,
      fileUrl: actualUrl,
      mimetype: "application/pdf",
      fileSize: fileSize,
      fileType: "pdf",
      isImage: false,
      createdAt: now,
      updatedAt: now,
      status: "pending",
      pageCount: Number(pageCount) || 1,
      files: [{ name: fileName, size: fileSize, type: "application/pdf", url: actualUrl }],
      printOptions: { copies: Number(pageCount) || 1, colorMode: "bw", layout: "single", duplexMode: "simplex", isBlankSheet: true, sheetType: type },
      pricing: { pricePerPage: isGraph ? 2.0 : 2.30, totalPages: Number(pageCount) || 1 },
      paymentStatus: { status: "pending" },
      printStatus: { status: "pending" }
    });

    res.json({ message: "Blank job queued successfully" });
  } catch (err) {
    next(err);
  }
});

// ================= REMOVE ABANDONED FILE =================
app.delete("/remove-file", authMiddleware, async (req, res) => {
  try {
    const { fileUrl } = req.body;
    const userId = req.user.id || req.user.userId;

    if (!fileUrl) return res.status(400).json({ error: "Missing fileUrl" });

    // Find the pending print job in Firestore
    const jobsSnapshot = await db.collection("print_jobs")
      .where("userId", "==", userId)
      .where("fileUrl", "==", fileUrl)
      .where("status", "==", "pending")
      .get();

    if (jobsSnapshot.empty) {
      return res.status(404).json({ error: "File not found or already processed" });
    }

    // Delete Firestore document
    const batch = db.batch();
    jobsSnapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    // Delete from Firebase Storage
    const bucket = admin.storage().bucket();
    let filePath = "";
    if (fileUrl.startsWith("gs://")) {
      const bucketName = bucket.name;
      filePath = fileUrl.replace(`gs://${bucketName}/`, "");
    } else if (fileUrl.includes("firebasestorage.googleapis.com")) {
      const urlObj = new URL(fileUrl);
      const pathParts = urlObj.pathname.split("/o/");
      if (pathParts.length > 1) {
        filePath = decodeURIComponent(pathParts[1].split("?")[0]);
      }
    }

    if (filePath) {
      await bucket.file(filePath).delete().catch(e => console.error("Storage delete error:", e));
    }

    res.json({ message: "File successfully deleted from cloud" });
  } catch (err) {
    console.error("Error removing file:", err);
    res.status(500).json({ error: "Failed to remove file" });
  }
});


// ================= CREATE ORDER =================
app.post("/create-order", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { selectedFiles, printOptions, couponCode, coinsToUse } = req.body;
    const coinsDiscount = coinsToUse ? Number(coinsToUse) * 0.5 : 0; // 1 coin = ₹0.50
    let { orderId } = req.body;
    if (!orderId) {
      orderId = `order_${uuidv4().replace(/-/g, "").substring(0, 10)}`;
    }

    const jobsSnapshot = await db
      .collection("print_jobs")
      .where("userId", "==", userId)
      .where("status", "==", "pending")
      .get();

    if (jobsSnapshot.empty) {
      return res.status(400).send("No pending jobs to pay for");
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
    let totalPages = 0;
    const jobIds = [];

    const isBlankSheet = printOptions?.blankSheet === true;
    const sheetType = printOptions?.sheetType || "a4";
    const colorMode = printOptions?.colorMode || "bw";
    
    let pricePerPage = 2.30;
    if (colorMode === "color") {
      pricePerPage = 10.00;
    } else if (isBlankSheet && sheetType === "graph") {
      pricePerPage = 2.00;
    }
    const copies = Number(printOptions?.copies || 1);

    const batchUpdate = db.batch();
    jobsSnapshot.forEach((doc) => {
      jobIds.push(doc.id);
      const fileConfig = printOptions?.fileConfigs?.[doc.data().fileName];
      let numPages = fileConfig?.pageCount || doc.data().pageCount || 1;
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

      // Handle N-up photo layouts
      let divisor = 1;
      if (printOptions?.photoLayout === "2") divisor = 2;
      if (printOptions?.photoLayout === "4") divisor = 4;
      if (printOptions?.photoLayout === "6") divisor = 6;
      if (printOptions?.photoLayout === "9") divisor = 9;
      
      let actualPages = Math.ceil(numPages / divisor);

      // Handle double-sided
      if (printOptions?.doubleSided === "double") {
        actualPages = Math.ceil(actualPages / 2);
      }

      const jobCost = actualPages * copies * pricePerPage;
      
      totalPages += actualPages; // Total physical sheets used
      totalAmount += jobCost;

      batchUpdate.update(doc.ref, { 
        printOptions: {
          ...printOptions,
          pageSelection: jobPageSelection,
          pagesToPrint: jobPageSelection,
          pageRange: jobPageRange,
          customPageRange: jobPageRange,
        },
        orderId,
        pageCount: numPages,
        totalCost: jobCost,
        finalCost: jobCost,
        merchantTransactionId: orderId,
        colorMode,
        color: colorMode === "color",
        copies,
        duplex: printOptions?.doubleSided === "double",
        orientation: printOptions?.orientation || "portrait",
        paperSize: "A4",
        settings: printOptions || {}
      });
    });
    await batchUpdate.commit();

    let amount = Number(totalAmount.toFixed(2));
    if (discountPercentage > 0) {
      amount = Number((amount - (amount * (discountPercentage / 100))).toFixed(2));
    }
    // Apply Mimo Coins discount (securely re-calculated on backend)
    if (coinsDiscount > 0) {
      amount = Number(Math.max(0, amount - coinsDiscount).toFixed(2));
    }

    // ─── FREE ORDER BYPASS ──────────────────────────────────────────────────────
    // Treat amount <= 0 OR amount < ₹1 (Cashfree minimum) as fully free.
    // Previously the ₹1 minimum silently overrode discount, causing UI/Cashfree mismatch.
    if (amount <= 0 || amount < 1.00) {
      const printCode = Math.floor(1000 + Math.random() * 9000).toString();
      const now = admin.firestore.FieldValue.serverTimestamp();
      const freeBatch = db.batch();
      jobsSnapshot.forEach((doc) => {
        freeBatch.update(doc.ref, {
          status: "paid",
          printCode,
          paymentTime: now,
          isPrinted: false,
          printOptions: printOptions || {},
          colorMode,
          copies,
        });
      });
      await freeBatch.commit();

      // Deduct coins from user balance if coins were used
      if (coinsToUse && coinsToUse > 0) {
        await db.collection("users").doc(userId).update({
          "mimo_coins.balance": admin.firestore.FieldValue.increment(-coinsToUse),
          "mimo_coins.total_used": admin.firestore.FieldValue.increment(coinsToUse),
        });
      }

      await db.collection("orders").add({
        orderId, userId, amount: 0, totalPages, totalDocs: jobsSnapshot.size,
        status: "PAID", orderStatus: "completed", jobIds,
        createdAt: now, couponCode, discountPercentage,
        coinsUsed: coinsToUse || 0
      });

      // Trigger Email Receipt via Nodemailer for free orders
      try {
        const userDoc = await db.collection("users").doc(userId).get();
        const userEmail = userDoc.exists ? userDoc.data().email : null;
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

    const response = await axios.post(
      `${CASHFREE_BASE_URL}/orders`,
      {
        order_id: orderId,
        order_amount: amount,
        order_currency: "INR",
        customer_details: {
          customer_id: userId,
          customer_phone: "9999999999",
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
});


// ================= VERIFY PAYMENT =================
app.get("/verify-payment/:orderId", async (req, res) => {
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
          { internalSecret: process.env.INTERNAL_WEBHOOK_SECRET },
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
});


// ================= CASHFREE WEBHOOK =================
app.post("/cashfree-webhook", express.raw({ type: "application/json" }), async (req, res) => {
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
        .where("userId", "==", userId)
        .where("status", "==", "pending")
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
      try {
        const dummyToken = jwt.sign({ userId }, SECRET_KEY, { expiresIn: "1h" });
        await axios.post(
          `http://localhost:${process.env.PORT || 8080}/payment-success`,
          { internalSecret: process.env.INTERNAL_WEBHOOK_SECRET },
          { headers: { Authorization: `Bearer ${dummyToken}` } }
        );
      } catch (internalErr) {
        console.error("[WEBHOOK] Failed to call internal /payment-success:", internalErr.message);
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
});


// ================= CHECK JOB STATUS =================
app.post("/check-status", async (req, res) => {
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
});

// ================= KIOSK: GET DOCUMENTS BY CODE =================
app.post("/get-documents-by-code", async (req, res) => {
  try {
    const { printCode } = req.body;
    if (!printCode) return res.status(400).json({ error: "printCode required" });

    const snapshot = await db.collection("print_jobs")
      .where("printCode", "==", printCode)
      .where("status", "in", ["paid", "printing", "completed"])
      .get();

    if (snapshot.empty) return res.status(404).json({ error: "Invalid or expired print code" });

    // Get user info from first job
    const firstJob = snapshot.docs[0].data();
    const userId = firstJob.userId;

    let userName = "User";
    try {
      const userDoc = await db.collection("users").doc(userId).get();
      if (userDoc.exists) userName = userDoc.data().username || "User";
    } catch (e) { /* ignore */ }

    const documents = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        file: data.fileName || "Document",
        fileName: data.fileName || "Document",
        pages: data.pageCount || 1,
        copies: data.printOptions?.copies || 1,
        colorMode: data.printOptions?.colorMode || "bw",
        jobId: doc.id,
      };
    });

    res.json({ userName, name: userName, documents, printCode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});


// ================= PAYMENT SUCCESS (Generates Print Code) =================
app.post("/payment-success", authMiddleware, async (req, res) => {
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
        return res.json({ printCode: recentJob.data().printCode });
      }
      return res.status(400).json({ error: "No pending jobs without code" });
    }

    const printCode = Math.floor(1000 + Math.random() * 9000).toString();

    const batch = db.batch();
    jobsToUpdate.forEach((doc) => {
      batch.update(doc.ref, {
        status: "paid",
        paymentTime: admin.firestore.FieldValue.serverTimestamp(),
        printCode,
        codeCreatedAt: now,
        isPrinted: false,
      });
    });
    await batch.commit();

    // Trigger Email Receipt via Nodemailer
    try {
      // Use Firestore (not Firebase Auth) to get user email - avoids admin.auth() errors
      const userDoc = await db.collection("users").doc(userId).get();
      const userEmail = userDoc.exists ? userDoc.data().email : null;
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

    res.json({ message: "Payment success", printCode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Payment update failed" });
  }
});

// ================= GENERATE PRINT CODE =================
app.get("/generate-print-code", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;

    const snapshot = await db
      .collection("print_jobs")
      .where("userId", "==", userId)
      .where("status", "==", "paid")
      .limit(1)
      .get();

    if (snapshot.empty) return res.status(400).json({ error: "No paid jobs found" });

    const data = snapshot.docs[0].data();
    res.json({
      printCode: data.printCode
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch print code" });
  }
});

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

// ================= ADMIN AUTH =================
app.post("/admin/login", (req, res) => {
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
});

// ================= ADMIN COUPONS =================
app.get("/admin/coupons", adminAuthMiddleware, async (req, res) => {
  try {
    const snapshot = await db.collection("coupons").get();
    const coupons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
});

app.post("/admin/coupons", adminAuthMiddleware, async (req, res) => {
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
});

app.delete("/admin/coupons/:code", adminAuthMiddleware, async (req, res) => {
  try {
    await db.collection("coupons").doc(req.params.code).delete();
    res.json({ message: "Coupon deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete coupon" });
  }
});

// ================= VALIDATE COUPON (Public) =================
app.get("/validate-coupon/:code", async (req, res) => {
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
});


// ================= ADVANCED ADMIN & HARDWARE =================
app.get("/api/settings", async (req, res) => {
  try {
    const doc = await db.collection("mimo_settings").doc("pricing").get();
    res.json(doc.exists ? doc.data() : { pricePerPageBW: 2.30, pricePerPageColor: 10.00, pricePerPageA4: 2.30, pricePerPageGraph: 2.00 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/admin/settings", adminAuthMiddleware, async (req, res) => {
  try {
    const doc = await db.collection("mimo_settings").doc("pricing").get();
    res.json(doc.exists ? doc.data() : { pricePerPageBW: 2.30, pricePerPageColor: 10.00, pricePerPageA4: 2.30, pricePerPageGraph: 2.00 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/admin/settings", adminAuthMiddleware, async (req, res) => {
  try {
    const { pricePerPageBW, pricePerPageColor, pricePerPageA4, pricePerPageGraph } = req.body;
    await db.collection("mimo_settings").doc("pricing").set({
      pricePerPageBW: Number(pricePerPageBW),
      pricePerPageColor: Number(pricePerPageColor),
      pricePerPageA4: Number(pricePerPageA4 || 2.30),
      pricePerPageGraph: Number(pricePerPageGraph || 2.00)
    }, { merge: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/admin/hardware", adminAuthMiddleware, async (req, res) => {
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
});

app.post("/admin/hardware", adminAuthMiddleware, async (req, res) => {
  try {
    const { updates } = req.body;
    await db.collection("hardware").doc("printers").set(updates, { merge: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/admin/metrics", adminAuthMiddleware, async (req, res) => {
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
});


app.post("/admin/reset-metrics", adminAuthMiddleware, async (req, res) => {
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
});


app.get("/admin/recent-prints", adminAuthMiddleware, async (req, res) => {
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
      } catch (e) {}

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
});

// ================= WHATSAPP HOSTED CHECKOUT PAGE =================
// This serves a self-contained payment page for users coming from WhatsApp links.
// It bypasses the React frontend (which requires sessionStorage/login).
app.get("/wa-pay/:orderId", async (req, res) => {
  try {
    const orderId = req.params.orderId;

    // Fetch the order from Cashfree to get the payment_session_id
    const cfRes = await axios.get(`${CASHFREE_BASE_URL}/orders/${orderId}`, {
      headers: cashfreeHeaders
    });

    const paymentSessionId = cfRes.data.payment_session_id;
    const orderStatus = cfRes.data.order_status;

    if (orderStatus === "PAID") {
      return res.send(`
        <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Mimo - Already Paid</title>
        <style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f0fdf4;flex-direction:column;text-align:center;padding:20px;}h2{color:#16a34a;}p{color:#555;}</style>
        </head><body><h2>✅ Payment Already Received!</h2><p>Your print code was sent to you on WhatsApp. Head to the Mimo kiosk to collect your prints!</p></body></html>
      `);
    }

    if (!paymentSessionId) {
      return res.status(400).send(`
        <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Mimo - Link Expired</title>
        <style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#fef2f2;flex-direction:column;text-align:center;padding:20px;}h2{color:#dc2626;}p{color:#555;}</style>
        </head><body><h2>❌ Link Expired</h2><p>This payment link is no longer valid. Please send your PDF to the bot again to generate a new link.</p></body></html>
      `);
    }

    const cashfreeMode = process.env.CASHFREE_ENV === "production" ? "production" : "sandbox";
    const returnUrl = `https://api-upqxuj7evq-uc.a.run.app/wa-pay-success/${orderId}`;

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mimo Secure Payment</title>
        <script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%); }
          .card { background: white; border-radius: 20px; padding: 40px 30px; text-align: center; box-shadow: 0 20px 60px rgba(9,55,101,0.12); max-width: 380px; width: 90%; }
          .logo { width: 60px; height: 60px; background: #093765; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 28px; }
          h2 { color: #093765; font-size: 22px; font-weight: 800; margin-bottom: 8px; }
          p { color: #64748b; font-size: 14px; margin-bottom: 28px; line-height: 1.5; }
          .loader { border: 3px solid #e2e8f0; border-top: 3px solid #093765; border-radius: 50%; width: 36px; height: 36px; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
          @keyframes spin { to { transform: rotate(360deg); } }
          .status { font-size: 13px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="logo">🖨️</div>
          <h2>Mimo Secure Checkout</h2>
          <p>Loading your payment page...<br>Please do not close this window.</p>
          <div class="loader"></div>
          <p class="status">Order ID: ${orderId}</p>
        </div>
        <script>
          window.addEventListener('load', function() {
            try {
              const cashfree = Cashfree({ mode: "${cashfreeMode}" });
              cashfree.checkout({
                paymentSessionId: "${paymentSessionId}",
                redirectTarget: "_self"
              });
            } catch(e) {
              document.querySelector('p').textContent = 'Failed to load payment. Please try again.';
              document.querySelector('.loader').style.display = 'none';
            }
          });
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error("[WA PAY ERROR]", err.response?.data || err.message);
    res.status(500).send(`
      <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Mimo - Error</title>
      <style>body{font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#fef2f2;flex-direction:column;text-align:center;padding:20px;}h2{color:#dc2626;}p{color:#555;}</style>
      </head><body><h2>Something went wrong</h2><p>Please send your PDF to the bot again to get a fresh payment link.</p></body></html>
    `);
  }
});

// ================= WHATSAPP PAYMENT SUCCESS PAGE =================
app.get("/wa-pay-success/:orderId", async (req, res) => {
  const orderId = req.params.orderId;
  // Trigger the payment-success handler internally
  try {
    const waJobs = await db.collection("print_jobs").where("orderId", "==", orderId).get();
    let printCode = null;
    waJobs.forEach(d => { if (d.data().printCode) printCode = d.data().printCode; });
    
    if (!printCode) {
      // Payment just completed, trigger fulfillment
      const cfStatus = await axios.get(`${CASHFREE_BASE_URL}/links/${orderId}`, { headers: cashfreeHeaders });
      if (cfStatus.data.link_status === "PAID") {
        printCode = Math.floor(1000 + Math.random() * 9000).toString();
        const batch = db.batch();
        waJobs.forEach(d => batch.update(d.ref, { status: "paid", printCode, paymentTime: admin.firestore.FieldValue.serverTimestamp() }));
        await batch.commit();

        // Notify on WhatsApp with native order card
        const waSession = await db.collection("whatsapp_sessions").where("jobId", "==", waJobs.docs[0]?.id).get();
        if (!waSession.empty) {
          const phone = waSession.docs[0].id;
          const jobData = waJobs.docs[0].data();
          const botPhoneNumberId = jobData.botPhoneNumberId || process.env.WA_PHONE_NUMBER_ID || "943206795552432";
          await waContext.run({ phoneNumberId: botPhoneNumberId }, async () => {
            await sendWhatsAppOrderCard(phone, {
              orderId,
              fileName: jobData.fileName || "Document",
              colorMode: jobData.colorMode || "bw",
              copies: jobData.copies || 1,
              totalAmount: jobData.totalCost || 0,
              status: "paid",
              printCode
            });
          });
        }
      }
    }
    
    res.send(`
      <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Mimo - Payment Success!</title>
      <style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#f0fdf4,#dcfce7);flex-direction:column;text-align:center;padding:20px;}
      .card{background:white;border-radius:20px;padding:40px 30px;box-shadow:0 20px 60px rgba(0,0,0,0.08);max-width:360px;width:90%;}
      .check{font-size:64px;margin-bottom:16px;}h2{color:#16a34a;font-size:22px;font-weight:800;margin-bottom:8px;}p{color:#64748b;font-size:14px;line-height:1.6;}
      .code{background:#f8fafc;border:2px dashed #cbd5e1;border-radius:12px;padding:16px;margin:20px 0;font-size:42px;font-weight:900;color:#093765;letter-spacing:8px;}</style>
      </head><body><div class="card"><div class="check">✅</div><h2>Payment Successful!</h2>
      ${printCode ? `<p>Your Print Code is</p><div class="code">${printCode}</div><p>Head to any Mimo kiosk and enter this code to collect your prints!</p>` : `<p>Your print code has been sent to you on WhatsApp!</p>`}
      </div></body></html>
    `);
  } catch(err) {
    console.error("[WA-PAY-SUCCESS ERROR]", err.message);
    res.send("Payment received! Your print code has been sent via WhatsApp.");
  }
});

// ================= WHATSAPP WEBHOOK VERIFICATION (Option B) =================
app.get("/whatsapp-webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === WA_VERIFY_TOKEN) {
    console.log("[WHATSAPP] Webhook verified successfully.");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ================= WHATSAPP BOT MESSAGE HANDLER (Option B) =================
app.post("/whatsapp-webhook", async (req, res) => {
  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") return res.sendStatus(200);

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    
    const phoneNumberId = value?.metadata?.phone_number_id;
    return waContext.run({ phoneNumberId }, async () => {

    const messages = value?.messages;
    if (!messages || messages.length === 0) return res.sendStatus(200);

    const msg = messages[0];
    const from = msg.from; // e.g. "919876543210"
    const msgType = msg.type;

    const msgId = msg.id;

    // Strict Idempotency Check: Prevent race conditions by forcing an atomic write
    try {
      await db.collection("whatsapp_msg_ids").doc(msgId).create({ 
        processedAt: admin.firestore.FieldValue.serverTimestamp() 
      });
    } catch (e) {
      if (e.code === 6 || e.message.includes("ALREADY_EXISTS")) {
        console.log(`[WHATSAPP] Race condition prevented! Duplicate message ${msgId} ignored.`);
        return res.sendStatus(200);
      }
    }

    // Load or create bot session from Firestore
    const sessionRef = db.collection("whatsapp_sessions").doc(from);
    const sessionDoc = await sessionRef.get();
    const session = sessionDoc.exists ? sessionDoc.data() : { state: "idle" };

    // ── Handle PDF/document upload ──────────────────────────────────────────
    if (msgType === "document" || msgType === "image") {
      const doc = msg.document || msg.image;
      const mimeType = doc.mime_type || "";
      
      const isPdf = mimeType.includes("pdf");
      const isImage = mimeType.includes("image/jpeg") || mimeType.includes("image/png") || mimeType.includes("image/jpg");

      if (!isPdf && !isImage) {
        await sendWhatsAppMessage(from, "❌ Sorry, we only support standard PDF, JPG, and PNG files. Word documents (.doc/.docx) are NOT supported. Please convert your file to a PDF and upload again.");
        return res.sendStatus(200);
      }

      // Download file from Meta servers and upload to Firebase Storage
      let fileUrl = "";
      let buffer = null;
      try {
        const mediaRes = await axios.get(`https://graph.facebook.com/v19.0/${doc.id}`, {
          headers: { Authorization: `Bearer ${WA_ACCESS_TOKEN}` }
        });
        const downloadUrl = mediaRes.data.url;
        const fileRes = await axios.get(downloadUrl, {
          headers: { Authorization: `Bearer ${WA_ACCESS_TOKEN}` },
          responseType: "arraybuffer"
        });
        buffer = Buffer.from(fileRes.data);
        const fileName = doc.filename || (isImage ? `whatsapp_${Date.now()}.jpg` : `whatsapp_${Date.now()}.pdf`);
        const bucket = admin.storage().bucket();
        const fileRef = bucket.file(`uploads/wa_${from}/${fileName}`);
        const cType = isImage ? mimeType : "application/pdf";
        await fileRef.save(buffer, { contentType: cType, metadata: { contentType: cType } });
        const { getDownloadURL } = require("firebase-admin/storage");
        fileUrl = await getDownloadURL(fileRef);
        console.log(`[WHATSAPP BOT] File uploaded for ${from}: ${fileName}`);
      } catch (uploadErr) {
        console.error("[WHATSAPP BOT] File upload failed:", uploadErr);
        await sendWhatsAppMessage(from, "❌ Sorry, we couldn't process your file. Please try again.");
        return res.sendStatus(200);
      }

      // Find or create a user account for this WhatsApp number
      let userId;
      const usersSnap = await db.collection("users").where("mobileNumber", "==", from).get();
      if (!usersSnap.empty) {
        userId = usersSnap.docs[0].id;
      } else {
        // Create a lightweight guest account linked to this WhatsApp number
        const guestRef = await db.collection("users").add({
          email: `wa_${from}@mimo.guest`,
          username: `WA User ${from.slice(-4)}`,
          mobileNumber: from,
          isWhatsAppUser: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        userId = guestRef.id;
      }

      // Create a print job in Firestore
      const jobRef = await db.collection("print_jobs").add({
        userId,
        fileName: doc.filename || `document_${Date.now()}.pdf`,
        documentUrl: fileUrl,
        fileUrl,
        mimetype: isImage ? mimeType : "application/pdf",
        fileSize: doc.file_size || 0,
        fileType: isImage ? "image" : "pdf",
        isImage: isImage,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending",
        source: "whatsapp"
      });

      // Count PDF Pages
      let pageCount = 1;
      if (isPdf) {
        try {
          const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
          pageCount = pdfDoc.getPageCount();
        } catch (err) {
          console.error("Failed to parse PDF pages with pdf-lib:", err);
          await sendWhatsAppMessage(from, "❌ Sorry, I couldn't read the pages in this PDF. It might be corrupted, password-protected, or in an unsupported format. Please save it as a standard PDF and try again.");
          return res.sendStatus(200);
        }
      } else if (isImage) {
        pageCount = 1;
      }

      // Save session state
      await sessionRef.set({
        state: "awaiting_destination",
        jobId: jobRef.id,
        userId,
        fileName: doc.filename || "document.pdf",
        colorMode: "bw",
        copies: 1,
        pageCount
      });

      await sendWhatsAppButtons(from, 
        `📄 *${doc.filename || "document.pdf"}* uploaded successfully! (${pageCount} pages)\n\nPlease select Print Destination:`, 
        [
          { id: "dest_cv", title: "📍 CV B&W" },
          { id: "dest_sv", title: "📍 SV Color and B&W" }
        ]
      );
      return res.sendStatus(200);
    }

    // ── Handle interactive button replies ───────────────────────────────────────
    if (msgType === "interactive" && msg.interactive.type === "button_reply") {
      const buttonId = msg.interactive.button_reply.id;
      
      if (session.state === "awaiting_destination") {
         if (buttonId === "dest_cv") {
           // CV is B&W only, skip color selection
           await sessionRef.update({ state: "awaiting_copies", destination: "KIOSK-001-CV", colorMode: "bw" });
           await sendWhatsAppButtons(from, "How many copies?", [
             { id: "copies_1", title: "1 Copy" },
             { id: "copies_2", title: "2 Copies" },
             { id: "copies_3", title: "3 Copies" }
           ], "Select copies or type a number");
         } else if (buttonId === "dest_sv") {
           // SV has both options
           await sessionRef.update({ state: "awaiting_color", destination: "KIOSK-002-SV" });
           await sendWhatsAppButtons(from, "Please select Print Type:", [
             { id: "color_bw", title: "⚫ B&W (₹2.30/pg)" },
             { id: "color_color", title: "🎨 Color (₹10.00/pg)" }
           ]);
         }
         return res.sendStatus(200);
      }

      if (session.state === "awaiting_color") {
        const colorMode = buttonId === "color_color" ? "color" : "bw";
        await sessionRef.update({ state: "awaiting_copies", colorMode });
        await sendWhatsAppButtons(from, "How many copies?", [
          { id: "copies_1", title: "1 Copy" },
          { id: "copies_2", title: "2 Copies" },
          { id: "copies_3", title: "3 Copies" }
        ], "Select copies or type a number");
        return res.sendStatus(200);
      }

      if (session.state === "awaiting_copies" && buttonId.startsWith("copies_")) {
        const copies = parseInt(buttonId.replace("copies_", ""));
        await _askForCoupon(from, session, sessionRef, copies);
        return res.sendStatus(200);
      }

      if (session.state === "awaiting_coupon" && buttonId === "skip_coupon") {
        await _finalizePayment(from, session, sessionRef, null);
        return res.sendStatus(200);
      }
      return res.sendStatus(200);
    }

    // ── Handle text replies ───────────────────────────────────────────────────
    if (msgType === "text") {
      const textBody = msg.text.body.trim();
      
      if (session.state === "awaiting_copies") {
        const copies = parseInt(textBody);
        if (!isNaN(copies) && copies > 0 && copies <= 100) {
          await _askForCoupon(from, session, sessionRef, copies);
        } else {
          await sendWhatsAppMessage(from, "Please enter a valid number of copies (1-100).");
        }
        return res.sendStatus(200);
      }

      if (session.state === "awaiting_coupon") {
        await _finalizePayment(from, session, sessionRef, textBody.trim().toUpperCase());
        return res.sendStatus(200);
      }
      
      // Default: Welcome message
      await sendWhatsAppMessage(from,
        `👋 *Welcome to Mimo Printing!*\n\nSend me a *PDF file* and I'll guide you through printing it at any Mimo kiosk.\n\n📄 Upload PDF → ⚙️ Select Settings → 💳 Pay → 🖨️ Collect!`
      );
      return res.sendStatus(200);
    }

    // Unsupported message type
    await sendWhatsAppMessage(from, "Please send a *PDF, JPG, or PNG document* to get started! 📄");
    return res.sendStatus(200);

    }); // END waContext.run
  } catch (err) {
    console.error("[WHATSAPP BOT ERROR]", err);
    return res.sendStatus(200); // 200 to prevent infinite Meta retries on fatal errors
  }
});

// ── Helper: send native WhatsApp order receipt card (like Namma Metro) ─────────
async function sendWhatsAppOrderCard(to, { orderId, fileName, colorMode, copies, totalAmount, status, printCode }) {
  try {
    const normalized = to.replace(/[^\d]/g, "");
    const isPaid = status === "paid";
    const itemName = colorMode === "color" ? "🎨 Color Print" : "⚫ B&W Print";
    const amountValue = Math.round(totalAmount * 100); // in paise

    // Native WhatsApp order_status interactive card
    const payload = {
      messaging_product: "whatsapp",
      to: normalized,
      type: "interactive",
      interactive: {
        type: "order_status",
        body: {
          text: isPaid
            ? `✅ *Payment Confirmed!*\n\nYour Print Code is:\n\n*${printCode}*\n\nHead to any Mimo kiosk, enter this code to collect your prints! 🖨️`
            : `🧾 *Order Ready for Payment*\n\nPlease tap *Pay Now* below to complete your print order.`
        },
        action: {
          name: "review_order",
          parameters: {
            reference_id: orderId,
            type: "digital-goods",
            payment_status: isPaid ? "paid" : "pending",
            order: {
              status: isPaid ? "completed" : "pending",
              items: [
                {
                  retailer_id: `mimo-${colorMode}-print`,
                  name: itemName,
                  amount: { value: amountValue, offset: 100 },
                  quantity: copies
                }
              ],
              subtotals: []
            }
          }
        }
      }
    };

    await axios.post(getWaApiUrl(), payload, {
      headers: { Authorization: `Bearer ${WA_ACCESS_TOKEN}`, "Content-Type": "application/json" }
    });
    console.log(`[WHATSAPP] Order card sent to ${normalized} (${status})`);
  } catch (err) {
    // Fallback to text if order card not supported (e.g. sandbox)
    console.error(`[WHATSAPP] Order card failed, falling back:`, err.response?.data?.error?.message || err.message);
    if (status === "paid") {
      await sendWhatsAppMessage(to,
        `✅ *Payment Confirmed!*\n\nYour Print Code is:\n\n*${printCode}*\n\nHead to any Mimo kiosk, enter this code to collect your prints! 🖨️`
      );
    } else {
      const paymentLink = `https://api-upqxuj7evq-uc.a.run.app/wa-pay/${orderId}`;
      await sendWhatsAppMessage(to,
        `Order #${orderId.slice(-6)}\n------------------------\n*Print Job*\nQuantity ${copies}\n------------------------\nTotal            ₹${totalAmount.toFixed(2)}\n\nMimo Printing\n\n💳 *Pay Now:*\n${paymentLink}`
      );
    }
  }
}

async function _askForCoupon(from, session, sessionRef, copies) {
  const pricingDoc = await db.collection("settings").doc("pricing").get();
  const pricing = pricingDoc.exists ? pricingDoc.data() : {};
  
  const pricePerPage = session.colorMode === "color" ? (pricing.pricePerPageWAColor || pricing.pricePerPageColor || 10.00) : (pricing.pricePerPageWABW || pricing.pricePerPageBW || 2.30);
  
  const pageCount = session.pageCount || 1;
  let totalAmount = Number((copies * pageCount * pricePerPage).toFixed(2));

  // Update session
  await sessionRef.update({ state: "awaiting_coupon", copies, rawTotal: totalAmount });
  
  const kioskName = session.destination === "KIOSK-001-CV" ? "🖨️ CV B&W" : "🖨️ SV Color and B&W";
  const colorText = session.colorMode === "color" ? "🎨 Color" : "📄 B&W";
  
  const receiptText = `🧾 *MIMO PRINT SUMMARY* 🧾
➖➖➖➖➖➖➖➖➖➖➖➖➖➖
📄 *Document:* ${session.fileName}
📑 *Pages:* ${pageCount}
📍 *Kiosk:* ${kioskName}
🎨 *Color Mode:* ${colorText}
🖨️ *Copies:* ${copies}
➖➖➖➖➖➖➖➖➖➖➖➖➖➖
💵 *Total Amount:* ₹${totalAmount.toFixed(2)}

🎟️ _Have a discount coupon?_
Type the code below, or click *Skip & Pay* to proceed.`;

  await sendWhatsAppButtons(from, receiptText, [
    { id: "skip_coupon", title: "Skip & Pay" }
  ]);
}

async function _finalizePayment(from, session, sessionRef, couponCode) {
  let totalAmount = session.rawTotal || 1.00;
  let discountAmount = 0;
  
  if (couponCode) {
    try {
      const couponDoc = await db.collection("coupons").doc(couponCode).get();
      if (couponDoc.exists) {
        const data = couponDoc.data();
        let isExpired = false;
        
        if (data.expiryDate) {
          const expiryDate = data.expiryDate.toDate ? data.expiryDate.toDate() : new Date(data.expiryDate);
          if (expiryDate < new Date()) isExpired = true;
        }

        if (!isExpired) {
          const discountPct = data.discountPercentage || 0;
          discountAmount = (totalAmount * discountPct) / 100;
          totalAmount = Number((totalAmount - discountAmount).toFixed(2));
          await sendWhatsAppMessage(from, `✅ Coupon applied! ₹${discountAmount.toFixed(2)} off.`);
        } else {
          await sendWhatsAppMessage(from, `❌ Coupon expired. Proceeding with original amount.`);
        }
      } else {
        await sendWhatsAppMessage(from, `❌ Invalid coupon code. Proceeding with original amount.`);
      }
    } catch(e) {
      console.error("[WHATSAPP] Coupon check error:", e);
    }
  }

  if (totalAmount <= 0) {
    // FREE ORDER
    const orderId = `WA-FREE-${require("uuid").v4().slice(0, 8).toUpperCase()}`;
    const printCode = Math.floor(1000 + Math.random() * 9000).toString();
    await db.collection("print_jobs").doc(session.jobId).update({
      orderId, colorMode: session.colorMode, copies: session.copies, pageCount: session.pageCount, totalCost: 0, printDestination: session.destination || "Any", status: "paid", printCode, couponUsed: couponCode || null
    });
    await sessionRef.update({ state: "idle" });
    await sendWhatsAppMessage(from, `🎉 *100% Free!* Your order is fully covered.\n\nYour Print Code is:\n*${printCode}*\n\nHead to the Mimo kiosk and enter this code! 🖨️`);
    return;
  }

  if (totalAmount < 1.00) totalAmount = 1.00; // Minimum Cashfree amount

  const orderId = `WA-${require("uuid").v4().slice(0, 8).toUpperCase()}`;
  try {
    const cfRes = await axios.post(`${CASHFREE_BASE_URL}/links`, {
      link_id: orderId,
      link_amount: totalAmount,
      link_currency: "INR",
      link_purpose: "Mimo Print Order",
      customer_details: {
        customer_phone: "9999999999",
        customer_name: session.userId || "WA User"
      },
      link_meta: {
        return_url: `https://api-upqxuj7evq-uc.a.run.app/wa-pay-success/${orderId}`,
        notify_url: `https://api-upqxuj7evq-uc.a.run.app/cashfree-webhook`
      }
    }, { headers: cashfreeHeaders });

    await db.collection("print_jobs").doc(session.jobId).update({
      orderId, colorMode: session.colorMode, copies: session.copies, pageCount: session.pageCount, totalCost: totalAmount, printDestination: session.destination || "Any", couponUsed: couponCode || null
    });
    
    await sessionRef.update({ state: "idle" });

    const paymentLink = cfRes.data.link_url;

    const bodyText = `🧾 *ORDER PAID* (#${orderId.slice(-6)})
━━━━━━━━━━━━━━━━━
📄 *File:* ${session.fileName}
🔢 *Copies:* ${session.copies}
🎨 *Type:* ${session.colorMode === "color" ? "Color" : "B&W"}
━━━━━━━━━━━━━━━━━
💰 *Amount Paid:* ₹${totalAmount.toFixed(2)}

✨ Thank you for using Mimo Printing!`;
    await sendWhatsAppCTAButton(from, bodyText, "Pay Now", paymentLink);
  } catch (cfErr) {
    console.error("[WHATSAPP BOT] Cashfree order creation failed:", cfErr.response?.data || cfErr.message);
    await sendWhatsAppMessage(from, "❌ Failed to create payment order. Please try again.");
    await sessionRef.set({ state: "idle" });
  }
}

// Export the main Express App

// ================= NGROK HELPER =================
const getNgrokUrl = async () => {
  if (process.env.PI_BASE_URL && !process.env.PI_BASE_URL.includes('100.108') && !process.env.PI_BASE_URL.includes('tail2146')) {
    return process.env.PI_BASE_URL;
  }
  return "https://splashed-giddily-populace.ngrok-free.dev";
};

// Helper: call the Pi print API for one file
const triggerPiPrint = async (fileUrl, copies = 1, piUrl = null, printerName = null) => {
  const targetPiUrl = piUrl || await getNgrokUrl();
  const targetPrinter = printerName || process.env.PRINTER_NAME || "Brother_HL_L5210DN_series";
  const results = [];
  for (let i = 0; i < copies; i++) {
    const res = await fetch(`${targetPiUrl}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
      body: JSON.stringify({ pdfUrl: fileUrl, file_url: fileUrl, printer_name: targetPrinter })
    });
    if (!res.ok) { const errText = await res.text(); throw new Error(`Pi HTTP error ${res.status}: ${errText}`); }
    results.push(await res.json());
  }
  return results;
};

// ================= KIOSK: POLL JOB STATUS =================
app.get("/kiosk/job-status", async (req, res) => {
  try {
    const { printCode } = req.query;
    if (!printCode) return res.status(400).json({ error: "Print code required" });
    const snapshot = await db.collection("print_jobs").where("printCode", "==", printCode).get();
    if (snapshot.empty) return res.status(404).json({ error: "Job not found" });
    const jobData = snapshot.docs[0].data();
    res.json({ status: jobData.status || "pending", isPrinted: jobData.isPrinted || false });
  } catch (err) {
    console.error("❌ KIOSK JOB STATUS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch job status" });
  }
});

// ================= KIOSK: TRIGGER PI PRINT =================
app.post("/kiosk/print", async (req, res) => {
  try {
    const { printCode, kioskId = "KIOSK_1" } = req.body;
    if (!printCode) return res.status(400).json({ error: "Print code required" });
    const snapshot = await db.collection("print_jobs").where("printCode", "==", printCode).where("status", "==", "paid").get();
    if (snapshot.empty) return res.status(400).json({ error: "No paid job found for this code" });
    
    const jobDoc = snapshot.docs[0];
    const jobData = jobDoc.data();
    
    let finalKioskId = kioskId;
    const directKioskId = jobData?.settings?.directKioskId || jobData?.printOptions?.directKioskId || jobData.kioskId;
    if (directKioskId) {
      if (directKioskId !== kioskId) {
        console.warn(`Kiosk mismatch: job assigned to ${directKioskId}, requested from ${kioskId}`);
      }
      finalKioskId = directKioskId; // Prioritize the user's choice from the front end
    }
    
    // Set status to printing so the Pi's firebase_listener.py picks it up
    await jobDoc.ref.update({ 
      status: "printing", 
      printStartedAt: admin.firestore.FieldValue.serverTimestamp(), 
      kioskId: finalKioskId 
    });

    // PULL ARCHITECTURE: We just return success immediately.
    // The Pi's mimo-listener.service will poll this document, download the PDF, and print it.
    // The Kiosk UI will poll /kiosk/job-status until the Pi updates it to 'completed'.
    return res.json({ success: true, message: "Print job enqueued successfully", job: jobData });
    
  } catch (err) {
    console.error("❌ KIOSK PRINT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});


exports.api = onRequest({ cors: true, maxInstances: 10 }, app);

// ================= AUTO REFUND LISTENER =================
exports.autoRefundJob = onDocumentUpdated("print_jobs/{jobId}", async (event) => {
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();

  // Trigger ONLY if status changes to "failed"
  if (beforeData.status !== "failed" && afterData.status === "failed") {
    console.log(`[REFUND] Print job ${event.params.jobId} failed. Initiating auto-refund...`);
    const orderId = afterData.orderId;
    if (!orderId) {
      console.log(`[REFUND] No orderId found for job ${event.params.jobId}. Cannot refund.`);
      return;
    }

    // 1. Fetch the Order to get the actual amount paid
    const orderSnapshot = await db.collection("orders").where("orderId", "==", orderId).get();
    if (orderSnapshot.empty) {
      console.log(`[REFUND] Order ${orderId} not found.`);
      return;
    }
    const orderDoc = orderSnapshot.docs[0];
    const orderData = orderDoc.data();

    // Prevent double refunds
    if (orderData.refundStatus === "SUCCESS") {
      console.log(`[REFUND] Order ${orderId} is already refunded.`);
      return;
    }

    // Skip refund if the amount is zero (100% discount or free order)
    if (!orderData.amount || orderData.amount <= 0) {
      console.log(`[REFUND] Order ${orderId} has a zero amount. Skipping Cashfree refund API call.`);
      await orderDoc.ref.update({
        refundStatus: "SUCCESS",
        refundNote: "Zero amount order, no gateway refund required",
        refundedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return;
    }

    try {
      // 2. Call Cashfree Refunds API
      const refundId = `refund_${uuidv4().replace(/-/g, "").substring(0, 10)}`;
      const response = await axios.post(
        `${CASHFREE_BASE_URL}/orders/${orderId}/refunds`,
        {
          refund_amount: orderData.amount,
          refund_id: refundId,
          refund_note: `Auto-refund for failed print job ${event.params.jobId}`
        },
        { headers: cashfreeHeaders, timeout: 10000 }
      );

      console.log(`[REFUND] Cashfree API response for ${orderId}:`, response.data);

      // 3. Update Order in Firestore
      await orderDoc.ref.update({
        refundStatus: "SUCCESS",
        refundId: refundId,
        refundedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`[REFUND] Order ${orderId} successfully marked as refunded in DB.`);
    } catch (err) {
      console.error(`[REFUND ERROR] Failed to refund order ${orderId}:`, err.response?.data || err.message);
      await orderDoc.ref.update({
        refundStatus: "FAILED",
        refundError: err.response?.data?.message || err.message
      });
    }
  }
});

// ================= STORAGE AUTO-CLEANUP =================
exports.autoCleanupStorageJob = onDocumentUpdated("print_jobs/{jobId}", async (event) => {
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();

  // Trigger ONLY if status changes to "completed"
  if (beforeData.status !== "completed" && afterData.status === "completed") {
    console.log(`[STORAGE] Print job ${event.params.jobId} completed. Cleaning up file...`);
    
    if (!afterData.fileUrl) {
      console.log(`[STORAGE] No fileUrl found for job ${event.params.jobId}.`);
      return;
    }

    try {
      // fileUrl format: "gs://mimo-v2-11868.firebasestorage.app/uploads/username/filename.pdf"
      // Or: "https://firebasestorage.googleapis.com/v0/b/..."
      
      const fileUrl = afterData.fileUrl;
      const bucket = admin.storage().bucket();
      
      let filePath = "";
      if (fileUrl.startsWith("gs://")) {
        const bucketName = bucket.name;
        filePath = fileUrl.replace(`gs://${bucketName}/`, "");
      } else if (fileUrl.includes("firebasestorage.googleapis.com")) {
        // Extract from HTTP URL
        const urlObj = new URL(fileUrl);
        const pathParts = urlObj.pathname.split("/o/");
        if (pathParts.length > 1) {
          filePath = decodeURIComponent(pathParts[1].split("?")[0]);
        }
      }

      if (!filePath) {
        console.error(`[STORAGE ERROR] Could not parse path from: ${fileUrl}`);
        return;
      }

      const fileRef = bucket.file(filePath);
      await fileRef.delete();
      console.log(`[STORAGE] Successfully deleted ${filePath}`);

    } catch (err) {
      console.error(`[STORAGE ERROR] Failed to delete file for job ${event.params.jobId}:`, err);
    }
  }
});
