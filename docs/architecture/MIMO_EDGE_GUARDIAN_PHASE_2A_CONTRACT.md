# MIMO Edge Guardian — Phase 2A Contract (Proposed)

**Status: PROPOSED DESIGN. Nothing in this document is implemented.** No backend route, publisher,
Secret Manager binding, or Firestore document described here exists yet. Every claim about *existing*
code is cited against a real file in this repository and was checked by reading that file (or, for the
signing vectors, by running the real Phase 1 code); every claim about *new* Phase 2A behavior is marked
**PROPOSED**. Anything not verified in this session is marked **UNVERIFIED**.

This document does not change `pi-guardian/` source, does not add a backend route, and was not
staged, committed or pushed.

---

## 0. Scope and hard boundaries (unchanged from `CLAUDE.md`)

- Guardian stays observe-only. Phase 2A adds *reporting* (one HTTP POST per cycle), nothing else.
- Guardian must **never** write to `system_status`, `kiosk_commands`, or `print_jobs`.
- Guardian silence must **never** change the existing kiosk online/offline state (that state is computed
  today from `system_status.lastSeen`, read in `functions/src/controllers/publicMachines.controller.js:48`
  — Phase 2A does not touch that field or that computation).
- Printing must keep working if Guardian, its publisher, or its backend route is down, slow, or removed.
- The Phase 1 snapshot schema (`schemaVersion: 1`) is **frozen** by this design. Phase 2A transports it
  unmodified; it does not add, rename, or reinterpret any field.
- No Firebase Admin credentials, service-account keys, or the master secret ever reach the Pi.
- Nothing in this task created, read, or touched a production secret.

---

## 1. Frozen Phase 1 snapshot contract (existing, verified against source)

Source: `pi-guardian/guardian/snapshot.py`, `model.py`, `config.py`, `classifier.py`, `scheduler.py`.

### 1.1 Top-level shape
A JSON object with **exactly** these keys (`snapshot.py:26`, enforced by `validate_snapshot`):

```
schemaVersion   int, must equal 1 (guardian/__init__.py:8, SCHEMA_VERSION)
agentVersion    str, matches ^[0-9A-Za-z.+-]{1,32}$ (currently "0.1.0-phase1", guardian/__init__.py:7)
kioskId         str, matches ^[A-Z]{2}-\d{3}$ (same shape as functions/'s KIOSK_ID_PATTERN — config.py:13)
seq             non-negative int; monotonically incremented in memory by the Scheduler, starts at 1 (scheduler.py:55)
observedAt      str, ^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$ (UTC, second precision, iso_utc() in model.py:85)
cycle           object: { durationMs:int, budgetMs:int, budgetExceeded:bool, detailsDropped:bool }
checks          array, at most 32 entries (snapshot.py:17, MAX_CHECKS)
diagnosis       object: { overall, rootCauses[], cascades[], unknown[] }
```

### 1.2 Each `checks[]` entry
Exactly the keys `id, plane, required, state, observedAt, durationMs, evidence, detail, streak`
(`CHECK_KEYS`, `snapshot.py:28`). `id` is either a fixed id (`link, ipv4, route, gateway, dns,
listener_unit, cups_scheduler, tailscale, disk, memory, temperature`) or a dynamic
`endpoint.<name>` / `tls.<name>` (`model.py:40`, name is 1–24 lowercase alnum/underscore chars).
`state` ∈ `{PASS, FAIL, UNKNOWN, NOT_RUN, STALE}`. `evidence` is at most 8 machine codes matching
`^[A-Z][A-Z0-9_]{1,47}$`. `detail` is sanitized free text, ≤120 chars, with IPs/MACs/IPv6/secrets/
base64-looking blobs already stripped by `sanitize_text()` (`model.py:72`).

### 1.3 Diagnosis block
`overall` ∈ `{HEALTHY, DEGRADED, FAILING, UNKNOWN}`. `rootCauses[]` entries carry
`{code, plane, severity, checks[], evidence[]}`, `severity` ∈ `{CRITICAL, MANAGEMENT, WARNING}`.
Diagnosis codes actually implemented (`classifier.py`): `LINK_DOWN, NO_IPV4, INVALID_ROUTE,
GATEWAY_UNREACHABLE, DNS_FAILURE, INTERNET_UNREACHABLE, ENDPOINT_UNREACHABLE, HTTPS_FAILURE,
LISTENER_FAILURE, CUPS_FAILURE, TAILSCALE_FAILURE, DISK_LOW, MEMORY_LOW, TEMPERATURE_HIGH`.
**Discrepancy note:** the v0.1 architecture doc's sketch (`GATEWAY_ARP_FAILED`, `FIREBASE_FAILURE`)
does not match the implementation — there is no Firebase check in Phase 1 at all, and gateway ARP
failure is folded into `GATEWAY_UNREACHABLE`. This document uses the real code list above.

### 1.4 Size and validation
- Target 4096 bytes (`TARGET_BYTES`); if the canonical encoding (`json.dumps(..., separators=(",",
  ":"), sort_keys=True)`, `snapshot.py:36`) exceeds it, every check's `detail` is cleared and
  `cycle.detailsDropped` is set `true` (`build_snapshot`, `snapshot.py:64`).
- Hard limit 8192 bytes (`MAX_SNAPSHOT_BYTES`); `validate_snapshot` rejects anything over this or with
  any of the leak-scan patterns (bare IPv4/MAC) anywhere in the encoded object (`snapshot.py:157`,
  `_LEAK_RES`).
- `encode_snapshot()` re-validates before returning a string; `build_snapshot()` raises `SnapshotError`
  on any validation failure — the *scheduler* catches that and falls back to an all-`NOT_RUN`,
  `UNKNOWN`-overall snapshot rather than ever emitting something invalid (`scheduler.py:66`).

### 1.5 Sequence-number behavior (existing, in-process only)
`Scheduler._seq` starts at 0 and is incremented at the start of every `_cycle()` **before** any
observation is taken, so the first snapshot of a process has `seq == 1` and `seq` is strictly increasing
by exactly 1 per cycle for the life of that process (`scheduler.py:31,55`). **It is not persisted.** A
process restart resets `seq` to 1. This is the single most important fact for Phase 2A's replay design
(§5): Phase 1 gives the backend no way to tell "`seq` reset because the Pi rebooted" from "`seq` reset
because someone is replaying an old stream" — that distinction has to come from a new field (`streamId`
/ `bootId`, §5), which does not exist in the frozen schema and is **not** added to it; it travels
alongside the snapshot in the transport envelope instead (§6).

### 1.6 Scheduler/callback behavior
One cycle at a time, enforced by a non-blocking lock (`CycleOverlapError` if a cycle is already running,
`scheduler.py:21,45`). `run_forever()` sleeps on a `threading.Event` between cycles — no busy loop, no
catch-up cycles after an overrun (`scheduler.py:74`). `on_snapshot` callback errors are swallowed so a
broken sink can never stop observation (`scheduler.py:86`). **Phase 2A's publisher is exactly an
`on_snapshot` callback** (§6) — it inherits this guarantee for free: if the HTTP POST hangs or throws,
observation continues untouched, and printing was never on this call path to begin with.

