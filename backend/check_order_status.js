const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function checkOrder() {
  const orderId = "order_768ddf722e";
  console.log(`Checking order: ${orderId}`);
  
  const orderSnap = await db.collection("orders").where("orderId", "==", orderId).get();
  if (orderSnap.empty) {
    console.log("Order not found in Firestore!");
  } else {
    const orderDoc = orderSnap.docs[0];
    console.log("Order Data:", orderDoc.data());
    
    // Also check the print jobs for this user
    const userId = orderDoc.data().userId;
    const jobsSnap = await db.collection("print_jobs").where("userId", "==", userId).get();
    console.log(`\nFound ${jobsSnap.size} print jobs for user ${userId}:`);
    jobsSnap.forEach(doc => {
      console.log(`Job ${doc.id}: status=${doc.data().status}, paymentStatus=${doc.data().paymentStatus?.status}`);
    });
  }
}

checkOrder().catch(console.error);
