## What and why
<!-- One or two sentences. Link the issue or task. -->

## Area touched
- [ ] Docs / README only
- [ ] Admin or Finance dashboard UI
- [ ] Customer site or kiosk UI
- [ ] Backend (`functions/`) — which module: ______
- [ ] **Protected (Tier 2):** payments, refunds, job state, auth, triggers, `firebase/`, `.github/`, Pi listeners — see `docs/contributing.md`
- [ ] Tooling / CI

## Checklist
- [ ] I ran the tests for what I touched (`cd functions && npm test`, or the app's `npm run build`) and they pass
- [ ] New or changed behaviour has a test (money and refund changes: a **characterization test updated on purpose**, explained below)
- [ ] I did **not** rename or remove: exported function names, URLs, env-variable names, kiosk request/response shapes, Firestore fields the Pis read
- [ ] If the API surface changed on purpose I regenerated `functions/__tests__/fixtures/route-table.json` and explained why
- [ ] No secrets, keys, passwords, tokens or private addresses in code, docs, tests or screenshots
- [ ] Docs updated where behaviour changed (anything I could not verify is labelled *unverified*)
- [ ] I did not merge this myself (a merge touching `functions/**` deploys production)

## How I tested it
<!-- Commands run, screenshots for UI, what you saw. -->

## Risk and rollback
<!-- What could break? How do we undo it? (Usually: revert the commit; backend can also be rolled back from the Actions tab.) -->

## Protected-code changes only
<!-- Which KNOWN RISK / characterization test changed and why the new behaviour is intended. -->
