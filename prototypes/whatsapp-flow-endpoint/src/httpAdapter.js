"use strict";
// TEST-ONLY local HTTP adapter around the existing Flow handler (src/flowHandler.js). It adds transport concerns
// only: config validation, routing, size/type limits, timeouts, safe logging. All Flow behaviour (crypto, signature
// check, idempotency, screens) stays in the handler. Node built-ins only; no Express; not mounted in functions/.
//
// Safety posture:
//  - fails closed: refuses to start without valid dedicated test settings (FLOWTEST_*), and refuses to start when
//    ambient production credentials are present in the environment;
//  - binds to loopback only; this module never opens a public listener;
//  - no database (pricing reads a stub that falls back to the repository's default rates), no payments, no
//    printing, no kiosk access; media downloads are limited to an explicit host allowlist (default: none);
//  - logs only method, path, status and duration. Bodies, headers, keys and secrets are never logged.
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const { createFlowHandler } = require("./flowHandler");
const { createCdnFetcher } = require("./cdn");
const { createIdempotency } = require("./idempotency");

const FLOW_PATH = "/flow";
const HEALTH_PATH = "/healthz";
const READY_PATH = "/readyz";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
// Presence of any of these means the process may be holding production authority; refuse rather than guess.
const FORBIDDEN_ENV = Object.freeze(["WA_ACCESS_TOKEN", "WA_VERIFY_TOKEN", "WA_PHONE_NUMBER_ID", "GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_CONFIG", "FIREBASE_SERVICE_ACCOUNT", "CASHFREE_SECRET_KEY", "CASHFREE_APP_ID", "K_SERVICE", "FUNCTION_TARGET"]);

class ConfigError extends Error {}

const intIn = (raw, name, def, min, max) => {
  if (raw === undefined || raw === "") return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new ConfigError(`${name} must be an integer between ${min} and ${max}`);
  return n;
};

/** Validate settings from an env-like object. Throws ConfigError with a message that never contains a secret value. */
function loadConfig(env = process.env, { readFile = fs.readFileSync } = {}) {
  if (env.FLOWTEST_MODE !== "test") throw new ConfigError('FLOWTEST_MODE must be exactly "test"');
  const present = FORBIDDEN_ENV.filter((k) => env[k]);
  if (present.length) throw new ConfigError(`refusing to start: production-style variables present in the environment (${present.join(", ")})`);

  const keyFile = env.FLOWTEST_PRIVATE_KEY_FILE;
  if (!keyFile) throw new ConfigError("FLOWTEST_PRIVATE_KEY_FILE is required");
  let privateKeyPem;
  try {
    privateKeyPem = readFile(keyFile, "utf8");
    const key = crypto.createPrivateKey(privateKeyPem);
    if (key.asymmetricKeyType !== "rsa") throw new Error("not rsa");
    if ((key.asymmetricKeyDetails.modulusLength || 0) < 2048) throw new Error("too small");
  } catch {
    throw new ConfigError("FLOWTEST_PRIVATE_KEY_FILE must point to a readable RSA private key of at least 2048 bits");
  }

  const secrets = [env.FLOWTEST_APP_SECRET, env.FLOWTEST_APP_SECRET_PREVIOUS].filter(Boolean);
  if (!env.FLOWTEST_APP_SECRET || env.FLOWTEST_APP_SECRET.length < 16) throw new ConfigError("FLOWTEST_APP_SECRET is required (min 16 characters, test value only)");
  if (env.FLOWTEST_APP_SECRET_PREVIOUS && env.FLOWTEST_APP_SECRET_PREVIOUS.length < 16) throw new ConfigError("FLOWTEST_APP_SECRET_PREVIOUS must be at least 16 characters when set");

  const host = env.FLOWTEST_HOST || "127.0.0.1";
  if (!LOOPBACK_HOSTS.has(host)) throw new ConfigError("FLOWTEST_HOST must be a loopback address (127.0.0.1, ::1 or localhost): this adapter is never exposed publicly");

  const cdnHosts = (env.FLOWTEST_ALLOWED_CDN_HOSTS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const h of cdnHosts) if (!/^\.?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h)) throw new ConfigError("FLOWTEST_ALLOWED_CDN_HOSTS contains an invalid host suffix");
  const allowLoopbackCdn = env.FLOWTEST_ALLOW_LOOPBACK_CDN === "1";

  return Object.freeze({
    host,
    port: intIn(env.FLOWTEST_PORT, "FLOWTEST_PORT", 8787, 1024, 65535),
    privateKeyPem,
    appSecrets: secrets,
    maxBodyBytes: intIn(env.FLOWTEST_MAX_BODY_BYTES, "FLOWTEST_MAX_BODY_BYTES", 1024 * 1024, 1024, 8 * 1024 * 1024),
    handlerTimeoutMs: intIn(env.FLOWTEST_HANDLER_TIMEOUT_MS, "FLOWTEST_HANDLER_TIMEOUT_MS", 9000, 100, 30000), // Meta's endpoint timeout is 10 s [DOC]
    maxConcurrent: intIn(env.FLOWTEST_MAX_CONCURRENT, "FLOWTEST_MAX_CONCURRENT", 32, 1, 256),
    cdnHosts,
    allowLoopbackCdn,
  });
}

