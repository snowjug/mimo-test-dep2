const axios = require("axios");

const API_URL = "https://p01--mimo-backend--4b94y9s4jyc5.code.run";

async function runTest() {
  console.log("🚀 Starting End-to-End Smoke Test...");

  // 1. Register User
  const email = `smoke_${Date.now()}@mimo.com`;
  console.log(`👤 Registering test user: ${email}`);
  let token;
  try {
    const regRes = await axios.post(`${API_URL}/register`, {
      username: "Smoke Tester",
      password: "password123",
      email: email,
      mobileNumber: "1234567890"
    });
    token = regRes.data.jwtToken;
    console.log("✅ User registered. Token acquired.");
  } catch (e) {
    console.error("❌ Registration failed:", e.response?.data || e.message);
    return;
  }

  // 2. Generate a valid minimal PDF
  const pdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT\n/F1 12 Tf\n10 50 Td\n(Smoke Test!) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000266 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n361\n%%EOF");

  const fileName = `smoke_test_${Date.now()}.pdf`;
  const filesMeta = [{
    name: fileName,
    type: "application/pdf",
    size: pdfBuffer.length,
    pageCount: 1   // ✅ CRITICAL: tell backend it's 1 page so it goes to "pending" not "pending_conversion"
  }];

  // 3. Request Signed URLs
  console.log(`\n🔗 Requesting Signed URLs...`);
  let urls;
  try {
    const urlRes = await axios.post(`${API_URL}/generate-upload-urls`, { files: filesMeta }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    urls = urlRes.data.urls;
    console.log(`✅ Received Signed URL`);
  } catch (e) {
    console.error("❌ /generate-upload-urls failed:", e.response?.data || e.message);
    return;
  }

  // 4. Upload directly to GCS
  console.log(`\n☁️ Uploading test PDF directly to Google Cloud Storage...`);
  try {
    await axios.put(urls[0].signedUrl, pdfBuffer, {
      headers: { "Content-Type": urls[0].type }
    });
    console.log(`✅ Uploaded successfully!`);
  } catch (e) {
    console.error("❌ GCS Upload failed:", e.message);
    return;
  }

  // 5. Finalize Upload — pass pageCount so it goes to "pending" not "pending_conversion"
  console.log(`\n✅ Finalizing upload with backend...`);
  try {
    const filesWithPageCount = urls.map(u => ({ ...u, pageCount: 1 }));
    await axios.post(`${API_URL}/finalize-upload`, { files: filesWithPageCount }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`✅ Finalize completed`);
  } catch (e) {
    console.error("❌ /finalize-upload failed:", e.response?.data || e.message);
    return;
  }

  // 6. Call /payment-success (simulate 100% discount / ASDFG code)
  console.log(`\n💳 Simulating successful payment (like ASDFG)...`);
  let printCode;
  try {
    const paymentRes = await axios.post(`${API_URL}/payment-success`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    printCode = paymentRes.data.printCode;
    console.log(`✅ Payment success! Got 4-digit code: ${printCode}`);
  } catch (e) {
    console.error("❌ /payment-success failed:", e.response?.data || e.message);
    return;
  }

  // 7. Call /kiosk/print (simulate user typing the code on iPad)
  console.log(`\n📱 Simulating user typing code [${printCode}] on iPad kiosk...`);
  try {
    const printRes = await axios.post(`${API_URL}/kiosk/print`, { printCode, kioskId: "KIOSK_1" });
    const result = printRes.data;
    console.log(`✅ Kiosk print triggered! Backend response:`);
    console.log(JSON.stringify(result, null, 2));

    if (result.success === true) {
      console.log(`\n🎉 SUCCESS! The Raspberry Pi is printing the test page RIGHT NOW!`);
    } else if (result.results && result.results.every(r => r.status === "already_printed")) {
      console.log(`\n⚠️ Job was already printed. Flow is correct!`);
    } else {
      const errors = result.results?.filter(r => r.status === "failed") || [];
      console.log(`\n⚠️ Print triggered but Pi reported failure:`);
      errors.forEach(e => console.log(`  - ${e.file}: ${e.error}`));
    }
  } catch (e) {
    console.error("❌ /kiosk/print failed:", e.response?.data || e.message);
    
    // DEBUG: Check job status in Firestore
    console.log(`\n🔍 Fetching print jobs from server to see why it failed...`);
    try {
      const historyRes = await axios.get(`${API_URL}/print-history`, { headers: { Authorization: `Bearer ${token}` } });
      console.log("History of jobs:");
      console.log(JSON.stringify(historyRes.data, null, 2));
    } catch (err) {
      console.error("Failed to fetch history:", err.message);
    }
  }
}

runTest();
