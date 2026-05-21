require("./instrument.js");
// Load dotenv only in development (not in Docker/production)
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { PDFDocument } = require("pdf-lib");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");
const libre = require("libreoffice-convert");
const { promisify } = require("util");
const { OAuth2Client } = require("google-auth-library");
const crypto = require("crypto");

const libreConvert = promisify(libre.convert);
const { admin, db, bucket } = require("./firebase");
const rateLimit = require("express-rate-limit");

// ================= APP =================
const app = express();

const kioskLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // limit each IP to 20 requests per windowMs
  message: { error: "Too many requests. Please wait." }
});

// 1. MUST BE FIRST: CORS
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_LOCAL,
  "http://localhost:3000"
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i.test(origin)
    ) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// 2. Body Parsers
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true }));

// 3. Health Checks
app.get("/", (req, res) => res.send("Mimo Backend is LIVE 🚀"));
app.get("/test-cors", (req, res) => res.json({ message: "CORS is working!" }));

const upload = multer({ storage: multer.memoryStorage() });
const SECRET_KEY = process.env.JWT_SECRET;
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || "144514765704-a3nm5kgbtehioia9eki37s3t8doasfi1.apps.googleusercontent.com");

// ================= CASHFREE =================
const CASHFREE_BASE_URL = "https://sandbox.cashfree.com/pg";
const cashfreeHeaders = {
  "Content-Type": "application/json",
  "x-client-id": process.env.CASHFREE_APP_ID,
  "x-client-secret": process.env.CASHFREE_SECRET_KEY,
  "x-api-version": "2025-01-01",
};

// ================= AUTH MIDDLEWARE =================
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1] || req.query.token;

  if (!token) return res.status(401).send("Token missing");

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    let userId = decoded.userId || decoded.id || decoded.user?.id;
    if (!userId) return res.status(403).send("Invalid token payload");

    // ✅ Resolve userId to the actual Firestore doc ID
    // Handles both new tokens (doc ID) and old tokens (UUID in 'id' field)
    const directDoc = await db.collection("users").doc(userId).get();
    if (!directDoc.exists) {
      // Old token: userId is a UUID stored in 'id' field, not Firestore doc ID
      const snap = await db.collection("users").where("id", "==", userId).get();
      if (!snap.empty) userId = snap.docs[0].id;
    }

    req.user = { userId };
    next();
  } catch (err) {
    console.error("❌ Auth error:", err.message);
    return res.status(403).send("Invalid token");
  }
};

// ================= PAGE COUNT =================
const getPageCount = async (file) => {
  let tempInput;

  try {
    if (file.mimetype === "application/pdf") {
      const pdfDoc = await PDFDocument.load(file.buffer);
      return pdfDoc.getPageCount();
    }

    const ext = file.originalname.split(".").pop();
    tempInput = path.join(os.tmpdir(), `${Date.now()}.${ext}`);

    fs.writeFileSync(tempInput, file.buffer);

    const pdfBuf = await libreConvert(
      fs.readFileSync(tempInput),
      ".pdf",
      undefined
    );

    const pdfDoc = await PDFDocument.load(pdfBuf);
    return pdfDoc.getPageCount();

  } catch (err) {
    console.error("Page count error:", err);
    return 1;

  } finally {
    if (tempInput && fs.existsSync(tempInput)) {
      fs.unlinkSync(tempInput);
    }
  }
};

// ================= STORAGE =================
const uploadToStorage = async (file) => {
  const safeFileName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = `files/${Date.now()}_${safeFileName}`;
  const fileUpload = bucket.file(fileName);
  await fileUpload.save(file.buffer, {
    contentType: file.mimetype,
    metadata: { cacheControl: "public, max-age=86400" },
  });
  // We no longer make it public because we use Signed URLs for better security
  // await fileUpload.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
};

// Pi Print Server
const PI_BASE_URL = process.env.PI_BASE_URL || "http://100.108.118.38:8000";

// Helper: call the Pi print API for one file
const triggerPiPrint = async (fileUrl, copies = 1) => {
  const results = [];
  for (let i = 0; i < copies; i++) {
    const res = await axios.post(
      `${PI_BASE_URL}/print`,
      { file_url: fileUrl },
      { timeout: 30000, headers: { "Content-Type": "application/json" } }
    );
    results.push(res.data);
  }
  return results;
};

// ================= REGISTER =================
app.post("/register", async (req, res) => {
  try {
    const { username, password, email, mobileNumber } = req.body;
    const existing = await db.collection("users").where("email", "==", email).get();
    if (!existing.empty) return res.status(400).send("User already exists");

    const hashedPassword = await bcrypt.hash(password, 10);
    const now = admin.firestore.FieldValue.serverTimestamp();

    const userRef = await db.collection("users").add({
      username,
      email,
      mobileNumber: mobileNumber || "",
      password: hashedPassword,
      googleUser: false,
      createdAt: now,
      updatedAt: now,
      accountStatus: "active",
      totalSpent: 0,
      totalPagesPrinted: 0,
      preferredPaymentMethod: "cashfree",
      defaultPrintSettings: { colorMode: "bw", layout: "single", paperSize: "a4" },
      isVerified: true,
      mimo_coins: { balance: 0, total_earned: 0, total_used: 0 },
    });

    // Store Firestore doc ID as the 'id' field for consistency
    await userRef.update({ id: userRef.id });

    const userId = userRef.id;
    
    // Auth Log
    await db.collection("auth_logs").add({
      userId,
      email,
      action: "register",
      ipAddress: req.ip || "",
      userAgent: req.get("user-agent") || "",
      timestamp: now
    });

    const token = jwt.sign({ userId }, SECRET_KEY, { expiresIn: "30d" });
    console.log(`✅ Registered new user: ${email}, docId: ${userId}`);
    res.json({ jwtToken: token });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error registering user");
  }
});

