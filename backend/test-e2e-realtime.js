const axios = require("axios");
const admin = require("firebase-admin");

// Initialize Firebase Admin with the service account
const serviceAccount = require("./mimo-v2-11868-firebase-adminsdk-fbsvc-f4edf52a06.json");
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "mimo-v2-11868.firebasestorage.app"
  });
}
const db = admin.firestore();

const API_BASE = "http://localhost:3000";

async function runE2E() {
  console.log("======================================");
  console.log("🚀 STARTING END-TO-END SERVERLESS TEST");
  console.log("======================================");

  try {
    // 1. Create a dummy user session in the DB directly
    const userId = "test_e2e_user_" + Date.now();
    await db.collection("users").doc(userId).set({
      id: userId,
      email: "test@example.com",
      username: "E2E Test User",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`[1] Created Test User: ${userId}`);

    // Generate a valid JWT token to authenticate to our Cloud Functions
    const jwt = require("jsonwebtoken");
    const SECRET_KEY = "26e71e9ca74ce0e7449c08b514d71d3126742e4aab0c248fa94de9f88980b9df"; // Same as in backend/.env
    const token = jwt.sign({ userId, email: "test@example.com" }, SECRET_KEY, { expiresIn: "1h" });
    const authHeaders = { Authorization: `Bearer ${token}` };

    // 2. Simulate Frontend File Upload (direct to storage)
    console.log(`[2] Uploading dummy.pdf to Firebase Storage...`);
    const bucket = admin.storage().bucket();
    const storagePath = `uploads/${userId}_dummy.pdf`;
    await bucket.upload(__dirname + "/dummy.pdf", {
      destination: storagePath,
      metadata: { contentType: "application/pdf" }
    });
    const fileUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    console.log(`[2b] Calling /finalize-upload to create print job in Firestore...`);
    const finalizeRes = await axios.post(`${API_BASE}/finalize-upload`, {
      files: [{
        name: "e2e_test_document.pdf",
        storagePath: storagePath,
        url: fileUrl,
        type: "application/pdf",
        size: 558,
        pageCount: 1
      }]
    }, { headers: authHeaders });
    console.log(`    ✅ Finalize Upload Response: ${JSON.stringify(finalizeRes.data)}`);

    // 3. Simulate checkout
    console.log(`[3] Calling /create-order...`);
    const orderRes = await axios.post(`${API_BASE}/create-order`, { printOptions: { colorMode: "bw", copies: 1 } }, { headers: authHeaders });
    const orderId = orderRes.data.orderId;
    
    console.log(`[3b] Simulating Webhook for order ${orderId}...`);
    const crypto = require("crypto");
    const timestamp = Date.now().toString();
    const payload = JSON.stringify({
      type: "PAYMENT_SUCCESS_WEBHOOK",
      data: {
        order: { order_id: orderId, order_amount: 2.3 },
        customer_details: { customer_id: userId }
      }
    });
    const signature = crypto.createHmac("sha256", process.env.CASHFREE_SECRET || "dummy_secret_key").update(timestamp + payload).digest("base64");
    
    await axios.post(`${API_BASE}/cashfree-webhook`, payload, {
      headers: { "x-webhook-signature": signature, "x-webhook-timestamp": timestamp, "Content-Type": "application/json" }
    });

    // Wait a second for the internal webhook to process and call /payment-success internally
    await new Promise(r => setTimeout(r, 2000));

    console.log(`[3c] Getting Print Code...`);
    const printCodeRes = await axios.get(`${API_BASE}/generate-print-code`, { headers: authHeaders });
    const printCode = printCodeRes.data.printCode;
    console.log(`    ✅ Print Code Generated: [ ${printCode} ]`);

    // 4. Kiosk Print Trigger
    console.log(`[4] Simulating iPad Kiosk scan for Print Code [ ${printCode} ]`);
    console.log(`    Calling /kiosk/print...`);
    const kioskRes = await axios.post(`${API_BASE}/kiosk/print`, { printCode });
    console.log(`    ✅ Kiosk Response: ${JSON.stringify(kioskRes.data)}`);
    console.log(`    ⚠️  Watch your Raspberry Pi! It should be downloading and printing the file right now via WebSockets!`);

    // 5. Monitor Status via Kiosk Polling endpoint
    console.log(`[5] Monitoring job status... (Waiting for Pi to finish)`);
    let isPrinted = false;
    let attempts = 0;
    while (!isPrinted && attempts < 15) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // wait 2s
      const statusRes = await axios.get(`${API_BASE}/kiosk/job-status?printCode=${printCode}`);
      const status = statusRes.data.status;
      isPrinted = statusRes.data.isPrinted;
      console.log(`    🔄 Check ${attempts + 1}: Status = ${status}, isPrinted = ${isPrinted}`);
      attempts++;
    }

    if (isPrinted) {
      console.log("======================================");
      console.log("🎉 SUCCESS! The End-To-End Serverless Flow works perfectly!");
      console.log("======================================");
    } else {
      console.log("❌ Timed out waiting for Pi to mark job as printed.");
    }

  } catch (err) {
    console.error("❌ E2E TEST FAILED:");
    console.error(err.response?.data || err.message);
  }
}

runE2E();
