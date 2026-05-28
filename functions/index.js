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

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "visionprintt@gmail.com",
    pass: process.env.GMAIL_APP_PASSWORD || "placeholder_pass" // Expected from Firebase config
  }
});

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
  "x-api-version": "2025-01-01",
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
    const { username, mobileNumber } = req.body;
    await db.collection("users").doc(userId).update({
      username, mobileNumber: mobileNumber || "",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
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
    const { selectedFiles, printOptions, couponCode } = req.body;
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
      const pages = doc.data().pageCount || 1;
      const jobCost = pages * copies * pricePerPage;
      
      totalPages += pages;
      totalAmount += jobCost;

      batchUpdate.update(doc.ref, { 
        printOptions: printOptions || {},
        orderId,
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

    // ─── 100% DISCOUNT BYPASS ─────────────────────────────────────────────────
    // If amount is 0 (or coupon gives full discount), skip Cashfree entirely.
    // Mark jobs as paid directly and return a print code immediately.
    if (amount <= 0) {
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
      await db.collection("orders").add({
        orderId, userId, amount: 0, totalPages, totalDocs: jobsSnapshot.size,
        status: "PAID", orderStatus: "completed", jobIds,
        createdAt: now, couponCode, discountPercentage
      });
      return res.json({ orderId, paymentSessionId: null, amount: 0, printCode, free: true });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Enforce Cashfree minimum of ₹1
    if (amount < 1.00) amount = 1.00;

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
      transactionId: paymentTxnRef.id, userId, orderId,
      merchantTransactionId: orderId, paymentGateway: "cashfree",
      cashfreeSessionId: response.data.payment_session_id,
      orderDetails: { description: `Print order ${orderId}`, amount, currency: "INR" },
      transactionStatus: { status: "pending", gatewayStatus: "initiated" },
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection("orders").add({
      orderId, userId, amount, totalPages, totalDocs: jobsSnapshot.size,
      status: "CREATED", createdAt: admin.firestore.FieldValue.serverTimestamp(),
      paymentTransactionId: paymentTxnRef.id, jobIds, orderStatus: "created"
    });

    res.json({ orderId, paymentSessionId: response.data.payment_session_id, amount });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Order creation failed");
  }
});

// ================= VERIFY PAYMENT (Called by frontend after Cashfree redirect) =================
app.get("/verify-payment/:orderId", authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    // Check Cashfree order status
    const r = await axios.get(
      `${CASHFREE_BASE_URL}/orders/${orderId}`,
      { headers: cashfreeHeaders, timeout: 10000 }
    );
    const cfStatus = r.data.order_status; // PAID, ACTIVE, EXPIRED, etc.
    const order_status = (cfStatus === "PAID") ? "PAID" : cfStatus;
    
    // Also check our local orders collection as fallback
    if (order_status !== "PAID") {
      const localOrder = await db.collection("orders").where("orderId", "==", orderId).get();
      if (!localOrder.empty && ["PAID", "SUCCESS"].includes(localOrder.docs[0].data().status)) {
        return res.json({ order_status: "PAID" });
      }
    }
    
    res.json({ order_status });
  } catch (err) {
    console.error("verify-payment error:", err.response?.data || err.message);
    // If Cashfree call fails, check local DB
    try {
      const localOrder = await db.collection("orders").where("orderId", "==", req.params.orderId).get();
      if (!localOrder.empty) {
        const s = localOrder.docs[0].data().status;
        return res.json({ order_status: s === "PAID" || s === "SUCCESS" ? "PAID" : s });
      }
    } catch(e) {}
    res.status(500).json({ error: "Failed to verify payment" });
  }
});

// ================= CASHFREE WEBHOOK =================
app.post("/cashfree-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const rawBody = req.body.toString("utf8");
    const receivedSignature = req.headers["x-webhook-signature"];
    const timestamp = req.headers["x-webhook-timestamp"];

    if (!receivedSignature || !timestamp) {
      return res.status(403).send("Missing signature or timestamp");
    }

    const expectedSignature = crypto
        .createHmac("sha256", cashfreeHeaders["x-client-secret"])
        .update(timestamp + rawBody)
        .digest("base64");
      if (receivedSignature !== expectedSignature) {
        return res.status(403).send("Invalid signature");
      }

    const event = JSON.parse(rawBody);

    if (event.type === "PAYMENT_SUCCESS_WEBHOOK") {
      const orderId = event.data.order.order_id;
      const userId = event.data.customer_details.customer_id;
      const now = admin.firestore.FieldValue.serverTimestamp();

      const orders = await db.collection("orders").where("orderId", "==", orderId).get();
      const orderBatch = db.batch();
      orders.forEach((doc) => {
        orderBatch.update(doc.ref, { status: "PAID", orderStatus: "completed" });
      });
      await orderBatch.commit();

      const jobs = await db.collection("print_jobs")
        .where("userId", "==", userId)
        .where("status", "==", "pending")
        .get();
        
      const jobsBatch = db.batch();
      
      jobs.forEach((doc) => {
        jobsBatch.update(doc.ref, { 
          status: "paid",
          paymentTime: now
        });
      });
      await jobsBatch.commit();
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// ================= CREATE BLANK JOB =================
app.post("/create-blank-job", authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.userId;
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
      printOptions: { copies: 1, colorMode: "bw", layout: "single", duplexMode: "simplex", isBlankSheet: true, sheetType: type },
      pricing: { pricePerPage: isGraph ? 2.0 : 2.30, totalPages: Number(pageCount) || 1 },
      paymentStatus: { status: "pending" },
      printStatus: { status: "pending" }
    });

    res.json({ message: "Blank job queued successfully" });
  } catch (err) {
    next(err);
  }
});

