const express = require("express");
const { authMiddleware } = require("../middleware/auth");
const {
  postCreateSession,
  getSession,
  postAddPage,
  deletePage,
  postReorderPages,
  patchPage,
  postFinalizeSession,
} = require("./scanner.controller");

const router = express.Router();

router.post("/sessions", authMiddleware, postCreateSession);
router.get("/sessions/:sessionId", authMiddleware, getSession);
router.post("/sessions/:sessionId/pages", authMiddleware, postAddPage);
router.delete("/sessions/:sessionId/pages/:pageId", authMiddleware, deletePage);
router.patch("/sessions/:sessionId/pages/:pageId", authMiddleware, patchPage);
router.post("/sessions/:sessionId/reorder", authMiddleware, postReorderPages);
router.post("/sessions/:sessionId/finalize", authMiddleware, postFinalizeSession);

module.exports = router;
