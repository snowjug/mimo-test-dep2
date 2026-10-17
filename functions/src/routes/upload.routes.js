const express = require("express");
const { authMiddleware } = require("../middleware/auth");
const { db } = require("../config/firebase");
const { createLimiters } = require("../middleware/rateLimit");
const upload = require("../controllers/upload.controller");

const router = express.Router();
const { writeActionLimiter } = createLimiters(db);

router.post("/finalize-upload", authMiddleware, writeActionLimiter, upload.postFinalizeUpload);
router.post("/generate-text-pdf", authMiddleware, writeActionLimiter, upload.postGenerateTextPdf);
router.post("/create-blank-job", authMiddleware, writeActionLimiter, upload.postCreateBlankJob);
router.delete("/remove-file", authMiddleware, upload.deleteRemoveFile);

module.exports = router;
