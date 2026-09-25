const { db } = require("../config/firebase");
const { isColorJob } = require("../services/printJob.service");

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
      const usedSnap = await db.collection("print_jobs")
        .where("printCode", "==", printCode)
        .where("status", "in", ["completed", "printing", "refunded", "printed", "expired"])
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

    // Capability-based Routing Validation:
    // - Color jobs: ONLY allowed at MIMO 2.0 (SV-002)
    // - B&W jobs: allowed at EITHER MIMO 1.0 (CV-001) OR MIMO 2.0 (SV-002)
    const firstJob = snapshot.docs[0].data();
    const isColor = snapshot.docs.some(doc => isColorJob(doc.data()));

    if (isColor) {
      if (kioskId !== "SV-002") {
        return res.status(400).json({
          error: "This is a Color print job. Color printing is only available at Machine 2 (SV-002). Please use Machine 2."
        });
      }
    } else {
      if (kioskId !== "CV-001" && kioskId !== "SV-002") {
        return res.status(400).json({
          error: "Invalid printer station. Please use Machine 1 (CV-001) or Machine 2 (SV-002)."
        });
      }
    }

    const userId = firstJob.userId;

    let userName = "User";
    try {
      const userDoc = await db.collection("users").doc(userId).get();
      if (userDoc.exists) userName = userDoc.data().username || "User";
    } catch (e) { /* ignore */ }

    const documents = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        file: data.fileName || "Document",
        fileName: data.fileName || "Document",
        pages: data.pageCount || 1,
        copies: data.printOptions?.copies || 1,
        colorMode: data.printOptions?.colorMode || "bw",
        jobId: doc.id,
      };
    });

    res.json({ userName, name: userName, documents, printCode });
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

module.exports = {
  postGetDocumentsByCode,
  getGeneratePrintCode,
};
