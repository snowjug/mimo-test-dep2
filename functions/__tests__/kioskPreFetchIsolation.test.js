// GATE 1 ISOLATION TEST SUITE
// Verifies:
// 1. Unassigned web upload orders create jobs with kioskId: null (never defaulting to "CV-001").
// 2. Explicitly assigned orders (directKioskId: "SV-002" or "CV-001") keep their assigned kiosk.
// 3. Payment completion (postPaymentSuccess) preserves kioskId: null and returns directKioskId: null for unassigned jobs.
// 4. Payment completion returns directKioskId for explicitly assigned jobs.
// 5. Pre-fetch isolation: Pi listener queries for "CV-001" and "SV-002" do NOT match unassigned jobs.
// 6. PIN redemption (kiosk claim): Customer can redeem at either kiosk, which then safely transitions kioskId.
// 7. Cross-kiosk isolation: A job already redeemed at SV-002 cannot be claimed by CV-001.

const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { fake, controller, response, pendingJob, seed, checkout, markPaid } = require("./helpers/orderHarness");
const { createKioskRouter } = require("../src/routes/kiosk.routes");
const { isColorJob } = require("../src/services/printJob.service");
const { postGetDocumentsByCode } = require("../src/controllers/print.controller");

const router = createKioskRouter({
  db: fake.db,
  admin: fake.admin,
  isColorJob,
  CASHFREE_BASE_URL: "",
  cashfreeHeaders: {},
  axios: null,
});
const printLayer = router.stack.find((l) => l.route && l.route.path === "/print" && l.route.methods.post).route.stack;
const kioskPrint = printLayer[printLayer.length - 1].handle;
const getDocuments = async (printCode, kioskId) => {
  const res = response();
  await postGetDocumentsByCode({ body: { printCode, kioskId } }, res);
  return res;
};

const REGISTRY_SEED = {
  machines: {
    "CV-001": { name: "MIMO 1.0", status: "ACTIVE", templateId: "mimo-1.0-standard" },
    "SV-002": { name: "MIMO 2.0", status: "ACTIVE", templateId: "mimo-2.0-standard" },
  },
  machine_templates: {
    "mimo-1.0-standard": { name: "MIMO 1.0 Standard", capabilities: { colour: false } },
    "mimo-2.0-standard": { name: "MIMO 2.0 Standard", capabilities: { colour: true } },
  },
};

