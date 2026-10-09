# WhatsApp Flow endpoint — isolated feasibility prototype (Mission 4)

Not wired into `functions/`, not deployed, no production code modified. Uses only synthetic files, generated RSA keys,
a test app secret, a loopback "CDN" and a stub database. It reads (never edits) two repo modules:
`functions/src/services/pdf.service.js` (page counting, same call as `whatsapp.controller.js:295-297`) and
`functions/src/services/pricing.service.js` (`loadPricing`).

## Files
| Path | Purpose |
|---|---|
| `src/flowCrypto.js` | RSA-OAEP/AES-GCM request decrypt, response encrypt (flipped IV), `X-Hub-Signature-256` check |
| `src/flowMedia.js` | Media decrypt/verify (AES-256-CBC + HMAC-SHA256 + hashes), magic-byte type sniffing |
| `src/cdn.js` | Bounded download: default-deny host allowlist, size cap while streaming, no redirects, timeout |
| `src/pipeline.js` | download → verify/decrypt → validate → page count, per-stage timings, temp-dir cleanup, limits |
| `src/flowHandler.js` | `(rawBody, headers) → {status, headers, body}`; ping/INIT/BACK/data_exchange/completion/error-ack |
| `src/idempotency.js` | In-memory duplicate/retry simulation (single process only) |
| `src/pricingAdapter.js` | Reuses `loadPricing`; returns rates only (see Pricing) |
| `src/flowContract.js`, `src/testState.js` | Shared screen IDs / exact colour notice; in-memory test job store |
| `src/httpAdapter.js`, `bin/flow-test-server.js`, `bin/gen-test-key.js` | Test-only loopback HTTP adapter, its launcher and a throwaway-key generator |
| `flow/mimo-print.flow.json`, `flow/validate-flow.js` | The Flow definition and its local structural validator |
| `test/*.test.js`, `test/fixtures.js` | 62 tests (24 + 20 Flow + 18 HTTP adapter); fixtures generate keys, PDFs, PNGs, encrypted media, loopback CDN |
| `bench/run.js`, `bench/coldstart*.js`, `bench/results-*.json` | Benchmarks and the recorded run |

## Run
```
cd prototypes/whatsapp-flow-endpoint
node --test test/*.test.js      # 62 tests, ~12 s, no installs needed (uses functions/node_modules/pdf-lib)
node bench/run.js 15            # writes a NEW bench/results-<timestamp>.json (flag wx, never overwrites)
node bench/coldstart.js 7
```

## Flow UI (Mission 10) - internal test workflow
**Status: authored and exercised locally only.** The Flow has NOT been uploaded to Meta or opened in WhatsApp. It is a test workflow: it creates no order, takes no payment, contacts no kiosk and dispatches no print job. Its only database access is the read of pricing settings.

**Definition:** `flow/mimo-print.flow.json` (Flow JSON `version` "6.2", `data_api_version` "3.0" - both **[ASSUMED]**, confirm in Flow Builder). Shared constants (screen IDs, exact colour notice, copies limit): `src/flowContract.js`.

### Screens and navigation
| Screen | What the user does | Action | Next |
|---|---|---|---|
| `UPLOAD` | Picks up to 10 PDF/JPG/PNG files (10 MB each). Told that picking is not validation. | `navigate` (client side, no server call) | `CONFIGURE` |
| `CONFIGURE` | B&W / Color, copies 1-10. Colour shows the exact notice. No printer choice, no duplex. | `data_exchange` | `PROCESSING` (valid), or `UPLOAD`/`CONFIGURE` with a snackbar (invalid) |
| `PROCESSING` | Taps **Check status**. Nothing refreshes by itself. | `data_exchange` (read-only poll) | `PROCESSING` (still working), `REVIEW`, or `UPLOAD` with an error |
| `REVIEW` | Sees files, page counts, settings, the configured per-page rate and "total not calculated". | `data_exchange` | `SUCCESS` |
| `SUCCESS` (terminal) | Reads that this was a simulated test. | `complete` | - |

