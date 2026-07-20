# Handoff — 2026-07-20 (notte): Azioni operatori COMPLETO — modulo, per-attività, anteprime

**Generated**: 2026-07-20 ~20:00 · **Branch**: `main` = produzione Vercel (ultimo merge `3960d6e`, PR #122) · **Status**: TUTTO MERGIATO E DEPLOYATO. Migrations applicate al prod. Un solo controllo rimandato: il primo giro generato per-attività (vedi Resume 1).

## Goal

Giornata in 4 tappe sullo stesso filone (2 task ATLAS + 3 iterazioni su feedback dal vivo):
sostituire i Template rapportini con **Azioni operatori** (Committente → Gruppo attività → flusso),
generare il rapportino **per-attività** (ogni voce = azioni del flusso del SUO gruppo), e rendere
il modulo usabile da tutto il backoffice (editor semplice, anteprime dinamiche). In coda: commit
dell'hardening lim-sync "commessa rinominata" rimasto in sospeso dalla sessione concorrente.

## Completed (tutto in produzione)

- [x] **PR #116** (task ATLAS `4c616de3…` + `e81c9fd4…`): modulo `/impostazioni/azioni-operatori`
  (gerarchia flowchart, gruppi data-driven dalla tassonomia, foglia extra acqualatina/SOSTITUZIONE
  MISURATORI), collegamento `rapportino_template.gruppo_committente`+`gruppi_attivita[]` con seed
  (migration `20260720190000` APPLICATA: 7 collegati / 3 non collegati verificati), modulo
  Template rapportini rimosso (route in redirect). ROADMAP/HANDOFF nella stessa PR.
- [x] **PR #119**: (a) editor semplice per il backoffice; (b) **rapportino per-attività**:
  `rapportino_voci.template_id`+`campi_snapshot` (migration `20260720210000` APPLICATA),
  generazione risolve il flusso dal gruppo dell'intervento (`risolviFlussoPerGruppo`: dedicato
  batte ibrido, manuali esclusi, lim_massive≡acea; fallback = "Modello" scelto in mappa), catena
  per-voce completa (operatore, validazioni, esiti, export con `unioneCampi`); (c) template
  import Excel: DESCRIZIONE ATTIVITÀ **solo-tendina** (data validation stop sulla Leggenda).
- [x] **PR #121**: sezione di primo livello "Anteprima del task nel rapportino" (titolo card +
  dettagli anagrafici + anteprima unica; per i manuali "Anagrafica da compilare (+)"); ELIMINATI
  i 3 blocchi avanzati duplicati e la select committente dei flussi CLASSICI (funzione morta:
  `risolviTemplateCommittente` gira solo sui `solo_manuale`; nei manuali resta "Committente del +").
- [x] **PR #122**: anteprima DINAMICA — box live «L'operatore leggerà: …», valore d'esempio su
  ogni riga del titolo con evidenza "← fa da titolo", resa `vedrà: ETICHETTA: valore` sui dettagli.
- [x] **`24f2efa` su main**: hardening lim-sync "commessa rinominata" (filone della sessione
  concorrente, committato su richiesta): `risolviPathConfig` (risoluzione path in memoria SOLO con
  UNA gemella valida) + `scriviLog` con fallback locale (mai ricreare alberi fantasma su OneDrive).
  227 test lim-sync verdi + `node --check` prima del commit; l'agente serale gira col fix.
- [x] Verifica post-deploy #119 in prod: pagina operatore `/r/<token>` di un rapportino
  pre-merge renderizza perfettamente in fallback (lista, focus, azioni ESEGUITO/NOTE/lavorazioni).

## Not Yet Done

- [ ] **Controllare il PRIMO GIRO generato per-attività** (Resume 1): i 14 rapportini del 21/07
  sono stati generati alle 17:16, PRIMA del merge #119 → viaggiano in fallback (comportamento
  identico al vecchio, corretto). Le voci per-attività compaiono alla prossima
  generazione/risalvataggio di un piano dalla mappa.
