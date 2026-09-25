const express = require("express");
const { authMiddleware } = require("../middleware/auth");
const { db } = require("../config/firebase");
const { createLimiters } = require("../middleware/rateLimit");
const print = require("../controllers/print.controller");

const router = express.Router();
const { codeGuessLimiter } = createLimiters(db);

router.post("/get-documents-by-code", codeGuessLimiter, print.postGetDocumentsByCode);
router.get("/generate-print-code", authMiddleware, print.getGeneratePrintCode);
router.get("/print-summary", authMiddleware, print.getPrintSummary);
router.post("/mark-printed", authMiddleware, print.postMarkPrinted);

module.exports = router;
