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

// ================= APP =================
const app = express();

// 1. MUST BE FIRST: CORS
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_LOCAL,
  "http://localhost:3000"
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
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
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ================= CASHFREE =================
const CASHFREE_BASE_URL = "https://sandbox.cashfree.com/pg";
const cashfreeHeaders = {
  "Content-Type": "application/json",
  "x-client-id": process.env.CASHFREE_APP_ID,
  "x-client-secret": process.env.CASHFREE_SECRET_KEY,
  "x-api-version": "2025-01-01",
};

// ================= AUTH MIDDLEWARE =================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];

  if (!token) {
    console.error("❌ No token. Authorization header:", authHeader);
    return res.status(401).send("Token missing");
  }

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) {
      console.error("❌ JWT verify error:", err.message);
      return res.status(403).send("Invalid token");
    }

    // DEBUG — shows what is inside your token so we can diagnose issues
    console.log("🔍 Decoded token payload:", JSON.stringify(decoded));

    // Supports { userId }, { id }, or { user: { id } } shaped tokens
    const userId = decoded.userId || decoded.id || decoded.user?.id;

    if (!userId) {
      console.error("❌ No userId found in token. Payload:", JSON.stringify(decoded));
      return res.status(403).send("Invalid token payload");
    }

    req.user = { ...decoded, userId };
    next();
  });
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
    if (!existing.empty) {
      return res.status(400).send("User already exists");
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const userRef = await db.collection("users").add({
      id: uuidv4(),
      username,
      password: hashedPassword,
      email,
      mobileNumber,
      googleUser: false,
    });
    const userId = userRef.id;
    const token = jwt.sign({ userId }, SECRET_KEY, { expiresIn: "7d" });
    console.log(`✅ Registered new user: ${email}, userId: ${userId}`);
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
    const valid = await bcrypt.compare(password, user.password);
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
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload.email;
    const name = payload.name;
    const snapshot = await db.collection("users").where("email", "==", email).get();
    let userId;
    if (snapshot.empty) {
      userId = uuidv4();
      await db.collection("users").add({
        id: userId,
        username: name,
        email,
        password: null,
        mobileNumber: "",
        googleUser: true,
      });
    } else {
      const doc = snapshot.docs[0];
      // Fall back to Firestore doc ID if custom id field is missing
      userId = doc.data().id || doc.id;
    }
    if (!userId) return res.status(500).send("User ID missing in database");
    const jwtToken = jwt.sign({ userId }, SECRET_KEY);
    res.json({ jwtToken, name, email });
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
    res.json({ name: user.username, email: user.email });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching user");
  }
});

// ================= PROFILE =================
app.get("/profile", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const doc = await db.collection("users").doc(userId).get();
    if (!doc.exists) return res.status(404).send("User not found");
    const user = doc.data();
    res.json({
      username: user.username,
      email: user.email,
      mobileNumber: user.mobileNumber,
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
    const snapshot = await db.collection("users").where("id", "==", userId).get();
    if (snapshot.empty) return res.status(404).send("User not found");
    await snapshot.docs[0].ref.update({ username, mobileNumber });
    res.send("Profile updated");
  } catch (err) {
    console.error(err);
    res.status(500).send("Update failed");
  }
});

// ================= SETTINGS =================
app.post("/settings", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const settings = req.body;
    const snapshot = await db.collection("users").where("id", "==", userId).get();
    if (snapshot.empty) return res.status(404).send("User not found");
    await snapshot.docs[0].ref.update({ settings });
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
    const user = doc.data();
    res.json(user.settings || {});
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to fetch settings");
  }
});

// ================= COINS =================
app.get("/mimo/coins", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const doc = await db.collection("users").doc(userId).get();
    if (!doc.exists) return res.status(404).send("User not found");
    const user = doc.data();
    const coins = user.mimo_coins || { balance: 0, total_earned: 0, total_used: 0 };
    res.json({
      balance: coins.balance,
      totalEarned: coins.total_earned,
      totalUsed: coins.total_used,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching coins" });
  }
});

// ================= PROFILE =================
app.get("/profile", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return res.status(404).send("User not found");
    res.json(userDoc.data());
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching profile");
  }
});

app.put("/profile", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { username, mobileNumber } = req.body;
    await db.collection("users").doc(userId).update({ username, mobileNumber });
    res.json({ message: "Profile updated" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating profile");
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

    res.json({
      message: "Payment success",
      printCode,   // ✅ RETURN TO FRONTEND
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Payment update failed" });
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
      // Only delete jobs that are still 'pending' (unpaid)
      // This protects 'paid', 'printing', and 'completed' jobs from being cleared
      if (data.status === "pending") {
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

    let totalPages = 0;
    for (let file of req.files) {
      console.log(`📄 Processing file: ${file.originalname} (${file.mimetype})`);
      const pages = await getPageCount(file);
      totalPages += pages;
      const fileUrl = await uploadToStorage(file);
      console.log(`Saving print_job for userId: ${userId}, file: ${file.originalname}`);
      await db.collection("print_jobs").add({
        userId,
        fileName: file.originalname,
        fileUrl,
        status: "pending",
        pageCount: pages,
        createdAt: new Date(),
      });
    }

    const amount = Number((totalPages * 2.3).toFixed(2));
    res.json({ totalPages, amount });
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
      { headers: cashfreeHeaders }
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
    const response = await axios.get(
      `${CASHFREE_BASE_URL}/orders/${orderId}`,
      { headers: cashfreeHeaders }
    );
    const { order_status } = response.data;
    
    // Update order status in Firestore
    const orderSnapshot = await db.collection("orders").where("orderId", "==", orderId).get();
    if (!orderSnapshot.empty) {
      await orderSnapshot.docs[0].ref.update({ status: order_status });
    }

    res.json({ order_status });
  } catch (err) {
    console.error(err);
    res.status(500).send("Verification failed");
  }
});

// ================= CASHFREE WEBHOOK =================
app.post("/cashfree-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
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

    const event = JSON.parse(rawBody);

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
app.post("/get-documents-by-code", async (req, res) => {
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

app.post("/mark-printed", async (req, res) => {
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

    const file = bucket.file(filePath);

    // 🔥 DOWNLOAD FROM FIREBASE STORAGE
    const [fileBuffer] = await file.download();

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${data.fileName}"`
    );
    res.setHeader("Content-Type", "application/pdf");

    res.send(fileBuffer);

  } catch (err) {
    console.error("❌ DOWNLOAD ERROR:", err);
    res.status(500).send("Download failed");
  }
});
// ================= START =================
// Start the server when run directly. This ensures Docker/production runs the app.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`?? Server running on port ${PORT}`);
  });
}

module.exports = app;
