const axios = require("axios");
const admin = require("firebase-admin");

// Initialize Firebase Admin with the service account
const serviceAccount = require("../serviceAccountKey.json");
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "mimo-v2-11868.firebasestorage.app"
  });
}
const db = admin.firestore();

const API_BASE = "https://api-upqxuj7evq-uc.a.run.app";

async function runE2E() {
  console.log("======================================");
  console.log("🚀 STARTING END-TO-END SERVERLESS TEST");
  console.log("======================================");

  try {
    // 1. Create a dummy user session in the DB directly
    const userId = "test_e2e_user_" + Date.now();
    console.log(`[1] Created Test User: ${userId}`);
    await db.collection("users").doc(userId).set({
      id: userId,
      email: "test@example.com",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Generate a valid JWT token to authenticate to our Cloud Functions
    const jwt = require("jsonwebtoken");
    const SECRET_KEY = "fallback_secret_key_change_me_in_prod"; // Same as in functions/index.js
    const token = jwt.sign({ userId, email: "test@example.com" }, SECRET_KEY, { expiresIn: "1h" });
    const authHeaders = { Authorization: `Bearer ${token}` };

    // 2. Simulate Frontend File Upload (direct to storage)
    console.log(`[2] Dynamically generating valid PDF via pdf-lib...`);
    const { PDFDocument, rgb } = require("pdf-lib");
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.276, 841.89]); // A4 Size in points
    page.drawText("Mimo E2E Smoke Test", { x: 50, y: 700, size: 24, color: rgb(0.03, 0.21, 0.4) });
    page.drawText(`User ID: ${userId}`, { x: 50, y: 650, size: 14 });
    page.drawText(`Timestamp: ${new Date().toISOString()}`, { x: 50, y: 620, size: 14 });
    page.drawText("This is a dynamically generated, corruption-free PDF.", { x: 50, y: 550, size: 12 });
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    console.log(`[2b] Uploading PDF buffer directly to Firebase Storage...`);
    const bucket = admin.storage().bucket();
    const storagePath = `uploads/${userId}_dummy.pdf`;
    const file = bucket.file(storagePath);
    await file.save(pdfBuffer, {
      metadata: { contentType: "application/pdf" }
    });
    const fileUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    console.log(`[2b] Calling /finalize-upload to create print job in Firestore...`);
    const finalizeRes = await axios.post(`${API_BASE}/finalize-upload`, {
      files: [{
        name: "e2e_test_document.pdf",
        url: fileUrl,
        type: "application/pdf",
        size: 558,
        pageCount: 1
      }]
    }, { headers: authHeaders });
    console.log(`    ✅ Finalize Upload Response: ${JSON.stringify(finalizeRes.data)}`);

    // 3. Simulate checkout
    console.log(`[3] Calling /payment-success to generate Print Code...`);
    const paymentRes = await axios.post(`${API_BASE}/payment-success`, {}, { headers: authHeaders });
    const printCode = paymentRes.data.printCode;
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
    while (!isPrinted && attempts < 35) {
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
