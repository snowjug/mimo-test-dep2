const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'mimo-v2-11868.firebasestorage.app',
  });
}

const db = admin.firestore();
const now = admin.firestore.Timestamp.now();

const seedDocs = [
  {
    collection: 'orders',
    docId: 'seed_order',
    data: {
      orderId: 'seed_order',
      userId: 'seed_user',
      status: 'CREATED',
      orderType: 'print',
      amount: 0,
      totalPages: 0,
      totalDocs: 0,
      paymentDetails: {
        paymentMethod: 'cashfree',
        paymentStatus: 'pending',
      },
      createdAt: now,
    },
  },
  {
    collection: 'payment_transactions',
    docId: 'seed_payment',
    data: {
      paymentId: 'seed_payment',
      orderId: 'seed_order',
      gateway: 'cashfree',
      status: 'completed',
      amount: 0,
      currency: 'INR',
      transactionReference: 'seed_txn_001',
      createdAt: now,
    },
  },
  {
    collection: 'mimo_coin_transactions',
    docId: 'seed_points_txn',
    data: {
      userId: 'seed_user',
      type: 'earned',
      points: 1,
      reason: 'seed',
      createdAt: now,
    },
  },
  {
    collection: 'print_jobs',
    docId: 'seed_print_job',
    data: {
      jobId: 'seed_print_job',
      userId: 'seed_user',
      status: 'pending',
      fileName: 'seed.pdf',
      pageCount: 1,
      printOptions: {
        copies: 1,
        colorMode: 'bw',
        layout: 'single',
      },
      createdAt: now,
    },
  },
  {
    collection: 'users',
    docId: 'seed_user',
    data: {
      id: 'seed_user',
      email: 'seed@mimo.com',
      username: 'Seed User',
      mobileNumber: '0000000000',
      googleUser: false,
      accountStatus: 'active',
      createdAt: now,
      updatedAt: now,
      mimo_coins: {
        balance: 0,
        total_earned: 0,
        total_used: 0,
      },
    },
  },
];

async function seedCollections() {
  for (const seed of seedDocs) {
    await db.collection(seed.collection).doc(seed.docId).set(seed.data, { merge: true });
    console.log(`Seeded ${seed.collection}/${seed.docId}`);
  }

  console.log('✅ Minimal Firestore collections seeded successfully');
}

seedCollections()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Failed to seed Firestore collections:', error);
    process.exit(1);
  });
