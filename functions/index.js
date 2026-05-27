const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const { OAuth2Client } = require("google-auth-library");
const crypto = require("crypto");

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
    const { selectedFiles, printOptions } = req.body;
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

    const amount = Number(totalAmount.toFixed(2));

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
    const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);

    const batch = db.batch();
    jobsToUpdate.forEach((doc) => {
      batch.update(doc.ref, {
        status: "paid",
        paymentTime: admin.firestore.FieldValue.serverTimestamp(),
        printCode,
        codeCreatedAt: now,
        codeExpiresAt: expiresAt,
        isPrinted: false,
      });
    });
    await batch.commit();

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
      printCode: data.printCode,
      expiresAt: data.codeExpiresAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch print code" });
  }
});

exports.api = onRequest({ cors: true, maxInstances: 10 }, app);