- [ ] Follow-up in ROADMAP ("Azioni operatori — rifiniture per-voce"): valutare "Modello" mappa
  non più obbligatorio quando tutti i task risolvono; task-via/ibrido e `tipo` risanamento
  per-voce; `/hub/rapportini/eseguiti` sui campi unione.
- [ ] Se "tutti nel backoffice" dovrà includere NON-admin: `/impostazioni` è solo admin (layout
  con redirect) — scelta di permessi da confermare con l'utente.
- [ ] Gruppo italgas BONIFICHE seedato sul flusso ITALGAS (ibrido) e AGENDA AEREA senza flusso
  (ha già un flusso creato a mano dall'utente il 20/07 sera, "AGENDA AEREA — 1 azione ESITO"):
  verificare che l'ufficio confermi i collegamenti.

## Failed Approaches (Don't Repeat These)

- **`apply_migration`/`execute_sql` per mutazioni prod**: il classifier li può bloccare anche
  sulla "via sanzionata"; NON aggirare — chiedere l'ok esplicito in chat e rilanciare (così è
  passato due volte oggi).
- **`.not('col','is',null)` nelle query del motore rapportini**: il fake Supabase dei test
  (`lib/interventi/testUtils/fakeSupabase.ts`) non lo implementa → 17 test rossi. Filtrare in JS
  dopo una select semplice (`.eq()` sola) — più robusto anche per il fake.
- **Select `campi_snapshot` per-voce dentro la select principale del render `/r/[token]`**:
  se la colonna non esiste ancora, TUTTA la select fallisce (rapportino "vuoto"). Pattern giusto
  (usato nel file per task_via ecc.): query separata e resiliente, merge per id.
- **Riusare `committente`/tassonomia per la gerarchia del flowchart**: no — `committente` instrada
  il runtime e non ha 'acqualatina' nei check; la gerarchia è una dimensione NUOVA
  (`gruppo_committente`), acqualatina esiste solo lì (foglia extra hardcoded, non in tassonomia).
- **Chips/valori "coordinate" nel titolo card**: escluse dalla scelta titolo (sarebbe un titolo
  insensato); la coordinata resta solo come link "Punto esatto".

## Key Decisions

| Decision | Rationale |
|---|---|
| Collegamento = 2 colonne su `rapportino_template` (`gruppo_committente` + `gruppi_attivita text[]`) | N:M leggero senza tabella ponte; un ibrido copre più gruppi |
| Per-voce = snapshot sulla voce (`template_id`+`campi_snapshot`), NULL = fallback rapportino | Retro-compat totale; rapportini storici intatti; zero blocchi alla pianificazione |
| `risolviFlussoPerGruppo`: dedicato batte ibrido (meno gruppi coperti), poi nome | Determinismo quando due flussi coprono lo stesso gruppo |
| "Modello" in mappa resta obbligatorio come fallback | Interventi senza gruppo o gruppi scoperti non bloccano mai il giro |
| Export/PDF/foto: unione colonne (`utils/rapportini/campiDiVoce.ts`) | Voci miste nello stesso rapportino: ogni risposta trova la sua colonna |
| UI backoffice: essenziale in primo piano, tecnicismi in "Impostazioni avanzate" chiusa | Feedback esplicito utente (memoria `ui-config-semplice-backoffice`) |
| Select committente SOLO sui manuali | Verificato: `risolviTemplateCommittente` è chiamato solo su `solo_manuale=true` (modale "+", lista attesa) |

## Current State

