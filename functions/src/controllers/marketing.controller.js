const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { getSecretKey } = require("../config/env");
const { admin, db } = require("../config/firebase");
const { recordLogin } = require("../services/loginStreak.service");
const profile = require("./profile.controller");
const chat = require("./chat.controller");

const TASK_STATUSES = ["planned", "in_progress", "completed"];
const TASK_PRIORITIES = ["low", "medium", "high"];

const logActivity = async (actorId, actorName, description, extra = {}) => {
  await db.collection("activity_log").add({
    actorId,
    actorName,
    description,
    department: "marketing",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...extra,
  });
};

const sortNewestFirst = (docs, field) => {
  const ms = (v) => (v?.toMillis ? v.toMillis() : v?._seconds ? v._seconds * 1000 : v ? new Date(v).getTime() : 0);
  return docs.sort((a, b) => ms(b[field]) - ms(a[field]));
};

// ================= AUTH =================
const postMarketingLogin = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    const snap = await db.collection("marketing_team").where("email", "==", email).limit(1).get();
    if (snap.empty) return res.status(401).json({ error: "Invalid credentials" });

    const doc = snap.docs[0];
    const member = doc.data();
    if (member.status === "inactive") return res.status(403).json({ error: "This account has been deactivated" });

    const ok = await bcrypt.compare(password, member.passwordHash || "");
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ marketingMemberId: doc.id, role: member.role }, getSecretKey(), { expiresIn: "30d" });
    await recordLogin("marketing_team", doc.id);
    res.json({ token, member: { id: doc.id, name: member.name, role: member.role, email: member.email, avatarUrl: member.avatarUrl || null, dob: member.dob || null, joiningLetterUrl: member.joiningLetterUrl || null, collegeIdUrl: member.collegeIdUrl || null, citizenshipIdUrl: member.citizenshipIdUrl || null } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getMarketingMe = async (req, res) => {
  try {
    const { id, name, role, email } = req.marketingMember;
    const memberDoc = await db.collection("marketing_team").doc(id).get();
    const memberData = memberDoc.exists ? memberDoc.data() : {};
    const tasksSnap = await db.collection("marketing_tasks").get();
    const tasks = tasksSnap.docs.map((d) => d.data());
    res.json({
      member: { id, name, role, email, avatarUrl: memberData.avatarUrl || null, dob: memberData.dob || null, joiningLetterUrl: memberData.joiningLetterUrl || null, collegeIdUrl: memberData.collegeIdUrl || null, citizenshipIdUrl: memberData.citizenshipIdUrl || null },
      stats: {
        planned: tasks.filter((t) => t.status === "planned").length,
        inProgress: tasks.filter((t) => t.status === "in_progress").length,
        completed: tasks.filter((t) => t.status === "completed").length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ================= CAMPAIGN / TASK TRACKER (the one page) =================
const getMarketingTasks = async (req, res) => {
  try {
    const snap = await db.collection("marketing_tasks").limit(200).get();
    res.json({ tasks: sortNewestFirst(snap.docs.map((d) => ({ id: d.id, ...d.data() })), "createdAt") });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const postMarketingTask = async (req, res) => {
  try {
    const { title, description, channel, priority, dueAtMs } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required" });
    if (priority && !TASK_PRIORITIES.includes(priority)) return res.status(400).json({ error: "Invalid priority" });

    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = await db.collection("marketing_tasks").add({
      title: String(title).trim(),
      description: description ? String(description).trim() : "",
      channel: channel ? String(channel).trim() : "general",
      priority: priority || "medium",
      status: "planned",
      dueAtMs: dueAtMs ? Number(dueAtMs) : null,
      createdBy: req.marketingMember.id,
      createdByName: req.marketingMember.name,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    });
    await logActivity(req.marketingMember.id, req.marketingMember.name, `planned "${title}"`, { targetType: "marketing_task", targetId: ref.id });
    res.status(201).json({ id: ref.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const patchMarketingTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const ref = db.collection("marketing_tasks").doc(taskId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Task not found" });
    const task = doc.data();

    const update = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    const changes = [];
    if (req.body.status !== undefined) {
      if (!TASK_STATUSES.includes(req.body.status)) return res.status(400).json({ error: "Invalid status" });
      update.status = req.body.status;
      if (req.body.status === "completed") update.completedAt = admin.firestore.FieldValue.serverTimestamp();
      changes.push(`status -> ${req.body.status}`);
    }
    if (req.body.priority !== undefined) {
      if (!TASK_PRIORITIES.includes(req.body.priority)) return res.status(400).json({ error: "Invalid priority" });
      update.priority = req.body.priority;
    }
    if (req.body.title !== undefined) update.title = String(req.body.title).trim();
    if (req.body.description !== undefined) update.description = String(req.body.description).trim();
    if (req.body.channel !== undefined) update.channel = String(req.body.channel).trim();
    if (req.body.dueAtMs !== undefined) update.dueAtMs = req.body.dueAtMs ? Number(req.body.dueAtMs) : null;

    await ref.update(update);
    if (changes.length) await logActivity(req.marketingMember.id, req.marketingMember.name, `updated "${task.title}": ${changes.join(", ")}`, { targetType: "marketing_task", targetId: taskId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const patchMarketingProfile = async (req, res) => {
  try {
    const result = await profile.updateMemberProfile(req, "marketing_team", req.marketingMember.id);
    res.json({ member: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

const postMarketingProfileDocument = async (req, res) => {
  try {
    const result = await profile.uploadMemberDocument(req, "marketing_team", req.marketingMember.id, req.params.docType);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

const postMarketingChangePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    await profile.changeMemberPassword("marketing_team", req.marketingMember.id, currentPassword, newPassword);
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

const getMarketingChatMessages = async (req, res) => {
  try {
    res.json({ messages: await chat.getChatMessages("marketing") });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const postMarketingChatMessage = async (req, res) => {
  try {
    const member = req.marketingMember;
    const memberDoc = await db.collection("marketing_team").doc(member.id).get();
    const avatarUrl = memberDoc.exists ? memberDoc.data().avatarUrl || null : null;
    const message = await chat.postChatMessage(req, "marketing", { id: member.id, name: member.name, avatarUrl });
    res.json({ message });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

module.exports = {
  postMarketingLogin,
  getMarketingMe,
  getMarketingTasks,
  postMarketingTask,
  patchMarketingTask,
  patchMarketingProfile,
  postMarketingProfileDocument,
  postMarketingChangePassword,
  getMarketingChatMessages,
  postMarketingChatMessage,
};
