const express = require("express");
const { authMiddleware } = require("../middleware/auth");
const { db } = require("../config/firebase");
const { createLimiters } = require("../middleware/rateLimit");
const auth = require("../controllers/auth.controller");

const router = express.Router();
const { loginLimiter } = createLimiters(db);

router.post("/register", loginLimiter, auth.postRegister);
router.post("/login", loginLimiter, auth.postLogin);
router.post("/google-login", auth.postGoogleLogin);
router.post("/onboarding", authMiddleware, auth.postOnboarding);
router.post("/guest-session", loginLimiter, auth.postGuestSession);

module.exports = router;
