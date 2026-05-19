const { db } = require("./firebase");

async function initializeCollections() {
  console.log("Starting Firebase collections initialization...");

  const now = Date.now();
  const dummyUUID = "init_dummy_uuid_0000";

  try {
    // 1. users
    await db.collection("users").doc(dummyUUID).set({
      userId: dummyUUID,
      email: "init@mimo.com",
      phoneNumber: "+91-0000000000",
      name: "Init User",
      passwordHash: "dummy_hash",
      createdAt: now,
      updatedAt: now,
      accountStatus: "active",
      totalSpent: 0,
      totalPagesPrinted: 0,
    });
    console.log("Created users collection.");

    // 2. print_jobs
    await db.collection("print_jobs").doc(dummyUUID).set({
      jobId: dummyUUID,
      userId: dummyUUID,
      orderId: dummyUUID,
      pin: "0000",
      status: "completed",
      fileName: "init.pdf",
      fileSize: 1024,
      pageCount: 1,
      printOptions: {
        copies: 1,
        colorMode: "bw",
        layout: "single",
        duplexMode: "simplex"
      },
      createdAt: now,
      updatedAt: now
    });
    console.log("Created print_jobs collection.");

    // 3. payment_transactions
    await db.collection("payment_transactions").doc(dummyUUID).set({
      transactionId: dummyUUID,
      userId: dummyUUID,
      orderId: dummyUUID,
      paymentGateway: "cashfree",
      gatewayTransactionId: "init_txn",
      transactionStatus: {
        status: "completed",
        gatewayStatus: "authorized",
        completedAt: now,
      },
      createdAt: now,
      updatedAt: now
    });
    console.log("Created payment_transactions collection.");

    // 4. orders
    await db.collection("orders").doc(dummyUUID).set({
      orderId: dummyUUID,
      userId: dummyUUID,
      jobIds: [dummyUUID],
      paymentTransactionId: dummyUUID,
      orderStatus: "completed",
      orderType: "print",
      totals: {
        totalAmount: 0.50,
        currency: "INR"
      },
      createdAt: now,
      updatedAt: now
    });
    console.log("Created orders collection.");

    // 5. mimo_coin_transactions
    await db.collection("mimo_coin_transactions").doc(dummyUUID).set({
      transactionId: dummyUUID,
      userId: dummyUUID,
      orderId: dummyUUID,
      type: "earned",
      amount: 1,
      createdAt: now
    });
    console.log("Created mimo_coin_transactions collection.");

    console.log("✅ Minimal collections initialized successfully!");
    process.exit(0);

  } catch (error) {
    console.error("❌ Error initializing collections:", error);
    process.exit(1);
  }
}

initializeCollections();