// ================= KIOSK: TRIGGER PI PRINT (SERVERLESS PULL MECHANISM) =================
app.post("/kiosk/print", async (req, res) => {
  try {
    const { printCode } = req.body;
    if (!printCode) return res.status(400).json({ error: "Print code required" });

    const snapshot = await db.collection("print_jobs")
      .where("printCode", "==", printCode)
      .where("status", "in", ["paid", "printing"])
      .get();

    if (snapshot.empty) return res.status(404).json({ error: "Invalid print code" });

    const results = [];
    let validJobQueued = false;

    for (const doc of snapshot.docs) {
      const data = doc.data();

      if (data.isPrinted) {
        results.push({ file: data.fileName, status: "already_printed" });
        continue;
      }

      // Skip jobs with broken/undefined file URLs (old corrupted jobs from dead Northflank backend)
      const fileUrl = data.fileUrl || "";
      const isValidUrl = fileUrl && 
        !fileUrl.includes("/undefined") && 
        fileUrl.startsWith("https://") &&
        (fileUrl.includes("firebasestorage") || fileUrl.includes("storage.googleapis.com"));

      if (!isValidUrl) {
        // Auto-mark broken jobs as failed so they never get re-triggered
        await doc.ref.update({
          status: "failed",
          printerStatus: "Invalid file URL - job cancelled",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        results.push({ file: data.fileName, status: "skipped_invalid_url" });
        continue;
      }

      // Queue valid job for Pi listener
      await doc.ref.update({
        status: "printing",
        printerStatus: "Sending to Pi...",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      validJobQueued = true;
      results.push({ file: data.fileName, status: "sent_to_pi_listener" });
    }

    if (!validJobQueued && results.every(r => r.status === "already_printed")) {
      return res.json({ success: true, message: "Already printed", results });
    }

    if (!validJobQueued) {
      return res.status(400).json({ error: "No valid files found for this print code. Please upload again." });
    }

    res.json({
      success: true,
      message: "Documents successfully queued for the Pi listener",
      results,
    });
  } catch (err) {
    console.error("KIOSK QUEUE ERROR:", err);
    res.status(500).json({ error: "Print queue failed" });
  }
});

// ================= KIOSK: POLL JOB STATUS =================
app.get("/kiosk/job-status", async (req, res) => {
  try {
    const { printCode } = req.query;
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
    const now = new Date();

    const snapshot = await db
      .collection("print_jobs")
      .where("userId", "==", userId)
      .where("status", "in", ["pending", "paid"])
      .get();

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
      const userRecord = await admin.auth().getUser(userId);
      if (userRecord.email && process.env.GMAIL_APP_PASSWORD) {
        const mailOptions = {
          from: '"Mimo Printing" <visionprintt@gmail.com>',
          to: userRecord.email,
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
        console.log(`[EMAIL] Receipt sent to ${userRecord.email}`);
      }
    } catch (emailErr) {
      console.error("[EMAIL ERROR] Failed to send receipt:", emailErr);
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

// ================= VALIDATE COUPON =================
app.get("/validate-coupon/:code", authMiddleware, async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const couponDoc = await db.collection("coupons").doc(code).get();
    if (!couponDoc.exists) return res.status(404).json({ error: "Invalid coupon code" });
    const data = couponDoc.data();
    if (!data.isActive) return res.status(400).json({ error: "Coupon is no longer active" });
    if (data.expiryDate && data.expiryDate.toDate() < new Date()) {
      return res.status(400).json({ error: "Coupon has expired" });
    }
    res.json({ discountPercentage: data.discountPercentage, code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to validate coupon" });
  }
});


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
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminEmail && adminPassword && email === adminEmail && password === adminPassword) {
    const token = jwt.sign({ isAdmin: true, email }, SECRET_KEY, { expiresIn: "24h" });
    return res.json({ token, message: "Admin Login Successful" });
  }
  return res.status(401).json({ error: "Invalid admin credentials" });
});

// ================= ADMIN METRICS =================
app.get("/admin/metrics", adminAuthMiddleware, async (req, res) => {
  try {
    const ordersSnapshot = await db.collection("orders").where("status", "==", "PAID").get();
    let totalRevenue = 0;
    let totalPagesPrinted = 0;
    
    // Initialize array for 24 hours
    const hourlyData = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, '0')}:00`,
      prints: 0
    }));
    
    ordersSnapshot.forEach(doc => {
      const data = doc.data();
      totalRevenue += Number(data.amount || 0);
      totalPagesPrinted += Number(data.totalPages || 0);
      
      if (data.createdAt) {
        const date = data.createdAt.toDate();
        const hour = date.getHours();
        hourlyData[hour].prints += 1;
      }
    });

    const piStatusDoc = await db.collection("system_status").doc("pi").get();
    const piStatus = piStatusDoc.exists ? piStatusDoc.data() : { status: "Unknown", lastSeen: null };

    res.json({
      totalRevenue: totalRevenue.toFixed(2),
      totalPagesPrinted,
      totalOrders: ordersSnapshot.size,
      piStatus,
      hourlyData
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
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
