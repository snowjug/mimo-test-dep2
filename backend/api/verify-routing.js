const path = require("path");
// Ensure environment variables from backend/.env are loaded regardless of current working directory
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { admin, db } = require("./firebase");
const axios = require("axios");

const API_URL = process.env.API_URL || "http://localhost:3000";

async function testRoutingCase({ description, colorMode, originalSelectedKiosk, inputKioskId, expectedOutcome }) {
  console.log(`\n======================================================`);
  console.log(`🧪 ${description}`);
  console.log(`   Color Mode: ${colorMode} | Selected: ${originalSelectedKiosk} | Entered at: ${inputKioskId}`);
  console.log(`======================================================`);

  const printCode = Math.floor(1000 + Math.random() * 9000).toString();
  const testDocId = `test_routing_${colorMode}_${inputKioskId}_${Date.now()}`;
  const testJobRef = db.collection("print_jobs").doc(testDocId);

  await testJobRef.set({
    userId: "test_verifier",
    fileName: "verify_routing_test.pdf",
    fileUrl: "https://storage.googleapis.com/mimo-v2-11868.firebasestorage.app/templates%2Fblank_a4.pdf",
    mimetype: "application/pdf",
    status: "paid",
    printCode,
    pageCount: 1,
    colorMode,
    printOptions: {
      copies: 1,
      colorMode,
      doubleSided: "single",
      directKioskId: originalSelectedKiosk
    },
    settings: {
      directKioskId: originalSelectedKiosk
    },
    kioskId: originalSelectedKiosk,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  try {
    // 1. Test /get-documents-by-code
    console.log(`   [1] Calling POST ${API_URL}/get-documents-by-code...`);
    let getDocsSuccess = false;
    let getDocsError = null;
    try {
      const getRes = await axios.post(`${API_URL}/get-documents-by-code`, {
        printCode,
        kioskId: inputKioskId
      });
      getDocsSuccess = true;
      console.log(`       -> Status: ${getRes.status} OK (${getRes.data.documents?.length || 0} doc(s) returned)`);
    } catch (err) {
      getDocsError = err.response?.status || err.message;
      console.log(`       -> Status: ${getDocsError} (Error: ${JSON.stringify(err.response?.data?.error || err.message)})`);
    }

    // 2. Test /kiosk/print
    console.log(`   [2] Calling POST ${API_URL}/kiosk/print...`);
    let printSuccess = false;
    let printStatus = null;
    let printResponseError = null;
    try {
      const printRes = await axios.post(`${API_URL}/kiosk/print`, {
        printCode,
        kioskId: inputKioskId
      });
      printSuccess = true;
      printStatus = printRes.status;
      console.log(`       -> Status: ${printRes.status} OK`);
    } catch (err) {
      printStatus = err.response?.status || 500;
      printResponseError = err.response?.data?.error || err.message;
      console.log(`       -> Status: ${printStatus} (Error: ${printResponseError})`);
    }

    // 3. Verify assertions
    if (expectedOutcome === "PASS") {
      if (!printSuccess) {
        console.error(`   ❌ FAILED: Expected print to succeed, but got HTTP ${printStatus}: ${printResponseError}`);
        return false;
      }
      const updatedSnap = await testJobRef.get();
      const updatedData = updatedSnap.data();
      const actualKioskId = updatedData.kioskId;
      console.log(`   Resulting kioskId in Firestore: "${actualKioskId}" (Expected: "${inputKioskId}")`);

      if (actualKioskId === inputKioskId) {
        console.log(`   ✅ PASS: Job successfully claimed and routed to ${inputKioskId}`);
        return true;
      } else {
        console.error(`   ❌ FAILED: Job routed to "${actualKioskId}" instead of "${inputKioskId}"`);
        return false;
      }
    } else if (expectedOutcome === "REJECT_400") {
      if (printStatus === 400 && !printSuccess) {
        console.log(`   ✅ PASS: Correctly rejected with HTTP 400 as expected (${printResponseError})`);
        return true;
      } else {
        console.error(`   ❌ FAILED: Expected HTTP 400 rejection, but got status ${printStatus}`);
        return false;
      }
    }
  } finally {
    // Cleanup temporary Firestore document
    await testJobRef.delete();
    console.log(`   🧹 Cleaned up temporary document: ${testDocId}`);
  }
}

async function run() {
  console.log(`Starting routing verification against ${API_URL}...`);
  let passed = 0;
  let total = 0;

  // Case 1: B&W job (originally selected CV-001) entered at CV-001 -> should PASS
  total++;
  if (await testRoutingCase({
    description: "Case 1: B&W job entered at CV-001 (MIMO 1.0)",
    colorMode: "bw",
    originalSelectedKiosk: "CV-001",
    inputKioskId: "CV-001",
    expectedOutcome: "PASS"
  })) passed++;

  // Case 2: B&W job (originally selected CV-001) entered at SV-002 -> should PASS
  total++;
  if (await testRoutingCase({
    description: "Case 2: B&W job entered at SV-002 (MIMO 2.0)",
    colorMode: "bw",
    originalSelectedKiosk: "CV-001",
    inputKioskId: "SV-002",
    expectedOutcome: "PASS"
  })) passed++;

  // Case 3: Color job (originally selected SV-002) entered at CV-001 -> should be REJECTED with HTTP 400
  total++;
  if (await testRoutingCase({
    description: "Case 3: Color job entered at CV-001 (MIMO 1.0)",
    colorMode: "color",
    originalSelectedKiosk: "SV-002",
    inputKioskId: "CV-001",
    expectedOutcome: "REJECT_400"
  })) passed++;

  // Case 4: Color job (originally selected SV-002) entered at SV-002 -> should PASS
  total++;
  if (await testRoutingCase({
    description: "Case 4: Color job entered at SV-002 (MIMO 2.0)",
    colorMode: "color",
    originalSelectedKiosk: "SV-002",
    inputKioskId: "SV-002",
    expectedOutcome: "PASS"
  })) passed++;

  console.log("\n======================================================");
  console.log(`📊 RESULTS: ${passed} / ${total} tests passed.`);
  console.log("======================================================\n");
  process.exit(passed === total ? 0 : 1);
}

run();

