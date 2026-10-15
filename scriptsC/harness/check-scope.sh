#!/usr/bin/env bash
# check-scope.sh - read-only check that every change in the working tree is inside an approved allowlist.
#
# Usage:
#   bash scriptsC/harness/check-scope.sh --allowlist FILE [--repo DIR]
#   MIMO_SCOPE_ALLOWLIST=FILE bash scriptsC/harness/check-scope.sh
#
# Allowlist file (UTF-8 text, one entry per line):
#   - Blank lines and lines starting with '#' are ignored. Trailing CR is stripped.
#   - Paths are relative to the repository root, using '/'.
#   - An entry ending in '/' approves every path under that directory.
#   - Any other entry approves exactly that one path.
#   - No wildcards. Entries that are absolute, contain '..', '*', '?', '[', or start with '!' make the
#     allowlist INVALID. A file with no entries is INVALID (an empty list never means "everything is fine").
#   - Nothing is ever added to the allowlist automatically; the file is only read.
#
# Checked: staged and unstaged tracked changes, deletions, renames (BOTH old and new path must be approved)
# and untracked files (individual files, not collapsed directories).
#
# Exit codes: 0 all changes in scope | 1 out-of-scope change found | 2 usage or allowlist error.
# This script only runs read-only git commands. It never stages, deletes, resets, or stashes.
set -uo pipefail

die() { echo "check-scope: $*" >&2; exit 2; }

allow_file="${MIMO_SCOPE_ALLOWLIST:-}"
repo=""
while [ $# -gt 0 ]; do
  case "$1" in
    --allowlist) [ $# -ge 2 ] || die "--allowlist needs a value"; allow_file="$2"; shift 2 ;;
    --repo)      [ $# -ge 2 ] || die "--repo needs a value"; repo="$2"; shift 2 ;;
    -h|--help)   sed -n '2,22p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

[ -n "$allow_file" ] || die "no allowlist given (use --allowlist FILE or MIMO_SCOPE_ALLOWLIST)"
[ -f "$allow_file" ] || die "allowlist not found: $allow_file"
[ -r "$allow_file" ] || die "allowlist not readable: $allow_file"

if [ -n "$repo" ]; then
  root="$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null)" || die "not a git repository: $repo"
else
  root="$(git rev-parse --show-toplevel 2>/dev/null)" || die "not inside a git repository (use --repo DIR)"
fi

# Parse allowlist
entries=()
lineno=0
while IFS= read -r line || [ -n "$line" ]; do
  lineno=$((lineno + 1))
  line="${line%$'\r'}"
  trimmed="${line#"${line%%[![:space:]]*}"}"
  trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"
  case "$trimmed" in ''|'#'*) continue ;; esac
  case "$trimmed" in
    /*|[A-Za-z]:*) die "invalid allowlist line $lineno: absolute path not allowed: $trimmed" ;;
    '!'*)          die "invalid allowlist line $lineno: negation not supported: $trimmed" ;;
    *'*'*|*'?'*|*'['*) die "invalid allowlist line $lineno: wildcards not supported: $trimmed" ;;
  esac
  case "/$trimmed/" in */../*) die "invalid allowlist line $lineno: '..' not allowed: $trimmed" ;; esac
  entries+=("$trimmed")
done < "$allow_file"
[ "${#entries[@]}" -gt 0 ] || die "invalid allowlist: no entries in $allow_file"

in_scope() {
  local p="$1" e
  for e in "${entries[@]}"; do
    case "$e" in
      */) case "$p" in "$e"*) return 0 ;; esac ;;
      *)  [ "$p" = "$e" ] && return 0 ;;
    esac
  done
  return 1
}

ok=(); bad=()
record() { # label path
  if in_scope "$2"; then ok+=("$1  $2"); else bad+=("$1  $2"); fi
}

# porcelain v1 -z: "XY path\0" ; for renames/copies "XY new\0old\0"
while IFS= read -r -d '' rec; do
  xy="${rec:0:2}"; path="${rec:3}"
  x="${xy:0:1}"; y="${xy:1:1}"
  if [ "$xy" = '??' ]; then record "untracked" "$path"; continue; fi
  if [ "$x" = R ] || [ "$x" = C ]; then
    IFS= read -r -d '' old || old=""
    record "staged-rename(new)" "$path"
    record "staged-rename(old)" "$old"
    [ "$y" != ' ' ] && record "unstaged-$y" "$path"
    continue
  fi
  if [ "$y" = R ] || [ "$y" = C ]; then
    IFS= read -r -d '' old || old=""
    record "unstaged-rename(new)" "$path"
    record "unstaged-rename(old)" "$old"
    continue
  fi
  [ "$x" != ' ' ] && record "staged-$x" "$path"
  [ "$y" != ' ' ] && record "unstaged-$y" "$path"
done < <(git -C "$root" status --porcelain=v1 -z --untracked-files=all)

echo "Repository: $root"
echo "Allowlist:  $allow_file (${#entries[@]} entries)"
echo "In scope (${#ok[@]}):"
for l in "${ok[@]+"${ok[@]}"}"; do echo "  OK   $l"; done
echo "OUT OF SCOPE (${#bad[@]}):"
for l in "${bad[@]+"${bad[@]}"}"; do echo "  BAD  $l"; done

if [ "${#bad[@]}" -gt 0 ]; then
  echo "RESULT: FAIL - ${#bad[@]} change(s) outside the approved scope"; exit 1
fi
echo "RESULT: PASS - no out-of-scope changes"
exit 0
