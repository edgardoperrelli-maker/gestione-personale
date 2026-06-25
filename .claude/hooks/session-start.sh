#!/bin/bash
# SessionStart hook per Claude Code on the web.
# Installa le dipendenze npm cosicché lint, test e build siano pronti
# all'avvio di ogni sessione cloud, e imposta le variabili Supabase pubbliche.
set -euo pipefail

# Esegui solo nell'ambiente remoto (Claude Code on the web).
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Variabili Supabase PUBBLICHE (progetto "Calendario personale").
# Sicure da committare: l'anon key è pensata per essere esposta nel browser.
# NON aggiungere qui segreti (service-role key, SMTP, ecc.).
if [ -n "${CLAUDE_ENV_FILE:-}" ] && ! grep -q "NEXT_PUBLIC_SUPABASE_URL" "$CLAUDE_ENV_FILE" 2>/dev/null; then
  {
    echo "export NEXT_PUBLIC_SUPABASE_URL=\"https://aceztqfebringeaebvce.supabase.co\""
    echo "export NEXT_PUBLIC_SUPABASE_ANON_KEY=\"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjZXp0cWZlYnJpbmdlYWVidmNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0Mjg0MzMsImV4cCI6MjA3NjAwNDQzM30.KOWKvFY0tNrWJuzUxz5EYUttPX4MWwO7Tu-9tMLAUCo\""
  } >> "$CLAUDE_ENV_FILE"
fi

# npm install (non "ci") per sfruttare la cache del container.
npm install
