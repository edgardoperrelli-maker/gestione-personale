# Pronto Intervento sul campo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrare le chiamate di Pronto Intervento (P.I.) dal campo tramite un **link a scadenza** (X→Y), **vuoto**, **condiviso per area (foglia)**. L'operatore carica ogni chiamata dal "+" compilando campi dinamici da template; l'**esecutore** si sceglie da una tendina dei **reperibili del cronoprogramma** alla data della chiamata (con **anomalia reperibilità** se non combacia); la richiesta passa per **approvazione** e popola la **tabella del modulo P.I.**; l'ufficio carica poi la **contabilità** segnando le quantità sugli **articoli a listino** (quantità × prezzo congelato = valore). Modulo **multi-area a 3 foglie**: Firenze (attiva), Lazio Centro/Est e Perugia (predisposte).

**Architecture:** Si **riusa** quasi tutto: link a token in stile `agenda_token` (vuoto, righe live), il "+" manuale di `interventi_manuali` (idempotenza/foto/rollback/offline), il ciclo di approvazione con check-and-set atomico (→ `interventi` canonico `origine='pronto_intervento'`), il sistema template a campi dinamici, la pipeline tabellare dello Storico, e il join reperibili `assignments`+`calendar_days`. L'unica parte **greenfield** è la contabilità (`pi_articoli` listino + `pi_contabilita_righe`). La logica decisionale (validità token, reperibili/anomalia, mapping richiesta→intervento, calcolo contabilità) è estratta in **funzioni pure testabili** con vitest.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript strict · Supabase (Postgres + Storage + Realtime) · Tailwind v4 · Serwist (PWA/offline) · vitest · ExcelJS/jsPDF (export).

**Spec di riferimento:** [docs/superpowers/specs/2026-06-26-pronto-intervento-campo-design.md](../specs/2026-06-26-pronto-intervento-campo-design.md)

**Migration:** [supabase/migrations/20260626000000_pronto_intervento.sql](../../../supabase/migrations/20260626000000_pronto_intervento.sql) (già autorata; lo SQL eseguibile si consegna su richiesta e lo lancia l'utente — l'MCP Supabase punta a non-prod).

**Branch:** `claude/pi-field-call-recording-gxibyb`

**Decisioni adottate (default §15 dello spec):** B = nuovo tipo campo `ora` + Assistente TE come `select` da anagrafica · C = nuovo modulo `/hub/pronto-intervento` · D = contabilità solo-ufficio dopo approvazione, listino riservato, perimetro solo `REGISTRO CHIAMATE` · Riapertura link scaduto: **no in v1** (scadenza secca).

---

## Contratto condiviso (vincoli per tutti i task)

**DB client & auth:**
- `import { supabaseAdmin } from '@/lib/supabaseAdmin'` → service role, bypassa RLS. Usare nelle route server.
- Route `/api/pi/[token]/*` = **pubbliche protette dal token** (NO `requireAdmin`). Pattern: leggi `pi_token` per token via `supabaseAdmin`, valida `piTokenValido(tok, oggiRoma())` altrimenti `409`.
- Route admin `/api/admin/pi/*`: `const auth = await requireAdmin(); if (auth instanceof NextResponse) return auth; const { user } = auth;`
- Ogni route handler: `export const runtime = 'nodejs';`

**Tipi & riuso:**
- `TemplateCampo` da `@/utils/rapportini/buildVoci`: estendere `tipo` con `'ora'`.
- Richiesta P.I. = riga `interventi_manuali` con `fonte='pronto_intervento'`, `pi_token_id`, `area_codice`, `anomalia_reperibilita`; esecutore/data nelle colonne esistenti `staff_id`/`staff_name`/`data`.
- Mapping intervento canonico: clone di `@/lib/interventi/manuali/richiestaToIntervento` che emette `origine='pronto_intervento'`, `committente='altro'`.
- Reperibili per data: join `assignments`(`day_id`,`staff_id`,`reperibile`) + `calendar_days`(`id`,`day`) come [`/api/export/assignments`](../../../app/api/export/assignments/route.ts).

**Test:** vitest (`npm test`). Privilegiare **unit su funzioni pure**. Migration-shape test come `lib/interventi/manuali/migrationShape.test.ts`.

**Convenzione commit:** `feat(pi): …` / `test(pi): …` / `docs(pi): …`.

**Vincoli AGENTS.md:** l'edit di `lib/moduleAccess.ts` e `components/layout/moduleIcons.tsx` (registrazione modulo) è **sanzionato da questo piano** (Task 2). NON toccare `middleware.ts` (i `/hub/*` sono già protetti) né `lib/supabaseAdmin.ts`.

---

## File structure