**Working**: tutto il filone in produzione (`3960d6e`); migrations applicate; repo principale
allineato su `main` (l'agente lim-sync gira da lì col fix `24f2efa`). L'utente ha già usato il
modulo (creato flusso "AGENDA AEREA", provato l'editor). Worktree
`.claude/worktrees/azioni-operatori` su `feat/anteprima-dinamica` (mergiato: può essere rimosso;
contiene `.env.local` copiato a mano, gitignorato).

**Broken**: nulla di noto.

## Files to Know

| File | Perché |
|---|---|
| `lib/rapportini/flussiGruppo.ts` | Albero flowchart + `risolviFlussoPerGruppo` + `normalizzaCollegamento` (PURO, testato) |
| `utils/rapportini/campiDiVoce.ts` | `campiDiVoce` (per-voce con fallback) + `unioneCampi` (export/PDF) |
| `lib/interventi/sincronizzaRapportini.ts` | Generazione: `flussoPerVoce` via intervento→gruppo→flusso; retry resilienti |
| `app/impostazioni/azioni-operatori/AzioniOperatoriClient.tsx` | UI completa: navigazione, azioni, anteprima dinamica, avanzate |
| `app/r/[token]/page.tsx` + `api/r/[token]/{voce,invia}` | Catena operatore per-voce (query snapshot separata e resiliente) |
| `supabase/migrations/20260720{190000,210000}_*.sql` | Collegamenti + colonne voci (GIÀ applicate al prod) |
| `tools/limitazioni-sync/lib/risolviPathConfig.mjs` | Risoluzione path commessa rinominata (agente) |

## Code Context

```ts
// Generazione per-voce (sincronizzaRapportini): la voce salva il flusso del SUO gruppo
flussoPerVoce(interventoId) // → { template_id, campi_snapshot } | null (null = fallback rapportino)
risolviFlussoPerGruppo(committenteEq, gruppo, templates) // dedicato < ibrido, no manuali, 'altro' = qualsiasi

// Ovunque si valuta una voce:
campiDiVoce(voce, campiRapportino)   // i SUOI campi o il fallback
unioneCampi(base, vociCampi[])       // colonne export/PDF, dedup per chiave, ordine rinumerato
```

```sql
-- Salute collegamenti (attesi oggi: 8 collegati con AGENDA AEREA, 2-3 non collegati):
select nome, gruppo_committente, gruppi_attivita from rapportino_template order by 2 nulls last, 1;
-- Voci per-attività generate (0 finché non si rigenera un piano post-deploy):
select count(*) from rapportino_voci where campi_snapshot is not null;
```

## Resume Instructions

1. **Primo giro per-attività**: dopo che l'ufficio risalva/genera un piano dalla mappa (o su
   richiesta: risalvare il piano del 21/07 — tutte le voci sono a 0 compilati, operazione sicura):
   - `select count(*) from rapportino_voci where campi_snapshot is not null;` → atteso > 0.
   - Campione di correttezza: join voce→intervento e verificare che `voce.template_id` sia il
     flusso del `gruppo_attivita` dell'intervento (es. DUNNING → LIMITAZIONI/SOSPENSIONI,
     massive → RAPPORTINO LIMITAZIONI MASSIVE); interventi con gruppo NULL → voce con snapshot NULL.
   - Aprire `/r/<token>` di quel giro: voci di gruppi diversi mostrano azioni diverse.
   - Se snapshot tutti NULL con gruppi valorizzati: controllare che i flussi siano `active` e
     collegati (query salute sopra), e che il deploy sia ≥ `14552c0`.
2. **Guard motore tassonomia** (runbook invariato): dopo ogni import ACEA le 3 guard di
   `tools/limitazioni-sync/guard-limitazioni-non-esportate.sql` (attese G1=0 / G2=11 note / G3=0).
3. Giro agente serale 20/07: verificare in `/hub/agente` nessuna anomalia; il fix commessa
   rinominata emette `avvisoPercorso` nel report se i path cambiano ancora.

## Warnings

- **NON disattivare** la voce acea "LIMITAZIONI MASSIVE" in tassonomia (l'export si àncora al literal).
- Repo PUBBLICO: mai dati prod (matricole/ODL/nomi operatori) in commit/PR.
- I rapportini del 21/07 in fallback sono CORRETTI così: non rigenerarli per forza — il per-voce
  arriva naturalmente col prossimo salvataggio.
- L'auto-save dell'editor propaga anche il collegamento gruppi: l'albero a sinistra si aggiorna
  ~1s dopo la modifica (voluto).
- Sessioni concorrenti attive oggi su questo repo (#114→#122): SEMPRE `git fetch` + rebase prima
  di push; verificare che un merge prenda tutti i commit del ramo.
