const { GoogleAuth } = require("google-auth-library");
const axios = require("axios");
const { CONVERTER_SERVICE_URL, INTERNAL_CONVERTER_SECRET } = require("../config/env");

const SUPPORTED_OFFICE_EXTENSIONS = new Set([
  ".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls",
  ".odt", ".ods", ".odp", ".rtf", ".txt"
]);

/**
 * Invokes the private LibreOffice converter service on Cloud Run via authenticated service-to-service call.
 * Returns { pageCount, fileUrl, storagePath } where fileUrl is the rendered PDF in Cloud Storage.
 */
async function callOfficeConverter({ fileUrl, fileName, userId, jobId }) {
  const converterUrl = (process.env.CONVERTER_SERVICE_URL || CONVERTER_SERVICE_URL).replace(/\/+$/, "");

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
};
