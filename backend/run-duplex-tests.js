/**
 * MIMO PRINT SYSTEM — DUPLEX E2E TEST PRINT FOR BOTH MONOCHROME PRINTERS
 * Programmatically generates a 2-page PDF and prints it in duplex mode on:
 * 1. SV-002 (MIMO 2.0 B&W Brother HL-L2440DW)
 * 2. CV-001 (MIMO 1.0 B&W Brother HL-L5210DN)
 */
const axios = require("axios");

const API_URL = "https://p01--mimo-backend--4b94y9s4jyc5.code.run";

function generate2PagePDF(title, subtitle) {
  const stream1 = `BT\n/F1 24 Tf\n100 700 Td\n(${title}) Tj\n/F1 14 Tf\n100 650 Td\n(${subtitle} - PAGE 1) Tj\n/F1 12 Tf\n100 600 Td\n(Date: ${new Date().toLocaleString("en-IN")}) Tj\nET`;
  const stream2 = `BT\n/F1 24 Tf\n100 700 Td\n(${title}) Tj\n/F1 14 Tf\n100 650 Td\n(${subtitle} - PAGE 2 - BACKSIDE) Tj\n/F1 12 Tf\n100 600 Td\n(Date: ${new Date().toLocaleString("en-IN")}) Tj\nET`;
  
  const len1 = Buffer.byteLength(stream1);
  const len2 = Buffer.byteLength(stream2);
  
  let pdf = "%PDF-1.4\n";
  pdf += "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  pdf += "2 0 obj\n<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>\nendobj\n";
  pdf += "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]\n   /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font\n   /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>\nendobj\n";
  pdf += `4 0 obj\n<< /Length ${len1} >>\nstream\n${stream1}\nendstream\nendobj\n`;
  pdf += "5 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]\n   /Contents 6 0 R /Resources << /Font << /F1 << /Type /Font\n   /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>\nendobj\n";
  pdf += `6 0 obj\n<< /Length ${len2} >>\nstream\n${stream2}\nendstream\nendobj\n`;
  pdf += "xref\n0 7\n0000000000 65535 f \ntrailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n150\n%%EOF";
  
  return Buffer.from(pdf);
}

async function runDuplexTests() {
  console.log("=".repeat(80));
  console.log("  MIMO E2E DUPLEX DIAGNOSTIC TEST PRINT PROGRAM (2 PAGES)");
  console.log("=".repeat(80));
  console.log(`  Target Backend: ${API_URL}`);
  console.log("=".repeat(80));

  // ─── STEP 1: REGISTER / LOGIN ───
  console.log("\n🔑 STEP 1: Creating a test user session...");
  const email = `test_duplex_${Date.now()}@mimo.com`;
  let token;
  try {
    const res = await axios.post(`${API_URL}/register`, {
      username: "Duplex Test Runner",
      password: "Test@1234",
      email,
      mobileNumber: "9999999999"
    });
    token = res.data.jwtToken;
    console.log(`   ✅ User Registered: ${email}`);
  } catch (e) {
    console.error("   ❌ Registration failed:", e.response?.data || e.message);
    return;
  }

  const authHeader = { Authorization: `Bearer ${token}` };

  const testCases = [
    {
      kioskId: "SV-002",
      colorMode: "bw",
      title: "MIMO 2.0 DUPLEX B&W TEST",
      subtitle: "Brother_HL_L2440DW_series",
      fileName: "duplex_sv002_bw.pdf"
    },
    {
      kioskId: "CV-001",
      colorMode: "bw",
      title: "MIMO 1.0 DUPLEX B&W TEST",
      subtitle: "Brother_HL_L5210DN_series_USB",
      fileName: "duplex_cv001_bw.pdf"
    }
  ];

  for (const tc of testCases) {
    console.log("\n" + "-".repeat(50));
    console.log(`▶️  Executing Duplex Test Case: ${tc.title}`);
    console.log(`   Kiosk: ${tc.kioskId} | Mode: ${tc.colorMode} | ${tc.subtitle}`);
    console.log("-".repeat(50));

    try {
      // 1. Generate Custom 2-Page PDF Buffer
      const pdfBuffer = generate2PagePDF(tc.title, tc.subtitle);
      const fileSize = pdfBuffer.length;
      const pageCount = 2; // <-- 2 PAGES FOR DUPLEX

      // 2. Request Signed URL
      console.log("   [1/6] Requesting signed GCS URL...");
      const urlRes = await axios.post(`${API_URL}/generate-upload-urls`, {
        files: [{ name: tc.fileName, type: "application/pdf", size: fileSize, pageCount }]
      }, { headers: authHeader });
      const signedUrlData = urlRes.data.urls[0];

      // 3. Upload to Google Cloud Storage
      console.log("   [2/6] Uploading PDF to GCS...");
      await axios.put(signedUrlData.signedUrl, pdfBuffer, {
        headers: { "Content-Type": "application/pdf" }
      });

      // 4. Finalize Upload
      console.log("   [3/6] Finalizing upload (creating Firestore job)...");
      await axios.post(`${API_URL}/finalize-upload`, {
        files: [{ ...signedUrlData, pageCount }]
      }, { headers: authHeader });

      // 5. Create Order to apply duplex printOptions to Firestore job
      console.log("   [4/6] Creating order with doubleSided: 'double' option...");
      const printOptions = {
        copies: 1,
        colorMode: tc.colorMode,
        layout: "single",
        doubleSided: "double", // <-- ENABLES DUPLEX
        duplexMode: "duplex",
        totalPages: pageCount,
        totalCost: 1 * 2.3, // 2 pages duplex = 1 sheet = ₹2.30
        finalCost: 0,
        couponCode: "ASDFG",
        isBlankSheet: false
      };

      await axios.post(`${API_URL}/create-order`, {
        printOptions,
        couponCode: "ASDFG"
      }, { headers: authHeader });

      // 6. Complete Order
      console.log("   [5/6] Completing order using payment success webhook simulation...");
      const payRes = await axios.post(`${API_URL}/payment-success`, {
        printOptions,
        isFreeBypass: true
      }, { headers: authHeader });
      const printCode = payRes.data.printCode;
      console.log(`   ✅ Print Code Generated: [ ${printCode} ]`);

      // 7. Submit Print Code to Kiosk
      console.log(`   [6/6] Submitting code [${printCode}] to Kiosk [${tc.kioskId}]...`);
      const kioskRes = await axios.post(`${API_URL}/kiosk/print`, {
        printCode,
        kioskId: tc.kioskId
      });

      if (kioskRes.data.success === true) {
        console.log(`   🎉 SUCCESS: Duplex job successfully queued for printing!`);
      } else {
        console.warn(`   ⚠️ Warning: Kiosk print endpoint returned partial response:`, kioskRes.data);
      }
    } catch (error) {
      console.error(`   ❌ Failed to execute test print for ${tc.title}:`);
      console.error(error.response?.data || error.message);
    }

    // Brief delay to ensure database operations order
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log("\n" + "=".repeat(80));
  console.log("  ALL DUPLEX TEST PRINTS SUBMITTED");
  console.log("=".repeat(80));
}

runDuplexTests();
