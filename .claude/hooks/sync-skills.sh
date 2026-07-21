#!/usr/bin/env bash
# Sync personal Claude Code skills from the central claude-skills repo into
# ~/.claude/skills, so they're available in every Claude Code on the web session
# of this project — not just this repo's own .claude/skills.
#
# Runs ONLY in the remote (web) environment. Locally, ~/.claude/skills is
# persistent, so you manage it yourself once (see the claude-skills README).
#
# Single source of truth: edit skills in the claude-skills repo. Every project
# with this hook picks up the change on its next session. No per-repo copies.
set -euo pipefail

# Web sessions only. Local sessions keep their own persistent ~/.claude/skills.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

# Overridable for testing; defaults are the production source/destination.
DEFAULT_BASE="https://raw.githubusercontent.com/edgardoperrelli-maker/claude-skills/main"
BASE="${CLAUDE_SKILLS_BASE:-$DEFAULT_BASE}"
DEST="${CLAUDE_SKILLS_DEST:-$HOME/.claude/skills}"

# Primary transport: ONE shallow git clone of the skills repo. github.com is
# reachable in every web session (sessions clone their own project from it),
# and a single clone replaces 100+ raw.githubusercontent requests — which
# matters since the impeccable skill pushed the manifest past 100 files and
# raw fetches rate-limit (HTTP 429) under bursty access. Per-file raw curl
# stays as the fallback transport. The clone URL is derived only for the
# production BASE; override with CLAUDE_SKILLS_GIT, or set it empty ("") to
# force the curl path.
GIT_DEFAULT=""
[ "$BASE" = "$DEFAULT_BASE" ] && command -v git >/dev/null 2>&1 \
  && GIT_DEFAULT="https://github.com/edgardoperrelli-maker/claude-skills.git"
GIT_URL="${CLAUDE_SKILLS_GIT-$GIT_DEFAULT}"

# Parallel downloads for the curl fallback path.
JOBS="${CLAUDE_SKILLS_JOBS:-6}"

# --retry backs off and retries on 429/5xx/connection errors.
fetch() { curl -fsSL --retry 4 --retry-delay 2 --retry-connrefused "$@"; }

clone_dir=""
cleanup() { if [ -n "$clone_dir" ]; then rm -rf "$clone_dir"; fi; }
trap cleanup EXIT

# Try the clone. Any failure (blocked network, no git, missing manifest) just
# clears clone_dir so the curl path takes over.
if [ -n "$GIT_URL" ]; then
  clone_dir="$(mktemp -d "${TMPDIR:-/tmp}/skills-sync.XXXXXX")"
  if ! git clone --quiet --depth 1 --single-branch "$GIT_URL" "$clone_dir" 2>/dev/null \
     || [ ! -f "$clone_dir/manifest.txt" ]; then
    rm -rf "$clone_dir"
    clone_dir=""
  fi
fi

# manifest.txt lists one skill file per line, path relative to skills/ in the
# repo. It is also the off switch: comment a line out to stop syncing it.
if [ -n "$clone_dir" ]; then
  manifest="$(cat "$clone_dir/manifest.txt")"
  mode="git"
else
  manifest="$(fetch "$BASE/manifest.txt" 2>/dev/null)" || {
    echo "skills-sync: manifest unreachable at $BASE, skipping" >&2
    exit 0
  }
  mode="raw"
fi

mkdir -p "$DEST"

# Fetch one manifest entry over raw HTTP (curl fallback path). Prints "ok" on
# success so the parent can count. Downloads to a temp file first so a failed
# or partial fetch never clobbers a previously synced copy. Always returns 0:
# one bad file must not kill the run.
fetch_one() {
  local rel="${1%$'\r'}"                 # strip CR for CRLF safety
  [ -z "$rel" ] && return 0
  case "$rel" in \#*) return 0 ;; esac   # skip comment lines
  local target="$DEST/$rel" tmp
  mkdir -p "$(dirname "$target")"
  tmp="$target.tmp.$$"
  if fetch "$BASE/skills/$rel" -o "$tmp" 2>/dev/null; then
    mv -f "$tmp" "$target"
    echo ok
  else
    rm -f "$tmp"
    echo "skills-sync: failed to fetch $rel" >&2
  fi
  return 0
}
export -f fetch fetch_one
export BASE DEST

if [ "$mode" = "git" ]; then
  # Local copies out of the clone: fast, no rate limits, serial is fine.
  count=0
  while IFS= read -r rel || [ -n "$rel" ]; do
    rel="${rel%$'\r'}"
    [ -z "$rel" ] && continue
    case "$rel" in \#*) continue ;; esac
    src="$clone_dir/skills/$rel"
    if [ ! -f "$src" ]; then
      echo "skills-sync: $rel listed in manifest but missing from repo" >&2
      continue
    fi
    target="$DEST/$rel"
    mkdir -p "$(dirname "$target")"
    cp -f "$src" "$target"
    count=$((count + 1))
  done <<EOF
$manifest
EOF
else
  count="$(printf '%s\n' "$manifest" \
    | xargs -r -P "$JOBS" -I{} bash -c 'fetch_one "$1"' _ {} \
    | grep -c ok)" || count=0
fi

echo "skills-sync: synced $count skill file(s) into $DEST ($mode)" >&2
exit 0
