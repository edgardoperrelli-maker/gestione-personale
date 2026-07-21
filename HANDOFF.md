# Handoff — 2026-07-21: Consolle Azioni operatori, pianificazione senza template, foto condizionali

**Generated**: 2026-07-21 ~pomeriggio · **Branch**: `main` = produzione Vercel (ultimo merge `aac4987`, PR #130) · **Status**: TUTTO MERGIATO, DEPLOYATO E VERIFICATO. Migrations applicate al prod (nell'ordine giusto: prima il deploy, poi le migrations). Nessun controllo in sospeso obbligatorio.

## Goal

Giornata su due binari conversi: (A) questa sessione — processo completo /grilling → verifica
funzionale → 3 mockup HTML → **redesign "Consolle" di Azioni operatori** + rifiniture motore
(PR #127), migrations al prod, **foto obbligatorie su condizione** (PR #130), hook sync-skills
(PR #128); (B) sessioni concorrenti — **pianificazione senza template** (PR #123, #124),
foto-zip task-via (PR #125), filtri storico multi-select + territorio (PR #126, #129).
Obiettivo di fondo confermato dall'utente: *le pianificazioni sono indipendenti dai template;
ogni card intervento ha le azioni della SUA attività, configurate in Azioni operatori*.

## Completed (tutto in produzione)

- [x] **PR #127 — Consolle Azioni operatori + rifiniture motore** (questa sessione):
  - UI: rail attività per committente con stato copertura; panoramica-registro (KPI, chip
    azioni, slot espliciti del modello «+», «Da sistemare», Archiviati); editor con
    **telefono sticky sui componenti REALI** dell'operatore (fedeltà strutturale, non
    simulata); checklist di verifica in creazione; avvio guidato attività scoperte;
    **Archivia/riattiva** (il payload non forza più `active=true`); pill di salvataggio
    **mai silenziosa** (dichiara il motivo del blocco).
  - Motore: **titolo/dettagli per-voce** LIVE dal flusso della voce
    (`rapportino_voci.template_id`, fallback rapportino per lo storico); **GET admin dei
    template protetta** (era SENZA autenticazione — supabaseAdmin bypassa la RLS e le API
    non passano dal middleware); **is_default ritirato** da tutti i consumatori; **modello
    «+» univoco per committente** (indice unico parziale + 409 cortese) e **Pronto
    Intervento riservato al modulo P.I.** via flag `riservato_pi` (via l'aggancio PER NOME
    in `api/admin/pi/token`). Token additivi `--phone-bezel`/`--phone-screen` + DESIGN.md.
  - Pulizia: rimosso il modulo orfano `impostazioni/template-rapportini`.
- [x] **Migrations APPLICATE al prod** (dopo deploy READY di #127, per non aprire la
  finestra di ambiguità del «+» col codice vecchio): `20260721120000_modello_plus_riservato_pi`
  (colonna + data-fix Pronto Intervento→italgas/riservato/scollegato + indice unico) e
  `20260721130000_archivia_flussi_obsoleti` (Ibrido acea, IBRIDO ITALGAS/ACEA → archiviati).
  Verifica post-apply: 10 flussi attivi, 2 archiviati, 2 modelli «+» univoci, indice presente,
  0 rapportini in corso su Ibrido acea.
- [x] **PR #130 — Foto obbligatorie SU CONDIZIONE**: campo additivo `obbligatoria_se
  {chiave, valore}` sull'azione foto (jsonb `campi`: **nessuna migration**). Editor: su ogni
  foto il controllo è *Facoltativa / Obbligatoria / Obbligatoria se…* (trigger = crocetta o
  select del flusso; es. «SARACINESCA spuntata → FOTO SARACINESCA obbligatoria»); i
  riferimenti seguono i rename (chiave da slug) e si azzerano eliminando il trigger.
  Motore: `slotFotoCondizionali` valuta prima le condizioni configurate, poi le regole
  legacy per nome (valvola, retro-compat); trigger sparito → **fail-open**.
- [x] **PR #123/#124 (concorrente) — pianificazione senza template**: la mappa non chiede
  più il "Modello" (fallback risolto dal motore: rapportini esistenti → risanamento → primo
  per nome); `taskToIntervento` deriva committente+gruppo per singolo task dalla tassonomia
  (giri misti ok, prima ~78 interventi/30gg in fallback); migration `20260721100000`
  (APPLICATA): RESINE → italgas/RISANAMENTO COLONNE, flusso classico "P.I."; import
  ristretto al SOLO template ufficiale (gate header); colonna COMMITTENTE auto e protetta.
- [x] **PR #125 + follow-up (concorrente) — foto-zip task-via**: ZIP per via/matricola
  (vecchio/nuovo/minibag) per BONIFICHE EXTRA; disambigua per matricola anche fuori italgas.
- [x] **PR #126/#129 (concorrente) — storico**: filtri multi-select (esecutore, gruppo,
  committente, territorio) + colonne gruppo/committente/territorio anche in export.
- [x] **PR #128 — hook sync-skills** alla versione canonica git-clone (solo `.claude/`).

## Not Yet Done

- [ ] **Rifiniture per-voce restanti** (ROADMAP): meccaniche task-via/ibrido per-voce e vista
  `/hub/rapportini/eseguiti` sui campi unione. Il display (titolo/dettagli) per-voce è FATTO.
- [ ] **6 test rossi PREESISTENTI** in `tools/limitazioni-sync` (`risolviMaster` ×3,
  `comuni` ×3; ultima modifica `783da32`): fuori perimetro di oggi, da sistemare a parte.
  Il resto della suite: ~1.970 verdi.
- [ ] **QA visivo della consolle** su dati reali da parte dell'utente (l'ambiente cloud non
  ha service key né login: verificato via tsc/lint/build/test, non a schermo).
- [ ] Prima foto condizionale REALE da configurare (l'utente voleva saracinesca): al primo
  giro utile verificare il blocco d'invio solo a condizione attiva.

## Failed Approaches (Don't Repeat These)

- **Applicare le migrations PRIMA del deploy del codice nuovo**: col codice vecchio online,
  il data-fix del «+» (committente=italgas su Pronto Intervento) rende AMBIGUO
  l'instradamento della modale «+» di Italgas (due manuali attivi stesso committente,
  ordine query casuale). Ordine giusto: merge → deploy READY (Vercel MCP) → migrations.
  Il codice nuovo è resiliente pre-migration (select con fallback, lookup P.I. per nome).
- **`npm run build` nell'ambiente cloud senza service key**: fallisce SEMPRE alla prima
  route admin (supabaseAdmin è creato a livello di modulo) — non è un errore del branch.
  Check di compilazione valido: `SUPABASE_SERVICE_ROLE_KEY=dummy npm run build`.
- **Sonda HTTP su vercel.app dalla shell**: il proxy della sessione blocca il CONNECT (403,
  network policy). Per lo stato dei deploy usare gli strumenti MCP Vercel (`get_deployment`).
- **tsc dopo aver rimosso una pagina**: gli artefatti in `.next/types` puntano ancora alla
  route eliminata → falsi errori TS2307. `rm -rf .next` e rilanciare.
- **Fidarsi di HEAD locale nelle giornate multi-sessione**: main è avanzato 3 volte durante
  il lavoro (#124-#126, #129). Sempre `git fetch` + merge di origin/main PRIMA della PR
  (conflitto tipico: ROADMAP, tutti prependono in «Fatto»).

## Key Decisions

| Decision | Rationale |
|---|---|
| Redesign = variante «Consolle» (A) + innesti Registro (chip/KPI) e Guidata (checklist) | Scelta utente sui 3 mockup HTML con token reali e dati di produzione |
| Anteprima = componenti condivisi con l'operatore (`VoceCampi`, `VoceTitolo`, …) | Fedeltà per costruzione: stesso codice, mai una copia disegnata |
| Display per-voce: presenza del template della voce decide (anche config vuota) | La voce segue IL SUO flusso; storico senza `template_id` → config rapportino |
| «+» univoco: indice unico parziale + `riservato_pi` per il P.I. | Basta lotterie da ordine query; basta agganci per nome (`nome='Pronto Intervento'`) |
| `is_default` ritirato ovunque (colonna resta, innocua) | Nessun default in prod; Lista attesa ora deterministica (primo per nome) |
| Archivia (active=false) invece di elimina; editor non forza più active | Retirement sicuro (Ibrido acea) senza toccare i rapportini storici |
| `obbligatoria_se` nel jsonb `campi`, valutata in `slotFotoCondizionali` | Zero migration; unico collo di bottiglia → gate invio, dettaglio mancanti e manuali «+» gratis |
| Condizione orfana → fail-open (foto facoltativa) | Mai un blocco fantasma per l'operatore sul campo |

## Current State

**Working**: tutto in produzione (`aac4987`). Consolle live su Impostazioni → Azioni
operatori: 8 attività coperte (Italgas 6, Acea 2), 10 flussi attivi, 2 archiviati
riattivabili, modelli «+» univoci (Italgas per mobili, Template manuali lim. massive),
Pronto Intervento riservato P.I. Pianificazione senza scelta modello. Foto condizionali
pronte da configurare.

**Broken**: nulla di noto. (I 6 rossi lim-sync sono preesistenti e fuori dal filone.)

## Files to Know

| File | Perché |
|---|---|
| `app/impostazioni/azioni-operatori/AzioniOperatoriClient.tsx` | Consolle completa: rail, panoramica, editor, telefono, archiviazione, condizioni foto |
| `utils/rapportini/fotoCondizionali.ts` | Obblighi foto condizionali: configurati (`obbligatoria_se`) + legacy per nome |
| `lib/rapportini/modelloPlus.ts` + `lib/interventi/manuali/caricaTemplateManuali.ts` | Unicità «+» e pool manuali senza riservati |
| `app/r/[token]/page.tsx` | Display per-voce live (`tplIdByVoceId` → `displayByTplId`), pattern resiliente |
| `lib/interventi/sincronizzaRapportini.ts` | Fallback modello auto (senza is_default) + flussi per-voce |
| `supabase/migrations/202607211{2,3}0000_*.sql` | riservato_pi/indice/data-fix + archiviazioni (APPLICATE) |
| `docs/` ← report Fase 1 in scratchpad sessione | Contratto comportamenti verificati (F1-F6) — non committato |

## Code Context

```ts
// Obbligo foto su condizione (configurato dal modulo, jsonb campi):
campo.obbligatoria_se = { chiave: 'saracinesca', valore: 'SI' }
slotFotoCondizionali(campi, risposte)  // Set<chiave foto obbligatorie ORA> (config + legacy nome)
fotoSlotObbligatorio(campo, set)       // statica || condizionale

// Display per-voce su /r/[token]: la card segue il SUO flusso, live
voce.titolo_campi ?? titoloCampiRapportino   // stesso pattern per info_campi
```

```sql
-- Salute modulo (attesi: 10 attivi, 2 archiviati, riservato P.I. = Pronto Intervento):
select nome, active, solo_manuale, riservato_pi, committente, gruppo_committente, gruppi_attivita
from rapportino_template order by active desc, solo_manuale, nome;
-- Prima foto condizionale configurata (quando l'utente la crea):
select nome, c->>'etichetta' as foto, c->'obbligatoria_se' as condizione
from rapportino_template, jsonb_array_elements(campi) c
where c->'obbligatoria_se' is not null and c->>'obbligatoria_se' <> 'null';
```

## Resume Instructions

1. **Primo giro con la consolle**: aprire Impostazioni → Azioni operatori, controllare KPI
   copertura (Italgas 6/6, Acea 2/2), aprire Dunning e verificare telefono + salvataggio
   («Salvato ✓»). Provare Archiviati → riattiva/archivia su un flusso di test se serve.
2. **Configurare la prima foto condizionale** (richiesta utente: saracinesca): nel flusso
   interessato aggiungere azione «SARACINESCA» (casella) + azione foto con *Obbligatoria
   se SARACINESCA = spuntata*; al giro successivo verificare che l'invio si blocchi SOLO
   con la casella spuntata (query "prima foto condizionale" sopra per conferma dati).
3. **Guard motore tassonomia** (runbook invariato): dopo ogni import ACEA le 3 guard di
   `tools/limitazioni-sync/guard-limitazioni-non-esportate.sql` (G1=0 / G2=11 note / G3=0).
4. Se compare un 409 sul salvataggio di un modello manuale: è l'unicità del «+» (voluta) —
   il messaggio dice quale modello copre già quel committente.

## Warnings

- **NON disattivare** la voce acea "LIMITAZIONI MASSIVE" in tassonomia (l'export si àncora al literal).
- Repo PUBBLICO: mai dati prod (matricole/ODL/nomi operatori) in commit/PR.
- «Ibrido acea» resta ARCHIVIATO apposta: il suo hack per nome (`fotoObbligatorieSoloMassive`)
  vive solo per i rapportini storici. Non riattivarlo se non serve davvero; le foto
  condizionali configurabili sono il sostituto.
- La colonna `is_default` esiste ancora nel DB ma NESSUN codice la legge: non usarla via SQL.
- Le azioni sono congelate per-voce alla generazione; titolo/dettagli sono LIVE (anche sui
  rapportini già in mano agli operatori) — l'header dell'editor lo dichiara.
- Giornate multi-sessione: `git fetch` + merge origin/main prima di ogni PR; il conflitto
  ROADMAP si risolve tenendo entrambe le voci in cima a «Fatto».
