const admin = require("firebase-admin");
const serviceAccount = require("../../serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function checkJobs() {
  const snapshot = await db.collection("print_jobs").orderBy("createdAt", "desc").limit(3).get();
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`Job ${doc.id} | Kiosk: ${data.kioskId} | Color: ${data.colorMode} | Status: ${data.status} | PrinterStatus: ${data.printerStatus || 'N/A'}`);
  });
  process.exit(0);
}

checkJobs().catch(console.error);
