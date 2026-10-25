// Timeline moments the kiosk's Pi already records on each print job (stamp_job in the listener):
//   piReceivedAt    - the Pi picked the job up from Firestore
//   sentToPrinterAt - the Pi handed the file to CUPS (lp accepted it); NOT that paper is moving
// /kiosk/job-status passes them through so the kiosk can show these real steps before the first sheet is counted.
// A stage counts for a checkout session only when every job in it carries the stamp; nothing is inferred from time.

const STAGE_FIELDS = ["piReceivedAt", "sentToPrinterAt"];

const toMillis = (t) => {
  if (!t) return 0;
  const ms = t.toDate ? t.toDate().getTime() : new Date(t).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

/** { piReceivedAt, sentToPrinterAt }: ISO string of the latest stamp when every doc has it, else null. */
function sessionStages(docs) {
  const stages = {};
  for (const field of STAGE_FIELDS) {
    const times = (docs || []).map((d) => toMillis(d && d[field]));
    stages[field] = times.length && times.every((ms) => ms > 0) ? new Date(Math.max(...times)).toISOString() : null;
  }
  return stages;
}

module.exports = { sessionStages, STAGE_FIELDS };
