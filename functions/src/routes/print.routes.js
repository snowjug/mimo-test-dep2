const express = require("express");
const { authMiddleware } = require("../middleware/auth");
const print = require("../controllers/print.controller");

const router = express.Router();

router.post("/get-documents-by-code", print.postGetDocumentsByCode);
router.get("/generate-print-code", authMiddleware, print.getGeneratePrintCode);

module.exports = router;
