const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { SECRET_KEY } = require("../config/env");
const { admin, db } = require("../config/firebase");

const TASK_STATUSES = ["backlog", "assigned", "in_progress", "blocked", "in_review", "completed"];
const TASK_PRIORITIES = ["low", "medium", "high", "critical"];

/** Every important change writes one activity record. This is the company's operational history,
 * not just a technical-team log — other departments will read the same collection later. */
const logActivity = async (actorId, actorName, description, extra = {}) => {
  await db.collection("activity_log").add({
    actorId,
    actorName,
    description,
    department: "technical",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...extra,
  });
};

// ================= AUTH =================
const postTechnicalLogin = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    const snap = await db.collection("technical_team").where("email", "==", email).limit(1).get();
    if (snap.empty) return res.status(401).json({ error: "Invalid credentials" });

    const doc = snap.docs[0];
    const member = doc.data();
    if (member.status === "inactive") return res.status(403).json({ error: "This account has been deactivated" });

    const ok = await bcrypt.compare(password, member.passwordHash || "");
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ technicalMemberId: doc.id, role: member.role }, SECRET_KEY, { expiresIn: "12h" });
    res.json({ token, member: { id: doc.id, name: member.name, role: member.role, email: member.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getTechnicalMe = async (req, res) => {
  try {
    const { id } = req.technicalMember;
    const doc = await db.collection("technical_team").doc(id).get();
    const member = doc.data();

    const tasksSnap = await db.collection("tasks").where("assigneeId", "==", id).get();
    const tasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const now = Date.now();
    const toMs = (v) => (v?.toMillis ? v.toMillis() : v?._seconds ? v._seconds * 1000 : null);

    const active = tasks.filter((t) => t.status !== "completed");
    const completed = tasks.filter((t) => t.status === "completed");
    const overdue = active.filter((t) => t.dueAtMs && t.dueAtMs < now);
    const completionTimes = completed.filter((t) => t.createdAt && t.completedAt).map((t) => toMs(t.completedAt) - toMs(t.createdAt));
    const avgCompletionMs = completionTimes.length ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length : null;

    res.json({
      member: { id, name: member.name, role: member.role, email: member.email, skills: member.skills || [], joinedAt: member.joinedAt || null },
      stats: {
        activeTasks: active.length,
        completedTasks: completed.length,
        overdueTasks: overdue.length,
        completionRate: tasks.length ? Math.round((completed.length / tasks.length) * 100) : null,
        avgCompletionHours: avgCompletionMs !== null ? Math.round((avgCompletionMs / (1000 * 60 * 60)) * 10) / 10 : null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ================= TEAM =================
const getTechnicalTeam = async (req, res) => {
  try {
    const snap = await db.collection("technical_team").where("status", "!=", "inactive").get();
    const members = await Promise.all(
      snap.docs.map(async (d) => {
        const m = d.data();
        const tasksSnap = await db.collection("tasks").where("assigneeId", "==", d.id).get();
        const tasks = tasksSnap.docs.map((t) => t.data());
        const active = tasks.filter((t) => t.status !== "completed");
        const blocked = active.filter((t) => t.status === "blocked").length;
        return {
          id: d.id,
          name: m.name,
          role: m.role,
          skills: m.skills || [],
          activeTasks: active.length,
          blockedTasks: blocked,
          completedTasks: tasks.length - active.length,
        };
      })
    );
    res.json({ members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ================= TASKS =================
const getTechnicalTasks = async (req, res) => {
  try {
    const { assignee } = req.query; // "me" | a memberId | omitted (= everyone, read-only for non-leads)
    let query = db.collection("tasks");
    if (assignee === "me") query = query.where("assigneeId", "==", req.technicalMember.id);
    else if (assignee) query = query.where("assigneeId", "==", String(assignee));
    const snap = await query.orderBy("createdAt", "desc").limit(200).get();
    const tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const postTechnicalTask = async (req, res) => {
  try {
    const { title, description, assigneeId, priority, dueAtMs, relatedMachine, tags } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required" });
    if (!assigneeId) return res.status(400).json({ error: "assigneeId is required" });
    if (priority && !TASK_PRIORITIES.includes(priority)) return res.status(400).json({ error: "Invalid priority" });

    const assigneeDoc = await db.collection("technical_team").doc(assigneeId).get();
    if (!assigneeDoc.exists) return res.status(404).json({ error: "Assignee not found" });

    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = await db.collection("tasks").add({
      title: String(title).trim(),
      description: description ? String(description).trim() : "",
      creatorId: req.technicalMember.id,
      creatorName: req.technicalMember.name,
      assigneeId,
      assigneeName: assigneeDoc.data().name,
      department: "technical",
      priority: priority || "medium",
      status: "assigned",
      dueAtMs: dueAtMs ? Number(dueAtMs) : null,
      relatedMachine: relatedMachine || null,
      tags: Array.isArray(tags) ? tags.slice(0, 10) : [],
      comments: [],
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    });
    await logActivity(req.technicalMember.id, req.technicalMember.name, `assigned "${title}" to ${assigneeDoc.data().name}`, { targetType: "task", targetId: ref.id });
    res.status(201).json({ id: ref.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** Status/priority/assignee/due-date changes. Ownership rule: a member may change status/priority on their
 * OWN task (that's just doing the work); only the Technical Lead may reassign a task to someone else or
 * edit its title/description, mirroring "tasks can be edited by authorized people, reassigned when required". */
const patchTechnicalTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const ref = db.collection("tasks").doc(taskId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Task not found" });
    const task = doc.data();

    const isOwner = task.assigneeId === req.technicalMember.id;
    const isLead = req.technicalMember.role === "tech_lead";
    if (!isOwner && !isLead) return res.status(403).json({ error: "You can only update your own tasks" });

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
      changes.push(`priority -> ${req.body.priority}`);
    }
    if (req.body.assigneeId !== undefined) {
      if (!isLead) return res.status(403).json({ error: "Only the Technical Lead can reassign tasks" });
      const assigneeDoc = await db.collection("technical_team").doc(req.body.assigneeId).get();
      if (!assigneeDoc.exists) return res.status(404).json({ error: "Assignee not found" });
      update.assigneeId = req.body.assigneeId;
      update.assigneeName = assigneeDoc.data().name;
      changes.push(`reassigned to ${assigneeDoc.data().name}`);
    }
    if (req.body.dueAtMs !== undefined) {
      update.dueAtMs = req.body.dueAtMs ? Number(req.body.dueAtMs) : null;
      changes.push("due date changed");
    }
    if ((req.body.title !== undefined || req.body.description !== undefined) && !isLead) {
      return res.status(403).json({ error: "Only the Technical Lead can edit title/description" });
    }
    if (req.body.title !== undefined) update.title = String(req.body.title).trim();
    if (req.body.description !== undefined) update.description = String(req.body.description).trim();

    await ref.update(update);
    if (changes.length) {
      await logActivity(req.technicalMember.id, req.technicalMember.name, `updated "${task.title}": ${changes.join(", ")}`, { targetType: "task", targetId: taskId });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const postTechnicalTaskComment = async (req, res) => {
  try {
    const { taskId } = req.params;
    const body = String(req.body.body || "").trim();
    if (!body) return res.status(400).json({ error: "Comment body is required" });
    const ref = db.collection("tasks").doc(taskId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Task not found" });

    const comment = {
      id: db.collection("_").doc().id,
      authorId: req.technicalMember.id,
      authorName: req.technicalMember.name,
      body,
      createdAt: admin.firestore.Timestamp.now(),
    };
    await ref.update({
      comments: admin.firestore.FieldValue.arrayUnion(comment),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(201).json({ comment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ================= ANNOUNCEMENTS =================
const getTechnicalAnnouncements = async (req, res) => {
  try {
    const snap = await db.collection("announcements").where("department", "==", "technical").orderBy("createdAt", "desc").limit(20).get();
    res.json({ announcements: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const postTechnicalAnnouncement = async (req, res) => {
  try {
    const body = String(req.body.body || "").trim();
    if (!body) return res.status(400).json({ error: "Announcement body is required" });
    const ref = await db.collection("announcements").add({
      body,
      department: "technical",
      postedBy: req.technicalMember.id,
      postedByName: req.technicalMember.name,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await logActivity(req.technicalMember.id, req.technicalMember.name, "posted a team announcement", { targetType: "announcement", targetId: ref.id });
    res.status(201).json({ id: ref.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ================= ACTIVITY =================
const getTechnicalActivity = async (req, res) => {
  try {
    const snap = await db.collection("activity_log").where("department", "==", "technical").orderBy("createdAt", "desc").limit(50).get();
    res.json({ activity: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ================= WORK SESSIONS =================
/** A member has at most one open (no endedAt) session at a time. "Pause"/"resume" append timestamped
 * events rather than separate documents, so "today's timeline" is just one doc to read. */
const getOpenSession = async (memberId) => {
  const snap = await db.collection("work_sessions").where("memberId", "==", memberId).where("endedAt", "==", null).limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
};

const postWorkSessionStart = async (req, res) => {
  try {
    const { id, name } = req.technicalMember;
    const existing = await getOpenSession(id);
    if (existing) return res.status(409).json({ error: "A session is already active", session: existing });
    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = await db.collection("work_sessions").add({
      memberId: id,
      memberName: name,
      startedAt: now,
      endedAt: null,
      status: "active",
      events: [{ type: "started", at: admin.firestore.Timestamp.now() }],
    });
    res.status(201).json({ id: ref.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const postWorkSessionEvent = (eventType, newStatus) => async (req, res) => {
  try {
    const existing = await getOpenSession(req.technicalMember.id);
    if (!existing) return res.status(404).json({ error: "No active session" });
    await db.collection("work_sessions").doc(existing.id).update({
      status: newStatus,
      events: admin.firestore.FieldValue.arrayUnion({ type: eventType, at: admin.firestore.Timestamp.now(), taskId: req.body.taskId || null, taskTitle: req.body.taskTitle || null }),
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const postWorkSessionEnd = async (req, res) => {
  try {
    const existing = await getOpenSession(req.technicalMember.id);
    if (!existing) return res.status(404).json({ error: "No active session" });
    await db.collection("work_sessions").doc(existing.id).update({
      status: "ended",
      endedAt: admin.firestore.FieldValue.serverTimestamp(),
      events: admin.firestore.FieldValue.arrayUnion({ type: "ended", at: admin.firestore.Timestamp.now() }),
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getWorkSessionToday = async (req, res) => {
  try {
    const session = await getOpenSession(req.technicalMember.id);
    if (session) return res.json({ session });
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const snap = await db.collection("work_sessions")
      .where("memberId", "==", req.technicalMember.id)
      .where("startedAt", ">=", admin.firestore.Timestamp.fromDate(startOfDay))
      .orderBy("startedAt", "desc")
      .limit(1)
      .get();
    res.json({ session: snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ================= DAILY REPORTS ("What did you do today?") =================
const postDailyReport = async (req, res) => {
  try {
    const { summary, blockers, tomorrowPlan, completedTaskIds } = req.body;
    if (!summary || !String(summary).trim()) return res.status(400).json({ error: "A short summary is required" });
    const today = new Date().toISOString().slice(0, 10);
    const docId = `${req.technicalMember.id}_${today}`;
    await db.collection("daily_reports").doc(docId).set({
      memberId: req.technicalMember.id,
      memberName: req.technicalMember.name,
      date: today,
      summary: String(summary).trim(),
      blockers: blockers ? String(blockers).trim() : "",
      tomorrowPlan: tomorrowPlan ? String(tomorrowPlan).trim() : "",
      completedTaskIds: Array.isArray(completedTaskIds) ? completedTaskIds : [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await logActivity(req.technicalMember.id, req.technicalMember.name, "submitted their daily report");
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** Technical Lead reviews everyone's reports; a member reviews only their own history. */
const getDailyReports = async (req, res) => {
  try {
    const isLead = req.technicalMember.role === "tech_lead";
    const memberId = req.query.memberId;
    let query = db.collection("daily_reports").orderBy("date", "desc").limit(30);
    if (!isLead) query = db.collection("daily_reports").where("memberId", "==", req.technicalMember.id).orderBy("date", "desc").limit(30);
    else if (memberId) query = db.collection("daily_reports").where("memberId", "==", String(memberId)).orderBy("date", "desc").limit(30);
    const snap = await query.get();
    res.json({ reports: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  postTechnicalLogin,
  getTechnicalMe,
  getTechnicalTeam,
  getTechnicalTasks,
  postTechnicalTask,
  patchTechnicalTask,
  postTechnicalTaskComment,
  getTechnicalAnnouncements,
  postTechnicalAnnouncement,
  getTechnicalActivity,
  postWorkSessionStart,
  postWorkSessionPause: postWorkSessionEvent("paused", "paused"),
  postWorkSessionResume: postWorkSessionEvent("resumed", "active"),
  postWorkSessionEnd,
  getWorkSessionToday,
  postDailyReport,
  getDailyReports,
};
