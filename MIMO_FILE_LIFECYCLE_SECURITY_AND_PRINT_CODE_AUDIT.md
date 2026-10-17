# MIMO — File Lifecycle, Security, and Print-Code Forensic Audit

**Date:** 2026-10-18
**Scope:** Complete customer document lifecycle — upload → payment → print-code → redemption → download → print → cleanup — across `functions/src/`, `firebase/*.rules`, `mimo-website/`, `mimo-website/mimo-admin-dashboard/`, and `pi_scripts/firebase_listener.py`.
**Method:** Read-only forensic review. Five parallel investigations (lifecycle/retention, unpaid uploads, print-code uniqueness, download failures, security/privacy), each citing file:line evidence, each running the existing isolated test suite (`cd functions && npm test`, consistently 513/513 passing across all five independent runs), with the print-code track additionally exercising real concurrency tests against a local Firestore emulator (no production access). No file was modified, no payment/refund/redemption was triggered against production, no production or live-Pi system was touched.
**Overall risk level: HIGH**, driven by one Critical and two High findings that are independently corroborated across three of the five investigation tracks, not single-source claims.

---

## 1. Executive Summary

The MIMO backend is, in most places, carefully engineered: payment confirmation, print-code issuance, and storage cleanup all use Firestore transactions correctly, with several defensive patterns (re-read-before-write, bounded retries, fail-closed webhook verification, idempotency keys) that show real incident-driven hardening — multiple code comments and commit messages reference specific production incidents that were found and fixed. The webhook signature verification, print-code transactional uniqueness, and paid-job storage preservation are all genuinely solid and were verified under real concurrent load, not just read as code.

However, two findings undermine much of that careful work at a lower layer:

1. **The customer-document Cloud Storage bucket is configured for fully public, unauthenticated read *and write* access** (`firebase/storage.rules`), because the app has no Firebase Auth bridge for its custom-JWT login scheme. This was found independently by three separate audit tracks (security/privacy, download-failures, unpaid-uploads), all citing the same root cause: the rules file's own code comment already admits this. Any customer's uploaded document is retrievable — and overwritable — by anyone who has or guesses its path, with no expiry, completely bypassing every backend auth/ownership check this audit otherwise found to be correctly implemented.

2. **The 24-hour automatic file-deletion mechanism may not actually be running in production.** The code is well-built and fully unit-tested, but it was merged with its own documentation stating "not deployed, not enabled in production," the CI pipeline does not auto-deploy these scheduled functions on a normal push to `main`, the orphan-upload sweep isn't in the CI deploy list at all, and even if deployed it defaults to a dry-run mode that never deletes anything. This is compounded by direct git history evidence that the *previous* cleanup mechanism silently found zero deletion candidates for over a month in production while 507 real candidates existed.

Combined, findings #1 and #2 mean the practical answer to "are customer files actually deleted after 24 hours, and can anyone else see them before then" is: **public access is confirmed; automatic deletion is unverified and plausibly not happening.**

Everything downstream of storage access — payment verification, print-code redemption, ownership checks on the application API — was found to be well-implemented. This is a storage-layer gap sitting underneath an otherwise reasonably strong application layer, not a systemic failure across the whole stack.

---

## 2. Architecture and End-to-End Lifecycle

