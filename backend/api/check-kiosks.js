const admin = require("firebase-admin");
const serviceAccount = require("../../serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function runTest() {
  try {
    const snapshot = await db.collection("print_jobs").orderBy("createdAt", "desc").limit(100).get();
    const kioskIds = new Set();
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.kioskId) {
        kioskIds.add(data.kioskId);
      }
    });
    console.log("Historical Kiosk IDs found:", Array.from(kioskIds));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

runTest();
