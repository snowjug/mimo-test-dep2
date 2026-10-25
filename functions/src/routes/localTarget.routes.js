// Local-dev-only, unauthenticated status endpoint so the frontend can show a banner when the
// local backend's Firestore connection is pointed at real production data. Reveals no data,
// only which Firestore target this local backend instance is configured against.
const express = require("express");

const router = express.Router();

router.get("/admin/_local-target", (req, res) => {
  const target = process.env.LOCAL_TARGET === "production" ? "production" : "emulator";
  res.json({ target });
});

module.exports = router;
