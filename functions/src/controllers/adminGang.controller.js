/**
 * "MIMO GANG" — the single admin-dashboard page that replaces three separate Technical/HR/Marketing nav
 * links. Shows what each department is doing (tasks, who's assigned, by whom) and lets Admin change it
 * directly, plus a GitHub-style login-streak view per member. Every write here is attributed to "Admin"
 * in the shared activity_log, same collection each department's own portal already writes into.
 */
const { admin, db } = require("../config/firebase");

const TASK_STATUSES = ["backlog", "assigned", "in_progress", "blocked", "in_review", "completed"];
const TASK_PRIORITIES = ["low", "medium", "high", "critical"];
const MARKETING_STATUSES = ["planned", "in_progress", "completed"];
const MARKETING_PRIORITIES = ["low", "medium", "high"];
const EMPLOYEE_STATUSES = ["onboarding", "active", "offboarded"];
const DEFAULT_LEAVE_BALANCE = { paid: 18, sick: 8, casual: 6 };

const adminActor = (req) => ({ id: "admin", name: (req.admin && req.admin.email) || "Admin" });

const logActivity = async (department, actorName, description, extra = {}) => {
  await db.collection("activity_log").add({
    actorId: "admin",
    actorName,
    description,
    department,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...extra,
  });
};

const sortNewestFirst = (docs, field) => {
  const ms = (v) => (v?.toMillis ? v.toMillis() : v?._seconds ? v._seconds * 1000 : v ? new Date(v).getTime() : 0);
  return docs.sort((a, b) => ms(b[field]) - ms(a[field]));
};