// ================= PROFILE PHOTO UPLOAD =================
app.post("/upload-profile-photo", authenticateToken, upload.single("photo"), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).send("No file uploaded");

    const userId = req.user.userId;
    
    const safeFileName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `profiles/${userId}_${Date.now()}_${safeFileName}`;
    const fileUpload = bucket.file(fileName);

    await fileUpload.save(file.buffer, {
      contentType: file.mimetype,
      metadata: { cacheControl: "public, max-age=86400" },
    });

    // We no longer make it public because we use Signed URLs for better security
    // Instead, just save the gs:// path and generate signed urls later if needed, 
    // OR we can make just profile pictures public if desired. 
    // For simplicity, let's use a signed URL valid for 100 years for the profile pic.
    const [url] = await fileUpload.getSignedUrl({
      action: "read",
      expires: "01-01-2100",
    });

    await db.collection("users").doc(userId).update({
      photoUrl: url
    });

    res.json({ photoUrl: url });
  } catch (err) {
    console.error("❌ /upload-profile-photo error:", err);
    next(err);
  }
});

// ================= LOGIN =================
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const snapshot = await db.collection("users").where("email", "==", email).get();
    if (snapshot.empty) return res.status(400).send("User not found");
    const doc = snapshot.docs[0];
    const user = doc.data();
    if (user.googleUser) return res.status(400).send("Use Google login");
    const storedPassword = user.password || user.passwordHash;
    if (!storedPassword) return res.status(500).send("Password missing in database");
    const valid = await bcrypt.compare(password, storedPassword);
    if (!valid) return res.status(400).send("Wrong password");
    // Fall back to Firestore doc ID if custom id field is missing
    const userId = doc.id;
    if (!userId) return res.status(500).send("User ID missing in database");
    console.log(`✅ User logged in: ${email}, userId: ${userId}`);
    
    // Auth Log
    await db.collection("auth_logs").add({
      userId,
      email,
      action: "login",
      ipAddress: req.ip || "",
      userAgent: req.get("user-agent") || "",
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Update lastLoginAt
    await doc.ref.update({ lastLoginAt: admin.firestore.FieldValue.serverTimestamp() });

    const token = jwt.sign({ userId }, SECRET_KEY);
    res.json({ jwtToken: token });
  } catch (err) {
    console.error(err);
    res.status(500).send("Login failed");
  }
});

// ================= GOOGLE LOGIN =================
app.post("/google-login", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).send("Token missing");
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID || "144514765704-a3nm5kgbtehioia9eki37s3t8doasfi1.apps.googleusercontent.com",
    });
    const payload = ticket.getPayload();
    const email = payload.email;
    const name = payload.name;
    const snapshot = await db.collection("users").where("email", "==", email).get();
    let userId;
    const now = admin.firestore.FieldValue.serverTimestamp();

    if (snapshot.empty) {
      // New Google user — use Firestore doc ID as userId
      const userRef = await db.collection("users").add({
        username: name,
        email,
        mobileNumber: "",
        password: null,
        googleUser: true,
        createdAt: now,
        updatedAt: now,
        accountStatus: "active",
        totalSpent: 0,
        totalPagesPrinted: 0,
        preferredPaymentMethod: "cashfree",
        defaultPrintSettings: { colorMode: "bw", layout: "single", paperSize: "a4" },
        isVerified: true,
        mimo_coins: { balance: 0, total_earned: 0, total_used: 0 },
      });
      userId = userRef.id;
      await userRef.update({ id: userId }); // Store doc ID as 'id' field too
    } else {
      // Existing user — always use Firestore doc ID
      userId = snapshot.docs[0].id;
      // Update lastLoginAt
      await snapshot.docs[0].ref.update({ lastLoginAt: now });
    }

    // Auth Log
    await db.collection("auth_logs").add({
      userId,
      email,
      action: "google_login",
      ipAddress: req.ip || "",
      userAgent: req.get("user-agent") || "",
      timestamp: now
    });

    const jwtToken = jwt.sign({ userId }, SECRET_KEY, { expiresIn: "30d" });
    res.json({ jwtToken, name, email, userId });
  } catch (err) {
    console.error(err);
    res.status(401).send("Google login failed");
  }
});

// ================= ONBOARDING =================
app.post("/onboarding", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { username } = req.body;
    if (!username) return res.status(400).send("Name required");
    const snapshot = await db.collection("users").where("id", "==", userId).get();
    if (snapshot.empty) return res.status(404).send("User not found");
    await snapshot.docs[0].ref.update({ username, onboardingCompleted: true });
    res.send("Onboarding complete");
  } catch (err) {
    console.error(err);
    next(err);
  }
});

// ================= USER =================
app.get("/print-history", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const snapshot = await db.collection("print_jobs").where("userId", "==", userId).get();

    // Filter and sort locally to avoid requiring composite indexes
    const history = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          amount: data.totalCost || data.amount || 0,
          date: data.createdAt ? new Date(data.createdAt.toDate()).toLocaleDateString() : "N/A",
          timestamp: data.createdAt ? data.createdAt.toDate().getTime() : 0,
          details: `${data.pageCount || 0} pages • ${data.colorMode === "color" ? "Color" : "B&W"}`
        };
      })
      .filter((job) => ["paid", "completed", "printed"].includes(job.status))
      .sort((a, b) => b.timestamp - a.timestamp);

    res.json(history);
  } catch (err) {
    console.error("❌ /print-history error:", err);
    res.status(500).send("Failed to fetch print history");
  }
});

