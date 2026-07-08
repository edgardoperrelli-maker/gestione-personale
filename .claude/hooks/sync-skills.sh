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
BASE="${CLAUDE_SKILLS_BASE:-https://raw.githubusercontent.com/edgardoperrelli-maker/claude-skills/main}"
DEST="${CLAUDE_SKILLS_DEST:-$HOME/.claude/skills}"

# raw.githubusercontent.com rate-limits (HTTP 429) under bursty access; --retry
# backs off and retries on 429/5xx/connection errors so a session start is resilient.
fetch() { curl -fsSL --retry 4 --retry-delay 2 --retry-connrefused "$@"; }

# manifest.txt lists one skill file per line, path relative to skills/ in the repo.
manifest="$(fetch "$BASE/manifest.txt" 2>/dev/null)" || {
  echo "skills-sync: manifest unreachable at $BASE, skipping" >&2
  exit 0
}

mkdir -p "$DEST"
count=0
while IFS= read -r rel || [ -n "$rel" ]; do
  rel="${rel%$'\r'}"                     # strip CR for CRLF safety
  [ -z "$rel" ] && continue
  case "$rel" in \#*) continue ;; esac   # skip comment lines
  target="$DEST/$rel"
  mkdir -p "$(dirname "$target")"
  if fetch "$BASE/skills/$rel" -o "$target" 2>/dev/null; then
    count=$((count + 1))
  else
    echo "skills-sync: failed to fetch $rel" >&2
  fi
done <<EOF
$manifest
EOF

echo "skills-sync: synced $count skill file(s) into $DEST" >&2
exit 0
