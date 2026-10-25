// Registers a kiosk in the guardian_kiosks authorization registry (Phase 2F, see
// src/guardian/registry.js's provisionKiosk). This is the ONLY way a kiosk's signed telemetry is
// accepted by POST /kiosk/guardian/health — an unprovisioned kioskId is rejected outright. No
// secret material is written here; the registry only records which key version is currently
// authorized (src/guardian/registry.js's module docstring explains why).
//
// Safe by construction: dry-run by default, refuses to re-provision a kiosk that already exists
// unless --force is passed (re-provisioning resets activeKeyVersion back to 1 and clears any
// in-progress key rotation — see provisionKiosk's docstring), and only ever writes the one
// guardian_kiosks/{id} document.
//
// Usage:
//   node scripts/provision-guardian-kiosk.js --id CV-001 [--apply] [--force]
//
// To try it against the local emulator first, with zero risk to production:
//   firebase emulators:exec --config __tests__/emulator/firebase.emulator.json --only firestore \
//     --project demo-mimo-emulator "node scripts/provision-guardian-kiosk.js --id CV-001 --apply"
const { db, admin } = require("../src/config/firebase");
const { provisionKiosk, getKioskRecord } = require("../src/guardian/registry");

const KIOSK_ID_RE = /^[A-Z]{2}-\d{3}$/;

function parseArgs(argv) {
  const out = { apply: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") { out.apply = true; continue; }
    if (a === "--force") { out.force = true; continue; }
    if (a.startsWith("--")) { out[a.slice(2)] = argv[i + 1]; i++; }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { id } = args;

  if (!id) {
    console.error("Missing required argument: --id (e.g. --id CV-001)");
    process.exit(1);
  }
  if (!KIOSK_ID_RE.test(id)) {
    console.error(`--id "${id}" doesn't match the kiosk id pattern (e.g. CV-001).`);
    process.exit(1);
  }

  const target = process.env.FIRESTORE_EMULATOR_HOST ? `emulator (${process.env.FIRESTORE_EMULATOR_HOST})` : "PRODUCTION Firestore";
  console.log(`Target: ${target}`);
  console.log(args.apply ? "Mode: APPLY (will write)\n" : "Mode: DRY RUN (nothing will be written — pass --apply to write)\n");

  const existing = await getKioskRecord(db, id);
  if (existing && !args.force) {
    console.error(`guardian_kiosks/${id} already exists (status=${existing.status}, activeKeyVersion=${existing.activeKeyVersion}).`);
    console.error("Re-running provisionKiosk would reset it back to ACTIVE / activeKeyVersion 1. Pass --force if that's really what you want.");
    process.exit(1);
  }

  console.log(`guardian_kiosks/${id} -> { status: "ACTIVE", activeKeyVersion: 1 }`);

  if (args.apply) {
    const doc = await provisionKiosk(db, admin, { kioskId: id, activeKeyVersion: 1 });
    console.log("\nWritten:", JSON.stringify(doc));
    console.log(`\nNext: derive ${id}'s per-kiosk key (pi-guardian/deploy/README.md step 1), using activeKeyVersion=1.`);
  } else {
    console.log("\nDry run complete. Nothing was written.");
  }
}

main().catch((err) => {
  console.error("Provisioning failed:", err);
  process.exit(1);
});
