# Handoff — 2026-07-20 (sera): modulo "Azioni operatori" sostituisce i Template rapportini

**Generated**: 2026-07-20 ~17:00 · **Branch**: `feat/azioni-operatori` (worktree, base = origin/main `736fb4e`) · **Status**: implementazione COMPLETA, PR aperta (2 task ATLAS). ⚠️ Un solo passo mancante: **applicare la migration al prod PRIMA del merge** (vedi "Not Yet Done").

## Goal

I due task ATLAS "FLUSSO SOSTITUTIVO DEI TEMPLATE" + "RIMOZIONE TEMPLATE": le azioni che gli
operatori eseguono sono collegate direttamente al **Gruppo attività** (motore tassonomia,
handoff precedente); il modulo Template rapportini è eliminato e sostituito dal nuovo modulo
**Impostazioni → Azioni operatori** con la gerarchia del flowchart ATLAS:
COMMITTENTE (Italgas, Acea, Acqualatina) → GRUPPO ATTIVITA' → FLUSSO (già presente).
I flussi runtime NON cambiano: "occorre solo renderli modificabili nel nuovo modulo".

## Completed

- [x] **DB**: colonne `gruppo_committente` (check acea|italgas|acqualatina) + `gruppi_attivita text[]`
  su `rapportino_template`, check coppia coerente, seed idempotente per nome dei collegamenti dei
  flussi esistenti (migration `20260720190000_template_gruppo_attivita.sql`). Un flusso può coprire
  più gruppi: Ibrido acea = LIMITAZIONI MASSIVE + DUNNING; ITALGAS = ATTIVITA' ALLA CLIENTELA +
  BONIFICHE. NON tocca `committente`/`is_default`/`solo_manuale` (instradamento runtime intatto).
- [x] **Logica pura** `lib/rapportini/flussiGruppo.ts` (testata, 12 test): `buildAlberoFlussi`
  (committenti fissi del flowchart; gruppi = tassonomia attiva ∪ foglia extra
  acqualatina/SOSTITUZIONE MISURATORI ∪ gruppi referenziati dai collegamenti, match su chiave
  normalizzata `chiaveTassonomia`; manuali per committente con equivalenza lim_massive→acea;
  non collegati) + `normalizzaCollegamento` (coppia coerente col check DB, dedup normalizzato).
- [x] **API** `/api/admin/rapportino-template`: GET/POST/PATCH portano `gruppo_committente` +
  `gruppi_attivita` (zod esteso in `templateSchema.ts`; il PATCH normalizza la coppia — il client
  manda sempre entrambe).
- [x] **Nuovo modulo** `app/impostazioni/azioni-operatori/`: navigazione a livelli (card
  committente con conteggi → gruppi con flussi collegati → editor), sezione "Interventi manuali (+)"
  per committente, "Flussi non collegati" in home, "+ Flusso" per creare un flusso già collegato al
  gruppo, "+ Modello manuale". Editor = quello storico (auto-save 800ms, lock ottimistico 409,
  anteprime, scope foto risanamento) + sezione "Collegamento al gruppo attività" (select committente
  + chips multi-gruppo). `soloManuale` è un checkbox esplicito (niente più schede).
- [x] **Rimozione Template rapportini**: client/schede eliminati; `template-rapportini/page.tsx` →
  `redirect('/impostazioni/azioni-operatori')`; card Impostazioni sostituita ("Azioni operatori");
  `templateScheda.ts` snellito a `erroreCommittenteManuale` (schede orfane rimosse coi loro test).
- [x] **Verifica**: vitest 244 file / 1870 test verdi; `tsc --noEmit` pulito; eslint pulito sui file
  toccati; `next build` ok (nel worktree serve `.env.local` copiato a mano: è gitignorato).
- [x] ROADMAP.md aggiornata (task nei "Fatto", follow-up fase 2 nei "Da fare").

## Not Yet Done

- [ ] ⚠️ **Migration NON applicata al prod**: `apply_migration` bloccata dal classifier in questa
  sessione (serve ok esplicito per-azione). SENZA la migration, dopo il deploy la GET template
  fallisce (seleziona le colonne nuove) e si rompe anche il dropdown "Modello" della mappa.
  **Applicarla PRIMA del merge**: contenuto = `supabase/migrations/20260720190000_template_gruppo_attivita.sql`
  (additiva + idempotente, il codice in prod attuale la ignora → si può applicare subito senza rischi).