**Logica pura — `lib/pi/`:**
- `tokenValidita.ts` — `piTokenValido(tok, oggiISO)` + stato (`non_attivo`|`valido`|`scaduto`|`revocato`)
- `reperibili.ts` — `reperibiliPerData(rows)`, `isReperibile(staffId, data, mappa)`, `calcolaAnomalia(...)`
- `richiestaPiToIntervento.ts` — mapping richiesta P.I. → record `interventi` (`origine='pronto_intervento'`)
- `contabilita.ts` — `valoreRiga(q, prezzo)`, `totaleContabilita(righe)`, snapshot prezzo
- `types.ts` — tipi P.I. condivisi

**Route operatore:** `app/api/pi/[token]/route.ts` (GET) · `app/api/pi/[token]/intervento/route.ts` (POST) · `app/api/pi/[token]/intervento/[id]/annulla/route.ts`

**Route admin:** `app/api/admin/pi/token/route.ts` · `app/api/admin/pi/articoli/route.ts` · `app/api/admin/pi/interventi/route.ts` · `app/api/admin/pi/interventi/[id]/contabilita/route.ts` · `app/api/admin/pi/export/route.ts` · (approvazione: riuso `app/api/admin/interventi-manuali/[id]/approva|rifiuta` esteso per `fonte`)

**Pagina campo:** `app/pi/[token]/page.tsx`

**Modulo:** `app/hub/pronto-intervento/page.tsx`

**Componenti:** `components/modules/pronto-intervento/` (`ProntoInterventoClient`, `CodaPI`, `TabellaPI`, `PannelloContabilita`, `GeneraLinkPI`, `foglie/FogliaTab.tsx`) · `components/modules/pronto-intervento/campo/` (`PILinkClient`, `ModalePIManuale`) · `app/impostazioni/listino-pi/` (`ListinoPIClient`)

---

## Task 1: Migration applicata + types Supabase

**Files:**
- Apply: `supabase/migrations/20260626000000_pronto_intervento.sql` (già scritta)
- Test: `lib/pi/migrationShape.test.ts`

- [ ] **Step 1: Rivedere la migration** — verificare nomi tabelle/colonne/constraint (`interventi_origine_check` DROP+ADD, PK composita `pi_articoli`, generated `valore`, RLS, `pi_token` senza policy pubblica).
- [ ] **Step 2: Consegnare/applicare** — su richiesta, fornire lo SQL; l'utente lo esegue su Supabase (non-prod prima). In alternativa `mcp__Supabase__apply_migration` sul progetto non-prod.
- [ ] **Step 3: Migration-shape test** — asserire la presenza di `pi_aree/pi_token/pi_articoli/pi_contabilita_righe`, le colonne nuove su `interventi_manuali`, il valore `'pronto_intervento'` ammesso da `interventi.origine`, il seed Firenze (12 articoli). `Run: npm test -- migrationShape`. `Expected: verde`.
- [ ] **Step 4: Commit** `feat(pi): migration modello dati (foglie, token, listino, contabilità)`.

## Task 2: Registrazione modulo `pronto-intervento` (edit sanzionato)

**Files:**
- Modify: `lib/moduleAccess.ts` (union `AppModuleKey` + entry `APP_MODULES`)
- Modify: `components/layout/moduleIcons.tsx` (icona — `Record` esaustivo, obbligatoria)
- Verify: `lib/appNavigation.ts` (auto-derivato, nessun NavItem a mano)

- [ ] **Step 1: AppModuleKey** — aggiungere `| 'pronto-intervento'` alla union.
- [ ] **Step 2: APP_MODULES** — entry `{ key:'pronto-intervento', href:'/hub/pronto-intervento', label:'Pronto Intervento', description:'Chiamate P.I. e contabilità', section:'modules', group:'operativita', matchPrefixes:['/hub/pronto-intervento'], adminOnly:true }`.
- [ ] **Step 3: Icona** — voce `'pronto-intervento'` in `MODULE_ICONS` (SVG a linee, stile casa).
- [ ] **Step 4: Typecheck** `Run: npx tsc --noEmit 2>&1 | grep -iE "moduleAccess|moduleIcons" || echo OK`. `Expected: OK`.
- [ ] **Step 5: Commit** `feat(pi): registra modulo pronto-intervento`.

## Task 3: Logica pura (lib/pi) — TDD

**Files:** `lib/pi/types.ts`, `tokenValidita.ts`, `reperibili.ts`, `richiestaPiToIntervento.ts`, `contabilita.ts` + `*.test.ts`

