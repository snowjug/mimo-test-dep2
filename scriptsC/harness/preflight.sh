#!/usr/bin/env bash
# preflight.sh - read-only snapshot of repository state for the MIMO implementation harness.
#
# Usage: bash scriptsC/harness/preflight.sh
#
# Prints: repo root, branch, HEAD, `git status --short --branch`, staged/unstaged summaries (names and
# line counts only), and the PATHS of untracked files. It never prints file contents or diffs, never
# reads untracked files, and never changes the repository (no stage, stash, reset, clean, or edits).
# Untracked names that look sensitive (env files, keys, credentials, logs) are flagged by NAME only.
# For a full diff, run `git diff` / `git diff --cached` yourself on reviewed paths.
set -euo pipefail

if [ -t 1 ]; then B=$'\033[1;35m'; N=$'\033[0m'; else B=""; N=""; fi
heading() { printf '\n%s=== %s ===%s\n' "$B" "$*" "$N"; }

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

MAX_UNTRACKED=200

heading "MIMO Implementation Harness - Preflight"
echo "Root:   $ROOT"
echo "Branch: $(git branch --show-current)"
echo "HEAD:   $(git log -1 --oneline)"

heading "Git status (short, branch)"
git status --short --branch

heading "Staged tracked changes (summary only)"
if git diff --cached --quiet; then echo "None."; else git diff --cached --stat; fi

heading "Unstaged tracked changes (summary only)"
if git diff --quiet; then echo "None."; else git diff --stat; fi

heading "Untracked files (paths only; contents are never read)"
total=0; shown=0; flagged=()
while IFS= read -r -d '' f; do
  total=$((total + 1))
  base="${f##*/}"; lower="$(printf '%s' "$base" | tr '[:upper:]' '[:lower:]')"
  mark=""
  case "$lower" in
    .env|.env.*|*.env|*.pem|*.key|*.p12|*.pfx|id_rsa*|id_ed25519*|*serviceaccount*|*credential*|*secret*|*token*|*.log|*.err)
      mark="  [SENSITIVE-LOOKING NAME]"; flagged+=("$f") ;;
  esac
  if [ "$shown" -lt "$MAX_UNTRACKED" ]; then printf '  %s%s\n' "$f" "$mark"; shown=$((shown + 1)); fi
done < <(git ls-files --others --exclude-standard -z)
if [ "$total" -eq 0 ]; then echo "None."; fi
[ "$total" -gt "$shown" ] && echo "  ... $((total - shown)) more not shown (total $total)"
echo "Total untracked: $total"
if [ "${#flagged[@]}" -gt 0 ]; then
  echo "Flagged by name only (not read): ${#flagged[@]} file(s). Do not stage these without review."
fi

echo
echo "Preflight completed. No files were modified and no file contents were printed."
