/**
 * MIMO Edge Guardian — Phase 1 snapshot schema validator, ported to Node.
 *
 * This is a field-for-field, regex-for-regex port of the frozen validator in
 * pi-guardian/guardian/snapshot.py (`validate_snapshot`) and model.py, so the backend accepts
 * exactly what the Pi's own validator accepts — nothing in pi-guardian/ was modified to produce
 * this; it is a second, independent implementation of the same frozen contract (§1 of the Phase 2A
 * contract doc), not a shared module (Guardian shares no code/files with the backend by design).
 */

const MAX_EVIDENCE = 8;
const MAX_DETAIL = 120;
const MAX_CHECKS = 32;
const MAX_SNAPSHOT_BYTES = 8192;

const FIXED_CHECKS = {
  link: "connectivity",
  ipv4: "connectivity",
  route: "connectivity",
  gateway: "connectivity",
  dns: "connectivity",
  listener_unit: "services",
  cups_scheduler: "services",
  tailscale: "management",
  disk: "resources",
  memory: "resources",
  temperature: "resources",
};
const DYNAMIC_RE = /^(endpoint|tls)\.([a-z0-9_]{1,24})$/;
const EVIDENCE_RE = /^[A-Z][A-Z0-9_]{1,47}$/;

const TOP_KEYS = ["schemaVersion", "agentVersion", "kioskId", "seq", "observedAt", "cycle", "checks", "diagnosis"];
const CYCLE_KEYS = ["durationMs", "budgetMs", "budgetExceeded", "detailsDropped"];
const CHECK_KEYS = ["id", "plane", "required", "state", "observedAt", "durationMs", "evidence", "detail", "streak"];
const DIAG_KEYS = ["overall", "rootCauses", "cascades", "unknown"];
const ROOT_CAUSE_KEYS = ["code", "plane", "severity", "checks", "evidence"];
const CASCADE_KEYS = ["check", "blockedBy"];

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const KIOSK_RE = /^[A-Z]{2}-\d{3}$/;
const VERSION_RE = /^[0-9A-Za-z.+-]{1,32}$/;
const OVERALL_VALUES = new Set(["HEALTHY", "DEGRADED", "FAILING", "UNKNOWN"]);
const SEVERITY_VALUES = new Set(["CRITICAL", "MANAGEMENT", "WARNING"]);
const STATE_VALUES = new Set(["PASS", "FAIL", "UNKNOWN", "NOT_RUN", "STALE"]);
// Same leak-scan patterns as snapshot.py's _LEAK_RES.
const LEAK_RES = [/\b(?:\d{1,3}\.){3}\d{1,3}\b/, /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/];

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function sameKeySet(obj, keys) {
  if (!isPlainObject(obj)) return false;
  const objKeys = Object.keys(obj);
  if (objKeys.length !== keys.length) return false;
  const keySet = new Set(keys);
  return objKeys.every((k) => keySet.has(k));
}

function isPlainInt(v) {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);
}

function isValidCheckId(id) {
  return typeof id === "string" && (Object.prototype.hasOwnProperty.call(FIXED_CHECKS, id) || DYNAMIC_RE.test(id));
}

function planeOf(id) {
  if (Object.prototype.hasOwnProperty.call(FIXED_CHECKS, id)) return FIXED_CHECKS[id];
  if (DYNAMIC_RE.test(id || "")) return "connectivity";
  return null;
}

function collectStrings(value, out) {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectStrings(v, out));
  } else if (isPlainObject(value)) {
    Object.values(value).forEach((v) => collectStrings(v, out));
  }
}

/** Returns { valid: boolean, errors: string[] }. Mirrors snapshot.py's validate_snapshot(): an
 * empty errors array means valid. Error text is for logs/tests only, not a stable public contract. */