app.get("/mimo/user", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const doc = await db.collection("users").doc(userId).get();
    if (!doc.exists) return res.status(404).send("User not found");
    const user = doc.data();
    res.json({ name: user.username, email: user.email, userId, photoUrl: user.photoUrl });
  } catch (err) {
    console.error("❌ /mimo/user error:", err);
    next(err);
  }
});

// ================= PROFILE (consolidated) =================
app.get("/profile", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const doc = await db.collection("users").doc(userId).get();
    if (!doc.exists) return res.status(404).send("User not found");
    const user = doc.data();
    res.json({
      id: userId,
      username: user.username,
      email: user.email,
      photoUrl: user.photoUrl,
      mobileNumber: user.mobileNumber || "",
      googleUser: user.googleUser || false,
      mimo_coins: user.mimo_coins || { balance: 0, total_earned: 0, total_used: 0 },
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to fetch profile");
  }
});

app.put("/profile", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { username, mobileNumber } = req.body;
    await db.collection("users").doc(userId).update({
      username,
      mobileNumber: mobileNumber || "",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ message: "Profile updated" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating profile");
  }
});

// ================= SETTINGS =================
app.post("/settings", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const settings = req.body;
    await db.collection("users").doc(userId).update({ settings, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    res.send("Settings saved");
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to save settings");
  }
});

app.get("/settings", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return res.status(404).send("User not found");
    const data = userDoc.data();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to fetch settings");
  }
});

// ================= PRINT HISTORY =================
app.get("/print-history", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const snapshot = await db.collection("print_jobs")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .get();
      
    const history = snapshot.docs.map(doc => {
      const data = doc.data();
      const opts = data.printOptions || {};
      const colorMode = opts.colorMode || data.colorMode || "bw";
      const copies = opts.copies || data.copies || 1;
      const pricePerPage = colorMode === "color" ? 9.2 : 2.3;
      const cost = (data.pageCount || 0) * copies * pricePerPage;

      let printerStatus = data.printerStatus || "Pending";
      if (!data.printerStatus) {
        if (data.status === "pending") printerStatus = "Pending Payment";
        else if (data.status === "paid") printerStatus = "Ready to Print";
        else if (data.status === "completed") printerStatus = "Completed";
        else if (data.status === "expired") printerStatus = "Expired";
      }

      let details = `${data.pageCount || 0} pages • ${colorMode === 'bw' ? 'B&W' : 'Color'}`;
      if (opts.doubleSided === 'double') details += ' • 2-Sided';
      else details += ' • 1-Sided';

      return {
        id: doc.id,
        printCode: data.printCode || "-",
        status: data.status,
        printerStatus,
        file: data.fileName,
        fileType: data.mimetype || "unknown",
        fileSize: data.fileSize || 0,
        cost: `₹${cost.toFixed(2)}`,
        colorMode,
        copies,
        details,
        date: data.createdAt?.toDate
          ? new Date(data.createdAt.toDate()).toLocaleString()
          : new Date().toLocaleString(),
      };
    });
    
    res.json(history);
  } catch (err) {
    console.error("Print history error:", err);
    res.status(500).send("Failed to fetch history");
  }
});

app.get("/mimo/coins", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return res.status(404).json({ balance: 0, totalEarned: 0, totalUsed: 0, history: [] });
    const data = userDoc.data() || {};
    
    const historySnapshot = await db
      .collection("mimo_coin_transactions")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .get();
    
    const history = historySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().createdAt ? new Date(doc.data().createdAt.toDate()).toLocaleDateString() : "N/A"
    }));

    res.json({
      balance: data.mimo_coins?.balance || 0,
      totalEarned: data.mimo_coins?.total_earned || 0,
      totalUsed: data.mimo_coins?.total_used || 0,
      history
    });
  } catch (err) {
    console.error("❌ /mimo/coins error:", err);
    next(err);
  }
});

app.get("/mimo/stats", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get all paid/completed print jobs for doc/page counts
    const jobsSnapshot = await db
      .collection("print_jobs")
      .where("userId", "==", userId)
      .get();

    // Count from print_jobs (for current live jobs)
    let totalDocs = 0;
    let totalPages = 0;
    jobsSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.status === "completed" || data.status === "paid") {
        totalDocs++;
        const copies = data.printOptions?.copies || 1;
        totalPages += (data.pageCount || 0) * copies;
      }
    });

    // Use orders as the source of truth for spent, docs and pages
    // This ensures stats survive even if print_jobs are cleaned up
    const ordersSnapshot = await db
      .collection("orders")
      .where("userId", "==", userId)
      .get();
    
    let totalSpent = 0;
    let orderDocs = 0;
    let orderPages = 0;
    ordersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.status === "PAID" || data.status === "SUCCESS") {
        totalSpent += Number(data.amount || 0);
        orderDocs += Number(data.totalDocs || 0);
        orderPages += Number(data.totalPages || 0);
      }
    });

    // Use whichever is larger — live jobs or historical orders
    res.json({
      totalDocs: Math.max(totalDocs, orderDocs),
      totalPages: Math.max(totalPages, orderPages),
      totalSpent: Number(totalSpent.toFixed(2)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching stats");
  }
});

