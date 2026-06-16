const admin = require("firebase-admin");
const serviceAccount = require("./pi_scripts/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function check() {
  const users = await db.collection("users").where("email", "==", "hpsnowjug@gmail.com").get();
  users.forEach(u => console.log(u.id, u.data()));
  process.exit(0);
}
check();
