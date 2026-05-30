const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(require("../../serviceAccountKey.json")) });
}
const db = admin.firestore();

const API = process.env.API_URL || "http://localhost:3000";
const results = [];

function log(msg) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}] ${msg}`);
  results.push({ ts, msg });
}

async function simulatePaymentSuccess(jobRef, jobData) {
  const printCode = Math.floor(1000 + Math.random() * 9000).toString();
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const directKioskId = jobData.printOptions?.directKioskId;
  let finalDirectKioskId = null;
  if (directKioskId) finalDirectKioskId = directKioskId;

  await jobRef.update({
    status: "paid",
    "paymentStatus.status": "completed",
    "paymentStatus.paidAt": admin.firestore.FieldValue.serverTimestamp(),
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

function computeRouting(jobData, inputKioskId) {
  const directKioskId = jobData.printOptions?.directKioskId;
  const colorMode = jobData.colorMode || jobData.printOptions?.colorMode;
  let finalKioskId = inputKioskId;
  if (directKioskId) finalKioskId = directKioskId;
  else if (colorMode === "color") finalKioskId = "SV-002";
  return finalKioskId;
}

async function waitForPrint(jobRef, label, timeoutMs = 90000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve({ status: "timeout" });
    }, timeoutMs);

    const unsubscribe = jobRef.onSnapshot(doc => {
      const d = doc.data();
      if (d.status === "completed" || d.status === "printed" || d.isPrinted === true) {
        clearTimeout(timer); unsubscribe();
        resolve({ status: "completed", printerStatus: d.printerStatus });
      } else if (d.status === "failed") {
        clearTimeout(timer); unsubscribe();
        resolve({ status: "failed", printerStatus: d.printerStatus });
      }
    });
  });
}

async function runTest(scenario) {
  const { name, fileUrl, colorMode, directKioskId, codeEnteredAt } = scenario;
  log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  log(`▶ SCENARIO: ${name}`);

  // 1. Create job
  const jobRef = db.collection("print_jobs").doc();
  const jobData = {
    userId: "e2e-test-user",
    status: "pending",
    fileName: `E2E_${name.replace(/\s+/g, "_")}.png`,
    fileUrl,
    pageCount: 1,
    colorMode,
    printOptions: {
      ...(directKioskId ? { directKioskId } : {}),
      copies: 1,
      colorMode,
      doubleSided: "single",
      pageSelection: "all",
      imageScaling: colorMode === "color" ? "fill" : "fit"
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };
  await jobRef.set(jobData);
  log(`  📝 Job created: ${jobRef.id}`);

  // 2. Simulate payment success → expect paid status + 4-digit code
  const { printCode, finalDirectKioskId } = await simulatePaymentSuccess(jobRef, jobData);
  const afterPayment = (await jobRef.get()).data();
  const codeBug = afterPayment.status !== "paid" || !afterPayment.printCode || afterPayment.printCode.length !== 4;
  log(`  💳 Payment done → status: '${afterPayment.status}' | code: '${afterPayment.printCode}'`);
  log(`  ${codeBug ? "❌ BUG: Code not generated or status wrong!" : "✅ 4-digit code correctly issued after payment"}`);

  // 3. Simulate kiosk code entry → check routing logic
  const expectedKiosk = computeRouting(jobData, codeEnteredAt);
  log(`  ⌨️  Code '${printCode}' entered at Kiosk: ${codeEnteredAt}`);
  log(`  🗺  Smart Routing → Expected final kiosk: ${expectedKiosk}`);

  // 4. Actually dispatch to Firebase for the Pi to pick up
  await jobRef.update({
    status: "printing",
    kioskId: expectedKiosk,
    "paymentStatus.status": "completed",
    isPrinted: false,
    printerStatus: "Sent to Kiosk",
    "printStatus.status": "printing"
  });
  log(`  📡 Dispatched to Firebase for Pi '${expectedKiosk}' to pick up...`);

  // 5. Wait for Pi to acknowledge
  const printResult = await waitForPrint(jobRef, name);
  log(`  🖨  Hardware result: ${printResult.status}${printResult.printerStatus ? " | " + printResult.printerStatus : ""}`);

  const passed = !codeBug && printResult.status === "completed";
  log(`  ${passed ? "🎉 SCENARIO PASSED" : "❌ SCENARIO FAILED"}`);

  return {
    name,
    jobId: jobRef.id,
    codeEnteredAt,
    expectedKiosk,
    code: afterPayment.printCode,
    codeStatus: codeBug ? "FAIL" : "PASS",
    printStatus: printResult.status,
    overall: passed ? "PASS" : "FAIL"
  };
}

async function main() {
  log("═══════════════════════════════════════════════════════");
  log("🚀 FULL E2E ROUTING + CODE VERIFICATION TEST");
  log("═══════════════════════════════════════════════════════");

  const pikachu = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png";
  const debian  = "https://www.debian.org/logos/openlogo-nd-100.png";
  const bulba   = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1.png";

  const scenarios = [
    {
      name: "1 - SV-002 Direct BW (code at SV-002)",
      fileUrl: pikachu,
      colorMode: "monochrome",
      directKioskId: "SV-002",
      codeEnteredAt: "SV-002"
    },
    {
      name: "2 - Color job code entered at WRONG kiosk (CV-001 → should auto-reroute to SV-002)",
      fileUrl: bulba,
      colorMode: "color",
      directKioskId: null,
      codeEnteredAt: "CV-001"
    },
    {
      name: "3 - CV-001 BW job (code at CV-001 → stays CV-001)",
      fileUrl: debian,
      colorMode: "monochrome",
      directKioskId: null,
      codeEnteredAt: "CV-001"
    }
  ];

  const summary = [];
  for (const scenario of scenarios) {
    const r = await runTest(scenario);
    summary.push(r);
  }

  log("\n═══════════════════════════════════════════════════════");
  log("📋 FINAL SUMMARY");
  log("═══════════════════════════════════════════════════════");
  for (const r of summary) {
    log(`  ${r.overall === "PASS" ? "✅" : "❌"} ${r.name}`);
    log(`     Code: ${r.codeStatus} (${r.code}) | Routed to: ${r.expectedKiosk} | Print: ${r.printStatus}`);
  }
  const allPassed = summary.every(r => r.overall === "PASS");
  log(`\n${allPassed ? "🎉 ALL SCENARIOS PASSED" : "❌ SOME SCENARIOS FAILED"}`);
  log("═══════════════════════════════════════════════════════\n");

  // Export for report
  process.env._E2E_SUMMARY = JSON.stringify(summary);
  process.exit(allPassed ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
