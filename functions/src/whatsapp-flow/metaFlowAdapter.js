"use strict";
// Mission 13: the Meta WhatsApp Flow HTTP-protocol adapter, wired to the DURABLE components
// (flowOrchestrator.js -> durableJobStore.js/worker.js/createOrderOperation.js) instead of the in-memory
// session store flowHandler.js defaults to. Same transport-agnostic shape as flowHandler.js's own handler —
// `(rawBody, headers) -> {status, headers, body}` — so it can be dropped into the existing test-only
// httpAdapter.js as a `handlerOverride` without any change there, though this mission does not wire that
// (httpAdapter.js's own default intentionally avoids real Firebase; this file requires explicit DI instead).
//
// NOT a public endpoint. NOT deployed. NOT mounted anywhere automatically.
//
// PROTOCOL EVIDENCE (re-verified live this mission, not merely carried over from earlier missions):
//   - Request: RSA-OAEP(SHA-256, MGF1-SHA256) AES key, AES-128-GCM payload, 16-byte tag appended to the
//     ciphertext [DOC CONFIRMED] — developers.facebook.com/docs/whatsapp/flows/guides/implementingyourflowendpoint
//   - Response: same AES key, IV with every bit flipped, AES-128-GCM, tag appended, base64 text [DOC CONFIRMED], same page.
//   - 421 "payload cannot be decrypted" and 432 "request signature authentication fails" are BOTH
//     [DOC CONFIRMED] against Meta's "Business endpoint error codes" reference
//     (developers.facebook.com/docs/whatsapp/flows/reference/error-codes) — 432 was [ASSUMED] in every prior
//     mission; it is now independently verified, not re-guessed.
//   - [UNVERIFIED, Meta's own docs are ambiguous here]: whether `ping` arrives signed+encrypted exactly like
//     every other action, or as a distinguished plain-JSON probe. The implementing-endpoint guide's example
//     shows `{"action":"ping"}` / `{"data":{"status":"active"}}` without stating whether that is the literal
//     wire format or already-decrypted content. This adapter takes the SAFER reading — ping is signed and
//     encrypted exactly like every other request, verified and decrypted the same way — never special-cased
//     to skip signature/decryption checks. If Meta's real traffic sends ping unsigned/unencrypted, this
//     adapter would currently reject it (432/400) rather than silently accept an unauthenticated request;
//     that failure mode is the correct one to fail into, and must be confirmed against a real test number
//     before relying on it either way.
//
// IDENTITY BOUNDARY (the actual new piece this mission adds): Meta's documented Flow Data Exchange request
// body (`{version, action, screen, data, flow_token}`) carries NO WhatsApp sender id field. The sender's
// `wa_id` is only ever known to the business at the moment IT sends the Flow message (via the ordinary
// Business Send API / webhook — outbound, not built in this repo yet). Therefore `waId` can NEVER be read
// out of a decrypted Flow Data Exchange request — doing so would mean trusting a client-supplied field for
// identity, exactly what this mission forbids. Instead, `resolveWaId(flowToken)` is an INJECTED lookup
// against a durable, server-side `flow_token -> waId` binding that whatever sends the Flow message would
// have recorded (not implemented here — out of scope). If no binding exists, the request is refused the
// same way an expired/unknown session already is; nothing in `data` is ever consulted for identity, even if
// it contains a field that LOOKS like one.
const crypto = require("crypto");
const { verifySignature, decryptRequest, encryptResponse, FlowDecryptionError } = require("./flowCrypto");
const { SCREENS } = require("./flowContract");
const { submitUpload, submitConfigure, pollProcessing, finishReview } = require("./flowOrchestrator");
const { resolveFlowTokenWaId, DEFAULT_COLLECTION: DEFAULT_IDENTITY_COLLECTION } = require("./flowTokenBinding");

const SIGNATURE_FAILURE_STATUS = 432; // [DOC CONFIRMED Mission 13] — see header comment
const text = (status, body) => ({ status, headers: { "Content-Type": "text/plain" }, body });

class AdapterConfigError extends Error {}

/**
 * Default identity resolver: reads the durable `{collection}/{flowToken}` binding flowTokenBinding.js (Mission
 * 14) writes when a Flow message is sent. Only a SENT, unexpired, non-revoked binding ever resolves to a
 * waId — see flowTokenBinding.js's resolveFlowTokenWaId for the full state/expiry contract. Never writes.
 */
function createFirestoreWaIdResolver({ db, collection = DEFAULT_IDENTITY_COLLECTION }) {
  return async function resolveWaId(flowToken) {
    return resolveFlowTokenWaId({ db, collection, flowToken });
  };
}

