const express = require("express");
const { authMiddleware } = require("../middleware/auth");
const upload = require("../controllers/upload.controller");

const router = express.Router();

router.post("/finalize-upload", authMiddleware, upload.postFinalizeUpload);
router.post("/generate-text-pdf", authMiddleware, upload.postGenerateTextPdf);
router.post("/create-blank-job", authMiddleware, upload.postCreateBlankJob);
router.delete("/remove-file", authMiddleware, upload.deleteRemoveFile);

module.exports = router;
