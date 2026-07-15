# Handoff — Perf: lentezza nel passaggio tra moduli (2026-07-15)

## Goal
Task ATLAS `b48c3630-5e45-4233-ba3c-964c2c4cd53c`: capire perché il passaggio da un
modulo all'altro è lento e, se opportuno, indicizzare Supabase. Fatta la diagnosi
completa (11 agenti su tutti i moduli + analisi DB con pg_stat_statements e advisor)
e applicati i fix a maggior impatto, lato DB e lato frontend.

## Diagnosi (cause in ordine di impatto)
1. **Remount dell'intera shell a ogni navigazione**: `app/layout.tsx` avvolgeva TUTTO
   in `PageTransitionWrapper` con `key={pathname}` → a ogni cambio modulo React
   smontava/rimontava AppShell, Sidebar, TopBar, NovitaCenter, RichiesteManualiProvider:
   3 fetch `/api/annunci`, 2 fetch admin, 2 canali realtime distrutti/ricreati, flicker.
   In più il wrapper era duplicato (root + hub layout) → doppia animazione annidata.
2. **`AnimatePresence mode="wait"` + spring 300/30**: exit (~300-450ms) DOPO l'arrivo
   dei dati, POI enter → ~600-900ms di sola animazione per ogni cambio modulo.
3. **Nessun `loading.tsx` sotto `/hub`**: layout e pagine sono `force-dynamic`, quindi
   al click niente feedback finché il server non finiva middleware+auth+query.
4. **Niente router cache**: `staleTimes` non configurato (default 0 per route dinamiche)
   → ogni ritorno su un modulo già visitato ripagava l'intero round-trip RSC.
5. **Doppia auth di rete per navigazione**: middleware `getUser()` (rete) + layout
   `getUser()` (rete di nuovo) + query `profiles` — 278k chiamate a `auth.users` nel DB.
6. **DB**: `interventi` 20.038 seq scan (123M righe lette), `interventi_manuali` 44.018
   seq scan (44k arrivano dal polling 60s di RichiesteManualiProvider + PI), DELETE di
   `interventi` a 32ms l'uno per FK non indicizzate sulle tabelle figlie, 22 policy RLS
   con `auth.uid()/auth.role()` rivalutato PER RIGA (advisor `auth_rls_initplan`),
   31 FK senza indice.