/** Read-only stand-in for the pricing settings read: no Firestore, so loadPricing falls back to repository defaults. */
const noDatabase = () => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }) }) });

const defaultLogger = (entry) => process.stdout.write(JSON.stringify(entry) + "\n");

const SECURITY_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
function send(res, status, body, contentType = "text/plain", extra = {}) {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(status, { "Content-Type": contentType, "Content-Length": Buffer.byteLength(body), ...SECURITY_HEADERS, ...extra });
  res.end(body);
}

/** Collect the raw body with a hard size cap. Resolves {tooLarge:true} instead of buffering past the limit. */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > limit) { req.resume(); return resolve({ tooLarge: true }); }
    const chunks = []; let size = 0; let over = false;
    req.on("data", (c) => {
      if (over) return;
      size += c.length;
      if (size > limit) { over = true; chunks.length = 0; return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(over ? { tooLarge: true } : { body: Buffer.concat(chunks, size) }));
    req.on("error", reject);
    req.on("aborted", () => reject(new Error("aborted")));
  });
}

/**
 * Build (but do not start) the adapter. `config` comes from loadConfig(); `handlerOverride` is for tests only.
 * @returns {{server: http.Server, listen: Function, close: Function}}
 */
function createHttpAdapter(config, { logger = defaultLogger, handlerOverride } = {}) {
  if (!config || !config.privateKeyPem || !config.appSecrets || config.appSecrets.length === 0) throw new ConfigError("adapter requires a validated config");
  const handle = handlerOverride || createFlowHandler({
    privateKeyPem: config.privateKeyPem,
    appSecrets: config.appSecrets,
    deps: { fetchCdn: createCdnFetcher({ allowedHostSuffixes: config.cdnHosts, allowLoopbackHttp: config.allowLoopbackCdn, maxBytes: 25 * 1024 * 1024 }) },
    db: noDatabase(),
    idempotency: createIdempotency(),
  });
  let inflight = 0;

  const server = http.createServer(async (req, res) => {
    const t0 = process.hrtime.bigint();
    const url = (req.url || "").split("?")[0];
    const done = (status, outcome) => logger({ event: "request", method: req.method, path: ["/flow", "/healthz", "/readyz"].includes(url) ? url : "other", status, outcome, ms: Number((process.hrtime.bigint() - t0) / 1000000n) });
    try {
      if (url === HEALTH_PATH || url === READY_PATH) {
        if (req.method !== "GET") { send(res, 405, "method not allowed", "text/plain", { Allow: "GET" }); return done(405, "method"); }
        send(res, 200, JSON.stringify({ status: url === READY_PATH ? "ready" : "ok" }), "application/json");
        return done(200, "ok");
      }
      if (url !== FLOW_PATH) { send(res, 404, "not found"); return done(404, "path"); }
      if (req.method !== "POST") { send(res, 405, "method not allowed", "text/plain", { Allow: "POST" }); return done(405, "method"); }
      if (!/^application\/json\s*(;|$)/i.test(req.headers["content-type"] || "")) { req.resume(); send(res, 415, "unsupported media type"); return done(415, "content-type"); }
      if (inflight >= config.maxConcurrent) { req.resume(); send(res, 503, "busy", "text/plain", { "Retry-After": "1" }); return done(503, "busy"); }

      inflight++;
      try {
        const read = await readBody(req, config.maxBodyBytes);
        if (read.tooLarge) { send(res, 413, "payload too large", "text/plain", { Connection: "close" }); return done(413, "size"); }
        let timer;
        const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), config.handlerTimeoutMs); });
        const out = await Promise.race([handle(read.body, { "x-hub-signature-256": req.headers["x-hub-signature-256"] }), timeout]).finally(() => clearTimeout(timer));
        if (out === null) { send(res, 504, "timeout"); return done(504, "timeout"); }
        send(res, out.status, out.body, (out.headers && out.headers["Content-Type"]) || "text/plain");
        return done(out.status, out.status === 200 ? "handled" : "handler-error");
      } finally { inflight--; }
    } catch {
      send(res, 500, "error");
      done(500, "exception"); // internal details are deliberately not logged or returned
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 50;
  server.on("clientError", (_e, socket) => { if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"); });

  return {
    server,
    listen: () => new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.port, config.host, () => resolve(server.address()));
    }),
    close: () => new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections && server.closeAllConnections(); }),
  };
}

module.exports = { loadConfig, createHttpAdapter, ConfigError, FORBIDDEN_ENV, FLOW_PATH, HEALTH_PATH, READY_PATH };