test.describe("Gate 1: Backend Routing & Pre-fetch Isolation", () => {
  test.beforeEach(() => {
    seed({
      extra: REGISTRY_SEED,
    });
  });

  test("1. Unassigned order checkout creates job with kioskId: null (NOT CV-001)", async () => {
    seed({
      jobs: { j1: pendingJob({ pageCount: 2 }) },
      extra: REGISTRY_SEED,
    });

    const res = await checkout({ printOptions: { colorMode: "bw" } }); // NO directKioskId
    assert.strictEqual(res.code, 200);

    const jobs = fake.data("print_jobs");
    const createdJob = Object.values(jobs).find((j) => j.orderId === res.body.orderId);
    assert.ok(createdJob, "job exists");
    assert.strictEqual(createdJob.kioskId, null, "unassigned job must have kioskId: null, not CV-001");
  });

  test("2. Explicitly assigned order checkout preserves directKioskId on job", async () => {
    seed({
      jobs: { j1: pendingJob({ pageCount: 2 }) },
      extra: REGISTRY_SEED,
    });

    const res = await checkout({ printOptions: { directKioskId: "SV-002", colorMode: "color" } });
    assert.strictEqual(res.code, 200);

    const jobs = fake.data("print_jobs");
    const createdJob = Object.values(jobs).find((j) => j.orderId === res.body.orderId);
    assert.ok(createdJob, "job exists");
    assert.strictEqual(createdJob.kioskId, "SV-002", "explicit SV-002 assignment preserved");
  });

  test("3. Payment success on unassigned order preserves kioskId: null and returns directKioskId: null", async () => {
    seed({
      jobs: { j1: pendingJob({ pageCount: 2 }) },
      extra: REGISTRY_SEED,
    });

    const checkoutRes = await checkout({ printOptions: { colorMode: "bw" } });
    const orderId = checkoutRes.body.orderId;
    await markPaid(orderId);

    const res = response();
    await controller.postPaymentSuccess({ user: { userId: "u1" }, body: { orderId } }, res);

    assert.strictEqual(res.code, 200);
    assert.strictEqual(res.body.directKioskId, null, "directKioskId must be null for unassigned order");
    
    const jobs = fake.data("print_jobs");
    const job = Object.values(jobs).find((j) => j.orderId === orderId);
    assert.strictEqual(job.status, "paid");
    assert.strictEqual(job.kioskId, null, "paid job must keep kioskId: null");
    assert.match(job.printCode, /^[1-9]\d{3}$/);
  });

  test("4. Payment success on explicitly assigned order preserves kioskId: SV-002 and returns directKioskId: SV-002", async () => {
    seed({
      jobs: { j1: pendingJob({ pageCount: 2 }) },
      extra: REGISTRY_SEED,
    });

    const checkoutRes = await checkout({ printOptions: { directKioskId: "SV-002", colorMode: "color" } });
    const orderId = checkoutRes.body.orderId;
    await markPaid(orderId);

    const res = response();
    await controller.postPaymentSuccess({ user: { userId: "u1" }, body: { orderId } }, res);

    assert.strictEqual(res.code, 200);
    assert.strictEqual(res.body.directKioskId, "SV-002");
    
    const jobs = fake.data("print_jobs");
    const job = Object.values(jobs).find((j) => j.orderId === orderId);
    assert.strictEqual(job.status, "paid");
    assert.strictEqual(job.kioskId, "SV-002");
  });

  test("5. Pre-fetch isolation: Pi listener queries for CV-001 or SV-002 do NOT match unassigned jobs", async () => {
    fake.reset({
      ...REGISTRY_SEED,
      print_jobs: {
        j_unassigned: {
          userId: "u1",
          status: "paid",
          kioskId: null,
          printCode: "1001",
          fileName: "doc1.pdf",
        },
        j_cv001: {
          userId: "u1",
          status: "paid",
          kioskId: "CV-001",
          printCode: "1002",
          fileName: "doc2.pdf",
        },
        j_sv002: {
          userId: "u1",
          status: "paid",
          kioskId: "SV-002",
          printCode: "1003",
          fileName: "doc3.pdf",
        },
      },
    });

    // Simulate Pi 1 (CV-001) listener query:
    const cv001Snap = await fake.db.collection("print_jobs")
      .where("status", "==", "paid")
      .where("kioskId", "==", "CV-001")
      .get();
    const cv001JobIds = cv001Snap.docs.map((d) => d.id);
    assert.deepStrictEqual(cv001JobIds, ["j_cv001"], "CV-001 listener must ONLY see jobs explicitly assigned to CV-001");
    assert.ok(!cv001JobIds.includes("j_unassigned"), "CV-001 must NOT prefetch unassigned job");

    // Simulate Pi 2 (SV-002) listener query:
    const sv002Snap = await fake.db.collection("print_jobs")
      .where("status", "==", "paid")
      .where("kioskId", "==", "SV-002")
      .get();
    const sv002JobIds = sv002Snap.docs.map((d) => d.id);
    assert.deepStrictEqual(sv002JobIds, ["j_sv002"], "SV-002 listener must ONLY see jobs explicitly assigned to SV-002");
    assert.ok(!sv002JobIds.includes("j_unassigned"), "SV-002 must NOT prefetch unassigned job");
  });

  test("6. Customer can redeem unassigned print code at SV-002, routing it exclusively to SV-002", async () => {
    fake.reset({
      ...REGISTRY_SEED,
      print_jobs: {
        j_unassigned: {
          userId: "u1",
          status: "paid",
          kioskId: null,
          printCode: "5555",
          colorMode: "bw",
          createdAt: new Date(),
          fileName: "doc.pdf",
          fileUrl: "https://example.com/doc.pdf",
          files: [{ name: "doc.pdf", url: "https://example.com/doc.pdf", type: "application/pdf" }],
        },
      },
    });

    const res = response();
    await kioskPrint({ body: { printCode: "5555", kioskId: "SV-002" } }, res);

    assert.strictEqual(res.code, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.job.kioskId, "SV-002");
    assert.strictEqual(res.body.job.status, "printing");

    const savedJob = fake.data("print_jobs").j_unassigned;
    assert.strictEqual(savedJob.kioskId, "SV-002");
    assert.strictEqual(savedJob.status, "printing");
  });

  test("7. Customer can redeem unassigned print code at CV-001, routing it exclusively to CV-001", async () => {
    fake.reset({
      ...REGISTRY_SEED,
      print_jobs: {
        j_unassigned: {
          userId: "u1",
          status: "paid",
          kioskId: null,
          printCode: "6666",
          colorMode: "bw",
          createdAt: new Date(),
          fileName: "doc.pdf",
          fileUrl: "https://example.com/doc.pdf",
          files: [{ name: "doc.pdf", url: "https://example.com/doc.pdf", type: "application/pdf" }],
        },
      },
    });

    const res = response();
    await kioskPrint({ body: { printCode: "6666", kioskId: "CV-001" } }, res);

    assert.strictEqual(res.code, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.job.kioskId, "CV-001");
    assert.strictEqual(res.body.job.status, "printing");

    const savedJob = fake.data("print_jobs").j_unassigned;
    assert.strictEqual(savedJob.kioskId, "CV-001");
    assert.strictEqual(savedJob.status, "printing");
  });

  test("8. Cross-kiosk isolation: Once redeemed at SV-002, CV-001 cannot claim or print it", async () => {
    fake.reset({
      ...REGISTRY_SEED,
      print_jobs: {
        j1: {
          userId: "u1",
          status: "printing",
          kioskId: "SV-002",
          printCode: "7777",
          colorMode: "bw",
          createdAt: new Date(),
          fileName: "doc.pdf",
          fileUrl: "https://example.com/doc.pdf",
          files: [{ name: "doc.pdf", url: "https://example.com/doc.pdf", type: "application/pdf" }],
        },
      },
    });

    const res = response();
    await kioskPrint({ body: { printCode: "7777", kioskId: "CV-001" } }, res);

    assert.strictEqual(res.code, 400);
    assert.strictEqual(res.body.error, "Print code already redeemed or job not paid");

    const savedJob = fake.data("print_jobs").j1;
    assert.strictEqual(savedJob.kioskId, "SV-002", "kioskId remains SV-002 and is not overwritten by CV-001");
    assert.strictEqual(savedJob.status, "printing");
  });

  test("9. Cross-kiosk isolation (reverse): Once redeemed at CV-001, SV-002 cannot claim or print it", async () => {
    fake.reset({
      ...REGISTRY_SEED,
      print_jobs: {
        j1: {
          userId: "u1",
          status: "printing",
          kioskId: "CV-001",
          printCode: "8888",
          colorMode: "bw",
          createdAt: new Date(),
          fileName: "doc.pdf",
          fileUrl: "https://example.com/doc.pdf",
          files: [{ name: "doc.pdf", url: "https://example.com/doc.pdf", type: "application/pdf" }],
        },
      },
    });

    const res = response();
    await kioskPrint({ body: { printCode: "8888", kioskId: "SV-002" } }, res);

    assert.strictEqual(res.code, 400);
    assert.strictEqual(res.body.error, "Print code already redeemed or job not paid");

    const savedJob = fake.data("print_jobs").j1;
    assert.strictEqual(savedJob.kioskId, "CV-001", "kioskId remains CV-001 and is not overwritten by SV-002");
    assert.strictEqual(savedJob.status, "printing");
  });

  test("10. Concurrent redemption race: Two kiosks concurrently claiming the same code results in exactly ONE winner", async () => {
    fake.reset({
      ...REGISTRY_SEED,
      print_jobs: {
        j_race: {
          userId: "u1",
          status: "paid",
          kioskId: null,
          printCode: "9999",
          colorMode: "bw",
          createdAt: new Date(),
          fileName: "doc.pdf",
          fileUrl: "https://example.com/doc.pdf",
          files: [{ name: "doc.pdf", url: "https://example.com/doc.pdf", type: "application/pdf" }],
        },
      },
    });

    const res1 = response();
    const res2 = response();

    // Fire both claims concurrently
    await Promise.all([
      kioskPrint({ body: { printCode: "9999", kioskId: "CV-001" } }, res1),
      kioskPrint({ body: { printCode: "9999", kioskId: "SV-002" } }, res2),
    ]);

    const results = [res1, res2];
    const successes = results.filter((r) => r.code === 200);
    const failures = results.filter((r) => r.code === 400);

    assert.strictEqual(successes.length, 1, "Exactly one concurrent claim must succeed");
    assert.strictEqual(failures.length, 1, "The competing concurrent claim must be rejected");
    assert.strictEqual(failures[0].body.error, "Print code already redeemed or job not paid");

    const winningKiosk = successes[0].body.job.kioskId;
    assert.ok(["CV-001", "SV-002"].includes(winningKiosk));

    const finalJob = fake.data("print_jobs").j_race;
    assert.strictEqual(finalJob.status, "printing");
    assert.strictEqual(finalJob.kioskId, winningKiosk, "Job must remain atomically assigned to the single winning kiosk");
  });

  test("11. Capability check: Color job cannot be redeemed at CV-001 (B&W only) but succeeds at SV-002", async () => {
    fake.reset({
      ...REGISTRY_SEED,
      print_jobs: {
        j_color: {
          userId: "u1",
          status: "paid",
          kioskId: null,
          printCode: "3333",
          colorMode: "color",
          createdAt: new Date(),
          fileName: "photo.pdf",
          fileUrl: "https://example.com/photo.pdf",
          files: [{ name: "photo.pdf", url: "https://example.com/photo.pdf", type: "application/pdf" }],
        },
      },
    });

    // Try CV-001 (B&W only):
    const cvRes = response();
    await kioskPrint({ body: { printCode: "3333", kioskId: "CV-001" } }, cvRes);
    assert.strictEqual(cvRes.code, 400);
    assert.match(cvRes.body.error, /This is a Color print job/);

    // Verify job remains in paid status
    assert.strictEqual(fake.data("print_jobs").j_color.status, "paid");

    // Try SV-002 (Color capable):
    const svRes = response();
    await kioskPrint({ body: { printCode: "3333", kioskId: "SV-002" } }, svRes);
    assert.strictEqual(svRes.code, 200);
    assert.strictEqual(svRes.body.success, true);
    assert.strictEqual(fake.data("print_jobs").j_color.status, "printing");
    assert.strictEqual(fake.data("print_jobs").j_color.kioskId, "SV-002");
  });

  test("12. Machine registry check: Unknown or inactive kiosk cannot redeem jobs", async () => {
    fake.reset({
      ...REGISTRY_SEED,
      print_jobs: {
        j1: {
          userId: "u1",
          status: "paid",
          kioskId: null,
          printCode: "2222",
          colorMode: "bw",
          createdAt: new Date(),
          fileName: "doc.pdf",
          fileUrl: "https://example.com/doc.pdf",
          files: [{ name: "doc.pdf", url: "https://example.com/doc.pdf", type: "application/pdf" }],
        },
      },
    });

    const res = response();
    await kioskPrint({ body: { printCode: "2222", kioskId: "UNKNOWN-999" } }, res);
    assert.strictEqual(res.code, 400);
    assert.match(res.body.error, /Invalid printer station/);

    assert.strictEqual(fake.data("print_jobs").j1.status, "paid");
    assert.strictEqual(fake.data("print_jobs").j1.kioskId, null);
  });

  test("13. Explicitly kiosk-restricted job cannot be redeemed at the wrong kiosk", async () => {
    fake.reset({
      ...REGISTRY_SEED,
      print_jobs: {
        j_restricted: {
          userId: "u1",
          status: "paid",
          kioskId: "SV-002",
          strictKiosk: true,
          printOptions: { directKioskId: "SV-002", strictKiosk: true, colorMode: "bw" },
          printCode: "4444",
          colorMode: "bw",
          createdAt: new Date(),
          fileName: "doc.pdf",
          fileUrl: "https://example.com/doc.pdf",
          files: [{ name: "doc.pdf", url: "https://example.com/doc.pdf", type: "application/pdf" }],
        },
      },
    });

    // 1. Check get-documents-by-code at wrong kiosk (CV-001)
    const docsRes = await getDocuments("4444", "CV-001");
    assert.strictEqual(docsRes.code, 403);
    assert.match(docsRes.body.error, /restricted to machine SV-002/);

    // 2. Check /kiosk/print at wrong kiosk (CV-001)
    const printRes = response();
    await kioskPrint({ body: { printCode: "4444", kioskId: "CV-001" } }, printRes);
    assert.strictEqual(printRes.code, 403);
    assert.match(printRes.body.error, /restricted to machine SV-002/);

    // Confirm job state is untouched
    const job = fake.data("print_jobs").j_restricted;
    assert.strictEqual(job.status, "paid");
    assert.strictEqual(job.kioskId, "SV-002");
  });

  test("14. Explicitly kiosk-restricted job succeeds at its designated kiosk", async () => {
    fake.reset({
      ...REGISTRY_SEED,
      print_jobs: {
        j_restricted: {
          userId: "u1",
          status: "paid",
          kioskId: "SV-002",
          strictKiosk: true,
          printOptions: { directKioskId: "SV-002", strictKiosk: true, colorMode: "bw" },
          printCode: "4444",
          colorMode: "bw",
          createdAt: new Date(),
          fileName: "doc.pdf",
          fileUrl: "https://example.com/doc.pdf",
          files: [{ name: "doc.pdf", url: "https://example.com/doc.pdf", type: "application/pdf" }],
        },
      },
    });

    // Check at designated kiosk (SV-002)
    const docsRes = await getDocuments("4444", "SV-002");
    assert.strictEqual(docsRes.code, 200);

    const printRes = response();
    await kioskPrint({ body: { printCode: "4444", kioskId: "SV-002" } }, printRes);
    assert.strictEqual(printRes.code, 200);
    assert.strictEqual(printRes.body.success, true);
    assert.strictEqual(fake.data("print_jobs").j_restricted.status, "printing");
  });

  test("15. Invalid / non-existent print code is rejected with 404", async () => {
    fake.reset({ ...REGISTRY_SEED, print_jobs: {} });

    const docsRes = await getDocuments("0000", "CV-001");
    assert.strictEqual(docsRes.code, 404);

    const printRes = response();
    await kioskPrint({ body: { printCode: "0000", kioskId: "CV-001" } }, printRes);
    assert.strictEqual(printRes.code, 404);
  });

  test("16. Unpaid print code (status: pending) is rejected with 400", async () => {
    fake.reset({
      ...REGISTRY_SEED,
      print_jobs: {
        j_unpaid: {
          userId: "u1",
          status: "pending",
          kioskId: null,
          printCode: "1234",
          colorMode: "bw",
          createdAt: new Date(),
          fileName: "doc.pdf",
          fileUrl: "https://example.com/doc.pdf",
          files: [{ name: "doc.pdf", url: "https://example.com/doc.pdf", type: "application/pdf" }],
        },
      },
    });

    const docsRes = await getDocuments("1234", "CV-001");
    assert.strictEqual(docsRes.code, 404); // /get-documents-by-code only queries status == paid

    const printRes = response();
    await kioskPrint({ body: { printCode: "1234", kioskId: "CV-001" } }, printRes);
    assert.strictEqual(printRes.code, 400);
    assert.match(printRes.body.error, /Print code already redeemed or job not paid/);
  });

  test("17. Already completed code is rejected with 409 at getDocuments and 400 at kioskPrint", async () => {
    fake.reset({
      ...REGISTRY_SEED,
      print_jobs: {
        j_done: {
          userId: "u1",
          status: "completed",
          isPrinted: true,
          kioskId: "CV-001",
          printCode: "5678",
          colorMode: "bw",
          createdAt: new Date(),
          fileName: "doc.pdf",
          fileUrl: "https://example.com/doc.pdf",
          files: [{ name: "doc.pdf", url: "https://example.com/doc.pdf", type: "application/pdf" }],
        },
      },
    });

    const docsRes = await getDocuments("5678", "CV-001");
    assert.strictEqual(docsRes.code, 409);
    assert.match(docsRes.body.error, /Print code already used/);

    const printRes = response();
    await kioskPrint({ body: { printCode: "5678", kioskId: "CV-001" } }, printRes);
    assert.strictEqual(printRes.code, 400);
    assert.match(printRes.body.error, /Print code already redeemed or job not paid/);
  });

  test("18. Duplicate submission retry on an active printing job is rejected without re-enqueueing", async () => {
    fake.reset({
      ...REGISTRY_SEED,
      print_jobs: {
        j_active: {
          userId: "u1",
          status: "printing",
          kioskId: "SV-002",
          printCode: "9988",
          colorMode: "bw",
          createdAt: new Date(),
          fileName: "doc.pdf",
          fileUrl: "https://example.com/doc.pdf",
          files: [{ name: "doc.pdf", url: "https://example.com/doc.pdf", type: "application/pdf" }],
        },
      },
    });

    const printRes = response();
    await kioskPrint({ body: { printCode: "9988", kioskId: "SV-002" } }, printRes);
    assert.strictEqual(printRes.code, 400);
    assert.match(printRes.body.error, /Print code already redeemed or job not paid/);

    // Verify job remains in state printing with kiosk SV-002
    const job = fake.data("print_jobs").j_active;
    assert.strictEqual(job.status, "printing");
    assert.strictEqual(job.kioskId, "SV-002");
  });
});

