const admin = require("firebase-admin");
const serviceAccount = require("../../serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function checkJobs() {
  const doc = await db.collection("print_jobs").doc("nH8vKeFDZv087w1vTWth").get();
  console.log(JSON.stringify(doc.data(), null, 2));
  process.exit(0);
}

checkJobs().catch(console.error);
