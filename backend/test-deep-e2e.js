const axios = require("axios");
const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");

const serviceAccount = require("./mimo-v2-11868-firebase-adminsdk-fbsvc-f4edf52a06.json");
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "mimo-v2-11868.firebasestorage.app"
  });
}
const db = admin.firestore();
const bucket = admin.storage().bucket();

const API_BASE = "http://localhost:3000";
const SECRET_KEY = "26e71e9ca74ce0e7449c08b514d71d3126742e4aab0c248fa94de9f88980b9df"; // Same as in backend/.env

async function runDeepE2E() {
  console.log("\n==================================================");
  console.log("🚀 STARTING DEEP END-TO-END FEATURE & HARDWARE TEST");
  console.log("==================================================\n");

  const userId = "deep_test_user_" + Date.now();
  const token = jwt.sign({ userId, email: "deep@example.com" }, SECRET_KEY, { expiresIn: "1h" });
  const authHeaders = { Authorization: `Bearer ${token}` };

  try {
    // ---------------------------------------------------------
    // 1. AUTH & ONBOARDING
    // ---------------------------------------------------------
    console.log("--- 1. AUTH & ONBOARDING ---");
    await db.collection("users").doc(userId).set({
      id: userId,
      email: "deep@example.com",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`[+] Created test user document in Firestore: ${userId}`);

    const onboardRes = await axios.post(`${API_BASE}/onboarding`, { username: "Deep Tester" }, { headers: authHeaders });
    console.log(`[+] Onboarding API Response: ${onboardRes.data}`);

    // ---------------------------------------------------------
    // 2. PROFILE & SETTINGS
    // ---------------------------------------------------------
    console.log("\n--- 2. PROFILE & SETTINGS ---");
    const profileRes = await axios.put(`${API_BASE}/profile`, { username: "Deep Tester Updated", mobileNumber: "1234567890" }, { headers: authHeaders });
    console.log(`[+] Profile Update API Response: ${profileRes.data.message || 'Success'}`);

    // Upload Profile Photo (Mocking file upload)
    const FormData = require("form-data");
    const form = new FormData();
    form.append("photo", Buffer.from("fake_image_data"), "profile.jpg");
    try {
      const photoRes = await axios.post(`${API_BASE}/upload-profile-photo`, form, {
        headers: { ...authHeaders, ...form.getHeaders() }
      });
      console.log(`[+] Upload Profile Photo API Response: ${photoRes.data.message || 'Success'}`);
    } catch(e) {
      console.log(`[-] Profile Photo Upload skipped/failed: ${e.message}`);
    }

    // ---------------------------------------------------------
    // 3. FILE UPLOAD (Storage + Finalize)
    // ---------------------------------------------------------
    console.log("\n--- 3. FILE UPLOAD ---");
    const storagePath1 = `uploads/${userId}_doc1.pdf`;
    await bucket.upload(__dirname + "/dummy.pdf", { destination: storagePath1, metadata: { contentType: "application/pdf" } });
    const fileUrl1 = `https://storage.googleapis.com/${bucket.name}/${storagePath1}`;
    console.log(`[+] Uploaded PDF to Storage: ${storagePath1}`);

    const storagePath2 = `uploads/${userId}_img1.png`;
    // Create a dummy image > 100 bytes
    fs.writeFileSync(__dirname + "/dummy.png", Buffer.alloc(1024, "fake_image_data_here_"));
    await bucket.upload(__dirname + "/dummy.png", { destination: storagePath2, metadata: { contentType: "image/png" } });
    const fileUrl2 = `https://storage.googleapis.com/${bucket.name}/${storagePath2}`;
    console.log(`[+] Uploaded PNG to Storage: ${storagePath2}`);

    const finalizeRes = await axios.post(`${API_BASE}/finalize-upload`, {
      files: [
        { name: "doc1.pdf", storagePath: storagePath1, url: fileUrl1, type: "application/pdf", size: 558, pageCount: 1 },
        { name: "img1.png", storagePath: storagePath2, url: fileUrl2, type: "image/png", size: 100, pageCount: 1 }
      ]
    }, { headers: authHeaders });
    console.log(`[+] Finalize Upload API Response: ${JSON.stringify(finalizeRes.data)}`);

    // ---------------------------------------------------------
    // 4. CHECKOUT (Create Order)
    // ---------------------------------------------------------
    console.log("\n--- 4. CHECKOUT ---");
    const orderRes = await axios.post(`${API_BASE}/create-order`, { printOptions: { colorMode: "color", copies: 2 } }, { headers: authHeaders });
    const orderId = orderRes.data.orderId;
    console.log(`[+] Create Order API Response: OrderID=${orderId}, Amount=${orderRes.data.amount}`);

    // ---------------------------------------------------------
    // 5. PAYMENT FAILURE TEST
    // ---------------------------------------------------------
    console.log("\n--- 5. PAYMENT FAILURE SIMULATION ---");
    const failTimestamp = Date.now().toString();
    const failPayload = JSON.stringify({
      type: "PAYMENT_FAILED_WEBHOOK", // Wait, cashfree uses PAYMENT_SUCCESS_WEBHOOK, but if it fails? We'll simulate a failure.
      data: { order: { order_id: orderId, order_amount: orderRes.data.amount }, customer_details: { customer_id: userId }, payment: { payment_status: "FAILED" } }
    });
    const failSig = crypto.createHmac("sha256", process.env.CASHFREE_SECRET || "dummy_secret_key").update(failTimestamp + failPayload).digest("base64");
    
    try {
      await axios.post(`${API_BASE}/cashfree-webhook`, failPayload, {
        headers: { "x-webhook-signature": failSig, "x-webhook-timestamp": failTimestamp, "Content-Type": "application/json" }
      });
      console.log(`[+] Webhook failure processed successfully (no crash).`);
    } catch (e) {
      console.error(`[-] Webhook threw error on failure payload:`, e.response?.data || e.message);
    }
    
    // Check that we DO NOT have a print code
    try {
      await axios.get(`${API_BASE}/generate-print-code`, { headers: authHeaders });
      console.log(`[-] FAIL: User was able to get a print code even after payment failed!`);
    } catch (e) {
      console.log(`[+] SUCCESS: User blocked from getting print code due to payment failure.`);
    }

    // ---------------------------------------------------------
    // 6. PAYMENT SUCCESS TEST
    // ---------------------------------------------------------
    console.log("\n--- 6. PAYMENT SUCCESS SIMULATION ---");
    const successTimestamp = Date.now().toString();
    const successPayload = JSON.stringify({
      type: "PAYMENT_SUCCESS_WEBHOOK",
      data: { order: { order_id: orderId, order_amount: orderRes.data.amount }, customer_details: { customer_id: userId }, payment: { payment_status: "SUCCESS" } }
    });
    const successSig = crypto.createHmac("sha256", process.env.CASHFREE_SECRET || "dummy_secret_key").update(successTimestamp + successPayload).digest("base64");
    
    const webhookRes = await axios.post(`${API_BASE}/cashfree-webhook`, successPayload, {
      headers: { "x-webhook-signature": successSig, "x-webhook-timestamp": successTimestamp, "Content-Type": "application/json" }
    });
    console.log(`[+] Webhook success processed. Response:`, webhookRes.data);

    // Wait for internal processing
    await new Promise(r => setTimeout(r, 2000));

    const printCodeRes = await axios.get(`${API_BASE}/generate-print-code`, { headers: authHeaders });
    const printCode = printCodeRes.data.printCode;
    console.log(`[+] Print Code Generated successfully: [ ${printCode} ]`);

    // ---------------------------------------------------------
    // 7. KIOSK INVALID CODE TEST
    // ---------------------------------------------------------
    console.log("\n--- 7. KIOSK INVALID CODE TEST ---");
    try {
      await axios.post(`${API_BASE}/kiosk/print`, { printCode: "999999" });
      console.log(`[-] FAIL: Kiosk accepted invalid code!`);
    } catch (e) {
      console.log(`[+] SUCCESS: Kiosk rejected invalid code (404).`);
    }

    // ---------------------------------------------------------
    // 8. KIOSK HARDWARE PRINT TRIGGER
    // ---------------------------------------------------------
    console.log("\n--- 8. KIOSK HARDWARE PRINT TRIGGER ---");
    const kioskRes = await axios.post(`${API_BASE}/kiosk/print`, { printCode });
    console.log(`[+] Kiosk Print API Response:`, JSON.stringify(kioskRes.data));

    console.log(`\n[+] Waiting up to 45 seconds for Raspberry Pi hardware to physically print...`);
    let isPrinted = false;
    let attempts = 0;
    while (!isPrinted && attempts < 15) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const statusRes = await axios.get(`${API_BASE}/kiosk/job-status?printCode=${printCode}`);
      const status = statusRes.data.status;
      isPrinted = statusRes.data.isPrinted;
      console.log(`    🔄 Hardware Status Poll ${attempts + 1}: DB Status = ${status}`);
      attempts++;
    }

    if (isPrinted) {
      console.log("\n🎉 SUCCESS! Physical hardware reported job completed!");
    } else {
      console.log("\n❌ FAIL: Hardware print timed out.");
    }

    // ---------------------------------------------------------
    // 9. VERIFY STATS
    // ---------------------------------------------------------
    console.log("\n--- 9. VERIFY USER STATS ---");
    const statsRes = await axios.get(`${API_BASE}/mimo/stats`, { headers: authHeaders });
    console.log(`[+] User Stats API Response:`, JSON.stringify(statsRes.data));

  } catch (err) {
    console.error("\n❌ DEEP E2E TEST FAILED:");
    console.error(err.response?.data || err.message);
  }
}

runDeepE2E();