// ================= LOGIN STREAKS =================
// GET /admin/gang/login-streaks -> { "technical_team_dibya": ["2026-10-01", "2026-10-02", ...], ... }
const getLoginStreaks = async (req, res) => {
  try {
    const snap = await db.collection("login_events").limit(20000).get();
    const byMember = {};
    snap.forEach((d) => {
      const { collection, memberId, date } = d.data();
      if (!collection || !memberId || !date) return;
      const key = `${collection}_${memberId}`;
      if (!byMember[key]) byMember[key] = [];
      byMember[key].push(date);
    });
    Object.values(byMember).forEach((dates) => dates.sort());
    res.json({ streaks: byMember });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ================= TECHNICAL TASKS (admin view/edit) =================
const getAdminTechnicalTasks = async (req, res) => {
  try {
    const snap = await db.collection("tasks").limit(500).get();
    res.json({ tasks: sortNewestFirst(snap.docs.map((d) => ({ id: d.id, ...d.data() })), "createdAt") });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const postAdminTechnicalTask = async (req, res) => {
  try {
    const { title, description, assigneeId, priority, dueAtMs, relatedMachine } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required" });
    if (!assigneeId) return res.status(400).json({ error: "assigneeId is required" });
    if (priority && !TASK_PRIORITIES.includes(priority)) return res.status(400).json({ error: "Invalid priority" });

    const assigneeDoc = await db.collection("technical_team").doc(assigneeId).get();
    if (!assigneeDoc.exists) return res.status(404).json({ error: "Assignee not found" });

    const actor = adminActor(req);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = await db.collection("tasks").add({
      title: String(title).trim(),
      description: description ? String(description).trim() : "",
      creatorId: actor.id,
      creatorName: actor.name,
      assigneeId,
      assigneeName: assigneeDoc.data().name,
      department: "technical",
      priority: priority || "medium",
      status: "assigned",
      dueAtMs: dueAtMs ? Number(dueAtMs) : null,
      relatedMachine: relatedMachine || null,
      tags: [],
      comments: [],
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    });
    await logActivity("technical", actor.name, `assigned "${title}" to ${assigneeDoc.data().name}`, { targetType: "task", targetId: ref.id });
    res.status(201).json({ id: ref.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const patchAdminTechnicalTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const ref = db.collection("tasks").doc(taskId);
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
      changes.push(`priority -> ${req.body.priority}`);
    }
    if (req.body.assigneeId !== undefined) {
      const assigneeDoc = await db.collection("technical_team").doc(req.body.assigneeId).get();
      if (!assigneeDoc.exists) return res.status(404).json({ error: "Assignee not found" });
      update.assigneeId = req.body.assigneeId;
      update.assigneeName = assigneeDoc.data().name;
      changes.push(`reassigned to ${assigneeDoc.data().name}`);
    }
    if (req.body.title !== undefined) update.title = String(req.body.title).trim();
    if (req.body.description !== undefined) update.description = String(req.body.description).trim();
    if (req.body.dueAtMs !== undefined) update.dueAtMs = req.body.dueAtMs ? Number(req.body.dueAtMs) : null;

    await ref.update(update);
    const actor = adminActor(req);
    if (changes.length) await logActivity("technical", actor.name, `updated "${task.title}": ${changes.join(", ")}`, { targetType: "task", targetId: taskId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ================= MARKETING TASKS (admin view/edit) =================
const getAdminMarketingTasks = async (req, res) => {
  try {
    const snap = await db.collection("marketing_tasks").limit(500).get();
    res.json({ tasks: sortNewestFirst(snap.docs.map((d) => ({ id: d.id, ...d.data() })), "createdAt") });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const postAdminMarketingTask = async (req, res) => {
  try {
    const { title, description, channel, priority, dueAtMs } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required" });
    if (priority && !MARKETING_PRIORITIES.includes(priority)) return res.status(400).json({ error: "Invalid priority" });

    const actor = adminActor(req);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = await db.collection("marketing_tasks").add({
      title: String(title).trim(),
      description: description ? String(description).trim() : "",
      channel: channel ? String(channel).trim() : "general",
      priority: priority || "medium",
      status: "planned",
      dueAtMs: dueAtMs ? Number(dueAtMs) : null,
      createdBy: actor.id,
      createdByName: actor.name,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    });
    await logActivity("marketing", actor.name, `planned "${title}"`, { targetType: "marketing_task", targetId: ref.id });
    res.status(201).json({ id: ref.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const patchAdminMarketingTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const ref = db.collection("marketing_tasks").doc(taskId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Task not found" });
    const task = doc.data();

    const update = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    const changes = [];
    if (req.body.status !== undefined) {
      if (!MARKETING_STATUSES.includes(req.body.status)) return res.status(400).json({ error: "Invalid status" });
      update.status = req.body.status;
      if (req.body.status === "completed") update.completedAt = admin.firestore.FieldValue.serverTimestamp();
      changes.push(`status -> ${req.body.status}`);
    }
    if (req.body.priority !== undefined) {
      if (!MARKETING_PRIORITIES.includes(req.body.priority)) return res.status(400).json({ error: "Invalid priority" });
      update.priority = req.body.priority;
    }
    if (req.body.title !== undefined) update.title = String(req.body.title).trim();
    if (req.body.description !== undefined) update.description = String(req.body.description).trim();
    if (req.body.channel !== undefined) update.channel = String(req.body.channel).trim();
    if (req.body.dueAtMs !== undefined) update.dueAtMs = req.body.dueAtMs ? Number(req.body.dueAtMs) : null;

    await ref.update(update);
    const actor = adminActor(req);
    if (changes.length) await logActivity("marketing", actor.name, `updated "${task.title}": ${changes.join(", ")}`, { targetType: "marketing_task", targetId: taskId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ================= HR (admin write — same actions hr.controller.js exposes to HR itself) =================
const patchAdminEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const ref = db.collection("employees").doc(employeeId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Employee not found" });
    const employee = doc.data();

    const update = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    const changes = [];
    if (req.body.title !== undefined) { update.title = String(req.body.title).trim(); changes.push("title updated"); }
    if (req.body.status !== undefined) {
      if (!EMPLOYEE_STATUSES.includes(req.body.status)) return res.status(400).json({ error: "Invalid status" });
      update.status = req.body.status;
      if (req.body.status === "active") update.onboardingChecklist = [];
      if (req.body.status === "offboarded") update.offboardedAt = admin.firestore.FieldValue.serverTimestamp();
      changes.push(`status -> ${req.body.status}`);
    }

    await ref.update(update);
    const actor = adminActor(req);
    if (changes.length) await logActivity("hr", actor.name, `updated ${employee.name}: ${changes.join(", ")}`, { targetType: "employee", targetId: employeeId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const patchAdminEmployeeOnboarding = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const ref = db.collection("employees").doc(employeeId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Employee not found" });
    const employee = doc.data();
    let checklist = Array.isArray(employee.onboardingChecklist) ? [...employee.onboardingChecklist] : [];

    if (req.body.newTask) {
      checklist.push({ task: String(req.body.newTask).trim(), done: false });
    } else if (typeof req.body.index === "number") {
      if (!checklist[req.body.index]) return res.status(400).json({ error: "Invalid checklist index" });
      checklist[req.body.index] = { ...checklist[req.body.index], done: !!req.body.done };
    } else {
      return res.status(400).json({ error: "Provide either newTask or index+done" });
    }

    await ref.update({ onboardingChecklist: checklist, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ onboardingChecklist: checklist });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const patchAdminLeaveRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, decisionNote } = req.body;
    if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });

    const ref = db.collection("leave_requests").doc(requestId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Leave request not found" });
    const request = doc.data();
    if (request.status !== "pending") return res.status(409).json({ error: "This request has already been decided" });

    const actor = adminActor(req);
    await ref.update({
      status,
      decidedBy: actor.id,
      decidedByName: actor.name,
      decidedAt: admin.firestore.FieldValue.serverTimestamp(),
      decisionNote: decisionNote ? String(decisionNote).trim() : "",
    });

    if (status === "approved" && request.type !== "unpaid") {
      const empRef = db.collection("employees").doc(request.employeeId);
      const empDoc = await empRef.get();
      if (empDoc.exists) {
        const balance = empDoc.data().leaveBalance || { ...DEFAULT_LEAVE_BALANCE };
        const remaining = Math.max(0, (balance[request.type] ?? 0) - request.days);
        await empRef.update({ [`leaveBalance.${request.type}`]: remaining });
      }
    }

    await logActivity("hr", actor.name, `${status} ${request.employeeName}'s leave request (${request.days} day${request.days > 1 ? "s" : ""})`, { targetType: "leave_request", targetId: requestId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getLoginStreaks,
  getAdminTechnicalTasks,
  postAdminTechnicalTask,
  patchAdminTechnicalTask,
  getAdminMarketingTasks,
  postAdminMarketingTask,
  patchAdminMarketingTask,
  patchAdminEmployee,
  patchAdminEmployeeOnboarding,
  patchAdminLeaveRequest,
};
