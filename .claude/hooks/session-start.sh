#!/bin/bash
# SessionStart hook per Claude Code on the web.
# Installa le dipendenze npm cosicché lint, test e build siano pronti
# all'avvio di ogni sessione cloud.
set -euo pipefail

# Esegui solo nell'ambiente remoto (Claude Code on the web).
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# npm install (non "ci") per sfruttare la cache del container.
npm install
