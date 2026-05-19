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

// ================= PDF CACHE =================
const pdfCache = new Map();
const PDF_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const MAX_CACHE_SIZE = 200 * 1024 * 1024; // 200MB max
let cacheSize = 0;

function cacheJobPdf(pin, buffer) {
  cacheSize += buffer.length;
  
  // Evict oldest if over limit
  if (cacheSize > MAX_CACHE_SIZE) {
    const oldestPin = Array.from(pdfCache.keys())[0];
    const oldestBuffer = pdfCache.get(oldestPin).buffer;
    cacheSize -= oldestBuffer.length;
    pdfCache.delete(oldestPin);
    console.log(`🧹 Evicted oldest PDF from cache: ${oldestPin}`);
  }
  
  pdfCache.set(pin, {
    buffer,
    expiry: Date.now() + PDF_CACHE_TTL
  });
}

// Cleanup expired cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of pdfCache.entries()) {
    if (value.expiry < now) {
      cacheSize -= value.buffer.length;
      pdfCache.delete(key);
    }
  }
}, 5 * 60 * 1000); // Run cleanup every 5 minutes

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
  const token = authHeader?.split(" ")[1];

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
  const fileName = `files/${Date.now()}_${file.originalname}`;
  const fileUpload = bucket.file(fileName);
  await fileUpload.save(file.buffer);
  return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
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
      mimo_coins: { balance: 0, total_earned: 0, total_used: 0 },
    });

    // Store Firestore doc ID as the 'id' field for consistency
    await userRef.update({ id: userRef.id });

    const userId = userRef.id;
    const token = jwt.sign({ userId }, SECRET_KEY, { expiresIn: "30d" });
    console.log(`✅ Registered new user: ${email}, docId: ${userId}`);
    res.json({ jwtToken: token });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error registering user");
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
    res.status(500).send("Failed onboarding");
  }
});

