const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { SECRET_KEY } = require("../config/env");
const { admin, db } = require("../config/firebase");
const { recordLogin } = require("../services/loginStreak.service");

const DEPARTMENTS = ["technical", "hr", "marketing", "finance", "admin"];
const EMPLOYEE_STATUSES = ["onboarding", "active", "offboarded"];
const LEAVE_TYPES = ["paid", "sick", "casual", "unpaid"];
const DEFAULT_LEAVE_BALANCE = { paid: 18, sick: 8, casual: 6 };
const DEFAULT_ONBOARDING_CHECKLIST = [
  "Collect contact details & emergency contact",
  "Create company email / accounts",
  "Grant access to required tools",
  "Introduce to team & manager",
  "Share handbook / policies",
];

/** Every important change writes one activity record — same shared history the Technical portal writes
 * into, so the Admin Command Center's cross-department feed is just one collection to read. */
const logActivity = async (actorId, actorName, description, extra = {}) => {
  await db.collection("activity_log").add({
    actorId,
    actorName,
    description,
    department: "hr",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...extra,
  });
};

const sortNewestFirst = (docs, field) => {
  const ms = (v) => (v?.toMillis ? v.toMillis() : v?._seconds ? v._seconds * 1000 : v ? new Date(v).getTime() : 0);
  return docs.sort((a, b) => ms(b[field]) - ms(a[field]));
};

