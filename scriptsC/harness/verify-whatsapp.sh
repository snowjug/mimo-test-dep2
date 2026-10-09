#!/usr/bin/env bash
# verify-whatsapp.sh - one command to validate the isolated WhatsApp Flow prototype.
#
# Usage: bash scriptsC/harness/verify-whatsapp.sh      (works from any directory)
#
# Runs, in order, printing each check's name first:
#   1. Node.js available                      (required)
#   2. Prototype directory + test files exist (required)
#   3. pdf-lib resolvable from functions/     (required; the prototype reuses functions/node_modules)
#   4. Flow JSON structural validation        (required; prototypes/whatsapp-flow-endpoint/flow/validate-flow.js)
#   5. Prototype tests: node --test test/*.test.js   (required; same command as the prototype README)
#   6. Meta Flow validation                   (SKIPPED: external, needs a Meta developer account)
#   7. Other WhatsApp tests                   (SKIPPED: no dedicated WhatsApp test suite exists)
#
# Never installs dependencies, stages, commits, deploys, or edits files. Exit 0 only if every required
# check passed; skipped checks are reported and do not count as passes.
set -uo pipefail

root="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null)" \
  || { echo "verify-whatsapp: cannot locate repository root" >&2; exit 2; }
proto="$root/prototypes/whatsapp-flow-endpoint"

passed=(); skipped=()
fail() { echo "FAIL: $1" >&2; [ -n "${2:-}" ] && echo "      $2" >&2; echo; echo "RESULT: FAIL (passed: ${#passed[@]}, skipped: ${#skipped[@]})"; exit 1; }
step() { echo; echo "=== CHECK: $1 ==="; }
skip() { echo "SKIPPED: $1 - $2"; skipped+=("$1"); }

step "Node.js available"
command -v node >/dev/null 2>&1 || fail "node not found on PATH" "install Node.js (>=18 for node:test); this script does not install anything"
echo "node $(node -v)"; passed+=("node")

step "Prototype files present"
[ -d "$proto" ] || fail "missing $proto"
compgen -G "$proto/test/*.test.js" >/dev/null || fail "no test files in $proto/test"
echo "found $(ls "$proto"/test/*.test.js | wc -l | tr -d ' ') test file(s)"; passed+=("files")

step "Dependency pdf-lib resolvable from functions/"
( cd "$root/functions" && node -e "require.resolve('pdf-lib')" ) >/dev/null 2>&1 \
  || fail "pdf-lib not found under functions/node_modules" "run 'npm ci' in functions/ yourself; this script will not install"
echo "pdf-lib resolvable"; passed+=("deps")

step "Flow JSON structural validation (local only)"
flow_file="$proto/flow/mimo-print.flow.json"
[ -f "$flow_file" ] || fail "missing $flow_file"
node "$proto/flow/validate-flow.js" "$flow_file" || fail "Flow JSON failed local structural validation"
passed+=("flow-json-structure")

step "Prototype tests (node --test test/*.test.js)"
( cd "$proto" && node --test test/*.test.js )
rc=$?
[ "$rc" -eq 0 ] || fail "prototype tests failed (exit $rc)"
passed+=("prototype-tests")

step "Meta Flow validation (external)"
skip "meta-flow-validation" "needs a Meta developer account (Flow Builder / Flows API); local validation above does NOT prove Meta accepts the Flow"

step "Other WhatsApp tests"
skip "other-whatsapp-tests" "no dedicated WhatsApp test suite is established (functions/__tests__ has no whatsapp-named tests)"

echo
echo "SUMMARY"
echo "  PASS:    ${passed[*]}"
echo "  SKIPPED: ${skipped[*]}"
echo "RESULT: PASS (skipped checks were NOT run)"