/**
 * @param {object} args
 * @param {string} args.privateKeyPem - RSA private key, loaded by the caller through its own secret/config
 *   boundary (e.g. Secret Manager in a real deployment, a local test key file in tests). Never hardcoded,
 *   never logged, never embedded in an error response here.
 * @param {string[]} args.appSecrets - current + optionally previous Meta app secret, same rotation support flowCrypto.js already has.
 * @param {FirebaseFirestore.Firestore} args.db
 * @param {object} [args.bucket]
 * @param {Function} [args.resolveWaId] - async (flowToken) => waId|null. Defaults to createFirestoreWaIdResolver({db}).
 * @param {string} [args.jobCollection]
 * @param {string} [args.orderLinkCollection]
 * @param {{fetchCdn:Function}} args.deps
 */
function createMetaFlowAdapter({ privateKeyPem, appSecrets, db, bucket, resolveWaId, jobCollection, orderLinkCollection, deps, pricing, concurrency, limits }) {
  if (!privateKeyPem || typeof privateKeyPem !== "string") {
    throw new AdapterConfigError("createMetaFlowAdapter requires privateKeyPem (never hardcode or fall back to a live key)");
  }
  const secrets = (Array.isArray(appSecrets) ? appSecrets : [appSecrets]).filter(Boolean);
  if (secrets.length === 0) {
    throw new AdapterConfigError("createMetaFlowAdapter requires at least one appSecret (never fall back to a live secret)");
  }
  if (!db) throw new AdapterConfigError("createMetaFlowAdapter requires db");
  const resolve = resolveWaId || createFirestoreWaIdResolver({ db });

  async function dispatch(req) {
    const { action, screen, data = {}, flow_token: flowToken } = req;
    if (data && data.error) return { data: { acknowledged: true } }; // [DOC] client error notification -> acknowledged:true
    if (action === "ping") return { data: { status: "active" } }; // [DOC] health check
    if (action === "INIT") return { screen: SCREENS.UPLOAD, data: {} };
    if (action === "BACK") return { screen: SCREENS.UPLOAD, data: {} };

    if (action === "data_exchange" && screen === SCREENS.UPLOAD) {
      // Mission 27: UPLOAD's DocumentPicker result now arrives via data_exchange (Meta's validator rejects
      // forwarding it through a client-side `navigate` payload) — see submitUpload's own header comment.
      // Identity is NOT resolved/required here: nothing is written, no session needs to exist yet, and this
      // is the Flow's own entry screen, so there is no prior binding state to check ownership against.
      return submitUpload({ data });
    }

    if (action === "data_exchange") {
      // The ONLY place identity enters the system: looked up from the server-held binding for this
      // flow_token, NEVER from `data`. A spoofed `data.waId`/`data.userId`/etc. is never read here — the
      // destructuring above doesn't even extract such a field, and nothing below does either.
      const waId = await resolve(flowToken);
      if (!waId) {
        // Mission 27: refuses by REFRESHING the screen the request came from, never by jumping back to
        // UPLOAD — Meta's routing_model no longer permits declaring a backward edge from CONFIGURE/
        // PROCESSING/REVIEW to UPLOAD (see the Mission 26 report). A self-refresh needs no declared edge.
        const sessionExpired = "Session expired. Please close this and start a new print request.";
        if (screen === SCREENS.CONFIGURE) return { screen: SCREENS.CONFIGURE, data: { error_message: sessionExpired } };
        if (screen === SCREENS.PROCESSING) return { screen: SCREENS.PROCESSING, data: { status_text: sessionExpired } };
        if (screen === SCREENS.REVIEW) return { screen: SCREENS.REVIEW, data: { error_message: sessionExpired } };
        return { screen: SCREENS.UPLOAD, data: { error_message: "Session expired. Please upload your files again." } };
      }

      if (screen === SCREENS.CONFIGURE) {
        return submitConfigure({ db, jobCollection, flowToken, waId, data });
      }
      if (screen === SCREENS.PROCESSING) {
        return pollProcessing({ db, jobCollection, flowToken, waId });
      }
      if (screen === SCREENS.REVIEW) {
        const { response } = await finishReview({ db, bucket, jobCollection, orderLinkCollection, flowToken, waId });
        return response;
      }
    }
    return { screen: screen || SCREENS.UPLOAD, data: { error_message: "Unsupported request" } };
  }

  return async function handle(rawBody, headers = {}) {
    if (!verifySignature(rawBody, headers["x-hub-signature-256"], secrets)) return text(SIGNATURE_FAILURE_STATUS, "invalid signature");
    let parsed;
    try { parsed = JSON.parse(rawBody.toString("utf8")); } catch { return text(400, "bad json"); }
    let dec;
    try { dec = decryptRequest(parsed, privateKeyPem); } catch (e) {
      if (e instanceof FlowDecryptionError) return text(421, "decryption failed"); // [DOC] 421 makes the client refetch the public key
      return text(500, "error"); // never a crypto/internal detail in the response
    }
    try {
      const response = await dispatch(dec.decryptedBody);
      return text(200, encryptResponse(response, dec.aesKey, dec.iv));
    } catch (e) {
      return text(500, "error"); // never a fake success on internal failure; never the exception's own message
    }
  };
}

module.exports = { createMetaFlowAdapter, createFirestoreWaIdResolver, AdapterConfigError, SIGNATURE_FAILURE_STATUS };
