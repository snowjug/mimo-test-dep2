// Creates the initial HR account (Zafreen) and a single shared Marketing account, and backfills the new
// company-wide `employees` roster: one record per existing technical_team member (non-destructive — their
// technical_team login/role docs are never touched, only read), plus one record each for Zafreen and the
// Marketing seat. Dry-run by default; existence-guarded per doc, same pattern as seed-technical-team.js.
//
// Usage:
//   node scripts/seed-hr-and-marketing.js              # dry run — prints what would be created
//   node scripts/seed-hr-and-marketing.js --apply       # actually writes (prod, unless FIRESTORE_EMULATOR_HOST is set)
//
// Generated passwords are printed ONCE to this terminal and nowhere else.
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { db } = require("../src/config/firebase");

const HR = { id: "zafreen", name: "Zafreen", email: "zafreen@mimo.internal", role: "hr_lead" };
const MARKETING = { id: "marketing-team", name: "Marketing Team", email: "marketing@mimo.internal", role: "marketing" };
const DEFAULT_LEAVE_BALANCE = { paid: 18, sick: 8, casual: 6 };

const TECHNICAL_TITLES = { tech_lead: "Technical Lead", tech_member: "Technical Team Member" };

const genPassword = () => crypto.randomBytes(9).toString("base64url"); // 12 chars, URL-safe

async function seedLoginAccount({ collection, doc, employeeTitle, department, apply }) {
  if (!apply) {
    console.log(`Would create ${collection}/${doc.id}: ${doc.name} <${doc.email}> role=${doc.role}`);
    console.log(`Would create employees/<auto-id>: ${doc.name} (${department}, ${employeeTitle})`);
    return;
  }
  const existing = await db.collection(collection).doc(doc.id).get();
  if (existing.exists) {
    console.log(`${collection}/${doc.id} already exists — skipping login account`);
  } else {
    const password = genPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    await db.collection(collection).doc(doc.id).set({
      name: doc.name,
      email: doc.email,
      role: doc.role,
      status: "active",
      passwordHash,
      joinedAt: new Date().toISOString().slice(0, 10),
    });
    console.log(`Created ${doc.name} (${doc.role}) — email: ${doc.email}  password: ${password}`);
  }

  const employeesSnap = await db.collection("employees").where("loginRef.collection", "==", collection).where("loginRef.id", "==", doc.id).limit(1).get();
  if (!employeesSnap.empty) {
    console.log(`employees record for ${doc.name} already exists — skipping`);
    return;
  }
  const now = new Date();
  await db.collection("employees").add({
    name: doc.name,
    email: doc.email,
    department,
    title: employeeTitle,
    status: "active",
    phone: null,
    loginRef: { collection, id: doc.id },
    leaveBalance: { ...DEFAULT_LEAVE_BALANCE },
    onboardingChecklist: [],
    joinedAt: now.toISOString().slice(0, 10),
    offboardedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  console.log(`Created employees record for ${doc.name}`);
}

async function backfillTechnicalEmployees(apply) {
  const snap = await db.collection("technical_team").get();
  if (snap.empty) {
    console.log(apply ? "No technical_team members found to backfill." : "Would backfill employees records for each technical_team member found (none visible in dry run without emulator data).");
    return;
  }
  for (const doc of snap.docs) {
    const member = doc.data();
    const title = TECHNICAL_TITLES[member.role] || "Technical Team Member";
    if (!apply) {
      console.log(`Would create employees/<auto-id>: ${member.name} (technical, ${title}) linked to technical_team/${doc.id}`);
      continue;
    }
    const existing = await db.collection("employees").where("loginRef.collection", "==", "technical_team").where("loginRef.id", "==", doc.id).limit(1).get();
    if (!existing.empty) {
      console.log(`employees record for ${member.name} already exists — skipping`);
      continue;
    }
    const now = new Date();
    await db.collection("employees").add({
      name: member.name,
      email: member.email || null,
      department: "technical",
      title,
      status: "active",
      phone: null,
      loginRef: { collection: "technical_team", id: doc.id },
      leaveBalance: { ...DEFAULT_LEAVE_BALANCE },
      onboardingChecklist: [],
      joinedAt: member.joinedAt || now.toISOString().slice(0, 10),
      offboardedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Created employees record for ${member.name} (linked to technical_team/${doc.id})`);
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const target = process.env.FIRESTORE_EMULATOR_HOST ? `emulator (${process.env.FIRESTORE_EMULATOR_HOST})` : "PRODUCTION Firestore";
  console.log(`Target: ${target}`);
  console.log(apply ? "Mode: APPLY (will write)\n" : "Mode: DRY RUN (nothing will be written — pass --apply to write)\n");

  await seedLoginAccount({ collection: "hr_team", doc: HR, employeeTitle: "HR Lead", department: "hr", apply });
  await seedLoginAccount({ collection: "marketing_team", doc: MARKETING, employeeTitle: "Marketing Team", department: "marketing", apply });
  await backfillTechnicalEmployees(apply);

  console.log(apply ? "\nDone. Give Zafreen her printed password directly; it will not be shown again." : "\nDry run complete. Nothing was written.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
