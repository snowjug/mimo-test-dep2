const admin = require('firebase-admin');
const serviceAccount = require('./../../serviceAccountKey.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function run() {
  const snapshot = await db.collection('print_jobs')
    .orderBy('createdAt', 'desc')
    .limit(3)
    .get();

  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`Job: ${doc.id}`);
    console.log(`  status: ${data.status}`);
    console.log(`  colorMode: ${data.colorMode}`);
    console.log(`  printOptions.colorMode: ${data.printOptions?.colorMode}`);
    console.log(`  printOptions.directKioskId: ${data.printOptions?.directKioskId}`);
    console.log(`  createdAt: ${data.createdAt?.toDate()}`);
    console.log(`  printerStatus: ${data.printerStatus}`);
  });
}
run();
