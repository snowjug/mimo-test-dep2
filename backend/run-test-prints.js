/**
   * MIMO PRINT SYSTEM — E2E TEST PRINT FOR ALL PRINTERS (WITH CORRECT ROUTING)
   * Routes test prints to both Kiosks (SV-002 and CV-001) in both color modes.
   */
const axios = require("axios");

const API_URL = "https://p01--mimo-backend--4b94y9s4jyc5.code.run";

function generateCustomPDF(title, subtitle) {
  const streamContent = `BT\n/F1 24 Tf\n100 700 Td\n(${title}) Tj\n/F1 14 Tf\n100 650 Td\n(${subtitle}) Tj\n/F1 12 Tf\n100 600 Td\n(Date: ${new Date().toLocaleString("en-IN")}) Tj\nET`;
  const streamLength = Buffer.byteLength(streamContent);
  
  const pdfHeader = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]\n   /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font\n   /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>\nendobj\n4 0 obj\n<< /Length ${streamLength} >>\nstream\n`;
  const pdfFooter = `\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000274 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n445\n%%EOF`;
  
  return Buffer.concat([
    Buffer.from(pdfHeader),
    Buffer.from(streamContent),
    Buffer.from(pdfFooter)
  ]);
}

async function runTestPrints() {
  console.log("=".repeat(80));
  console.log("  MIMO E2E DIAGNOSTIC TEST PRINT PROGRAM");
  console.log("=".repeat(80));
  console.log(`  Target Backend: ${API_URL}`);
  console.log("=".repeat(80));

  // ─── STEP 1: REGISTER / LOGIN ───
  console.log("\n🔑 STEP 1: Creating a test user session...");
  const email = `test_print_${Date.now()}@mimo.com`;
  let token;
  try {
    const res = await axios.post(`${API_URL}/register`, {
      username: "Test Print Runner",
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

  // Define the 4 test cases
  const testCases = [
    {
      kioskId: "SV-002",
      colorMode: "bw",
      title: "TEST PRINT - SV-002 MONOCHROME",
      subtitle: "Target: Brother_HL_L2440DW_series",
      fileName: "test_sv002_bw.pdf"
    },
    {
      kioskId: "SV-002",
      colorMode: "color",
      title: "TEST PRINT - SV-002 COLOR",
      subtitle: "Target: Epson_L3250",
      fileName: "test_sv002_color.pdf"
    },
    {
      kioskId: "CV-001",
      colorMode: "bw",
      title: "TEST PRINT - CV-001 MONOCHROME",
      subtitle: "Target: Brother_HL_L5210DN_series_USB",
      fileName: "test_cv001_bw.pdf"
    },
    {
      kioskId: "CV-001",
      colorMode: "color",
      title: "TEST PRINT - CV-001 COLOR",
      subtitle: "Target: Brother_IPP",
      fileName: "test_cv001_color.pdf"
    }
  ];

  for (const tc of testCases) {
    console.log("\n" + "-".repeat(50));
    console.log(`▶️  Executing Test Case: ${tc.title}`);
    console.log(`   Kiosk: ${tc.kioskId} | Mode: ${tc.colorMode} | ${tc.subtitle}`);
    console.log("-".repeat(50));

    try {
      // 1. Generate Custom PDF Buffer
      const pdfBuffer = generateCustomPDF(tc.title, tc.subtitle);
      const fileSize = pdfBuffer.length;
      const pageCount = 1;

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

      // 5. Create Order to apply printOptions (copies, colorMode) to Firestore job
      console.log("   [4/6] Creating order (saving print options)...");
      const printOptions = {
        copies: 1,
        colorMode: tc.colorMode,
        layout: "single",
        duplexMode: "simplex",
        totalPages: pageCount,
        totalCost: pageCount * (tc.colorMode === "color" ? 10.0 : 2.3),
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
        console.log(`   🎉 SUCCESS: Job successfully queued for printing!`);
      } else {
        console.warn(`   ⚠️ Warning: Kiosk print endpoint returned partial response:`, kioskRes.data);
      }
    } catch (error) {
      console.error(`   ❌ Failed to execute test print for ${tc.title}:`);
      console.error(error.response?.data || error.message);
    }

    // Brief delay to ensure database operations order
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log("\n" + "=".repeat(80));
  console.log("  ALL TEST PRINTS SUBMITTED");
  console.log("=".repeat(80));
}

runTestPrints();