app.post("/payment-success", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const now = new Date();

    const snapshot = await db
      .collection("print_jobs")
      .where("userId", "==", userId)
      .where("status", "in", ["pending", "paid"])
      .get();

    // Filter jobs that don't have a printCode yet
    const jobsToUpdate = snapshot.docs.filter(doc => !doc.data().printCode);
    
    // If all jobs already have a print code, return the most recent one
    if (jobsToUpdate.length === 0 && !snapshot.empty) {
      const recentJob = snapshot.docs.find(doc => doc.data().printCode);
      if (recentJob) {
        console.log(`[PAYMENT-SUCCESS] Returning existing code for user ${userId}`);
        return res.json({ printCode: recentJob.data().printCode });
      }
    }

    console.log(`[PAYMENT-SUCCESS] Found ${jobsToUpdate.length} jobs needing print codes for userId: ${userId}`);

    if (jobsToUpdate.length === 0) {
      console.error(`❌ No jobs found requiring a print code for userId: ${userId}`);
      return res.status(400).json({ error: "No pending jobs found" });
    }

    // ✅ GENERATE ONLY ONCE HERE
    const printCode = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);

    const batch = db.batch();
    let totalAmountForCoins = 0;

    jobsToUpdate.forEach((doc) => {
      const data = doc.data();
      totalAmountForCoins += (data.pageCount || 0) * 2.3; // Defaulting to BW price for coins
      
      batch.update(doc.ref, {
        status: "paid",
        "paymentStatus.status": "completed",
        "paymentStatus.paidAt": admin.firestore.FieldValue.serverTimestamp(),
        paymentTime: admin.firestore.FieldValue.serverTimestamp(),
        printCode,
        tokenId: printCode,
        codeCreatedAt: now,
        codeExpiresAt: expiresAt,
        isPrinted: false,
        printerStatus: "ready",
        "printStatus.status": "ready"
      });
    });

    // Calculate coins earned: 1 coin if payment is above ₹10
    const coinsEarned = totalAmountForCoins > 10 ? 1 : 0;
    if (coinsEarned > 0) {
      const coinTxRef = db.collection("mimo_coin_transactions").doc();
      batch.set(coinTxRef, {
        userId,
        type: "earned",
        amount: coinsEarned,
        description: `Earned from print job ${printCode}`,
        createdAt: now,
      });

      // Update user balance
      const userRef = db.collection("users").doc(userId);
      batch.update(userRef, {
        "mimo_coins.balance": admin.firestore.FieldValue.increment(coinsEarned),
        "mimo_coins.total_earned": admin.firestore.FieldValue.increment(coinsEarned),
      });
    }

    await batch.commit();

    // We no longer prefetch to RAM. Signed URLs will be generated when Kiosk requests them.

    res.json({
      message: "Payment success",
      printCode,   // ✅ RETURN TO FRONTEND
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Payment update failed" });
  }
});

app.get("/mimo/conversion-status", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const pendingConversions = await db.collection("print_jobs")
      .where("userId", "==", userId)
      .where("status", "in", ["pending_conversion", "processing"])
      .get();
      
    if (!pendingConversions.empty) {
      return res.json({ status: "processing" });
    }
    
    const pendingJobs = await db.collection("print_jobs")
      .where("userId", "==", userId)
      .where("status", "==", "pending")
      .get();
      
    let totalPages = 0;
    pendingJobs.forEach(doc => totalPages += (doc.data().pageCount || 0));
    
    res.json({ 
      status: "completed", 
      totalPages, 
      amount: Number((totalPages * 2.3).toFixed(2)) 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get status" });
  }
});

