const axios = require("axios");
const cors = require("cors");
const express = require("express");
const { CASHFREE_BASE_URL, cashfreeHeaders } = require("./config/env");
const { admin, db } = require("./config/firebase");
const { isColorJob } = require("./services/printJob.service");

const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get("/", (req, res) => res.send("Mimo Firebase Serverless is LIVE 🚀"));

// ================= ROUTES =================
app.use(require("./routes/auth.routes"));
app.use(require("./routes/user.routes"));
app.use(require("./routes/upload.routes"));
app.use(require("./routes/payment.routes"));
app.use(require("./routes/print.routes"));
app.use(require("./routes/public.routes"));
app.use(require("./routes/admin.routes"));
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

module.exports = app;
