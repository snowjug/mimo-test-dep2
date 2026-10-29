const { db } = require("../config/firebase");
const { isColorJob, unprintableFilesForKiosk, unprintableFilesMessage } = require("../services/printJob.service");
const { loadMachinesMap, loadMachineTemplatesMap, describeDestination } = require("../services/machineRegistry.service");

// ================= KIOSK: GET DOCUMENTS BY CODE =================
const postGetDocumentsByCode = async (req, res) => {
  try {
    const { printCode, kioskId } = req.body;
    if (!printCode) return res.status(400).json({ error: "printCode required" });
    if (!kioskId) return res.status(400).json({ error: "Kiosk ID required" });

    const snapshot = await db.collection("print_jobs")
      .where("printCode", "==", printCode)
      .where("status", "==", "paid")
      .get();

    if (snapshot.empty) {
      // Secondary check: was this code already used (completed / refunded / printing)?
      // Bounded to the last 24h -- matches the window printCode.service.js's CODE_VALIDITY_MS already
      // documents codes as valid for. Without this bound, a code recycled from a job months old (now
      // free to reissue) permanently shadows any brand-new job that is handed the same code, incorrectly
      // telling the customer their code was "already used" (confirmed production incident, 2026-10-16:
      // printCode 9670 collided with a September job and blocked a same-day paid job from printing).
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const usedSnap = await db.collection("print_jobs")
        .where("printCode", "==", printCode)
        .where("status", "in", ["completed", "printing", "refunded", "printed", "expired"])
        .where("createdAt", ">=", dayAgo)
        .limit(1)
        .get();
      if (!usedSnap.empty) {
        const usedStatus = usedSnap.docs[0].data().status || "used";
        const msg = usedStatus === "refunded"
          ? "This print code has been refunded and can no longer be used."
          : "Print code already used. Your document has already been printed with this code.";
        return res.status(409).json({ error: msg });
      }
      return res.status(404).json({ error: "Invalid or expired print code" });
    }

    // Print-code allocation is atomic (printCode.service.js) and this should never find more than one
    // "paid" job for the same code -- but if it ever does (e.g. data predating the atomic-allocation fix,
    // or the same class of collision fixed in kiosk.routes.js's /print handler after a real production
    // incident), fail loudly instead of guessing: silently picking docs[0] could expose one customer's
    // document metadata (filename, page count) in a response meant for a different customer.
    let validDocs = snapshot.docs;

    if (validDocs.length > 1) {
      // Multiple paid docs found. Determine if they belong to the SAME order/customer,
      // or if one order is fresh (within 24h) and the other is a stale unprinted job from an earlier recycled allocation.
      const orderIds = new Set(validDocs.map((d) => d.data().orderId).filter(Boolean));
      const userIds = new Set(validDocs.map((d) => d.data().userId).filter(Boolean));
      const isSameOrder = (orderIds.size === 1) || (orderIds.size === 0 && userIds.size === 1);

      if (!isSameOrder) {
        const nowMs = Date.now();
        const VALIDITY_WINDOW_MS = 24 * 60 * 60 * 1000;
        const getDocTime = (doc) => {
          const d = doc.data();
          const ts = d.codeCreatedAt || d.paymentTime || d.createdAt || d.updatedAt || d.uploadedAt;
          if (ts && ts.toDate) return ts.toDate().getTime();
          if (ts && ts instanceof Date) return ts.getTime();
          if (typeof ts === "number") return ts;
          if (typeof ts === "string") {
            const parsed = Date.parse(ts);
            if (!isNaN(parsed)) return parsed;
          }
          return 0;
        };

        const freshDocs = validDocs.filter((d) => {
          const t = getDocTime(d);
          return t > 0 && (nowMs - t) < VALIDITY_WINDOW_MS;
        });

        if (freshDocs.length > 0) {
          const freshOrderIds = new Set(freshDocs.map((d) => d.data().orderId).filter(Boolean));
          const freshUserIds = new Set(freshDocs.map((d) => d.data().userId).filter(Boolean));
          const freshIsSameOrder = (freshOrderIds.size === 1) || (freshOrderIds.size === 0 && freshUserIds.size === 1);

          if (freshIsSameOrder) {
            validDocs = freshDocs;
          } else {
            console.error(`[PRINT-CODE COLLISION] code ${printCode} matches multiple distinct active orders within 24h: ${freshDocs.map((d) => d.id).join(", ")}`);
            return res.status(409).json({ error: "This code matched more than one order. Please contact support — do not retry." });
          }
        } else {
          // All matching jobs are older than 24h across multiple orders -- ambiguous collision
          console.error(`[PRINT-CODE COLLISION] code ${printCode} matches ${validDocs.length} paid jobs across different orders: ${validDocs.map((d) => d.id).join(", ")}`);
          return res.status(409).json({ error: "This code matched more than one order. Please contact support — do not retry." });
        }
      }
    }

    // Capability-based routing validation, driven by the machine registry: a machine must be a known, ACTIVE
    // destination, and a colour job must land on a machine whose template/override actually supports colour.
    const firstJob = validDocs[0].data();
    const isColor = validDocs.some(doc => isColorJob(doc.data()));

    const [machines, templates] = await Promise.all([loadMachinesMap(db), loadMachineTemplatesMap(db)]);
    const dest = describeDestination(machines, templates, kioskId);
    if (!dest.known || !dest.active) {
      return res.status(400).json({ error: "Invalid printer station. Please use a machine shown on the Find a Kiosk page." });
    }
    if (isColor && !dest.supportsColor) {
      return res.status(400).json({
        error: "This is a Color print job. This machine can only print black & white. Please use a colour-capable machine."
      });
    }

    const isExplicitlyRestricted = Boolean(
      firstJob.strictKiosk === true ||
      firstJob.directKioskRestriction === true ||
      firstJob.printOptions?.strictKiosk === true ||
      firstJob.printOptions?.directKioskRestriction === true
    );
    const restrictedKiosk = isExplicitlyRestricted
      ? (firstJob.printOptions?.directKioskId || firstJob.directKioskId || firstJob.kioskId)
      : null;
    if (restrictedKiosk && restrictedKiosk !== kioskId) {
      return res.status(403).json({
        error: `This print job is restricted to machine ${restrictedKiosk}.`
      });
    }

    const unprintable = unprintableFilesForKiosk(validDocs.map((doc) => doc.data()), kioskId);
    if (unprintable.length) {
      return res.status(400).json({ error: unprintableFilesMessage(unprintable) });
    }

    const userId = firstJob.userId;

    let userName = "User";
    try {
      const userDoc = await db.collection("users").doc(userId).get();
      if (userDoc.exists) userName = userDoc.data().username || "User";
    } catch (e) { /* ignore */ }

    const documents = validDocs.map(doc => {
      const data = doc.data();
      return {
        file: data.fileName || "Document",
        fileName: data.fileName || "Document",
        pages: data.pageCount || 1,
        copies: data.printOptions?.copies || 1,
        colorMode: data.colorMode || data.printOptions?.colorMode || (isColorJob(data) ? "color" : "bw"),
        jobId: doc.id,
      };
    });

    res.json({ userName, name: userName, documents, printCode, colorMode: isColor ? "color" : "bw" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
};

// ================= GENERATE PRINT CODE =================
const getGeneratePrintCode = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;

    const snapshot = await db
      .collection("print_jobs")
      .where("userId", "==", userId)
      .where("status", "==", "paid")
      .limit(1)
      .get();

    if (snapshot.empty) return res.status(400).json({ error: "No paid jobs found" });

    const data = snapshot.docs[0].data();
    res.json({
      printCode: data.printCode
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch print code" });
  }
};

// ================= PRINT SUMMARY =================
// (ported from the legacy Express server; handler body unchanged)
// ================= PRINT SUMMARY =================
const getPrintSummary = async (req, res) => {
  try {
    const userId = req.user.userId;
    const snapshot = await db
      .collection("print_jobs")
      .where("userId", "==", userId)
      .where("status", "==", "printing")
      .get();

    const totalPrints = snapshot.size;
    let totalPages = 0;
    let totalAmount = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      totalPages += data.pageCount || 0;
      totalAmount += (data.pageCount || 0) * 2.3;
    });

    res.json({
      totalPrints,
      totalPages,
      totalAmount: Number(totalAmount.toFixed(2)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to fetch summary");
  }
};

// ================= MARK PRINTED =================
// (ported from the legacy Express server; handler body unchanged)
const postMarkPrinted = async (req, res) => {
  try {
    const { printCode } = req.body;

    if (!printCode) {
      return res.status(400).json({ error: "Print code required" });
    }

    // Only the job owner may mark their own jobs printed (print codes are 4 digits and guessable;
    // without the userId filter any logged-in user could complete someone else's job, which also
    // triggers deletion of that user's stored files).
    const snapshot = await db
      .collection("print_jobs")
      .where("printCode", "==", printCode)
      .where("userId", "==", req.user.userId)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: "No jobs found" });
    }

    const batch = db.batch();

    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        isPrinted: true,
        printerStatus: "completed",
        status: "completed",
      });
    });

    await batch.commit();

    res.json({ message: "Print completed successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update print status" });
  }
};

module.exports = {
  postGetDocumentsByCode,
  getGeneratePrintCode,
  getPrintSummary,
  postMarkPrinted,
};
