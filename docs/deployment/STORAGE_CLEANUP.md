# Cloud Storage lifecycle cleanup

> Status: **implemented on branch `fix/storage-lifecycle-cleanup`, not deployed, not enabled in production.**
> Nothing in this document describes behaviour that is live today. Read §8 before deploying anything.

How MIMO removes customer files from Cloud Storage (`mimo-v2-11868.firebasestorage.app`), why the previous retention job did not
reach most files, and how to roll the new code out safely.

## 1. Policies

| | Rule | Mechanism |
|---|---|---|
| **A. Printed** | When a job reaches the existing authoritative success state (`status: "completed"`, written by the Pi/backend after its own print verification), delete **all** its customer files. | `autoCleanupStorageJob` trigger (immediately) + `scheduledFileRetentionCleanup` (retry / legacy jobs) |
| **B. Not printed** | Delete an object **24 h after its real Cloud Storage upload time** (`timeCreated`). Not payment time, not print-code time, not the Firestore document time. | `scheduledFileRetentionCleanup` (objects of known jobs) and `scheduledOrphanStorageCleanup` (objects without any job) |
| **Exception** | A **paid, unprinted** job is never cleaned by age, however old. Jobs that are `printing`, `pending_conversion` or `processing` are never touched either. Cleanup never changes status, payment, refund or print-code fields of such jobs. | `classifyJob` (`storageCleanup.service.js`) and the active-reference index |

Statuses handled by Policy B: `pending` (becomes `abandoned` once its file is gone), `failed`, `refunded`, `abandoned`, `expired`, `cleaned`, anything unknown.
A job the customer removed from the cart (`removedByUser`) is cleaned immediately, without waiting for the 24 h age.

## 2. What may be deleted

Only objects under these prefixes (`CUSTOMER_PREFIXES` in `services/storage.service.js`):

| Prefix | Content |
|---|---|
| `uploads/` | browser uploads (and WhatsApp intake `uploads/wa_*`) |
| `converted/` | Office -> PDF output of the converter service |
| `files/` | PDFs generated from the text editor |

