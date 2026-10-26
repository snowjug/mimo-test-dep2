const { GoogleAuth } = require("google-auth-library");
const axios = require("axios");
const { CONVERTER_SERVICE_URL, DEFAULT_CONVERTER_SERVICE_URL, INTERNAL_CONVERTER_SECRET } = require("../config/env");
const { isDeployedRuntime } = require("../config/credentialSource");

const SUPPORTED_OFFICE_EXTENSIONS = new Set([
  ".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls",
  ".odt", ".ods", ".odp", ".rtf", ".txt"
]);

const LOCAL_URL_RE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i;

/**
 * The converter URL to call. A localhost URL is a local-development setting; on a deployed function it points
 * at the function's own container, where no converter runs, so every Word/PowerPoint/Excel upload failed (this
 * happened in production when a local .env value was deployed). On a deployed runtime such a URL is ignored in
 * favour of the real Cloud Run converter.
 */
function resolveConverterUrl(env = process.env, configured = CONVERTER_SERVICE_URL) {
  const url = String(env.CONVERTER_SERVICE_URL || configured || DEFAULT_CONVERTER_SERVICE_URL).trim().replace(/\/+$/, "");
  if (isDeployedRuntime(env) && LOCAL_URL_RE.test(url)) {
    console.warn(`[CONVERTER] CONVERTER_SERVICE_URL (${url}) points at this machine, which cannot work on a deployed function. Using the Cloud Run converter instead.`);
    return DEFAULT_CONVERTER_SERVICE_URL;
  }
  return url;
}

/**
 * Invokes the private LibreOffice converter service on Cloud Run via authenticated service-to-service call.
 * Returns { pageCount, fileUrl, storagePath } where fileUrl is the rendered PDF in Cloud Storage.
 */
async function callOfficeConverter({ fileUrl, fileName, userId, jobId }) {
  const converterUrl = resolveConverterUrl();

  const payload = {
    fileUrl,
    fileName,
    jobId: jobId || userId || "general"
  };

  const isLocalOrDirect =
    converterUrl.includes("localhost") ||
    converterUrl.includes("127.0.0.1") ||
    Boolean(process.env.INTERNAL_CONVERTER_SECRET || INTERNAL_CONVERTER_SECRET);

  let response;
  if (isLocalOrDirect) {
    // Local development, container testing, or direct secret invocation
    const secret = process.env.INTERNAL_CONVERTER_SECRET || INTERNAL_CONVERTER_SECRET;
    response = await axios.post(`${converterUrl}/convert`, payload, {
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-internal-secret": secret } : {})
      },
      timeout: 75000
    });
  } else {
    // Production Cloud Run service-to-service IAM authentication
    const auth = new GoogleAuth();
    const client = await auth.getIdTokenClient(converterUrl);
    response = await client.request({
      url: `${converterUrl}/convert`,
      method: "POST",
      data: payload,
      timeout: 75000
    });
  }

  const data = response.data;
  if (!data || !data.success || typeof data.pageCount !== "number" || data.pageCount < 1) {
    throw new Error(data?.error || "Converter returned an invalid response or page count");
  }

  return {
    pageCount: data.pageCount,
    fileUrl: data.fileUrl || fileUrl,
    storagePath: data.storagePath || null
  };
}

module.exports = {
  SUPPORTED_OFFICE_EXTENSIONS,
  callOfficeConverter,
  resolveConverterUrl,
};
