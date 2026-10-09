// Registers CV-001 and SV-002 (plus their templates/location/campus) in the new Firestore registry collections.
//
// Safe by construction:
//  - Dry-run by default. Nothing is written unless you pass --apply.
//  - Writes with {merge: true} only to machines/machine_templates/locations/campuses — never
//    print_jobs/orders/payment_transactions/users/etc, and never deletes a field it doesn't know about.
//  - Writing these documents changes nothing for CV-001/SV-002 today: every reader (adminInsights, kioskCommands,
//    publicMachines) already falls back to these exact same values when the collections don't exist. Seeding
//    them just moves the source of truth from code into Firestore so an admin can edit it later and a future
//    CV-003 needs only a new document, not a code change.
//
// Usage:
//   node scripts/seed-machine-registry.js              # dry run — prints what would be written
//   node scripts/seed-machine-registry.js --apply      # actually writes (prod, unless FIRESTORE_EMULATOR_HOST is set)
//
// To verify against the local emulator first, with zero risk to production:
//   firebase emulators:exec --config __tests__/emulator/firebase.emulator.json --only firestore \
//     --project demo-mimo-emulator "node scripts/seed-machine-registry.js --apply"
const { db } = require("../src/config/firebase");
const {
  DEFAULT_MACHINES,
  DEFAULT_TEMPLATES,
  DEFAULT_LOCATIONS,
  DEFAULT_CAMPUSES,
} = require("../src/services/machineRegistry.service");

const COLLECTIONS = [
  ["machines", DEFAULT_MACHINES],
  ["machine_templates", DEFAULT_TEMPLATES],
  ["locations", DEFAULT_LOCATIONS],
  ["campuses", DEFAULT_CAMPUSES],
];

async function main() {
  const apply = process.argv.includes("--apply");
  const target = process.env.FIRESTORE_EMULATOR_HOST ? `emulator (${process.env.FIRESTORE_EMULATOR_HOST})` : "PRODUCTION Firestore";
  console.log(`Target: ${target}`);
  console.log(apply ? "Mode: APPLY (will write)\n" : "Mode: DRY RUN (nothing will be written — pass --apply to write)\n");

  for (const [collectionName, docs] of COLLECTIONS) {
    for (const [id, data] of Object.entries(docs)) {
      if (apply) {
        // Only ever write this doc once: a machine's status/fields may have been hand-edited since the first
        // seed (e.g. an admin set CV-001 to MAINTENANCE), and a blind merge:true on every run would silently
        // stomp that back to the literal default. Matches provision-machine.js's existing guard.
        const existing = await db.collection(collectionName).doc(id).get();
        if (existing.exists) {
          console.log(`${collectionName}/${id} already exists — skipping (run once only; edit it directly in Firestore to change it)`);
          continue;
        }
        console.log(`${collectionName}/${id}`, JSON.stringify(data));
        await db.collection(collectionName).doc(id).set(data);
      } else {
        console.log(`${collectionName}/${id}`, JSON.stringify(data));
      }
    }
  }

  console.log(apply ? "\nDone. Re-run adminInsights/publicMachines and confirm CV-001/SV-002 are unchanged." : "\nDry run complete. Nothing was written.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