function validateSnapshot(snap) {
  const errors = [];
  if (!isPlainObject(snap)) {
    return { valid: false, errors: ["snapshot must be an object"] };
  }
  if (!sameKeySet(snap, TOP_KEYS)) {
    return { valid: false, errors: ["top-level keys must match the frozen Phase 1 schema"] };
  }

  if (!isPlainInt(snap.schemaVersion) || snap.schemaVersion !== 1) errors.push("unsupported schemaVersion");
  if (typeof snap.agentVersion !== "string" || !VERSION_RE.test(snap.agentVersion)) errors.push("bad agentVersion");
  if (typeof snap.kioskId !== "string" || !KIOSK_RE.test(snap.kioskId)) errors.push("bad kioskId");
  if (!isPlainInt(snap.seq) || snap.seq < 0) errors.push("bad seq");
  if (typeof snap.observedAt !== "string" || !ISO_RE.test(snap.observedAt)) errors.push("bad observedAt");

  const cyc = snap.cycle;
  if (!sameKeySet(cyc, CYCLE_KEYS) || !isPlainInt(cyc.durationMs) || !isPlainInt(cyc.budgetMs)
      || typeof cyc.budgetExceeded !== "boolean" || typeof cyc.detailsDropped !== "boolean") {
    errors.push("bad cycle block");
  }

  let checks = snap.checks;
  if (!Array.isArray(checks) || checks.length > MAX_CHECKS) {
    errors.push(`checks must be a list of at most ${MAX_CHECKS}`);
    checks = [];
  }
  const ids = new Set();
  for (const c of checks) {
    if (!sameKeySet(c, CHECK_KEYS)) { errors.push("bad check entry keys"); continue; }
    if (!isValidCheckId(c.id) || ids.has(c.id)) { errors.push(`bad or duplicate check id ${JSON.stringify(c.id)}`); continue; }
    ids.add(c.id);
    if (c.plane !== planeOf(c.id)) errors.push(`${c.id}: plane mismatch`);
    if (!STATE_VALUES.has(c.state)) errors.push(`${c.id}: bad state`);
    if (typeof c.required !== "boolean") errors.push(`${c.id}: bad required`);
    if (typeof c.observedAt !== "string" || !ISO_RE.test(c.observedAt)) errors.push(`${c.id}: bad observedAt`);
    if (c.durationMs !== null && (!isPlainInt(c.durationMs) || c.durationMs < 0)) errors.push(`${c.id}: bad durationMs`);
    const ev = c.evidence;
    if (!Array.isArray(ev) || ev.length > MAX_EVIDENCE || !ev.every((x) => typeof x === "string" && EVIDENCE_RE.test(x))) {
      errors.push(`${c.id}: bad evidence`);
    }
    if (typeof c.detail !== "string" || c.detail.length > MAX_DETAIL) errors.push(`${c.id}: bad detail`);
    if (!isPlainInt(c.streak) || c.streak < 1) errors.push(`${c.id}: bad streak`);
  }

  const d = snap.diagnosis;
  if (!sameKeySet(d, DIAG_KEYS) || !OVERALL_VALUES.has(d && d.overall)) {
    errors.push("bad diagnosis block");
  } else {
    for (const r of d.rootCauses) {
      if (!sameKeySet(r, ROOT_CAUSE_KEYS) || !SEVERITY_VALUES.has(r.severity)
          || !Array.isArray(r.checks) || r.checks.length === 0) {
        errors.push("bad root cause entry");
      } else if (!r.checks.every((c) => ids.has(c))) {
        errors.push("root cause references unknown check");
      }
    }
    for (const c of d.cascades) {
      if (!sameKeySet(c, CASCADE_KEYS) || !ids.has(c.check)) errors.push("bad cascade entry");
    }
    if (!Array.isArray(d.unknown) || !d.unknown.every((k) => ids.has(k))) errors.push("bad unknown list");
  }

  const strings = [];
  collectStrings(snap, strings);
  if (strings.some((s) => LEAK_RES.some((re) => re.test(s)))) {
    errors.push("snapshot contains an unsanitised address");
  }

  let size;
  try {
    size = Buffer.byteLength(JSON.stringify(snap), "utf8");
  } catch (_e) {
    return { valid: false, errors: [...errors, "snapshot is not JSON serialisable"] };
  }
  if (size > MAX_SNAPSHOT_BYTES) errors.push(`snapshot is ${size} bytes, over the ${MAX_SNAPSHOT_BYTES} limit`);

  return { valid: errors.length === 0, errors };
}

module.exports = { validateSnapshot, MAX_SNAPSHOT_BYTES, MAX_CHECKS, FIXED_CHECKS };
