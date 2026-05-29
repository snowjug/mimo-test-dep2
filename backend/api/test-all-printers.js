const admin = require("firebase-admin");
const serviceAccount = require("../../serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function runTests() {
  console.log("🚀 Firing E2E Print Tests to all 3 configurations...");

  const baseJob = {
    userId: "test-user-id",
    userName: "E2E Test User",
    fileName: "e2e_test_doc.pdf",
    fileUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    pages: 1,
    copies: 1,
    totalCost: 2,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  const tests = [
    { name: "CV-001 (B&W)", data: { ...baseJob, kioskId: "CV-001", colorMode: "bw", status: "printing", amountPaid: 2, paid: true } },
    { name: "SV-002 (B&W)", data: { ...baseJob, kioskId: "SV-002", colorMode: "bw", status: "printing", amountPaid: 2, paid: true } },
    { name: "SV-002 (COLOR)", data: { ...baseJob, kioskId: "SV-002", colorMode: "color", status: "printing", amountPaid: 10, paid: true } }
  ];

  for (const test of tests) {
    const jobRef = db.collection("print_jobs").doc();
    await jobRef.set(test.data);
    console.log(`✅ Queued job for ${test.name} (Job ID: ${jobRef.id})`);
  }
  
  console.log("\n⏳ All jobs queued! Now monitor the Raspberry Pi logs to see them get picked up and printed.");
  process.exit(0);
}

runTests().catch(console.error);