### 1.7 Command allowlist and static safety (existing, unchanged by this design)
Only `ip -j {link,addr,route,neigh} show ...`, `systemctl show -p ...`, `lpstat -r`,
`tailscale status --json`, `getent ahostsv4 <host>` may run, never through a shell
(`runner.py:40`, `is_read_only()`), verified by `tests/test_static_safety.py`. Phase 2A adds no new
command and does not touch `runner.py`.

---

## 2. Canonical request signing format and exact byte encoding (PROPOSED)

### 2.1 Design goals
- Deterministic across Python (Pi) and Node (backend) with zero ambiguity about byte content.
- No reliance on HTTP header canonicalization, floating-point formatting, or locale.
- Reuses the exact snapshot encoding Phase 1 already produces (`encode_snapshot()`), so the signed
  body is **the literal bytes the Pi already has in hand** — no re-serialization step that could drift
  from what was validated.

### 2.2 Canonical signing string
ASCII bytes, fields joined by a single `\n` (0x0A), **in this exact order**:

```
METHOD "\n" PATH "\n" KIOSK_ID "\n" STREAM_ID "\n" BOOT_ID "\n" SEQ "\n" TIMESTAMP "\n" BODY_SHA256_HEX
```

| Field | Encoding | Source |
|---|---|---|
| `METHOD` | literal `POST` (ASCII) | fixed |
| `PATH` | literal `/kiosk/guardian/health` (ASCII, no query string) | fixed |
| `KIOSK_ID` | the snapshot's `kioskId`, ASCII, as the `^[A-Z]{2}-\d{3}$` regex already constrains it | existing field |
| `STREAM_ID` | 32 lowercase hex characters (16 random bytes, generated once per process start) — see §5.1 | **new**, PROPOSED |
| `BOOT_ID` | 32 lowercase hex characters: the Pi's kernel boot UUID (`/proc/sys/kernel/random/boot_id`, dashes stripped, lowercased), or a fresh random 32-hex value if that file is unreadable — see §5.1. **Corrected in Phase 2D**: earlier drafts of this document and Phase 2C's first implementation described/used a decimal integer counter instead; a kernel boot UUID needs no local persistence at all (the kernel generates a fresh one every boot) and is what is actually implemented. | **new**, IMPLEMENTED (Phase 2D) |
| `SEQ` | decimal ASCII digits, exactly the snapshot's own `seq` field — no separate counter | existing field |
| `TIMESTAMP` | decimal ASCII digits, Unix seconds (UTC) at send time, independent of `observedAt` | **new**, PROPOSED |
| `BODY_SHA256_HEX` | lowercase hex SHA-256 digest of the exact HTTP request body bytes | computed |

The whole canonical string is then UTF-8 (= ASCII here, every field is already ASCII-constrained)
encoded to bytes and HMAC-SHA256'd with the kiosk's derived key (§3). The result is lowercase hex and
travels in the `X-Guardian-Signature` header.

**Why hash the body instead of inlining it in the canonical string:** the body can be up to 8192 bytes
(§1.4); hashing keeps the canonical string small and fixed-shape regardless of payload size, and ties
the signature to the *exact* bytes sent (not a re-parsed/re-serialized copy a naive Node implementation
might accidentally produce differently — e.g. different key order).

### 2.3 Request headers (PROPOSED)
```
Content-Type:          application/json
X-Guardian-Kiosk-Id:   AB-123
X-Guardian-Stream-Id:  0b7e6b8e9c1a4e3a8f0a1c2d3e4f5061
X-Guardian-Boot-Id:    550e8400e29b41d4a716446655440000
X-Guardian-Timestamp:  1800000000
X-Guardian-Signature:  <lowercase hex HMAC-SHA256>
```
`seq` is not duplicated in a header — it is read from the body (`snapshot.seq`), which is itself
covered by the signature via `BODY_SHA256_HEX`, so there is exactly one source of truth for it.

---

## 3. HMAC-SHA256 verification and HKDF-derived per-kiosk credentials (PROPOSED)

### 3.1 Why per-kiosk, not one shared secret
The only existing precedent in this codebase is `INTERNAL_WEBHOOK_SECRET`
(`functions/src/routes/kiosk.routes.js:400`) — **one** secret shared by every kiosk, compared with
`secretsMatch()` (sha256-then-`crypto.timingSafeEqual`, same file, `kiosk.routes.js:25`). That pattern
is reused for the *comparison* (§3.3) but not for key scope: a single shared Guardian secret would mean
one compromised Pi (or one leaked log line) can forge health reports for every kiosk in the fleet.
Phase 2A instead derives one key per kiosk from a single master secret via HKDF-SHA256, so compromising
one kiosk's derived key reveals nothing about any other kiosk's key or the master secret.

### 3.2 Derivation
```
PRK = HMAC-SHA256(key=salt, msg=master_key)
OKM = HKDF-Expand(PRK, info, length=32)      # RFC 5869, SHA-256
derived_key = OKM
salt = kioskId.encode("ascii")                # e.g. b"AB-123"
info = b"mimo-guardian-v1"                    # fixed, versions the derivation itself
```
Using `kioskId` as salt (not a random per-kiosk value) is a deliberate, auditable choice: the backend
can recompute any kiosk's derived key from `(master_key, kioskId)` alone with no additional per-kiosk
state to store or leak — the derived key only ever needs to be computed, used, and discarded in memory.

### 3.3 Verification order (backend, PROPOSED)
1. Parse succeeded and body is within the size limit (§7) — otherwise reject before any crypto.
2. All five `X-Guardian-*` headers are present and syntactically valid (kiosk-id regex, hex stream id,
   decimal boot-id/timestamp, 64-hex-char signature) — otherwise `400`, no crypto performed.
3. `kioskId` is a known, provisioned kiosk — otherwise `401` (§4.3). Only after this lookup does the
   backend derive that kiosk's key; it never derives a key for an unknown id.
4. Recompute `BODY_SHA256_HEX` over the raw received bytes (see §7.1 on why this must be the
   **rawBody**, not `req.body` re-serialized) and the canonical string (§2.2), then recompute the HMAC
   with the derived key.
5. Compare with `crypto.timingSafeEqual` over two fixed-length SHA-256 digests of the hex strings —
   the exact `secretsMatch()` shape already used in `kiosk.routes.js:25-29` — never a plain `===` on
   variable-length attacker-controlled strings.
6. Only after signature verification does timestamp/sequence/replay logic (§5) run.

### 3.4 Constant-time comparison
Reuses the existing pattern exactly: hash both sides to a fixed 32-byte digest first, then
`timingSafeEqual`, so a length mismatch can never throw or short-circuit early
(`kiosk.routes.js:25-29`, already in production use for `INTERNAL_WEBHOOK_SECRET`).

---

## 4. Secret Manager target architecture and provisioning boundaries (PROPOSED — target, not deployed)

**Nothing below is deployed. No Secret Manager resource, IAM binding, or secret value was created,
read, or accessed during this task.**

### 4.1 Secret identity
- Secret name: **`GUARDIAN_MASTER_KEY`**, in Google Cloud Secret Manager, in the same GCP project as the
  existing Firebase project (`.firebaserc` — project id not reproduced here).
- Exactly one active master key per environment (production / staging), each its own Secret Manager
  secret with its own name suffix (e.g. `GUARDIAN_MASTER_KEY`, `GUARDIAN_MASTER_KEY_STAGING`) so a
  staging compromise cannot forge production signatures.