app.get("/mimo/conversion-stream", authenticateToken, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  
  // To avoid timeouts on some proxies (like Nginx/Cloudflare)
  res.flushHeaders();

  const userId = req.user.userId;

  // Listen to Firestore for real-time updates
  // We removed .where("status", "in", ...) to avoid needing a Composite Index
  const unsubscribe = db.collection("print_jobs")
    .where("userId", "==", userId)
    .onSnapshot((snapshot) => {
      let isProcessing = false;
      let totalPages = 0;

      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.status === "pending_conversion" || data.status === "processing") {
          isProcessing = true;
        } else if (data.status === "pending") {
          totalPages += (data.pageCount || 0);
        }
      });

      if (isProcessing) {
        res.write(`data: ${JSON.stringify({ status: "processing" })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ status: "completed", totalPages, amount: Number((totalPages * 2.3).toFixed(2)) })}\n\n`);
      }
    }, (err) => {
      console.error("SSE Snapshot Error:", err);
      res.write(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`);
    });

  req.on("close", () => {
    unsubscribe();
  });
});

// ================= UPLOAD =================
app.post("/upload", authenticateToken, upload.array("files"), async (req, res, next) => {
  try {
    const userId = req.user.userId;
    console.log(`[UPLOAD] userId from token: ${userId}`);
    if (!userId) return res.status(401).send("User ID missing from token");

    // Clear all old jobs that aren't completed or printing
    const oldJobs = await db
      .collection("print_jobs")
      .where("userId", "==", userId)
      .get();
    
    const cleanupBatch = db.batch();
    let cleanupCount = 0;
    oldJobs.forEach(doc => {
      const data = doc.data();
      // Delete unpaid and unconverted jobs to make room for new upload
      if (["pending", "pending_conversion", "processing"].includes(data.status)) {
        cleanupBatch.delete(doc.ref);
        cleanupCount++;
      }
    });
    if (cleanupCount > 0) {
      await cleanupBatch.commit();
      console.log(`🧹 Cleaned up ${cleanupCount} old jobs for user ${userId}`);
    }

    if (!req.files || req.files.length === 0) {
      console.error("❌ No files received in /upload");
      return res.status(400).send("No files uploaded");
    }

    console.log(`📂 Received ${req.files.length} files for processing`);

    const now = admin.firestore.FieldValue.serverTimestamp();

    for (let file of req.files) {
      console.log(`📄 Saving raw file: ${file.originalname} (${file.mimetype})`);
      const fileUrl = await uploadToStorage(file);

      // Common metadata for all files
      const baseJobData = {
        // --- Backward Compatibility (V1 schema) ---
        // --- Backward Compatibility (V1 schema) ---
        userId,
        fileName: file.originalname,
        documentUrl: fileUrl,
        fileUrl,
        mimetype: file.mimetype,
        fileSize: file.size || file.buffer?.length || 0,
        fileType: file.mimetype.split("/")[1] || "unknown",
        isImage: file.mimetype.startsWith("image/"),
        createdAt: now,
        updatedAt: now,
        files: [
          { name: file.originalname, size: file.size || file.buffer?.length || 0, type: file.mimetype, url: fileUrl }
        ],
        
        // --- Analytics / V2 Schema (FIREBASE_SCHEMA_DESIGN.md) ---
        sourceFile: {
          fileName: file.originalname,
          originalExtension: require('path').extname(file.originalname) || "",
          mimeType: file.mimetype,
          fileSizeBytes: file.size || file.buffer?.length || 0,
          uploadedAt: now,
        },
        conversionDetails: {
          convertedAt: null,
          originalPageCount: 0,
          actualPageCount: 0,
          isConverting: false,
        },
        printOptions: { copies: 1, colorMode: "bw", layout: "single", duplexMode: "simplex" },
        pricing: { pricePerPage: 0, totalPages: 0, copiesRequested: 1, totalPagesToPrint: 0, estimatedAmount: 0, finalAmount: 0, currency: "INR" },
        paymentStatus: { status: "pending", paymentMethod: "cashfree", transactionId: null, paidAt: null },
        printStatus: { status: "pending", retrievedAt: null, printStartedAt: null, printCompletedAt: null },
        timeline: { createdAt: now, uploadedAt: now, orderCreatedAt: null, expiresAt: null },
        metadata: { ipAddress: req.ip || "", userAgent: req.get("user-agent") || "", tags: [] }
      };

      // ⚡ FAST PATH: PDFs — count pages immediately, skip the queue
      if (file.mimetype === "application/pdf") {
        try {
          const { PDFDocument } = require("pdf-lib");
          const pdfDoc = await PDFDocument.load(file.buffer);
          const pages = pdfDoc.getPageCount();
          await db.collection("print_jobs").add({
            ...baseJobData,
            status: "pending",
            pageCount: pages,
          });
          console.log(`⚡ PDF fast-tracked: ${file.originalname} (${pages} pages)`);
          continue;
        } catch (pdfErr) {
          console.warn(`⚠️ PDF fast-path failed, queuing:`, pdfErr.message);
        }
      }

      // ⚡ FAST PATH: Images — 1 page each, no conversion needed
      if (file.mimetype.startsWith("image/")) {
        await db.collection("print_jobs").add({
          ...baseJobData,
          status: "pending",
          pageCount: 1,
        });
        console.log(`⚡ Image fast-tracked: ${file.originalname}`);
        continue;
      }

      // 🐢 SLOW PATH: DOCX/PPT/etc — queue for LibreOffice background conversion
      await db.collection("print_jobs").add({
        ...baseJobData,
        status: "pending_conversion",
      });
    }

    res.json({ message: "Files queued for processing" });
  } catch (err) {
    console.error("❌ /upload Error:", err);
    // Explicitly pass to next() so Sentry Express Error Handler catches it!
    next(err);
  }
});

// ================= CREATE ORDER =================
app.post("/create-order", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log(`[CREATE-ORDER] userId from token: ${userId}`);
    
    const jobsSnapshot = await db
      .collection("print_jobs")
      .where("userId", "==", userId)
      .where("status", "==", "pending")
      .get();
    
    console.log(`[CREATE-ORDER] Found ${jobsSnapshot.size} pending jobs for userId: ${userId}`);

    const { printOptions } = req.body;
    if (jobsSnapshot.empty) return res.status(400).send("No pending jobs");

    const orderId = "order_" + Date.now();
    const jobIds = [];

    const userDoc = await db.collection("users").doc(userId).get();
    const userEmail = userDoc.exists ? userDoc.data().email : "unknown";

    let totalPages = 0;
    let totalAmount = 0;
    const colorMode = printOptions?.colorMode || "bw";
    const pricePerPage = colorMode === "color" ? 9.20 : 2.30;
    const copies = Number(printOptions?.copies || 1);

    const batchUpdate = db.batch();
    jobsSnapshot.forEach((doc) => {
      jobIds.push(doc.id);
      const pages = doc.data().pageCount || 0;
      const jobCost = pages * copies * pricePerPage;
      
      totalPages += pages;
      totalAmount += jobCost;

      batchUpdate.update(doc.ref, { 
        printOptions: printOptions || {},
        orderId,
        totalCost: jobCost,
        finalCost: jobCost,
        merchantTransactionId: orderId,
        userEmail,
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

    const amount = Number(totalAmount.toFixed(2));
    console.log(`[CREATE-ORDER] ${totalPages} pages × ${copies} copies × ₹${pricePerPage} (${colorMode}) = ₹${amount}`);

    const response = await axios.post(
      `${CASHFREE_BASE_URL}/orders`,
      {
        order_id: orderId,
        order_amount: amount,
        order_currency: "INR",
        customer_details: {
          customer_id: userId,
          customer_email: "user@email.com",
          customer_phone: "9999999999",
        },
        order_meta: {
          return_url: `${process.env.FRONTEND_URL || "http://localhost:5173"}/payment-verify?order_id={order_id}`
        },
      },
      { 
        headers: cashfreeHeaders,
        timeout: 10000 // 10 second timeout
      }
    );

    console.log(`✅ Cashfree order created: ${orderId}, session: ${response.data.payment_session_id}`);

    // --- V2 Schema: Create Payment Transaction Audit Record ---
    const paymentTxnRef = db.collection("payment_transactions").doc();
    const txnId = paymentTxnRef.id;

    await paymentTxnRef.set({
      transactionId: txnId,
      userId,
      orderId,
      merchantTransactionId: orderId, // Flat field for analytics
      paymentGateway: "cashfree",
      cashfreeSessionId: response.data.payment_session_id,
      cashfreeOrderId: response.data.cf_order_id || null, // Cashfree's internal order ID
      gatewayTransactionId: response.data.payment_session_id,
      orderDetails: { description: `Print order ${orderId}`, amount, currency: "INR", orderTimestamp: new Date() },
      paymentAttempt: { attemptNumber: 1, initiatedAt: new Date(), sessionId: response.data.payment_session_id, paymentMethod: "unknown" },
      transactionStatus: { status: "pending", gatewayStatus: "initiated", completedAt: null },
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // --- V1 + V2 Schema: Create Order ---
    await db.collection("orders").add({
      orderId,
      userId,
      amount,
      totalPages,
      totalDocs: jobsSnapshot.size,
      status: "CREATED", // V1 compat
      createdAt: new Date(),
      updatedAt: new Date(),
      
      // V2 Schema fields
      paymentTransactionId: txnId,
      jobIds, // Add mapping to jobs
      orderStatus: "created",
      orderType: "print",
      totals: { subtotalAmount: amount, taxAmount: 0, totalAmount: amount, currency: "INR" },
      paymentDetails: { paymentMethod: "cashfree", paymentStatus: "pending" },
    });

    res.json({
      orderId,
      paymentSessionId: response.data.payment_session_id,
      amount,
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Order creation failed");
  }
});

// ================= VERIFY PAYMENT =================
app.get("/verify-payment/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    // 1. Query Cashfree directly for real-time status (don't rely on webhook timing)
    let cashfreeStatus = null;
    try {
      const cfRes = await axios.get(
        `${CASHFREE_BASE_URL}/orders/${orderId}`,
        { headers: cashfreeHeaders, timeout: 10000 }
      );
      cashfreeStatus = cfRes.data.order_status; // "PAID", "ACTIVE", "EXPIRED" etc
      console.log(`[VERIFY-PAYMENT] Cashfree status for ${orderId}: ${cashfreeStatus}`);
    } catch (cfErr) {
      console.warn("[VERIFY-PAYMENT] Cashfree API failed, falling back to Firestore:", cfErr.message);
    }

    // 2. If Cashfree says PAID, update Firestore immediately (don't wait for webhook)
    if (cashfreeStatus === "PAID") {
      const orderSnapshot = await db.collection("orders").where("orderId", "==", orderId).get();
      if (!orderSnapshot.empty) {
        await orderSnapshot.docs[0].ref.update({ status: "PAID" });
      }
      return res.json({ order_status: "PAID" });
    }

    // 3. Fallback: check Firestore (in case webhook already fired)
    const orderSnapshot = await db.collection("orders").where("orderId", "==", orderId).get();
    if (orderSnapshot.empty) {
      // If not in Firestore at all yet but Cashfree says paid, return cashfree status
      return res.json({ order_status: cashfreeStatus || "CREATED" });
    }

    const orderData = orderSnapshot.docs[0].data();
    const order_status = orderData.status;
    console.log(`[VERIFY-PAYMENT] Firestore status for ${orderId}: ${order_status}`);

    res.json({ order_status });
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
      const orders = await db.collection("orders").where("orderId", "==", orderId).get();
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
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// ================= GENERATE PRINT CODE =================
app.get("/generate-print-code", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const snapshot = await db
      .collection("print_jobs")
      .where("userId", "==", userId)
      .where("status", "==", "paid")
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(400).json({ error: "No paid jobs found" });
    }

    const data = snapshot.docs[0].data();

    res.json({
      printCode: data.printCode,
      expiresAt: data.codeExpiresAt,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch print code" });
  }
});
// ================= PRINT BY CODE =================
app.post("/get-documents-by-code", kioskLimiter, async (req, res) => {
  try {
    const { printCode } = req.body;
    const now = new Date();

    if (!printCode) {
      return res.status(400).json({ error: "Print code required" });
    }

    const snapshot = await db
      .collection("print_jobs")
      .where("printCode", "==", printCode)
      .where("status", "==", "paid")
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: "Invalid code" });
    }

    const validDocs = [];

    // ✅ FIX: define firstDoc FIRST
    const firstDoc = snapshot.docs[0].data();
    const userId = firstDoc.userId;

    // Fetch user name using Firestore doc ID (since auth now resolves to doc ID)
    let userName = "User";
    if (userId) {
      const userDoc = await db.collection("users").doc(userId).get();
      if (userDoc.exists) {
        userName = userDoc.data().username || "User";
      } else {
        // Fallback for old tokens that stored UUID in 'id' field
        const userSnap = await db.collection("users").where("id", "==", userId).limit(1).get();
        if (!userSnap.empty) userName = userSnap.docs[0].data().username || "User";
      }
    }

    for (const doc of snapshot.docs) {
      const data = doc.data();

      // ❌ Expired
      if (data.codeExpiresAt && new Date(data.codeExpiresAt) < now) {
        await doc.ref.update({
          printCode: null,
          codeExpiresAt: null,
          status: "expired",
          printerStatus: "Expired"
        });
        continue;
      }

      // ❌ Already printed
      if (data.isPrinted) continue;

      const filePath = data.fileUrl.split(`${bucket.name}/`)[1];
      const file = bucket.file(filePath);
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      });

      validDocs.push({
        id: doc.id,
        file: data.fileName,
        copies: data.copies || 1,
        url: signedUrl,
      });

      // 🔄 Mark as printing
      await doc.ref.update({
        printerStatus: "printing",
        status: "printing",
      });
    }

    if (validDocs.length === 0) {
      return res.status(400).json({
        error: "Print code expired. Please generate a new one.",
      });
    }

    res.json({
      documents: validDocs,
      userName, // ✅ now works
    });

  } catch (err) {
    console.error("❌ SERVER ERROR:", err);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

// ================= PRINT SUMMARY =================
app.get("/print-summary", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const snapshot = await db
      .collection("print_jobs")
      .where("userId", "==", userId)
      .where("status", "==", "printing")
      .get();

    const totalPrints = snapshot.size;
    let totalPages = 0;
    let totalAmount = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      totalPages += data.pageCount || 0;
      totalAmount += (data.pageCount || 0) * 2.3;
    });

    res.json({
      totalPrints,
      totalPages,
      totalAmount: Number(totalAmount.toFixed(2)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to fetch summary");
  }
});

app.post("/mark-printed", authenticateToken, async (req, res) => {
  try {
    const { printCode } = req.body;

    if (!printCode) {
      return res.status(400).json({ error: "Print code required" });
    }

    const snapshot = await db
      .collection("print_jobs")
      .where("printCode", "==", printCode)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: "No jobs found" });
    }

    const batch = db.batch();

    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        isPrinted: true,
        printerStatus: "completed",
        status: "completed",
      });
    });

    await batch.commit();

    res.json({ message: "Print completed successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update print status" });
  }
});

// ================= KIOSK: TRIGGER PI PRINT (PUSH MECHANISM) =================
// Called by kiosk after user confirms. Backend calls Pi, Pi prints via CUPS.
app.post("/kiosk/print", kioskLimiter, async (req, res) => {
  try {
    const { printCode } = req.body;
    if (!printCode) return res.status(400).json({ error: "Print code required" });

    const snapshot = await db
      .collection("print_jobs")
      .where("printCode", "==", printCode)
      .where("status", "in", ["paid", "printing"])
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: "Invalid or already used print code" });
    }

    const now = new Date();
    const results = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const fileName = data.fileName || "file";

      // Skip expired
      if (data.codeExpiresAt && data.codeExpiresAt.toDate() < now) {
        await doc.ref.update({ status: "expired", printerStatus: "Expired" });
        results.push({ file: fileName, status: "expired" });
        continue;
      }

      // Skip already printed
      if (data.isPrinted) {
        results.push({ file: fileName, status: "already_printed" });
        continue;
      }

      // Mark sending to Pi
      await doc.ref.update({
        status: "printing",
        printerStatus: "Sending to Pi...",
        kioskId: "KIOSK_001",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      try {
        const opts = data.printOptions || {};
        const copies = Number(opts.copies || 1);
        
        const filePath = data.fileUrl.split(`${bucket.name}/`)[1];
        const file = bucket.file(filePath);
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        });

        console.log(`🖨️ Sending to Pi: ${fileName} | copies: ${copies} | url: ${signedUrl}`);
        const piResults = await triggerPiPrint(signedUrl, copies);
        console.log(`✅ Pi response for ${fileName}:`, piResults);

        await doc.ref.update({
          status: "completed",
          isPrinted: true,
          printerStatus: "Printed",
          printedAt: admin.firestore.FieldValue.serverTimestamp(),
          printTime: admin.firestore.FieldValue.serverTimestamp(),
          inventoryUpdated: true,
          inventoryUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          piResponse: JSON.stringify(piResults[0] || {}),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        results.push({ file: fileName, status: "printed", piResponse: piResults });
      } catch (piErr) {
        const errMsg = piErr.response?.data?.detail || piErr.message || "Unknown error";
        console.error(`❌ Pi print failed for ${fileName}:`, errMsg);

        await doc.ref.update({
          status: "failed", // Mark as failed
          printerStatus: `Pi error: ${errMsg.substring(0, 100)}`,
          piError: errMsg,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        // --- AUTO REFUND LOGIC ---
        if (data.finalCost > 0 && data.orderId) {
          console.log(`[AUTO-REFUND] Triggering Cashfree refund for order: ${data.orderId}, amount: ₹${data.finalCost}`);
          try {
            const cashfreeHeaders = {
              "x-client-id": process.env.CASHFREE_APP_ID,
              "x-client-secret": process.env.CASHFREE_SECRET_KEY,
              "x-api-version": "2023-08-01",
              "Content-Type": "application/json"
            };
            const refundData = {
              refund_amount: data.finalCost,
              refund_id: `ref_${Date.now()}_${data.orderId.substring(0,10)}`,
              refund_note: `Hardware Error: ${errMsg.substring(0, 50)}`
            };
            await axios.post(`${CASHFREE_BASE_URL}/orders/${data.orderId}/refunds`, refundData, { headers: cashfreeHeaders });
            console.log(`[AUTO-REFUND] Refund successful for ${data.orderId}`);
            
            await doc.ref.update({ refundStatus: "completed", refundAmount: data.finalCost });
          } catch (cfErr) {
            console.error(`[AUTO-REFUND] Refund failed for ${data.orderId}:`, cfErr.response?.data || cfErr.message);
            await doc.ref.update({ refundStatus: "failed", refundError: cfErr.message });
          }
        }

        results.push({ file: fileName, status: "failed", error: errMsg });
      }
    }

    const allDone = results.every((r) => ["printed", "already_printed"].includes(r.status));
    res.json({
      success: allDone,
      message: allDone ? "All documents sent to printer" : "Some documents failed",
      results,
    });
  } catch (err) {
    console.error("❌ KIOSK QUEUE ERROR:", err);
    res.status(500).json({ error: "Print queue failed", details: err.message });
  }
});

// ================= KIOSK: PI HEALTH CHECK =================
app.get("/kiosk/health", async (req, res) => {
  try {
    const piRes = await axios.get(`${PI_BASE_URL}/`, { timeout: 5000 });
    res.json({
      pi_status: "online",
      pi_response: piRes.data,
      pi_url: PI_BASE_URL,
    });
  } catch (err) {
    res.status(503).json({
      pi_status: "offline",
      error: err.message,
      pi_url: PI_BASE_URL,
    });
  }
});

// Endpoint removed: /download/:id is no longer needed as Pi fetches from Signed URLs directly.
// ================= BACKGROUND CONVERSION =================
setInterval(async () => {
  try {
    const snapshot = await db.collection("print_jobs")
      .where("status", "==", "pending_conversion")
      .limit(1)
      .get();
      
    if (snapshot.empty) return;
    
    const doc = snapshot.docs[0];
    const data = doc.data();
    
    // Mark as processing
    await doc.ref.update({ status: "processing" });
    
    console.log(`[BG PROCESSOR] Processing ${data.fileName}`);
    
    let pages = 0;
    let finalFileUrl = data.fileUrl;
    
    // Download to get page count or convert
    const bucketFile = bucket.file(data.fileUrl.split(`${bucket.name}/`)[1]);
    const [buffer] = await bucketFile.download();
    
    if (data.mimetype === "application/pdf") {
      const { PDFDocument } = require("pdf-lib");
      const pdfDoc = await PDFDocument.load(buffer);
      pages = pdfDoc.getPageCount();
    } else {
      const tempInput = path.join(os.tmpdir(), `temp_${Date.now()}${path.extname(data.fileName).toLowerCase()}`);
      fs.writeFileSync(tempInput, buffer);
      
      const pdfBuffer = await libreConvert(buffer, ".pdf", undefined);
      
      const { PDFDocument } = require("pdf-lib");
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      pages = pdfDoc.getPageCount();
      
      // Upload new PDF
      const newFileName = `converted_${Date.now()}.pdf`;
      const newFile = bucket.file(newFileName);
      await newFile.save(pdfBuffer, { contentType: "application/pdf" });
      await newFile.makePublic();
      finalFileUrl = `https://storage.googleapis.com/${bucket.name}/${newFileName}`;
      
      fs.unlinkSync(tempInput);
    }
    
    await doc.ref.update({
      status: "pending",
      pageCount: pages,
      fileUrl: finalFileUrl
    });
    
    console.log(`[BG PROCESSOR] Finished ${data.fileName} (${pages} pages)`);
  } catch (err) {
    console.error("[BG PROCESSOR ERROR]", err.message);
    // Reset status so it can be retried next interval
    try {
      const snapshot = await db.collection("print_jobs")
        .where("status", "==", "processing").limit(1).get();
      if (!snapshot.empty) {
        await snapshot.docs[0].ref.update({ status: "pending_conversion" });
      }
    } catch (_) {}
  }
}, 2000); // Check every 2 seconds (faster response for DOCX/PPT)

