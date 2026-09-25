const express = require("express");
const { authMiddleware } = require("../middleware/auth");
const auth = require("../controllers/auth.controller");

const router = express.Router();

router.post("/register", auth.postRegister);
router.post("/login", auth.postLogin);
router.post("/google-login", auth.postGoogleLogin);
router.post("/onboarding", authMiddleware, auth.postOnboarding);

module.exports = router;
