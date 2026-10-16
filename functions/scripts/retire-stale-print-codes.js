// One-time cleanup: clears printCode on old, no-longer-active print_jobs so their 4-digit code can never
// collide with a brand-new job that gets handed the same code later (print.controller.js's postGetDocumentsByCode
// matches ANY historical job with that code, bounded only to the last 24h after the companion fix in this
// commit -- a job older than that should not still be holding a printCode at all).
//
// Confirmed production incident, 2026-10-16: a September job with printCode "9670" (status: completed)
// collided with a brand-new same-day paid job handed the same code, and the kiosk told the customer her
// code was "already used" even though her own job was still unprinted.
//
// Safe by construction:
//  - Dry-run by default. Nothing is written unless you pass --apply.
//  - Only ever sets printCode to null -- never touches any other field, never deletes a document.
//  - Only touches jobs whose status is one of completed/refunded/printed/expired (i.e. genuinely finished,
//    not paid/pending/printing) AND whose createdAt is older than STALE_AFTER_MS.
//
// Usage:
//   node scripts/retire-stale-print-codes.js              # dry run — prints what would be cleared
//   node scripts/retire-stale-print-codes.js --apply       # actually writes (prod, unless FIRESTORE_EMULATOR_HOST is set)
const { db } = require("../src/config/firebase");

const FINISHED_STATUSES = ["completed", "refunded", "printed", "expired"];
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BATCH_SIZE = 400; // Firestore batch write limit is 500; leave headroom

async function main() {
  const apply = process.argv.includes("--apply");
  const target = process.env.FIRESTORE_EMULATOR_HOST ? `emulator (${process.env.FIRESTORE_EMULATOR_HOST})` : "PRODUCTION Firestore";
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  console.log(`Target: ${target}`);
  console.log(`Clearing printCode on finished jobs created before ${cutoff.toISOString()}`);
  console.log(apply ? "Mode: APPLY (will write)\n" : "Mode: DRY RUN (nothing will be written — pass --apply to write)\n");

  let totalFound = 0;
  let totalCleared = 0;

  for (const status of FINISHED_STATUSES) {
    const snap = await db.collection("print_jobs")
      .where("status", "==", status)
      .where("createdAt", "<", cutoff)
      .where("printCode", "!=", null)
      .get();

    if (snap.empty) {
      console.log(`${status}: 0 stale jobs with a printCode`);
      continue;
    }

    console.log(`${status}: ${snap.size} stale job(s) with a printCode`);
    totalFound += snap.size;

    if (!apply) {
      snap.docs.slice(0, 5).forEach((doc) => {
        const d = doc.data();
        console.log(`  would clear ${doc.id} (printCode: ${d.printCode}, createdAt: ${d.createdAt?.toDate?.().toISOString()})`);
      });
      if (snap.size > 5) console.log(`  ...and ${snap.size - 5} more`);
      continue;
    }

    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = docs.slice(i, i + BATCH_SIZE);
      chunk.forEach((doc) => batch.update(doc.ref, { printCode: null }));
      await batch.commit();
      totalCleared += chunk.length;
      console.log(`  cleared ${totalCleared}/${snap.size} for status "${status}"`);
    }
  }

  console.log(apply
    ? `\nDone. Cleared printCode on ${totalCleared} stale job(s).`
    : `\nDry run complete. Would clear ${totalFound} stale job(s). Re-run with --apply to write.`);
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
