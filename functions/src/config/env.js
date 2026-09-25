// ================= WHATSAPP CONFIG =================
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || "1178360992020211";

const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN || "EAFx0IQr1tSwBSEgosZCegrEw1X9DCGTmJN9oZAkkDMK6KN2DfAY9ELN0Dxr64zvuliBaOnFfx4ZCl4ibCBTNcbEltbjpdAZA0dZCom8vPh7nmIMtTZAZBA354LYJBgCGqiXGqtz5wLlZCKvrzeGovdurgjMgLlZAckdoeiL6ndUa0A928LODxbMDMUyEaIC3v8wSMCwZDZD";

const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || "mimo_webhook_verify_2024";

const SECRET_KEY = process.env.JWT_SECRET || "fallback_secret_key_change_me_in_prod";

const googleClient = new (require("google-auth-library").OAuth2Client)(process.env.GOOGLE_CLIENT_ID || "144514765704-a3nm5kgbtehioia9eki37s3t8doasfi1.apps.googleusercontent.com");

const CASHFREE_BASE_URL = process.env.CASHFREE_ENV === "production"
  ? "https://api.cashfree.com/pg"
  : "https://sandbox.cashfree.com/pg";

const cashfreeHeaders = {
  "Content-Type": "application/json",
  "x-client-id": process.env.CASHFREE_APP_ID || "test_app_id",
  "x-client-secret": process.env.CASHFREE_SECRET_KEY || "test_secret_key",
  "x-api-version": "2023-08-01",
};

// ================= OFFICE CONVERTER HELPER =================
const CONVERTER_SERVICE_URL = process.env.CONVERTER_SERVICE_URL || "https://mimo-office-converter-upqxuj7evq-uc.a.run.app";

const INTERNAL_CONVERTER_SECRET = process.env.INTERNAL_CONVERTER_SECRET || "";

module.exports = {
  CASHFREE_BASE_URL,
  CONVERTER_SERVICE_URL,
  INTERNAL_CONVERTER_SECRET,
  SECRET_KEY,
  WA_ACCESS_TOKEN,
  WA_PHONE_NUMBER_ID,
  WA_VERIFY_TOKEN,
  cashfreeHeaders,
  googleClient,
};
