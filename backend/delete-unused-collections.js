require("dotenv").config();
const { db } = require("./api/firebase");

const collectionsToDelete = [
  "printJobs", "payments", "pointsTransactions", "kiosks",
  "kiosk_machines", "kiosk_health_logs", "activityLogs",
  "admin", "admins", "adminSettings", "paperInventory",
  "refillHistory", "sharedDocuments", "notifications",
  "posts", "couponCodes", "seed_print_job_upper", "seed_print_job_snake"
];

async function deleteQueryBatch(query, resolve, reject) {
  try {
    const snapshot = await query.get();
    const batchSize = snapshot.size;
    if (batchSize === 0) {
      resolve();
      return;
    }
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    process.nextTick(() => {
      deleteQueryBatch(query, resolve, reject);
    });
  } catch (err) {
    reject(err);
  }
}

async function deleteCollection(collectionPath, batchSize = 100) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(batchSize);
  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve, reject);
  });
}

async function main() {
  console.log("Starting Firebase Cleanup Process...");
  for (const coll of collectionsToDelete) {
    try {
      console.log("Scanning collection:", coll);
      const snapshot = await db.collection(coll).limit(1).get();
      if (!snapshot.empty) {
        console.log("  -> Found data. Deleting...");
        await deleteCollection(coll);
        console.log("  -> Successfully deleted collection:", coll);
      } else {
        console.log("  -> Collection is already empty/deleted.");
      }
    } catch (e) {
      console.error(`Failed to delete ${coll}:`, e.message);
    }
  }
  console.log("✅ All unused collections wiped successfully!");
  process.exit(0);
}

main();
