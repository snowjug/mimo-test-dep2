"use strict";
// Transport-agnostic Flow endpoint handler: (rawBody, headers) -> {status, headers, body}.
// Status codes: 421 on decryption failure [DOC]. Signature failure code is [ASSUMED] 432 (Meta's page says "the
// appropriate HTTP code from the error codes reference", which this session did not retrieve) - verify before deploy.
// TEST WORKFLOW ONLY: no order, payment or print-job side effects exist anywhere in this file.
const crypto = require("crypto");
const { verifySignature, decryptRequest, encryptResponse, FlowDecryptionError } = require("./flowCrypto");
const { processDocuments } = require("./pipeline");
const { pricingContext } = require("./pricingAdapter");
const { requestKey } = require("./idempotency");
const { COLOR_NOTICE, SCREENS, COLOR_MODES, MAX_COPIES } = require("./flowContract");
const { createJobStore } = require("./testState");

const SIGNATURE_FAILURE_STATUS = 432;
const text = (status, body) => ({ status, headers: { "Content-Type": "text/plain" }, body });
const fingerprintOf = (v) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");

/** REVIEW screen data. Page counts come only from successfully processed files; there is NO order total. */
function reviewData(r, colorMode, copies, pricing) {
  const color = colorMode === "color";
  const rate = pricing.rates && Number(color ? pricing.rates.pricePerPageColor : pricing.rates.pricePerPageBW);
  return {
    files: r.files.map((f) => ({ id: f.name, main_content: { title: f.name, metadata: `${f.pages} page(s)` } })),
    files_summary: r.files.map((f) => `• ${f.name} - ${f.pages} page(s)`).join("\n"),
    total_pages: r.totalPages,
    total_pages_text: `Total pages: ${r.totalPages}`,
    settings_text: `${color ? "Color" : "B&W"}, ${copies} ${copies === 1 ? "copy" : "copies"}`,
    color_notice: color ? COLOR_NOTICE : "",
    show_color_notice: color,
    rates_text: Number.isFinite(rate) ? `Configured rate: Rs ${rate} per page (${color ? "Color" : "B&W"})` : "Per-page rate unavailable",
    pricing_text: "Order total is not calculated in this test workflow (no pricing interface exists yet).",
    pricing_status: pricing.status,
  };
}

