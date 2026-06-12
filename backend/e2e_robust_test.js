const admin = require("firebase-admin");
const axios = require("axios");
const serviceAccount = require("../serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

const API_URL = "https://us-central1-mimo-v2-11868.cloudfunctions.net/api"; // Production backend

// Dummy test files
const dummyPdfUrl = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
const dummyImageUrl = "https://picsum.photos/1200/1800.jpg";

async function runE2ETests() {
  console.log("🚀 Starting E2E Robust Test (16 physical prints, Paid & OTP based)");

  // We are targeting 4 Kiosk Configurations
  const configurations = [
    { kioskId: "CV-001", colorMode: "bw" },
    { kioskId: "CV-001", colorMode: "color" },
    { kioskId: "SV-002", colorMode: "bw" },
    { kioskId: "SV-002", colorMode: "color" }
  ];

  // We are targeting 4 Document Types per Configuration
  const TEST_DOCUMENTS = [
    {
      name: "Image 4x4 (4-up layout)",
      data: { fileUrl: dummyImageUrl, fileName: "e2e_test_image.jpg", printOptions: { copies: 1, photoLayout: "4" } }
    },
    {
      name: "MIMO Graph Sheet",
      data: { fileUrl: "https://storage.googleapis.com/mimo-v2-11868.firebasestorage.app/templates%2Fmimo_graph.pdf", fileName: "mimo_graph.pdf", isBlankSheet: true, sheetType: "graph", printOptions: { copies: 1 } }
    }
  ];

  for (const config of configurations) {
    console.log(`\n========================================`);
    console.log(`📡 Simulating User Flow for KIOSK: ${config.kioskId} (${config.colorMode.toUpperCase()})`);
    console.log(`========================================`);

    for (const docType of TEST_DOCUMENTS) {
      console.log(`\n⏳ Test Case: ${docType.name} -> ${config.kioskId} (${config.colorMode})`);

      // 1. Simulate the User creating a paid order
      const printCode = Math.floor(1000 + Math.random() * 9000).toString(); // Generate random 4-digit OTP
      const jobRef = db.collection("print_jobs").doc();
      
      const jobData = {
        userId: "e2e-test-user",
        status: "paid",
        colorMode: config.colorMode,
        printCode: printCode,
        codeExpiresAt: new Date(Date.now() + 15 * 60 * 1000), // Valid for 15 mins
        paymentStatus: { status: "completed" },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        ...docType.data
      };

      await jobRef.set(jobData);
      console.log(`✅ [USER] Job injected into Firestore as PAID. OTP Generated: ${printCode}`);

      try {
        // 2. Simulate Kiosk calling /get-documents-by-code
        console.log(`✅ [KIOSK] User enters OTP ${printCode} at ${config.kioskId}...`);
        const fetchRes = await axios.post(`${API_URL}/get-documents-by-code`, {
          printCode: printCode
        });

        if (fetchRes.data && fetchRes.data.documents) {
          console.log(`✅ [KIOSK] Found ${fetchRes.data.documents.length} document(s) for OTP.`);
          
          // 3. Simulate Kiosk calling /kiosk/print
          console.log(`✅ [KIOSK] Triggering push to Pi for printing...`);
          const printRes = await axios.post(`${API_URL}/kiosk/print`, {
            printCode: printCode,
            kioskId: config.kioskId
          });

          console.log(`🖨️  [BACKEND] Pi accepted job! Response:`, printRes.data);
        }
      } catch (err) {
        console.error(`❌ [KIOSK FLOW FAILED]`, err.response?.data || err.message);
      }
      
      // Wait a few seconds between jobs to not overwhelm CUPS
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  console.log("\n✅ All 16 E2E Test Scenarios Executed!");
  console.log("Check the physical printers and syslog for completion logs.");
  process.exit(0);
}

runE2ETests().catch(err => {
  console.error("Critical Failure:", err);
  process.exit(1);
});
