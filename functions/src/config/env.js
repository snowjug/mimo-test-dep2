// ================= WHATSAPP CONFIG =================
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || "1178360992020211";

// No hardcoded fallback: an unset token must stay empty, never a real-looking literal secret.
const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN || "";

const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || "mimo_webhook_verify_2024";
if (!process.env.WA_VERIFY_TOKEN) {
  // Known value, not a secret the signature check depends on (that's WA_APP_SECRET below) -- this one is
  // only used for Meta's one-time GET handshake when the webhook URL is (re)configured in the Meta dashboard.
  // Flagged rather than silently removed: if production has never set its own WA_VERIFY_TOKEN, Meta's
  // dashboard is configured to send exactly this value, and swapping it out would break the handshake
  // without a coordinated change on both sides. See the security audit report for the rotation plan.
  console.warn("[SECURITY] WA_VERIFY_TOKEN is not set; using the known in-source default. Rotate this (set a real env var AND update the Meta dashboard to match) when convenient.");
}

// WhatsApp (Meta) signs every webhook delivery: X-Hub-Signature-256 = sha256=<hex HMAC-SHA256(rawBody, secret)>,
// using the app's Secret (not the access token or verify token). No fallback: a missing secret means the
// signature check fails closed (see postWhatsappWebhook), it never silently accepts unsigned requests.
const WA_APP_SECRET = process.env.WA_APP_SECRET || "";

// JWT_SECRET has no fallback: a weak/guessable/default signing key lets anyone forge admin tokens.
// Validated lazily, on first actual use, NOT at module load: JWT_SECRET is bound from Secret
// Manager at runtime (functions/index.js's secrets: [...]), and Firebase's local "analyze source
// code" deploy step never populates secret-bound env vars -- only the real deployed revision gets
// them. A module-load-time throw here would make `firebase deploy` fail locally before the code
// ever reaches the cloud, every time, with no way to supply a secret-bound value in advance (see
// guardian/secret.js's identical reasoning for GUARDIAN_MASTER_KEY). Every caller must call
// getSecretKey() at the point it actually signs/verifies a token, not destructure a bare constant.
function getSecretKey() {
  const key = process.env.JWT_SECRET;
  if (!key || key.length < 32) {
    throw new Error(
      "JWT_SECRET environment variable must be set and at least 32 characters long. Refusing to sign or verify with a missing or weak secret."
    );
  }
  return key;
}

const googleClient = new (require("google-auth-library").OAuth2Client)(process.env.GOOGLE_CLIENT_ID || "144514765704-a3nm5kgbtehioia9eki37s3t8doasfi1.apps.googleusercontent.com");

const CASHFREE_BASE_URL = process.env.CASHFREE_ENV === "production"
  ? "https://api.cashfree.com/pg"
  : "https://sandbox.cashfree.com/pg";

const cashfreeHeaders = {
  "Content-Type": "application/json",
  "x-client-id": process.env.CASHFREE_APP_ID || "test_app_id",
  // No hardcoded fallback: a missing key must make outbound Cashfree calls fail (401 from Cashfree),
  // never silently send a known, source-controlled value as the API credential.
  "x-client-secret": process.env.CASHFREE_SECRET_KEY || "",
  "x-api-version": "2023-08-01",
};

// ================= OFFICE CONVERTER HELPER =================
const CONVERTER_SERVICE_URL = process.env.CONVERTER_SERVICE_URL || "https://mimo-office-converter-upqxuj7evq-uc.a.run.app";

const INTERNAL_CONVERTER_SECRET = process.env.INTERNAL_CONVERTER_SECRET || "";

// ================= WHATSAPP FLOW ENDPOINT (Mission 16, carried into Mission 37) =================
// No hardcoded fallback on purpose: unlike WA_ACCESS_TOKEN/WA_PHONE_NUMBER_ID above (pre-existing, not
// introduced by this change), these have no legacy value to preserve. An unset value must leave the Flow
// endpoint refusing requests (see whatsappFlow.controller.js), never silently running with an invented key
// or secret. Intended source: Secret Manager, bound the same way GMAIL_APP_PASSWORD already is on `exports.api`.
const FLOW_PRIVATE_KEY_PEM = process.env.FLOW_PRIVATE_KEY_PEM || "";
const FLOW_APP_SECRET = process.env.FLOW_APP_SECRET || "";
const FLOW_APP_SECRET_PREVIOUS = process.env.FLOW_APP_SECRET_PREVIOUS || ""; // optional, for secret rotation
const FLOW_ID = process.env.FLOW_ID || ""; // the real, Meta-configured Flow ID; never invented

module.exports = {
  CASHFREE_BASE_URL,
  CONVERTER_SERVICE_URL,
  FLOW_APP_SECRET,
  FLOW_APP_SECRET_PREVIOUS,
  FLOW_ID,
  FLOW_PRIVATE_KEY_PEM,
  INTERNAL_CONVERTER_SECRET,
  getSecretKey,
  WA_ACCESS_TOKEN,
  WA_APP_SECRET,
  WA_PHONE_NUMBER_ID,
  WA_VERIFY_TOKEN,
  cashfreeHeaders,
  googleClient,
};