- 32 random bytes, generated with a CSPRNG, stored as a Secret Manager secret **version** (never as a
  literal in code, config, or any file this repository tracks). No committed secret or credential file
  is introduced by this design — the pattern mirrors the existing `JWT_SECRET` convention
  (`functions/src/config/env.js:9-17`: no hardcoded fallback for a real secret, hard failure at cold
  start if unset or under 32 chars).

### 4.2 Backend access (least privilege)
- Only the Cloud Function that implements `POST /kiosk/guardian/health` verification needs read access
  to the current version of `GUARDIAN_MASTER_KEY` (`roles/secretmanager.secretAccessor`, scoped to that
  one secret resource, not project-wide).
- The function reads the secret once per cold start (Secret Manager client, cached in memory for the
  life of the instance — the same cold-start-once pattern `env.js` already uses for `JWT_SECRET`), never
  per-request.
- No other function, script, or role is granted access to this secret. `postAdminKioskRestart` and the
  other admin-command writers (`kioskCommands.controller.js`) are a different trust boundary and get no
  access to it.
- The Guardian ingestion function derives per-kiosk keys **in memory, on demand**, and never persists a
  derived key anywhere (no Firestore document, no log line, no cache file).

### 4.3 The Pi side — master key never present
- The Pi **never** holds `GUARDIAN_MASTER_KEY` and never calls Secret Manager. It holds only its own
  already-derived per-kiosk key, provisioned once at kiosk setup time (out of band — e.g. baked into the
  kiosk's local config file at provisioning, the same way `config/example-config.json` is hand-authored
  today) and stored locally with the same file permissions the kiosk's other local secrets use.
  **UNVERIFIED**: this document does not know what file-permission convention the Pi provisioning
  process (`pi_scripts/`, `scripts/pi-setup/`) uses today for secrets like the Firebase service-account
  key — that should be matched, not reinvented, before Phase 2B implementation, and is out of scope for
  this design pass.
- Compromise of one Pi's local config exposes only that kiosk's derived key — never the master key and
  never any other kiosk's key (HKDF's one-wayness).

### 4.4 Rotation and revocation
- **Master key rotation**: create a new Secret Manager secret *version* for `GUARDIAN_MASTER_KEY`. The
  backend always reads the *current* version at cold start. Rotation requires re-provisioning every
  kiosk with a newly derived key (since every derived key changes), so it is an **operational event**,
  not a transparent background rotation — this document does not propose dual-version acceptance
  (verifying against both old and new master key during a grace window) because that reintroduces the
  "one shared secret, many trust domains" risk this design is trying to avoid; if overlap is needed, it
  should be scoped per-kiosk (re-provision kiosks one at a time, backend accepts only each kiosk's
  currently-provisioned key, never "any of the last two master keys for every kiosk").
- **Per-kiosk revocation without master rotation**: PROPOSED — maintain a `guardian_revoked_kiosks`
  Firestore collection (new, isolated from `system_status`/`kiosk_commands`/`print_jobs`) listing kiosk
  ids whose derived key must be rejected regardless of signature validity (e.g. a stolen/decommissioned
  Pi). Checked after signature verification succeeds, so a revoked kiosk's valid-looking signature still
  gets `403`, not `401` (distinguishing "wrong key" from "right key, but revoked" in logs without leaking
  that distinction to the caller — both return the same generic error code to the Pi, §7.3).

---

## 5. Timestamp, stream ID, boot ID, sequence and replay semantics (PROPOSED)

### 5.1 Definitions
- **`streamId`**: 16 random bytes (32 hex chars), generated fresh by the Guardian process once at
  startup, held only in memory. Identifies "this run of the process" — every snapshot from one process
  lifetime shares one `streamId`. A restart always gets a new one.
- **`bootId`** (**corrected in Phase 2D** — see the callout below): the Pi's kernel boot UUID
  (`/proc/sys/kernel/random/boot_id`, dashes stripped, lowercased — 32 hex chars, the same shape as
  `streamId`), or a fresh random 32-hex value on any host where that file is unreadable. The kernel
  generates a new one at every boot, so — unlike the decimal counter this document originally
  specified — **no local persistence is needed at all**: Phase 1's "no persistence across restarts"
  property (`README.md:90`) is preserved exactly, not violated. `bootId` is sent and stored for
  operator-visible diagnostics ("this kiosk has rebooted with these boot ids") but, because a UUID
  carries no ordering information, it is **not** used to decide whether a new stream is accepted
  (see the corrected §5.3 row below and `functions/src/guardian/ingest.service.js`'s module
  docstring).

  > **Phase 2D correction.** This document originally specified `bootId` as "an integer the Pi
  > increments and persists locally," and Phase 2C's first publisher implementation matched that by
  > using `int(time.time())` at process start. Neither matches "kernel boot UUID," which is what was
  > actually intended and is what is now implemented. Because the fix changes `bootId` from an
  > orderable integer to an unorderable UUID, the §5.3 rule that depended on comparing `bootId`
  > values ("accept if `bootId` > the stored `bootId`") could not simply be ported — it is replaced
  > below by a comparison of the already-verified request `timestamp` instead, which is strictly
  > stronger against replay, not weaker.
- **`timestamp`**: Unix seconds at send time, independent of the snapshot's own `observedAt` (which is
  capture time, possibly seconds earlier if the cycle took a while). Used only for replay-window
  rejection (§5.3), never for ordering (`seq` orders; `timestamp` just bounds staleness).

### 5.2 Per-kiosk accepted state (what the backend remembers)
One document per kiosk (§6), holding only:
```
{ streamId, bootId, lastAcceptedSeq, lastAcceptedTimestamp, bodySha256OfLastAccepted, serverReceivedAt }
```
`lastAcceptedTimestamp` (**added in Phase 2D**) is the signed request `timestamp` of the last
accepted write, in any stream — it is what the corrected §5.3 row below uses instead of comparing
`bootId` values.

### 5.3 Decision table