```
Browser --(uploadBytesResumable, UNAUTHENTICATED)--> Firebase Storage /uploads/{name}/{ts}_{file}
                                                            |
                                                            | (no DB record yet -- file is a
                                                            |  pure orphan until finalized)
                                                            v
Browser --(POST /finalize-upload, authMiddleware)--> Cloud Functions
                                                            |  * re-verifies PDF page count server-side (pdf-lib)
                                                            |  * routes Office docs to Cloud Run converter
                                                            |  * rejects files that no longer exist in Storage
                                                            v
                                              Firestore print_jobs doc, status: "pending"
                                                            |
                               +----------------------------+---------------------------------------+
                               v                                                                      v
                 POST /create-order (authMiddleware)                                    DELETE /remove-file (cart abandon)
                 * re-checks ownership + status=="pending"                              * immediate deletion, bypasses 24h age rule
                 * generates server-side orderId (never client-supplied)
                 * free bypass (amount<Rs.1): printCode issued immediately
                 * else: Cashfree order created, payment_transactions
                   doc status:"INITIATED"
                               |
                               v
              Cashfree hosted checkout (customer pays or abandons)
                               |
            +------------------+----------------------+
            v                  v                       v
   Webhook: PAYMENT_SUCCESS   Webhook: USER_DROPPED/    Client polls GET /verify-payment
   (HMAC-verified, idempotent  PAYMENT_FAILED            (also calls postPaymentSuccess
    via webhook_events doc)   -> acknowledged, NO-OP      internally)
            |                  (job just stays "pending"
            v                   until 24h age sweep)
   postPaymentSuccess() -- single db.runTransaction:
   * re-verifies orders/payment_transactions status=="PAID" server-side
   * generateUniquePrintCode(db, tx) -- claims code atomically in the SAME transaction
   * flips job status -> "paid"
            |
            v
   print_jobs: status:"paid", printCode set -- files preserved INDEFINITELY while unprinted
   (explicit, documented business decision)
            |
            v
   Customer enters code at kiosk -> POST /kiosk/print (db.runTransaction)
   * queries ALL jobs with that code, filters status=="paid"
   * >1 match -> fails loudly (409), does NOT guess
   * flips status "paid" -> "printing" inside the same transaction (cross-kiosk-safe)
            |
            v
   Raspberry Pi (pi_scripts/firebase_listener.py) watches status=="printing" for its KIOSK_ID
   * downloads via Admin SDK (bypasses Storage Rules entirely -- not subject to the public-read issue)
   * sniff_kind() content-type detection + validate_pdf_strict() (%%EOF check, pdfinfo parse)
   * 3 retry attempts, bounded; cache validated-or-purged
   * prints via CUPS, reports completion
            |
       +----+-----+
       v          v
  SUCCESS      FAILURE
  status:       status:"failed" -> autoRefundJob trigger -> idempotent Cashfree refund claim
  "completed"        |
       |              v
       v         files fall to Policy B (24h-from-upload age rule -- NOT immediate)
  autoCleanupStorageJob trigger fires IMMEDIATELY
  -> deletes all customer Storage objects for this job, records fileDeletedAt
```

