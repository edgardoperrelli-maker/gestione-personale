# Handoff — Azioni operatori: consolle, motore per-attività, foto condizionali (2026-07-21)

> Documento di ripresa per una NUOVA chat: è autosufficiente, la sessione precedente non c'è più.
> Stato repo alla scrittura: `main` @ `1c7aa2e` (PR #131), working tree pulito, TUTTO deployato.

## Goal

Le pianificazioni sono indipendenti dai template: ogni card intervento del rapportino ha le
azioni della SUA attività, configurate nel modulo **Impostazioni → Azioni operatori** (unica
fonte di verità, usabile in autonomia dal backoffice, che ha già account admin). Il redesign
"Consolle" e le rifiniture motore sono COMPLETATI e in produzione; restano rifiniture note.

## Current status

Produzione Vercel = `main`. In prod oggi: consolle live, migrations applicate e verificate,
foto condizionali disponibili ma **nessuna ancora configurata dall'utente**. Nessun bug noto
aperto sul filone. DB "Calendario personale" (Supabase `aceztqfebringeaebvce`): 12 template
(10 attivi, 2 archiviati), 8 attività coperte (Italgas 6, Acea 2), modelli «+» univoci,
"Pronto Intervento" riservato al modulo P.I.

## Done

- **PR #127 — Consolle + motore** (`app/impostazioni/azioni-operatori/AzioniOperatoriClient.tsx`
  riscritto, ~1.100 righe): rail attività per committente con copertura; panoramica-registro
  (KPI, chip azioni, slot «+», «Da sistemare», Archiviati); editor con telefono sticky sui
  componenti REALI dell'operatore (`VoceCampi`, `VoceTitolo`, `VoceHeaderInfo`, `VoceDettagli`,
  `RigaVoceCard`); checklist in creazione; Archivia/riattiva (il payload non forza più
  `active=true`); pill di salvataggio mai silenziosa. Motore: titolo/dettagli PER-VOCE live
  (`rapportino_voci.template_id` → `app/r/[token]/page.tsx`, fallback rapportino per lo storico);
  GET `/api/admin/rapportino-template` protetta (era SENZA auth); `is_default` ritirato ovunque;
  «+» univoco per committente (`lib/rapportini/modelloPlus.ts` + indice unico parziale
  `rapportino_template_plus_univoco` + 409); `riservato_pi` al posto della ricerca per nome in
  `api/admin/pi/token`; pool manuali via `lib/interventi/manuali/caricaTemplateManuali.ts`;
  token additivi `--phone-bezel`/`--phone-screen`; rimosso `impostazioni/template-rapportini`.
- **Migrations APPLICATE al prod** (ordine: merge → deploy READY → apply, per non aprire la
  finestra di ambiguità del «+»): `20260721120000_modello_plus_riservato_pi` e
  `20260721130000_archivia_flussi_obsoleti`. Verifica post-apply: 10 attivi / 2 archiviati /
  indice presente / 0 rapportini in corso su "Ibrido acea".