// ================= AUTH =================
const postHrLogin = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    const snap = await db.collection("hr_team").where("email", "==", email).limit(1).get();
    if (snap.empty) return res.status(401).json({ error: "Invalid credentials" });

    const doc = snap.docs[0];
    const member = doc.data();
    if (member.status === "inactive") return res.status(403).json({ error: "This account has been deactivated" });

    const ok = await bcrypt.compare(password, member.passwordHash || "");
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ hrMemberId: doc.id, role: member.role }, SECRET_KEY, { expiresIn: "12h" });
    await recordLogin("hr_team", doc.id);
    res.json({ token, member: { id: doc.id, name: member.name, role: member.role, email: member.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getHrMe = async (req, res) => {
  try {
    const { id } = req.hrMember;
    const doc = await db.collection("hr_team").doc(id).get();
    const member = doc.data();

    const employeesSnap = await db.collection("employees").get();
    const employees = employeesSnap.docs.map((d) => d.data());
    const leaveSnap = await db.collection("leave_requests").where("status", "==", "pending").get();

    res.json({
      member: { id, name: member.name, role: member.role, email: member.email },
      stats: {
        totalEmployees: employees.filter((e) => e.status !== "offboarded").length,
        onboarding: employees.filter((e) => e.status === "onboarding").length,
        pendingLeaveRequests: leaveSnap.size,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ================= EMPLOYEES =================
const getEmployees = async (req, res) => {
  try {
    const { department, status } = req.query;
    let query = db.collection("employees");
    if (department && DEPARTMENTS.includes(department)) query = query.where("department", "==", department);
    if (status && EMPLOYEE_STATUSES.includes(status)) query = query.where("status", "==", status);
    const snap = await query.limit(500).get();
    const employees = sortNewestFirst(snap.docs.map((d) => ({ id: d.id, ...d.data() })), "createdAt");
    res.json({ employees });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const postEmployee = async (req, res) => {
  try {
    const { name, email, department, title, phone, startOnboarding } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: "Name is required" });
    if (!department || !DEPARTMENTS.includes(department)) return res.status(400).json({ error: "A valid department is required" });

    const now = admin.firestore.FieldValue.serverTimestamp();
    const status = startOnboarding === false ? "active" : "onboarding";
    const ref = await db.collection("employees").add({
      name: String(name).trim(),
      email: email ? String(email).trim().toLowerCase() : null,
      department,
      title: title ? String(title).trim() : "",
      phone: phone ? String(phone).trim() : null,
      status,
      loginRef: null,
      leaveBalance: { ...DEFAULT_LEAVE_BALANCE },
      onboardingChecklist: status === "onboarding" ? DEFAULT_ONBOARDING_CHECKLIST.map((task) => ({ task, done: false })) : [],
      joinedAt: new Date().toISOString().slice(0, 10),
      offboardedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await logActivity(req.hrMember.id, req.hrMember.name, `added ${name} (${department}) to the roster`, { targetType: "employee", targetId: ref.id });
    res.status(201).json({ id: ref.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const patchEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const ref = db.collection("employees").doc(employeeId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Employee not found" });
    const employee = doc.data();

    const update = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    const changes = [];

    if (req.body.title !== undefined) { update.title = String(req.body.title).trim(); changes.push("title updated"); }
    if (req.body.phone !== undefined) { update.phone = req.body.phone ? String(req.body.phone).trim() : null; changes.push("phone updated"); }
    if (req.body.department !== undefined) {
      if (!DEPARTMENTS.includes(req.body.department)) return res.status(400).json({ error: "Invalid department" });
      update.department = req.body.department;
      changes.push(`moved to ${req.body.department}`);
    }
    if (req.body.status !== undefined) {
      if (!EMPLOYEE_STATUSES.includes(req.body.status)) return res.status(400).json({ error: "Invalid status" });
      update.status = req.body.status;
      if (req.body.status === "active") update.onboardingChecklist = [];
      if (req.body.status === "offboarded") update.offboardedAt = admin.firestore.FieldValue.serverTimestamp();
      changes.push(`status -> ${req.body.status}`);
    }

    await ref.update(update);
    if (changes.length) {
      await logActivity(req.hrMember.id, req.hrMember.name, `updated ${employee.name}: ${changes.join(", ")}`, { targetType: "employee", targetId: employeeId });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** Toggle a single onboarding-checklist item, or append a custom one. */
const patchEmployeeOnboarding = async (req, res) => {
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

// ================= ATTENDANCE =================
const getAttendance = async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const snap = await db.collection("attendance").where("date", "==", date).get();
    res.json({ date, entries: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** One call marks a whole day at once — the realistic shape of "take attendance", not one request per person. */
const postAttendanceBulk = async (req, res) => {
  try {
    const { date, entries } = req.body;
    const day = date || new Date().toISOString().slice(0, 10);
    if (!Array.isArray(entries) || entries.length === 0) return res.status(400).json({ error: "entries[] is required" });

    const batch = db.batch();
    for (const entry of entries) {
      if (!entry.employeeId || !entry.employeeName) continue;
      const docId = `${entry.employeeId}_${day}`;
      batch.set(db.collection("attendance").doc(docId), {
        employeeId: entry.employeeId,
        employeeName: entry.employeeName,
        date: day,
        status: entry.status || "present",
        note: entry.note || "",
        markedBy: req.hrMember.id,
        markedByName: req.hrMember.name,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
    await logActivity(req.hrMember.id, req.hrMember.name, `marked attendance for ${entries.length} ${entries.length === 1 ? "person" : "people"} on ${day}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ================= LEAVE REQUESTS =================
const getLeaveRequests = async (req, res) => {
  try {
    const { status } = req.query;
    let query = db.collection("leave_requests");
    if (status) query = query.where("status", "==", String(status));
    const snap = await query.limit(200).get();
    res.json({ requests: sortNewestFirst(snap.docs.map((d) => ({ id: d.id, ...d.data() })), "createdAt") });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** HR files leave on an employee's behalf (no self-serve portal for most departments yet — see hr.routes.js). */
const postLeaveRequest = async (req, res) => {
  try {
    const { employeeId, type, fromDate, toDate, reason } = req.body;
    if (!employeeId || !fromDate || !toDate) return res.status(400).json({ error: "employeeId, fromDate and toDate are required" });
    if (type && !LEAVE_TYPES.includes(type)) return res.status(400).json({ error: "Invalid leave type" });

    const empDoc = await db.collection("employees").doc(employeeId).get();
    if (!empDoc.exists) return res.status(404).json({ error: "Employee not found" });

    const days = Math.max(1, Math.round((new Date(toDate) - new Date(fromDate)) / 86400000) + 1);
    const ref = await db.collection("leave_requests").add({
      employeeId,
      employeeName: empDoc.data().name,
      type: type || "paid",
      fromDate,
      toDate,
      days,
      reason: reason ? String(reason).trim() : "",
      status: "pending",
      decidedBy: null,
      decidedByName: null,
      decidedAt: null,
      decisionNote: "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await logActivity(req.hrMember.id, req.hrMember.name, `filed a ${days}-day leave request for ${empDoc.data().name}`, { targetType: "leave_request", targetId: ref.id });
    res.status(201).json({ id: ref.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** Approving deducts the days from the employee's balance for that leave type (floored at 0 — a negative
 * balance would just mean "took more than they had," which is a conversation, not a data integrity rule). */
const patchLeaveRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, decisionNote } = req.body;
    if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });

    const ref = db.collection("leave_requests").doc(requestId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Leave request not found" });
    const request = doc.data();
    if (request.status !== "pending") return res.status(409).json({ error: "This request has already been decided" });

    await ref.update({
      status,
      decidedBy: req.hrMember.id,
      decidedByName: req.hrMember.name,
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

    await logActivity(req.hrMember.id, req.hrMember.name, `${status} ${request.employeeName}'s leave request (${request.days} day${request.days > 1 ? "s" : ""})`, { targetType: "leave_request", targetId: requestId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ================= ACTIVITY =================
const getHrActivity = async (req, res) => {
  try {
    const snap = await db.collection("activity_log").where("department", "==", "hr").limit(50).get();
    res.json({ activity: sortNewestFirst(snap.docs.map((d) => ({ id: d.id, ...d.data() })), "createdAt") });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  postHrLogin,
  getHrMe,
  getEmployees,
  postEmployee,
  patchEmployee,
  patchEmployeeOnboarding,
  getAttendance,
  postAttendanceBulk,
  getLeaveRequests,
  postLeaveRequest,
  patchLeaveRequest,
  getHrActivity,
};
