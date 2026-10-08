// Registers a brand-new machine — machine ID + template + location, nothing else (brief item 10: "prepare for
// automated future Pi provisioning"). A future CV-003 needs only this one new Firestore document; no source
// file in this repo has to change for it to show up in the admin dashboard and the customer discovery page.
//
// The template and location must already exist (this is "add a machine", not "define a new template/location").
// The new machine starts in PROVISIONING and stays invisible to customers (publicMachines.controller.js's
// `available` is only true once status is ACTIVE) until an admin runs it through the self-test gate:
//   POST /admin/kiosks/:id/verify   (see kioskCommands.controller.js's postAdminKioskVerify)
//
// Safe by construction: dry-run by default, validates the template/location exist before writing anything,
// refuses to touch an id that's already registered, and only ever writes the one new machines/{id} doc.
//
// Usage:
//   node scripts/provision-machine.js --id CV-003 --name "MIMO 3.0" --type bw \
//     --template mimo-1.0-standard --location jain-university [--short M3] [--description "Black & white"] [--apply]
//
// To try it against the local emulator first, with zero risk to production:
//   firebase emulators:exec --config __tests__/emulator/firebase.emulator.json --only firestore \
//     --project demo-mimo-emulator "node scripts/provision-machine.js --id CV-003 ... --apply"
const { db } = require("../src/config/firebase");
const { KIOSK_ID_PATTERN, loadMachineTemplatesMap, loadLocationsMap } = require("../src/services/machineRegistry.service");

function parseArgs(argv) {
  const out = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") { out.apply = true; continue; }
    if (a.startsWith("--")) { out[a.slice(2)] = argv[i + 1]; i++; }
  }
  return out;
}

/** The env lines the new Pi's systemd unit needs — printer names are filled in once the physical printer is set up. */
function printSystemdHint({ id, type }) {
  console.log("\nOnce the physical Pi is imaged, its systemd unit needs (see pi_scripts/firebase_listener.py):");
  console.log(`  Environment=KIOSK_ID=${id}`);
  console.log(`  Environment=BW_PRINTER_NAME=<cups-queue-name>`);
  if (type === "color") console.log(`  Environment=COLOR_PRINTER_NAME=<cups-queue-name>`);
  console.log(`  Environment=IS_MONOCHROME_ONLY=${type === "color" ? "false" : "true"}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { id, name, type, template, location } = args;
  const shortLabel = args.short || (id ? id.slice(0, 2) : undefined);
  const description = args.description || (type === "color" ? "Colour + black & white" : "Black & white");

  const missing = ["id", "name", "type", "template", "location"].filter((k) => !args[k]);
  if (missing.length) {
    console.error(`Missing required arguments: ${missing.map((k) => `--${k}`).join(", ")}`);
    process.exit(1);
  }
  if (!KIOSK_ID_PATTERN.test(id)) {
    console.error(`--id "${id}" doesn't match the kiosk id pattern (e.g. CV-003).`);
    process.exit(1);
  }
  if (type !== "bw" && type !== "color") {
    console.error(`--type must be "bw" or "color", got "${type}".`);
    process.exit(1);
  }

  const target = process.env.FIRESTORE_EMULATOR_HOST ? `emulator (${process.env.FIRESTORE_EMULATOR_HOST})` : "PRODUCTION Firestore";
  console.log(`Target: ${target}`);
  console.log(args.apply ? "Mode: APPLY (will write)\n" : "Mode: DRY RUN (nothing will be written — pass --apply to write)\n");

  const [existing, templates, locations] = await Promise.all([
    db.collection("machines").doc(id).get(),
    loadMachineTemplatesMap(db),
    loadLocationsMap(db),
  ]);
  if (existing.exists) {
    console.error(`machines/${id} already exists — this script only provisions a NEW machine. Edit it directly in Firestore if you need to change it.`);
    process.exit(1);
  }
  if (!templates.has(template)) {
    console.error(`Unknown template "${template}". Known templates: ${[...templates.keys()].join(", ") || "(none registered)"}`);
    process.exit(1);
  }
  if (!locations.has(location)) {
    console.error(`Unknown location "${location}". Known locations: ${[...locations.keys()].join(", ") || "(none registered)"}`);
    process.exit(1);
  }

  const doc = { name, type, description, shortLabel, templateId: template, locationId: location, status: "PROVISIONING" };
  console.log(`machines/${id}`, JSON.stringify(doc));

  if (args.apply) {
    await db.collection("machines").doc(id).set(doc);
    console.log(`\nWritten. ${id} is PROVISIONING and invisible to customers until it passes POST /admin/kiosks/${id}/verify.`);
  } else {
    console.log("\nDry run complete. Nothing was written.");
  }
  printSystemdHint({ id, type });
}

main().catch((err) => {
  console.error("Provisioning failed:", err);
  process.exit(1);
});
