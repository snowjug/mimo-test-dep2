const bcrypt = require("bcryptjs");
const { db } = require("../config/firebase");
const { parseMultipartForm, uploadBufferToStorage } = require("../services/mediaUpload.service");

function extractFields(req) {
  const contentType = req.headers["content-type"] || "";
  if (contentType.startsWith("multipart/form-data")) {
    return parseMultipartForm(req, "avatar");
  }
  return Promise.resolve({ fields: req.body || {}, file: null });
}

/** Generic profile update for a member-doc-backed portal (technical_team/hr_team/marketing_team). */
async function updateMemberProfile(req, collection, memberId) {
  const { fields, file } = await extractFields(req);
  const updates = {};
  if (typeof fields.name === "string" && fields.name.trim()) updates.name = fields.name.trim().slice(0, 100);
  if (typeof fields.dob === "string") updates.dob = fields.dob.trim().slice(0, 10); // "YYYY-MM-DD"
  if (file) {
    updates.avatarUrl = await uploadBufferToStorage(`avatars/${collection}`, memberId, file);
  }
  if (Object.keys(updates).length === 0) {
    throw Object.assign(new Error("Nothing to update"), { status: 400 });
  }
  await db.collection(collection).doc(memberId).update(updates);
  const doc = await db.collection(collection).doc(memberId).get();
  const data = doc.data();
  return {
    id: memberId, name: data.name, role: data.role, email: data.email, avatarUrl: data.avatarUrl || null, dob: data.dob || null,
    joiningLetterUrl: data.joiningLetterUrl || null, collegeIdUrl: data.collegeIdUrl || null, citizenshipIdUrl: data.citizenshipIdUrl || null,
  };
}

async function changeMemberPassword(collection, memberId, currentPassword, newPassword) {
  if (!newPassword || String(newPassword).length < 6) {
    throw Object.assign(new Error("New password must be at least 6 characters"), { status: 400 });
  }
  const ref = db.collection(collection).doc(memberId);
  const doc = await ref.get();
  if (!doc.exists) throw Object.assign(new Error("Account not found"), { status: 404 });
  const data = doc.data();
  const ok = await bcrypt.compare(String(currentPassword || ""), data.passwordHash || "");
  if (!ok) throw Object.assign(new Error("Current password is incorrect"), { status: 401 });
  const passwordHash = await bcrypt.hash(String(newPassword), 10);
  await ref.update({ passwordHash });
}

/** Admin/Finance: one shared role-level profile doc. There is no individual Firestore account for
 * these roles today (see admin.controller.js's env-var login), so this is name/photo/DOB only --
 * no password change here, since the shared credential lives in an env var, not a DB field a web
 * request can safely rotate. */
async function updateRoleProfile(req, role) {
  const { fields, file } = await extractFields(req);
  const updates = {};
  if (typeof fields.name === "string" && fields.name.trim()) updates.name = fields.name.trim().slice(0, 100);
  if (typeof fields.dob === "string") updates.dob = fields.dob.trim().slice(0, 10);
  if (file) {
    updates.avatarUrl = await uploadBufferToStorage("avatars/role_profiles", role, file);
  }
  if (Object.keys(updates).length === 0) {
    throw Object.assign(new Error("Nothing to update"), { status: 400 });
  }
  await db.collection("role_profiles").doc(role).set(updates, { merge: true });
  const doc = await db.collection("role_profiles").doc(role).get();
  return { role, ...doc.data() };
}

async function getRoleProfile(role) {
  const doc = await db.collection("role_profiles").doc(role).get();
  return { role, name: null, avatarUrl: null, dob: null, ...(doc.exists ? doc.data() : {}) };
}

// Optional identity documents -- never required (see postXXXDocument handlers): a profile that never
// uploads any of these still works exactly as before. Supporting-document upload only; `docType` is
// validated against this fixed allowlist so a request can't write an arbitrary Firestore field.
const DOCUMENT_TYPES = {
  joiningLetter: { urlField: "joiningLetterUrl", pathPrefix: "documents/joining-letter" },
  collegeId: { urlField: "collegeIdUrl", pathPrefix: "documents/college-id" },
  citizenshipId: { urlField: "citizenshipIdUrl", pathPrefix: "documents/citizenship-id" },
};

async function uploadMemberDocument(req, collection, memberId, docType) {
  const meta = DOCUMENT_TYPES[docType];
  if (!meta) throw Object.assign(new Error("Unknown document type"), { status: 400 });
  const parsed = await parseMultipartForm(req, "document");
  if (!parsed || !parsed.file) throw Object.assign(new Error("No document uploaded"), { status: 400 });
  const url = await uploadBufferToStorage(`${meta.pathPrefix}/${collection}`, memberId, parsed.file);
  await db.collection(collection).doc(memberId).update({ [meta.urlField]: url });
  return { [meta.urlField]: url };
}

async function uploadRoleDocument(req, role, docType) {
  const meta = DOCUMENT_TYPES[docType];
  if (!meta) throw Object.assign(new Error("Unknown document type"), { status: 400 });
  const parsed = await parseMultipartForm(req, "document");
  if (!parsed || !parsed.file) throw Object.assign(new Error("No document uploaded"), { status: 400 });
  const url = await uploadBufferToStorage(`${meta.pathPrefix}/role_profiles`, role, parsed.file);
  await db.collection("role_profiles").doc(role).set({ [meta.urlField]: url }, { merge: true });
  return { [meta.urlField]: url };
}

module.exports = {
  updateMemberProfile,
  changeMemberPassword,
  updateRoleProfile,
  getRoleProfile,
  uploadMemberDocument,
  uploadRoleDocument,
};
