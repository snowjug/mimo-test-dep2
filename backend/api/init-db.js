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
      preferredPaymentMethod: "cashfree",
      lastLoginAt: now,
      defaultPrintSettings: {
        colorMode: "bw",
        layout: "single",
        paperSize: "a4"
      },
      isVerified: true,
      verificationMethod: "email"
    });
    console.log("Created users collection.");

    // 2. kiosk_machines
    await db.collection("kiosk_machines").doc(dummyUUID).set({
      kioskId: dummyUUID,
      name: "Init Kiosk",
      location: {
        building: "Init",
        floor: "0",
        area: "Lobby",
        latitude: 0,
        longitude: 0
      },
      hardware: {
        printerModel: "Init Model",
        printerId: "init_printer",
        paperSize: "A4",
        colorCapable: true,
        maxPagesPerMinute: 80,
        maxConcurrentJobs: 5
      },
      configuration: {
        pricePerPageBW: 0.50,
        pricePerPageColor: 1.50,
        minOrderValue: 5.00,
        maxOrderValue: 500.00,
        autoShutdownMinutes: 15,
        idleTimeoutMinutes: 10
      },
      status: {
        operationalStatus: "online",
        lastHeartbeatAt: now,
        paperLevelPercent: 100,
        tonerLevelPercent: 100,
        errorCode: null,
        errorMessage: null,
        lastErrorAt: null
      },
      statistics: {
        totalJobsProcessed: 0,
        totalPagesProcessed: 0,
        totalRevenueGenerated: 0,
        averageJobSizePages: 0,
        uptimePercent: 100,
        maintenanceScheduledAt: now,
        lastMaintenanceAt: now
      },
      createdAt: now,
      updatedAt: now,
      organizationId: "init_org"
    });
    console.log("Created kiosk_machines collection.");

    // 3. print_jobs
    await db.collection("print_jobs").doc(dummyUUID).set({
      jobId: dummyUUID,
      userId: dummyUUID,
      kioskId: dummyUUID,
      orderId: dummyUUID,
      pin: "0000",
      sourceFile: {
        fileName: "init.pdf",
        originalExtension: ".pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 1024,
        uploadedAt: now,
        uploadDurationMs: 100
      },
      conversionDetails: {
        convertedAt: now,
        originalPageCount: 1,
        actualPageCount: 1,
        isConverting: false,
        conversionDurationMs: 100,
        conversionSuccess: true,
        conversionError: null,
        storagePath: "converted/init.pdf",
        storageSizeBytes: 1024
      },
      printOptions: {
        copies: 1,
        colorMode: "bw",
        layout: "single",
        pageSelection: "all",
        startPage: null,
        endPage: null,
        duplexMode: "simplex"
      },
      pricing: {
        pricePerPage: 0.50,
        totalPages: 1,
        copiesRequested: 1,
        totalPagesToPrint: 1,
        estimatedAmount: 0.50,
        finalAmount: 0.50,
        currency: "INR",
        taxPercent: 0,
        taxAmount: 0,
        discountCode: null,
        discountAmount: 0
      },
      paymentStatus: {
        status: "completed",
        paymentMethod: "cashfree",
        transactionId: "init_txn",
        paidAt: now,
        paymentGatewayResponse: {
          orderId: "init_order",
          sessionId: "init_session"
        }
      },
      printStatus: {
        status: "completed",
        retrievedAt: now,
        printStartedAt: now,
        printCompletedAt: now,
        durationSeconds: 1,
        printErrorCode: null,
        printErrorMessage: null,
        printerJobId: "init_job"
      },
      timeline: {
        createdAt: now,
        uploadedAt: now,
        conversionStartedAt: now,
        conversionCompletedAt: now,
        orderCreatedAt: now,
        paymentInitiatedAt: now,
        paymentCompletedAt: now,
        retrievedAt: now,
        printStartedAt: now,
        printCompletedAt: now,
        expiresAt: now
      },
      metadata: {
        ipAddress: "127.0.0.1",
        userAgent: "Init Agent",
        sessionId: "init_session",
        tags: ["init"]
      }
    });
    console.log("Created print_jobs collection.");

    // 4. payment_transactions
    await db.collection("payment_transactions").doc(dummyUUID).set({
      transactionId: dummyUUID,
      userId: dummyUUID,
      orderId: dummyUUID,
      jobId: dummyUUID,
      paymentGateway: "cashfree",
      gatewayTransactionId: "init_txn",
      orderDetails: {
        description: "Init order",
        amount: 0.50,
        currency: "INR",
        orderTimestamp: now
      },
      customerDetails: {
        email: "init@mimo.com",
        phone: "+91-0000000000",
        name: "Init User"
      },
      paymentAttempt: {
        attemptNumber: 1,
        initiatedAt: now,
        sessionId: "init_session",
        paymentMethod: "unknown",
        instrument: {
          type: null,
          last4: null,
          bank: null,
          issuer: null,
          wallet: null
        }
      },
      transactionStatus: {
        status: "completed",
        gatewayStatus: "authorized",
        statusCode: 0,
        statusMessage: "Success",
        completedAt: now,
        failureReason: null,
        failureCode: null
      },
      reconciliation: {
        settledAt: now,
        settledAmount: 0.50,
        gatewayCharges: 0,
        netAmount: 0.50,
        reconciliationStatus: "settled",
        bankReferenceId: "init_ref"
      },
      audit: {
        ipAddress: "127.0.0.1",
        userAgent: "Init Agent",
        retryCount: 0,
        webhookReceived: true,
        webhookVerified: true,
        idempotencyKey: "init_idemp"
      },
      createdAt: now,
      updatedAt: now
    });
    console.log("Created payment_transactions collection.");

    // 5. orders
    await db.collection("orders").doc(dummyUUID).set({
      orderId: dummyUUID,
      userId: dummyUUID,
      kioskId: dummyUUID,
      jobIds: [dummyUUID],
      paymentTransactionId: dummyUUID,
      orderStatus: "completed",
      orderType: "print",
      items: [
        {
          itemId: "init_item",
          jobId: dummyUUID,
          description: "init.pdf - 1 page, BW",
          quantity: 1,
          unitPrice: 0.50,
          totalPrice: 0.50
        }
      ],
      totals: {
        subtotalAmount: 0.50,
        taxAmount: 0.00,
        discountAmount: 0.00,
        totalAmount: 0.50,
        currency: "INR"
      },
      paymentDetails: {
        paymentMethod: "cashfree",
        paymentStatus: "completed",
        paidAt: now,
        paymentTimings: {
          initiatedAt: now,
          completedAt: now,
          durationSeconds: 1
        }
      },
      fulfillment: {
        status: "completed",
        printStartedAt: now,
        printCompletedAt: now,
        estimatedCompletionTime: now,
        actualCompletionTime: now
      },
      metadata: {
        source: "init",
        channel: "init",
        tags: []
      },
      createdAt: now,
      updatedAt: now
    });
    console.log("Created orders collection.");

    // 6. printers
    await db.collection("printers").doc(dummyUUID).set({
      printerId: dummyUUID,
      model: "Init Model",
      manufacturer: "Init Manufacturer",
      specifications: {
        maxPagesPerMinute: 80,
        colorCapable: true,
        duplexCapable: true,
        supportedMediaSizes: ["A4"],
        maxPaperWeight: 300
      },
      pricing: {
        costPerPageBW: 0.10,
        costPerPageColor: 0.30,
        maintenanceCostPerYear: 0
      },
      vendors: [
        {
          kioskId: dummyUUID,
          installationDate: now,
          warrantyExpiration: now
        }
      ],
      createdAt: now,
      updatedAt: now
    });
    console.log("Created printers collection.");

    // 7. kiosk_health_logs
    await db.collection("kiosk_health_logs").doc(dummyUUID).set({
      logId: dummyUUID,
      kioskId: dummyUUID,
      timestamp: now,
      metrics: {
        cpuUsagePercent: 0,
        memoryUsagePercent: 0,
        diskUsagePercent: 0,
        networkLatencyMs: 0,
        paperLevelPercent: 100,
        tonerLevelPercent: 100,
        temperature: 40,
        jobQueueLength: 0
      },
      events: [
        {
          eventType: "init_event",
          severity: "info",
          message: "System initialized",
          timestamp: now
        }
      ]
    });
    console.log("Created kiosk_health_logs collection.");

    console.log("✅ All collections initialized successfully!");
    process.exit(0);

  } catch (error) {
    console.error("❌ Error initializing collections:", error);
    process.exit(1);
  }
}

initializeCollections();