- [ ] **Step 1: `tokenValidita`** — stato da `valido_dal`/`valido_al`/`revocato_at` vs `oggiRoma()` (fuso Europe/Rome, riuso utility data esistenti). Test: prima/dentro/dopo/revocato.
- [ ] **Step 2: `reperibili`** — `reperibiliPerData(assignmentsConDay)` → `Map<data, {staffId,nome}[]>`; `calcolaAnomalia(staffId, data, mappa)` → boolean (true se non reperibile / nessun reperibile). Test inclusi i casi limite (cronoprogramma assente).
- [ ] **Step 3: `richiestaPiToIntervento`** — mapping `dati_correnti`→record `interventi` con `origine='pronto_intervento'`, `committente='altro'`, `indirizzo/comune` dai campi, `rif_esterno`=N° segnalazione, `data`=data chiamata, `staff_id`=esecutore. Test: emette l'origine giusta e non inquina la coda manuali.
- [ ] **Step 4: `contabilita`** — `valoreRiga(q,prezzo)=round(q*prezzo,2)`, `totaleContabilita`, snapshot prezzo dal listino. Test: riproduce un valore dell'Excel (es. 2×89.66).
- [ ] **Step 5: Commit** `test(pi): logica pura validità/reperibilità/mapping/contabilità`.

## Task 4: Route operatore (token pubblico)

**Files:** `app/api/pi/[token]/route.ts`, `app/api/pi/[token]/intervento/route.ts`, `app/api/pi/[token]/intervento/[id]/annulla/route.ts`

- [ ] **Step 1: GET** — carica `pi_token`+righe della sessione (`interventi_manuali` `fonte='pronto_intervento'`, `pi_token_id`) + **mappa reperibili** per la finestra X→Y (per la tendina, anche offline). 404/409 sui casi.
- [ ] **Step 2: POST intervento** — clone della logica di [`intervento-manuale`](../../../app/api/r/[token]/intervento-manuale/route.ts) (idempotenza `richiestaId`, foto-prima-del-DB se previste, rollback, PK-fallback, offline replay). Gate `piTokenValido`. Inserisce con `fonte='pronto_intervento'`, `pi_token_id`, `area_codice`, `staff_id`/`staff_name`=esecutore, `data`=data chiamata, **`anomalia_reperibilita`** ricalcolata lato server.
- [ ] **Step 3: Annulla** — finché `stato='in_attesa'`.
- [ ] **Step 4: Test** unit sui rami (idempotenza, gate, anomalia). `Run: npm test`. **Commit** `feat(pi): route operatore token (+ intervento, annulla)`.

## Task 5: Pagina campo + modale + offline

**Files:** `app/pi/[token]/page.tsx`, `components/modules/pronto-intervento/campo/PILinkClient.tsx`, `ModalePIManuale.tsx`, Modify `app/sw.ts`

- [ ] **Step 1: PILinkClient** — header (foglia, periodo X→Y), lista chiamate della sessione, **FAB "+"**, banner sola-lettura fuori finestra. `ServiceWorkerRegister` montato.
- [ ] **Step 2: ModalePIManuale** — campo **Data** (default oggi), tendina **Esecutore** filtrata sui reperibili della data (preselezione se unico, avviso se nessuno), `CampoInput` per i `campi_snapshot` del template (incluso il nuovo tipo `ora`).
- [ ] **Step 3: Offline** — in `app/sw.ts` aggiungere il prefisso navigazione `/pi/` (NetworkFirst) e `GET /api/pi/` agli `apiOperatore`; verificare la coda Background Sync.
- [ ] **Step 4: Tipo campo `ora`** — estendere in lockstep: `TemplateCampo.tipo` (`utils/rapportini/buildVoci.ts`), `CampoSchema` (`lib/rapportini/templateSchema.ts`), `TIPO_LABELS`+switch in `CampoInput.tsx`, gestione in `maiuscolaRisposteTesto`. `Run: npx tsc --noEmit`. **Commit** `feat(pi): pagina campo, modale + tendina reperibili, tipo campo ora, offline`.

## Task 6: Approvazione → intervento canonico P.I.

**Files:** Modify `app/api/admin/interventi-manuali/[id]/approva/route.ts` (ramo `fonte='pronto_intervento'`) e `rifiuta`; oppure `app/api/admin/pi/interventi/[id]/approva/route.ts` dedicato se più pulito.

- [ ] **Step 1: Approva P.I.** — check-and-set atomico (riuso), poi crea `interventi` via `richiestaPiToIntervento` (`origine='pronto_intervento'`); preservare la compensazione su errore (no transazione). Aggancio voce/intervento come l'originale.
- [ ] **Step 2: Test** — approvazione P.I. crea l'intervento giusto; doppia approvazione concorrente → una sola. **Commit** `feat(pi): approvazione richieste P.I. → intervento canonico`.