Never deleted: `templates/` (blank A4, graph paper), `profiles/`, `screensaver/`, `scanner/` (see §9), anything else, any malformed path
(`..`, `\`, leading `/`), any URL pointing at another bucket. Paths are validated **before every deletion**, whatever the source.

An object is also kept while any job in `pending`, `paid`, `printing`, `pending_conversion` or `processing` (and not `fileDeleted`)
references it (`ACTIVE_REFERENCE_STATUSES`). References are read from `fileUrl`, `originalFileUrl`, `originalUrl`, `convertedStoragePath`,
`documentUrl` and every entry of `files[]`, in any URL form (`firebasestorage` token URLs, `storage.googleapis.com`, `gs://`, bare paths).

## 3. Truthful deletion markers

`cleanupJobObjects` returns one outcome per object: `deleted`, `missing` (HTTP 404), `protected`, `rejected`, `referenced`, `too_young`,
`unknown_age` or `failed`. `fileDeleted: true` is written **only** when every object is `deleted`, `missing`, `protected` or `rejected`
and at least one was actually removed. A timeout / 5xx / permission error is `failed`, never success.

Fields written on a job (all additive; nothing else is touched):

| Field | Meaning |
|---|---|
| `fileDeleted`, `fileDeletedAt` | cleanup complete (set only as above) |
| `cleanupState` | `completed`, `partial` (waiting: too young / referenced / unknown age), `failed`, `no_customer_objects` (template-only job) |
| `cleanupRemaining` | up to 50 `outcome:path` entries still outstanding |
| `cleanupError` | sanitised message of the first failure (URLs removed, 200 chars) |
| `cleanupAttempts`, `cleanupLastAttemptAt` | retry bookkeeping |
| `cleanupNextAttemptAt` | do not retry before this time (waiting jobs: when the object becomes 24 h old; failures: exponential back-off up to 6 h) |

Call sites that set `fileDeleted` and now use the shared code: `autoCleanupStorageJob` (success), `scheduledFileRetentionCleanup`, `DELETE /remove-file`.

## 4. Job sweep (`scheduledFileRetentionCleanup`, hourly)

Why the old worker found nothing: it queried five timestamp fields oldest-first with a hard cap of 5 pages x 100, skipped `fileDeleted === true`
documents **in code** and stopped. The oldest ~2,500 documents were already cleaned, so every stream was used up by documents it then ignored
and newer eligible jobs were never reached. (A `where fileDeleted == false` query cannot work either: most legacy documents do not have the field.)

New algorithm (`runJobRetentionPass`):

* walks `print_jobs` in **document-id order** with a persisted cursor (`system_state/storage_cleanup_jobs.jobCursor`). Every document is visited once per sweep, whatever its fields or timestamps; cleaned documents cost one skipped read.
* per run budgets (env, defaults): `RETENTION_PAGE_SIZE=300`, `RETENTION_MAX_DOCS_PER_RUN=1500`, `RETENTION_MAX_JOBS_PER_RUN=150`, `STORAGE_CLEANUP_TIME_BUDGET_MS=240000`.
* the cursor only moves past documents that were fully handled and is saved after every page, so a crash or an exhausted budget loses nothing; the next run resumes.
* a run **lease** (`leaseUntilMs`, 12 min) prevents overlapping runs; a crashed run's lease simply expires.
* the job document is re-read right before Storage is touched (it may have been paid or started printing meanwhile).
* the reference index is built once per run (one equality query per active status, document-id order, so **no composite index is needed**) and topped up with jobs created in the last 10 min before every page.
* if the index would exceed its safety cap (20,000 active jobs) the run deletes nothing.

Cost: at most `RETENTION_MAX_DOCS_PER_RUN` document reads + the active-job index per hour, plus one metadata read per object of jobs that actually need work.
A full sweep of today's ~6,000 jobs takes about 4 runs; growth is linear (about 1 run per 1,500 jobs).

## 5. Orphan sweep (`scheduledOrphanStorageCleanup`, hourly at :20)

Finds customer objects that never got a job (customer left before finalising, conversion failed, text PDF never submitted, ...).

* lists the approved prefixes with `bucket.getFiles({ prefix, maxResults, startOffset })`, name-ordered, checkpoint `system_state/storage_cleanup_orphans` (`prefixIndex`, `lastName`). Defaults: `ORPHAN_PAGE_SIZE=250`, `ORPHAN_MAX_OBJECTS_PER_RUN=1000`, `STORAGE_DELETE_CONCURRENCY=4`.
* age is the object's GCS `timeCreated` (an overwritten object counts from its new upload).
* keeps anything referenced by an active job (see §2); before deleting each batch it re-reads jobs created in the last 10 minutes, which closes the upload -> finalise race for practical purposes.
* a failed listing page does not move the checkpoint (the same page is retried next run); a failed delete is counted and retried on the next sweep.
* **`ORPHAN_CLEANUP_MODE` defaults to `dry-run`**: the function only logs what it would delete. Set it to `delete` to enable deletion.
* the log line always carries `scanned, eligible, deleted, missing, failed, wouldDelete, skipped{...}, pages, listErrors`; no file names or URLs are logged.

Objects that belong to *finished* jobs are removed here too; the job sweep later sees them as `missing` and records `fileDeleted`.

## 6. Upload and conversion paths

* `POST /finalize-upload`: refuses (HTTP 400, "no longer stored ... upload it again") a file whose object no longer exists, so a stale browser tab cannot create a payable job around a deleted file. Only a definite "does not exist" blocks; any storage error leaves the previous behaviour.
* If a batch fails after some conversions succeeded (HTTP 422/400/500), the converted PDFs written by that request are deleted, unless an active job already uses the same path (converter output paths are deterministic: `converted/{user}/{name}.pdf`). Originals stay in place and are removed by the orphan sweep after 24 h. The HTTP responses are unchanged.
* `DELETE /remove-file`: same response codes as before. The job is always closed (`status: "cleaned"`, `removedByUser: true`); `fileDeleted` is set only if the objects were really removed, otherwise the response carries `cleanupPending: true` and the sweep finishes the job.
* A removal request that finds no job (finalise still in flight) still answers 404; the object is covered by the 24 h rules.

## 7. Not changed

Payment, Cashfree webhooks, pricing, refunds, print-code generation, the print-success verification, kiosk/Pi code, `/create-order`, `/create-manifest`, the frontend, Firestore indexes (`firebase/firestore.indexes.json` is unchanged: none are required), Firestore/Storage rules, and the Pi's local `/tmp/mimo_pre_fetch` cache.
The new state documents live in `system_state/*`; they are written only by the Admin SDK and are covered by the existing catch-all deny rule for clients.

## 8. Rollout (needs approval at each step)

1. Code review of the branch diff (sensitive files: `printJob.triggers.js`, `upload.controller.js`).
2. Merge to `main`. The push deploys only `functions:api` (the new `/finalize-upload` and `/remove-file` behaviour). The scheduled/trigger functions are **not** deployed by CI.
3. Deploy the job sweep first: `firebase deploy --only functions:scheduledFileRetentionCleanup,functions:autoCleanupStorageJob` (manual, see CI_CD.md §6). This is the first deletion-capable change: watch the `[RETENTION]` log lines for a few runs (`cleaned`, `partial`, `failed`, `skipped.paid_unprinted`). The first sweeps will process the backlog of ~3,000 stale jobs (~150 per run).
4. Deploy `scheduledOrphanStorageCleanup` **in dry-run** (no env change): `firebase deploy --only functions:scheduledOrphanStorageCleanup`. Review `[ORPHAN] mode=dry-run ... wouldDelete=N skipped={...}` over at least one full sweep (`sweepCompleted=true`) and spot-check that `skipped.referenced` covers paid jobs.
5. Only then set `ORPHAN_CLEANUP_MODE=delete` for that function and redeploy.
6. Keep monitoring: `cleanupState: "failed"` count, `failed` in both log lines, storage bucket size trend.

Rollback: redeploy the previous revision of the function(s) (CI_CD.md §6). Deleted objects cannot be recovered; consider enabling Cloud Storage soft-delete (retention window) on the bucket before step 3 if the business wants a safety net.

## 9. Known limits

* **Upload -> finalise race.** The reference check and the delete are not one atomic step. The window is closed to a few milliseconds by the recent-jobs re-check and is only reachable for objects already older than 24 h; a customer finalising a >24 h old object in exactly that moment could still lose it. `/finalize-upload` then rejects an already-deleted file, so the failure is visible, not silent.
* **Payment -> cleanup concurrency (B1).** Handled via atomic Firestore claim transactions (`claimJobForCleanup`) and checkout window protection (6 hours for pending jobs with active orders). If payment lands concurrently while GCS file deletion is in flight, the committing transaction re-verifies document status and strictly preserves `status: "paid"` (never overwriting to `"abandoned"`). Note: if external payment is confirmed after files were deleted, the paid job record is preserved with its printCode and truthful cleanup markers (`fileDeleted: true`, `status: "paid"`), which alerts operations/refund flows rather than silently abandoning the customer.
* **Paid, unprinted jobs keep their files indefinitely** (business decision; revisit before changing). They are bounded by the number of such jobs (265 at the time of the audit).
* **Sweep latency**: an object can be removed up to one sweep interval after it turns 24 h old (job sweep: about 1-4 h while the backlog drains, then well under an hour; orphan sweep: about one hour per 1,000 objects).
* **Unmanaged prefixes and scanner flow (B5)**: `scanner/` and other non-approved prefixes are not deleted. Jobs referencing them are marked `cleanupState: "unmanaged_objects"`, never receive `fileDeleted: true`, and are preserved for investigation without spamming retry loops.
* **Generation preconditions (B3)**: GCS deletions pass `ifGenerationMatch` preconditions to protect newer object generations against deterministic overwrite races (HTTP 412 is treated as `changed` rather than deletion).
* **Bucket spelling aliases (B4)**: Conservative reference discovery recognizes `.firebasestorage.app` and `.appspot.com` aliases to protect referenced objects from orphan sweeps, while actual deletion strictly requires the canonical bucket name.
* **Cloud Storage verification**: Firestore emulator tests have been verified (10 passed), but Cloud Storage SDK interactions are validated using an in-memory bucket harness. Verification against a live Cloud Storage staging bucket is recommended prior to enabling production orphan deletion.
* Pi-side prefetch cache (`/tmp/mimo_pre_fetch`) is a separate problem.
