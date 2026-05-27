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

// Middleware
const authMiddleware = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) return res.status(401).json({ error: "Access Denied" });
  try {
    const verified = jwt.verify(token.replace("Bearer ", ""), SECRET_KEY);
    req.user = verified;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid Token" });
  }
};

// ================= NEW FINAL UPLOAD (Serverless) =================
app.post("/finalize-upload", authMiddleware, async (req, res) => {
  try {
    const { files } = req.body;
    if (!files || files.length === 0) return res.status(400).json({ error: "No files provided" });

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
      // Ensure Cashfree minimum transaction amount of 1 INR
      if (amount < 1.00) amount = 1.00;
    }

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
          return_url: `https://mimo-test-dep2.vercel.app/payment-verify?order_id={order_id}`
        },
      },
      { headers: cashfreeHeaders, timeout: 10000 }
    );

    const paymentTxnRef = db.collection("payment_transactions").doc();
    await paymentTxnRef.set({
      transactionId: paymentTxnRef.id,
      userId,
      orderId,
      merchantTransactionId: orderId,
      paymentGateway: "cashfree",
      cashfreeSessionId: response.data.payment_session_id,
      orderDetails: { description: `Print order ${orderId}`, amount, currency: "INR" },
      transactionStatus: { status: "pending", gatewayStatus: "initiated" },
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection("orders").add({
      orderId,
      userId,
      amount,
      totalPages,
      totalDocs: jobsSnapshot.size,
      status: "CREATED",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      paymentTransactionId: paymentTxnRef.id,
      jobIds,
      orderStatus: "created"
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

// ================= CASHFREE WEBHOOK =================
app.post("/cashfree-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const rawBody = req.body.toString("utf8");
    const receivedSignature = req.headers["x-webhook-signature"];
    const timestamp = req.headers["x-webhook-timestamp"];

    if (receivedSignature && timestamp) {
      const expectedSignature = crypto
        .createHmac("sha256", cashfreeHeaders["x-client-secret"])
        .update(timestamp + rawBody)
        .digest("base64");
      if (receivedSignature !== expectedSignature) {
        return res.status(403).send("Invalid signature");
      }
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
    for (const doc of snapshot.docs) {
      const data = doc.data();

      if (data.isPrinted) {
        results.push({ file: data.fileName, status: "already_printed" });
        continue;
      }

      // Instead of an HTTP call, just change status. The Pi's WebSocket Listener will do the rest!
      await doc.ref.update({
        status: "printing",
        printerStatus: "Sending to Pi...",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      results.push({ file: data.fileName, status: "sent_to_pi_listener" });
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
    let anyFailed = false;
    let anyPrinting = false;

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.status === "failed") anyFailed = true;
      if (data.status === "printing") anyPrinting = true;
      if (!["completed", "printed"].includes(data.status) && data.isPrinted !== true) {
        allCompleted = false;
      }
    });

    if (anyFailed) return res.json({ status: "failed", isPrinted: false });
    if (allCompleted) return res.json({ status: "completed", isPrinted: true });
    if (anyPrinting) return res.json({ status: "printing", isPrinted: false });

    return res.json({ status: "paid", isPrinted: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Status check failed" });
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
  if (email === "visionprintt@gmail.com" && password === "Vishal@2006") {
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