`routing_model` in the JSON lists exactly these hops; a test asserts every server response stays inside it.

### Data-exchange contract (handler: `src/flowHandler.js`)
Requests are Meta-encrypted; below is the decrypted body. `flow_token` identifies the test session.
- `INIT` -> `{screen:"UPLOAD", data:{}}`. `ping` -> `{data:{status:"active"}}`.
- `CONFIGURE` request `data`: `{documents:[Flow media objects], color:"bw"|"color", copies:"1".."10"}`. Bad input never starts a download: no/invalid `documents` -> `UPLOAD`+`error_message`; bad `color`/`copies` -> `CONFIGURE`+`error_message`; missing `flow_token` -> `UPLOAD`+`error_message`. Valid -> `PROCESSING` `{status_text}`.
- `PROCESSING` request: the server looks the job up by `flow_token`. Pending -> `PROCESSING`; success -> `REVIEW`; file failure or exception -> `UPLOAD`+`error_message` and the job is cleared; unknown token -> `UPLOAD` ("Session expired").
- `REVIEW` data: `files_summary`, `total_pages`, `total_pages_text`, `settings_text`, `color_notice`, `show_color_notice`, `rates_text`, `pricing_text`, `pricing_status`, plus `files` (kept from the earlier contract). **There is no total price field**: `pricing_status` stays `MISSING_INTERFACE:priceOrder` and `pricing_text` says the total is not calculated.
- `REVIEW` request -> `{screen:"SUCCESS", data:{extension_message_response:{params:{flow_token}}}}` and the job is dropped.
- Anything else -> same screen + `error_message:"Unsupported request"`.
- The original single-call route (`UPLOAD` + `data_exchange` with files and options) is kept so the Mission 4 contract and its tests still hold; the shipped Flow does not use it.
- Replay cache: `CONFIGURE` and `PROCESSING` requests are deliberately **not** cached (a cached poll would freeze the screen; a cached submit would strand a user after a failed job). Duplicate submits are instead de-duplicated by the job store (same token + same files/options = one download pass).
- Job state (`src/testState.js`) is in memory, single process, lost on restart. It is not a production session store.

### Commands
Everything runs locally with Node only; there is no HTTP server in the prototype (the handler is `(rawBody, headers) -> response`, driven by the tests). No installs are needed (`functions/node_modules` must already exist).
```
bash scriptsC/harness/verify-whatsapp.sh                      # structure check + all tests, from any directory
node prototypes/whatsapp-flow-endpoint/flow/validate-flow.js  # Flow JSON structural validation only (exit 0/1/2)
cd prototypes/whatsapp-flow-endpoint && node --test test/*.test.js   # 62 tests
```
The validator checks: parseable JSON, unique screen IDs, `routing_model` consistency and reachability, navigate/`complete` action shapes, one Footer per screen, unique component names, `${data.*}`/`${form.*}` references, and that `data_api_version`/`routing_model` exist when `data_exchange` is used. **It does not prove Meta will accept the Flow**; `verify-whatsapp.sh` reports Meta validation as a separate SKIPPED external step.

### Synthetic fixtures
Generated RSA keys, `TEST_APP_SECRET = "test-app-secret-not-real"`, generated PDFs/PNGs, a loopback fixture CDN and a recording stub database that throws on any write. `test/flowscreens.test.js` also asserts that nothing in `src/` requires payment, Cashfree, Firebase, kiosk or the production WhatsApp code.