// ================= CRON: AUTO DELETE DEAD FILES =================
// Frees up Google Cloud Storage by deleting 48-hour old PDF files
app.get("/cron/cleanup-files", async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
    
    // We fetch jobs older than 48h that haven't been deleted yet
    const snapshot = await db.collection("print_jobs")
      .where("createdAt", "<", admin.firestore.Timestamp.fromDate(cutoff))
      .get();
      
    // Filter locally to avoid index creation for fileDeleted != true
    const jobsToDelete = snapshot.docs.filter(doc => !doc.data().fileDeleted);
    
    let deletedCount = 0;
    const batch = db.batch();
    let batchOperations = 0;
    
    for (const doc of jobsToDelete) {
      if (batchOperations >= 450) break; // Firestore batch limits
      const data = doc.data();
      
      if (data.fileUrl) {
        try {
          const bucketStr = bucket.name + "/";
          const parts = data.fileUrl.split(bucketStr);
          if (parts.length > 1) {
            const filePath = parts[1];
            await bucket.file(filePath).delete();
          }
        } catch (bucketErr) {
          // 404 means already deleted
          if (bucketErr.code !== 404) {
             console.error(`[CRON] Failed deleting ${data.fileUrl}:`, bucketErr);
             continue; // Skip DB update if delete failed
          }
        }
      }
      batch.update(doc.ref, { fileDeleted: true, fileDeletedAt: admin.firestore.FieldValue.serverTimestamp() });
      deletedCount++;
      batchOperations++;
    }
    
    if (deletedCount > 0) await batch.commit();
    
    console.log(`[CRON] Cleaned up ${deletedCount} files.`);
    res.json({ success: true, deletedCount, message: `Deleted ${deletedCount} old files` });
  } catch (err) {
    console.error("[CRON ERROR]", err);
    res.status(500).json({ error: err.message });
  }
});



const Sentry = require("@sentry/node");
Sentry.setupExpressErrorHandler(app);

// ================= START =================
// Start the server when run directly. This ensures Docker/production runs the app.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`?? Server running on port ${PORT}`);
  });
}

module.exports = app;
