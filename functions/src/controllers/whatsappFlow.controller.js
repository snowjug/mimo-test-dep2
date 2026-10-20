"use strict";
// Mission 16: the real, Meta-reachable HTTP endpoint for the WhatsApp Flow Data Exchange protocol. Wires the
// EXISTING, already-tested components (src/whatsapp-flow/metaFlowAdapter.js — signature verification, RSA/AES
// decryption, dispatch to flowOrchestrator.js, response encryption) to the real, already-initialized Firebase
// Admin singleton (functions/src/config/firebase.js). No second `admin.initializeApp()`, no duplicated
// business logic: order creation still goes entirely through createOrderOperation.js's existing idempotent,
// identity- and SV-002-gated chain (via flowOrchestrator.js), nothing here re-implements or bypasses it.
//
// Mission 23: these modules used to live in prototypes/whatsapp-flow-endpoint/src/ and were required across
// the deployment boundary (`../../../prototypes/...`) — that directory is NEVER uploaded by Firebase (only
// `functions/`, per firebase.json's `"source": "functions"`), so the deployed container crashed at startup
// with `Cannot find module '../../../prototypes/whatsapp-flow-endpoint/src/metaFlowAdapter'`. The real
// implementation now lives in src/whatsapp-flow/ (inside the deployed package); the old prototype location is
// a thin re-export kept only for the ~18 existing prototype tests/scripts that still require it from there.
//
// Fails closed if not configured: without FLOW_PRIVATE_KEY_PEM and FLOW_APP_SECRET (functions/src/config/env.js
// — Secret Manager in production, never hardcoded), every request to this endpoint gets a 500 and the request
// is otherwise a no-op. No secret, key, or decrypted payload is ever logged — only which named value is absent.
const { admin, db } = require("../config/firebase");
const { FLOW_PRIVATE_KEY_PEM, FLOW_APP_SECRET, FLOW_APP_SECRET_PREVIOUS } = require("../config/env");
const { createMetaFlowAdapter } = require("../whatsapp-flow/metaFlowAdapter");
const { createCdnFetcher } = require("../whatsapp-flow/cdn");

// [DOC CONFIRMED, Mission 17] Meta's "Implementing Endpoint for Flows" guide's own worked example shows a
// `cdn_url` of `https://mmg.whatsapp.net/v/...` — the doc states only "WhatsApp CDN" in prose, but this is the
// one concrete host Meta's own documentation exercises, so the allow-list targets its apex domain rather than
// the previously-guessed `fbsbx.com` (which had zero documentary or observed support). Still not verified
// against a real inbound Flow document upload — confirm against real traffic before relying on it further,
// and widen only with evidence, never by removing the allow-list outright.
const FLOW_MEDIA_CDN_HOST_SUFFIXES = ["whatsapp.net"];
const MAX_MEDIA_BYTES = 30 * 1024 * 1024;

let cachedHandle = null;
let cachedConfigSignature = null;

// Lengths only, never the values — lets the cache react to a Secret Manager value changing at runtime
// without ever comparing or logging the secret itself.
function configSignature() {
  return `${FLOW_PRIVATE_KEY_PEM.length}:${FLOW_APP_SECRET.length}:${FLOW_APP_SECRET_PREVIOUS.length}`;
}

function buildHandle() {
  const bucket = admin.storage().bucket();
  const deps = { fetchCdn: createCdnFetcher({ allowedHostSuffixes: FLOW_MEDIA_CDN_HOST_SUFFIXES, maxBytes: MAX_MEDIA_BYTES }) };
  return createMetaFlowAdapter({
    privateKeyPem: FLOW_PRIVATE_KEY_PEM,
    appSecrets: [FLOW_APP_SECRET, FLOW_APP_SECRET_PREVIOUS].filter(Boolean),
    db,
    bucket,
    deps,
  });
}

function getHandle() {
  if (!FLOW_PRIVATE_KEY_PEM || !FLOW_APP_SECRET) return null;
  const sig = configSignature();
  if (cachedHandle && cachedConfigSignature === sig) return cachedHandle;
  cachedHandle = buildHandle();
  cachedConfigSignature = sig;
  return cachedHandle;
}

async function postFlowDataExchange(req, res) {
  const handle = getHandle();
  if (!handle) {
    console.error(
      "[WHATSAPP FLOW ENDPOINT] not configured — missing",
      !FLOW_PRIVATE_KEY_PEM ? "FLOW_PRIVATE_KEY_PEM" : "FLOW_APP_SECRET"
    );
    return res.status(500).send("flow endpoint not configured");
  }
  if (!Buffer.isBuffer(req.rawBody)) {
    console.error("[WHATSAPP FLOW ENDPOINT] missing req.rawBody — check verify-middleware ordering in server.js");
    return res.status(500).send("error");
  }
  try {
    const result = await handle(req.rawBody, req.headers);
    res.set(result.headers || {});
    return res.status(result.status).send(result.body);
  } catch (err) {
    console.error("[WHATSAPP FLOW ENDPOINT] unexpected error:", err.message);
    return res.status(500).send("error");
  }
}

module.exports = { postFlowDataExchange, FLOW_MEDIA_CDN_HOST_SUFFIXES };
