/**
 * FULL WEBSITE FLOW TEST — Mimics exactly what printmimo.tech does
 * Flow: Login → Upload File → Apply ASDFG → Get 4-digit Code → Submit to Kiosk
 */
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const API_URL = "https://p01--mimo-backend--4b94y9s4jyc5.code.run";

// Generate a realistic 1-page PDF (like what a user would upload)
function generateTestPDF() {
  return Buffer.from(
    "%PDF-1.4\n" +
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]\n" +
    "   /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font\n" +
    "   /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>\nendobj\n" +
    "4 0 obj\n<< /Length 120 >>\nstream\n" +
    "BT\n/F1 24 Tf\n180 700 Td\n(MIMO PRINT TEST) Tj\n" +
    "/F1 14 Tf\n130 650 Td\n(Full E2E Test — ASDFG Coupon Flow) Tj\n" +
    "/F1 12 Tf\n200 600 Td\n(Date: " + new Date().toLocaleString("en-IN") + ") Tj\n" +
    "ET\nendstream\nendobj\n" +
    "xref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n" +
    "0000000058 00000 n \n0000000115 00000 n \n0000000274 00000 n \n" +
    "trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n445\n%%EOF"
  );
}

async function runFullWebsiteFlow() {
  console.log("=".repeat(60));
  console.log("  MIMO PRINT — FULL WEBSITE FLOW TEST (ASDFG COUPON)");
  console.log("=".repeat(60));
  console.log(`  Backend: ${API_URL}`);
  console.log(`  Time: ${new Date().toLocaleString("en-IN")}`);
  console.log("=".repeat(60));

  // ─── STEP 1: REGISTER / LOGIN ───────────────────────────────
  console.log("\n📱 STEP 1: User Registration (simulating new user on printmimo.tech)");
  const email = `fulltest_${Date.now()}@mimo.com`;
  let token;
  try {
    const res = await axios.post(`${API_URL}/register`, {
      username: "Full Test User",
      password: "Test@1234",
      email,
      mobileNumber: "9876543210"
    });
    token = res.data.jwtToken;
    console.log(`   ✅ Registered: ${email}`);
    console.log(`   ✅ JWT Token acquired`);
  } catch (e) {
    console.error("   ❌ Registration failed:", e.response?.data || e.message);
    return;
  }

  const authHeader = { Authorization: `Bearer ${token}` };

  // ─── STEP 2: GENERATE FILE & REQUEST SIGNED URL ─────────────
  console.log("\n📄 STEP 2: Preparing file for upload (mimics file picker on website)");
  const pdfBuffer = generateTestPDF();
  const fileName = `MIMO_Test_${Date.now()}.pdf`;
  const fileSize = pdfBuffer.length;
  const pageCount = 1;

  console.log(`   File: ${fileName} (${fileSize} bytes, ${pageCount} page)`);

  let signedUrlData;
  try {
    const res = await axios.post(`${API_URL}/generate-upload-urls`, {
      files: [{ name: fileName, type: "application/pdf", size: fileSize, pageCount }]
    }, { headers: authHeader });
    signedUrlData = res.data.urls[0];
    console.log(`   ✅ Signed GCS URL obtained`);
    console.log(`   Storage path: ${signedUrlData.storagePath}`);
  } catch (e) {
    console.error("   ❌ /generate-upload-urls failed:", e.response?.data || e.message);
    return;
  }

  // ─── STEP 3: UPLOAD TO GOOGLE CLOUD STORAGE ─────────────────
  console.log("\n☁️  STEP 3: Uploading PDF → Google Cloud Storage");
  try {
    await axios.put(signedUrlData.signedUrl, pdfBuffer, {
      headers: { "Content-Type": "application/pdf" }
    });
    console.log(`   ✅ Upload successful to GCS`);
  } catch (e) {
    console.error("   ❌ GCS upload failed:", e.message);
    return;
  }

  // ─── STEP 4: FINALIZE UPLOAD ─────────────────────────────────
  console.log("\n🔗 STEP 4: Finalizing upload — creating Firestore job (status: pending)");
  try {
    await axios.post(`${API_URL}/finalize-upload`, {
      files: [{ ...signedUrlData, pageCount }]
    }, { headers: authHeader });
    console.log(`   ✅ Firestore print_job created`);
    console.log(`   Status: pending (1 page detected)`);
  } catch (e) {
    console.error("   ❌ /finalize-upload failed:", e.response?.data || e.message);
    return;
  }

  // ─── STEP 5: USER TYPES ASDFG ON PAYMENT PAGE ───────────────
  console.log("\n🎟️  STEP 5: User enters coupon code ASDFG on payment page");
  console.log(`   Coupon: ASDFG → 100% discount → totalAmount = ₹0`);
  console.log(`   Frontend skips Cashfree, calls POST /payment-success directly`);

  // Simulate exact frontend call from payment.tsx line 101:
  // const successResponse = await api.post("/payment-success", { printOptions });
  const printOptions = {
    copies: 1,
    colorMode: "bw",
    layout: "single",
    duplexMode: "simplex",
    totalPages: pageCount,
    totalCost: pageCount * 2.3,
    finalCost: 0, // ASDFG makes it free
    couponCode: "ASDFG",
    isBlankSheet: false
  };

  let printCode;
  try {
    const res = await axios.post(`${API_URL}/payment-success`, { printOptions }, {
      headers: authHeader
    });
    printCode = res.data.printCode;
    console.log(`   ✅ Payment success! Free order confirmed`);
    console.log(`\n${"─".repeat(40)}`);
    console.log(`   🎫 YOUR 4-DIGIT PRINT CODE: [ ${printCode} ]`);
    console.log(`${"─".repeat(40)}`);
    console.log(`   (User would see this on /print-code page and take it to the kiosk iPad)`);
  } catch (e) {
    console.error("   ❌ /payment-success failed:", e.response?.data || e.message);
    return;
  }

  // ─── STEP 6: USER TYPES CODE ON KIOSK iPAD ──────────────────
  console.log(`\n📱 STEP 6: User walks to iPad kiosk and types code [${printCode}]`);
  console.log(`   Kiosk calls POST /kiosk/print → Backend → https://mimoprint.loca.lt/print → Pi → CUPS → Brother printer`);
  console.log(`   Waiting for Pi response...`);

  await new Promise(r => setTimeout(r, 1000)); // brief realistic pause

  try {
    const res = await axios.post(`${API_URL}/kiosk/print`, {
      printCode,
      kioskId: "KIOSK_1"
    });

    const result = res.data;
    console.log(`\n${"=".repeat(60)}`);
    if (result.success === true) {
      const job = result.results[0];
      const piResp = job.piResponse?.[0] || {};
      console.log(`  🎉 SUCCESS — PRINTER IS PRINTING RIGHT NOW!`);
      console.log(`${"=".repeat(60)}`);
      console.log(`  File:     ${job.file}`);
      console.log(`  Status:   ${job.status}`);
      console.log(`  CUPS Job: #${piResp.job_id}`);
      console.log(`  Printer:  ${piResp.printer}`);
      console.log(`  Pages:    ${piResp.pages}`);
      console.log(`${"=".repeat(60)}`);
    } else {
      console.log(`  ⚠️  Partial result:`);
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (e) {
    console.error("\n   ❌ /kiosk/print failed:", e.response?.data || e.message);
    // Debug: check job state
    try {
      const hist = await axios.get(`${API_URL}/print-history`, { headers: authHeader });
      console.log("\n   🔍 Job history:", JSON.stringify(hist.data, null, 2));
    } catch (_) {}
  }
}

runFullWebsiteFlow();