## Cosa è cambiato (questa PR)
### Frontend
- `app/layout.tsx`: **rimosso** PageTransitionWrapper dal root → la shell resta montata,
  transizione solo sul contenuto (nei layout hub/dashboard, dove già c'era).
- `components/layout/PageTransitionWrapper.tsx`: enter-only (niente AnimatePresence
  `mode="wait"`), tween 0.16s easeOut al posto dello spring.
- `lib/animations.ts`: `pageTransition` senza exit, nuovo `pageTransitionTween`
  (rimosso `pageTransitionSpring`), stagger ridotto (0.03, delay 0).
- `app/hub/loading.tsx` + `app/dashboard/loading.tsx`: **nuovi** skeleton → feedback
  immediato al click in sidebar.
- `next.config.mjs`: `experimental.staleTimes { dynamic: 30, static: 180 }` → i moduli
  rivisitati entro 30s escono dalla router cache senza round-trip.
- `app/hub/layout.tsx` + `app/dashboard/layout.tsx`: `getUser()` → `getSession()`
  (legge il JWT dal cookie, zero rete). Sicuro perché il middleware — che NON è stato
  toccato (vietato da AGENTS.md) — fa già `getUser()` convalidato su ogni richiesta
  matchata e redirige se non valida.
- `components/layout/CampanelloRichieste.tsx`: `<a href>` → `<Link>` (prima faceva un
  full page reload).

### Database (migration `supabase/migrations/20260715090000_perf_indici_moduli_rls_initplan.sql`)
**GIÀ APPLICATA** al progetto Supabase `aceztqfebringeaebvce` via MCP `apply_migration`.
- 12 indici mirati: `interventi(committente, assegnato_at)` (KPI dashboard: da seq scan
  a Index Scan 0.07ms, verificato con EXPLAIN ANALYZE), `interventi_manuali(fonte,
  stato, area_codice)` (PI + polling admin), FK dei percorsi DELETE
  (`interventi_manuali.intervento_id`, `misuratori_riconsegna.intervento_id`,
  `interventi.riconciliazione_rif_id`), `rapportini(data, staff_id)`,
  `acea_assegnazioni_log(data_assegnazione, creato_il desc)`,
  `pi_contabilita_righe(intervento_id)`, `misuratori_rimossi` (sort + FK),
  `assignments(staff_id)` e `(territory_id)`.
- 22 policy RLS riscritte con `(select auth.*())` (fix advisor `auth_rls_initplan`,
  stessa semantica): annunci_visti, assignments, audit_log, calendar_days,
  hotel_bookings, profiles, sopralluoghi, sopralluoghi_pdf_generati.

## Verifiche fatte
- `npx tsc --noEmit` ✓ · `npx eslint` sui file toccati ✓ · `npx vitest run` 234 file /
  1708 test ✓.
- EXPLAIN ANALYZE della query KPI dashboard: Index Scan sul nuovo indice, 0.07ms.
- Indici e policy verificati su `pg_indexes` / `pg_policies` dopo l'apply.
- `next build` locale NON eseguibile in sandbox (manca `supabaseKey`, come da sessioni
  precedenti): fa fede la build Vercel sulla PR.

## Cosa NON è stato toccato (e perché)
- `middleware.ts`: vietato da AGENTS.md §11.1 — resta la chiamata di rete `getUser()`
  per navigazione (documentata in ROADMAP come follow-up con istruzione esplicita).
- Le query interne dei moduli (doppia scansione rapportino_voci del riepilogo,
  full-scan di performance/economica, requireAdmin ripetuto nelle API): refactor più
  invasivi, elencati in ROADMAP.md sezione "Performance" in ordine di impatto.
- `multiple_permissive_policies` (56 avvisi advisor): consolidare policy duplicate
  cambia superficie di sicurezza → follow-up dedicato.

## Rischi / cose da tenere d'occhio
- `staleTimes.dynamic: 30`: entro 30s un ritorno sul modulo mostra lo snapshot cache
  (i dati client-side si aggiornano comunque via fetch/realtime). Se qualcuno lamenta
  dati "vecchi di 30 secondi" al rientro, abbassare o rimuovere.
- `getSession()` nei layout si affida alla convalida del middleware: se un giorno il
  matcher del middleware smette di coprire `/hub` o `/dashboard`, ripristinare
  `getUser()` nei layout.
- Le due policy UPDATE/DELETE permissive di assignments (`upd_auth` + owner) restano
  entrambe attive come prima: nessun cambio di comportamento.

## Key files & commands
- Migration: `supabase/migrations/20260715090000_perf_indici_moduli_rls_initplan.sql`.
- FE: `app/layout.tsx`, `components/layout/PageTransitionWrapper.tsx`,
  `lib/animations.ts`, `app/hub/loading.tsx`, `app/dashboard/loading.tsx`,
  `next.config.mjs`, `app/hub/layout.tsx`, `app/dashboard/layout.tsx`,
  `components/layout/CampanelloRichieste.tsx`.
- Comandi: `npx tsc --noEmit` · `npx vitest run` · `npx eslint <file>`.
- DB (Supabase MCP, project `aceztqfebringeaebvce`): advisor con `get_advisors`
  (performance), query lente in `extensions.pg_stat_statements`, seq scan in
  `pg_stat_user_tables`.

## Next step
1. Merge PR → ATLAS chiude il task automaticamente (riga `ATLAS-Item:` nel body).
2. Provare sul preview Vercel il cambio modulo (feedback immediato + transizione
   breve) e il rientro su un modulo entro 30s (istantaneo da cache).
3. Attaccare i follow-up in ROADMAP.md → sezione Performance, partendo dalla doppia
   scansione di `rapportino_voci` nel riepilogo rapportini.