### Limitations
- Not opened in WhatsApp; Flow JSON version and component support are unverified against Meta (`DocumentPicker`, `If` with `${form.*}`, a self-loop on `PROCESSING` in `routing_model`, `complete` payload shape, media field names).
- Client-side Back is not routed to the server (`refresh_on_back` is not set); the `BACK` handler exists but the Flow does not use it.
- No duplex (not supported by the intended implementation), no printer choice, no order total, no payment, no real routing. Colour routing to SV-002 (ACTIVE and colour-capable) and B&W following backend routing policy are future real-order work.
- Office documents are rejected (`NEEDS_CONVERSION`). Page counts appear only for files that were downloaded, decrypted and parsed successfully.
- Job state is single-process memory.

### To open the Flow on a WhatsApp test number (needs Meta access; nothing below was done)
1. Meta developer account, a WhatsApp Business Account with a test number, and a registered business app.
2. Create a Flow in Flow Builder (or Flows API) from `flow/mimo-print.flow.json`; fix whatever Meta's validator rejects and re-run `validate-flow.js` + tests.
3. Deploy this handler as a separate, differently named HTTPS endpoint (needs explicit authorization), upload the business public key, set the app secret in secure config, set the Flow's endpoint URI, and resolve the `[ASSUMED]` items in the table above.
4. Send a Flow message to an allow-listed test number, open it in the WhatsApp client, and walk the five screens with synthetic documents only.
5. Measure real round trips and cold start; decide on Firestore-backed job state before any multi-instance use.

## Local HTTP adapter (Mission 12) - TEST ONLY
`src/httpAdapter.js` wraps the existing handler (`src/flowHandler.js`) in a small Node `http` server so the Flow can be exercised over HTTP on this machine. It adds transport concerns only (config validation, routing, limits, timeouts, safe logging); crypto, signature checks, idempotency and screens are the handler's. It is **not** mounted in `functions/`, not deployed, and **not publicly reachable**: it refuses any non-loopback bind. A local HTTP endpoint is not a public HTTPS endpoint, and Meta requires HTTPS with a valid certificate.

### Routes
| Route | Behaviour |
|---|---|
| `POST /flow` | Flow endpoint. `Content-Type: application/json` required (415 otherwise), body capped (413), signature + decryption + Flow logic by the handler (432 / 421 / 400 / 500 as in the handler), 504 if the handler exceeds the time budget, 503 above the concurrency cap. Success is `200 text/plain` (base64). |
| `GET /healthz`, `GET /readyz` | `200 {"status":"ok"}` / `{"status":"ready"}`. Fixed body; reveals nothing about configuration. |
| anything else | 404; wrong method on a known path: 405 with `Allow`. |

### Start it locally
```
cd prototypes/whatsapp-flow-endpoint
node bin/gen-test-key.js <folder OUTSIDE this repository>     # throwaway RSA-2048 test key; refuses to write inside the repo
# set the variables below in your shell (values are yours; never commit them), then:
node bin/flow-test-server.js                                  # listens on http://127.0.0.1:8787
```
Configuration is read from the environment only (all values test-only; nothing is read from `functions/` or any `.env`):

| Variable | Required | Meaning |
|---|---|---|
| `FLOWTEST_MODE` | yes | must be exactly `test` |
| `FLOWTEST_PRIVATE_KEY_FILE` | yes | path to an RSA private key (>= 2048 bits), PEM |
| `FLOWTEST_APP_SECRET` | yes | test app secret (>= 16 chars) used for `X-Hub-Signature-256` |
| `FLOWTEST_APP_SECRET_PREVIOUS` | no | old secret accepted during rotation |
| `FLOWTEST_HOST` | no | loopback only (`127.0.0.1`, `::1`, `localhost`); default `127.0.0.1` |
| `FLOWTEST_PORT` | no | 1024-65535, default 8787 |
| `FLOWTEST_ALLOWED_CDN_HOSTS` | no | comma-separated host suffixes media may be downloaded from; **default: none, so every download is denied** |
| `FLOWTEST_ALLOW_LOOPBACK_CDN` | no | `1` only for local fixture CDNs |
| `FLOWTEST_MAX_BODY_BYTES`, `FLOWTEST_HANDLER_TIMEOUT_MS`, `FLOWTEST_MAX_CONCURRENT` | no | limits (defaults 1 MiB, 9000 ms, 32) |