## Task 7: Modulo `/hub/pronto-intervento` (foglie, coda, tabella)

**Files:** `app/hub/pronto-intervento/page.tsx`, `components/modules/pronto-intervento/{ProntoInterventoClient,CodaPI,TabellaPI}.tsx`, `foglie/FogliaTab.tsx`, `app/api/admin/pi/interventi/route.ts`

- [ ] **Step 1: ProntoInterventoClient** — 3 tab da `pi_aree` (ordinati); Firenze operativa, Lazio/Perugia disabilitati con badge "in arrivo" (`attiva=false`). Il tab attivo imposta `area_codice`.
- [ ] **Step 2: CodaPI** — coda `fonte='pronto_intervento'`+`area_codice` (riuso `useRichiesteManualiFeed`/`CodaRichiesteManuali`/`PannelloRevisioneRichiesta`), **badge "anomalia reperibilità"**.
- [ ] **Step 3: TabellaPI** — `GET /api/admin/pi/interventi` (interventi `origine='pronto_intervento'` join `interventi_manuali` per `area_codice` + campi P.I. dal `risposte`), colonne N° segnalazione/Comune/Indirizzo/Data/Esecutore/Ora inizio-fine/Assistente TE/**Valore**. Riuso `StoricoTabella`/`StoricoFiltri`.
- [ ] **Step 4: Commit** `feat(pi): modulo a foglie con coda e tabella interventi`.

## Task 8: Contabilità (drawer + route)

**Files:** `components/modules/pronto-intervento/PannelloContabilita.tsx`, `app/api/admin/pi/interventi/[id]/contabilita/route.ts`

- [ ] **Step 1: GET/PUT contabilità** — legge/salva l'insieme di `pi_contabilita_righe` di un intervento; al salvataggio **congela `prezzo_snapshot`/`unita_misura`** dal listino della foglia. Admin-only.
- [ ] **Step 2: PannelloContabilita** — drawer sulla riga: tabella articoli del listino della foglia (codice, descrizione, U.M., prezzo, **quantità editabile**, valore calcolato), **totale** a piè di lista. Riuso visivo di `CodiciAllegato10Client`.
- [ ] **Step 3: Test** unit calcolo totale/snapshot. **Commit** `feat(pi): contabilità articoli su intervento P.I.`.

## Task 9: Genera link + Listino (Impostazioni)

**Files:** `components/modules/pronto-intervento/GeneraLinkPI.tsx`, `app/api/admin/pi/token/route.ts`, `app/impostazioni/listino-pi/{page.tsx,ListinoPIClient.tsx}`, `app/api/admin/pi/articoli/route.ts`

- [ ] **Step 1: GeneraLinkPI** — form (area + X + Y + template) → `POST /api/admin/pi/token` (genera token, snapshot `campi`), mostra/copia URL. Idempotente sull'unique `(area,X,Y)`.
- [ ] **Step 2: ListinoPIClient** — CRUD `pi_articoli` per area (selettore foglia), via `/api/admin/pi/articoli` (admin-only; **non** copiare il POST non autenticato di allegato10).
- [ ] **Step 3: Commit** `feat(pi): generazione link + gestione listino per area`.

## Task 10: Export + rifiniture

**Files:** `app/api/admin/pi/export/route.ts`

- [ ] **Step 1: Export** — Excel/PDF stile registro (ExcelJS/jsPDF): righe P.I. del periodo/foglia con una colonna per articolo e i totali (Valore / Valore+Oneri / SAL).
- [ ] **Step 2: Rifiniture** — empty-states, focus ring, `DESIGN.md` token, `prefers-reduced-motion`. **Commit** `feat(pi): export registro P.I.`.

---

## Self-Review

- [ ] `npx tsc --noEmit` pulito; `npm test` verde; `npm run lint` ok.
- [ ] Nessun colore hardcoded (solo token `DESIGN.md`); primitivi UI riusati.
- [ ] Idempotenza "+" e gate validità/anomalia **sempre** ri-verificati lato server.
- [ ] `pi_token` mai esposto via anon client (solo `supabaseAdmin`); listino non transita dalle route campo.
- [ ] Compensazione approvazione (no transazione) preservata; nessuna riga "approvata senza intervento".
- [ ] Foglie Lazio/Perugia disabilitate (`attiva=false`) ma impianto dati già scope-ato per area.

## Prossimo Passo

Alla chiusura: attivazione foglie Lazio Centro/Est e Perugia (dati: `pi_aree.attiva=true` + listino), e — se richiesto — reperibilità settimanale + compenso €350 (foglio `COMP. SETT.`, oggi fuori scope §14 dello spec).
