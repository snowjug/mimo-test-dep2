const admin = require("firebase-admin");
const serviceAccount = require("./mimo-v2-11868-firebase-adminsdk-fbsvc-f4edf52a06.json");
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function debug() {
  const snapshot = await db.collection("print_jobs").where("printCode", "==", "6627").get();
  snapshot.forEach(doc => {
    console.log("DOC ID:", doc.id);
    console.log("DATA:", JSON.stringify(doc.data(), null, 2));
  });
}
debug();