| Scenario | Expected result |
|---|---|
| First valid submission ever for a kiosk (no prior document) | **Accept.** Create the state document with this `(streamId, bootId, seq)`. |
| Next request, same `streamId`, `seq` = `lastAcceptedSeq + 1` | **Accept.** This is the normal case — update `lastAcceptedSeq` and `bodySha256OfLastAccepted`. |
| Exact duplicate request (same `streamId`, `seq`, and `bodySha256` as the last accepted) | **Accept idempotently — return the same `202`, write nothing new.** A client retry after a dropped response must not be treated as an error or a conflict. Detected by comparing the incoming body hash to `bodySha256OfLastAccepted` *before* comparing seq ordering. |
| Same `streamId` and `seq` as last accepted, but a **different** body hash | **Reject, `409 Conflict`.** Two different payloads claiming the same position in the same stream is a correctness violation (duplicate seq re-use, clock-driven double-send with mutated content, or tampering) — never silently overwritten. |
| Lower `seq` than `lastAcceptedSeq` in the same `streamId` | **Reject, `409 Conflict`** ("stale sequence"). An older snapshot must never overwrite a newer accepted state — this is the hard requirement from the task brief and is enforced by the transaction in §5.4, not by application-level ordering alone. |
| New `streamId` for a kiosk that already has an accepted state | **Accept if the request's `timestamp` is strictly greater than the stored `lastAcceptedTimestamp`.** This is "the agent restarted" — `seq` legitimately resets to 1 under the new stream. **Corrected in Phase 2D**: this no longer compares `bootId` values at all (a kernel boot UUID carries no ordering information — see §5.1's correction note), so `bootId` is never compared numerically or lexicographically. If the timestamp is not strictly greater, **reject, `409 Conflict`** ("stale or replayed stream"). |
| Concurrent submissions (two requests in flight for the same kiosk) | Exactly one wins per the transactional rule in §5.4; the other is evaluated against whichever committed first and is accepted/rejected by the same table above — **never a lost update, never both partially applied.** |
| Stale timestamp (`timestamp` older than a configured window, e.g. 5 minutes, vs. server clock) | **Reject, `409 Conflict`** ("stale timestamp") — distinct from the `seq`-based conflict so Pi-side logs can tell clock drift from an ordering bug. |
| Future timestamp (`timestamp` more than a small skew, e.g. 30s, ahead of server clock) | **Reject, `409 Conflict`** ("timestamp in future") — mirrors Phase 1's own `FUTURE_SKEW_S` treatment of `observedAt` (`classifier.py:27,68`): a timestamp from the future is never trusted, never silently accepted as "the newest." |
| Firestore transaction failure (contention, outage) | **`503`, `Retry-After` set (§8).** Never partially apply — the whole accept-and-update is one transaction (§5.4); a failure leaves the previously accepted state untouched, so a retry is always safe. |
| Clock synchronization failure (Pi's clock is wrong) | Surfaces as either a stale or future-timestamp rejection (above) — there is no separate "clock error" code; the Pi-side retry/backoff (§9) does not special-case it, since from the Pi's perspective it is indistinguishable from any other `409`. |

### 5.4 Transactional safety
The read of the kiosk's current accepted state and the write of the new accepted state happen inside a
single Firestore transaction (`db.runTransaction`, the same primitive already used for exactly this kind
of "read current state, decide, write new state" problem in `claimRefund`
(`functions/src/services/refund.service.js`, exercised under real concurrency in
`__tests__/emulator/orders.emulator.js:35-39`, 8 concurrent callers, exactly one wins) and in
`kiosk.routes.js`'s `/print` handler (`kiosk.routes.js:308`, transactional read-check-write on
`print_jobs`). Guardian's ingestion reuses that exact shape: **read** the kiosk's state document inside
the transaction, **decide** accept/duplicate/conflict per §5.3 using data read inside that same
transaction (never a value read before the transaction started), **write** the new state only on
accept, all inside one `runTransaction` call. Firestore's transaction semantics (optimistic, retried
automatically by the client library on contention, and the fake's `strictTransactions` mode exists
specifically to test this — §15) give the "exactly one concurrent writer wins, the other sees the
already-updated state" guarantee for free; no additional locking is proposed.

---

## 6. `POST /kiosk/guardian/health` (PROPOSED)

### 6.1 Isolation from the existing kiosk router
This is a **new, separate** Express router, mounted independently of `createKioskRouter`
(`functions/src/routes/kiosk.routes.js`) — not added to it. `CLAUDE.md` requires Guardian to share no
code or files with the print path; mounting under the same router file (even at a different sub-path)
would violate that even if no print-path *logic* were touched.

As actually implemented (Phase 2B): `app.use(require("./routes/guardianHealth.routes"))` in
`server.js`, mounted with **no path prefix** — the router itself declares the full path
(`router.post("/kiosk/guardian/health", ...)`), the same pattern every other top-level router in
`server.js` already uses (`auth.routes`, `user.routes`, etc.). This document's earlier draft
proposed mounting with an `app.use("/kiosk/guardian", ...)` prefix instead; that was not what got
built, and the no-prefix form is what is correct to match: it is also what keeps
`__tests__/fixtures/route-table.json`'s API-surface snapshot test (which records the exact route
table and fails on any accidental change) correct without special-casing this router the way it
already special-cases the `/kiosk`-prefixed kiosk router.

### 6.2 Request
- Method/path: `POST /kiosk/guardian/health`.
- Headers: §2.3.
- Body: the exact bytes of a Phase 1 snapshot, as produced by `encode_snapshot()` — canonical JSON,
  sorted keys, no extra whitespace, UTF-8, ≤ 8192 bytes (§1.4). The backend does **not** re-validate
  snapshot *semantics* beyond what `validate_snapshot` already guarantees were true when the Pi built
  it — it treats the body as an opaque, already-validated, size-bounded blob for storage purposes (§13),
  and only inspects `kioskId`/`seq`/`schemaVersion` to drive replay logic and freshness.
- Transport: plain HTTPS (Cloud Functions already terminates TLS; no additional transport requirement
  proposed beyond what every other route here gets).

