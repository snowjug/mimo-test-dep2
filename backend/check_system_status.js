const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function run() {
  try {
    const snapshot = await db.collection("system_status").get();
    console.log("=== KIOSK SYSTEM STATUS ===");
    snapshot.forEach(doc => {
      const data = doc.data();
      const lastSeenDate = data.lastSeen ? (data.lastSeen.toDate ? data.lastSeen.toDate().toISOString() : new Date(data.lastSeen).toISOString()) : 'Never';
      console.log(`Kiosk ID: ${doc.id}`);
      console.log(`  Last Seen: ${lastSeenDate}`);
      console.log(`  Printer Status: ${data.printerStatus || 'N/A'}`);
      console.log("------------------------");
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
