// Print codes are 4 digits (1000-9999). Two active jobs must never share a code, otherwise one customer's code would
// release another customer's documents at the kiosk. A code is only reusable once every job that carried it has
// finished (completed, failed, refunded...). Allocation checks the print_jobs collection; the small remaining race
// (two allocations at the same instant) is accepted, the 9 000-value space stays sparsely used.

const ACTIVE_STATUSES = new Set(["paid", "printing"]);
const MAX_ATTEMPTS = 25;

const randomCode = () => Math.floor(1000 + Math.random() * 9000).toString();

async function generateUniquePrintCode(db) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = randomCode();
    const taken = await db.collection("print_jobs").where("printCode", "==", code).get();
    if (!taken.docs.some((d) => ACTIVE_STATUSES.has(d.data().status))) return code;
  }
  throw new Error("Could not allocate a unique print code");
}

module.exports = { generateUniquePrintCode, ACTIVE_STATUSES, MAX_ATTEMPTS };
