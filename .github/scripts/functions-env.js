#!/usr/bin/env node
/**
 * Builds functions/.env for a Firebase Functions deploy and refuses to continue when the
 * configuration is incomplete or insecure. Used only by .github/workflows/deploy-functions.yml.
 *
 * Sources (later wins):
 *   1. LIVE_ENV_JSON_PATH   - `gcloud run services describe api --format=json` of the deployed function,
 *                             so a deploy never drops variables that are already configured in production.
 *   2. FUNCTIONS_ENV_FILE   - optional GitHub secret holding a dotenv file; overrides / seeds values.
 *
 * Rules: secret values are NEVER printed; only variable names and problems are. Reserved Firebase names
 * and anything outside the allow-list are dropped. No bypass flag exists on purpose.
 *
 * Exit codes: 0 ok · 1 required configuration missing · 2 insecure configuration.
 */
const fs = require("fs");

const ALLOWED = [
  "JWT_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD", "GOOGLE_CLIENT_ID",
  "CASHFREE_ENV", "CASHFREE_APP_ID", "CASHFREE_SECRET_KEY",
  "GMAIL_APP_PASSWORD",
  "WA_PHONE_NUMBER_ID", "WA_ACCESS_TOKEN", "WA_VERIFY_TOKEN",
  "CONVERTER_SERVICE_URL", "INTERNAL_CONVERTER_SECRET", "INTERNAL_WEBHOOK_SECRET", "INTERNAL_API_KEY",
  "PI_BASE_URL", "PRINTER_NAME",
  // Mission 37: these were already live production configuration (confirmed present on a prior deployed
  // revision) that this allow-list did not yet recognize, so every deploy through this script silently
  // dropped them — unrelated to the WhatsApp Flow feature itself, but found while integrating it. Finance
  // login (admin.controller.js) reads the first pair, falling back to a hardcoded production credential
  // pair in source when unset (not a disabled dashboard — see REQUIRED below). The Admin SDK explicit-
  // credential path (config/firebase.js) reads the second trio, falling back to Application Default
  // Credentials (the Cloud Run service's own runtime identity) when they are unset — see RECOMMENDED below.
  "FINANCE_EMAIL", "FINANCE_PASSWORD",
  "MIMO_SA_PROJECT_ID", "MIMO_SA_CLIENT_EMAIL", "MIMO_SA_PRIVATE_KEY",
];
const ALLOWED_PATTERNS = [/^[A-Z0-9]+_(PI_URL|PRINTER_NAME)$/];

// Without these the API silently falls back to public defaults (sandbox payments, forgeable tokens, no admin login).
// This script's only caller is deploy-functions.yml's production `deploy` job (gated `if: github.ref ==
// 'refs/heads/main'`) — there is no separate local/staging invocation, so REQUIRED is already, in practice,
// a production-only gate; adding to it here cannot break a local/test workflow that never runs this script.
const REQUIRED = [
  "JWT_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD",
  "CASHFREE_ENV", "CASHFREE_APP_ID", "CASHFREE_SECRET_KEY",
  "GMAIL_APP_PASSWORD", "WA_ACCESS_TOKEN",
  // Mission 49: FINANCE_EMAIL/FINANCE_PASSWORD remain REQUIRED. Their omission does not disable finance
  // login the way an earlier version of this comment claimed — admin.controller.js falls back to a
  // hardcoded "mimo.finance"/"MimoFinance@2025" production credential pair committed in source
  // (7eac655b) — but deciding whether that static fallback is an acceptable substitute for a real
  // configured credential is a security-policy call this script does not make unilaterally. Keeping this
  // required forces a repository admin to either supply real values or explicitly decide otherwise.
  "FINANCE_EMAIL", "FINANCE_PASSWORD",
];
// Have code fallbacks; missing is worth a warning, not a stop.
// Mission 49: MIMO_SA_PROJECT_ID/MIMO_SA_CLIENT_EMAIL/MIMO_SA_PRIVATE_KEY moved here from REQUIRED. An
// earlier comment claimed the Admin SDK explicit-credential path in config/firebase.js has no fallback;
// it does — when these are unset, config/firebase.js calls admin.initializeApp() without a `credential`,
// which makes the SDK use Application Default Credentials (the Cloud Run service's own runtime service
// account). That is Google's recommended, already-live production mechanism, not a weaker substitute, so
// requiring explicit values here was blocking every deploy for no safety benefit. Explicit-credential
// support is unchanged: if these ARE supplied, config/firebase.js still uses them in preference to ADC.
const RECOMMENDED = [
  "GOOGLE_CLIENT_ID", "WA_PHONE_NUMBER_ID", "WA_VERIFY_TOKEN",
  "MIMO_SA_PROJECT_ID", "MIMO_SA_CLIENT_EMAIL", "MIMO_SA_PRIVATE_KEY",
];

