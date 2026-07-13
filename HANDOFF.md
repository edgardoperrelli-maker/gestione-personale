# Handoff — Cronoprogramma: Squadre + avviso Novità (2026-07-13)

## Goal
Aggiungere al modulo Cronoprogramma la funzione **Squadre**: legare più operatori
(da 2 a N, es. resine Napoli = 4) che lavorano insieme in una cella (giorno+territorio),
con gesto "aggancia" via drag&drop. Più: **avviso/tutorial "Novità"** per informare gli
utenti, e alcuni fix UI (hub Novità globale, colori tema reattivi).

## Current status
Feature implementata, buildata e **deployata sul preview Vercel** (PR #85, verde).
Migration DB **già applicata** al progetto Supabase `aceztqfebringeaebvce` (Calendario personale).
**BUG BLOCCANTE APERTO**: l'**aggancio non scrive** — `assignments.squadra_id` non viene MAI
persistito (verificato via query DB: 0 righe con squadra_id). Nessuna squadra si crea.

## Repo state
- Branch: `claude/agent-master-file-conflicts-wahrjm` (= head della **PR #85**, aperta).
- PR #85 è COMBINATA (scelta utente): contiene sia le squadre sia un vecchio fix
  `limitazioni-sync` (negativi, commit 202e9f6). Titolo/descrizione già aggiornati.
- Working tree pulito, tutto pushato. Ultimo commit `ff490e2`.
- Preview: https://gestione-personale-git-c-d90c76-edgardoperrelli-makers-projects.vercel.app

## Done
- **Migration** `supabase/migrations/20260713100000_cronoprogramma_squadre.sql` (applicata al DB):
  `assignments` += `squadra_id uuid`, `team_order int`, `is_capo bool`; tabella `annunci_visti`
  (once-per-utente) con RLS.
- **Logica pura** `components/modules/cronoprogramma-personale/squadre.ts` (+ `.test.ts`, 13 test OK):
  `raggruppaSquadre`, `crewSizeAttivita` (RESINE=4), `pianoAggancio/pianoRimuoviMembro/pianoSciogli/
  pianoSetCapo`, `membriPresenti`. Tipo `Assignment` esteso in `types.ts`; i due SELECT in
  `CronoprogrammaWorkspace.tsx` includono i campi squadra.
- **UI Calendario** `CronoCalendarView.tsx`: raggruppa in squadre; `SquadraCard.tsx` (catena, capo ⭐,
  progresso x/N, membri assenti barrati "x/N presenti"); `SingoloCard` con overlay "⛓ Aggancia" durante il drag.
- **Handler squadre** in `CronoprogrammaWorkspace.tsx` (`handleAggancia`, `handleRimuoviMembro`,
  `handleSciogliSquadra`, `handleSetCapo`, `applySquadPatches`, `membriDiSquadra`); spostare una card la sgancia.
- **Avviso/tutorial** `AnnuncioSquadre.tsx` (tutorial completo: principi, squadra ×4 resine + aggancio,
  scala 2/3/4 + incompleta, comportamento gesto). Endpoint `app/api/annunci/route.ts` (GET seen / POST record).
  Auto-show al primo accesso al cronoprogramma (una volta per utente).
- **Hub Novità globale** `components/layout/NovitaCenter.tsx` accanto alla campanella nel `TopBar.tsx`
  (badge "nuovo", pannello estendibile). Rimosso il bottone dalla toolbar del cronoprogramma.
- **Rimosse le viste** Griglia/Split/Tabella + selettore (resta solo Calendario). File eliminati:
  `CronoGridView.tsx`, `CronoSplitView.tsx`, `CronoTableView.tsx`. Memo morti rimossi dal workspace.
- **Colori territorio reattivi al tema**: ora CSS variabili in `app/globals.css`
  (`--terr-<slug>-{band,text,bg,bd}`, dark=tinte chiare in `:root`, light=scure in `html.light`).
  `lib/territoryColors.ts` → `getTerritoryStyle` ritorna `var(--terr-…)`. Cambiano da soli allo switch.
- **Fix z-index**: `TopBar` a `z-40` (sopra la toolbar sticky `z-30`) così il pannello Novità non
  finisce sotto il banner date/azioni.

## In progress / not yet done  (ROADMAP, azioni concrete in ordine)
1. **[BLOCCANTE] Aggancio non scrive `squadra_id`** — vedi sezione dedicata sotto. Prima cosa da fixare.
2. Mini-card d'esempio dentro `AnnuncioSquadre.tsx` usano tinte territorio HARDCODED (dark) → su tema
   chiaro restano vivaci. Opz.: passarle a `var(--terr-…)` per coerenza.
3. Eventuale bump chiave annuncio `crono-squadre-v1`→`v2` se si vuole ri-mostrare l'avviso a tutti
   (l'admin di test ha già "visto" v1, quindi non riappare da solo; c'è il tasto Novità).
4. Verifica end-to-end sul preview di: crea squadra, aggiungi 3°/4°, capo ⭐, togli membro, sciogli,
   assente barrato, spostamento che sgancia.

## BUG APERTO — l'aggancio non persiste (dettaglio + diagnosi)
**Sintomo**: trascinando una card su un'altra della STESSA cella non si crea la squadra.
**Fatto certo**: `select … from assignments where squadra_id is not null` → **[] (zero righe)**.
Quindi la scrittura non avviene mai.
**Escluso**:
- NON è RLS: policy `upd_auth` UPDATE `USING (auth.role()='authenticated')` è permissiva → update consentito.
- NON è la colonna: gli spostamenti (`handleDropAssignment`) scrivono `squadra_id: null` e funzionano → colonna scrivibile.
- Wiring OK: `squadraHandlers.onAggancia = handleAggancia`, passato come `squadra={squadraHandlers}` a `CronoCalendarView`.
  `findAssignmentById` corretto (cerca in `assignments`).
**Sospetti (da verificare, in ordine)**:
- (A) Il `drop` non raggiunge `SingoloCard.onDrop`, oppure `sameCell` risulta false a runtime
  (`data.fromDay === iso && (data.fromTerritoryId ?? null) === (a.territory?.id ?? null)`), quindi
  `onAggancia` non viene chiamato. La card wrapper è SIA `draggable` SIA drop-target: possibile conflitto.
- (B) `applySquadPatches` (in `CronoprogrammaWorkspace.tsx`, ~riga 831) non esegue l'update o va in errore
  silenzioso. Fa `sb.from('assignments').update({squadra_id,team_order,is_capo}).eq('id', p.id)` e su errore
  chiama `softRefresh()` + feedback. Se l'utente NON ha visto feedback rosso, o non è stato chiamato o non ha erroreggiato ma non ha scritto.
**Prossimo passo concreto**: sul preview, aprire DevTools e aggiungere `console.log` temporanei in
`SingoloCard.onDrop` (fires? valore di `sameCell`, `data`) e in `handleAggancia` (chiamato? `sameCell`?
risultato di `applySquadPatches`, eventuale `results.some(r=>r.error)`). In 5 minuti si isola A vs B.
Guardare anche il Network per la PATCH a `/rest/v1/assignments`.

## What worked
- **Migration additiva idempotente** applicata via Supabase MCP `apply_migration` sul progetto
  `aceztqfebringeaebvce` — nessun impatto sull'esistente.
- **Colori come CSS variabili per-tema**: risolve il fatto che `getTerritoryStyle` leggeva il tema al
  render e non era reattivo (i colori "si rompevano" dopo il toggle). Verificato con swatch nei due temi.
- **z-40 sul TopBar**: fix pulito per il dropdown sotto la toolbar sticky.
- Build Vercel verde ad ogni push (le env reali ci sono; la build LOCALE fallisce solo per
  `supabaseKey` mancante — è normale in sandbox, la fase type-check passa).

## What did NOT work (and why)
- **Occhiello solo in hover**: la prima versione mostrava l'occhiello ⛓ solo a mouse fermo
  (`group-hover`), quindi **durante il drag non si vedeva** → sostituito con overlay drop-target su tutta
  la card (stato `over` su `onDragOver`). La VISIBILITÀ è ok, ma **l'aggancio non scrive** (bug aperto).
- **Build locale `next build`**: fallisce con `Error: supabaseKey is required` su route ACEA
  pre-esistenti — è env mancante in sandbox, NON un errore di codice. Non inseguirlo; usa `tsc --noEmit`
  + eslint + il preview Vercel come verifica.

## Key decisions (dal grilling con l'utente)
- Rilascio: tutto in **una PR** (feature + avviso). → PR #85, combinata anche col fix negativi.
- Modello dati **leggero** (squadra_id su assignments) invece di tabella `squadre` dedicata.
- **Capo esplicito** assegnabile (`is_capo`, ⭐), uno per squadra.
- Dimensione consigliata **mappa in codice** (`CREW_SIZE = { RESINE: 4 }`), non configurabile da UI.
- Gesto: **occhiello ⛓ immediato** (no dialog). Assenza in squadra: membro **barrato** "x/N presenti".
- **Solo vista Calendario** (rimosse Griglia/Split/Tabella, su richiesta utente).
- Persistenza avviso: **DB per-utente** (`annunci_visti`), once + tasto Novità per rivederlo.
- **Novità = hub globale** accanto alla campanella (non nella toolbar del cronoprogramma).

## Key files & commands
- `components/modules/cronoprogramma-personale/squadre.ts` — logica pura squadre (+ `.test.ts`).
- `components/modules/cronoprogramma-personale/CronoCalendarView.tsx` — `SingoloCard` (drop/aggancia),
  `renderItems`, `isAssignmentDrag`. **Punto centrale del bug aggancio.**
- `components/modules/cronoprogramma-personale/SquadraCard.tsx` — card-squadra + drop "aggiungi membro".
- `components/modules/cronoprogramma-personale/CronoprogrammaWorkspace.tsx` — handler squadre
  (`handleAggancia` ~riga 859, `applySquadPatches` ~riga 831), auto-show avviso, SELECT con campi squadra.
- `components/modules/cronoprogramma-personale/AnnuncioSquadre.tsx` — modale tutorial (`ANNUNCIO_SQUADRE_KEY`).
- `components/layout/NovitaCenter.tsx` + `components/layout/TopBar.tsx` — hub Novità globale.
- `app/api/annunci/route.ts` — GET seen / POST record.
- `app/globals.css` (blocco "Colori territorio") + `lib/territoryColors.ts` — colori tema reattivi.
- `supabase/migrations/20260713100000_cronoprogramma_squadre.sql` — schema.
- Comandi: `npx tsc --noEmit` · `npx vitest run components/modules/cronoprogramma-personale/squadre.test.ts`
  · `npx eslint <file>` (build: `eslint.ignoreDuringBuilds=true`, `next build` locale fallisce solo per env).
- DB (Supabase MCP, project `aceztqfebringeaebvce`): verifica squadre con
  `select id, staff_id, squadra_id, team_order, is_capo from assignments where squadra_id is not null;`

## Open questions
- Perché l'aggancio non scrive `squadra_id`? (A: drop/sameCell lato SingoloCard, o B: applySquadPatches). Da isolare con log sul preview.
- L'admin di test ha già "visto" l'avviso v1 → per rivederlo usare il tasto Novità o bumpare a v2.

## Next step
Fixare il **bug aggancio**: sul preview con DevTools, mettere `console.log` in `SingoloCard.onDrop`
(fires? `sameCell`? `data`) e in `handleAggancia`/`applySquadPatches` (chiamato? update in errore?),
isolare A vs B, correggere, e verificare che `assignments.squadra_id` si popoli nel DB.

## Note operative
- PR #85 è sotto watch di questa chat (`subscribe_pr_activity`) con check-in schedulati: alla ripresa in
  altra chat conviene ri-`subscribe_pr_activity` da lì. C'è un trigger di check-in pendente
  (`send_later`) su questa sessione.