- **PR #130 — Foto obbligatorie su condizione**: campo additivo `obbligatoria_se
  {chiave, valore}` sull'azione foto (jsonb `campi`, nessuna migration), valutato in
  `utils/rapportini/fotoCondizionali.ts` → `slotFotoCondizionali` PRIMA delle regole legacy
  per nome (valvola). UI: *Facoltativa / Obbligatoria / Obbligatoria se…* (trigger = crocetta
  «spuntata» o select = valore, case-insensitive); riferimenti seguono i rename (chiave da
  slug) e si azzerano eliminando il trigger; condizione orfana → fail-open.
- **PR #128** — hook `.claude/hooks/sync-skills.sh` alla versione canonica git-clone.
- **Sessioni concorrenti** (stesso giorno): #123/#124 pianificazione senza "Modello" in mappa
  + `taskToIntervento` per-task + migration `20260721100000` (RESINE→italgas/RISANAMENTO
  COLONNE, flusso classico "P.I.") + import solo template ufficiale; #125 foto-zip task-via;
  #126/#129 filtri storico multi-select + territorio.
- **Processo della sessione** (già consumato, non ripetere): grilling in 9 decisioni →
  verifica funzionale (finding F1 GET senza auth, F2 auto-save muto su Pronto Intervento,
  F3 hack per nome "Ibrido acea"/SIGILLO, F4 is_default orfano — tutti risolti) → 3 mockup
  HTML → scelta utente: variante A "Consolle" + innesti B (chip/KPI) e C (checklist).
  I mockup e il report vivevano nello scratchpad della sessione: PERSI, ma il risultato è nel codice.

## In progress / not yet done

1. **QA visivo della consolle da parte dell'utente** su dati reali (l'ambiente cloud non ha
   service key né login: verificato solo via tsc/lint/build/1.969 test).
2. **Prima foto condizionale reale**: l'utente voleva «se SARACINESCA spuntata → FOTO
   SARACINESCA obbligatoria». Da configurare nel flusso interessato e verificare su un giro
   che l'invio si blocchi SOLO a condizione attiva.
3. **Rifiniture per-voce restanti** (ROADMAP): meccaniche task-via/ibrido per-voce e vista
   `/hub/rapportini/eseguiti` sui campi unione.
4. **6 test rossi PREESISTENTI** in `tools/limitazioni-sync` (`risolviMaster.test.ts` ×3,
   `comuni.test.ts` ×3, ultima modifica `783da32`): fuori perimetro, mai toccati oggi.

## What worked

- Ordine sicuro per cambi dato+codice: merge → `mcp Vercel get_deployment` fino a READY →
  `mcp Supabase apply_migration` → SELECT di verifica.
- Codice resiliente pre-migration: select con colonna nuova + fallback senza (pattern usato
  per `riservato_pi` e per le colonne per-voce) — l'ordine deploy/migration diventa indifferente.
- Estendere il collo di bottiglia unico (`slotFotoCondizionali`) invece di toccare i
  consumatori: gate pre-invio, dettaglio mancanti e validazione manuali «+» ereditano gratis.
- Anteprima fedele per costruzione: importare i componenti veri dell'operatore nell'editor.
- Fake Supabase dei test: `lib/interventi/testUtils/fakeSupabase.ts` (chainable, in-memory).

## What did NOT work (and why)

- **Migrations PRIMA del deploy**: col codice vecchio online, il data-fix «Pronto
  Intervento→italgas» crea DUE manuali attivi italgas → instradamento del «+» casuale
  (dipende dall'ordine di ritorno query). Sempre deploy prima.
- **`npm run build` nel cloud senza service key**: fallisce SEMPRE alla prima route admin
  (supabaseAdmin creato a livello di modulo). Check valido:
  `SUPABASE_SERVICE_ROLE_KEY=dummy npm run build`.
- **curl verso `*.vercel.app` dalla shell di sessione**: il proxy blocca il CONNECT (403,
  network policy). Stato deploy SOLO via strumenti MCP Vercel.
- **tsc dopo aver rimosso una pagina**: `.next/types` stantio → falsi TS2307; `rm -rf .next`.
- **Fidarsi di HEAD locale in giornate multi-sessione**: main è avanzato più volte sotto i
  piedi; sempre `git fetch` + merge di origin/main prima della PR (conflitto tipico:
  ROADMAP, tutti prependono in «Fatto» — tenere entrambe le voci).
- **`.not('col','is',null)` nelle query del motore**: il fake dei test non lo implementa;
  filtrare in JS dopo `.eq()` semplici (lezione ereditata, confermata).

## Key decisions

- Consolle (A) + innesti B/C — scelta utente sui 3 mockup; alternativa "wizard-first" scartata
  come flusso principale (troppi click per gli esperti), sopravvive come checklist in creazione.
- Display per-voce: decide la PRESENZA del template della voce (anche config vuota vale);
  alternativa "vuoto = eredita dal rapportino" scartata: la voce deve seguire IL SUO flusso.
- «+» univoco a livello DB (indice parziale) + 409 cortese in app; alternativa solo-app
  scartata (le lotterie da ordine query erano proprio il bug).
- `riservato_pi` flag invece del lookup per nome per il P.I.; il rename non rompe più il modulo.
- Archivia (active=false) invece di eliminare "Ibrido acea": il suo hack legacy per nome
  (`fotoObbligatorieSoloMassive`, regex `/ibrido\s*acea/i`) resta nel codice SOLO per i
  rapportini storici. Le foto condizionali configurabili sono il sostituto.
- `is_default` ritirato dai consumatori ma colonna lasciata nel DB (innocua, zero letture).
- Foto condizionali fail-open su trigger mancante: mai bloccare un operatore per una config rotta.

## Key files & commands

- `app/impostazioni/azioni-operatori/AzioniOperatoriClient.tsx` — consolle intera (rail,
  panoramica, editor, telefono, archiviazione, condizioni foto).
- `utils/rapportini/fotoCondizionali.ts` — obblighi foto: configurati + legacy per nome.
- `lib/rapportini/flussiGruppo.ts` — albero + `risolviFlussoPerGruppo` (stessa funzione del
  motore, usata anche dalla consolle per mostrare il flusso che genera davvero).
- `lib/interventi/sincronizzaRapportini.ts` — generazione: flussi per-voce + fallback modello auto.
- `app/r/[token]/page.tsx` — display per-voce live (`tplIdByVoceId`/`displayByTplId`), pattern resiliente.
- `npx vitest run` → attesi ~1.969 verdi + 6 rossi lim-sync preesistenti. `npx tsc --noEmit` pulito.
- Salute modulo (SQL, progetto Supabase `aceztqfebringeaebvce`):
  `select nome, active, solo_manuale, riservato_pi, committente, gruppo_committente, gruppi_attivita from rapportino_template order by active desc, solo_manuale, nome;`
- Foto condizionali configurate:
  `select nome, c->>'etichetta' foto, c->'obbligatoria_se' cond from rapportino_template, jsonb_array_elements(campi) c where c->'obbligatoria_se' is not null and c->>'obbligatoria_se' <> 'null';`

## Open questions

- Il backoffice troverà intuitiva la consolle senza spiegazioni? (Era l'obiettivo del
  redesign; feedback reale ancora mancante.)
- Le rifiniture task-via/ibrido per-voce: quando? Nessuna urgenza dichiarata.
- I 6 test lim-sync rossi: sistemarli o congelarli esplicitamente?

## Next step

Configurare con l'utente la **prima foto condizionale reale** (saracinesca) nel flusso giusto
di Azioni operatori e verificarla su un giro generato: l'invio deve bloccarsi SOLO con la
casella spuntata (query "Foto condizionali configurate" qui sopra per conferma lato dati).

## Warnings (invarianti da non violare)

- NON disattivare la voce acea "LIMITAZIONI MASSIVE" in tassonomia (export ancorato al literal).
- Repo PUBBLICO: mai dati di produzione (matricole/ODL/nomi) in commit o PR.
- Azioni congelate per-voce alla generazione; titolo/dettagli LIVE anche sul già-inviato.
- Non riattivare "Ibrido acea" se non serve davvero; non usare `is_default` via SQL.