- [ ] Verifica visiva completa del modulo post-migration (senza colonne il dev locale mostra
  l'albero dalla tassonomia ma senza flussi). La navigazione/il layout sono da smoke-testare su
  preview Vercel della PR dopo la migration.
- [ ] Il gruppo italgas **BONIFICHE** è seedato sul flusso ITALGAS (ibrido) e **AGENDA AEREA** resta
  senza flusso: se l'ufficio non è d'accordo, si cambia dalla UI (sezione Collegamento).
- [ ] Follow-up fase 2 (ROADMAP): pianificazione risolve il modello dal `gruppo_attivita` degli
  interventi invece della select manuale.

## Failed Approaches (Don't Repeat These)

- **`apply_migration` E `execute_sql` per DDL/UPDATE prod**: il classifier può bloccarli entrambi;
  non aggirare — chiedere l'ok esplicito all'utente e riprovare con quello.
- **Riusare il committente template per la gerarchia**: NO — `committente` instrada il runtime
  (modale "+", risolviTemplateCommittente) e non ha 'acqualatina' nel check; la gerarchia del
  flowchart è una dimensione NUOVA (`gruppo_committente`), acqualatina esiste solo lì.
- **Inserire SOSTITUZIONE MISURATORI in tassonomia**: NO — `attivita_tassonomia.committente` ha
  check acea|italgas|altro e il flusso risanamento non importa attività; è una foglia "extra"
  hardcoded in `GRUPPI_EXTRA` (flussiGruppo.ts).

## Key Decisions

| Decision | Rationale |
|---|---|
| Collegamento = 2 colonne su `rapportino_template` (niente tabella ponte) | 10 template, N:M coperto da `text[]`; una join table è overkill |
| `gruppi_attivita text[]` (un flusso → più gruppi) | Ibrido acea copre LIMITAZIONI MASSIVE + DUNNING; ITALGAS copre clientela + bonifiche |
| Gruppi data-driven dalla tassonomia (no hardcode) | 1 INSERT in tassonomia = nuovo gruppo visibile nel modulo, coerente col motore |
| Flussi runtime intatti | Il task lo dice esplicitamente; la select "Modello" in mappa resta (fase 2 in ROADMAP) |
| Route vecchia in redirect (non 404) | Bookmark dell'ufficio; il modulo è comunque eliminato |
| Match gruppi su `chiaveTassonomia` | Robusto a maiuscole/accenti/spazi (stessa chiave del motore tassonomia) |

## Current State

**Working**: branch `feat/azioni-operatori` (worktree `.claude/worktrees/azioni-operatori`), tutto
implementato e verde (test/tsc/lint/build). Il repo principale è rimasto su `main` (l'agente
lim-sync gira da lì). Migration in attesa di ok → poi merge PR → deploy Vercel.

**Contesto precedente ancora vivo** (handoff motore tassonomia, `736fb4e`): guard runbook
`tools/limitazioni-sync/guard-limitazioni-non-esportate.sql` dopo ogni import ACEA (attese:
G1=0, G2=11 note italgas, G3=0); non disattivare la voce acea "LIMITAZIONI MASSIVE" (l'export
si àncora al literal); giro agente serale da controllare in `/hub/agente`. Le modifiche
uncommitted su `tools/limitazioni-sync/` nel repo principale sono di un filone concorrente
("commessa rinominata") — NON toccarle.

## Files to Know

| File | Perché |
|---|---|
| `lib/rapportini/flussiGruppo.ts` | Albero flowchart + normalizzaCollegamento (PURO, testato) |
| `app/impostazioni/azioni-operatori/AzioniOperatoriClient.tsx` | Navigazione + editor (erede del vecchio TemplateRapportiniClient) |
| `app/impostazioni/azioni-operatori/page.tsx` | Server: template + tassonomia (range 0-4999, no cap 1000) |
| `app/api/admin/rapportino-template/route.ts` | API estesa col collegamento (lock ottimistico invariato) |
| `supabase/migrations/20260720190000_template_gruppo_attivita.sql` | Colonne + check + seed — ⚠️ DA APPLICARE AL PROD |
| `lib/rapportini/templateScheda.ts` | Ridotto a erroreCommittenteManuale |
| `docs/superpowers/plans/2026-07-20-azioni-operatori.md` | Piano/decisioni di questa sessione |

## Resume Instructions

1. **Applicare la migration al prod** (con ok utente): `apply_migration` con il contenuto del file
   `20260720190000...` — poi verificare il seed: `select nome, gruppo_committente, gruppi_attivita
   from rapportino_template order by nome;` (attesi 7 collegati, 3 non collegati: IBRIDO
   ITALGAS/ACEA + i 2 manuali).
2. **Merge PR** (serve ok esplicito per-azione, classifier) → deploy Vercel automatico.
3. Smoke test su prod: Impostazioni → Azioni operatori (3 card committente; Acea → 2 gruppi con
   flussi; Italgas → clientela/bonifiche/extra/P.I.+AGENDA AEREA vuoto; Acqualatina → RESINE);
   la vecchia route `/impostazioni/template-rapportini` deve reindirizzare; il dropdown "Modello"
   della mappa deve continuare a popolare.
4. Dopo il merge: `git pull` nel repo principale (l'agente lim-sync gira da lì — prassi standard).

## Warnings

- Repo PUBBLICO: niente dati prod (matricole/ODL/nomi) in PR/commit. Le colonne nuove e i nomi
  template/gruppi NON sono dati sensibili (sono configurazione).
- Il worktree ha `.env.local` copiato a mano (gitignorato): se si ricrea il worktree, ricopiarlo.
- L'auto-save dell'editor salva anche il collegamento: cambi di gruppo si propagano all'albero a
  sinistra dopo ~1s (reload della lista) — comportamento voluto.