**Two independently-ticking 24-hour clocks exist in this system and should not be conflated:** the print-code claim validity window (`CODE_VALIDITY_MS`, starts at code-issue time) and the file-retention window (`RETENTION_MS`, starts at the Storage object's real `timeCreated`). They govern different things and start at different moments.

---

## 3. Verified 24-Hour Retention Behavior

### Retention table

| File/job state | Timer starts at | Expected deletion time | Actual deletion mechanism | Verified? |
|---|---|---|---|---|
| Upload never finalized (no job doc) | GCS object `timeCreated` | upload + 24h | `scheduledOrphanStorageCleanup` (hourly :20) | **Defaults to dry-run**, not in CI auto-deploy list -- effectively NOT deleting today |
| `pending` (uploaded, no checkout) | GCS `timeCreated` | upload + 24h, floored by 6h order-protection if applicable | `scheduledFileRetentionCleanup` (hourly) | Logic correct & tested; **production deployment status UNVERIFIED** |
| `pending`, payment initiated, abandoned | GCS `timeCreated` | upload + 24h, floor of order+6h | same | same |
| `failed` | GCS `timeCreated` (NOT failure time) | upload + 24h | same | same |
| `refunded`/`expired`/`abandoned`/`cleaned` | GCS `timeCreated` | upload + 24h | same | same |
| `removedByUser === true` | n/a -- immediate | immediate | `deleteRemoveFile`, synchronous in the live, auto-deployed API | **Verified deployed** (API deploys on every push) |
| `paid`, unprinted | n/a | **never** (explicit business decision) | none -- deliberately excluded | Implemented as documented; ~265 such jobs existed at fix-commit time |
| `printing`/`pending_conversion`/`processing` | n/a | never while in-state | none (preserved); `printing` separately times out via a 2-min sweep -> `failed` | Logic correct; this sweep is **also** a manual CI opt-in -- deployment UNVERIFIED |
| `completed`/`printed` | n/a -- immediate | immediately on status flip | `autoCleanupStorageJob` Firestore trigger (event-driven, not scheduled) | Logic correct; whether the Oct-13-rewritten version is live is UNVERIFIED |
| Pi-local temp print file | n/a -- immediate | immediately after each attempt | unconditional delete in a `finally` block | Implemented (runs on-device, not gated by the CI issue above) |
| Pi-local prefetch cache | file mtime | 30 min, or sooner under 150MB cap | background sweep every 5 min | Implemented (on-device) |
| Firestore job/order/payment records | n/a | **never** | none exists -- only annotated | Not implemented by design (permanent ledger) |

### Conclusion

**Is 24-hour deletion genuinely operational? Unverified, leaning no as of this audit's date.** The fix (commit `3fc3053e`, 2026-10-13) is well-built and fully unit-tested (140/140 on the dedicated retention suite), but:
- Its own committed documentation states: *"Status: implemented on branch `fix/storage-lifecycle-cleanup`, not deployed, not enabled in production."*
- `.github/workflows/deploy-functions.yml` deliberately does **not** deploy the scheduled trigger functions on a normal push to `main` -- it requires a manual `workflow_dispatch` with an explicit opt-in flag.
- `scheduledOrphanStorageCleanup` isn't in the CI trigger-deploy list at all.
- Even once deployed, the orphan sweep defaults to `ORPHAN_CLEANUP_MODE=dry-run`; this env var is absent from both `functions/.env` and `functions/.env.production` in the repo.
- Directly preceding this fix, commit `f6a3d1da` (2026-10-08) documents that the **prior** cleanup function ran hourly, error-free, for 30+ days while finding **zero** candidates, when an ad-hoc query against the same production data found **507** real candidates, some 31 days old. This is not a hypothetical risk -- it is a confirmed, recent, real-world failure of the equivalent mechanism.

**What the 24 hours actually means, where it applies:** time since the Cloud Storage object's real `timeCreated`, for everything except paid-unprinted (indefinite), actively-printing (indefinite until timeout/completion), completed (immediate, not 24h), and user-removed (immediate, not 24h).

**Which copies are covered:** Cloud Storage `uploads/`, `converted/`, `files/` objects only. Firestore records are never deleted. Pi-local copies follow two entirely separate, much shorter mechanisms unrelated to the cloud 24h policy.

**Where files may remain longer than expected:** any paid/printing/active-checkout job (by design); any job/orphan object while the scheduled functions are undeployed or running pre-fix code (current state unverified, plausible given the deployment gate); any orphan object while `ORPHAN_CLEANUP_MODE` isn't explicitly `delete`.

**Where files could disappear prematurely:** none found. Every cleanup path re-checks job status immediately before deleting and uses a cross-job reference index with recent-write top-ups specifically to close upload/payment races -- this is the most carefully engineered part of the system.

---

## 4. Unpaid-Upload and Abandoned-Payment Findings

### Scenario matrix

| Scenario | DB record | Storage object | Payment status | Print code | Cleanup behavior |
|---|---|---|---|---|---|
| Anonymous direct-to-Storage upload, never finalized | **none, ever** | present, publicly read/writable | n/a | n/a | Orphan sweep only, defaults to dry-run -- can persist indefinitely |
| `/finalize-upload` succeeds, checkout never started | `status:"pending"` | present | none | none | 24h age rule (if scheduler is actually live) |
| Re-upload before checking out a prior batch | prior job -> `status:"abandoned"` (ref preserved) | present | none | none | same 24h rule |
| Order created, abandoned before paying | `status:"pending"`, `orderId` set; `payment_transactions` stuck `"INITIATED"` forever | present | INITIATED, never PAID | none | 6h checkout-protection, then 24h rule counted from **original upload time** |
| Double-click/retried checkout for same files | **Two** merged jobs, two `orderId`s, two live Cashfree orders (confirmed race -- see Finding F-05) | present, shared ref | at most one reaches PAID | one code issued, for the paid one | duplicate unpaid job eventually age-cleaned |
| Cashfree reports `USER_DROPPED`/`PAYMENT_FAILED` | stays `"pending"` -- no explicit failed/abandoned transition | present | stays INITIATED | none | relies entirely on the 24h age rule; no payment-session expiry exists |
| Payment confirmed exactly during a cleanup sweep | stays `"paid"`, never wrongly flipped | may already be deleted in the unlucky sub-case | PAID | issued normally | `fileDeleted:true` + `status:"paid"` both recorded truthfully -- surfaces as a print-time failure, not silent loss |
| Job reaches `completed` | unchanged | deleted immediately | PAID | already used | immediate, trigger-confirmed |

### Key findings
- Server-side validation that actually matters for pricing (PDF page count) is never trusted from the client -- correctly re-verified with `pdf-lib`.
- Print-code issuance is correctly gated on a server-side-verified `PAID` status inside the same transaction that writes the code -- a client cannot fabricate payment success. Firestore rules additionally deny the client SDK any write access to `print_jobs` at all, making this check load-bearing rather than theatre.
- **No maximum file size is enforced anywhere** in the primary (website) upload path, and combined with the public-write storage rule, this means unlimited, free, anonymous storage consumption is possible today.
- **No rate limiting exists on any upload endpoint.**
- **`postCreateOrder` has a real, unfixed race condition**: unlike the already-hardened `postPaymentSuccess`, its ownership/status check is a plain read, not inside a transaction, with a Cashfree network round-trip in between -- a double-click or client retry can create two live orders for the same files.
- No explicit timeout/expiry exists for an abandoned payment session (`payment_transactions` stuck at `"INITIATED"`) -- it is never purged or flagged, only indirectly swept via the unrelated 24h storage-age rule.
- A dead security control was found: `/payment-success` is sent an `internalSecret` by its two legitimate internal callers, but the endpoint itself never reads or checks that field -- not currently exploitable (the real gate is independent), but it is misleading dead code.

**Needs business decision (not invented here):** should a paid-but-never-printed job ever expire? Should abandoned `payment_transactions` records ever be purged? The repo explicitly defers both with no proposed numbers.

---

## 5. Print-Code Generation and Uniqueness Findings

**This track is the one most thoroughly verified by actual execution, not just reading**: 11 custom tests were run against a real local Firestore emulator (not production), in addition to the existing 513-test suite.

| # | Test | Result |
|---|---|---|
| 1 | 1,000 `generateUniquePrintCode` calls, 25-way concurrent batches | **PASS** -- 0 duplicates |
| 2 | 50 fully concurrent (`Promise.all`) calls | **PASS** -- 0 duplicates |
| 3 | Forced identical first-choice candidate between 2 concurrent callers | **PASS** -- distinct codes assigned |
| 4 | Pre-saturated candidate pool (retry-bound check) | **PASS** -- threw cleanly after 25 attempts, 136ms (no infinite loop) |
| 5 | Expired (24h+) claim reclaimed | **PASS** |
| 6 | 2 concurrent `postPaymentSuccess` calls, same order (duplicate-webhook simulation) | **PASS** -- identical code returned both times, no double-issue |
| 7 | 2 concurrent `postPaymentSuccess` calls, different orders | **PASS** -- distinct codes |
| 8 | Two kiosks (CV-001, SV-002) redeeming the same code simultaneously | **PASS** -- exactly one winner, the other gets a clean 409 |
| 9 | Repeated redemption after the first winner already flipped status | **PASS** -- rejected |
| 10 | Unpaid (`pending`) job redemption attempt | **PASS** -- rejected |
| 11 | Refunded job redemption attempt | **PASS** -- rejected |

### Findings
- **Code format:** 4 digits, 1000-9999, keyspace of 9,000.
- **RNG is `Math.random()`, not cryptographically secure.** Uniqueness is unaffected (it's enforced at the database layer independent of RNG quality), but unpredictability relies entirely on rate limiting, not the code itself.
- **Uniqueness is enforced by the database layer**, not an application-level check-then-assign: the code value is used as the Firestore document ID for `print_code_claims/{code}`, combined with `db.runTransaction` -- this is the closest equivalent Firestore has to a unique constraint, and it directly replaced an older pattern that caused a real, documented 2026-10-16 production incident (a customer's own paid code served a different customer's job).
- **Redemption is atomic and cross-kiosk-safe** for the actual print-trigger endpoint (`POST /kiosk/print`), verified under real concurrent load.
- **Gap 1 (confirmed by code reading):** the WhatsApp payment path (`whatsapp.controller.js:getWaPaySuccess`) generates and assigns a print code **outside** any transaction, unlike the otherwise-identical, already-fixed website path -- a plausible duplicate-issuance/stale-notification bug. Not load-tested due to time budget; flagged honestly as static-analysis-only.
- **Gap 2:** the document-*preview* endpoint (`postGetDocumentsByCode`, shown before a print actually triggers) lacks the "more than one match -> fail loudly" guard that the actual print-trigger endpoint already has since the Oct-16 fix. Lower risk today since the upstream collision is now prevented, but a real inconsistency.

### Uniqueness vs. unpredictability vs. one-time-use
- **Uniqueness** (no two simultaneously-active jobs share a code): enforced, verified under load.
- **Unpredictability** (can't guess the next code): weak by design of the code itself (9,000 keyspace, non-CSPRNG), compensated operationally by a 5/min, 20/hr per-IP rate limit on guess attempts.
- **One-time-use**: enforced at the point that actually triggers printing (verified under load); not uniformly enforced at the earlier preview endpoint (Gap 2 above).

---

## 6. Download-Failure Matrix (Scenarios A-Q)

| # | Scenario | Status | Evidence |
|---|---|---|---|
| A | Upload succeeds, DB write fails | Partial | Orphan object results; swept (if sweep is live) after 24h; never surfaced to the user as a recoverable job |
| B | DB record exists, storage object missing | Implemented | `findMissingUploadedFile` pre-flight check at finalize-time; reactively fails-closed + auto-refunds if discovered later at print-time |
| C | Upload succeeds, client retries after timeout | Partial | Duplicate *objects* are structurally likely (no content-hash/idempotency-key dedup on the Storage path); duplicate *billed jobs* are guarded (stale-pending superseding) |
| D | Signed URL expires before download | N/A | No signed URLs exist in this system at all -- see Section 7 |
| E | Signed URL expires mid-download | N/A | Same -- no expiry mechanism exists, which is itself the finding |
| F | File deleted after URL created, before retrieval | Implemented | Best-defended scenario in the codebase -- transactional re-read immediately before every delete, closes the TOCTOU window |
| G | Two customers, identical filenames | Partial | Storage path keyed by sanitized *display name* (not user ID) + millisecond timestamp -- two same-named accounts can collide; no versioning/generation-match guard on writes |
| H | Cross-customer document access (IDOR) | **Confirmed bug** at storage layer | Application API never returns raw URLs and is correctly ownership-scoped; but the object itself is directly fetchable by anyone with/guessing its path, bypassing all of that |
| I | Request-parameter tampering (IDs/paths/codes) | Implemented (where it matters) | Strict path validation on the delete/cleanup path; ownership-scoped queries prevent cross-user deletion via `/remove-file` |
| J | Large/corrupted file fails transfer/conversion | Implemented, in depth | Multi-layer: backend PDF re-parse, Pi-side magic-byte sniffing, `%%EOF` truncation check, Ghostscript merge page-count cross-check |
| K | Pi loses connectivity / restarts mid-retrieval | Implemented, multi-layered | 3-attempt bounded retry; separate validation-triggered re-download; exactly-once auto-resume on reconnect with a persisted marker; stale-CUPS-job cancellation on recovery. Verified: 4/4 `test_download_retry.py` passed |
| L | Print starts while cleanup tries to delete | Implemented | Same mechanism as F, plus an explicit 30-minute post-print grace period |
| M | Partial download, retried | Implemented (full re-download, not byte-resume) | Detected reliably via content validation; recovered via fresh download, not HTTP Range resume -- correct but not bandwidth-efficient |
| N | Payment succeeds, document unretrievable | Implemented | Paid-unprinted jobs are storage-preserved indefinitely by construction; financial backstop (idempotent refund claim) exists if retrieval genuinely fails at the kiosk |
| O | Object exists, app reports "not found" | Partial | A specific historical bucket-naming-spelling mismatch bug was found and explicitly fixed on the backend; the Pi's own URL-parsing logic doesn't have the equivalent fix (soft-fails to a slower path, not a hard failure) |
| P | Endpoint returns HTML/JSON where a document was expected | Implemented on the Pi; weak on admin dashboard | Content-sniffing on the Pi directly prevents garbage from reaching the printer; the admin dashboard's proof-image viewer silently hides a failed load with no operator feedback |
| Q | Stale/incorrect cached content served | Implemented | The Pi always re-validates a cache hit with the same strict check as a fresh download before trusting it; invalid entries are purged and re-fetched |

**Test note, reported honestly rather than claimed:** an attempt to re-run `functions/__tests__/storage*.test.js` and `upload*.test.js` in this sandbox produced 66/78 passing with 12 failures that look like a test-mock interception issue (an `axios` stub not engaging) rather than a real application regression -- explicitly flagged as inconclusive and in need of a clean re-run, not reported as a confirmed bug.

---

## 7. Security and Privacy Findings

### Route-level authorization coverage
Every admin, technical, HR, marketing, upload, payment, and document-scanner route was read in full. **No authorization gaps were found** in the application API layer -- every sensitive route is behind the correct middleware, deactivated staff accounts are rejected immediately (not just at next login), and the Cashfree webhook is protected by constant-time HMAC signature verification that fails closed if misconfigured.

### IDOR checks
Every ownership-sensitive handler reviewed (mark-printed, create-order, verify-payment, request-refund, remove-file, scanner sessions) correctly scopes its Firestore query or write to the authenticated caller's own `userId`. **No cross-user IDOR was found in the authenticated API surface.**

### The storage-layer bypass (see Sections 4, 6, and Finding F-01 below)
Everything above is undermined by the Storage Rules gap: since the app has no Firebase Auth bridge, every one of these correctly-scoped application checks can be bypassed entirely by reading or writing the Storage object directly.

### Other confirmed findings
- **Plaintext password logged on failed admin login** (`admin.controller.js:57`) -- every failed login attempt writes the raw submitted password to Cloud Logging. Independent of the actual (correctly timing-safe) password comparison used for the real check.
- **`/kiosk/report-clean` is missing a fail-closed guard** that its sibling `/report-failure` (which triggers real refunds) already has -- if `INTERNAL_WEBHOOK_SECRET` is ever unset, this endpoint's auth check silently passes.
- **No rate limiting** on: `/kiosk/report-failure` (triggers real Cashfree refunds), `/technical/login`, `/hr/login`, `/marketing/login`, `/google-login`, `/finalize-upload`, `/create-order`, `/payment-success`, `/request-refund`, `/generate-text-pdf`, `/create-blank-job`.
- **Generic upload path has no malware/AV scanning and accepts any unrecognized file type** with only a 256-byte minimum floor -- no allowlist, unlike the document-scanner's correctly-implemented MIME allowlist + size cap, which shows the team knows the right pattern but didn't apply it everywhere.
- Minor PII-in-logs: customer email addresses and converted-file URLs appear in debug logs (low severity; the URLs don't add new exposure beyond the already-public bucket).
- `JWT_SECRET`, `CASHFREE_SECRET_KEY`, `WA_APP_SECRET`, and the Pi SSH credentials (fixed earlier, out of this audit's scope) were all checked -- no additional hardcoded secrets found. `WA_VERIFY_TOKEN` has a hardcoded non-secret fallback, already flagged in-code by the team as low-risk (one-time handshake only).

---

## 8. Reproduction Steps and Test Results

All test execution in this audit was performed against local/isolated test doubles or a local Firestore emulator -- **never against production Firebase, production payment gateways, or the live Pi kiosks.**

| Suite | Command | Result |
|---|---|---|
| Full backend unit suite (run independently by all 5 tracks) | `cd functions && npm test` | **513/513 passing**, consistently, across all 5 independent runs |
| Pi download-retry tests | `cd pi_scripts && python3 -I -m pytest tests/test_download_retry.py -v` | **4/4 passing** |
| Print-code concurrency (custom, emulator-backed) | throwaway script against `firebase emulators:exec ... --only firestore`, discarded after run | **11/11 passing** (see Section 5 table) |
| Storage/upload regression re-run | `npx mocha __tests__/storage*.test.js __tests__/upload*.test.js` | 66/78 passing; 12 failures attributed to a test-mock issue in this sandbox, not claimed as a confirmed app bug -- **flagged for clean re-run, not resolved here** |

No destructive test was run against shared state. No real payment, refund, or print-code redemption was triggered.

---

## 9. Findings by Severity

| ID | Severity | Finding | Status |
|---|---|---|---|
| F-01 | **Critical** | `firebase/storage.rules` grants unauthenticated public read+write on `/uploads`, `/profiles`, `/screensaver`, `/templates` | Confirmed Bug (independently found by 3 of 5 tracks) |
| F-02 | **Critical** | 24-hour automatic file deletion may not be running in production; orphan-upload sweep defaults to dry-run with no override found | Unverified, documented as not-deployed by the code's own commit, historical precedent of 30+ day silent failure |
| F-03 | High | No signed URLs anywhere -- document access never expires once path is known | Not Implemented |
| F-04 | High | Direct-to-Storage uploads bypass all backend validation, size limits, and rate limiting | Confirmed (architectural) |
| F-05 | High | `postCreateOrder` race condition -- concurrent/retried checkout can create duplicate orders/jobs for the same files | Confirmed Bug (static analysis) |
| F-06 | High | `/kiosk/report-failure` (triggers real Cashfree refunds) has no rate limiting | Not Implemented |
| F-07 | Medium-High | Plaintext password logged on failed admin login (`admin.controller.js:57`) | Confirmed Bug |
| F-08 | Medium | Generic upload path accepts any file type/size, no AV/malware scanning | Partially Implemented |
| F-09 | Medium | No rate limiting on `/technical`, `/hr`, `/marketing`, `/google-login` | Not Implemented |
| F-10 | Medium | No rate limiting on `/finalize-upload`, `/create-order`, `/payment-success`, `/request-refund`, `/generate-text-pdf`, `/create-blank-job` | Not Implemented |
| F-11 | Medium | WhatsApp print-code issuance (`getWaPaySuccess`) not wrapped in a transaction, unlike the equivalent website path | Confirmed Bug (static analysis, not load-tested) |
| F-12 | Medium | Document-preview endpoint missing the collision guard its sibling print-trigger endpoint has | Partially Implemented |
| F-13 | Medium | No explicit payment-session expiry -- failed/dropped payments rely solely on the unrelated 24h storage-age rule | Not Implemented |
| F-14 | Medium | Print codes use `Math.random()`, not a cryptographically secure RNG | Not Implemented |
| F-15 | Low-Medium | `/kiosk/report-clean` missing the fail-closed env-var guard its sibling has | Confirmed Bug (config-dependent) |
| F-16 | Low | Dead `internalSecret` check on `/payment-success` -- sent by callers, never validated | Partially Implemented |
| F-17 | Low | Customer email and file URLs appear in debug logs | Confirmed (minor) |
| F-18 | Low | Storage path collisions keyed by display name, not user ID | Partially Implemented |
| F-19 | Informational | CORS `origin: true` (fully reflective) | Standard for bearer-token APIs |
| F-20 | Informational | `WA_VERIFY_TOKEN` hardcoded non-secret fallback | Pre-existing, already flagged in-code |

**Strong areas, explicitly confirmed, not just "no findings":** route-level authorization coverage, IDOR protection on every ownership-sensitive endpoint, webhook signature verification, print-code transactional uniqueness under real concurrent load, cleanup-vs-active-job race protection, paid-job file preservation guarantee.

---

## 10. Evidence Index

Full file:line citations for every finding above are preserved in the five source investigation reports (lifecycle/retention, unpaid uploads, print-code uniqueness, download failures, security/privacy) that fed this document. Key files, for convenience:

- `firebase/storage.rules`, `firebase/firestore.rules`
- `functions/src/middleware/auth.js`, `functions/src/middleware/rateLimit.js`
- `functions/src/controllers/admin.controller.js`, `upload.controller.js`, `print.controller.js`, `payment.controller.js`, `user.controller.js`
- `functions/src/routes/admin.routes.js`, `technical.routes.js`, `hr.routes.js`, `marketing.routes.js`, `upload.routes.js`, `payment.routes.js`, `print.routes.js`, `kiosk.routes.js`
- `functions/src/services/storage.service.js`, `storageCleanup.service.js`, `printCode.service.js`, `pricing.service.js`
- `functions/src/triggers/printJob.triggers.js`, `retention.trigger.js`, `orphanStorage.trigger.js`, `printTimeout.trigger.js`
- `functions/src/controllers/whatsapp.controller.js`
- `.github/workflows/deploy-functions.yml`
- `docs/deployment/STORAGE_CLEANUP.md`, `docs/deployment/CI_CD.md`
- `pi_scripts/firebase_listener.py`
- `mimo-website/src/app/pages/upload-file.tsx`
- `mimo-website/mimo-admin-dashboard/src/components/shared/ProofImageModal.tsx`

---

## 11. Remediation Recommendations, Ordered by Risk

1. **(F-01) Close the public storage bucket.** Either build the Firebase-Auth custom-token bridge referenced in the rules file's own comment and scope `/uploads/**`/`/profiles/**` by `request.auth.uid`, or -- faster -- stop serving documents from a public bucket entirely: move to backend-issued, short-lived signed URLs for reads, and require signed/presigned writes with a TTL. Removing `allow write: if true` is the single highest-priority change.
2. **(F-02) Verify and fix the retention-cleanup deployment status.** Run `firebase functions:list` (or equivalent) against the live project to confirm whether `scheduledFileRetentionCleanup`, `scheduledOrphanStorageCleanup`, and the rewritten `autoCleanupStorageJob` are actually deployed. If not, deploy them via the documented manual opt-in. Only after confirming the job-linked sweep is safely live should `ORPHAN_CLEANUP_MODE=delete` be set for the orphan sweep.
3. **(F-07) Remove the plaintext password from the admin-login failure log**, and rotate `ADMIN_PASSWORD`/`FINANCE_PASSWORD` as a precaution.
4. **(F-05) Wrap `postCreateOrder`'s ownership/status check and Firestore batch in a transaction**, mirroring the existing fix already applied to `postPaymentSuccess`.
5. **(F-06, F-09, F-10) Add rate limiting** to the refund-triggering kiosk endpoint, the four unrated login endpoints, and the unrated upload/payment endpoints -- the pattern already exists in `rateLimit.js`, it just needs to be applied more broadly.
6. **(F-11, F-12) Close the two print-code consistency gaps**: wrap `getWaPaySuccess`'s code issuance in a transaction like its website equivalent; port the "fail loudly on >1 match" guard into the document-preview endpoint.
7. **(F-08) Apply the document-scanner's MIME-allowlist + size-cap pattern** to the generic upload path, and add at least a basic malware/heuristic scan before files reach the converter or print pipeline.
8. **(F-04) Add a maximum file size check** to the finalize-upload path.
9. **(F-13) Add an explicit transition on payment-gateway failure/drop events** (`USER_DROPPED`/`PAYMENT_FAILED` -> an explicit failed/expired state) instead of a silent no-op, so abandoned jobs can be cleaned up without waiting out the full 24h window.
10. **(F-14) Move print-code generation to a cryptographically secure RNG** (`crypto.randomInt`), even though current unpredictability is adequately rate-limited -- defense in depth.
11. **(F-15, F-16) Fix the two smaller consistency gaps**: add the missing fail-closed guard to `/kiosk/report-clean`; either enforce or remove the dead `internalSecret` check on `/payment-success`.

---

## 12. Unverified Assumptions and Missing Access

This audit was conducted entirely from source code, git history, and local test execution -- **no access to the live Firebase console, Cloud Scheduler, or production Firestore/Storage was used or available**, per the audit's own strict read-only rules. The following cannot be resolved without that access:

- Whether `scheduledFileRetentionCleanup`, `scheduledOrphanStorageCleanup`, and the current `autoCleanupStorageJob` are actually deployed and running in production (central to F-02).
- Whether `ORPHAN_CLEANUP_MODE` has been set to `delete` via Cloud Scheduler/Secret Manager configuration outside the two `.env` files checked in this repo.
- Whether Firestore's `request.auth` is ever actually populated for this app's custom-JWT auth model. If it is never populated (the same root cause as the Storage Rules issue), the Firestore-level ownership rules cited as a defense in Section 4 may be similarly ineffective -- this needs the auth-bridge implementation traced, which was out of scope for this pass.
- Whether a non-Office file renamed with an Office extension is safely rejected by the external Cloud Run converter service (not reviewed in this audit).
- Root cause of the 12 failing tests in `storage*.test.js`/`upload*.test.js` under this sandbox -- test-infrastructure issue vs. real regression, undetermined.
- Whether any operational alert exists for the documented edge case where a job is `status:"paid"` with `fileDeleted:true` simultaneously (a paid customer whose file was deleted in an unlucky cleanup race) -- no such alerting code was found, but this doesn't rule out an external monitoring rule outside the repo.

---

## 13. Production-Readiness Checklist (for MIMO 3.0)

- [ ] **F-01 resolved**: Storage bucket is no longer publicly read/writable (auth bridge built, or signed URLs in place)
- [ ] **F-02 resolved**: Retention-cleanup deployment status confirmed live via `firebase functions:list`; orphan sweep confirmed actually deleting, not just logging
- [ ] **F-07 resolved**: No credential material appears in any log statement
- [ ] **F-05 resolved**: Checkout race condition closed
- [ ] Rate limiting applied to all payment-, refund-, and login-adjacent endpoints (F-06, F-09, F-10)
- [ ] Print-code transactional consistency applied uniformly across website and WhatsApp paths (F-11, F-12)
- [ ] Upload path has a maximum file size and a real MIME/type allowlist, matching the document-scanner's existing pattern (F-04, F-08)
- [ ] Explicit failed/expired transition exists for abandoned payment sessions (F-13)
- [ ] Business decisions made and documented (not left as open code comments) for: paid-but-never-printed job expiry, and abandoned `payment_transactions` record retention
- [ ] A clean re-run of `storage*.test.js`/`upload*.test.js` confirms 78/78, with the sandbox mocking issue root-caused

---

## Direct Answers

**1. Are files actually deleted after 24 hours?**
Unverified, and the available evidence leans toward **no, not currently** -- the deletion code is well-built and tested, but it ships with its own documentation saying it isn't deployed, the CI pipeline requires a manual opt-in step that nothing in the repo confirms happened, the orphan sweep defaults to logging-only, and the mechanism it replaced is documented to have silently failed in production for over a month immediately before this fix. This needs to be confirmed directly against the live Firebase project, which this audit could not access.

**2. What happens to an uploaded file if payment never happens?**
It sits in Cloud Storage -- publicly readable **and writable** by anyone, with no account or auth required, regardless of payment status. If `/finalize-upload` is never called, no database record of it exists at all. If it is finalized but never paid for, a `pending` job is created and the file is (intended to be, pending confirmation of F-02) deleted 24 hours after upload, or 6 hours after order creation if checkout was started and abandoned, whichever is longer.

**3. Is each print code guaranteed to be unique and safely redeemable?**
Uniqueness: yes, verified under real concurrent load via a database-enforced claim, not an application-level check. Safe redemption: yes for the primary website-and-kiosk path (atomic, cross-kiosk-safe, status-gated, all verified under load) -- but not uniformly: the WhatsApp payment path lacks the same transactional protection, and the document-preview step lacks a collision guard its sibling endpoint already has.

**4. Can users lose paid documents or access other users' files?**
The application logic itself will not lose a paid document -- paid-unprinted jobs are preserved indefinitely, cleanup races are handled safely, and a refund backstop exists if a print genuinely fails. But **any user's document, paid or not, is directly retrievable (and overwritable) by anyone who obtains or guesses its Storage path**, completely independent of the application's otherwise-correct ownership checks, because of the public storage rules (F-01). This is the single most important "yes" in this audit.

**5. What are the highest-risk fixes required before MIMO 3.0 production?**
In order: (1) close the public storage bucket, (2) confirm and fix the retention-cleanup deployment, (3) remove the plaintext password from logs, (4) fix the checkout race condition, (5) add rate limiting to the payment/refund/login surface, (6) close the two print-code transactional-consistency gaps, (7) harden the generic upload path's file-type and size validation.
