const { admin, db } = require("../config/firebase");
const { parseMultipartForm, uploadBufferToStorage } = require("../services/mediaUpload.service");

const ADS_COLLECTION = "ads";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Strip any JS/HTML from user-supplied text to prevent stored-XSS. */
const sanitize = (val) =>
  typeof val === "string" ? val.replace(/[<>"'`]/g, "") : "";

const toMs = (ts) =>
  ts?.toMillis ? ts.toMillis() : ts?._seconds ? ts._seconds * 1000 : null;

const serializeAd = (id, data) => ({
  id,
  imageUrl: data.imageUrl || null,
  link: data.link || null,
  caption: data.caption || null,
  isActive: data.isActive !== false, // default true
  order: typeof data.order === "number" ? data.order : 0,
  createdAt: toMs(data.createdAt),
  updatedAt: toMs(data.updatedAt),
});

/** Fetches all ads without relying on a Firestore composite index. */
const fetchAllAds = async () => {
  const snap = await db.collection(ADS_COLLECTION).get();
  return snap.docs
    .map((d) => serializeAd(d.id, d.data()))
    .sort((a, b) => a.order - b.order);
};

// ─── ADMIN: upload image to Firebase Storage ──────────────────────────────────
const postAdminAdImage = async (req, res) => {
  try {
    const parsed = await parseMultipartForm(req, "image");
    if (!parsed || !parsed.file) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const { file } = parsed;
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
    if (!allowedTypes.includes(file.mimeType)) {
      return res.status(400).json({ error: "Only JPEG, PNG, GIF, WebP, or SVG images are allowed" });
    }

    const url = await uploadBufferToStorage("ads", `ad_${Date.now()}`, file);
    res.json({ imageUrl: url });
  } catch (err) {
    if (err.status === 413) return res.status(413).json({ error: "Image too large (max 10 MB)" });
    res.status(500).json({ error: err.message });
  }
};

// ─── ADMIN: list all ads ─────────────────────────────────────────────────────
const getAdminAds = async (req, res) => {
  try {
    const ads = await fetchAllAds();
    res.json({ ads });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── ADMIN: create ad ────────────────────────────────────────────────────────
const postAdminAd = async (req, res) => {
  try {
    const { imageUrl, link, caption } = req.body;

    // Get current max order
    const all = await fetchAllAds();
    const maxOrder = all.length > 0 ? Math.max(...all.map((a) => a.order)) + 1 : 0;

    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = await db.collection(ADS_COLLECTION).add({
      imageUrl: sanitize(imageUrl || ""),
      link: sanitize(link || ""),
      caption: sanitize(caption || ""),
      isActive: true,
      order: maxOrder,
      createdAt: now,
      updatedAt: now,
    });
    res.status(201).json({ id: ref.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── ADMIN: update ad ────────────────────────────────────────────────────────
const patchAdminAd = async (req, res) => {
  try {
    const { adId } = req.params;
    const ref = db.collection(ADS_COLLECTION).doc(adId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Ad not found" });

    const update = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (req.body.imageUrl !== undefined) update.imageUrl = sanitize(req.body.imageUrl);
    if (req.body.link !== undefined) update.link = sanitize(req.body.link);
    if (req.body.caption !== undefined) update.caption = sanitize(req.body.caption);
    if (req.body.isActive !== undefined) update.isActive = Boolean(req.body.isActive);
    if (req.body.order !== undefined) update.order = Number(req.body.order);

    await ref.update(update);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── ADMIN: delete ad ────────────────────────────────────────────────────────
const deleteAdminAd = async (req, res) => {
  try {
    const { adId } = req.params;
    const ref = db.collection(ADS_COLLECTION).doc(adId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Ad not found" });
    await ref.delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── ADMIN: reorder ads ───────────────────────────────────────────────────────
const postAdminAdsReorder = async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: "items must be an array" });

    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();
    for (const item of items) {
      if (!item.id || typeof item.order !== "number") continue;
      batch.update(db.collection(ADS_COLLECTION).doc(item.id), { order: item.order, updatedAt: now });
    }
    await batch.commit();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── PUBLIC: get active ads ───────────────────────────────────────────────────
const getPublicAds = async (req, res) => {
  try {
    const all = await fetchAllAds();
    const active = all
      .filter((a) => a.isActive)
      .map(({ id, imageUrl, link, caption }) => ({ id, imageUrl, link, caption }));
    res.json({ ads: active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  postAdminAdImage,
  getAdminAds,
  postAdminAd,
  patchAdminAd,
  deleteAdminAd,
  postAdminAdsReorder,
  getPublicAds,
};
