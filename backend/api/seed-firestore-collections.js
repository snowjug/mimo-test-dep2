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
    collection: 'activityLogs',
    docId: '01AbwnCfEZbdLyJ0hT0O',
    data: {
      action: 'invalid_code',
      details: {
        enteredCode: '123456',
        kioskId: 'kiosk-001',
      },
      timestamp: now,
    },
  },
  {
    collection: 'admin',
    docId: 'seed_admin',
    data: {
      email: 'admin@mimo.com',
      role: 'superadmin',
      status: 'active',
      createdAt: now,
    },
  },
  {
    collection: 'adminSettings',
    docId: 'seed_admin_settings',
    data: {
      theme: 'default',
      maintenanceMode: false,
      updatedAt: now,
    },
  },
  {
    collection: 'admins',
    docId: 'seed_admins',
    data: {
      name: 'Seed Admin',
      email: 'admin@mimo.com',
      permissions: ['read', 'write'],
      createdAt: now,
    },
  },
  {
    collection: 'couponCodes',
    docId: 'seed_coupon',
    data: {
      code: 'WELCOME10',
      discountType: 'percentage',
      discountValue: 10,
      active: true,
      createdAt: now,
    },
  },
  {
    collection: 'kiosks',
    docId: 'kiosk-001',
    data: {
      kioskId: 'kiosk-001',
      name: 'Print Kiosk 001',
      location: {
        branch: 'Main Office',
        floor: 'Ground',
        area: 'Lobby',
      },
      status: 'online',
      lastSeenAt: now,
      currentJobCount: 0,
      allowedPrintModes: ['bw', 'color'],
    },
  },
  {
    collection: 'notifications',
    docId: 'seed_notification',
    data: {
      title: 'Welcome',
      message: 'Seed notification created',
      read: false,
      createdAt: now,
    },
  },
  {
    collection: 'orders',
    docId: 'seed_order',
    data: {
      orderId: 'seed_order',
      userId: 'seed_user',
      kioskId: 'kiosk-001',
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
    collection: 'paperInventory',
    docId: 'seed_paper_inventory',
    data: {
      kioskId: 'kiosk-001',
      paperSize: 'A4',
      sheetsAvailable: 1000,
      lowStockThreshold: 100,
      updatedAt: now,
    },
  },
  {
    collection: 'payments',
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
    collection: 'pointsTransactions',
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
    collection: 'posts',
    docId: 'seed_post',
    data: {
      title: 'Seed Post',
      content: 'Placeholder post for Firestore structure.',
      published: false,
      createdAt: now,
    },
  },
  {
    collection: 'printJobs',
    docId: 'seed_print_job_upper',
    data: {
      jobId: 'seed_print_job_upper',
      userId: 'seed_user',
      kioskId: 'kiosk-001',
      status: 'pending',
      fileName: 'seed.pdf',
      pageCount: 1,
      createdAt: now,
    },
  },
  {
    collection: 'print_jobs',
    docId: 'seed_print_job_snake',
    data: {
      jobId: 'seed_print_job_snake',
      userId: 'seed_user',
      kioskId: 'kiosk-001',
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
    collection: 'refillHistory',
    docId: 'seed_refill',
    data: {
      kioskId: 'kiosk-001',
      item: 'paper',
      quantity: 500,
      createdAt: now,
    },
  },
  {
    collection: 'sharedDocuments',
    docId: 'seed_shared_doc',
    data: {
      documentName: 'seed.pdf',
      sharedBy: 'seed_user',
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

  console.log('✅ Firestore collections seeded successfully');
}

seedCollections()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Failed to seed Firestore collections:', error);
    process.exit(1);
  });