It **fails closed**: it exits with code 2 and a short message if anything is missing or invalid, and also if production-style variables are present in the environment (`WA_ACCESS_TOKEN`, `WA_VERIFY_TOKEN`, `WA_PHONE_NUMBER_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_CONFIG`, `FIREBASE_SERVICE_ACCOUNT`, `CASHFREE_*`, `K_SERVICE`, `FUNCTION_TARGET`). Error messages name variables, never values.

### What it does not do
No database (pricing reads fall back to the repository's default rates), no orders, payments, print jobs or kiosk access, no outbound calls except media downloads from an explicitly allowed host. Logs contain only `event, method, path (known routes only), status, outcome, ms`: never bodies, headers, keys, secrets or tokens. No rate limiting, authentication beyond the signature check, TLS, or request logging for debugging: do not expose it.

### Protocol facts re-checked on 2026-10-10 (Meta pages, fetched through a page-summarising tool; re-confirm on the live pages)
- **Verified:** HTTP 421 when a request cannot be decrypted (endpoint guide and error-codes reference); **432 = "The request signature authentication fails"** (error-codes reference); response body is the encrypted payload as `text/plain`; the endpoint must use HTTPS with a valid certificate; the endpoint guide describes the IV as a **128-bit** initialization vector (16 bytes).
- **Not stated on those pages:** the request `Content-Type` (the sample uses `application/json`, so the adapter's 415 for other types is a local strictness choice, not a Meta rule), a required URL path (`/flow` is our choice; the path is whatever you configure as the endpoint URI), and the timeout figure (the 10 s figure comes from a different Meta page read earlier).
- **Still unverified:** that Meta's client accepts this Flow JSON and screen behaviour; the media metadata field names and Meta CDN host names; `X-Hub-Signature-256` handling on the live path; real latency and cold start.
- The handler still tolerates a 12-byte IV although the guide says 128-bit; that leniency is not a Meta requirement.

### Security boundary
A production WhatsApp access token appears to be hardcoded as a fallback in the existing tracked `functions/src/config/env.js`. This adapter never reads it, and nothing in this prototype copies or prints it. **A separate credential-rotation action is required before any external Meta integration**, and a Meta test deployment must use dedicated test credentials and a test WABA/number.

### Tests
`test/httpAdapter.test.js` (18 tests): fail-closed configuration (18 invalid cases plus every forbidden variable), loopback-only bind, health/readiness, routing and methods, content-type and size limits (declared and chunked), malformed signed/unsigned requests, encrypted ping/INIT round trip, the full five-screen journey over HTTP, default-deny downloads, log/error leak checks, 500/504/503 handling, source-level isolation checks, and the two CLIs.

## Protocol decisions and evidence
[DOC] = stated on Meta's developer pages read 2026-10-09 ("Implementing Endpoint for Flows", "Media Upload Components", "Webhooks", "Best practices"). [ASSUMED] = not confirmed by those pages; verify with a real Meta test WABA.

| Decision | Basis |
|---|---|
| AES key via RSA-OAEP, SHA-256 + MGF1-SHA-256, 128-bit key | [DOC]. Node `oaepHash:"sha256"` sets both digests. A test proves SHA-1 OAEP and 256-bit keys are rejected. |
| Payload AES-128-GCM, 16-byte tag appended | [DOC] |
| Response IV = request IV with all bits flipped; same key; empty AAD; tag appended; base64 plain text | [DOC]. Test decrypts with a separately written XOR and proves the un-flipped IV fails. |
| HTTP 421 on decryption failure | [DOC] |
| Signature = `sha256=HMAC-SHA256(app secret, raw body)`; accept old+new secret during rotation | [DOC] |
| Signature failure status 432 | [DOC] Error-codes reference lists 432 "The request signature authentication fails" (checked 2026-10-10; was [ASSUMED] on 2026-10-09). |
| IV 12 or 16 bytes | Endpoint guide says "128-bit initialization vector" (16 bytes) (checked 2026-10-10); the code still tolerates 12. |
| `ping` → `{data:{status:"active"}}`; client error notification → `{data:{acknowledged:true}}`; completion `screen:"SUCCESS"` with `extension_message_response.params.flow_token`; `error_message` in `data` for snackbar | [DOC] |
| Media steps: encrypted-hash check, HMAC over IV‖ciphertext (first 10 bytes appended), AES-256-CBC + PKCS7, plaintext-hash check | [DOC] |
| Media metadata field names `encrypted_hash, iv, encryption_key, hmac_key, plaintext_hash`, all base64; 32-byte key, 16-byte IV | **[ASSUMED]** page lists the concepts, no raw sample was retrieved. |
| Meta CDN host names for the allowlist | **[ASSUMED/unset]** the fetcher denies everything unless hosts are configured. |
| 30 files × 25 MiB per picker | [DOC] |
| The total-bytes (150 MiB) and 500-page caps | Prototype policy, not Meta numbers. |

## Results (actual)
**Tests:** `node --test test/*.test.js` → tests 23, pass 23, fail 0 (≈13 s). They cover: crypto round-trip, deterministic vector, 10 decryption-failure cases, signature cases, media integrity layers (hash, HMAC, plaintext hash, truncation, bad metadata, oversize), file-type sniffing, pipeline failure reporting (corrupt, truncated, wrong type, unreadable PDF, Office-needs-conversion, 404), limits, SSRF-style host rejection, temp-dir cleanup (also on unexpected throw), handler actions, exact colour message, duplicate/concurrent/retry behaviour, and a 500 that is not cached.

**Benchmark** (`bench/results-1791557468689.json`): Windows 11, Intel i5-13500H (16 threads), 17 GB, Node 24.21. Loopback fixtures, 2 warm-up iterations discarded, 15 samples per cell (7 for the heavy PDF). With 15 samples **p95 is effectively the maximum**; treat tails as indicative. Peak RSS 375 MB for the whole run (includes fixtures; limits were lifted for the 30 × heavy case). Times are the full handler call (request decrypt, pipeline, pricing lookup, response encrypt), in ms.

| Workload (c = concurrency) | files | p50 | p95 | max |
|---|---|---|---|---|
| PDF 3 pages | 1 / 10 / 30 | 12 / 88 / 280 | 17 / 427 / 604 | = p95 |
| PDF 50 pages | 1 / 10 / 30 | 32 / 279 / 718 | 144 / 764 / 1120 | = p95 |
| PDF 200 pages (c=1) | 1 / 10 / 30 | 95 / 932 / 2833 | 113 / 1027 / 4059 | = p95 |
| PNG ~0.5 MB | 1 / 10 / 30 | 10 / 87 / 150 | 41 / 999 / 4517 | = p95 |
| Heavy PDF 10.9 MB encrypted, 20 pages (c=1) | 1 / 10 / 30 | 100 / 948 / 13708 | 621 / 4379 / 15877 | = p95 |
| Mixed (all kinds), c=1 | 10 / 30 | 860 / 2711 | 3147 / 4447 | = p95 |
| Mixed, c=4 | 10 / 30 | 810 / 2717 | 2139 / 8262 | = p95 |

Full per-stage medians (fetch / decrypt / validate / page-count) for every cell, both concurrencies, are in the JSON. Zero failures in all cells.

**Local cold start** (7 fresh Node processes): module load p50 24 ms (max 27); first `ping` p50 2.9 ms; first 10-page upload p50 44 ms (max 68). This is process warm-up only; it excludes container start, network and Cloud Run. **Cloud cold start is not measured.**

## Decision against the Mission 3 rule (warm p95 < 3 s)
1. **Meets** the local target for: ≤10 files of ≤50 pages, images ≤0.5 MB, any single file shown (p95 ≤ 1.3 s, apart from one noisy 1.0 s PNG sample).
2. **Exceeds** it for: 30 × 200-page PDFs (p95 ≈ 4.1 s, still < 10 s), mixed 30 files (p95 4.4–8.3 s), and 30 heavy ~11 MB files (p50 9.5–13.7 s, p95 up to 23 s — over the 10 s hard limit, over the 150 MiB policy cap, and risky for a 512 MiB function).
3. **What dominates:** for page-heavy PDFs, `pdf-lib` page counting (parses the full file; CPU-bound, so concurrency 4 did not help). For large files, download + verify/decrypt, which grows with bytes. Concurrency 4 increased tail latency (up to 23 s) for large files: not a win on this hardware.
4. **Conclusion:** a synchronous endpoint is viable for typical small batches. It is **not** viable for the Flow's maximum batch (30 files / 25 MiB each). Before building asynchronous processing, apply cheap guards first: limit `max-uploaded-documents` and `max-file-size-kb` in the Flow JSON (for example 10 files and a smaller per-file size), keep the server-side total-bytes cap, and add a time-budget guard that returns a retryable error before 10 s. Only prototype an async design if deployed measurements show the realistic workload still breaks the budget.
5. **Local ≠ production.** Loopback fetch hides real network time to Meta's CDN, the Windows laptop is faster than a 512 MiB Cloud Functions instance, and cold start is untested.

## Pricing finding
`loadPricing(db)` / `sanitizeRates` are reusable as-is and fail open: a thrown settings read returns the repo defaults (tested: BW 2.8), so pricing cannot 500 a Flow. The order **total** is not reusable: copies × pages × rate, duplex rounding, N-up divisor, coupons and coins are inlined in `postCreateOrder` (`payment.controller.js` ≈ L80-241). **Missing interface: a pure `priceOrder({files/pages, printOptions, coupon, coins, rates})`.** The prototype therefore returns rates and `pricing_status:"MISSING_INTERFACE:priceOrder"`, never a price.

## Idempotency and retry (simulation only)
Verified in-process: three concurrent identical requests run once and return identical bodies; later retries replay; a handler-level exception returns 500, is not cached, and the retry then succeeds; a bad file yields a snackbar error on the same screen, never `REVIEW`/`SUCCESS`. **Not proven:** cross-instance guarantees, which need a Firestore lease/transaction and a deployed test. Also unknown: how Meta retries on timeout or 5xx.

## Known limitations
- Office documents (`.docx/.pptx/.xlsx`) are rejected with `NEEDS_CONVERSION`; the conversion pipeline (`converter/`, `converter.service.js`) was not exercised.
- Encrypted PDFs: production uses `ignoreEncryption:true`, copied here; page count for such files is unverified.
- No Storage upload step, no real Firestore, no real Meta CDN, no real Flow JSON, no screen definitions.
- `maxTotalBytes` and the 500-page cap are policy guesses.

## Needs a Meta test WABA or deployed infrastructure
Public-key upload and signature validation by Meta; real payload field names for media and `nfm_reply`; the 432 status and IV length; Meta CDN host names and download speed; timeout/retry behaviour of Meta's client; Flow JSON screen wiring (`refresh_on_back`, `If` for the colour message); cold start on a deployed Gen-2 function at 512 MiB (with and without `minInstances`); cross-instance idempotency; Firestore-backed sessions.

## Recommendation for the next mission
1. Create a test WABA/number and a draft Flow; deploy this handler as a separate, differently named function (needs your authorization) and measure real round trips, cold start and memory.
2. Settle the [ASSUMED] items from live payloads.
3. In parallel, the code-side prerequisites from Mission 3: secrets/signature (A), then the `priceOrder` extraction under the existing characterization tests (D).
