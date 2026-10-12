const { admin, db } = require("../config/firebase");

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

// ─── ADMIN: list all ads ─────────────────────────────────────────────────────
const getAdminAds = async (req, res) => {
  try {
    const snap = await db.collection(ADS_COLLECTION).orderBy("order", "asc").get();
    const ads = snap.docs.map((d) => serializeAd(d.id, d.data()));
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
    const snap = await db.collection(ADS_COLLECTION).orderBy("order", "desc").limit(1).get();
    const maxOrder = snap.empty ? 0 : (snap.docs[0].data().order || 0) + 1;

    const now = admin.firestore.FieldValue.serverTimestamp();
    const docData = {
      imageUrl: sanitize(imageUrl || ""),
      link: sanitize(link || ""),
      caption: sanitize(caption || ""),
      isActive: true,
      order: maxOrder,
      createdAt: now,
      updatedAt: now,
    };

    const ref = await db.collection(ADS_COLLECTION).add(docData);
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

// ─── ADMIN: reorder ads (accepts array of { id, order }) ─────────────────────
const postAdminAdsReorder = async (req, res) => {
  try {
    const { items } = req.body; // [{ id, order }]
    if (!Array.isArray(items)) return res.status(400).json({ error: "items must be an array" });

    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();
    for (const item of items) {
      if (!item.id || typeof item.order !== "number") continue;
      batch.update(db.collection(ADS_COLLECTION).doc(item.id), {
        order: item.order,
        updatedAt: now,
      });
    }
    await batch.commit();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── PUBLIC: get active ads (no auth required) ───────────────────────────────
const getPublicAds = async (req, res) => {
  try {
    const snap = await db
      .collection(ADS_COLLECTION)
      .where("isActive", "==", true)
      .orderBy("order", "asc")
      .get();
    const ads = snap.docs.map((d) => serializeAd(d.id, d.data()));
    // Only expose safe fields to the public
    const safe = ads.map(({ id, imageUrl, link, caption }) => ({ id, imageUrl, link, caption }));
    res.json({ ads: safe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getAdminAds,
  postAdminAd,
  patchAdminAd,
  deleteAdminAd,
  postAdminAdsReorder,
  getPublicAds,
};
