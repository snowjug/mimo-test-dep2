const express = require("express");
const { authMiddleware } = require("../middleware/auth");
const user = require("../controllers/user.controller");

const router = express.Router();

router.get("/profile", authMiddleware, user.getProfile);
router.put("/profile", authMiddleware, user.putProfile);
router.get("/mimo/user", authMiddleware, user.getMimoUser);
router.get("/mimo/coins", authMiddleware, user.getMimoCoins);
router.get("/mimo/stats", authMiddleware, user.getMimoStats);
router.get("/print-history", authMiddleware, user.getPrintHistory);
router.get("/settings", authMiddleware, user.getSettings);
router.post("/settings", authMiddleware, user.postSettings);

module.exports = router;
