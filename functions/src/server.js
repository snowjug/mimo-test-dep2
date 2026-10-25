const axios = require("axios");
const cors = require("cors");
const express = require("express");
const { CASHFREE_BASE_URL, cashfreeHeaders } = require("./config/env");
const { admin, db } = require("./config/firebase");
const { isColorJob } = require("./services/printJob.service");
const { blockProductionWrites } = require("./middleware/blockProductionWrites");

const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: true }));
// Keep the exact request bytes (needed to verify webhook signatures). Cloud Functions already provides req.rawBody.
app.use(express.json({ verify: (req, res, buf) => { if (!req.rawBody) req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true }));
app.get("/", (req, res) => res.send("Mimo Firebase Serverless is LIVE 🚀"));
app.use(require("./routes/localTarget.routes"));

// Local-dev safety switch: when LOCAL_TARGET=production, blocks every write-capable request
// before any route below runs. No-op unless that env var is explicitly set. See
// src/middleware/blockProductionWrites.js.
app.use(blockProductionWrites);

// ================= ROUTES =================
app.use(require("./routes/auth.routes"));
app.use(require("./routes/user.routes"));
app.use(require("./routes/upload.routes"));
app.use(require("./routes/payment.routes"));
app.use(require("./routes/print.routes"));
app.use(require("./routes/public.routes"));
app.use(require("./routes/admin.routes"));
app.use(require("./routes/technical.routes"));
app.use(require("./routes/hr.routes"));
app.use(require("./routes/marketing.routes"));
app.use(require("./routes/whatsapp.routes"));

// ================= KIOSK SYNC ROUTES (ISOLATED & PROTECTED) =================
const { createKioskRouter } = require("./routes/kiosk.routes");
const kioskRouter = createKioskRouter({
  db,
  admin,
  isColorJob,
  CASHFREE_BASE_URL,
  cashfreeHeaders,
  axios
});
app.use("/kiosk", kioskRouter);

// ================= DOCUMENT SCANNER ROUTES =================
app.use("/scanner", require("./document-scanner/scanner.routes"));

// ================= MIMO EDGE GUARDIAN (PHASE 2B/2E, ISOLATED FROM THE KIOSK/PRINT ROUTER ABOVE) =================
// POST /kiosk/guardian/health (Phase 2B) and the read-only GET /admin/guardian/health (Phase 2E).
// Shares no code with createKioskRouter/kiosk.routes.js, and never touches system_status,
// kiosk_commands or print_jobs. See docs/architecture/MIMO_EDGE_GUARDIAN_PHASE_2A_CONTRACT.md.
app.use(require("./routes/guardianHealth.routes"));
app.use(require("./routes/guardianAdminHealth.routes"));

module.exports = app;