// ================= USER =================
app.get("/mimo/user", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const doc = await db.collection("users").doc(userId).get();
    if (!doc.exists) return res.status(404).send("User not found");
    const user = doc.data();
    res.json({ name: user.username, email: user.email, userId });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching user");
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
    const doc = await db.collection("users").doc(userId).get();
    if (!doc.exists) return res.status(404).send("User not found");
    res.json(doc.data().settings || {});
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
      const pricePerPage = colorMode === "color" ? 10 : 2.3;
      const cost = (data.pageCount || 0) * copies * pricePerPage;

      return {
        id: doc.id,
        printCode: data.printCode || "",
        status: data.status,
        printerStatus: data.printerStatus || "",
        file: data.fileName,
        fileType: data.mimetype || "unknown",
        fileSize: data.fileSize || 0,
        cost: `₹${cost.toFixed(2)}`,
        colorMode,
        copies,
        details: `${data.pageCount || 0} pages • ${colorMode === "color" ? "Color" : "B&W"} • ${copies}x`,
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
    const data = userDoc.data();
    
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
    console.error(err);
    res.status(500).send("Error fetching coins");
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
      .where("status", "==", "pending")
      .get();

    console.log(`[PAYMENT-SUCCESS] Found ${snapshot.size} pending jobs for userId: ${userId}`);

    if (snapshot.empty) {
      console.error(`❌ No pending jobs found for userId: ${userId}`);
      return res.status(400).json({ error: "No pending jobs found" });
    }

    // ✅ GENERATE ONLY ONCE HERE
    const printCode = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);

    const batch = db.batch();
    let totalAmountForCoins = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      totalAmountForCoins += (data.pageCount || 0) * 2.3;
      
      batch.update(doc.ref, {
        status: "paid",
        printCode,
        codeCreatedAt: now,
        codeExpiresAt: expiresAt,
        isPrinted: false,
        printerStatus: "ready",
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

    // 🚀 PREFETCH PDFS TO CACHE (Background)
    setTimeout(() => {
      snapshot.forEach(async (doc) => {
        try {
          const data = doc.data();
          const filePath = data.fileUrl.split(`${bucket.name}/`)[1];
          const file = bucket.file(filePath);
          const [buffer] = await file.download();
          cacheJobPdf(doc.id, buffer);
          console.log(`🚀 Prefetched PDF into cache: ${doc.id}`);
        } catch (err) {
          console.error("Prefetch failed for", doc.id, err);
        }
      });
    }, 0);

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

// ================= UPLOAD =================
app.post("/upload", authenticateToken, upload.array("files"), async (req, res) => {
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
        userId,
        fileName: file.originalname,
        fileUrl,
        mimetype: file.mimetype,
        fileSize: file.size || file.buffer?.length || 0,
        fileType: file.mimetype.split("/")[1] || "unknown",
        isImage: file.mimetype.startsWith("image/"),
        createdAt: now,
        updatedAt: now,
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
    console.error(err);
    res.status(500).send("Upload failed");
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

    // Save printer configuration to each job
    const batchUpdate = db.batch();
    jobsSnapshot.forEach((doc) => {
      batchUpdate.update(doc.ref, { 
        printOptions: printOptions || {},
      });
    });
    await batchUpdate.commit();

    let totalPages = 0;
    jobsSnapshot.forEach((doc) => { totalPages += doc.data().pageCount; });

    const amount = Number((totalPages * 2.3).toFixed(2));
    const orderId = "order_" + Date.now();

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

    await db.collection("orders").add({
      orderId,
      userId,
      amount,
      totalPages,
      totalDocs: jobsSnapshot.size,
      status: "CREATED",
      createdAt: new Date(),
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

      const orders = await db.collection("orders").where("orderId", "==", orderId).get();
      const orderBatch = db.batch();
      orders.forEach((doc) => orderBatch.update(doc.ref, { status: "PAID" }));
      await orderBatch.commit();

      const jobs = await db
        .collection("print_jobs")
        .where("userId", "==", userId)
        .where("status", "==", "pending")
        .get();
      const jobsBatch = db.batch();
      jobs.forEach((doc) => jobsBatch.update(doc.ref, { status: "paid" }));
      await jobsBatch.commit();
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

    // 🔥 fetch user
    let userName = "User";

    if (userId) {
      const userSnap = await db
        .collection("users")
        .where("id", "==", userId)
        .limit(1)
        .get();

      if (!userSnap.empty) {
        userName = userSnap.docs[0].data().username;
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

      validDocs.push({
        id: doc.id,
        file: data.fileName, // ✅ FIX (you used wrong key before)
        copies: data.copies || 1,
        url: data.fileUrl,
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


// ================= PRINT HISTORY =================
app.get("/print-history", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const snapshot = await db
      .collection("print_jobs")
      .where("userId", "==", userId)
      .get();

    const history = snapshot.docs.map((doc) => {
      const data = doc.data();
      const opts = data.printOptions || {};
      
      let details = `${data.pageCount || 0} pages • ${opts.colorMode === 'bw' ? 'B&W' : 'Color'}`;
      if (opts.doubleSided === 'double') details += ' • 2-Sided';
      else details += ' • 1-Sided';

      let printerStatus = data.printerStatus || "Pending";
      if (!data.printerStatus) {
        if (data.status === "pending") printerStatus = "Pending Payment";
        else if (data.status === "paid") printerStatus = "Ready to Print";
        else if (data.status === "completed") printerStatus = "Completed";
        else if (data.status === "expired") printerStatus = "Expired";
      }

      return {
        id: doc.id,
        file: data.fileName,
        details,
        copies: opts.copies || 1,
        cost: `₹${((data.pageCount || 0) * (opts.copies || 1) * 2.3).toFixed(2)}`,
        status: data.status,
        printerStatus,
        printCode: data.printCode || "-",
        date: data.createdAt
          ? new Date(data.createdAt.toDate()).toLocaleString()
          : "N/A",
      };
    });

    res.json(history);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to fetch history");
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


// Test route
app.get("/download/:id", async (req, res) => {
  try {
    const docId = req.params.id;

    const docSnap = await db.collection("print_jobs").doc(docId).get();

    if (!docSnap.exists) {
      return res.status(404).send("File not found");
    }

    const data = docSnap.data();

    // 🔥 EXTRACT FILE PATH FROM URL
    const filePath = data.fileUrl.split(`${bucket.name}/`)[1];

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${data.fileName}"`
    );
    res.setHeader("Content-Type", "application/pdf");

    // 🚀 CHECK CACHE FIRST
    const cached = pdfCache.get(docId);
    if (cached) {
      console.log(`⚡ CACHE HIT for ${docId}`);
      return res.send(cached.buffer);
    }

    // 🔥 STREAM FALLBACK
    console.log(`⬇️ STREAMING from Firebase: ${docId}`);
    const file = bucket.file(filePath);
    file.createReadStream()
      .on('error', (err) => {
        console.error("❌ STREAM ERROR:", err);
        if (!res.headersSent) res.status(500).send("Stream failed");
      })
      .pipe(res);

  } catch (err) {
    console.error("❌ DOWNLOAD ERROR:", err);
    res.status(500).send("Download failed");
  }
});
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

// ================= START =================
// Start the server when run directly. This ensures Docker/production runs the app.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`?? Server running on port ${PORT}`);
  });
}

module.exports = app;
