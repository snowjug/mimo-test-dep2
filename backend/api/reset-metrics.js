const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require("../../serviceAccountKey.json"))
  });
}

const db = admin.firestore();

async function run() {
  await db.collection("system").doc("metrics").set({
    totalRevenue: 0,
    totalOrders: 0,
    totalPagesPrinted: 0,
    totalFreePagesPrinted: 0,
    pagesByPrice: { free: 0, paid: 0 },
    dailyRevenue: {},
    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log("Metrics successfully reset to zero in the database!");
}

run().catch(console.error);
