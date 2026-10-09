# MIMO Engineering Instructions

## Project

MIMO is a printing platform with an existing website, backend,
payment integration, WhatsApp integration, and kiosk printing pipeline.

Current development objective:
Build a native, interactive WhatsApp Flow UI for internal team testing.

The WhatsApp Flow is another client of MIMO. It must not become
an independent production printing or payment system.

## Engineering Principles

- Understand existing code before modifying it.
- Prefer small, incremental changes over broad rewrites.
- Reuse existing services when their contracts are appropriate.
- Preserve existing website behavior.
- Do not invent APIs, pricing rules, or routing behavior.
- Do not claim a test passed unless it was actually executed.
- Do not claim live Meta integration works based only on local tests.
- Document important assumptions and implementation decisions.

## Repository Safety

- Preserve pre-existing untracked files.
- Never run destructive Git cleanup commands.
- Never stage unrelated changes.
- Never force-push.
- Never commit secrets, credentials, private keys, or environment files.
- Never deploy to production without explicit authorization.
- Never merge when required checks fail.
- Inspect the complete diff before staging, committing, pushing, or merging.

## Website Isolation

The existing website's production behavior must remain unchanged.

Do not modify website checkout, production pricing, payment behavior,
or the established printing pipeline merely to implement the WhatsApp UI.

If a change to shared code becomes necessary, stop and document:
1. Why the change is needed.
2. Which existing callers it affects.
3. How website behavior will be protected.
4. Which regression tests are required.

Do not silently expand the implementation scope.

## WhatsApp Product Requirements

- Use a native WhatsApp Flow for the interactive UI.
- Do not replace the Flow with an ordinary conversational chatbot.
- Do not introduce a printer-selection screen.
- B&W follows the existing backend routing policy.
- Color orders explicitly target SV-002 in a future real-order integration.
- Color routing must require SV-002 to be ACTIVE and color-capable.
- Never silently route color jobs to a B&W-only kiosk.

Exact color notice:

🎨 Color printing is available only at MIMO 2.0. Your job will be routed automatically to MIMO 2.0.

## Test Isolation

Internal UI testing must not:
- Charge customers.
- Create unintended production orders.
- Dispatch print jobs.
- Contact production kiosks.
- Mark payments as verified without genuine verification.

Synthetic test documents and test credentials must remain isolated
from production resources.

## File Safety

Printing is permitted only when payment is verified and all expected
files have been successfully downloaded and validated.

The invariant is:

expectedFiles == downloadedFiles

If this invariant is not satisfied, the system must not print.

## Standard Implementation Workflow

For each task:

1. Inspect Git status and the current branch.
2. Read relevant code and identify the existing behavior.
3. Define the smallest reasonable implementation scope.
4. Record acceptance criteria and regression risks.
5. Implement incrementally.
6. Run focused tests.
7. Run the relevant regression suite.
8. Inspect the complete diff.
9. Report tests, changed files, remaining risks, and deployment status.

Do not combine unrelated tasks into one change.

## Git Workflow

- Work on the designated feature branch.
- Never push directly to main.
- Do not stage unrelated files.
- Use a focused commit.
- Push the feature branch and create a pull request.
- Merge only after the required checks pass and the diff is reviewed.
- Never deploy merely because code has been merged.

## Reporting

Every implementation report must include:

- Objective
- Files added or modified
- Implementation summary
- Tests actually executed and their results
- Regression checks
- Known limitations
- Git status
- Deployment status