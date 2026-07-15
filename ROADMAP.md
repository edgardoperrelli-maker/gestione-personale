# ROADMAP — gestione-personale

> Stato dei task di progetto. I task ATLAS vengono chiusi automaticamente al merge
> della PR collegata; qui teniamo lo storico leggibile e i follow-up tecnici.

## Fatto

- ✅ **Lentezza nel passaggio tra moduli** *(2026-07-15)* — diagnosi completa + fix.
  Cause trovate: (1) `PageTransitionWrapper` nel root layout con `key={pathname}`
  smontava/rimontava l'intero AppShell a ogni navigazione; (2) `AnimatePresence
  mode="wait"` serializzava ~600-900ms di sola animazione; (3) nessun `loading.tsx`
  sotto `/hub` (zero feedback al click); (4) niente router cache (`staleTimes`);
  (5) doppia chiamata di rete auth per navigazione (middleware + layout);
  (6) su Supabase: FK non indicizzate e query dei moduli in seq scan
  (`interventi` 20k seq scan, `interventi_manuali` 44k), 22 policy RLS con
  `auth.*()` rivalutato per riga. Fix: vedi HANDOFF.md e migration
  `20260715090000_perf_indici_moduli_rls_initplan.sql` (già applicata al DB).
- ✅ **Assegnazione AI — collo di bottiglia storico giri** *(2026-07-15)* — la pagina
  (e la gemella `/hub/agente`) faceva `agente_run.select('*').limit(30)`: la colonna
  JSONB `dettaglio` pesa ~27KB/riga (max 80KB), quindi ogni caricamento serializzava
  ~830KB di JSONB. Costo misurato: **93ms medi × 2471 chiamate = 230s totali**, la
  query più pesante del modulo, ri-eseguita dal polling `router.refresh()` ogni 6s.
  Fix: la lista carica solo le colonne riassuntive; `dettaglio` si carica on-demand
  all'espansione della card (nuovo GET `/api/admin/agente/run/[id]`). Verificato con
  EXPLAIN: da **125.9ms a 0.33ms** (~380×), buffer da 273 a 3.
- ✅ Cronoprogramma: squadre + avviso novità + fix drag&drop (PR #85, #88, #89).
- ✅ Widget "invia segnalazione" → hub ATLAS (PR #86) + fix focus/posizione (PR #87).

## Da fare

### Performance (follow-up della diagnosi 2026-07-15, in ordine di impatto)
- [ ] **Riepilogo rapportini**: `/api/mappa/rapportini/riepilogo` fa una doppia
      scansione paginata completa di `rapportino_voci` (~8k righe × 2, la seconda
      col JSONB `risposte`) solo per contare → contatori via RPC/aggregato SQL e
      paginazione vera lato DB. Stessa cosa per `/api/interventi/storico`
      (8 round-trip da 1000 con filtri vuoti).
- [ ] **Performance operatori/economica**: full-scan di `interventi` +
      `rapportino_voci` serializzati nel payload RSC → finestra temporale di
      default e aggregazione lato DB.
- [ ] **`requireAdmin` per ogni route API** (getUser+profiles = 2 round-trip):
      al mount di Assegnazione AI partono ~10 round-trip di sola auth → cache
      per-request o verifica del ruolo dal JWT (`app_metadata`).
- [ ] **Middleware**: `auth.getUser()` fa una chiamata di rete per OGNI
      navigazione. File protetto da AGENTS.md (§11.1): serve istruzione esplicita
      per intervenire (opzione: validazione JWT locale, refresh solo se scaduto).
- [ ] **Bundle /hub/mappa**: `MappaOperatoriClient` (3918 righe) e
      `RiepilogoRapportini` importati staticamente in page.tsx → `next/dynamic`;
      xlsx/exceljs/jszip dinamici negli handler di export.
- [ ] **Bundle misuratori**: jspdf+jspdf-autotable statici (~350KB) → import dinamico.
- [ ] **Bundle performance**: recharts statico in tutte le sottopagine.
- [ ] **hub ↔ cronoprogramma**: `/dashboard` ha un layout con un secondo AppShell:
      attraversare i due segmenti rimonta comunque la shell → valutare route group
      condiviso.
- [ ] **Assegnazione AI**: polling `router.refresh()` ogni 6s senza condizione di
      stop lato client (`AssegnaOdl.tsx` — `fatto` hardcoded a false). Nota: dopo il
      fix dello storico giri ogni refresh è ora ~0.3ms sul DB invece di ~125ms, quindi
      il polling non è più costoso; resta da dargli comunque una condizione di stop.
- [ ] **Hotel calendar**: query `staff` nel bootstrap mai usata dal client;
      realtime che rifà il full refetch a ogni evento.
- [ ] **Ricerca storico interventi**: 6 × `ilike '%q%'` (36ms medi) → indici GIN
      pg_trgm su odl/via/matricola/nominativo/pdr se la tabella cresce.

### Igiene DB (advisor Supabase)
- [ ] 56 avvisi `multiple_permissive_policies`: policy permissive duplicate per
      stessa azione/ruolo (es. assignments ha sia `upd_auth` sia
      `assignments_update_owner`) → consolidare con attenzione alla semantica.
- [ ] 45 indici mai usati (`unused_index`) → verificare e droppare.
- [ ] Tabelle di backup nel DB (`bak_*`, `snapshot_*`, `_backup_*`) senza PK →
      esportare e rimuovere.
- [ ] `GET /api/admin/rapportino-template` senza check auth (segnalazione
      emersa durante l'analisi bundle mappa) → aggiungere `requireAdmin`.

### Funzionale
- [ ] Verifica end-to-end squadre cronoprogramma sul preview (aggancio, capo ⭐,
      scioglimento) — residuo della sessione 2026-07-13.
- [ ] Mini-card di `AnnuncioSquadre.tsx` con tinte territorio hardcoded (dark) →
      passarle a `var(--terr-…)`.
