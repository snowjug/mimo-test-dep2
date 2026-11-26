// Kiosk festival themes: which UI each kiosk shows (the default UI, or a festival UI such as Christmas).
//
// Stored in Firestore mimo_settings/kiosk_themes as { themes: { "CV-001": "default", "SV-002": "christmas", ... },
// updatedAt, updatedBy }. The admin dashboard writes it (POST /admin/kiosk-themes); every kiosk polls
// GET /api/kiosk-theme?kioskId=... and switches its welcome screen on its own, with no reload or deploy.
// Anything missing, unknown or unreadable resolves to "default", so a bad value can never blank a kiosk.
const { db } = require("../config/firebase");

const KIOSK_THEMES = ["default", "christmas"];
const THEME_KIOSKS = ["CV-001", "SV-002", "SV-003"];
const DEFAULT_THEME = "default";

const themesRef = () => db.collection("mimo_settings").doc("kiosk_themes");

function cleanKioskId(value) {
  return String(value || "").trim().toUpperCase();
}

function sanitizeThemes(stored) {
  const out = {};
  for (const kioskId of THEME_KIOSKS) {
    const theme = stored && typeof stored === "object" ? stored[kioskId] : undefined;
    out[kioskId] = KIOSK_THEMES.includes(theme) ? theme : DEFAULT_THEME;
  }
  return out;
}

async function readThemes() {
  const doc = await themesRef().get();
  const data = doc.exists ? doc.data() || {} : {};
  return { themes: sanitizeThemes(data.themes), updatedAt: data.updatedAt || null, updatedBy: data.updatedBy || null };
}

// GET /api/kiosk-theme?kioskId=SV-002 (public, polled by the kiosks)
const getApiKioskTheme = async (req, res) => {
  const kioskId = cleanKioskId(req.query && req.query.kioskId);
  if (typeof res.set === "function") res.set("Cache-Control", "no-store");
  try {
    const { themes, updatedAt } = await readThemes();
    res.json({ kioskId: kioskId || null, theme: themes[kioskId] || DEFAULT_THEME, updatedAt });
  } catch (err) {
    console.error("[KIOSK-THEME] read failed:", err.message);
    // A kiosk must always get an answer it can render: fall back to the default UI.
    res.json({ kioskId: kioskId || null, theme: DEFAULT_THEME, updatedAt: null, fallback: true });
  }
};

// GET /admin/kiosk-themes (admin)
const getAdminKioskThemes = async (req, res) => {
  try {
    const { themes, updatedAt, updatedBy } = await readThemes();
    res.json({ themes, available: KIOSK_THEMES, kiosks: THEME_KIOSKS, updatedAt, updatedBy });
  } catch (err) {
    res.status(500).json({ error: "Could not load kiosk themes." });
  }
};

// POST /admin/kiosk-themes { themes: { "SV-002": "christmas" } } (admin) — only the kiosks sent are changed
const postAdminKioskThemes = async (req, res) => {
  try {
    const incoming = req.body && req.body.themes;
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
      return res.status(400).json({ error: "themes must be an object like { \"SV-002\": \"christmas\" }" });
    }
    const updates = {};
    for (const [rawId, theme] of Object.entries(incoming)) {
      const kioskId = cleanKioskId(rawId);
      if (!THEME_KIOSKS.includes(kioskId)) {
        return res.status(400).json({ error: `Unknown kiosk ${rawId}. Known: ${THEME_KIOSKS.join(", ")}` });
      }
      if (!KIOSK_THEMES.includes(theme)) {
        return res.status(400).json({ error: `Unknown theme ${theme}. Available: ${KIOSK_THEMES.join(", ")}` });
      }
      updates[kioskId] = theme;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No kiosk themes to update." });
    }
    const current = await readThemes();
    const themes = { ...current.themes, ...updates };
    const updatedAt = new Date().toISOString();
    const updatedBy = (req.user && (req.user.email || req.user.username || req.user.uid)) || "admin";
    await themesRef().set({ themes, updatedAt, updatedBy }, { merge: true });
    res.json({ success: true, themes, updatedAt });
  } catch (err) {
    console.error("[KIOSK-THEME] save failed:", err.message);
    res.status(500).json({ error: "Could not save kiosk themes." });
  }
};

module.exports = { getApiKioskTheme, getAdminKioskThemes, postAdminKioskThemes, KIOSK_THEMES, THEME_KIOSKS, DEFAULT_THEME };