function createFlowHandler({ privateKeyPem, appSecrets, deps, db, idempotency, concurrency = 1, limits, pricing: pricingFn = pricingContext, jobs = createJobStore() }) {
  const uploadError = (error_message) => ({ screen: SCREENS.UPLOAD, data: { error_message } });
  const processing = (status_text) => ({ screen: SCREENS.PROCESSING, data: { status_text } });

  /** CONFIGURE -> PROCESSING: validate the form, then start (at most one) background check of the files. */
  function submitOptions(flowToken, data) {
    if (!flowToken) return uploadError("Session missing. Please start again.");
    if (!Array.isArray(data.documents) || data.documents.length === 0) return uploadError("Please choose at least one file.");
    if (!COLOR_MODES.includes(data.color)) return { screen: SCREENS.CONFIGURE, data: { error_message: "Please choose B&W or Color." } };
    const copies = Number(data.copies);
    if (!Number.isInteger(copies) || copies < 1 || copies > MAX_COPIES) return { screen: SCREENS.CONFIGURE, data: { error_message: `Copies must be between 1 and ${MAX_COPIES}.` } };
    const { documents, color } = data;
    jobs.start(flowToken, fingerprintOf({ documents, color, copies }), async () => {
      const r = await processDocuments(documents, deps, { concurrency, limits });
      if (r.errors.length) return { ok: false, error_message: `Could not process ${r.errors.length} file(s): ${[...new Set(r.errors.map((e) => e.code))].join(", ")}` };
      const pricing = await pricingFn(db, { totalRawPages: r.totalPages, colorMode: color, copies });
      return { ok: true, review: reviewData(r, color, copies, pricing) };
    });
    return processing(`Checking ${documents.length} file(s). Nothing refreshes automatically: tap "Check status" to see progress.`);
  }

  /** PROCESSING -> PROCESSING | REVIEW | UPLOAD. Read-only; the client must ask again to see progress. */
  function checkStatus(flowToken) {
    const job = flowToken && jobs.get(flowToken);
    if (!job) return uploadError("Session expired. Please upload your files again.");
    if (job.state === "PROCESSING") return processing('Still checking your files. Tap "Check status" again in a few seconds.');
    if (job.state === "FAILED") { jobs.delete(flowToken); return uploadError("Something went wrong while checking your files. Please try again."); }
    if (!job.result.ok) { jobs.delete(flowToken); return uploadError(job.result.error_message); }
    return { screen: SCREENS.REVIEW, data: job.result.review };
  }

  async function dispatch(req) {
    const { action, screen, data = {}, flow_token: flowToken } = req;
    if (data && data.error) return { data: { acknowledged: true } }; // [DOC] client error notification -> acknowledged:true
    if (action === "ping") return { data: { status: "active" } }; // [DOC] health check
    if (action === "INIT") return { screen: SCREENS.UPLOAD, data: {} };
    if (action === "BACK") return { screen: SCREENS.UPLOAD, data: {} };
    if (action === "data_exchange" && screen === SCREENS.UPLOAD) {
      // Single-call route kept from the original prototype contract: files + options in one request.
      const r = await processDocuments(data.documents, deps, { concurrency, limits });
      if (r.errors.length) {
        // [DOC] error_message in data shows a snackbar on the same screen. Partial success is never reported as success.
        return uploadError(`Could not process ${r.errors.length} file(s): ${[...new Set(r.errors.map((e) => e.code))].join(", ")}`);
      }
      const colorMode = data.color === "color" ? "color" : "bw";
      const copies = Number(data.copies) || 1;
      const pricing = await pricingFn(db, { totalRawPages: r.totalPages, colorMode, copies });
      return { screen: SCREENS.REVIEW, data: reviewData(r, colorMode, copies, pricing) };
    }
    if (action === "data_exchange" && screen === SCREENS.CONFIGURE) return submitOptions(flowToken, data || {});
    if (action === "data_exchange" && screen === SCREENS.PROCESSING) return checkStatus(flowToken);
    if (action === "data_exchange" && screen === SCREENS.REVIEW) {
      jobs.delete(flowToken);
      // [DOC] completion: screen SUCCESS + extension_message_response.params.flow_token
      return { screen: SCREENS.SUCCESS, data: { extension_message_response: { params: { flow_token: flowToken } } } };
    }
    return { screen: screen || SCREENS.UPLOAD, data: { error_message: "Unsupported request" } };
  }

  return async function handle(rawBody, headers = {}) {
    if (appSecrets && !verifySignature(rawBody, headers["x-hub-signature-256"], appSecrets)) return text(SIGNATURE_FAILURE_STATUS, "invalid signature");
    let parsed;
    try { parsed = JSON.parse(rawBody.toString("utf8")); } catch { return text(400, "bad json"); }
    let dec;
    try { dec = decryptRequest(parsed, privateKeyPem); } catch (e) {
      if (e instanceof FlowDecryptionError) return text(421, "decryption failed"); // [DOC] 421 makes the client refetch the public key
      return text(500, "error");
    }
    try {
      const run = () => dispatch(dec.decryptedBody);
      // Exempt from the replay cache: "Check status" (a read-only poll; a cached answer would freeze PROCESSING) and
      // the CONFIGURE submit (the job store already de-duplicates it by fingerprint, and replaying a cached
      // "PROCESSING" after a failed job would strand the user without a job).
      const uncached = [SCREENS.PROCESSING, SCREENS.CONFIGURE];
      const cacheable = idempotency && dec.decryptedBody.action === "data_exchange" && !uncached.includes(dec.decryptedBody.screen);
      const response = await (cacheable ? idempotency.run(requestKey(dec.decryptedBody), run) : run());
      return text(200, encryptResponse(response, dec.aesKey, dec.iv));
    } catch (e) {
      return text(500, "error"); // never a fake success on internal failure
    }
  };
}

module.exports = { createFlowHandler, SIGNATURE_FAILURE_STATUS };
