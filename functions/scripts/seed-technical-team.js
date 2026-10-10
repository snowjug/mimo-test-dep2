// Creates the initial technical_team members (Dibya as Technical Lead, Vignesh/Amrutha/Bindu/Chandana as
// members). Dry-run by default; a doc is only ever created once (existence guard, same pattern as
// seed-machine-registry.js / provision-machine.js) so re-running this never resets a password or role
// someone has since changed by hand in Firestore.
//
// Usage:
//   node scripts/seed-technical-team.js              # dry run — prints what would be created
//   node scripts/seed-technical-team.js --apply       # actually writes (prod, unless FIRESTORE_EMULATOR_HOST is set)
//
// Generated passwords are printed ONCE to this terminal and nowhere else — they are not logged, stored in
// a file, or committed. Give each person theirs directly and have them change it after first login (no
// change-password endpoint exists yet; that's a follow-up, not a blocker to using the system today).
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { db } = require("../src/config/firebase");

const TEAM = [
  { id: "dibya", name: "Dibya", email: "dibya@mimo.internal", role: "tech_lead", skills: ["Firebase", "Node.js", "React", "Fleet architecture"] },
  { id: "vignesh", name: "Vignesh", email: "vignesh@mimo.internal", role: "tech_member", skills: ["Backend", "Print pipeline"] },
  { id: "amrutha", name: "Amrutha", email: "amrutha@mimo.internal", role: "tech_member", skills: ["Document processing", "Frontend"] },
  { id: "bindu", name: "Bindu", email: "bindu@mimo.internal", role: "tech_member", skills: [] },
  { id: "chandana", name: "Chandana", email: "chandana@mimo.internal", role: "tech_member", skills: [] },
];

const genPassword = () => crypto.randomBytes(9).toString("base64url"); // 12 chars, URL-safe

async function main() {
  const apply = process.argv.includes("--apply");
  const target = process.env.FIRESTORE_EMULATOR_HOST ? `emulator (${process.env.FIRESTORE_EMULATOR_HOST})` : "PRODUCTION Firestore";
  console.log(`Target: ${target}`);
  console.log(apply ? "Mode: APPLY (will write)\n" : "Mode: DRY RUN (nothing will be written — pass --apply to write)\n");

  for (const member of TEAM) {
    if (apply) {
      const existing = await db.collection("technical_team").doc(member.id).get();
      if (existing.exists) {
        console.log(`technical_team/${member.id} already exists — skipping (edit directly in Firestore to change role/status)`);
        continue;
      }
      const password = genPassword();
      const passwordHash = await bcrypt.hash(password, 10);
      await db.collection("technical_team").doc(member.id).set({
        name: member.name,
        email: member.email,
        role: member.role,
        skills: member.skills,
        status: "active",
        passwordHash,
        joinedAt: new Date().toISOString().slice(0, 10),
      });
      console.log(`Created ${member.name} (${member.role}) — email: ${member.email}  password: ${password}`);
    } else {
      console.log(`Would create technical_team/${member.id}: ${member.name} <${member.email}> role=${member.role}`);
    }
  }

  console.log(apply ? "\nDone. Give each person their printed password directly; it will not be shown again." : "\nDry run complete. Nothing was written.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
