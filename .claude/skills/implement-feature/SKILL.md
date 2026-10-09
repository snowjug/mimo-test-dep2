---
name: implement-feature
description: Implement a scoped MIMO feature with explicit acceptance criteria, regression protection, and incremental testing.
---

# Implement Feature

## Objective

Implement one well-defined feature without expanding the task
into unrelated refactoring.

## Procedure

### 1. Establish the baseline

- Inspect the current branch and Git status.
- Identify pre-existing tracked and untracked changes.
- Preserve all pre-existing untracked files.
- Do not overwrite files merely because they are untracked.

### 2. Understand the system

- Read the relevant source files.
- Trace the current execution path.
- Identify shared dependencies and side effects.
- Reuse existing interfaces where appropriate.

### 3. Define the implementation

Before editing, state:

- The desired behavior.
- The expected files to change.
- The tests required.
- The regression risks.
- The acceptance criteria.

If the task requires changes outside the approved scope,
stop and explain why.

### 4. Implement incrementally

- Make the smallest coherent change.
- Add or update focused tests.
- Avoid unrelated formatting or refactoring.
- Keep test-only behavior isolated.

### 5. Verify

- Run focused tests.
- Run relevant regression tests.
- Inspect the final diff.
- Check for accidental secrets and unrelated changes.
- Verify the intended production boundaries remain untouched.

### 6. Report

Provide:

- What changed.
- Files changed.
- Tests executed and results.
- Known limitations.
- Remaining work.
- Whether any production behavior or configuration changed.

Do not commit, push, merge, or deploy unless the user explicitly
authorizes that stage.