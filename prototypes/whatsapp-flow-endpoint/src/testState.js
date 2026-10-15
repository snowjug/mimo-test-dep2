"use strict";
// IN-MEMORY, SINGLE-PROCESS job registry for the test workflow. It exists so the PROCESSING screen can be an
// explicit "Check status" step: Flows do not push updates, the client has to ask again.
// NOT a production session store: it is lost on restart and not shared across instances (needs Firestore + lease).
function createJobStore({ maxEntries = 1000 } = {}) {
  const jobs = new Map(); // flow_token -> { fingerprint, state: PROCESSING|DONE|FAILED, result, error, done }

  function start(token, fingerprint, run) {
    const current = jobs.get(token);
    if (current && current.fingerprint === fingerprint) return current; // duplicate submit: never run twice
    const entry = { fingerprint, state: "PROCESSING", result: null, error: null };
    entry.done = Promise.resolve().then(run).then(
      (result) => { entry.state = "DONE"; entry.result = result; },
      (error) => { entry.state = "FAILED"; entry.error = error; },
    );
    jobs.delete(token); // re-insert so Map order tracks recency
    jobs.set(token, entry);
    while (jobs.size > maxEntries) jobs.delete(jobs.keys().next().value);
    return entry;
  }

  return { start, get: (t) => jobs.get(t), delete: (t) => jobs.delete(t), size: () => jobs.size };
}

module.exports = { createJobStore };