// Bound with `secrets: [...]` in functions/index.js. When the live function already has the Secret Manager
// reference, the value must NOT also be written to .env (Google rejects the overlap) and is not required here.
const SECRET_MANAGED = ["GMAIL_APP_PASSWORD"];

const PUBLIC_JWT_FALLBACK = "fallback_secret_key_change_me_in_prod";
const WEAK_PASSWORDS = new Set(["admin", "password", "123456", "12345678", "admin123", "administrator", "root", "changeme", "printpi", "mimo", "mimo123"]);
const MIN_PASSWORD_LENGTH = 12;
const MIN_JWT_LENGTH = 32;

const isAllowed = (name) => ALLOWED.includes(name) || ALLOWED_PATTERNS.some((re) => re.test(name));

/** Minimal dotenv parser: KEY=VALUE, optional single/double quotes, # comments, \n escapes in double quotes. */
function parseDotenv(text) {
  const out = {};
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

/** Reads the environment of a Cloud Run service from `gcloud run services describe --format=json`. */
function parseLiveEnv(json) {
  let doc;
  try {
    doc = typeof json === "string" ? JSON.parse(json) : json;
  } catch {
    return {};
  }
  const env = doc?.spec?.template?.spec?.containers?.[0]?.env || [];
  const out = {};
  for (const item of env) {
    if (item && typeof item.name === "string" && typeof item.value === "string") out[item.name] = item.value;
  }
  return out;
}

/** Names bound to Secret Manager on the live function (they have no plain value; a .env deploy would unbind them). */
function parseLiveSecretRefs(json) {
  let doc;
  try {
    doc = typeof json === "string" ? JSON.parse(json) : json;
  } catch {
    return [];
  }
  const env = doc?.spec?.template?.spec?.containers?.[0]?.env || [];
  return env.filter((i) => i && typeof i.name === "string" && i.valueFrom).map((i) => i.name);
}

function mergeSources({ live = {}, secretEnv = {} }) {
  const merged = {};
  const dropped = [];
  for (const source of [live, secretEnv]) {
    for (const [name, value] of Object.entries(source)) {
      if (!isAllowed(name)) { if (!dropped.includes(name)) dropped.push(name); continue; }
      if (value === "" || value == null) continue; // never let an empty value overwrite a real one
      merged[name] = value;
    }
  }
  return { merged, dropped };
}

/** @returns {{missing: string[], warnings: string[], insecure: string[]}} */
function validate(env) {
  const missing = REQUIRED.filter((k) => !env[k]);
  const warnings = RECOMMENDED.filter((k) => !env[k]).map((k) => `${k} is not set (a code default will be used)`);
  const insecure = [];

  if (env.JWT_SECRET) {
    if (env.JWT_SECRET === PUBLIC_JWT_FALLBACK) insecure.push("JWT_SECRET equals the public fallback value from the source code");
    else if (env.JWT_SECRET.length < MIN_JWT_LENGTH) insecure.push(`JWT_SECRET is shorter than ${MIN_JWT_LENGTH} characters`);
  }
  if (env.ADMIN_PASSWORD) {
    const pw = env.ADMIN_PASSWORD.replace(/^"|"$/g, "").trim();
    if (WEAK_PASSWORDS.has(pw.toLowerCase())) insecure.push("ADMIN_PASSWORD is a default/common password");
    else if (pw.length < MIN_PASSWORD_LENGTH) insecure.push(`ADMIN_PASSWORD is shorter than ${MIN_PASSWORD_LENGTH} characters`);
    if (env.ADMIN_EMAIL && pw.toLowerCase() === env.ADMIN_EMAIL.replace(/^"|"$/g, "").trim().toLowerCase()) {
      insecure.push("ADMIN_PASSWORD is identical to ADMIN_EMAIL");
    }
  }
  if (env.CASHFREE_ENV && !["production", "sandbox"].includes(env.CASHFREE_ENV)) {
    insecure.push('CASHFREE_ENV must be "production" or "sandbox"');
  }
  return { missing, warnings, insecure };
}

const quote = (v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n")}"`;
const toDotenv = (env) => Object.keys(env).sort().map((k) => `${k}=${quote(env[k])}`).join("\n") + "\n";

function main() {
  const say = (msg) => console.log(msg);
  const outPath = process.argv[2] || "functions/.env";
  const liveJson = process.env.LIVE_ENV_JSON_PATH && fs.existsSync(process.env.LIVE_ENV_JSON_PATH)
    ? fs.readFileSync(process.env.LIVE_ENV_JSON_PATH, "utf8")
    : "";
  const live = parseLiveEnv(liveJson);
  const liveSecretRefs = parseLiveSecretRefs(liveJson);
  const secretEnv = parseDotenv(process.env.FUNCTIONS_ENV_FILE || "");
  const { merged, dropped } = mergeSources({ live, secretEnv });
  const boundSecrets = SECRET_MANAGED.filter((n) => liveSecretRefs.includes(n));
  boundSecrets.forEach((n) => delete merged[n]);
  const validation = validate(merged);
  const missing = validation.missing.filter((n) => !boundSecrets.includes(n));
  const { warnings, insecure } = validation;
  if (boundSecrets.length) say(`Provided by Secret Manager (bound in code, not written to .env): ${boundSecrets.join(", ")}`);

  say(`Live production variables read: ${Object.keys(live).filter(isAllowed).length}`);
  // Names only (never values): lets the team see what production currently has without console access.
  console.log(`::notice title=Live function variables (names only)::plain: ${Object.keys(live).sort().join(", ") || "none"}; Secret Manager references: ${liveSecretRefs.sort().join(", ") || "none"}`);
  say(`Variables from FUNCTIONS_ENV_FILE secret: ${Object.keys(secretEnv).filter(isAllowed).length}`);
  if (dropped.length) say(`Ignored (reserved or not part of the allow-list): ${dropped.join(", ")}`);
  warnings.forEach((w) => say(`::warning::${w}`));

  if (missing.length) {
    console.error(`::error title=Required configuration missing::Missing: ${missing.join(", ")}`);
    console.error(
      (liveSecretRefs.some((n) => missing.includes(n))
        ? `Note: ${liveSecretRefs.filter((n) => missing.includes(n)).join(", ")} is a Secret Manager reference on the live function; a .env deploy would unbind it, so supply the value too.\n`
        : "") +
      "The deployed function has no value for these and none was supplied. Deploying would replace the\n" +
      "function's environment without them. Fix: a repository admin adds an Actions secret named\n" +
      "FUNCTIONS_ENV_FILE containing the production functions/.env (see docs/deployment/CI_CD.md)."
    );
    process.exit(1);
  }
  if (insecure.length) {
    console.error(`::error title=Insecure production configuration::${insecure.join("; ")}`);
    console.error(
      "Deployment blocked on purpose: it would expose the admin/finance dashboards or allow forged tokens.\n" +
      "Set strong values (in the FUNCTIONS_ENV_FILE secret) and re-run. Authentication behaviour is unchanged."
    );
    process.exit(2);
  }

  // Belt and braces: ask the runner to mask every secret value should it ever appear in a log.
  const PLAIN = new Set(["CASHFREE_ENV", "CONVERTER_SERVICE_URL", "PRINTER_NAME"]);
  for (const [name, value] of Object.entries(merged)) {
    if (!PLAIN.has(name) && !/_PRINTER_NAME$/.test(name) && value.length >= 4) {
      console.log(`::add-mask::${value.replace(/\r?\n/g, "")}`);
    }
  }
  fs.writeFileSync(outPath, toDotenv(merged), { mode: 0o600 });
  say(`OK: wrote ${Object.keys(merged).length} variables to ${outPath} (${Object.keys(merged).sort().join(", ")})`);
}

if (require.main === module) main();

module.exports = { parseDotenv, parseLiveEnv, parseLiveSecretRefs, mergeSources, validate, toDotenv, REQUIRED, ALLOWED };
