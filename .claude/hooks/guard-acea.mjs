// .claude/hooks/guard-acea.mjs
// PreToolUse guard: l'automazione di ASSEGNAZIONE ACEA è blindata.
// Qualsiasi Edit/Write/MultiEdit/NotebookEdit su questi file forza una richiesta di CONFERMA
// all'utente (permissionDecision "ask"): task in background, auto-accept e refactoring NON possono
// modificarli per sbaglio. Una modifica passa solo se l'utente conferma esplicitamente.
import { readFileSync } from 'node:fs';

const PROTETTI = [
  'tools/limitazioni-sync/lib/acea/assegnaInterventi.mjs',
  'tools/limitazioni-sync/lib/acea/eseguiGiroAceaAssegna.mjs',
  'tools/limitazioni-sync/lib/acea/driver.mjs',
  'tools/limitazioni-sync/lib/acea/risolviNomeOperatore.mjs',
  'tools/limitazioni-sync/lib/acea/leggiMasterAcea.mjs',
  'tools/limitazioni-sync/assegna-odl.mjs',
  'app/api/agente/acea-assegnazioni/route.ts',
];

let raw = '';
try { raw = readFileSync(0, 'utf8'); } catch { /* niente stdin */ }

let fp = '';
try { fp = JSON.parse(raw)?.tool_input?.file_path ?? ''; } catch { /* non JSON */ }

const norm = String(fp).replace(/\\/g, '/');
const colpito = PROTETTI.find((p) => norm.endsWith(p) || norm.includes('/' + p));

if (colpito) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason:
        `🔒 Automazione ASSEGNAZIONE ACEA protetta: ${colpito}. ` +
        `Modificabile SOLO su richiesta esplicita dell'utente e con la sua conferma. ` +
        `Confermi questa modifica?`,
    },
  }));
}
process.exit(0);
