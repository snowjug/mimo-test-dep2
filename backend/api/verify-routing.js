const admin = require("firebase-admin");
const serviceAccount = require("../../serviceAccountKey.json");
const axios = require("axios");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function testRouting(colorMode, expectedKioskId) {
  console.log(`\nTesting routing for colorMode: ${colorMode}...`);
  const printCode = Math.floor(1000 + Math.random() * 9000).toString();
  const testJobRef = db.collection("print_jobs").doc(`test_routing_${colorMode}`);
  
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
      doubleSided: "single"
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  try {
    const res = await axios.post("https://api-upqxuj7evq-uc.a.run.app/kiosk/print", {
      printCode,
      kioskId: "CV-001" // Kiosk ID sent by default kiosk URL
    });
    
    console.log("Response:", res.data);
    
    // Fetch from Firestore to check the resulting kioskId
    const updatedSnap = await testJobRef.get();
    const updatedData = updatedSnap.data();
    console.log(`Resulting kioskId in Firestore: ${updatedData.kioskId} (Expected: ${expectedKioskId})`);
    
    if (updatedData.kioskId === expectedKioskId) {
      console.log(`✅ Success! Routed correctly to ${expectedKioskId}`);
    } else {
      console.log(`❌ Failed! Routed to ${updatedData.kioskId} instead of ${expectedKioskId}`);
    }
  } catch (err) {
    console.error("API Call failed:", err.response?.data || err.message);
  } finally {
    // Cleanup the test document
    await testJobRef.delete();
  }
}

async function run() {
  await testRouting("bw", "CV-001");
  await testRouting("color", "SV-002");
  process.exit(0);
}

run();
