# Piano — Azioni operatori (flusso sostitutivo dei template) — 2026-07-20

Task ATLAS: `4c616de3-de4e-49a3-aef8-4ccdec0b4eac` (flusso sostitutivo) + `e81c9fd4-f555-495d-9b76-27b61d2ca363` (rimozione template). Una PR unica: il flowchart è il disegno, la rimozione è l'implementazione dello stesso lavoro.

## Obiettivo

Sostituire il modulo Template rapportini con "Azioni operatori": le azioni che gli operatori
eseguono sono organizzate e modificabili secondo la gerarchia del flowchart ATLAS
**COMMITTENTE → GRUPPO ATTIVITA' → FLUSSO (già presente)**. I flussi runtime non cambiano.

## Gerarchia (dal flowchart, sui dati reali)

- **ITALGAS** → ATTIVITA' ALLA CLIENTELA, P.I., BONIFICHE, BONIFICHE EXTRA (+ AGENDA AEREA, in tassonomia)
- **ACEA** → LIMITAZIONI MASSIVE, DUNNING
- **ACQUALATINA** → SOSTITUZIONE MISURATORI (foglia extra: il flusso risanamento non importa attività)

I gruppi sono data-driven da `attivita_tassonomia` (motore fase 1+2): 1 INSERT = nuovo gruppo nel modulo.

## Design

1. **DB** — `rapportino_template.gruppo_committente text` (check acea|italgas|acqualatina) +
   `gruppi_attivita text[]`; check coppia (o entrambi o nessuno); seed per nome dei flussi
   esistenti. Un flusso può coprire più gruppi (ibridi). `committente`/`is_default`/`solo_manuale`
   NON toccati: restano l'instradamento runtime (mappa, "+", risolviTemplateCommittente).
2. **Logica pura** — `lib/rapportini/flussiGruppo.ts`: `buildAlberoFlussi` (gruppi = tassonomia
   attiva ∪ extra ∪ referenziati; match su `chiaveTassonomia`; manuali per committente con
   equivalenza lim_massive→acea; non collegati) + `normalizzaCollegamento`. TDD.
3. **API** — stessa route `/api/admin/rapportino-template` estesa con la coppia (zod + normalizzazione).
4. **UI** — `app/impostazioni/azioni-operatori/`: card committente → gruppi (flussi collegati,
   "+ Flusso" precollegato) → editor storico (auto-save, lock ottimistico) + sezione
   "Collegamento al gruppo attività"; "Interventi manuali (+)"; "Flussi non collegati".
5. **Rimozione** — vecchio modulo eliminato, route in redirect, card sostituita,
   `templateScheda.ts` ridotto a `erroreCommittenteManuale`.

## Fuori scope (ROADMAP → fase 2)

Auto-risoluzione del modello in pianificazione dal `gruppo_attivita` degli interventi.

## Verifica

vitest completa (1870 verdi), tsc, eslint sui file toccati, next build. Migration da applicare
al prod PRIMA del merge (bloccata dal classifier in sessione: serve ok esplicito).