### 6.3 Response codes (PROPOSED)
| Code | Meaning |
|---|---|
| `202 Accepted` | New snapshot accepted, or an exact idempotent duplicate (§5.3). **Corrected in Phase 2D**: this document originally said the Pi "cannot (and must not try to) distinguish these," but both the actually-implemented backend and publisher already agree on a richer, already-tested contract — the body is `{"status":"accepted"}` or `{"status":"duplicate"}` (`functions/__tests__/guardianIngest.test.js`), and the Python publisher reads exactly that field to report `ACCEPTED` vs. `DUPLICATE` (`pi-guardian/guardian/publisher.py`'s `_classify`, `pi-guardian/tests/test_publisher.py`). That distinction is real, deliberate, and useful for Pi-side logging/diagnostics — it was only ever the prose here that undersold it. |
| `400 Bad Request` | Malformed JSON, oversized body, missing/malformed header, unsupported `schemaVersion`, or a body that fails `validate_snapshot`. |
| `401 Unauthorized` | Unknown `kioskId`, or signature verification failed. |
| `403 Forbidden` | Signature valid but the kiosk is revoked (§4.4) — logged distinctly from `401`, same body shape to the caller. |
| `409 Conflict` | Any replay/ordering violation from §5.3's table. |
| `413 Payload Too Large` | Body exceeds the size limit, detected by the parser before JSON parsing is attempted (§7.1). |
| `429 Too Many Requests` | Rate limit exceeded (§8), `Retry-After` set. |
| `503 Service Unavailable` | Firestore transaction could not complete; `Retry-After` set; nothing was partially written. |

No response body field distinguishes `401` (bad signature) from `401` (unknown kiosk) — both are
`{"error": "Unauthorized"}` to the caller, mirroring the existing pattern of not leaking which half of
an auth check failed (`auth.js`'s `authMiddleware`/`adminAuthMiddleware` give the same generic
`"Invalid Token"` regardless of which verification step failed).

---

## 7. Request validation, parser errors and body-size limits (PROPOSED, against the real parser)

### 7.1 The real Express setup (verified, `functions/src/server.js:8-13`)
```js
app.use(express.json({ verify: (req, res, buf) => { if (!req.rawBody) req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true }));
```
`express.json()` already captures `req.rawBody` as the exact received bytes (added originally for
webhook signature verification — the same need Guardian has). **This is the buffer Guardian's HMAC
verification must hash and sign over** (§2.2, §3.3) — never `JSON.stringify(req.body)`, which could
reorder keys or change whitespace relative to what the Pi actually signed. This is the same reasoning
the codebase already applied once (the comment at `server.js:11` says exactly this, for a different
webhook). **No change to `server.js`'s existing middleware is proposed** — `rawBody` is already global
to every route once `express.json()` runs, so Guardian's router reads `req.rawBody`, it does not add a
new body-parsing step.

### 7.2 Body size limit
`express.json()` defaults to a 100kb limit unless configured otherwise (Express/body-parser default;
**UNVERIFIED** whether `server.js` overrides this anywhere else in the app — no `limit` option is
passed at `server.js:12`, so the default applies globally, including to this new route). Since a Phase 1
snapshot is hard-capped at 8192 bytes (§1.4), this default is already far more generous than Guardian
ever needs; this document does **not** propose tightening the global limit (that's a cross-cutting
change outside Guardian's boundary — `CLAUDE.md` forbids touching shared deployment files without
approval) and instead proposes an **additional, route-local** check: reject with `413` if
`req.rawBody.length > 8192` before calling `JSON.parse` on it at all, so an oversized payload never
reaches the JSON parser or the crypto path.

### 7.3 Validation order (PROPOSED, cheapest/safest checks first)
1. `Content-Type` must be `application/json` → else `400`.
2. `req.rawBody.length <= 8192` → else `413`, before JSON parsing.
3. All required `X-Guardian-*` headers present and syntactically well-formed → else `400`.
4. `req.body` is valid JSON (already guaranteed by `express.json()` reaching the handler at all — a
   parse failure throws inside the middleware and never reaches this route; Express's default JSON
   parse error path returns `400` before any route code runs) and passes `validate_snapshot`'s schema
   (ported to Node for Phase 2A review, or run through a thin JS re-implementation matching §1 exactly)
   → else `400`.
5. `kioskId` is a provisioned kiosk → else `401` (no key derivation attempted for unknown ids, §3.3).
6. Signature verification (§3) → else `401`.
7. Revocation check (§4.4) → else `403`.
8. Rate limit (§8) → else `429`.
9. Replay/ordering transaction (§5) → `202` / `409` / `503`.

Steps are ordered so that no cryptographic work happens for a malformed or oversized request, and no
Firestore read happens before signature verification — an unauthenticated caller cannot cause a
Firestore read/write by probing this endpoint.

---

## 8. Authentication, authorization and rate-limiting behavior (PROPOSED)

- **Authentication**: per-kiosk HMAC, §3. No JWT, no `Authorization` header — this is a machine-to-machine
  endpoint with its own credential scheme, deliberately not reusing `authMiddleware`/
  `adminAuthMiddleware` (`functions/src/middleware/auth.js`), which are for human-logged-in sessions.
- **Rate limiting**: modeled directly on the existing `createFailureLimiter` shape
  (`functions/src/middleware/rateLimit.js:35`) — Firestore-backed (so it is shared across Cloud
  Functions instances, unlike an in-memory counter), fails open on a Firestore read error (an outage
  must never lock out legitimate health reporting), and counts only specific outcomes as "failures":
  PROPOSED to count `401` (bad signature) and `429` itself, but **not** `202` or `409` — a legitimately
  misordered retry (§5.3) must not burn rate-limit budget the way a forged-signature probe should.
  Window/threshold values are **not fixed by this document** (left as a PROPOSED starting point: 1/sec
  sustained, burst to 5, matching Guardian's own minimum `cycle_interval_s` floor of 10s in
  `pi-guardian/guardian/config.py:178` — a correctly-behaving kiosk can never need more than this).
- **`Retry-After`**: set on both `429` and `503`, same header-based contract the existing limiter already
  uses (`rateLimit.js:65`, `Retry-After` in seconds).

## 9. `GET /admin/guardian/health` (PROPOSED)

- Mounted under the existing `admin.routes.js` pattern, gated by `adminAuthMiddleware`
  (`functions/src/middleware/auth.js:29`) — the same `isAdmin` JWT claim every other admin-only read
  uses. No new auth mechanism for the admin side.
- Read-only: returns the latest accepted state document (§13) for one kiosk (`?kioskId=`) or a summary
  across all kiosks. Never accepts a write; this route cannot be used to forge or clear a kiosk's
  accepted state.
- Response is the stored snapshot plus `serverReceivedAt` and a computed `freshness` field (§14) — it
  does not re-run replay logic, since nothing is being accepted here.
- `404` if no Guardian report has ever been accepted for that kiosk (distinct from "kiosk is offline" —
  Guardian silence is not the same signal as `system_status` staleness, and this route must not be read
  as a replacement for the existing online/offline indicator, §0).

## 10. Retry backoff and jitter (Pi side, PROPOSED)

- On any `5xx`, `429`, or network error, the publisher waits before the *next scheduled cycle* rather
  than retrying mid-cycle — Guardian's scheduler already runs one cycle at a time with no retry loop
  (`scheduler.py:1,74`), and Phase 2A's publisher must not add one (that would reintroduce exactly the
  "queue/retry logic that could hang" risk `CLAUDE.md` and the v0.1 doc's safety architecture rule out).
  Concretely: the publisher callback (an `on_snapshot` hook, §1.6) makes **one** attempt, with a short
  connect/read timeout (PROPOSED: 5s, well inside Guardian's own `cycle_budget_s` ceiling of 120s,
  `config.py:179`), and on failure simply returns — the next snapshot, one `cycle_interval_s` later,
  carries the same `seq`-ordering guarantee and is a legitimate next attempt, not a special retry path.
- **Backoff**: PROPOSED — on `429`/`503`, the publisher additionally remembers "skip the next N cycles'
  publish attempt" using the server's `Retry-After` value, clamped to a maximum (e.g. 10 minutes) so a
  misconfigured backend can never silence a kiosk's reporting indefinitely. This is in-memory state in
  the publisher, not a new local file — a Guardian restart simply resets it to "try now," which is safe
  (worst case: one extra request sooner than the server asked for).
- **Jitter**: PROPOSED — up to ±10% of `cycle_interval_s` added once at publisher startup (not
  re-randomized every cycle), so a fleet restarted simultaneously (e.g. after a mass update) does not
  send its first health report in lockstep.

## 11. Isolated latest-state Firestore document (PROPOSED)

- Collection: **`guardian_health_latest`** (new; not `system_status`, not any existing collection —
  §0). This document originally proposed the name `guardian_kiosk_health`; the Phase 2B
  implementation task specified `guardian_health_latest` instead, and that is the name actually
  implemented (`functions/src/guardian/ingest.service.js`'s `STATE_COLLECTION`) — noted here so this
  document matches the real collection name, not a renamed draft of it.
- One document per kiosk, id = `kioskId`:
```
{
  snapshot: { ...the accepted Phase 1 snapshot, verbatim... },
  streamId, bootId, lastAcceptedSeq, lastAcceptedTimestamp,
  bodySha256OfLastAccepted,
  serverReceivedAt,     // Firestore server timestamp, set by the accepting transaction — never client-supplied
  schemaVersion: 1
}
```
`lastAcceptedTimestamp` (added in Phase 2D, §5.2) is the signed request timestamp of the last
accepted write in any stream for this kiosk — it is what a new stream's acceptance is now judged
against, not `bootId` (§5.1/§5.3's Phase 2D correction).
- Written **only** by the Guardian ingestion route's transaction (§5.4). No other function writes to
  this collection. Firestore security rules for it follow the existing default-deny pattern
  (`firebase/firestore.rules:49`) — client reads/writes are `false`; the Admin SDK (used by the ingestion
  function and by the admin read route) bypasses rules entirely, exactly as every other Admin-SDK write
  in this codebase already does. This document does **not** propose any client-side (browser)
  read/write rule for this collection — the admin dashboard, if it ever reads this, goes through
  `GET /admin/guardian/health` (§9), never directly against Firestore.

## 12. Server-receipt-time freshness calculation (PROPOSED)

- `freshness` is computed at **read** time (in `GET /admin/guardian/health`, §9), not stored, so it is
  always current relative to "now," not relative to whenever the document was last written:
  ```
  ageMs = now() - serverReceivedAt
  freshness = ageMs <= staleAfterMs ? "FRESH" : "STALE"
  ```
- `serverReceivedAt` (Firestore server timestamp, set inside the accepting transaction, §11) is used
  instead of the snapshot's own `observedAt` deliberately: `observedAt` is Pi-clock time and is exactly
  what §5.3's future/stale timestamp checks already distrust; freshness for *admin display* purposes
  should reflect "when did our server last hear from this kiosk," which is unaffected by Pi clock drift.
- `staleAfterMs` is a backend-side constant, independent of Guardian's own `stale_after_s`
  (`pi-guardian/guardian/config.py:49`) — the two measure different things (Guardian's is "how old is
  this *check result* within one snapshot," the backend's is "how old is the *last snapshot we got*")
  and must not be conflated into one constant shared across the Pi/backend boundary.

---

## 13. Python/Node shared golden signing vectors

These are **real, computed** values — produced by running the actual `guardian.snapshot.encode_snapshot`
function in this repository (not hand-typed example JSON) and an HKDF-SHA256 / HMAC-SHA256
implementation using only `hashlib`/`hmac`-equivalent primitives (matching Guardian's "standard library
only" rule, `CLAUDE.md`). A Node implementation must reproduce every hex value below exactly from the
same inputs. **The master key below is a fixture for this test vector only — it is not a real secret,
is not used anywhere, and must never be used as an actual `GUARDIAN_MASTER_KEY` value.**

### 13.1 Shared inputs

> **Correction (made during Phase 2B implementation):** the first version of this document gave a
> master-key fixture that was actually 31 bytes (62 hex characters), not the 32 it claimed — the
> derived key, HMAC and comparison outputs are always 32 bytes regardless of input key length, so
> length-checking *those* (as the original pass did) silently missed that the *input* was short by
> one byte. It was caught only once Phase 2B's route-level tests ran the fixture through
> `guardian/secret.js`'s format check (which correctly enforces exactly 64 hex chars for a real
> master key) and got rejected. The vectors below are regenerated with a genuine 32-byte key; the
> derived key and both signatures changed as a result (the two signed bodies did not).

```
MASTER_KEY (hex, 32 bytes, TEST FIXTURE ONLY):
  00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff

HKDF info (fixed, ASCII):              mimo-guardian-v1
KIOSK_ID (HKDF salt, ASCII):           AB-123
STREAM_ID (32 lowercase hex chars):    0b7e6b8e9c1a4e3a8f0a1c2d3e4f5061
BOOT_ID:                               1

Derived key (HKDF-SHA256(MASTER_KEY, salt=KIOSK_ID, info=info, len=32), hex):
  5c09573e78615ab43f49260ab55ab544ca4186229d214f0d7ab3f1eb40ef36db
```
(`MASTER_KEY` above is the 16-byte block `00112233445566778899aabbccddeeff` written twice — 64 hex
characters, 32 bytes. `len(bytes.fromhex(MASTER_KEY_HEX)) == 32` was asserted programmatically by
the script that produced this value, not counted by eye — eyeballing a hex string's length is
exactly the mistake that produced the original, wrong 31-byte fixture this corrects.)

### 13.2 Vector A — empty-checks `UNKNOWN` snapshot, `seq = 1`
```
Snapshot (Python dict, before encoding):
  schemaVersion=1, agentVersion="0.1.0-phase1", kioskId="AB-123", seq=1,
  observedAt="2027-01-15T12:00:00Z",
  cycle={durationMs:120, budgetMs:20000, budgetExceeded:false, detailsDropped:false},
  checks=[],
  diagnosis={overall:"UNKNOWN", rootCauses:[], cascades:[], unknown:[]}

validate_snapshot(snapshot) == []   # confirmed by running the real function

Canonical body bytes (UTF-8; = guardian.snapshot.encode_snapshot(snapshot)):
  {"agentVersion":"0.1.0-phase1","checks":[],"cycle":{"budgetExceeded":false,"budgetMs":20000,"detailsDropped":false,"durationMs":120},"diagnosis":{"cascades":[],"overall":"UNKNOWN","rootCauses":[],"unknown":[]},"kioskId":"AB-123","observedAt":"2027-01-15T12:00:00Z","schemaVersion":1,"seq":1}
  (291 bytes)

BODY_SHA256_HEX:
  257b491532cf760fde83e635557b72cf651003d7d82c6f241d5bbaca1a89cfb9

TIMESTAMP: 1800000000

Canonical signing string (ASCII bytes, \n-joined):
  POST
  /kiosk/guardian/health
  AB-123
  0b7e6b8e9c1a4e3a8f0a1c2d3e4f5061
  1
  1
  1800000000
  257b491532cf760fde83e635557b72cf651003d7d82c6f241d5bbaca1a89cfb9

X-Guardian-Signature (HMAC-SHA256(derived_key, canonical_bytes), hex):
  62f7e23d91717f29d16d1ff8e432c7ffbcc4fa6a44d8f00dfb46cafe25979630
```

### 13.3 Vector B — `FAILING` snapshot with one check, `seq = 2`, same stream
```
Snapshot:
  schemaVersion=1, agentVersion="0.1.0-phase1", kioskId="AB-123", seq=2,
  observedAt="2027-01-15T12:01:00Z",
  cycle={durationMs:340, budgetMs:20000, budgetExceeded:false, detailsDropped:false},
  checks=[{id:"link", plane:"connectivity", required:true, state:"FAIL",
           observedAt:"2027-01-15T12:01:00Z", durationMs:12,
           evidence:["LINK_CARRIER_DOWN"], detail:"", streak:3}],
  diagnosis={overall:"FAILING",
             rootCauses:[{code:"LINK_DOWN", plane:"connectivity", severity:"CRITICAL",
                          checks:["link"], evidence:["LINK_CARRIER_DOWN"]}],
             cascades:[], unknown:[]}

validate_snapshot(snapshot) == []   # confirmed by running the real function

Canonical body bytes (UTF-8):
  {"agentVersion":"0.1.0-phase1","checks":[{"detail":"","durationMs":12,"evidence":["LINK_CARRIER_DOWN"],"id":"link","observedAt":"2027-01-15T12:01:00Z","plane":"connectivity","required":true,"state":"FAIL","streak":3}],"cycle":{"budgetExceeded":false,"budgetMs":20000,"detailsDropped":false,"durationMs":340},"diagnosis":{"cascades":[],"overall":"FAILING","rootCauses":[{"checks":["link"],"code":"LINK_DOWN","evidence":["LINK_CARRIER_DOWN"],"plane":"connectivity","severity":"CRITICAL"}],"unknown":[]},"kioskId":"AB-123","observedAt":"2027-01-15T12:01:00Z","schemaVersion":1,"seq":2}

BODY_SHA256_HEX:
  8088811b0e4cba1731299c7e8fd7240afcbf45cfa427ac3a166e9dd67489133b

TIMESTAMP: 1800000061   (BOOT_ID still 1, same stream as Vector A, 61s later)

Canonical signing string:
  POST
  /kiosk/guardian/health
  AB-123
  0b7e6b8e9c1a4e3a8f0a1c2d3e4f5061
  1
  2
  1800000061
  8088811b0e4cba1731299c7e8fd7240afcbf45cfa427ac3a166e9dd67489133b

X-Guardian-Signature:
  0e05a2ea3c269d7d511904cdb43fe23b699bd6fba4ecf610dbb964ce11384207
```

### 13.4 Negative vector — tamper detection
Flipping any single byte of Vector A's body (e.g. `"seq":1` → `"seq":9`) changes `BODY_SHA256_HEX`,
which changes the canonical string, which changes the signature. A Node implementation that
re-serializes `req.body` instead of hashing `req.rawBody` (§7.1) would compute a *different*
`BODY_SHA256_HEX` than the Pi did for any payload where Node's JSON stringify order differs from
Python's `sort_keys=True` — this vector pair exists specifically so a Node implementation can be
checked against Vector A/B byte-for-byte, not just "does verification pass for well-behaved input."

---

## 14. Security and regression acceptance matrix

| # | Scenario | Expected result | Python test location (new) | Node test location (new) | Firestore Emulator needed? |
|---|---|---|---|---|---|
| 1 | Golden Vector A: correct signature verifies | Accept | `pi-guardian/tests/test_signing.py` | `functions/__tests__/guardianSigning.test.js` | No |
| 2 | Golden Vector B: correct signature verifies, different seq/stream position | Accept | `test_signing.py` | `guardianSigning.test.js` | No |
| 3 | Golden Vector A with one body byte flipped | Reject, `401` | `test_signing.py` | `guardianSigning.test.js` | No |
| 4 | Signature computed with the wrong kiosk's derived key | Reject, `401` | `test_signing.py` | `guardianSigning.test.js` | No |
| 5 | HKDF derivation: same `(master_key, kioskId)` → same key every time; different `kioskId` → different key | Deterministic / distinct | `test_signing.py` | `guardianSigning.test.js` | No |
| 6 | First submission for a never-seen kiosk | Accept, state doc created | n/a (backend-only) | `guardianIngest.test.js` (fakeFirestore) | No |
| 7 | Exact duplicate retry (same stream/seq/body) | Accept idempotently, `202`, no new write | n/a | `guardianIngest.test.js` | No |
| 8 | Same stream/seq, different body | Reject, `409` | n/a | `guardianIngest.test.js` | No |
| 9 | Lower seq than last accepted, same stream | Reject, `409` | n/a | `guardianIngest.test.js` | No |
| 10 | New stream, higher `bootId` than stored | Accept | n/a | `guardianIngest.test.js` | No |
| 11 | New stream, `bootId` not greater than stored (replay of an old boot) | Reject, `409` | n/a | `guardianIngest.test.js` | No |
| 12 | 8 concurrent valid submissions for one kiosk, increasing seq | Exactly the highest-seq one is the final accepted state; no lost update | n/a | `guardianIngest.emulator.js` | **Yes** — real transaction race, same shape as `orders.emulator.js:35` |
| 13 | 8 concurrent submissions, same seq, different bodies | Exactly one accepted, the rest `409` | n/a | `guardianIngest.emulator.js` | **Yes** |
| 14 | Stale timestamp (older than window) | Reject, `409` | n/a | `guardianIngest.test.js` | No |
| 15 | Future timestamp (beyond skew) | Reject, `409` | n/a | `guardianIngest.test.js` | No |
| 16 | Firestore transaction throws (simulated) | `503`, `Retry-After` set, prior state unchanged | n/a | `guardianIngest.test.js` (fakeFirestore `failReads`-style stub) | No |
| 17 | Malformed JSON body | `400`, before any crypto/Firestore work | n/a | `guardianIngest.test.js` | No |
| 18 | Body over 8192 bytes | `413`, before `JSON.parse` | n/a | `guardianIngest.test.js` | No |
| 19 | Missing one required `X-Guardian-*` header | `400` | n/a | `guardianIngest.test.js` | No |
| 20 | Unknown `kioskId` | `401`, no key derivation attempted (assert via spy/log, not timing) | n/a | `guardianIngest.test.js` | No |
| 21 | Revoked kiosk, otherwise-valid signature | `403` | n/a | `guardianIngest.test.js` | No |
| 22 | Rate limit exceeded (repeated `401`s) | `429`, `Retry-After` set | n/a | `guardianIngest.test.js` (model on `rateLimit.test.js`) | No |
| 23 | `GET /admin/guardian/health` without admin JWT | `401`/`403` per existing `adminAuthMiddleware` behavior | n/a | `guardianAdminRead.test.js` | No |
| 24 | `GET /admin/guardian/health` for a kiosk with no accepted state yet | `404` | n/a | `guardianAdminRead.test.js` | No |
| 25 | Freshness: `serverReceivedAt` within window → `FRESH`; beyond → `STALE` | Computed at read time, not stored | n/a | `guardianAdminRead.test.js` | No |
| 26 | **Regression**: ingesting Guardian health never writes `system_status`, `kiosk_commands`, or `print_jobs` | No writes to those collections, for any scenario above | n/a | assertion added to every `guardianIngest*` test (inspect fakeFirestore's write log) | No (emulator variant: assert via `db.collection(...).get()` staying empty) |
| 27 | **Regression**: existing `system_status`-driven online/offline computation (`publicMachines.controller.js:48`) is unaffected by any Guardian write | Unchanged behavior | n/a | re-run existing `publicMachines.test.js` unmodified — must still pass | No |
| 28 | **Regression**: Phase 1 snapshot validation/scheduler/static-safety tests | All still pass, unmodified | re-run existing `pi-guardian/tests/` suite unmodified | n/a | No |
| 29 | Pi-side: publisher failure (network error, 5xx) does not block or delay the next observation cycle | Scheduler's cycle budget/lock behavior unaffected (`scheduler.py:21,45,74`) | new test in `pi-guardian/tests/test_publisher.py` (publisher module does not exist yet) | n/a | No |
| 30 | Pi-side: `Retry-After`-driven backoff is clamped to a maximum and resets on restart | Bounded skip, in-memory only | `test_publisher.py` | n/a | No |

Rows 1–25 and 29–30 describe **new** modules (`guardianSigning`, `guardianIngest`, `guardianAdminRead`,
a Pi-side publisher) that do not exist yet — this matrix is the acceptance criterion for writing them in
a later, implementation-approved phase, not a report of tests that currently exist. Rows 26–28 are the
regression gate: they must be run against *this* repository's existing code as a baseline before any
Phase 2A code is merged, and again after.

---

## 15. Firestore test infrastructure — what exists today (verified)

Per the task's explicit instruction, this was inspected and not assumed:

- **A fakeFirestore in-memory harness exists**: `functions/__tests__/helpers/fakeFirestore.js`. Supports
  `collection().doc()/add/where(all operators)/orderBy/limit/get`, dotted-path `update`, `batch`,
  `runTransaction`, and `FieldValue.serverTimestamp/increment/delete`. It has an opt-in
  **`strictTransactions`** mode (file header comment, lines 51-56) built specifically for tests that
  exercise concurrent `runTransaction` races — "a transaction's writes are queued until its callback
  resolves... if [a version counter] has moved by the time the callback finishes, the whole callback is
  discarded and re-run" — the same abort-and-retry guarantee real Firestore gives. This is the right tool
  for acceptance rows 1–11, 14–25 above, and (in `strictTransactions` mode) a reasonable first pass at
  row 12/13's concurrency even without the real emulator.
- **A real Firestore Emulator harness exists and is wired up**, but is currently scoped to one area:
  `functions/package.json`'s `test:emulator` script runs
  `firebase emulators:exec --config __tests__/emulator/firebase.emulator.json --only firestore --project demo-mimo-emulator "node --test __tests__/emulator/orders.emulator.js"`.
  `__tests__/emulator/firebase.emulator.json` configures a Firestore-only emulator on `127.0.0.1:8099`.
  `__tests__/emulator/orders.emulator.js` currently contains **order/refund** concurrency tests only
  (e.g. "8 concurrent claims on one order, exactly one wins," line 35) — it is not Guardian-specific and
  was not modified.
- **Neither was assumed** — both were opened and read in this session (`fakeFirestore.js`,
  `firebase.emulator.json`, `orders.emulator.js`, `package.json`'s scripts block).
- **Remaining test-infrastructure work for Phase 2A** (not done in this task, per the "no dependency
  installation, no emulator startup" rule):
  1. A new emulator test file (e.g. `__tests__/emulator/guardianIngest.emulator.js`) alongside
     `orders.emulator.js`, run through the *existing* `firebase.emulator.json` config (it is generic to
     the project, not orders-specific — no config change anticipated, but **unverified** until someone
     actually runs it, since this task did not start the emulator).
  2. A `package.json` script addition (e.g. `test:emulator:guardian`) is a config change and is out of
     scope for this documentation task.
  3. Whether `firebase-tools` (required by `firebase emulators:exec`) is actually installed and runnable
     in this environment is **UNVERIFIED** — not checked, since doing so would mean invoking tooling
     that could reach toward emulator startup, which this task explicitly excludes.

---

## 16a. Phase 2F: kiosk provisioning, key versioning and revocation (IMPLEMENTED)

This section documents what Phase 2F actually implemented, correcting §3/§4's original "no
provisioning check, no versioning" design, which this section supersedes where they conflict.

### Explicit provisioning (closes the gap in §3.3 step 3)
§3.3 originally said "`kioskId` is a known, provisioned kiosk" without ever specifying what made a
kiosk "known" — Phase 2B through 2E accepted any format-valid `kioskId`. Phase 2F adds a real
registry: collection **`guardian_kiosks`** (new, dedicated to Guardian — never `system_status`,
`kiosk_commands`, `print_jobs`, or the generic `machines` registry), one document per kiosk:
```
{
  status: "ACTIVE" | "DISABLED" | "REVOKED",
  activeKeyVersion: number,                 // >= 1
  previousKeyVersion: number | null,        // valid only until previousKeyVersionExpiresAt
  previousKeyVersionExpiresAt: Timestamp | null,
  provisionedAt: Timestamp,
  updatedAt: Timestamp,
}
```
No key or secret material is ever stored here — only which version number(s) are currently
permitted (`functions/src/guardian/registry.js`). A format-valid `kioskId` with no document here,
or whose document's `status` is not `ACTIVE`, is rejected before any signature is even attempted.

### Key versioning (extends §3.2's derivation, byte-compatible with every existing vector)
`deriveKioskKey`/`derive_kiosk_key` gained a third parameter, `keyVersion` (default 1). Version 1
uses the HKDF `info` string exactly as originally specified (`"mimo-guardian-v1"`, unsuffixed) —
every golden vector in §13, computed before versioning existed, is therefore still valid without
regeneration. Version N ≥ 2 uses `info = "mimo-guardian-v1:kvN"`, deterministically deriving a
different 32-byte key from the same master secret and kiosk id, with no additional stored secret.

The presented version travels in a new header, **`X-Guardian-Key-Version`** (decimal digits, added
to §2.3's header list). It is **not** included in the canonical signing string (§2.2) — deliberately:
adding it there would change the signed bytes for every request ever made, invalidating every
existing cross-language golden vector for no security benefit, since the version is already
unambiguously bound by which specific derived key successfully verifies the signature. A forged
header claiming the wrong version simply fails verification against whichever key the backend
tries for that claimed version.

### Rotation policy
Rotating a kiosk's key (`registry.rotateKioskKey`) sets a new `activeKeyVersion` and moves the
previous one to `previousKeyVersion` with a grace expiry (`previousKeyVersionExpiresAt`, default
24h — `DEFAULT_ROTATION_GRACE_S`). Both the old and new versions verify successfully during that
window; at/after expiry, only the new version does. §4.4's "dual-master-key grace window" question
(item 4 below) is about rotating the *master* secret, which this does not resolve — this is
per-kiosk key-version rotation from a stable master secret, a narrower and simpler problem.

### Revocation and disabling
`registry.setKioskStatus` sets `DISABLED` or `REVOKED`. Both are rejected identically at the HTTP
layer (`403`, with a `reason` field distinguishing them for logs) and, critically, **never touch
`guardian_health_latest`** — a kiosk's previously accepted telemetry history survives a revocation
exactly as it was; revocation prevents new ingestion, it does not erase the past.

### Race safety (closes a real gap, not a hypothetical one)
A plain, non-transactional registry read happens first in the route (to decide whether a signature
is even worth attempting). That read can be stale — harmlessly, because the actual accept/reject
decision re-reads the registry document with `tx.get()` **inside the same transaction** as the
replay write (`ingest.service.js`'s `runReplayTransaction`). Firestore's optimistic-concurrency
guarantee on transactional reads means a concurrent revoke can never be bypassed by the earlier
stale read: the transaction either observes the revocation directly or is forced to retry with a
fresh read before it can commit anything.

---

## 16. Open decisions and unresolved questions (explicit, not silently assumed)

1. **Rate-limit thresholds (§8)** are a proposed starting point, not a decided value.
2. **Replay window sizes** (stale-timestamp window, future-skew tolerance, §5.3) are proposed
   placeholders mirroring Phase 1's own `FUTURE_SKEW_S` philosophy, not final numbers.
3. ~~Local `bootId` file format/location on the Pi (§5.1) needs to match whatever convention
   `pi_scripts/`/`scripts/pi-setup/` already use for other local state.~~ **Resolved in Phase 2D**:
   `bootId` is the kernel's own boot UUID (`/proc/sys/kernel/random/boot_id`), read, never written —
   there is no local file for Guardian to own or format at all, so this question no longer applies.
4. **Dual-master-key grace window during rotation (§4.4)**: deliberately *not* proposed, flagged instead
   as a tradeoff the operator should decide on explicitly rather than have it silently designed in.
5. **GCP project id, IAM role bindings, and whether `GUARDIAN_MASTER_KEY` would share a Secret Manager
   project with other existing secrets**: **UNVERIFIED** — no production configuration was read or
   accessed for this task, per the hard rule against production access.
6. **Whether `firebase-tools` emulator actually runs in this dev environment**: **UNVERIFIED** (§15.3).

---

*End of Phase 2A contract proposal. No source files were changed by producing this document.*
