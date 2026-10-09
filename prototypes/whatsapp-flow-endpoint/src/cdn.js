"use strict";
// Bounded CDN download. Default policy is deny: the caller must list allowed host suffixes
// ([ASSUMED] Meta CDN host names are NOT verified here). No redirects are followed, size is capped while streaming.
const http = require("http");
const https = require("https");

class CdnError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

function createCdnFetcher({ allowedHostSuffixes = [], allowLoopbackHttp = false, maxBytes, timeoutMs = 8000 }) {
  return function fetchCdn(urlString) {
    return new Promise((resolve, reject) => {
      let url;
      try { url = new URL(urlString); } catch { return reject(new CdnError("BAD_URL")); }
      const loopback = allowLoopbackHttp && url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
      if (!loopback) {
        if (url.protocol !== "https:") return reject(new CdnError("BAD_SCHEME"));
        if (!allowedHostSuffixes.some((s) => url.hostname === s || url.hostname.endsWith(s.startsWith(".") ? s : "." + s))) {
          return reject(new CdnError("HOST_NOT_ALLOWED"));
        }
      }
      const lib = url.protocol === "https:" ? https : http;
      const req = lib.get(url, { timeout: timeoutMs }, (res) => {
        if (res.statusCode !== 200) { res.resume(); return reject(new CdnError("HTTP_" + res.statusCode)); }
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > maxBytes) { res.destroy(); return reject(new CdnError("TOO_LARGE")); }
        const chunks = [];
        let size = 0;
        res.on("data", (c) => {
          size += c.length;
          if (size > maxBytes) { res.destroy(); reject(new CdnError("TOO_LARGE")); } else chunks.push(c);
        });
        res.on("end", () => resolve(Buffer.concat(chunks, size)));
        res.on("error", (e) => reject(new CdnError("NETWORK", e.message)));
        res.on("aborted", () => reject(new CdnError("TRUNCATED_DOWNLOAD")));
      });
      req.on("timeout", () => { req.destroy(); reject(new CdnError("TIMEOUT")); });
      req.on("error", (e) => reject(new CdnError("NETWORK", e.message)));
    });
  };
}

module.exports = { createCdnFetcher, CdnError };
