const { db, admin } = require("../config/firebase");
const { parseMultipartForm, uploadBufferToStorage } = require("../services/mediaUpload.service");

// One shared Firestore collection for every portal's team chat, scoped by `channel`. A single
// implementation reused across Admin/Finance/Technical/HR/Marketing instead of five near-duplicate
// controllers -- each portal's routes just pass their own channel name and the caller's identity.
const MAX_TEXT_LENGTH = 4000;

async function getChatMessages(channel, limit = 60) {
  const snap = await db.collection("team_chat")
    .where("channel", "==", channel)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
}

/** sender: { id, name, avatarUrl }. Accepts either application/json ({ text }) for a text-only
 * message, or multipart/form-data (text field + optional `image` file) when a photo is attached --
 * the proof-of-work use case the HR/Technical/Finance/Admin pages all share. */
async function postChatMessage(req, channel, sender) {
  const contentType = req.headers["content-type"] || "";
  let text = "";
  let imageUrl = null;

  if (contentType.startsWith("multipart/form-data")) {
    const parsed = await parseMultipartForm(req, "image");
    text = String((parsed && parsed.fields && parsed.fields.text) || "").trim();
    if (parsed && parsed.file) {
      imageUrl = await uploadBufferToStorage(`chat/${channel}`, sender.id, parsed.file);
    }
  } else {
    text = String((req.body && req.body.text) || "").trim();
  }

  if (!text && !imageUrl) {
    throw Object.assign(new Error("Message needs text or an image"), { status: 400 });
  }
  text = text.slice(0, MAX_TEXT_LENGTH);

  const doc = {
    channel,
    text,
    imageUrl,
    senderId: sender.id,
    senderName: sender.name,
    senderAvatarUrl: sender.avatarUrl || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const ref = await db.collection("team_chat").add(doc);
  return { id: ref.id, ...doc, createdAt: new Date().toISOString() };
}

module.exports = { getChatMessages, postChatMessage };
