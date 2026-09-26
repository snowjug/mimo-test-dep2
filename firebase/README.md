# `firebase/` — Firebase security rules and indexes

Wired into the root [`firebase.json`](../firebase.json). Nothing here is deployed by CI; a person with Firebase access deploys it.

| File | Deploy | State compared on 2026-09-26 (read-only) |
|---|---|---|
| `firestore.rules` | `firebase deploy --only firestore:rules` | **Identical** to the deployed ruleset |
| `storage.rules` | `firebase deploy --only storage` | **Identical** to the deployed ruleset — and it allows public read/write (`if true`); tightening it is a separate security task |
| `firestore.indexes.json` | `firebase deploy --only firestore:indexes` | Live has **1** composite index, this file has **5**: a deploy would only *add* 4 (`orders`, 3× `print_jobs`) — never run a bare `firebase deploy` |

`firestore.rules` and `firestore.indexes.json` were copied unchanged from `backend/` (which stays in place until the legacy backend is
removed). Always use `--only …` and add `--project mimo-v2-11868`.
