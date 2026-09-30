const express = require("express");
const { authMiddleware } = require("../middleware/auth");
const {
  postCreateSession,
  postAddPage,
  postFinalizeSession,
} = require("./scanner.controller");

const router = express.Router();

router.post("/sessions", authMiddleware, postCreateSession);
router.post("/sessions/:sessionId/pages", authMiddleware, postAddPage);
router.post("/sessions/:sessionId/finalize", authMiddleware, postFinalizeSession);

module.exports = router;
