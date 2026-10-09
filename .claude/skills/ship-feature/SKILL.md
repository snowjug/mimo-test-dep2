---
name: ship-feature
description: Prepare a feature branch for review and shipping using explicit test, diff, and Git safety gates.
---

# Ship Feature

## Important

Preparing a feature for shipping does not authorize production deployment.

## Phase 1: Preflight

- Confirm the current branch.
- Inspect Git status.
- Identify pre-existing untracked files.
- Confirm the target branch.
- Confirm the intended files and behavior.

## Phase 2: Verify

- Run the project's focused tests.
- Run the required regression tests.
- Run the scope checker: `bash scriptsC/harness/check-scope.sh --allowlist <approved-paths-file>`.
- Run `bash scriptsC/harness/verify-whatsapp.sh` for WhatsApp work.
- Inspect the complete diff.
- Confirm there are no secrets or unrelated changes.

## Phase 3: Stop Conditions

Stop if:

- Required tests fail.
- The working tree contains unexpected changes.
- The diff exceeds the approved scope.
- Website production behavior may have changed unexpectedly.
- Test mode can trigger production side effects.
- Required credentials or environment configuration are missing.

Do not bypass a failed check.

## Phase 4: Git

Only proceed with explicit user authorization for the relevant action.

- Stage specific reviewed files.
- Commit the focused change.
- Push the feature branch.
- Create or update the pull request.
- Merge only after the required checks pass and the diff is approved.

Never force-push or push directly to main.

Never deploy to production without separate explicit authorization.

## Final Report

Report the exact branch, commit, PR, merge status, tests, and deployment
status. Distinguish completed actions from recommendations.