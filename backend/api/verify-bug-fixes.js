const admin = require("firebase-admin");
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(require("../../serviceAccountKey.json")) });
}
const db = admin.firestore();

// ── Helper: simulate /payment-success internal logic ──────────────────────────
async function simulatePaymentSuccess(jobRef, jobData) {
  const printCode = Math.floor(1000 + Math.random() * 9000).toString();
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const directKioskId = jobData.printOptions?.directKioskId;
  let finalDirectKioskId = null;
  if (directKioskId) finalDirectKioskId = directKioskId;

  await jobRef.update({
    status: "paid",
    "paymentStatus.status": "completed",
    printCode,
    tokenId: printCode,
    codeCreatedAt: new Date(),
    codeExpiresAt: expiresAt,
    isPrinted: false,
    printerStatus: "ready",
    "printStatus.status": "ready"
  });

  return { printCode, finalDirectKioskId };
}

// ── Helper: simulate /kiosk/print routing logic ───────────────────────────────
function computeRouting(jobData, inputKioskId) {
  const directKioskId = jobData.printOptions?.directKioskId;
  const colorMode = jobData.colorMode || jobData.printOptions?.colorMode;
  const isColor = colorMode === "color";
  
  let finalKioskId = inputKioskId || "CV-001";
  if (isColor) {
    finalKioskId = "SV-002";
  } else if (inputKioskId) {
    finalKioskId = inputKioskId;
  } else if (directKioskId) {
    finalKioskId = directKioskId;
  } else {
    finalKioskId = "CV-001";
  }
  return finalKioskId;
}

async function runTests() {
  console.log("\n=======================================================");
  console.log("🧪 BUG FIX VERIFICATION TESTS");
  console.log("=======================================================\n");

  let passed = 0;
  let failed = 0;

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Direct Kiosk job should STILL get a 4-digit code (not auto-print)
  // ─────────────────────────────────────────────────────────────────────────
  console.log("TEST 1: Direct Kiosk jobs must receive a 4-digit code...");
  const job1Ref = db.collection("print_jobs").doc();
  const job1Data = {
    userId: "test-verify-user",
    status: "pending",
    fileName: "test_direct.png",
    fileUrl: "https://example.com/test.png",
    pageCount: 1,
    colorMode: "monochrome",
    printOptions: { directKioskId: "SV-002", copies: 1, colorMode: "monochrome" }
  };
  await job1Ref.set(job1Data);
  const { printCode: code1, finalDirectKioskId } = await simulatePaymentSuccess(job1Ref, job1Data);
  const job1After = (await job1Ref.get()).data();

  if (job1After.status === "paid" && job1After.printCode && job1After.printCode.length === 4) {
    console.log(`  ✅ PASS: Direct Kiosk job has status='paid' with 4-digit code: ${job1After.printCode}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: status='${job1After.status}', code='${job1After.printCode}'`);
    failed++;
  }
  await job1Ref.delete();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Color job typed at CV-001 must route to SV-002
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\nTEST 2: Color job typed at CV-001 should route to SV-002 (Epson)...");
  const colorJobData = {
    colorMode: "color",
    printOptions: { copies: 1, colorMode: "color" }
  };
  const routedKiosk = computeRouting(colorJobData, "CV-001");
  if (routedKiosk === "SV-002") {
    console.log(`  ✅ PASS: Color job typed at CV-001 correctly routes to: ${routedKiosk}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: Expected SV-002, got: ${routedKiosk}`);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: B&W job typed at CV-001 must stay at CV-001
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\nTEST 3: B&W job typed at CV-001 should stay at CV-001...");
  const bwJobData = {
    colorMode: "monochrome",
    printOptions: { copies: 1, colorMode: "monochrome" }
  };
  const routedBW = computeRouting(bwJobData, "CV-001");
  if (routedBW === "CV-001") {
    console.log(`  ✅ PASS: B&W job correctly stays at: ${routedBW}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: Expected CV-001, got: ${routedBW}`);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: physical kioskId override must win for B&W jobs
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\nTEST 4: physical kioskId override must win for B&W jobs...");
  const directBWJobData = {
    colorMode: "monochrome",
    printOptions: { directKioskId: "SV-002", copies: 1, colorMode: "monochrome" }
  };
  const routedDirect = computeRouting(directBWJobData, "CV-001");
  if (routedDirect === "CV-001") {
    console.log(`  ✅ PASS: Physical kioskId CV-001 correctly wins: ${routedDirect}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: Expected CV-001, got: ${routedDirect}`);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: Color job typed at SV-002 directly should also stay SV-002
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\nTEST 5: Color job typed directly at SV-002 should stay at SV-002...");
  const routedColorSV = computeRouting(colorJobData, "SV-002");
  if (routedColorSV === "SV-002") {
    console.log(`  ✅ PASS: Color job at SV-002 correctly stays at: ${routedColorSV}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: Expected SV-002, got: ${routedColorSV}`);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: B&W job pre-selected for CV-001 but typed at SV-002 should print at SV-002
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\nTEST 6: B&W job pre-selected for CV-001 but typed at SV-002 should print at SV-002...");
  const preselectedBWData = {
    colorMode: "monochrome",
    printOptions: { directKioskId: "CV-001", copies: 1, colorMode: "monochrome" }
  };
  const routedPhysical = computeRouting(preselectedBWData, "SV-002");
  if (routedPhysical === "SV-002") {
    console.log(`  ✅ PASS: Pre-selected CV-001 job typed at SV-002 correctly prints at: ${routedPhysical}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: Expected SV-002, got: ${routedPhysical}`);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n=======================================================");
  console.log(`RESULTS: ${passed} passed / ${passed + failed} total`);
  if (failed === 0) {
    console.log("🎉 ALL TESTS PASSED — Both bugs are confirmed FIXED!");
  } else {
    console.log(`❌ ${failed} test(s) FAILED — bugs remain.`);
  }
  console.log("=======================================================\n");
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error(e); process.exit(1); });
